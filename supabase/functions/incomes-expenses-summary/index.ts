import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendReportsMessage } from "../_shared/reports-bot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtDateBR(iso: string) {
  return iso.split("-").reverse().join("/");
}
function nowInTZ(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  return { date: today, tomorrow, hhmm: `${get("hour")}:${get("minute")}` };
}

interface Row { origin: string; description: string; amount: number; }

async function buildAndSend(
  admin: any,
  userId: string,
  date: string,
  brandName: string,
  titleLabel: string,
): Promise<boolean> {
  const { data: link } = await admin.from("telegram_reports_links")
    .select("chat_id").eq("user_id", userId).maybeSingle();
  if (!link) return false;
  const chatId = Number((link as any).chat_id);

  // Incomes a receber (pendentes/atrasadas) com vencimento na data
  const { data: incomes } = await admin.from("incomes")
    .select("description, amount, source, category, received_date, status")
    .eq("user_id", userId)
    .eq("received_date", date)
    .neq("status", "received");

  const incomeRows: Row[] = (incomes ?? []).map((i: any) => ({
    origin: i.source || i.category || "Receita",
    description: i.description,
    amount: Number(i.amount || 0),
  }));

  // Expenses a pagar (todas — empresa + pessoal) com vencimento na data
  const { data: expenses } = await admin.from("expenses")
    .select("description, amount, scope, category, installments, parent_expense_id")
    .eq("user_id", userId)
    .eq("due_date", date)
    .eq("paid", false);

  const expenseRows: { origin: "Empresa" | "Pessoal"; description: string; amount: number }[] =
    (expenses ?? []).map((e: any) => {
      const total = Number(e.amount || 0);
      const installments = Number(e.installments || 0);
      const isParentInstallment = !e.parent_expense_id && installments > 1;
      const monthly = isParentInstallment ? total / installments : total;
      return {
        origin: e.scope === "personal" ? "Pessoal" : "Empresa",
        description: e.description,
        amount: monthly,
      };
    });

  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const balance = totalIncome - totalExpense;
  const negative = balance < 0;

  const lines: string[] = [];
  lines.push(`📒 *${brandName} — ${titleLabel}*`);
  lines.push(`🗓️ ${fmtDateBR(date)}`);
  lines.push("");
  lines.push(`🟢 *A receber:* ${fmtBRL(totalIncome)}  _(${incomeRows.length})_`);
  lines.push(`🔴 *A pagar:* ${fmtBRL(totalExpense)}  _(${expenseRows.length})_`);
  lines.push(`${negative ? "⚠️" : "💰"} *Saldo previsto:* ${fmtBRL(balance)}`);
  if (negative) lines.push(`_Atenção: saldo negativo previsto para o dia._`);

  if (incomeRows.length > 0) {
    lines.push("");
    lines.push(`*🟢 Receitas a receber:*`);
    const sorted = [...incomeRows].sort((a, b) => b.amount - a.amount);
    for (const r of sorted) {
      lines.push(`• [${r.origin}] ${r.description} — *${fmtBRL(r.amount)}*`);
    }
  }

  if (expenseRows.length > 0) {
    const business = expenseRows.filter(r => r.origin === "Empresa");
    const personal = expenseRows.filter(r => r.origin === "Pessoal");
    if (business.length > 0) {
      const sub = business.reduce((s, r) => s + r.amount, 0);
      lines.push("");
      lines.push(`*🏢 Despesas Empresa:* ${fmtBRL(sub)}  _(${business.length})_`);
      for (const r of [...business].sort((a, b) => b.amount - a.amount)) {
        lines.push(`• ${r.description} — *${fmtBRL(r.amount)}*`);
      }
    }
    if (personal.length > 0) {
      const sub = personal.reduce((s, r) => s + r.amount, 0);
      lines.push("");
      lines.push(`*👤 Despesas Pessoais:* ${fmtBRL(sub)}  _(${personal.length})_`);
      for (const r of [...personal].sort((a, b) => b.amount - a.amount)) {
        lines.push(`• ${r.description} — *${fmtBRL(r.amount)}*`);
      }
    }
  }

  if (incomeRows.length === 0 && expenseRows.length === 0) {
    lines.push("");
    lines.push("_Nenhum lançamento previsto para este dia._");
  }

  const sendRes = await sendReportsMessage(admin, userId, chatId, lines.join("\n"));
  return sendRes.sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let brandName = "EmprestAI";
  try {
    const { data: bRow } = await admin.from("app_branding").select("brand_name").limit(1).maybeSingle();
    if ((bRow as any)?.brand_name) brandName = (bRow as any).brand_name;
  } catch (_) { /* ignore */ }

  const { date: today, tomorrow, hhmm } = nowInTZ();
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  // Manual on-demand send
  if (token && req.method === "POST") {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (!userErr && user) {
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      let manualTarget = (body?.date as string) || tomorrow;
      let manualLabel = "Receitas e Despesas — Amanhã";
      if (!body?.date) {
        const { data: pref } = await admin
          .from("incomes_expenses_telegram_prefs")
          .select("send_target")
          .eq("user_id", user.id)
          .maybeSingle();
        if ((pref as any)?.send_target === "today") {
          manualTarget = today;
          manualLabel = "Receitas e Despesas — Hoje";
        }
      } else if (body.date === today) {
        manualLabel = "Receitas e Despesas — Hoje";
      }
      const ok = await buildAndSend(admin, user.id, manualTarget, brandName, manualLabel);
      return new Response(JSON.stringify({ ok: true, sent: ok ? 1 : 0, date: manualTarget }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Cron mode
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  const { data: prefs, error } = await admin
    .from("incomes_expenses_telegram_prefs")
    .select("user_id, enabled, send_time_1, send_time_2, send_time_3, send_target, last_sent")
    .eq("enabled", true);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let sent = 0;
  for (const pref of (prefs ?? [])) {
    try {
      const slots: { key: string; time: string | null }[] = [
        { key: "send_time_1", time: (pref as any).send_time_1 },
        { key: "send_time_2", time: (pref as any).send_time_2 },
        { key: "send_time_3", time: (pref as any).send_time_3 },
      ];
      const lastSent = ((pref as any).last_sent ?? {}) as Record<string, string>;
      let firedSlot: string | null = null;
      for (const slot of slots) {
        if (!slot.time) continue;
        const [ph, pm] = slot.time.split(":").map(Number);
        const target = ph * 60 + pm;
        if (nowMin < target || nowMin >= target + 5) continue;
        if (lastSent[slot.key] === today) continue;
        firedSlot = slot.key;
        break;
      }
      if (!firedSlot) continue;

      const isToday = (pref as any).send_target === "today";
      const targetDate = isToday ? today : tomorrow;
      const label = isToday ? "Receitas e Despesas — Hoje" : "Receitas e Despesas — Amanhã";
      const ok = await buildAndSend(admin, (pref as any).user_id, targetDate, brandName, label);
      if (ok) {
        const newLast = { ...lastSent, [firedSlot]: today };
        await admin.from("incomes_expenses_telegram_prefs")
          .update({ last_sent: newLast })
          .eq("user_id", (pref as any).user_id);
        sent++;
      }
    } catch (e) {
      console.error("incomes-expenses-summary error", (pref as any).user_id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
