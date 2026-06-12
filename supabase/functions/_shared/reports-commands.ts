const TZ = "America/Sao_Paulo";

export function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function todayInTZ(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthBounds(date = todayInTZ()): { start: string; end: string; prefix: string } {
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end, prefix: `${year}-${String(month).padStart(2, "0")}` };
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function inMonth(date: string | null | undefined, month: string): boolean {
  return !!date && String(date).slice(0, 7) === month;
}

function num(value: unknown): number {
  return Number(value || 0);
}

function totalWithInterest(loan: any): number {
  return Math.round(num(loan.amount) * (1 + num(loan.interest_rate) / 100));
}

export const REPORT_COMMANDS = new Set([
  "relatorios", "dashboard",
  "kpi_geral", "carteira_ativa",
  "emprestimos_atrasados", "vencimentos_hoje", "inadimplencia",
  "resumo_diario", "resumo_mensal",
  "top_clientes", "vencimentos_semana", "projecao_mes",
  "novos_contratos", "historico_cliente", "alertas",
]);

export function parseReportCommand(text: string): string | null {
  const normalized = text.trim().replace(/\\_/g, "_");
  const match = normalized.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?\s*$/i);
  if (!match) return null;
  const command = match[1].toLowerCase();
  if (!REPORT_COMMANDS.has(command)) return null;
  const arg = (match[2] || "").trim();
  return arg ? `${command}|${arg}` : command;
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
    "/carteira\\_ativa — Capital e pendências",
    "/emprestimos\\_atrasados — Lista de contratos em atraso",
    "/inadimplencia — Taxa e faixas de atraso",
    "",
    "*Operação*",
    "/vencimentos\\_hoje — Contratos que vencem hoje",
    "/vencimentos\\_semana — Parcelas dos próximos 7 dias",
    "/resumo\\_diario — Movimentação do dia",
    "/resumo\\_mensal — Fechamento do mês",
    "",
    "*Carteira & crescimento*",
    "/top\\_clientes — Melhores e piores pagadores",
    "/novos\\_contratos — Contratos do mês",
    "/projecao\\_mes — Projeção de caixa do mês",
    "/alertas — Sinais de risco",
    "",
    "*Consulta*",
    "/historico\\_cliente <nome> — Ficha de um cliente",
  ].join("\n");
}

interface Ctx {
  supabase: any;
  userId: string;
  today: string;
}

interface Snapshot {
  loans: any[];
  installments: any[];
  payments: any[];
  clients: any[];
  active: any[];
  totalLent: number;
  totalToReceive: number;
  pendingReceivable: number;
  estimatedProfit: number;
  overdueLoans: number;
}

async function loadLoans(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase.from("loans").select("*").eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

async function loadInstallments(ctx: Ctx, loanIds: string[]): Promise<any[]> {
  const rows: any[] = [];
  for (let i = 0; i < loanIds.length; i += 50) {
    const chunk = loanIds.slice(i, i + 50);
    const { data, error } = await ctx.supabase
      .from("loan_installments")
      .select("loan_id, installment_number, amount, due_date")
      .in("loan_id", chunk);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

async function loadPayments(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("payments")
    .select("id, loan_id, amount, date, installment_number, created_at, metadata")
    .eq("user_id", ctx.userId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function loadClients(ctx: Ctx): Promise<any[]> {
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id, name, phone, active, created_at")
    .eq("user_id", ctx.userId);
  if (error) throw error;
  return data ?? [];
}

function dueEntriesForLoan(loan: any, installments: any[]) {
  const count = Math.max(1, num(loan.installments) || 1);
  const total = totalWithInterest(loan);
  const installmentValue = total / count;
  const paidInstallments = num(loan.paid_installments);
  const schedules = installments
    .filter((schedule) => schedule.loan_id === loan.id)
    .sort((a, b) => num(a.installment_number) - num(b.installment_number));

  if (schedules.length > 0) {
    return schedules.map((schedule) => ({
      loan_id: loan.id,
      installment_number: num(schedule.installment_number),
      due_date: schedule.due_date,
      amount: num(schedule.amount) || installmentValue,
      paid: loan.status === "paid" || schedule.paid === true || num(schedule.installment_number) <= paidInstallments,
    }));
  }

  if (count <= 1) {
    return [{
      loan_id: loan.id,
      installment_number: 1,
      due_date: loan.due_date,
      amount: total,
      paid: loan.status === "paid" || paidInstallments >= 1,
    }];
  }

  const base = new Date(`${String(loan.due_date).slice(0, 10)}T00:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const due = new Date(base.getFullYear(), base.getMonth() + index, base.getDate());
    return {
      loan_id: loan.id,
      installment_number: index + 1,
      due_date: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`,
      amount: installmentValue,
      paid: loan.status === "paid" || index + 1 <= paidInstallments,
    };
  });
}

function paymentsInRange(payments: any[], from: string, to: string): any[] {
  return payments.filter((payment) => payment.date >= from && payment.date <= to);
}

function totalPaidByLoan(payments: any[]): Record<string, number> {
  return payments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.loan_id] = (acc[payment.loan_id] || 0) + num(payment.amount);
    return acc;
  }, {});
}

