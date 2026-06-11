// Comandos de relatórios do bot de Telegram (escopo "reports").
// Cada handler recebe o user_id resolvido a partir de telegram_reports_links
// e retorna uma string Markdown pronta para envio.

const TZ = "America/Sao_Paulo";

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);
}

export function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthBounds(date = todayInTZ()): { start: string; end: string; prefix: string } {
  const [y, m] = date.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, prefix: `${y}-${String(m).padStart(2, "0")}` };
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.floor((db - da) / 86_400_000);
}

/** Comandos disponíveis (sem a barra). */
export const REPORT_COMMANDS = new Set([
  "relatorios", "dashboard",
  "kpi_geral", "carteira_ativa", "recebimentos_hoje",
  "emprestimos_atrasados", "inadimplencia",
  "resumo_diario", "resumo_mensal",
]);

export function parseReportCommand(text: string): string | null {
  const m = text.trim().match(/^\/([a-z_]+)(?:@\w+)?\s*$/i);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  return REPORT_COMMANDS.has(cmd) ? cmd : null;
}

export function renderMenu(brand = "Relatórios"): string {
  return [
    `📊 *${brand} — Menu de Relatórios*`,
    "",
    "Use um dos comandos abaixo:",
    "",
    "*Visão geral*",
    "/dashboard — Visão executiva consolidada",
    "/kpi\\_geral — Indicadores principais",
    "",
    "*Carteira & inadimplência*",
    "/carteira\\_ativa — Saldo a receber e juros previstos",
    "/emprestimos\\_atrasados — Lista de contratos em atraso",
    "/inadimplencia — Taxa e faixas de atraso",
    "",
    "*Operação*",
    "/recebimentos\\_hoje — Pagamentos do dia",
    "/resumo\\_diario — Movimentação do dia",
    "/resumo\\_mensal — Fechamento do mês",
  ].join("\n");
}

interface Ctx {
  supabase: any;
  userId: string;
  today: string;
}

async function loadLoans(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("loans")
    .select("id, borrower_id, borrower_name, amount, interest_rate, interest_type, installments, paid_installments, status, start_date, due_date, remaining_amount, custom_installment_value")
    .eq("user_id", ctx.userId);
  return (data ?? []) as any[];
}

async function loadInstallments(ctx: Ctx, loanIds: string[]) {
  if (loanIds.length === 0) return [] as any[];
  const { data } = await ctx.supabase
    .from("loan_installments")
    .select("loan_id, installment_number, amount, due_date, paid, paid_at")
    .in("loan_id", loanIds);
  return (data ?? []) as any[];
}

async function loadPayments(ctx: Ctx, from: string, to: string) {
  const { data } = await ctx.supabase
    .from("payments")
    .select("loan_id, amount, date, installment_number")
    .eq("user_id", ctx.userId)
    .gte("date", from)
    .lte("date", to);
  return (data ?? []) as any[];
}

async function loadClients(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("clients")
    .select("id, name, active")
    .eq("user_id", ctx.userId);
  return (data ?? []) as any[];
}

// ---------- Métricas comuns ----------

interface Snapshot {
  loans: any[];
  installments: any[];
  clients: any[];
  active: any[];
  paid: any[];
  overdueInstallments: any[]; // pendentes vencidas (paid=false, due_date < hoje)
  totalLent: number;
  expectedReturn: number;
  expectedInterest: number;
  totalReceivedAll: number;
  remaining: number;
}

