import { useState, useCallback } from "react";
import { Loan, Payment } from "@/types/loan";

const LOANS_KEY = "loans_data";
const PAYMENTS_KEY = "payments_data";

function loadFromStorage<T>(key: string, fallback: T[]): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useLoans() {
  const [loans, setLoans] = useState<Loan[]>(() => loadFromStorage<Loan>(LOANS_KEY, []));
  const [payments, setPayments] = useState<Payment[]>(() => loadFromStorage<Payment>(PAYMENTS_KEY, []));

  const addLoan = useCallback((loan: Omit<Loan, "id" | "status" | "paidInstallments">) => {
    const newLoan: Loan = {
      ...loan,
      id: crypto.randomUUID(),
      status: "active",
      paidInstallments: 0,
    };
    setLoans((prev) => {
      const updated = [...prev, newLoan];
      saveToStorage(LOANS_KEY, updated);
      return updated;
    });
  }, []);

  const addPayment = useCallback((loanId: string) => {
    setLoans((prev) => {
      const updated = prev.map((loan) => {
        if (loan.id !== loanId) return loan;
        const newPaid = loan.paidInstallments + 1;
        return {
          ...loan,
          paidInstallments: newPaid,
          status: newPaid >= loan.installments ? "paid" as const : loan.status,
        };
      });
      saveToStorage(LOANS_KEY, updated);
      return updated;
    });

    const loan = loans.find((l) => l.id === loanId);
    if (loan) {
      const installmentAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
      const newPayment: Payment = {
        id: crypto.randomUUID(),
        loanId,
        amount: installmentAmount,
        date: new Date().toISOString().split("T")[0],
        installmentNumber: loan.paidInstallments + 1,
      };
      setPayments((prev) => {
        const updated = [...prev, newPayment];
        saveToStorage(PAYMENTS_KEY, updated);
        return updated;
      });
    }
  }, [loans]);

  const addInterestOnlyPayment = useCallback((loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;

    const interestAmount = loan.amount * (loan.interestRate / 100);

    // Record the interest-only payment
    const newPayment: Payment = {
      id: crypto.randomUUID(),
      loanId,
      amount: interestAmount,
      date: new Date().toISOString().split("T")[0],
      installmentNumber: 0, // 0 indicates interest-only
    };
    setPayments((prev) => {
      const updated = [...prev, newPayment];
      saveToStorage(PAYMENTS_KEY, updated);
      return updated;
    });

    // Recalculate: extend startDate by 1 month, recalculate dueDate
    setLoans((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== loanId) return l;
        const newStart = new Date(l.startDate + "T00:00:00");
        newStart.setMonth(newStart.getMonth() + 1);
        const newDue = new Date(newStart);
        const remainingInstallments = l.installments - l.paidInstallments;
        newDue.setMonth(newDue.getMonth() + remainingInstallments);
        return {
          ...l,
          startDate: newStart.toISOString().split("T")[0],
          dueDate: newDue.toISOString().split("T")[0],
        };
      });
      saveToStorage(LOANS_KEY, updated);
      return updated;
    });
  }, [loans]);

  const deleteLoan = useCallback((id: string) => {
    setLoans((prev) => {
      const updated = prev.filter((l) => l.id !== id);
      saveToStorage(LOANS_KEY, updated);
      return updated;
    });
    setPayments((prev) => {
      const updated = prev.filter((p) => p.loanId !== id);
      saveToStorage(PAYMENTS_KEY, updated);
      return updated;
    });
  }, []);

  return { loans, payments, addLoan, addPayment, addInterestOnlyPayment, deleteLoan };
}

export function calculateInstallment(principal: number, monthlyRate: number, months: number): number {
  const r = monthlyRate / 100;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export function calculateTotalWithInterest(principal: number, monthlyRate: number, months: number): number {
  return calculateInstallment(principal, monthlyRate, months) * months;
}