function getOverdueByLoan(ctx: Ctx, snap: Snapshot) {
  const paidByLoan = totalPaidByLoan(snap.payments);
  const overdue = new Map<string, { value: number; oldest: string }>();

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (entry.paid || !entry.due_date || entry.due_date >= ctx.today) continue;
      const fallbackRemaining = Math.max(0, totalWithInterest(loan) - (paidByLoan[loan.id] || 0));
      const value = count === 1 ? Math.max(0, num(loan.remaining_amount) || fallbackRemaining) : entry.amount;
      const current = overdue.get(loan.id) ?? { value: 0, oldest: entry.due_date };
      current.value += value;
      if (entry.due_date < current.oldest) current.oldest = entry.due_date;
      overdue.set(loan.id, current);
    }
  }

  return overdue;
}

function computeDefaultRate(ctx: Ctx, snap: Snapshot, month: string): number {
  const paidByLoan = totalPaidByLoan(snap.payments);
  let portfolio = 0;
  let overdue = 0;

  for (const loan of snap.loans) {
    const count = Math.max(1, num(loan.installments) || 1);
    for (const entry of dueEntriesForLoan(loan, snap.installments)) {
      if (!inMonth(entry.due_date, month)) continue;
      portfolio += entry.amount;
      if (entry.paid || entry.due_date >= ctx.today) continue;
      if (count === 1) {
        const fallbackRemaining = Math.max(0, totalWithInterest(loan) - (paidByLoan[loan.id] || 0));
        overdue += Math.max(0, num(loan.remaining_amount) || fallbackRemaining);
      } else {
        overdue += entry.amount;
      }
    }
  }

  return portfolio > 0 ? (overdue / portfolio) * 100 : 0;
}

function computeExpectedReceivable(loans: any[], month: string): number {
  return loans.reduce((sum, loan) => {
    const count = Math.max(1, num(loan.installments) || 1);
    const total = totalWithInterest(loan);
    if (count <= 1) return inMonth(loan.due_date, month) ? sum + total : sum;

    const [year, startMonth, day] = String(loan.start_date || "").split("-").map(Number);
    if (!year || !startMonth || !day) return sum;
    const installmentValue = total / count;
    let monthlyTotal = 0;
    for (let i = 0; i < count; i++) {
      const due = new Date(year, (startMonth - 1) + (i + 1), day);
      const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
      if (key === month) monthlyTotal += installmentValue;
    }
    return sum + monthlyTotal;
  }, 0);
}

function computeProfitRealized(loans: any[], payments: any[], month: string): number {
  const sorted = [...payments].sort((a, b) => {
    const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });
  const interestByPayment = new Map<string, number>();
  const remainingInterestByLoan = new Map<string, number>();

  for (const loan of loans) {
    remainingInterestByLoan.set(loan.id, Math.max(0, totalWithInterest(loan) - num(loan.amount)));
  }

  for (const payment of sorted) {
    const amount = num(payment.amount);
    if (amount <= 0) {
      interestByPayment.set(payment.id, 0);
      continue;
    }

    const installmentNumber = num(payment.installment_number);
    if (installmentNumber === 0 || installmentNumber === -2) {
      interestByPayment.set(payment.id, amount);
      remainingInterestByLoan.set(payment.loan_id, Math.max(0, (remainingInterestByLoan.get(payment.loan_id) ?? 0) - amount));
      continue;
    }
    if (installmentNumber === -3) {
      interestByPayment.set(payment.id, 0);
      continue;
    }

    const loan = loans.find((item) => item.id === payment.loan_id);
    const total = loan ? totalWithInterest(loan) : 0;
    const ratio = total > 0 && loan ? Math.max(0, 1 - num(loan.amount) / total) : 0;
    const interest = Math.min(remainingInterestByLoan.get(payment.loan_id) ?? 0, Math.max(0, amount * ratio));
    interestByPayment.set(payment.id, interest);
    remainingInterestByLoan.set(payment.loan_id, Math.max(0, (remainingInterestByLoan.get(payment.loan_id) ?? 0) - interest));
  }

  const lastPaymentByLoan = new Map<string, string>();
  for (const payment of sorted) lastPaymentByLoan.set(payment.loan_id, payment.id);
  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const lastId = lastPaymentByLoan.get(loan.id);
    if (!lastId) continue;
    const loanPayments = payments.filter((payment) => payment.loan_id === loan.id);
    const totalPaid = loanPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
    const allocated = loanPayments.reduce((sum, payment) => sum + (interestByPayment.get(payment.id) ?? 0), 0);
    const principal = num(loan.original_amount ?? loan.amount);
    const diff = (totalPaid - principal) - allocated;
    if (Math.abs(diff) >= 0.005) interestByPayment.set(lastId, Math.max(0, (interestByPayment.get(lastId) ?? 0) + diff));
  }

  return payments
    .filter((payment) => inMonth(payment.date, month))
    .reduce((sum, payment) => sum + (interestByPayment.get(payment.id) ?? 0), 0);
}

