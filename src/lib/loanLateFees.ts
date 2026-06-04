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
  const unpaidSchedules = schedules.filter(
    (schedule) => schedule.loanId === loan.id && schedule.installmentNumber > loan.paidInstallments,
  );
  const unpaidSchedulesTotal = unpaidSchedules.reduce((sum, schedule) => sum + schedule.amount, 0);

  // Partial payments are stored with installment_number = -1 and do not decrement
  // the schedule rows. Subtract them so the remaining balance reflects what was
  // actually paid against the pending installments.
  const partialPaidUnattributed = payments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === -1)
    .reduce((sum, p) => sum + p.amount, 0);

  if (loan.installments >= 2 && unpaidSchedulesTotal > 0) {
    return Math.max(0, unpaidSchedulesTotal - partialPaidUnattributed);
  }

  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return loan.remainingAmount;
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