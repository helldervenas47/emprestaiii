import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TELEGRAM_GATEWAY = "https://api.telegram.org";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// Brasília time HH:MM (UTC-3, no DST currently)
function nowBrasiliaHM(): { h: number; m: number; key: string } {
  const utc = new Date();
  const brasilia = new Date(utc.getTime() - 3 * 60 * 60 * 1000);
  const h = brasilia.getUTCHours();
  const m = brasilia.getUTCMinutes();
  return { h, m, key: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

function timeWithinWindow(target: string | null | undefined, nowH: number, nowM: number): boolean {
  if (!target) return false;
  const [th, tm] = target.split(":").map(Number);
  if (Number.isNaN(th) || Number.isNaN(tm)) return false;
  const diff = (nowH * 60 + nowM) - (th * 60 + tm);
  return diff >= 0 && diff < 5; // within 5-minute window after target
}

import { sendReportsAsImage, getReportsLinkForUser } from "../_shared/reports-bot.ts";

function safeTruncate(text: string, max = 3800) {
  return text.length > max ? text.slice(0, max) + "\n\n…(truncado)" : text;
}

async function generateInsight(supabase: any, ownerId: string, force = false) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(`${supabaseUrl}/functions/v1/generate-personal-insights`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: ownerId, force }),
  });
  if (!r.ok) {
    console.error("[generateInsight] failed", r.status, await r.text());
    return null;
  }
  return await r.json();
}

async function processUser(
  supabase: any,
  pref: any,
  mode: "scheduled" | "trigger",
  triggerReason?: string,
  brandName: string = "EmprestAI",
) {
  const ownerId = pref.user_id;
  const today = todayISO();
  const lastSent = (pref.last_sent || {}) as Record<string, string>;

  // Check telegram link (reports bot)
  const tgLink = await getReportsLinkForUser(supabase, ownerId);
  if (!tgLink?.chat_id) return { skipped: "no-telegram-link" };


  // Generate insight (forced for triggers, cached for scheduled)
  const insight = await generateInsight(supabase, ownerId, mode === "trigger");
  if (!insight || insight.empty) return { skipped: "no-insight" };

  const headerEmoji = mode === "trigger" ? "🚨" : "🤖";
  const headerText = mode === "trigger"
    ? `${headerEmoji} *${brandName} — Alerta de gastos pessoais*${triggerReason ? `\n_${triggerReason}_` : ""}`
    : `${headerEmoji} *${brandName} — Relatório inteligente — Despesas Pessoais*\n_${currentMonth()}_`;

  const message = `${headerText}\n\n${insight.content}\n\n—\n_Gerado por IA com base nos seus gastos do mês._`;

  const truncated = safeTruncate(message);
  const sendRes = await sendReportsAsImage(
    supabase,
    ownerId,
    Number(tgLink.chat_id),
    truncated.split("\n"),
    { name: brandName },
    { fallbackText: truncated, reportKey: "personal_insights" },
  );
  if (!sendRes.sent) return { skipped: sendRes.reason ?? "send_failed" };

  // Update last_sent map
  const slotKey = mode === "scheduled" ? `scheduled-${today}` : `trigger-${today}-${Date.now()}`;
  const newLastSent = { ...lastSent, [slotKey]: new Date().toISOString() };
  await supabase
    .from("personal_insights_telegram_prefs")
    .update({ last_sent: newLastSent })
    .eq("user_id", ownerId);

  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = body.mode || "scheduled"; // "scheduled" | "trigger"
    const reason = body.reason as string | undefined;
    const targetUserId = body.user_id as string | undefined;

    // Fetch brand name (singleton)
    let brandName = "EmprestAI";
    try {
      const { data: bRow } = await supabase.from("app_branding").select("brand_name").limit(1).maybeSingle();
      if ((bRow as any)?.brand_name) brandName = (bRow as any).brand_name;
    } catch { /* ignore */ }

    // ---------- TRIGGER MODE: send immediately to one user (called from notify-budget-overrun) ----------
    if (mode === "trigger") {
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id required for trigger mode" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: pref } = await supabase
        .from("personal_insights_telegram_prefs")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (!pref || !pref.enabled || !pref.alert_on_exceed) {
        return new Response(JSON.stringify({ skipped: "trigger-disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await processUser(supabase, pref, "trigger", reason, brandName);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- SCHEDULED MODE: cron every 5 min, check all enabled users ----------
    const { h, m } = nowBrasiliaHM();
    const today = todayISO();

    const { data: prefs } = await supabase
      .from("personal_insights_telegram_prefs")
      .select("*")
      .eq("enabled", true);

    const results: any[] = [];
    for (const pref of (prefs || []) as any[]) {
      const lastSent = (pref.last_sent || {}) as Record<string, string>;
      // Determine which slot is due now (1, 2 or 3) and not yet sent today
      const slots = [
        { i: 1, t: pref.send_time_1 },
        { i: 2, t: pref.send_time_2 },
        { i: 3, t: pref.send_time_3 },
      ];
      const dueSlot = slots.find((s) => timeWithinWindow(s.t, h, m));
      if (!dueSlot) continue;

      const slotKey = `slot-${dueSlot.i}-${today}`;
      if (lastSent[slotKey]) continue; // already sent today

      const r = await processUser(supabase, pref, "scheduled", undefined, brandName);
      // Mark slot as sent regardless of skip reason (avoid loops)
      const newLastSent = { ...lastSent, [slotKey]: new Date().toISOString() };
      await supabase
        .from("personal_insights_telegram_prefs")
        .update({ last_sent: newLastSent })
        .eq("user_id", pref.user_id);

      results.push({ user_id: pref.user_id, slot: dueSlot.i, ...r });
    }

    return new Response(JSON.stringify({ ok: true, results, time: `${h}:${m}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[send-personal-insights-telegram] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
