import { Loan, Payment } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";

/**
 * Calcula a taxa de juros MENSAL (%) de um único empréstimo, normalizada para base mensal.
 *
 * Parcela única (installments <= 1):
 *   taxa_mensal = (juros_total / valor_emprestado) / max(1, meses_de_prazo)
 *   meses_de_prazo é estimado por (dueDate - startDate) em meses; mínimo 1.
 *
 * Parcelado (installments >= 2):
 *   - Se existir taxa contratada (interestRate > 0), usa diretamente como taxa_mensal.
 *   - Caso contrário, calcula a TIR mensal a partir do fluxo de caixa
 *     (-amount em t=0, parcelas iguais em t=1..n).
 */
export function loanMonthlyRate(loan: Loan): number | null {
  const amount = Number(loan.amount) || 0;
  if (amount <= 0) return null;
  const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalInterest = Math.max(0, totalWithInterest - amount);

  if ((loan.installments ?? 1) <= 1) {
    const months = monthsBetween(loan.startDate, loan.dueDate);
    const periods = Math.max(1, months);
    return (totalInterest / amount) / periods * 100;
  }

  // Parcelado
  if (loan.interestRate && loan.interestRate > 0) {
    return loan.interestRate;
  }

  const installmentValue = totalWithInterest / loan.installments;
  const irr = computeIRR(amount, installmentValue, loan.installments);
  return irr !== null ? irr * 100 : null;
}

function monthsBetween(startStr?: string, endStr?: string): number {
  if (!startStr || !endStr) return 1;
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  const diffMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  return Math.max(1, diffMonths);
}

/**
 * TIR mensal por bisseção: resolve amount = sum_{t=1..n} pmt / (1+r)^t
 */
function computeIRR(amount: number, pmt: number, n: number): number | null {
  if (amount <= 0 || pmt <= 0 || n <= 0) return null;
  const npv = (r: number) => {
    let s = 0;
    for (let t = 1; t <= n; t++) s += pmt / Math.pow(1 + r, t);
    return s - amount;
  };
  let lo = 0;
  let hi = 1; // 100% ao mês
  if (npv(lo) < 0) return 0;
  let fHi = npv(hi);
  let guard = 0;
  while (fHi > 0 && guard < 60) {
    hi *= 2;
    fHi = npv(hi);
    guard++;
  }
  if (fHi > 0) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1e-7) return mid;
    if (f > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface SplitRateBucket {
  weightedRate: number | null;
  totalLent: number;
  loanCount: number;
}

export interface SplitRateResult {
  single: SplitRateBucket;
  installment: SplitRateBucket;
}

/**
 * Agrega taxa média (ponderada pelo valor emprestado) de empréstimos cujo
 * vencimento esteja no intervalo informado, separando parcela única e parcelados.
 * Inclui empréstimos quitados.
 */
export function calculateSplitMonthlyRates(
  loans: Loan[],
  range: { start: Date; end: Date }
): SplitRateResult {
  const single: SplitRateBucket = { weightedRate: null, totalLent: 0, loanCount: 0 };
  const installment: SplitRateBucket = { weightedRate: null, totalLent: 0, loanCount: 0 };
  let singleNum = 0;
  let installmentNum = 0;

  loans.forEach((loan) => {
    if (!loan.dueDate) return;
    const due = new Date(loan.dueDate + "T00:00:00");
    if (isNaN(due.getTime())) return;
    if (due < range.start || due > range.end) return;
    const rate = loanMonthlyRate(loan);
    if (rate === null || !Number.isFinite(rate)) return;
    const amount = Number(loan.amount) || 0;
    if (amount <= 0) return;
    if ((loan.installments ?? 1) <= 1) {
      single.totalLent += amount;
      single.loanCount += 1;
      singleNum += amount * rate;
    } else {
      installment.totalLent += amount;
      installment.loanCount += 1;
      installmentNum += amount * rate;
    }
  });

  if (single.totalLent > 0) single.weightedRate = singleNum / single.totalLent;
  if (installment.totalLent > 0) installment.weightedRate = installmentNum / installment.totalLent;
  return { single, installment };
}
