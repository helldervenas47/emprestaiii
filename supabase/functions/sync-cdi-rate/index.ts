import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SGS_PRIMARY = 4389; // CDI anualizada base 252
const SGS_FALLBACK = 1178; // Selic anualizada base 252

interface BcbRow { data: string; valor: string }

function parseBrDate(s: string): string {
  // "13/05/2026" -> "2026-05-13"
  const [d, m, y] = s.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

async function fetchSeries(code: number): Promise<{ rate: number; date: string } | null> {
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;
    const json = (await res.json()) as BcbRow[];
    if (!Array.isArray(json) || json.length === 0) return null;
    const last = json[json.length - 1];
    const rate = Number(String(last.valor).replace(",", "."));
    if (!isFinite(rate) || rate <= 0) return null;
    return { rate, date: parseBrDate(last.data) };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let result = await fetchSeries(SGS_PRIMARY);
    let source = `BCB SGS ${SGS_PRIMARY}`;
    if (!result) {
      result = await fetchSeries(SGS_FALLBACK);
      source = `BCB SGS ${SGS_FALLBACK} (fallback)`;
    }
    if (!result) {
      return new Response(
        JSON.stringify({ ok: false, error: "BCB API unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const newRate = Number(result.rate.toFixed(4));
    const today = new Date().toISOString().slice(0, 10);

    // upsert do cache
    const { error: upErr } = await supabase
      .from("market_rates")
      .upsert({
        indicator: "cdi",
        annual_rate: newRate,
        source,
        reference_date: result.date,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "indicator" });
    if (upErr) throw upErr;

    // propaga para cofrinhos com auto_rate=true se a taxa mudou >= 0.01 p.p.
    const { data: pbs, error: pbErr } = await supabase
      .from("piggy_banks")
      .select("id, user_id, annual_rate")
      .eq("auto_rate", true);
    if (pbErr) throw pbErr;

    let updated = 0;
    for (const pb of pbs || []) {
      const current = Number(pb.annual_rate);
      if (Math.abs(current - newRate) < 0.01) continue;

      // Insere histórico (ignora conflito p/ idempotência por dia)
      await supabase.from("piggy_bank_rate_history").insert({
        piggy_bank_id: pb.id,
        user_id: pb.user_id,
        annual_rate: newRate,
        effective_from: today,
      });

      await supabase
        .from("piggy_banks")
        .update({ annual_rate: newRate })
        .eq("id", pb.id);

      updated++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        indicator: "cdi",
        annual_rate: newRate,
        source,
        reference_date: result.date,
        piggy_banks_updated: updated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-cdi-rate error", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
