import { calculateTotalWithInterest } from "@/hooks/useLoans";

interface LoanLike {
  id: string;
  amount: number;
  interestRate: number;
  installments: number;
  status: string;
  paidInstallments?: number;
  dueDate?: string | null;
}

interface PaymentLike {
  loanId: string;
  amount: number;
  date: string;
  installmentNumber: number;
}

interface ScheduleLike {
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
}

function isInRange(dateStr: string, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

/**
 * Calcula o "Previsto restante" do período (juros previstos das parcelas com
 * vencimento no período). Pagamentos de juros-only (installmentNumber === 0)
 * empurram a parcela seguinte para o próximo vencimento, removendo-a do
 * "Previsto" do período. Para manter o Previsto estável, somamos de volta o
 * valor desses juros pagos no período.
 */
export function computePeriodProfitExpected(
  loans: LoanLike[],
  payments: PaymentLike[],
  schedules: ScheduleLike[],
  range: { start: Date; end: Date }
): number {
  const periodProfitExpected = loans.reduce((sum, loan) => {
    const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalInterest = Math.max(0, totalWithInterest - loan.amount);
    if (totalInterest <= 0) return sum;
    const interestRatio = totalWithInterest > 0 ? 1 - loan.amount / totalWithInterest : 0;

    if (loan.installments >= 2) {
      const interestPerInstallment = totalInterest / loan.installments;
      const loanSchedules = schedules.filter((sc) => sc.loanId === loan.id);
      if (loanSchedules.length > 0) {
        let acc = 0;
        loanSchedules
          .filter((sc) => isInRange(sc.dueDate, range.start, range.end))
          .forEach((sc) => {
            acc += sc.amount * interestRatio;
          });
        return sum + acc;
      }
      if (!loan.dueDate) return sum;
      const baseDate = new Date(loan.dueDate + "T00:00:00");
      if (isNaN(baseDate.getTime())) return sum;
      let acc = 0;
      for (let i = 0; i < loan.installments; i++) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (isInRange(dStr, range.start, range.end)) acc += interestPerInstallment;
      }
      return sum + acc;
    }
    if (loan.dueDate && isInRange(loan.dueDate, range.start, range.end)) {
      return sum + totalInterest;
    }
    return sum;
  }, 0);

  const interestOnlyInPeriod = payments
    .filter((p) => p.installmentNumber === 0 && isInRange(p.date, range.start, range.end))
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  return periodProfitExpected + interestOnlyInPeriod;
}
