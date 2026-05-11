import type { Loan, InstallmentSchedule } from "@/types/loan";
import { calculateInstallment } from "@/hooks/useLoans";
import { todayInAppTz } from "@/lib/timezone";

/**
 * Retorna o valor da próxima parcela em aberto do contrato (apenas a próxima).
 */
export function getInstallmentAmount(loan: Loan, schedules: InstallmentSchedule[]): number {
  // Para parcela única, usar remaining_amount diretamente
  if (loan.installments === 1 && loan.remainingAmount && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }
  const nextNum = loan.paidInstallments + 1;
  const schedule = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === nextNum,
  );
  if (schedule) {
    // Considera pagamentos parciais já aplicados ao saldo do contrato:
    // saldoParcelaAtual = remainingAmount - somatório das parcelas futuras (> nextNum).
    // Se for menor que o valor nominal da parcela, usa esse saldo.
    if (loan.remainingAmount != null && loan.remainingAmount >= 0) {
      const futureSum = schedules
        .filter((s) => s.loanId === loan.id && s.installmentNumber > nextNum)
        .reduce((acc, s) => acc + Number(s.amount || 0), 0);
      const currentBalance = Math.max(0, Number(loan.remainingAmount) - futureSum);
      return Math.min(currentBalance, Number(schedule.amount));
    }
    return schedule.amount;
  }
  if (loan.remainingAmount && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }
  return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
}

/**
 * Retorna o valor exibido/cobrado para uma parcela específica em aberto.
 * Pagamentos parciais abatem somente a próxima parcela pendente; parcelas futuras
 * preservam o valor original do cronograma.
 */
export function getOpenInstallmentAmount(
  loan: Loan,
  schedules: InstallmentSchedule[],
  installmentNumber: number,
): number {
  const schedule = schedules.find(
    (s) => s.loanId === loan.id && s.installmentNumber === installmentNumber,
  );

  if (installmentNumber === loan.paidInstallments + 1) {
    return getInstallmentAmount(loan, schedules);
  }

  if (schedule) return Number(schedule.amount || 0);

  return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
}

/**
 * Retorna a lista de parcelas vencidas (dueDate < hoje, ainda não pagas).
 * Usado para somar o valor TOTAL em atraso quando há múltiplas parcelas vencidas.
 */
export function getOverdueInstallments(
  loan: Loan,
  schedules: InstallmentSchedule[],
  todayStr: string = todayInAppTz(),
): { installmentNumber: number; dueDate: string; amount: number }[] {
  const paid = loan.paidInstallments || 0;
  // Parcela única: trata como uma única parcela vencida se dueDate < hoje
  if (loan.installments === 1) {
    if (loan.dueDate < todayStr && paid < 1) {
      return [{
        installmentNumber: 1,
        dueDate: loan.dueDate,
        amount: loan.remainingAmount && loan.remainingAmount > 0
          ? loan.remainingAmount
          : (loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments)),
      }];
    }
    return [];
  }

  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > paid && s.dueDate < todayStr)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);

  if (loanSchedules.length > 0) {
    const nextNum = paid + 1;
    return loanSchedules.map((s) => ({
      installmentNumber: s.installmentNumber,
      dueDate: s.dueDate,
      amount: s.installmentNumber === nextNum
        ? getInstallmentAmount(loan, schedules)
        : s.amount,
    }));
  }

  // Fallback: somente próxima parcela se vencida
  if (loan.dueDate < todayStr) {
    return [{
      installmentNumber: paid + 1,
      dueDate: loan.dueDate,
      amount: getInstallmentAmount(loan, schedules),
    }];
  }
  return [];
}

/**
 * Soma o valor total em atraso de um contrato (todas as parcelas vencidas).
 */
export function getOverdueAmount(
  loan: Loan,
  schedules: InstallmentSchedule[],
  todayStr: string = todayInAppTz(),
): number {
  return getOverdueInstallments(loan, schedules, todayStr).reduce((s, i) => s + i.amount, 0);
}
