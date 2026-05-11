import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function nowInTZ(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  // Tomorrow (UTC-safe arithmetic on the YYYY-MM-DD string)
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const tomorrow = d.toISOString().slice(0, 10);
  return {
    date: today,
    tomorrow,
    hhmm: `${get("hour")}:${get("minute")}`,
  };
}

function fmtDateBR(iso: string) {
  return iso.split("-").reverse().join("/");
}

function calcLoanTotal(amount: number, rate: number, installments: number) {
  return amount * (1 + (rate / 100) * installments);
}

import { sendReportsMessage } from "../_shared/reports-bot.ts";

type IncomeGroup = "Empréstimos" | "Vendas" | "Veículos";
interface Row { origin: string; description: string; amount: number; group?: IncomeGroup; }

async function buildAndSend(
  admin: any,
  userId: string,
  date: string,
  brandName: string,
  titleLabel = "Planejamento do Dia",
): Promise<boolean> {
  // Resolve report bot chat
  const { data: link } = await admin.from("telegram_reports_links")
    .select("chat_id").eq("user_id", userId).maybeSingle();
  if (!link) return false;

  const chatId = Number((link as any).chat_id);
  const day = Number(date.slice(8, 10));

  // Loans + schedules
  const { data: loans } = await admin.from("loans")
    .select("id, borrower_name, installments, paid_installments, amount, interest_rate, custom_installment_value, due_date, status")
    .eq("user_id", userId);

  const loanIds = (loans ?? []).map((l: any) => l.id);
  let schedules: any[] = [];
  if (loanIds.length > 0) {
    const { data } = await admin.from("loan_installments")
      .select("loan_id, installment_number, due_date, amount")
      .in("loan_id", loanIds)
      .eq("due_date", date);
    schedules = data ?? [];
  }

  const incomeRows: Row[] = [];
  for (const loan of (loans ?? [])) {
    if ((loan as any).status === "paid") continue;
    const sched = schedules.filter(s => s.loan_id === (loan as any).id);
    if (sched.length > 0) {
      for (const s of sched) {
        if (s.installment_number <= (loan as any).paid_installments) continue;
        incomeRows.push({
          origin: "Empréstimo",
          description: `${(loan as any).borrower_name} — ${s.installment_number}/${(loan as any).installments}`,
          amount: Number(s.amount || 0),
          group: "Empréstimos",
        });
      }
    } else if ((loan as any).due_date === date && (loan as any).paid_installments < (loan as any).installments) {
      const total = calcLoanTotal(Number((loan as any).amount), Number((loan as any).interest_rate), (loan as any).installments);
      const perInst = total / (loan as any).installments;
      const amt = (loan as any).custom_installment_value != null ? Number((loan as any).custom_installment_value) : perInst;
      incomeRows.push({
        origin: "Empréstimo",
        description: `${(loan as any).borrower_name} — ${(loan as any).paid_installments + 1}/${(loan as any).installments}`,
        amount: amt,
        group: "Empréstimos",
      });
    }
  }

  // Sales: parcelas com vencimento no dia
  const { data: sales } = await admin.from("sales")
    .select("customer_name, description, business_type, installments, paid_installments, installment_value, installment_amounts, installment_dates, total")
    .eq("user_id", userId);

  for (const sale of (sales ?? [])) {
    const dates = ((sale as any).installment_dates ?? []) as string[];
    const amounts = ((sale as any).installment_amounts ?? []) as number[];
    const total = (sale as any).installments || 1;
    const fallback = (sale as any).installment_value != null
      ? Number((sale as any).installment_value)
      : Number((sale as any).total) / Math.max(1, total);
    for (let i = 0; i < total; i++) {
      const dueDate = dates[i];
      if (!dueDate || dueDate !== date) continue;
      const num = i + 1;
      if (num <= (sale as any).paid_installments) continue;
      const amt = amounts[i] != null ? Number(amounts[i]) : fallback;
      const isVehicle = (sale as any).business_type === "aluguel_veiculo";
      incomeRows.push({
        origin: isVehicle ? "Aluguel" : "Venda",
        description: `${(sale as any).customer_name || (sale as any).description} — ${num}/${total}`,
        amount: amt,
        group: isVehicle ? "Veículos" : "Vendas",
      });
    }
  }

  // Expenses (business + personal) due today, not paid
  const { data: expenses } = await admin.from("expenses")
    .select("description, amount, category, scope, paid, installments, parent_expense_id, type")
    .eq("user_id", userId)
    .eq("due_date", date)
    .eq("paid", false);

  const expenseRows: Row[] = (expenses ?? []).map((e: any) => {
    const total = Number(e.amount || 0);
    const installments = Number(e.installments || 0);
    // Para a despesa-mãe (sem parent_expense_id) com várias parcelas,
    // `amount` representa o valor total. O que vence no mês é uma parcela.
    const isParentInstallment = !e.parent_expense_id && installments > 1;
    const monthly = isParentInstallment ? total / installments : total;
    return {
      origin: e.scope === "personal" ? "Pessoal" : "Empresa",
      description: e.description,
      amount: monthly,
    };
  });

  // Credit card invoices due today
  const { data: cards } = await admin.from("credit_cards")
    .select("id, nickname, bank, last_four, closing_day, due_day, active")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("due_day", day);

  if ((cards ?? []).length > 0) {
    // Buscar todas as despesas marcadas como crédito do owner (sem filtro de data, pois precisamos do ciclo completo)
    const { data: ccExpenses } = await admin.from("expenses")
      .select("id, description, amount, due_date, paid, type, installments, parent_expense_id, notes")
      .eq("user_id", userId);

    const { data: openings } = await admin.from("credit_card_invoice_openings")
      .select("card_id, cycle_key, opening_amount, notes")
      .eq("user_id", userId);

    const isCredito = (notes: string | null | undefined) => /\[\s*cr[eé]dito\s*\]/i.test(notes ?? "");

    const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const buildCycleForDue = (dueDateRef: Date, closingDay: number, dueDay: number) => {
      // dueDateRef = data de vencimento alvo. Closing do ciclo é o anterior (no mês anterior se due > closing, senão mesmo mês).
      const dy = dueDateRef.getFullYear();
      const dm = dueDateRef.getMonth();
      // closingNext: fechamento que origina esta fatura
      const closingMonth = dueDay > closingDay ? dm - 1 : dm;
      const closingNext = new Date(dy, closingMonth, Math.min(closingDay, lastDayOfMonth(dy, closingMonth)));
      const prevMonth = closingNext.getMonth() - 1;
      const closingPrev = new Date(closingNext.getFullYear(), prevMonth, Math.min(closingDay, lastDayOfMonth(closingNext.getFullYear(), prevMonth)));
      const cycleKey = `${closingNext.getFullYear()}-${String(closingNext.getMonth() + 1).padStart(2, "0")}`;
      return { from: closingPrev, to: closingNext, cycleKey };
    };

    for (const c of cards) {
      const card = c as any;
      const cycle = buildCycleForDue(new Date(date + "T00:00:00"), Number(card.closing_day), Number(card.due_day));
      const cardTag = (card.nickname || card.last_four || "").toLowerCase();

      const items = (ccExpenses ?? []).filter((e: any) => {
        if (!isCredito(e.notes)) return false;
        if (cardTag) {
          const n = String(e.notes ?? "").toLowerCase();
          if (!n.includes(cardTag) && /cart[aã]o[:\s]/i.test(n)) return false;
        }
        const due = new Date(String(e.due_date) + "T00:00:00");
        return due >= cycle.from && due <= cycle.to;
      });

      const installmentValue = (e: any) => {
        const inst = Number(e.installments || 0);
        const isRec = e.type === "recorrente" && inst > 1;
        return isRec ? Number(e.amount || 0) / inst : Number(e.amount || 0);
      };
      const itemsTotal = items.reduce((s: number, e: any) => s + installmentValue(e), 0);

      const opening = (openings ?? []).find((o: any) => o.card_id === card.id && o.cycle_key === cycle.cycleKey) as any;
      const openingAmount = Number(opening?.opening_amount ?? 0);
      const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");
      const total = itemsTotal + openingAmount;

      const cycleHasPending = items.some((e: any) => !e.paid) || openingAmount > 0;
      const cycleEverHadValue = items.length > 0 || openingAmount > 0 || openingPaidFlag;
      const paid = cycleEverHadValue && !cycleHasPending;
      if (paid) continue;

      const overrideMatch = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(opening?.notes ?? "");
      const itemsPaidTotal = items.filter((e: any) => e.paid).reduce((s: number, e: any) => s + installmentValue(e), 0);
      const paidTotal = overrideMatch ? Number(overrideMatch[1]) : itemsPaidTotal;
      const remaining = Math.max(0, total - paidTotal);

      expenseRows.push({
        origin: "Cartão",
        description: `Fatura ${card.nickname || card.bank}${card.last_four ? " •••• " + card.last_four : ""}`,
        amount: remaining,
      });
    }
  }

  const totalIncome = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const balance = totalIncome - totalExpense;
  const negative = balance < 0;

  const lines: string[] = [];
  lines.push(`📅 *${brandName} — ${titleLabel}*`);
  lines.push(`🗓️ ${fmtDateBR(date)}`);
  lines.push("");
  lines.push(`🟢 *Receitas:* ${fmtBRL(totalIncome)}  _(${incomeRows.length})_`);
  lines.push(`🔴 *Despesas:* ${fmtBRL(totalExpense)}  _(${expenseRows.length})_`);
  lines.push(`${negative ? "⚠️" : "💰"} *Saldo previsto:* ${fmtBRL(balance)}`);
  if (negative) lines.push(`_Atenção: saldo negativo previsto para o dia._`);

  if (incomeRows.length > 0) {
    lines.push("");
    lines.push("*🟢 Receitas:*");
    const sorted = [...incomeRows].sort((a, b) => b.amount - a.amount);
    for (const r of sorted) {
      lines.push(`• [${r.origin}] ${r.description} — *${fmtBRL(r.amount)}*`);
    }
  }

  if (expenseRows.length > 0) {
    lines.push("");
    lines.push("*🔴 Despesas:*");
    const sorted = [...expenseRows].sort((a, b) => b.amount - a.amount);
    for (const r of sorted) {
      lines.push(`• [${r.origin}] ${r.description} — *${r.amount > 0 ? fmtBRL(r.amount) : "—"}*`);
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

  const url = new URL(req.url);
  const queryUserId = url.searchParams.get("user_id");
  const { date: today, tomorrow, hhmm } = nowInTZ();

  // Manual/on-demand mode (called from app with auth)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token && req.method === "POST") {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (!userErr && user) {
      let body: any = {};
      try { body = await req.json(); } catch (_) {}
      // Manual send: respect user pref, default to tomorrow
      let manualTarget = (body?.date as string) || tomorrow;
      let manualLabel = "Planejamento de Amanhã";
      if (!body?.date) {
        const { data: pref } = await admin
          .from("daily_planning_telegram_prefs")
          .select("send_target")
          .eq("user_id", user.id)
          .maybeSingle();
        if ((pref as any)?.send_target === "today") {
          manualTarget = today;
          manualLabel = "Planejamento do Dia";
        }
      } else if (body.date === today) {
        manualLabel = "Planejamento do Dia";
      }
      const ok = await buildAndSend(admin, user.id, manualTarget, brandName, manualLabel);
      return new Response(JSON.stringify({ ok: true, sent: ok ? 1 : 0, date: manualTarget }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Forced via query string (also requires auth match)
  if (queryUserId) {
    if (!token) return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: corsHeaders });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    if (user.id !== queryUserId) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    const ok = await buildAndSend(admin, queryUserId, tomorrow, brandName, "Planejamento de Amanhã");
    return new Response(JSON.stringify({ ok: true, sent: ok ? 1 : 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cron mode — iterate enabled prefs and check time window
  const [hh, mm] = hhmm.split(":").map(Number);
  const nowMin = hh * 60 + mm;

  const { data: prefs, error } = await admin
    .from("daily_planning_telegram_prefs")
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
        // 5-minute trigger window (cron runs every 5 min)
        if (nowMin < target || nowMin >= target + 5) continue;
        if (lastSent[slot.key] === today) continue;
        firedSlot = slot.key;
        break;
      }
      if (!firedSlot) continue;

      const isToday = (pref as any).send_target === "today";
      const targetDate = isToday ? today : tomorrow;
      const label = isToday ? "Planejamento do Dia" : "Planejamento de Amanhã";
      const ok = await buildAndSend(admin, (pref as any).user_id, targetDate, brandName, label);
      if (ok) {
        const newLast = { ...lastSent, [firedSlot]: today };
        await admin.from("daily_planning_telegram_prefs")
          .update({ last_sent: newLast })
          .eq("user_id", (pref as any).user_id);
        sent++;
      }
    } catch (e) {
      console.error("daily-planning error for", (pref as any).user_id, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: prefs?.length ?? 0, hhmm }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
