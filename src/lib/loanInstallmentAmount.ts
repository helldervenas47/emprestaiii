import type { Loan } from "@/types/loan";
import type { InstallmentSchedule } from "@/hooks/useLoans";
import { calculateInstallment } from "@/lib/loanLateFees";

/**
 * Retorna o valor da próxima parcela em aberto do contrato.
 * Usado pelas abas Dashboard, Relatório e Empréstimos para calcular
 * "valor em atraso" de forma consistente — sempre apenas o valor da
 * parcela vencida (não o saldo total restante).
 */
export function getInstallmentAmount(loan: Loan, schedules: InstallmentSchedule[]): number {
  // Para parcela única, usar remaining_amount diretamente
  if (loan.installments === 1 && loan.remainingAmount && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }
  // Para parcelado, tentar schedule primeiro (parcela seguinte à última paga)
  const schedule = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === loan.paidInstallments + 1,
  );
  if (schedule) return schedule.amount;
  // Fallback: remainingAmount ou cálculo original
  if (loan.remainingAmount && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }
  return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
}