async function snapshot(ctx: Ctx): Promise<Snapshot> {
  const [loans, clients, payments] = await Promise.all([loadLoans(ctx), loadClients(ctx), loadPayments(ctx)]);
  const installments = await loadInstallments(ctx, loans.map((loan) => loan.id));
  const active = loans.filter((loan) => loan.status !== "paid");
  // Capital na rua = principal proporcional ao número de parcelas em aberto
  // (espelha a lógica do card "Capital na Rua" do app).
  const totalLent = active.reduce((sum, loan) => {
    const n = num(loan.installments) > 0 ? num(loan.installments) : 1;
    const paid = Math.min(num(loan.paid_installments), n);
    const remainingRatio = Math.max(0, (n - paid) / n);
    return sum + num(loan.amount) * remainingRatio;
  }, 0);
  const totalToReceive = active.reduce((sum, loan) => {
    const total = totalWithInterest(loan);
    const dueDate = new Date(`${loan.due_date}T00:00:00`);
    const today = new Date(`${ctx.today}T00:00:00`);
    const daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
    const paidForLoan = payments.filter((payment) => payment.loan_id === loan.id).reduce((s, payment) => s + num(payment.amount), 0);
    const baseRemaining = num(loan.remaining_amount) > 0 ? num(loan.remaining_amount) : Math.max(0, total - paidForLoan);
    let lateFees = 0;
    if (num(loan.late_interest_value) > 0 && daysLate > 0) {
      lateFees += loan.late_interest_type === "fixed"
        ? num(loan.late_interest_value) * daysLate
        : baseRemaining * (num(loan.late_interest_value) / 100) * daysLate;
    }
    if (num(loan.penalty_value) > 0 && daysLate > 0) lateFees += num(loan.penalty_value);
    const interestPaymentsReceived = payments
      .filter((payment) => payment.loan_id === loan.id && num(payment.installment_number) === 0)
      .reduce((s, payment) => s + num(payment.amount), 0);
    return sum + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
  }, 0);
  const pendingReceivable = active.reduce((sum, loan) => sum + num(loan.remaining_amount), 0);
  const estimatedProfit = pendingReceivable - totalLent;
  const overdueLoans = loans.filter((loan) => loan.status === "overdue" && loan.due_date < ctx.today).length;

  return { loans, installments, payments, clients, active, totalLent, totalToReceive, pendingReceivable, estimatedProfit, overdueLoans };
}

async function recebimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const total = payments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const byClient = new Map<string, number>();
  for (const payment of payments) {
    const loan = snap.loans.find((item) => item.id === payment.loan_id);
    const name = loan?.borrower_name || "—";
    byClient.set(name, (byClient.get(name) ?? 0) + num(payment.amount));
  }
  const dueEntries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const dueToday = dueEntries.filter((entry) => entry.due_date === ctx.today);

  const lines = [
    `📅 *Recebimentos de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `💰 Total recebido: *${fmtBRL(total)}*`,
    `🧾 Pagamentos: *${payments.length}*`,
  ];
  if (byClient.size > 0) {
    lines.push("", "*Clientes que pagaram:*");
    for (const [name, value] of [...byClient.entries()].sort((a, b) => b[1] - a[1])) lines.push(`• ${name} — ${fmtBRL(value)}`);
  }
  lines.push("", `📆 Parcelas com vencimento hoje: *${dueToday.length}* (pendentes: ${dueToday.filter((entry) => !entry.paid).length})`);
  lines.push(`⏳ Parcelas pendentes totais: *${dueEntries.filter((entry) => !entry.paid).length}*`);
  return lines.join("\n");
}

async function carteiraAtiva(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  return [
    "💰 *Carteira Ativa*",
    "",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `📈 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    overdueCount > 0 ? `🚨 Em atraso: *${overdueCount}*` : "✅ Nenhum empréstimo em atraso",
  ].join("\n");
}

