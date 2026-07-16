import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUserOwner, validateCronSecret } from "../_shared/auth-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function diffDias(inicio: string, fim: string) {
  return Math.floor(
    (new Date(`${fim}T00:00:00`).getTime() -
      new Date(`${inicio}T00:00:00`).getTime()) / 86400000,
  );
}

function aliquotaIR(dias: number) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

function round(v: number, c = 8) {
  return Number(v.toFixed(c));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = await req.json();

    const cofrinho_id = body.cofrinho_id;
    const data_inicio = body.data_inicio;
    const data_fim = body.data_fim ?? new Date().toISOString().slice(0, 10);

    if (!cofrinho_id) throw new Error("cofrinho_id é obrigatório.");

    // AuthZ: cron secret (server-side jobs) OR authenticated owner of the cofrinho.
    const isCron = await validateCronSecret(supabase, req);
    if (!isCron) {
      const { data: cof, error: cofErr } = await supabase
        .from("cofrinhos")
        .select("usuario_id")
        .eq("id", cofrinho_id)
        .single();
      if (cofErr || !cof) {
        return new Response(
          JSON.stringify({ success: false, error: "cofrinho_not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const authCheck = await validateUserOwner(supabase, req, cof.usuario_id);
      if (!authCheck.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select("id, data_aporte, saldo_restante, percentual_cdi")
      .eq("cofrinho_id", cofrinho_id)
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true });

    if (aportesError) throw aportesError;

    await supabase
      .from("cofrinho_rendimento_diario")
      .delete()
      .eq("cofrinho_id", cofrinho_id)
      .gte("data", data_inicio ?? "1900-01-01")
      .lte("data", data_fim);

    let processados = 0;

    for (const aporte of aportes ?? []) {
      const inicio = data_inicio && data_inicio > aporte.data_aporte
        ? data_inicio
        : aporte.data_aporte;

      const { data: taxas, error: taxasError } = await supabase
        .from("taxa_referencia")
        .select("data, cdi_diario")
        .gte("data", inicio)
        .lte("data", data_fim)
        .order("data", { ascending: true });

      if (taxasError) throw taxasError;

      let rendimentoBrutoAcumulado = 0;
      let rendimentoLiquidoAcumulado = 0;

      for (const taxa of taxas ?? []) {
        const dias = diffDias(aporte.data_aporte, taxa.data);
        const saldo = Number(aporte.saldo_restante);
        const percentual = Number(aporte.percentual_cdi ?? 100);
        const taxaDiaria = Number(taxa.cdi_diario);

        const bruto = round(saldo * taxaDiaria * (percentual / 100));
        const ir = round(bruto * aliquotaIR(dias));
        const liquido = round(bruto - ir);

        rendimentoBrutoAcumulado += bruto;
        rendimentoLiquidoAcumulado += liquido;

        await supabase.from("cofrinho_rendimento_diario").upsert(
          {
            cofrinho_id,
            aporte_id: aporte.id,
            data: taxa.data,
            saldo_principal: saldo,
            percentual_cdi: percentual,
            taxa_cdi: taxaDiaria,
            rendimento_bruto: bruto,
            imposto_renda: ir,
            iof: 0,
            rendimento_liquido: liquido,
            saldo_total: round(saldo + rendimentoLiquidoAcumulado, 2),
          },
          { onConflict: "aporte_id,data" },
        );

        processados++;
      }

      await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: round(rendimentoBrutoAcumulado, 2),
          rendimento_liquido: round(rendimentoLiquidoAcumulado, 2),
          ultimo_calculo: data_fim,
        })
        .eq("id", aporte.id);
    }

    await supabase.rpc("fn_atualizar_saldos_cofrinho", {
      p_cofrinho_id: cofrinho_id,
    });

    return new Response(
      JSON.stringify({
        success: true,
        cofrinho_id,
        data_inicio: data_inicio ?? "desde o primeiro aporte",
        data_fim,
        registros_recalculados: processados,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
