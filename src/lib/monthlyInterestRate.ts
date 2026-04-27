import { Loan } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";

export interface MonthlyInterestRateSummary {
  totalLent: number;
  totalToReceive: number;
  rate: number | null;
  hasData: boolean;
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

  return {
    totalLent,
    totalToReceive,
    rate: ((totalToReceive - totalLent) / totalLent) * 100,
    hasData: true,
  };
}