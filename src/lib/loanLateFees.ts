import { todayInAppTz } from "@/lib/timezone";
import type { InstallmentSchedule, Loan, Payment } from "@/types/loan";

function calculateTotalWithInterest(principal: number, rate: number) {
  return Math.round(principal * (1 + rate / 100));
}

function getFirstPendingDueDate(loan: Loan, schedules: InstallmentSchedule[]) {
  const nextInstallmentNumber = loan.paidInstallments + 1;
  const nextSchedule = schedules.find(
    (schedule) => schedule.loanId === loan.id && schedule.installmentNumber === nextInstallmentNumber,
  );

  return nextSchedule?.dueDate ?? loan.dueDate;
}

export function getBaseRemainingAmount(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[]) {
  // Fonte de verdade alinhada ao card por contrato (LoanList): prioriza loan.remainingAmount
  // quando preenchido. Cai para a soma de schedules pendentes apenas como fallback.
  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }

  const unpaidSchedules = schedules.filter(
    (schedule) => schedule.loanId === loan.id && schedule.installmentNumber > loan.paidInstallments,
  );
  const unpaidSchedulesTotal = unpaidSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);

  if (loan.installments >= 2 && unpaidSchedulesTotal > 0) {
    return unpaidSchedulesTotal;
  }

  const totalExpected = calculateTotalWithInterest(loan.amount, loan.interestRate);
  const totalPaid = payments
    .filter((payment) => payment.loanId === loan.id)
    .reduce((sum, payment) => sum + payment.amount, 0);

  return Math.max(0, totalExpected - totalPaid);
}


export function getLoanLateFees(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[]) {
  if (loan.status === "paid") {
    return { daysOverdue: 0, lateInterestTotal: 0, penaltyTotal: 0, lateFees: 0 };
  }

  const dueDate = getFirstPendingDueDate(loan, schedules);
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date(`${todayInAppTz()}T00:00:00`);
  const daysOverdue = Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));

  if (daysOverdue <= 0) {
    return { daysOverdue: 0, lateInterestTotal: 0, penaltyTotal: 0, lateFees: 0 };
  }

  const baseRemaining = getBaseRemainingAmount(loan, payments, schedules);
  const lateInterestTotal = loan.lateInterestValue != null && loan.lateInterestValue > 0
    ? loan.lateInterestType === "fixed"
      ? loan.lateInterestValue * daysOverdue
      : baseRemaining * (loan.lateInterestValue / 100) * daysOverdue
    : 0;
  const penaltyTotal = loan.penaltyValue != null && loan.penaltyValue > 0 ? loan.penaltyValue : 0;

  return {
    daysOverdue,
    lateInterestTotal,
    penaltyTotal,
    lateFees: lateInterestTotal + penaltyTotal,
  };
}
/**
 * Fórmula única do "Total a Receber" por contrato.
 * Usada tanto pelo card individual (LoanList row) quanto pelo card agregado
 * "Total a Receber" do topo da aba Empréstimos.
 *
 * Regras:
 *  - base = getBaseRemainingAmount (prioriza loan.remainingAmount)
 *  - + multa/juros de atraso (getLoanLateFees)
 *  - + multa de renegociação SOMENTE em contratos de parcela única;
 *    em parcelados ela já está diluída nas próximas parcelas.
 */
export function getLoanReceivable(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[]) {
  if (loan.status === "paid") return 0;
  const base = getBaseRemainingAmount(loan, payments, schedules);
  const fees = getLoanLateFees(loan, payments, schedules);
  const renegPenalty = loan.installments < 2 ? Number(loan.renegotiationPenaltyTotal || 0) : 0;
  return Math.max(0, base + fees.lateFees + renegPenalty);
}
