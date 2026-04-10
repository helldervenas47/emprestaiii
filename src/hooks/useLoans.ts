import { useState, useCallback } from "react";
import { Loan, Payment } from "@/types/loan";
import { adjustBalance } from "@/lib/balance";

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
    // Loan given = money out
    adjustBalance(-loan.amount);
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
      // Payment received = money in
      adjustBalance(installmentAmount);
    }
  }, [loans]);

  const addInterestOnlyPayment = useCallback((loanId: string) => {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;

    const interestAmount = loan.amount * (loan.interestRate / 100);

    const newPayment: Payment = {
      id: crypto.randomUUID(),
      loanId,
      amount: interestAmount,
      date: new Date().toISOString().split("T")[0],
      installmentNumber: 0,
    };
    setPayments((prev) => {
      const updated = [...prev, newPayment];
      saveToStorage(PAYMENTS_KEY, updated);
      return updated;
    });

    // Extend dueDate by 1 month (never change startDate)
    setLoans((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== loanId) return l;
        const currentDue = new Date(l.dueDate + "T00:00:00");
        currentDue.setMonth(currentDue.getMonth() + 1);
        return {
          ...l,
          dueDate: currentDue.toISOString().split("T")[0],
        };
      });
      saveToStorage(LOANS_KEY, updated);
      return updated;
    });

    // Interest received = money in
    adjustBalance(interestAmount);
  }, [loans]);

  const updateLoan = useCallback((id: string, data: Partial<Omit<Loan, "id">>) => {
    setLoans((prev) => {
      const updated = prev.map((l) => (l.id === id ? { ...l, ...data } : l));
      saveToStorage(LOANS_KEY, updated);
      return updated;
    });
  }, []);

  const deleteLoan = useCallback((id: string) => {
    // Reverse the balance impact: loan amount was subtracted, add it back
    const loan = loans.find((l) => l.id === id);
    if (loan) {
      adjustBalance(loan.amount);
    }
    // Also reverse all payments for this loan
    const loanPayments = payments.filter((p) => p.loanId === id);
    loanPayments.forEach((p) => adjustBalance(-p.amount));

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
  }, [loans, payments]);

  const deletePayment = useCallback((id: string) => {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;

    // Reverse balance
    adjustBalance(-payment.amount);

    // If it was a regular installment payment (not interest-only), decrement paidInstallments
    if (payment.installmentNumber > 0) {
      setLoans((prev) => {
        const updated = prev.map((l) => {
          if (l.id !== payment.loanId) return l;
          const newPaid = Math.max(0, l.paidInstallments - 1);
          return {
            ...l,
            paidInstallments: newPaid,
            status: newPaid < l.installments ? "active" as const : l.status,
          };
        });
        saveToStorage(LOANS_KEY, updated);
        return updated;
      });
    }

    setPayments((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage(PAYMENTS_KEY, updated);
      return updated;
    });
  }, [payments]);

  return { loans, payments, addLoan, addPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment };
}

export function calculateInstallment(principal: number, monthlyRate: number, months: number): number {
  const r = monthlyRate / 100;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export function calculateTotalWithInterest(principal: number, monthlyRate: number, months: number): number {
  return calculateInstallment(principal, monthlyRate, months) * months;
}
