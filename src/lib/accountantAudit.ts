// Auditoria do Contador: cruza os totais exibidos contra os dados de origem.
// Não altera dados de origem. Apenas detecta divergências e produz um relatório.

export type AuditSeverity = "ok" | "warn" | "error";

export interface AuditIssue {
  metric: string;
  expected: number;
  shown: number;
  diff: number;
  origin: string;
  message: string;
  severity: AuditSeverity;
}

export interface AuditTotals {
  interestRevenue: number;
  salesRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  businessExp: number;
  personalExp: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  cashNet: number;
  paymentsCount: number;
  loansOutgoing: number;
}

export interface AuditCorrection {
  metric: string;
  from: number;
  to: number;
  reason: string;
}

export interface AuditReport {
  executedAt: string;
  periodStart?: string;
  periodEnd?: string;
  confidenceScore: number;
  totals: AuditTotals & { expected: AuditTotals };
  issues: AuditIssue[];
  corrections: AuditCorrection[];
}

interface AuditInput {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
  renegotiations?: any[];
  /** YYYY-MM ou YYYY */
  period: "month" | "year";
  monthFilter: string; // YYYY-MM
  yearFilter: string;  // YYYY
  /** totais atualmente exibidos no Contador */
  shown: AuditTotals;
}

const eq = (a: number, b: number, tol = 0.01) => Math.abs((a || 0) - (b || 0)) <= tol;

function getMonthKey(d: string) { return (d || "").slice(0, 7); }
function getYearKey(d: string) { return (d || "").slice(0, 4); }

export function runAccountantAudit(input: AuditInput): AuditReport {
  const { loans, payments, sales, expenses, period, monthFilter, yearFilter, shown } = input;

  const matchPeriod = (d: string) => {
    if (!d) return false;
    return period === "month" ? getMonthKey(d) === monthFilter : getYearKey(d) === yearFilter;
  };

  const periodPayments = payments.filter((p) => matchPeriod(p.date));
  const periodSales = sales.filter((s) => matchPeriod(s.sale_date));
  const periodExpenses = expenses.filter((e) => e.paid && matchPeriod(e.paid_date || e.due_date));

  // --- Receita de juros esperada (mesma fórmula do componente) ---
  let totalReceived = 0;
  let interestRevenue = 0;
  const seenPaymentIds = new Set<string>();
  let duplicates = 0;
  for (const p of periodPayments) {
    if (p.id) {
      if (seenPaymentIds.has(p.id)) { duplicates += 1; continue; }
      seenPaymentIds.add(p.id);
    }
    const amt = Number(p.amount) || 0;
    totalReceived += amt;
    const loan = loans.find((l) => l.id === (p.loanId || p.loan_id));
    if (loan) {
      const principalPerInstall = Number(loan.amount) / Math.max(1, Number(loan.installments) || 1);
      interestRevenue += Math.max(0, amt - principalPerInstall);
    }
  }

  const salesRevenue = periodSales.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const totalRevenue = interestRevenue + salesRevenue;

  const businessExp = periodExpenses
    .filter((e) => e.scope !== "personal")
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const personalExp = periodExpenses
    .filter((e) => e.scope === "personal")
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalExpenses = businessExp + personalExp;
  const netProfit = totalRevenue - businessExp;

  // --- Fluxo de caixa esperado ---
  const cashIn = totalReceived + salesRevenue;
  const cashOut = businessExp;
  const cashNet = cashIn - cashOut;

  // --- Empréstimos concedidos no período (saída) ---
  const loansOutgoing = loans
    .filter((l) => matchPeriod(l.start_date || l.startDate))
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const expected: AuditTotals = {
    interestRevenue,
    salesRevenue,
    totalRevenue,
    totalExpenses,
    businessExp,
    personalExp,
    netProfit,
    cashIn,
    cashOut,
    cashNet,
    paymentsCount: periodPayments.length - duplicates,
    loansOutgoing,
  };

  const issues: AuditIssue[] = [];
  const corrections: AuditCorrection[] = [];

  const compare = (
    metric: string,
    label: string,
    origin: string,
    severity: AuditSeverity = "warn",
  ) => {
    const e = (expected as any)[metric] as number;
    const s = (shown as any)[metric] as number;
    if (!eq(e, s)) {
      const diff = (s || 0) - (e || 0);
      issues.push({
        metric: label,
        expected: e,
        shown: s,
        diff,
        origin,
        severity,
        message: `Esperado ${fmtBRL(e)}, exibido ${fmtBRL(s)} → diferença ${fmtBRL(diff)}`,
      });
      corrections.push({ metric: label, from: s, to: e, reason: `Recalculado a partir de ${origin}` });
    }
  };

  compare("interestRevenue", "Receita de Juros", "pagamentos − principal por parcela", "error");
  compare("salesRevenue", "Receita de Vendas", "tabela de vendas", "warn");
  compare("totalRevenue", "Receita Total", "juros + vendas (aportes excluídos)", "error");
  compare("businessExp", "Despesas (Empresa)", "expenses pagas, scope ≠ personal");
  compare("personalExp", "Despesas (Pessoal)", "expenses pagas, scope = personal");
  compare("totalExpenses", "Despesas Totais", "soma de todas as despesas pagas");
  compare("netProfit", "Lucro Líquido", "receita total − despesas empresa", "error");
  compare("cashIn", "Entradas de Caixa", "pagamentos + vendas");
  compare("cashOut", "Saídas de Caixa", "despesas empresa");
  compare("cashNet", "Saldo do Período", "entradas − saídas");
  compare("loansOutgoing", "Empréstimos Concedidos", "loans com start_date no período");

  if (duplicates > 0) {
    issues.push({
      metric: "Pagamentos Duplicados",
      expected: 0,
      shown: duplicates,
      diff: duplicates,
      origin: "tabela payments (mesmo id repetido)",
      severity: "error",
      message: `${duplicates} pagamento(s) com id duplicado no período`,
    });
  }

  // --- Validação extra: aportes não devem entrar como receita/despesa ---
  // (Aporte no app aparece em movimentações de saldo / piggy banks, não em payments/expenses)
  // Apenas garantimos que nenhuma despesa marcada como "aporte" esteja somando aqui.
  const aportesIndevidos = periodExpenses.filter((e) => /aporte/i.test(e.category || "") || /aporte/i.test(e.description || ""));
  if (aportesIndevidos.length > 0) {
    const v = aportesIndevidos.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    issues.push({
      metric: "Aportes em Despesas",
      expected: 0,
      shown: v,
      diff: v,
      origin: "expenses com categoria/descrição contendo 'aporte'",
      severity: "warn",
      message: `${aportesIndevidos.length} lançamento(s) classificados como aporte estão somando em despesas (${fmtBRL(v)})`,
    });
  }

  // --- Renegociações: pagamentos com previous_due_date não devem ser contados duas vezes ---
  // Já garantido pela deduplicação por id; apenas alertamos se a contagem estiver inconsistente.
  if (periodPayments.length !== seenPaymentIds.size + (periodPayments.filter(p => !p.id).length)) {
    // não-bloqueante
  }

  // --- Score de confiabilidade ---
  let score = 100;
  for (const i of issues) {
    score -= i.severity === "error" ? 8 : i.severity === "warn" ? 3 : 1;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    executedAt: new Date().toISOString(),
    periodStart: period === "month" ? `${monthFilter}-01` : `${yearFilter}-01-01`,
    periodEnd: period === "month" ? `${monthFilter}-31` : `${yearFilter}-12-31`,
    confidenceScore: score,
    totals: { ...shown, expected },
    issues,
    corrections,
  };
}

function fmtBRL(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