async function snapshot(ctx: Ctx): Promise<Snapshot> {
  const [loans, clients] = await Promise.all([loadLoans(ctx), loadClients(ctx)]);
  const installments = await loadInstallments(ctx, loans.map((l) => l.id));
  const active = loans.filter((l) => l.status === "active");
  const paid = loans.filter((l) => l.status === "paid");

  const totalLent = active.reduce((s, l) => s + Number(l.amount || 0), 0);
  const expectedReturn = active.reduce((s, l) => {
    const inst = installments.filter((i) => i.loan_id === l.id);
    if (inst.length > 0) return s + inst.reduce((a, i) => a + Number(i.amount || 0), 0);
    const cust = Number(l.custom_installment_value || 0);
    if (cust > 0) return s + cust * Number(l.installments || 0);
    return s + Number(l.amount || 0);
  }, 0);
  const expectedInterest = Math.max(0, expectedReturn - totalLent);

  const remaining = active.reduce((s, l) => {
    const inst = installments.filter((i) => i.loan_id === l.id && !i.paid);
    return s + inst.reduce((a, i) => a + Number(i.amount || 0), 0);
  }, 0);
  const totalReceivedAll = installments
    .filter((i) => i.paid)
    .reduce((s, i) => s + Number(i.amount || 0), 0);

  const overdueInstallments = installments.filter(
    (i) => !i.paid && i.due_date && i.due_date < ctx.today,
  );

  return {
    loans, installments, clients, active, paid,
    overdueInstallments,
    totalLent, expectedReturn, expectedInterest,
    totalReceivedAll, remaining,
  };
}

// ---------- Handlers ----------

async function recebimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const payments = await loadPayments(ctx, ctx.today, ctx.today);
  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const byClient = new Map<string, number>();
  for (const p of payments) {
    const loan = snap.loans.find((l) => l.id === p.loan_id);
    const name = loan?.borrower_name || "—";
    byClient.set(name, (byClient.get(name) ?? 0) + Number(p.amount || 0));
  }
  const dueToday = snap.installments.filter((i) => i.due_date === ctx.today);
  const dueTodayPending = dueToday.filter((i) => !i.paid).length;
  const totalPending = snap.installments.filter((i) => !i.paid).length;

  const lines: string[] = [];
  lines.push(`📅 *Recebimentos de hoje* — ${ctx.today.split("-").reverse().join("/")}`);
  lines.push("");
  lines.push(`💰 Total recebido: *${fmtBRL(total)}*`);
  lines.push(`🧾 Pagamentos: *${payments.length}*`);
  if (byClient.size > 0) {
    lines.push("");
    lines.push("*Clientes que pagaram:*");
    for (const [name, v] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`• ${name} — ${fmtBRL(v)}`);
    }
  }
  lines.push("");
  lines.push(`📆 Parcelas com vencimento hoje: *${dueToday.length}* (pendentes: ${dueTodayPending})`);
  lines.push(`⏳ Parcelas pendentes totais: *${totalPending}*`);
  return lines.join("\n");
}

async function carteiraAtiva(_ctx: Ctx, snap: Snapshot): Promise<string> {
  const lines: string[] = [];
  lines.push("💰 *Carteira Ativa*");
  lines.push("");
  lines.push(`📤 Total emprestado: *${fmtBRL(snap.totalLent)}*`);
  lines.push(`📥 Saldo a receber: *${fmtBRL(snap.remaining)}*`);
  lines.push(`📑 Contratos ativos: *${snap.active.length}*`);
  lines.push(`📈 Juros previstos: *${fmtBRL(snap.expectedInterest)}*`);
  lines.push(`💎 Retorno total previsto: *${fmtBRL(snap.expectedReturn)}*`);
  return lines.join("\n");
}