async function emprestimosAtrasados(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const total = [...overdue.values()].reduce((sum, item) => sum + item.value, 0);
  const lines = ["🚨 *Empréstimos em Atraso*", "", `📑 Contratos: *${overdue.size}*`, `💸 Valor em atraso: *${fmtBRL(total)}*`];
  if (overdue.size === 0) return [...lines, "", "_Nenhum contrato em atraso. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");
  const sorted = [...overdue.entries()]
    .map(([loanId, item]) => {
      const loan = snap.loans.find((entry) => entry.id === loanId);
      return { name: loan?.borrower_name || "—", days: daysBetween(item.oldest, ctx.today), value: item.value };
    })
    .sort((a, b) => b.days - a.days);

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const daysWidth = Math.max(...sorted.map((r) => `${r.days}d`.length));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(`${row.days}d`, daysWidth)} ${padL(fmtBRL(row.value), valueWidth)}\``);
  }
  return lines.join("\n");
}

async function vencimentosHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const rows = snap.loans.flatMap((loan) =>
    dueEntriesForLoan(loan, snap.installments)
      .filter((e) => e.due_date === ctx.today && !e.paid)
      .map((e) => ({ name: loan.borrower_name || "—", installment: e.installment_number ?? null, value: num(e.amount) }))
  );
  const total = rows.reduce((s, r) => s + r.value, 0);
  const lines = ["📆 *Contratos que vencem hoje*", "", `📑 Contratos: *${rows.length}*`, `💰 Valor previsto: *${fmtBRL(total)}*`];
  if (rows.length === 0) return [...lines, "", "_Nenhum vencimento para hoje. 🎉_"].join("\n");

  lines.push("", "*Clientes:*");
  const sorted = rows.sort((a, b) => b.value - a.value);

  const nameWidth = Math.min(14, Math.max(...sorted.map((r) => r.name.length)));
  const parcelaWidth = Math.max(...sorted.map((r) => (r.installment ? `#${r.installment}` : "—").length));
  const valueWidth = Math.max(...sorted.map((r) => fmtBRL(r.value).length));
  const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));
  const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

  for (const row of sorted) {
    const shortName = row.name.length > nameWidth ? row.name.slice(0, nameWidth) : row.name;
    const parcela = row.installment ? `#${row.installment}` : "—";
    lines.push(`\`${pad(shortName, nameWidth)} ${padL(parcela, parcelaWidth)} ${padL(fmtBRL(row.value), valueWidth)}\``);
  }
  return lines.join("\n");
}

