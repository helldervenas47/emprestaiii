import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";
import type { EditForm } from "./types";

export function getNextDate(base: Date, frequency: string, periods: number): Date {
  const d = new Date(base);
  if (frequency === "Diário") d.setDate(d.getDate() + periods);
  else if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

export function getFirstPendingDate(loan: Loan, schedules: InstallmentSchedule[]): Date {
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextNum = loan.paidInstallments + 1;
  const saved = loanSchedules.find((s) => s.installmentNumber === nextNum);
  if (saved) return new Date(saved.dueDate + "T00:00:00");
  return new Date(loan.dueDate + "T00:00:00");
}

export function getDaysOverdue(loan: Loan, schedules: InstallmentSchedule[] = []): number {
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = getFirstPendingDate(loan, schedules);
  const diff = Math.floor((todayNorm.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export function getLoanCategory(
  loan: Loan,
  payments: Payment[],
  schedules: InstallmentSchedule[] = [],
): "paid" | "paid_interest" | "overdue" | "due_today" | "on_track" {
  if (loan.status === "paid") return "paid";
  const days = getDaysOverdue(loan, schedules);
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (days < 0) {
    if (lastPayment && lastPayment.installmentNumber === 0) return "paid_interest";
    return "on_track";
  }
  if (days === 0) return "due_today";
  if (days > 0) return "overdue";
  return "on_track";
}

export function getInstallmentDueDate(
  loan: Loan,
  installmentNumber: number,
  schedules: InstallmentSchedule[],
) {
  const savedSchedule = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === installmentNumber,
  );
  if (savedSchedule?.dueDate) return savedSchedule.dueDate;
  const firstDue = new Date(loan.dueDate + "T00:00:00");
  return getNextDate(firstDue, loan.interestType || "Mensal", Math.max(0, installmentNumber - 1))
    .toISOString()
    .split("T")[0];
}

export function loanToForm(loan: Loan): EditForm {
  const amt = loan.amount;
  const rate = loan.interestRate;
  const months = loan.installments;
  const interestValue =
    loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : amt * (rate / 100);
  const total = calculateTotalWithInterest(amt, rate, months);
  const remainingForCalc =
    loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : total;
  const paidCount = loan.paidInstallments || 0;
  const remainingInst = Math.max(1, months - paidCount);
  const installmentValue = remainingForCalc / remainingInst;
  const totalPaidCalc = loan.remainingAmount != null ? loan.remainingAmount : total;
  return {
    borrowerName: loan.borrowerName,
    amount: String(amt),
    interestRate: String(rate),
    interestValue: interestValue.toFixed(2),
    installmentValue: installmentValue.toFixed(2),
    installments: String(months),
    paidInstallments: String(loan.paidInstallments),
    startDate: loan.startDate,
    dueDate: loan.dueDate,
    notes: loan.notes || "",
    tags: (loan.tags || []).join(", "),
    interestType: loan.interestType || "Mensal",
    remainingAmount: String(totalPaidCalc),
  };
}

export function getTotalPaid(loan: Loan, payments: Payment[]): number {
  return payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
}