async function emprestimosAtrasados(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdueByLoan = new Map<string, { value: number; oldest: string }>();
  for (const i of snap.overdueInstallments) {
    const cur = overdueByLoan.get(i.loan_id) ?? { value: 0, oldest: i.due_date };
    cur.value += Number(i.amount || 0);
    if (i.due_date < cur.oldest) cur.oldest = i.due_date;
    overdueByLoan.set(i.loan_id, cur);
  }
  const total = [...overdueByLoan.values()].reduce((s, v) => s + v.value, 0);

  const lines: string[] = [];
  lines.push("🚨 *Empréstimos em Atraso*");
  lines.push("");
  lines.push(`📑 Contratos: *${overdueByLoan.size}*`);
  lines.push(`💸 Valor em atraso: *${fmtBRL(total)}*`);
  if (overdueByLoan.size === 0) {
    lines.push("");
    lines.push("_Nenhum contrato em atraso. 🎉_");
    return lines.join("\n");
  }
  lines.push("");
  lines.push("*Clientes:*");
  const sorted = [...overdueByLoan.entries()]
    .map(([loanId, v]) => {
      const loan = snap.loans.find((l) => l.id === loanId);
      return {
        name: loan?.borrower_name || "—",
        days: daysBetween(v.oldest, ctx.today),
        value: v.value,
      };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 15);
  for (const r of sorted) {
    lines.push(`• *${r.name}* — ${r.days}d em atraso — ${fmtBRL(r.value)}`);
  }
  if (overdueByLoan.size > 15) {
    lines.push(`_…e mais ${overdueByLoan.size - 15} contrato(s)._`);
  }
  return lines.join("\n");
}

async function inadimplencia(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdueValue = snap.overdueInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
  const carteira = snap.remaining;
  const taxa = carteira > 0 ? (overdueValue / carteira) * 100 : 0;

  const buckets = { b1: 0, b2: 0, b3: 0, b4: 0 };
  for (const i of snap.overdueInstallments) {
    const d = daysBetween(i.due_date, ctx.today);
    const v = Number(i.amount || 0);
    if (d <= 30) buckets.b1 += v;
    else if (d <= 60) buckets.b2 += v;
    else if (d <= 90) buckets.b3 += v;
    else buckets.b4 += v;
  }

  return [
    "📉 *Inadimplência*",
    "",
    `💼 Carteira (saldo a receber): *${fmtBRL(carteira)}*`,
    `⚠️ Valor vencido: *${fmtBRL(overdueValue)}*`,
    `📊 Taxa de inadimplência: *${taxa.toFixed(1)}%*`,
    "",
    "*Faixas de atraso:*",
    `• 1–30 dias: ${fmtBRL(buckets.b1)}`,
    `• 31–60 dias: ${fmtBRL(buckets.b2)}`,
    `• 61–90 dias: ${fmtBRL(buckets.b3)}`,
    `• 90+ dias: ${fmtBRL(buckets.b4)}`,
  ].join("\n");
}

async function resumoDiario(ctx: Ctx, snap: Snapshot): Promise<string> {
  const newLoans = snap.loans.filter((l) => l.start_date === ctx.today);
  const newValue = newLoans.reduce((s, l) => s + Number(l.amount || 0), 0);
  const payments = await loadPayments(ctx, ctx.today, ctx.today);
  const received = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const dueToday = snap.installments.filter((i) => i.due_date === ctx.today).length;
  const paidToday = snap.installments.filter((i) => i.paid && i.paid_at?.startsWith(ctx.today)).length;
  const overdueClients = new Set(snap.overdueInstallments.map((i) => i.loan_id)).size;

  return [
    `📅 *Resumo do dia* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos empréstimos: *${newLoans.length}*`,
    `📤 Valor emprestado hoje: *${fmtBRL(newValue)}*`,
    `💰 Recebimentos: *${fmtBRL(received)}* (${payments.length})`,
    `📆 Parcelas vencendo hoje: *${dueToday}*`,
    `✅ Parcelas pagas hoje: *${paidToday}*`,
    `🚨 Contratos inadimplentes: *${overdueClients}*`,
  ].join("\n");
}

async function resumoMensal(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((l) => l.start_date >= start && l.start_date <= end);
  const newValue = newLoans.reduce((s, l) => s + Number(l.amount || 0), 0);
  const monthPayments = await loadPayments(ctx, start, end);
  const received = monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);

  // Lucro estimado: principal proporcional vs juros recebido no mês.
  // Aproximação: juros = recebido_mes − (principal_amortizado_mes).
  // Para simplificar, usamos a razão juros_previstos/retorno_previsto da carteira.
  const ratio = snap.expectedReturn > 0 ? snap.expectedInterest / snap.expectedReturn : 0;
  const juros = received * ratio;
  const quitadosNoMes = snap.loans.filter((l) => {
    if (l.status !== "paid") return false;
    const last = snap.installments
      .filter((i) => i.loan_id === l.id && i.paid && i.paid_at)
      .map((i) => i.paid_at!.slice(0, 10))
      .sort()
      .pop();
    return last && last >= start && last <= end;
  }).length;
  const atrasadosCount = new Set(snap.overdueInstallments.map((i) => i.loan_id)).size;
  const rentabilidade = snap.totalLent > 0 ? (juros / snap.totalLent) * 100 : 0;

  return [
    `📆 *Resumo mensal* — ${prefix.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos contratos: *${newLoans.length}*`,
    `📤 Valor emprestado: *${fmtBRL(newValue)}*`,
    `💰 Valor recebido: *${fmtBRL(received)}*`,
    `📈 Juros recebidos (est.): *${fmtBRL(juros)}*`,
    `✅ Contratos quitados: *${quitadosNoMes}*`,
    `🚨 Contratos em atraso: *${atrasadosCount}*`,
    `💎 Lucro estimado: *${fmtBRL(juros)}*`,
    `📊 Rentabilidade s/ carteira: *${rentabilidade.toFixed(1)}%*`,
  ].join("\n");
}