async function inadimplencia(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { prefix } = monthBounds(ctx.today);
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueValue = [...overdue.values()].reduce((sum, item) => sum + item.value, 0);
  const buckets = { b1: 0, b2: 0, b3: 0, b4: 0 };
  for (const item of overdue.values()) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 30) buckets.b1 += item.value;
    else if (days <= 60) buckets.b2 += item.value;
    else if (days <= 90) buckets.b3 += item.value;
    else buckets.b4 += item.value;
  }

  return [
    "📉 *Inadimplência*",
    "",
    `💼 Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `⚠️ Valor vencido em aberto: *${fmtBRL(overdueValue)}*`,
    `📊 Taxa do mês (igual Metas): *${computeDefaultRate(ctx, snap, prefix).toFixed(2)}%*`,
    "",
    "*Faixas de atraso:*",
    `• 1–30 dias: ${fmtBRL(buckets.b1)}`,
    `• 31–60 dias: ${fmtBRL(buckets.b2)}`,
    `• 61–90 dias: ${fmtBRL(buckets.b3)}`,
    `• 90+ dias: ${fmtBRL(buckets.b4)}`,
  ].join("\n");
}

async function resumoDiario(ctx: Ctx, snap: Snapshot): Promise<string> {
  const newLoans = snap.loans.filter((loan) => loan.start_date === ctx.today);
  const payments = paymentsInRange(snap.payments, ctx.today, ctx.today);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments)).filter((entry) => entry.due_date === ctx.today).length;

  return [
    `📅 *Resumo do dia* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos empréstimos: *${newLoans.length}*`,
    `📤 Valor emprestado hoje: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Recebimentos: *${fmtBRL(payments.reduce((sum, payment) => sum + num(payment.amount), 0))}* (${payments.length})`,
    `📆 Parcelas vencendo hoje: *${dueToday}*`,
    `✅ Pagamentos registrados hoje: *${payments.length}*`,
    `🚨 Contratos inadimplentes: *${getOverdueByLoan(ctx, snap).size}*`,
  ].join("\n");
}

async function resumoMensal(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((loan) => loan.start_date >= start && loan.start_date <= end);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const paidOff = snap.loans.filter((loan) => {
    if (loan.status !== "paid") return false;
    const last = snap.payments.filter((payment) => payment.loan_id === loan.id).map((payment) => String(payment.date || "")).sort().pop();
    return !!last && last >= start && last <= end;
  }).length;

  return [
    `📆 *Resumo mensal* — ${prefix.split("-").reverse().join("/")}`,
    "",
    `🆕 Novos contratos: *${newLoans.length}*`,
    `📤 Valor emprestado: *${fmtBRL(newLoans.reduce((sum, loan) => sum + num(loan.amount), 0))}*`,
    `💰 Valor recebido: *${fmtBRL(received)}*`,
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `📈 Juros recebidos: *${fmtBRL(interest)}*`,
    `✅ Contratos quitados: *${paidOff}*`,
    `🚨 Contratos em atraso: *${getOverdueByLoan(ctx, snap).size}*`,
    `🎯 Faturamento do período: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(2)}%*`,
    `📊 Rentabilidade s/ carteira: *${(snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0).toFixed(2)}%*`,
  ].join("\n");
}

async function dashboard(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const activeClients = snap.clients.filter((client) => client.active !== false).length;
  const overdueCount = getOverdueByLoan(ctx, snap).size;

  return [
    "📊 *Dashboard Executivo*",
    "",
    "*Visão geral*",
    `👥 Clientes ativos: *${activeClients}*`,
    `📑 Empréstimos ativos: *${snap.active.length}*`,
    `🚨 Contratos em atraso: *${overdueCount}*`,
    "",
    "*Financeiro do mês*",
    `📤 Capital na rua: *${fmtBRL(snap.totalLent)}*`,
    `💰 Recebido no mês: *${fmtBRL(received)}*`,
    `⏳ Pendente de recebimento: *${fmtBRL(snap.pendingReceivable)}*`,
    `💎 Lucro estimado: *${fmtBRL(snap.estimatedProfit)}*`,
  ].join("\n");
}

async function kpiGeral(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
  const interest = computeProfitRealized(snap.loans, snap.payments, prefix);
  const defaultRate = computeDefaultRate(ctx, snap, prefix);
  const avgTicket = snap.active.length > 0 ? snap.pendingReceivable / snap.active.length : 0;
  const portfolioYield = snap.totalLent > 0 ? (interest / snap.totalLent) * 100 : 0;
  const collectionRate = snap.pendingReceivable + received > 0
    ? (received / (received + snap.pendingReceivable)) * 100
    : 0;
  const overdueCount = getOverdueByLoan(ctx, snap).size;
  const overdueRatio = snap.active.length > 0 ? (overdueCount / snap.active.length) * 100 : 0;

  return [
    "📈 *KPIs Gerais*",
    "",
    "*Performance da carteira*",
    `🎯 Ticket médio: *${fmtBRL(avgTicket)}*`,
    `💎 Rentabilidade: *${portfolioYield.toFixed(2)}%*`,
    `📈 Juros recebidos no mês: *${fmtBRL(interest)}*`,
    "",
    "*Cobrança e inadimplência*",
    `📊 Taxa de inadimplência: *${defaultRate.toFixed(2)}%*`,
    `🚨 Contratos em atraso: *${overdueCount}* (${overdueRatio.toFixed(1)}% da carteira)`,
    `✅ Eficiência de cobrança: *${collectionRate.toFixed(2)}%*`,
  ].join("\n");
}

function phoneByName(snap: Snapshot, name: string): string {
  const c = snap.clients.find((cl) => (cl.name || "").toLowerCase() === (name || "").toLowerCase());
  return c?.phone ? ` 📞 ${c.phone}` : "";
}

async function topClientes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const stats = new Map<string, { lent: number; paid: number; overdue: number; days: number }>();
  for (const loan of snap.loans) {
    const name = loan.borrower_name || "—";
    const s = stats.get(name) ?? { lent: 0, paid: 0, overdue: 0, days: 0 };
    s.lent += num(loan.amount);
    s.paid += snap.payments.filter((p) => p.loan_id === loan.id).reduce((a, p) => a + num(p.amount), 0);
    const od = overdue.get(loan.id);
    if (od) {
      s.overdue += od.value;
      s.days = Math.max(s.days, daysBetween(od.oldest, ctx.today));
    }
    stats.set(name, s);
  }
  const arr = [...stats.entries()].map(([name, s]) => ({ name, ...s }));
  const best = [...arr].filter((x) => x.paid > 0).sort((a, b) => b.paid - a.paid).slice(0, 5);
  const worst = [...arr].filter((x) => x.overdue > 0).sort((a, b) => b.days - a.days || b.overdue - a.overdue).slice(0, 5);
  const lines = ["🏆 *Top Clientes*", "", "*Melhores pagadores*"];
  if (best.length === 0) lines.push("_Sem dados._");
  for (const b of best) {
    lines.push(`• ${b.name} — pago ${fmtBRL(b.paid)} / emprestado ${fmtBRL(b.lent)}`);
  }
  lines.push("", "*Maiores devedores*");
  if (worst.length === 0) lines.push("_Nenhum cliente em atraso. 🎉_");
  for (const w of worst) lines.push(`• ${w.name} — ${w.days}d em atraso — ${fmtBRL(w.overdue)}`);
  return lines.join("\n");
}

async function vencimentosSemana(ctx: Ctx, snap: Snapshot): Promise<string> {
  const start = new Date(`${ctx.today}T00:00:00`);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).map((e) => ({ ...e, borrower: loan.borrower_name || "—" })));
  const upcoming = entries.filter((e) => !e.paid && e.due_date >= ctx.today && e.due_date <= endStr).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const total = upcoming.reduce((s, e) => s + e.amount, 0);
  const lines = [`📆 *Vencimentos — próximos 7 dias*`, "", `📑 Parcelas: *${upcoming.length}* — Total: *${fmtBRL(total)}*`];
  if (upcoming.length === 0) return [...lines, "", "_Nada a vencer no período._"].join("\n");
  const byDay = new Map<string, typeof upcoming>();
  for (const e of upcoming) {
    const arr = byDay.get(e.due_date) ?? [];
    arr.push(e);
    byDay.set(e.due_date, arr);
  }
  for (const [day, items] of byDay) {
    const dayTotal = items.reduce((s, e) => s + e.amount, 0);
    lines.push("", `*${day.split("-").reverse().join("/")}* — *${fmtBRL(dayTotal)}*`);
    for (const it of items) lines.push(`• ${it.borrower} — ${fmtBRL(it.amount)}`);
  }
  return lines.join("\n");
}

async function projecaoMes(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const monthPayments = paymentsInRange(snap.payments, start, end);
  const received = monthPayments.reduce((s, p) => s + num(p.amount), 0);
  const entries = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments));
  const monthEntries = entries.filter((e) => inMonth(e.due_date, prefix) && !e.paid);
  const remainingMonth = monthEntries.filter((e) => e.due_date >= ctx.today).reduce((s, e) => s + e.amount, 0);
  const overdueInMonth = monthEntries.filter((e) => e.due_date < ctx.today).reduce((s, e) => s + e.amount, 0);
  const expected = computeExpectedReceivable(snap.loans, prefix);
  const projected = received + remainingMonth + overdueInMonth;
  return [
    `📡 *Projeção de Caixa — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📌 Previsto no mês: *${fmtBRL(expected)}*`,
    `💰 Já recebido: *${fmtBRL(received)}*`,
    `📆 A vencer ainda no mês: *${fmtBRL(remainingMonth)}*`,
    `🚨 Atrasado (mês corrente): *${fmtBRL(overdueInMonth)}*`,
    `🎯 Projeção final: *${fmtBRL(projected)}*`,
    `📊 Realizado vs previsto: *${(expected > 0 ? (received / expected) * 100 : 0).toFixed(1)}%*`,
  ].join("\n");
}

async function novosContratos(ctx: Ctx, snap: Snapshot): Promise<string> {
  const { start, end, prefix } = monthBounds(ctx.today);
  const newLoans = snap.loans.filter((l) => l.start_date >= start && l.start_date <= end);
  const totalLent = newLoans.reduce((s, l) => s + num(l.amount), 0);
  const avgRate = newLoans.length > 0 ? newLoans.reduce((s, l) => s + num(l.interest_rate), 0) / newLoans.length : 0;
  const avgTerm = newLoans.length > 0 ? newLoans.reduce((s, l) => s + (num(l.installments) || 1), 0) / newLoans.length : 0;
  const existingNames = new Set(snap.loans.filter((l) => l.start_date < start).map((l) => l.borrower_name));
  const newClients = new Set(newLoans.filter((l) => !existingNames.has(l.borrower_name)).map((l) => l.borrower_name));
  const lines = [
    `🆕 *Novos Contratos — ${prefix.split("-").reverse().join("/")}*`,
    "",
    `📑 Contratos: *${newLoans.length}*`,
    `📤 Volume emprestado: *${fmtBRL(totalLent)}*`,
    `📈 Taxa média: *${avgRate.toFixed(2)}%*`,
    `📅 Prazo médio: *${avgTerm.toFixed(1)} parcelas*`,
    `👥 Clientes novos: *${newClients.size}* / recorrentes: *${newLoans.length - newClients.size}*`,
  ];
  if (newLoans.length > 0) {
    lines.push("", "*Contratos:*");
    for (const l of newLoans) lines.push(`• ${l.borrower_name || "—"} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x)`);
  }
  return lines.join("\n");
}

async function cobrancaHoje(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const overdueRows = [...overdue.entries()].map(([loanId, item]) => {
    const loan = snap.loans.find((l) => l.id === loanId);
    return { name: loan?.borrower_name || "—", days: daysBetween(item.oldest, ctx.today), value: item.value };
  }).sort((a, b) => b.days - a.days);
  const dueToday = snap.loans.flatMap((loan) => dueEntriesForLoan(loan, snap.installments).filter((e) => e.due_date === ctx.today && !e.paid).map((e) => ({ name: loan.borrower_name || "—", value: e.amount })));
  const totalOverdue = overdueRows.reduce((s, r) => s + r.value, 0);
  const totalToday = dueToday.reduce((s, r) => s + r.value, 0);
  const lines = [
    `📞 *Cobrança de hoje* — ${ctx.today.split("-").reverse().join("/")}`,
    "",
    `🚨 Em atraso: *${overdueRows.length}* — ${fmtBRL(totalOverdue)}`,
    `📆 Vencem hoje: *${dueToday.length}* — ${fmtBRL(totalToday)}`,
  ];
  if (overdueRows.length > 0) {
    lines.push("", "*Em atraso (prioridade):*");
    for (const r of overdueRows) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (dueToday.length > 0) {
    lines.push("", "*Vencem hoje:*");
    for (const r of dueToday) lines.push(`• ${r.name} — ${fmtBRL(r.value)}${phoneByName(snap, r.name)}`);
  }
  if (overdueRows.length === 0 && dueToday.length === 0) lines.push("", "_Nada para cobrar hoje. 🎉_");
  return lines.join("\n");
}

async function historicoCliente(ctx: Ctx, snap: Snapshot, query: string): Promise<string> {
  if (!query) return "Use: `/historico_cliente <nome do cliente>`";
  const q = query.toLowerCase();
  const matches = snap.loans.filter((l) => (l.borrower_name || "").toLowerCase().includes(q));
  const names = [...new Set(matches.map((l) => l.borrower_name))];
  if (names.length === 0) return `Nenhum cliente encontrado para *${query}*.`;
  if (names.length > 1) return ["Vários clientes encontrados:", "", ...names.map((n) => `• ${n}`), "", "Refine o nome."].join("\n");
  const name = names[0];
  const loans = matches;
  const overdue = getOverdueByLoan(ctx, snap);
  const totalLent = loans.reduce((s, l) => s + num(l.amount), 0);
  const totalDue = loans.reduce((s, l) => s + totalWithInterest(l), 0);
  const paid = snap.payments.filter((p) => loans.some((l) => l.id === p.loan_id)).reduce((s, p) => s + num(p.amount), 0);
  const overdueValue = loans.reduce((s, l) => s + (overdue.get(l.id)?.value ?? 0), 0);
  const active = loans.filter((l) => l.status !== "paid").length;
  const paidOff = loans.filter((l) => l.status === "paid").length;
  const lines = [
    `👤 *${name}*${phoneByName(snap, name)}`,
    "",
    `📑 Contratos: *${loans.length}* (ativos: ${active} | quitados: ${paidOff})`,
    `📤 Total emprestado: *${fmtBRL(totalLent)}*`,
    `📊 Total a receber (com juros): *${fmtBRL(totalDue)}*`,
    `💰 Total pago: *${fmtBRL(paid)}*`,
    `🚨 Valor em atraso: *${fmtBRL(overdueValue)}*`,
    "",
    "*Contratos:*",
  ];
  for (const l of loans.sort((a, b) => String(b.due_date).localeCompare(String(a.due_date)))) {
    const od = overdue.get(l.id);
    const tag = l.status === "paid" ? "✅ quitado" : od ? `🚨 ${daysBetween(od.oldest, ctx.today)}d atraso` : "⏳ em dia";
    const tagsArr = Array.isArray(l.tags) ? l.tags.filter(Boolean) : [];
    const tagsStr = tagsArr.length > 0 ? ` — 🏷️ ${tagsArr.join(", ")}` : "";
    const dueStr = l.due_date ? String(l.due_date).slice(0, 10).split("-").reverse().join("/") : "—";
    lines.push(`• venc. ${dueStr} — ${fmtBRL(num(l.amount))} (${num(l.installments) || 1}x) — ${tag}${tagsStr}`);
  }
  return lines.join("\n");
}

async function alertas(ctx: Ctx, snap: Snapshot): Promise<string> {
  const overdue = getOverdueByLoan(ctx, snap);
  const recentOverdue: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days <= 7) {
      const loan = snap.loans.find((l) => l.id === loanId);
      recentOverdue.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const critical: { name: string; days: number; value: number }[] = [];
  for (const [loanId, item] of overdue) {
    const days = daysBetween(item.oldest, ctx.today);
    if (days > 60) {
      const loan = snap.loans.find((l) => l.id === loanId);
      critical.push({ name: loan?.borrower_name || "—", days, value: item.value });
    }
  }
  const exposureByClient = new Map<string, number>();
  for (const l of snap.active) {
    const n = l.borrower_name || "—";
    exposureByClient.set(n, (exposureByClient.get(n) ?? 0) + num(l.amount));
  }
  const totalActive = [...exposureByClient.values()].reduce((s, v) => s + v, 0);
  const concentration = [...exposureByClient.entries()]
    .map(([name, value]) => ({ name, value, pct: totalActive > 0 ? (value / totalActive) * 100 : 0 }))
    .filter((r) => r.pct >= 20)
    .sort((a, b) => b.pct - a.pct);

  const lines = ["⚠️ *Alertas de Risco*", ""];
  lines.push(`🆕 Atrasos novos (≤7d): *${recentOverdue.length}*`);
  for (const r of recentOverdue.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `🔥 Atrasos críticos (>60d): *${critical.length}*`);
  for (const r of critical.slice(0, 10)) lines.push(`• ${r.name} — ${r.days}d — ${fmtBRL(r.value)}`);
  lines.push("", `📊 Concentração de carteira (≥20%): *${concentration.length}*`);
  for (const r of concentration) lines.push(`• ${r.name} — ${r.pct.toFixed(1)}% (${fmtBRL(r.value)})`);
  if (recentOverdue.length === 0 && critical.length === 0 && concentration.length === 0) {
    lines.push("", "_Nenhum sinal de risco no momento. 🎉_");
  }
  return lines.join("\n");
}

export async function runReportCommand(supabase: any, userId: string, command: string): Promise<string> {
  if (command === "relatorios") return renderMenu();
  const [base, ...rest] = command.split("|");
  const arg = rest.join("|");
  const ctx: Ctx = { supabase, userId, today: todayInTZ() };
  const snap = await snapshot(ctx);
  switch (base) {
    case "dashboard": return dashboard(ctx, snap);
    case "kpi_geral": return kpiGeral(ctx, snap);
    case "carteira_ativa": return carteiraAtiva(ctx, snap);
    
    case "emprestimos_atrasados": return emprestimosAtrasados(ctx, snap);
    case "vencimentos_hoje": return vencimentosHoje(ctx, snap);
    case "inadimplencia": return inadimplencia(ctx, snap);
    case "resumo_diario": return resumoDiario(ctx, snap);
    case "resumo_mensal": return resumoMensal(ctx, snap);
    case "top_clientes": return topClientes(ctx, snap);
    case "vencimentos_semana": return vencimentosSemana(ctx, snap);
    case "projecao_mes": return projecaoMes(ctx, snap);
    case "novos_contratos": return novosContratos(ctx, snap);
    
    case "historico_cliente": return historicoCliente(ctx, snap, arg);
    case "alertas": return alertas(ctx, snap);
    default: return renderMenu();
  }
}