import { Loan } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";

export interface MonthlyInterestRateSummary {
  totalLent: number;
  totalToReceive: number;
  rate: number | null;
  hasData: boolean;
}

/**
 * Para contratos "Parcelado", a `interestRate` armazenada representa a taxa
 * total do contrato. Para fins desse card (taxa de juros MENSAL), dividimos
 * pelo número de parcelas para obter a taxa equivalente por mês.
 * Para contratos não parcelados (ex.: somente juros/mensal), a taxa já é mensal.
 */
function loanMonthlyRatePct(loan: Loan): number {
  const rate = Number(loan.interestRate) || 0;
  const isParcelado = (loan.paymentType ?? "Parcelado") === "Parcelado";
  const months = Math.max(1, Number(loan.installments) || 1);
  if (isParcelado && months > 1) return rate / months;
  return rate;
}

export function calculateMonthlyInterestRate(loans: Loan[]): MonthlyInterestRateSummary {
  const totalLent = loans.reduce((sum, loan) => sum + (Number(loan.amount) || 0), 0);
  const totalToReceive = loans.reduce((sum, loan) => {
    return sum + calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  }, 0);

  if (totalLent <= 0) {
    return {
      totalLent,
      totalToReceive,
      rate: null,
      hasData: false,
    };
  }

  // Média ponderada da taxa mensal pelo valor emprestado
  const weightedRate = loans.reduce((sum, loan) => {
    const principal = Number(loan.amount) || 0;
    return sum + loanMonthlyRatePct(loan) * principal;
  }, 0) / totalLent;

  return {
    totalLent,
    totalToReceive,
    rate: weightedRate,
    hasData: true,
  };
}