async function kpiGeral(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end } = monthBounds(ctx.today);
  const monthPayments = await loadPayments(ctx, start, end);
  const received = monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const ratio = snap.expectedReturn > 0 ? snap.expectedInterest / snap.expectedReturn : 0;
  const juros = received * ratio;
  const overdueValue = snap.overdueInstallments.reduce((s, i) => s + Number(i.amount || 0), 0);
  const taxa = snap.remaining > 0 ? (overdueValue / snap.remaining) * 100 : 0;
  const activeClients = snap.clients.filter((c) => c.active !== false).length;
  const ticket = snap.active.length > 0 ? snap.totalLent / snap.active.length : 0;
  const rentabilidade = snap.totalLent > 0 ? (juros / snap.totalLent) * 100 : 0;

  return [
    "📊 *Dashboard Executivo*",
    "",
    `👥 Clientes ativos: *${activeClients}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    `📤 Valor emprestado: *${fmtBRL(snap.totalLent)}*`,
    `📥 Saldo a receber: *${fmtBRL(snap.remaining)}*`,
    `💰 Recebido no mês: *${fmtBRL(received)}*`,
    `📈 Juros recebidos (est.): *${fmtBRL(juros)}*`,
    `📉 Taxa de inadimplência: *${taxa.toFixed(1)}%*`,
    `🎯 Ticket médio: *${fmtBRL(ticket)}*`,
    `💎 Rentabilidade da carteira: *${rentabilidade.toFixed(1)}%*`,
  ].join("\n");
}

export async function runReportCommand(
  supabase: any,
  userId: string,
  command: string,
): Promise<string> {
  if (command === "relatorios") return renderMenu();
  const ctx: Ctx = { supabase, userId, today: todayInTZ() };
  const snap = await snapshot(ctx);
  switch (command) {
    case "dashboard":
    case "kpi_geral":           return kpiGeral(ctx, snap);
    case "carteira_ativa":      return carteiraAtiva(ctx, snap);
    case "recebimentos_hoje":   return recebimentosHoje(ctx, snap);
    case "emprestimos_atrasados": return emprestimosAtrasados(ctx, snap);
    case "inadimplencia":       return inadimplencia(ctx, snap);
    case "resumo_diario":       return resumoDiario(ctx, snap);
    case "resumo_mensal":       return resumoMensal(ctx, snap);
    default:                    return renderMenu();
  }
}
