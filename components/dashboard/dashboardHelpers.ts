import { todayInAppTz } from "@/lib/timezone";
import { calculateTotalWithInterest } from "@/hooks/useLoans";
import { getOverdueAmount, getOverdueInstallments } from "@/lib/loanInstallmentAmount";
import { calculateMonthlyInterestRate } from "@/lib/monthlyInterestRate";
import type { Loan, Sale, Payment, InstallmentSchedule } from "@/types/loan";

export type Period = "day" | "week" | "month";

export const periodLabels: Record<Period, string> = { day: "Dia", week: "Semana", month: "Mês" };

export const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function isInRange(dateStr: string, start: Date, end: Date): boolean {
  const date = new Date(dateStr + "T00:00:00");
  return date >= start && date <= end;
}

export function getRange(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "day") {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start: d, end, label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) };
  }
  if (period === "week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + offset * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return {
      start: weekStart, end: weekEnd,
      label: `${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${weekEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`,
    };
  }
  const m = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: m, end: mEnd, label: `${monthNames[m.getMonth()]} ${m.getFullYear()}` };
}

export function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function formatDelta(value: number | null, suffix = "%") {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

export function getSaleReceivedAmount(sale: Sale) {
  let received = 0;
  if (sale.installmentAmounts && sale.installmentAmounts.length > 0) {
    for (let i = 0; i < sale.paidInstallments; i++) received += sale.installmentAmounts[i] || 0;
  } else if (sale.installmentValue) {
    received = sale.paidInstallments * sale.installmentValue;
  } else if (sale.installments > 0) {
    received = sale.paidInstallments * (sale.total / sale.installments);
  }
  return received + (sale.partialPaid || 0);
}

export function getClientKey(loan: Loan) {
  return loan.borrowerId || loan.borrowerName.trim().toLocaleLowerCase("pt-BR");
}

export function calculateRealizedProfitForRange(loans: Loan[], payments: Payment[], start: Date, end: Date) {
  const paymentsInPeriod = payments.filter((p) => isInRange(p.date, start, end));
  const quitadoLoanIds = new Set<string>();

  loans.forEach((loan) => {
    if (loan.status !== "paid") return;
    const loanPays = payments.filter((payment) => payment.loanId === loan.id);
    if (loanPays.length === 0) return;
    const lastPayDate = loanPays.reduce((max, payment) => payment.date > max ? payment.date : max, loanPays[0].date);
    if (isInRange(lastPayDate, start, end)) quitadoLoanIds.add(loan.id);
  });

  const interestOnlyProfit = paymentsInPeriod
    .filter((payment) => payment.installmentNumber === 0 && !quitadoLoanIds.has(payment.loanId))
    .reduce((sum, payment) => sum + payment.amount, 0);

  const quitadoProfit = Array.from(quitadoLoanIds).reduce((sum, loanId) => {
    const loan = loans.find((item) => item.id === loanId);
    if (!loan) return sum;
    const totalPaid = payments.filter((payment) => payment.loanId === loanId).reduce((acc, payment) => acc + payment.amount, 0);
    return sum + Math.max(0, totalPaid - loan.amount);
  }, 0);

  const activeInstallmentProfit = paymentsInPeriod
    .filter((payment) => payment.installmentNumber !== 0 && !quitadoLoanIds.has(payment.loanId))
    .reduce((sum, payment) => {
      const loan = loans.find((item) => item.id === payment.loanId);
      if (!loan) return sum;
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      return sum + (payment.amount * interestRatio);
    }, 0);

  return interestOnlyProfit + quitadoProfit + activeInstallmentProfit;
}

export function summarizeMonthMetrics(
  loans: Loan[],
  sales: Sale[],
  payments: Payment[],
  includeSales: boolean,
  start: Date,
  end: Date,
  installmentSchedules: InstallmentSchedule[] = [],
) {
  const monthPayments = payments.filter((payment) => isInRange(payment.date, start, end));
  const monthSales = sales.filter((sale) => isInRange(sale.date, start, end));
  const monthLoans = loans.filter((loan) => isInRange(loan.startDate, start, end));
  const activeLoans = loans.filter((loan) => loan.status !== "paid");
  const revenue = monthPayments.reduce((sum, payment) => sum + payment.amount, 0)
    + (includeSales ? monthSales.reduce((sum, sale) => sum + getSaleReceivedAmount(sale), 0) : 0);
  const serviceVolume = monthPayments.length + (includeSales ? monthSales.length : 0);
  const ticketAverage = serviceVolume > 0 ? revenue / serviceVolume : 0;
  const clientRevenue = new Map<string, number>();

  monthPayments.forEach((payment) => {
    const loan = loans.find((item) => item.id === payment.loanId);
    const key = loan ? getClientKey(loan) : payment.loanId;
    clientRevenue.set(key, (clientRevenue.get(key) ?? 0) + payment.amount);
  });

  if (includeSales) {
    monthSales.forEach((sale) => {
      const key = sale.customerName.trim().toLocaleLowerCase("pt-BR");
      clientRevenue.set(key, (clientRevenue.get(key) ?? 0) + getSaleReceivedAmount(sale));
    });
  }

  const overdueBase = activeLoans.filter((loan) => isInRange(loan.dueDate, start, end));
  const todayStr = todayInAppTz();
  const overdueLoans = overdueBase.filter((loan) => getOverdueInstallments(loan, installmentSchedules, todayStr).length > 0);
  const overdueAmount = overdueLoans.reduce((sum, loan) => sum + getOverdueAmount(loan, installmentSchedules, todayStr), 0);
  const overdueRate = overdueBase.length > 0 ? overdueLoans.length / overdueBase.length : 0;
  const top3Share = revenue > 0
    ? Array.from(clientRevenue.values()).sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) / revenue
    : 0;

  return {
    revenue,
    profit: calculateRealizedProfitForRange(loans, payments, start, end),
    interestRate: calculateMonthlyInterestRate(monthLoans).rate,
    serviceVolume,
    ticketAverage,
    overdueRate,
    overdueAmount,
    top3Share,
  };
}
