import { Client, ClientFinancialProfile, InstallmentSchedule, Loan, Payment } from "@/types/loan";

export interface RiskProfile {
  score: number;
  level: "baixo" | "moderado" | "alto" | "critico";
  label: string;
  badgeClassName: string;
  reasons: string[];
  internalScore?: number;
  externalScore?: number | null;
  positiveFactors?: string[];
  negativeFactors?: string[];
}

export interface ClientRiskMetrics {
  totalLent: number;
  overdueLoans: number;
  severeOverdueLoans: number;
  paidLoans: number;
  activeLoans: number;
  onTimePayments: number;
  latePayments: number;
  partialPayments: number;
  totalTimedPayments: number;
  onTimeRatio: number;
  lateRatio: number;
}

export interface ClientRiskHistoryPoint {
  month: string;
  label: string;
  score: number;
  latePayments: number;
  onTimePayments: number;
  overdueLoans: number;
  totalLent: number;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatRiskCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function normalizeClientKey(value?: string | null) {
  return (value || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getLoanClientKey(loan: Loan) {
  return loan.borrowerId || normalizeClientKey(loan.borrowerName);
}

function getNextDate(base: Date, frequency: string, periods: number) {
  const d = new Date(base);
  if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

function getFirstPendingDate(loan: Loan, schedules: InstallmentSchedule[]) {
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextNum = loan.paidInstallments + 1;
  const saved = loanSchedules.find((s) => s.installmentNumber === nextNum);
  if (saved) return new Date(saved.dueDate + "T00:00:00");
  return new Date(loan.dueDate + "T00:00:00");
}

export function getDaysOverdue(loan: Loan, schedules: InstallmentSchedule[] = [], referenceDate = new Date()) {
  const todayNorm = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const due = getFirstPendingDate(loan, schedules);
  return Math.floor((todayNorm.getTime() - due.getTime()) / 86400000);
}

function getLoanCategory(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[] = [], referenceDate = new Date()) {
  if (loan.status === "paid") return "paid" as const;
  const days = getDaysOverdue(loan, schedules, referenceDate);
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (days < 0) return lastPayment && lastPayment.installmentNumber === 0 ? "paid_interest" as const : "on_track" as const;
  if (days === 0) return "due_today" as const;
  if (days > 0) return "overdue" as const;
  return "on_track" as const;
}

export function getInstallmentDueDate(loan: Loan, installmentNumber: number, schedules: InstallmentSchedule[]) {
  const savedSchedule = schedules.find((s) => s.loanId === loan.id && s.installmentNumber === installmentNumber);
  if (savedSchedule?.dueDate) return savedSchedule.dueDate;
  const firstDue = new Date(loan.dueDate + "T00:00:00");
  return getNextDate(firstDue, loan.interestType || "Mensal", Math.max(0, installmentNumber - 1)).toISOString().split("T")[0];
}

export function getClientLoans(client: Client, loans: Loan[]) {
  const fallbackKey = normalizeClientKey(client.name);
  return loans.filter((loan) => loan.borrowerId === client.id || (!loan.borrowerId && normalizeClientKey(loan.borrowerName) === fallbackKey));
}

export function getClientRiskMetrics(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], referenceDate = new Date()): ClientRiskMetrics {
  const clientLoans = getClientLoans(client, loans).filter((loan) => loan.startDate <= referenceDate.toISOString().split("T")[0]);
  const allowedPayments = payments.filter((payment) => payment.date <= referenceDate.toISOString().split("T")[0]);
  const totalLent = clientLoans.reduce((sum, loan) => sum + loan.amount, 0);
  const overdueLoans = clientLoans.filter((loan) => getLoanCategory(loan, allowedPayments, installmentSchedules, referenceDate) === "overdue");
  const severeOverdueLoans = overdueLoans.filter((loan) => getDaysOverdue(loan, installmentSchedules, referenceDate) >= 30);
  const paidLoans = clientLoans.filter((loan) => loan.status === "paid").length;
  const activeLoans = clientLoans.filter((loan) => loan.status !== "paid").length;

  let onTimePayments = 0;
  let latePayments = 0;
  let partialPayments = 0;

  clientLoans.forEach((loan) => {
    allowedPayments
      .filter((payment) => payment.loanId === loan.id)
      .forEach((payment) => {
        if (payment.installmentNumber < 0) {
          partialPayments += 1;
          return;
        }
        if (payment.installmentNumber <= 0) return;
        const dueDate = getInstallmentDueDate(loan, payment.installmentNumber, installmentSchedules);
        if (payment.date <= dueDate) onTimePayments += 1;
        else latePayments += 1;
      });
  });

  const totalTimedPayments = onTimePayments + latePayments;
  const onTimeRatio = totalTimedPayments > 0 ? onTimePayments / totalTimedPayments : 0;
  const lateRatio = totalTimedPayments > 0 ? latePayments / totalTimedPayments : 0;

  return {
    totalLent,
    overdueLoans: overdueLoans.length,
    severeOverdueLoans: severeOverdueLoans.length,
    paidLoans,
    activeLoans,
    onTimePayments,
    latePayments,
    partialPayments,
    totalTimedPayments,
    onTimeRatio,
    lateRatio,
  };
}

export function buildRiskProfile(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[], referenceDate = new Date()): RiskProfile {
  const metrics = getClientRiskMetrics(client, loans, payments, installmentSchedules, referenceDate);
  const parsedClientScore = Number((client.score || "").replace(/[^\d.]/g, ""));

  let score = 18;
  score += metrics.overdueLoans * 18;
  score += metrics.severeOverdueLoans * 12;
  score += metrics.lateRatio * 28;
  score += Math.min(12, metrics.partialPayments * 4);
  score += metrics.activeLoans >= 3 ? 8 : metrics.activeLoans === 2 ? 4 : 0;
  score += metrics.totalLent >= 50000 ? 15 : metrics.totalLent >= 20000 ? 10 : metrics.totalLent >= 10000 ? 6 : metrics.totalLent >= 5000 ? 3 : 0;
  score -= Math.min(18, metrics.paidLoans * 4);
  score -= metrics.onTimeRatio * 16;

  if (!Number.isNaN(parsedClientScore) && parsedClientScore > 0) {
    if (parsedClientScore < 400) score += 12;
    else if (parsedClientScore < 700) score += 5;
    else if (parsedClientScore >= 850) score -= 8;
    else if (parsedClientScore >= 750) score -= 4;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const reasons: string[] = [];
  if (metrics.overdueLoans > 0) reasons.push(`${metrics.overdueLoans} contrato${metrics.overdueLoans > 1 ? "s" : ""} em atraso`);
  if (metrics.latePayments > 0) reasons.push(`${Math.round(metrics.lateRatio * 100)}% dos pagamentos com atraso`);
  if (metrics.totalLent >= 5000) reasons.push(`${formatRiskCurrency(metrics.totalLent)} já emprestados ao cliente`);
  if (metrics.partialPayments > 0) reasons.push(`${metrics.partialPayments} pagamento${metrics.partialPayments > 1 ? "s" : ""} parcial${metrics.partialPayments > 1 ? "s" : ""}`);
  if (reasons.length === 0 && metrics.paidLoans > 0) reasons.push(`${metrics.paidLoans} contrato${metrics.paidLoans > 1 ? "s" : ""} quitado${metrics.paidLoans > 1 ? "s" : ""} com bom histórico`);
  if (reasons.length === 0) reasons.push("Cliente com histórico inicial e sem sinais fortes de risco.");

  if (score >= 75) return { score, level: "critico", label: "Risco crítico", badgeClassName: "bg-destructive/15 text-destructive border-destructive/30", reasons };
  if (score >= 55) return { score, level: "alto", label: "Risco alto", badgeClassName: "bg-destructive/10 text-destructive border-destructive/20", reasons };
  if (score >= 35) return { score, level: "moderado", label: "Risco moderado", badgeClassName: "bg-warning/10 text-warning border-warning/20", reasons };
  return { score, level: "baixo", label: "Risco baixo", badgeClassName: "bg-success/10 text-success border-success/20", reasons };
}

export function buildConsolidatedRiskProfile(
  client: Client,
  loans: Loan[],
  payments: Payment[],
  installmentSchedules: InstallmentSchedule[],
  financialProfile?: ClientFinancialProfile | null,
  referenceDate = new Date(),
): RiskProfile {
  const internalProfile = buildRiskProfile(client, loans, payments, installmentSchedules, referenceDate);
  const externalScore = financialProfile?.externalScore ?? null;
  const internalScore = financialProfile?.internalScore ?? internalProfile.score;
  const consolidatedScore = financialProfile?.consolidatedScore ?? (
    externalScore == null
      ? internalScore
      : Math.round((internalScore * 0.4) + (externalScore * 0.6))
  );

  const positiveFactors = financialProfile?.positiveFactors?.length
    ? financialProfile.positiveFactors
    : internalProfile.level === "baixo"
      ? ["Histórico interno com poucos sinais de atraso."]
      : [];

  const negativeFactors = financialProfile?.negativeFactors?.length
    ? financialProfile.negativeFactors
    : internalProfile.reasons;

  const baseReasons = [...negativeFactors];
  if (financialProfile?.monthlyIncome && financialProfile?.debtLevel != null) {
    const debtCommitment = financialProfile.monthlyIncome > 0
      ? Math.round((financialProfile.debtLevel / financialProfile.monthlyIncome) * 100)
      : null;
    if (debtCommitment != null) {
      baseReasons.unshift(`Comprometimento de renda estimado em ${debtCommitment}%.`);
    }
  }
  if (financialProfile?.employmentStability) {
    baseReasons.push(`Estabilidade profissional: ${financialProfile.employmentStability}.`);
  }
  if (financialProfile?.bankingRelationship) {
    baseReasons.push(`Relacionamento bancário: ${financialProfile.bankingRelationship}.`);
  }

  let level: RiskProfile["level"] = internalProfile.level;
  let label = internalProfile.label;
  let badgeClassName = internalProfile.badgeClassName;

  if (consolidatedScore >= 75) {
    level = "critico";
    label = "Risco crítico";
    badgeClassName = "bg-destructive/15 text-destructive border-destructive/30";
  } else if (consolidatedScore >= 55) {
    level = "alto";
    label = "Risco alto";
    badgeClassName = "bg-destructive/10 text-destructive border-destructive/20";
  } else if (consolidatedScore >= 35) {
    level = "moderado";
    label = "Risco moderado";
    badgeClassName = "bg-warning/10 text-warning border-warning/20";
  } else {
    level = "baixo";
    label = "Risco baixo";
    badgeClassName = "bg-success/10 text-success border-success/20";
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(consolidatedScore))),
    level,
    label,
    badgeClassName,
    reasons: Array.from(new Set(baseReasons)).slice(0, 6),
    internalScore,
    externalScore,
    positiveFactors,
    negativeFactors,
  };
}

export function buildClientRiskHistory(client: Client, loans: Loan[], payments: Payment[], installmentSchedules: InstallmentSchedule[]): ClientRiskHistoryPoint[] {
  const clientLoans = getClientLoans(client, loans).sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (clientLoans.length === 0) return [];

  const firstDate = new Date(clientLoans[0].startDate + "T00:00:00");
  const current = new Date();
  const points: ClientRiskHistoryPoint[] = [];
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

  while (cursor <= current) {
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const profile = buildRiskProfile(client, loans, payments, installmentSchedules, monthEnd);
    const metrics = getClientRiskMetrics(client, loans, payments, installmentSchedules, monthEnd);
    const month = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    points.push({
      month,
      label: cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      score: profile.score,
      latePayments: metrics.latePayments,
      onTimePayments: metrics.onTimePayments,
      overdueLoans: metrics.overdueLoans,
      totalLent: metrics.totalLent,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return points;
}