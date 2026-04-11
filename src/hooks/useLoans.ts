import { useState, useCallback, useEffect } from "react";
import { Loan, Payment } from "@/types/loan";
import { adjustBalance } from "@/lib/balance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useLoans() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const fetchLoans = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("loans").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) {
      setLoans(data.map((l: any) => ({
        id: l.id, borrowerName: l.borrower_name, borrowerId: l.borrower_id,
        amount: Number(l.amount), interestRate: Number(l.interest_rate),
        interestType: l.interest_type, paymentType: l.payment_type,
        startDate: l.start_date, dueDate: l.due_date, installments: l.installments,
        paidInstallments: l.paid_installments, status: l.status as Loan["status"],
        remainingAmount: l.remaining_amount != null ? Number(l.remaining_amount) : undefined,
        tags: l.tags, notes: l.notes, createdAt: l.created_at,
      })));
    }
  }, [user]);

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("payments").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) {
      setPayments(data.map((p: any) => ({
        id: p.id, loanId: p.loan_id, amount: Number(p.amount), date: p.date,
        installmentNumber: p.installment_number, previousDueDate: p.previous_due_date,
      })));
    }
  }, [user]);

  useEffect(() => { fetchLoans(); fetchPayments(); }, [fetchLoans, fetchPayments]);

  const addLoan = useCallback(async (loan: Omit<Loan, "id"> & { status?: string; paidInstallments?: number }): Promise<string | null> => {
    if (!user) return null;
    const status = (loan.status as Loan["status"]) || "active";
    const tempId = crypto.randomUUID();
    const optimistic: Loan = {
      ...loan, id: tempId, status, paidInstallments: loan.paidInstallments ?? 0,
      createdAt: new Date().toISOString(),
    };
    setLoans((prev) => [optimistic, ...prev]);

    const { data, error } = await supabase.from("loans").insert({
      user_id: user.id, borrower_name: loan.borrowerName, borrower_id: loan.borrowerId,
      amount: loan.amount, interest_rate: loan.interestRate,
      interest_type: loan.interestType || "Mensal", payment_type: loan.paymentType || "Parcelado",
      start_date: loan.startDate, due_date: loan.dueDate, installments: loan.installments,
      paid_installments: loan.paidInstallments ?? 0, status, tags: loan.tags, notes: loan.notes,
      remaining_amount: loan.remainingAmount ?? 0,
    }).select().single();

    if (error) {
      setLoans((prev) => prev.filter((l) => l.id !== tempId));
      return null;
    } else if (data) {
      setLoans((prev) => prev.map((l) => l.id === tempId ? { ...l, id: data.id, createdAt: data.created_at } : l));
      if (status === "paid") {
        const totalReceived = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
        await adjustBalance(totalReceived - loan.amount);
      } else {
        await adjustBalance(-loan.amount);
      }
      return data.id;
    }
    return null;
  }, [user]);

  const addPayment = useCallback(async (loanId: string, paymentDate?: string) => {
    if (!user) return;
    const dateStr = paymentDate || new Date().toISOString().split("T")[0];
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;

    const installmentAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
    const newPaid = loan.paidInstallments + 1;

    await Promise.all([
      supabase.from("payments").insert({
        user_id: user.id, loan_id: loanId, amount: installmentAmount,
        date: dateStr, installment_number: newPaid,
      }),
      supabase.from("loans").update({
        paid_installments: newPaid,
        status: newPaid >= loan.installments ? "paid" : loan.status,
      }).eq("id", loanId),
      adjustBalance(installmentAmount),
    ]);
    await fetchPayments();
    await fetchLoans();
  }, [user, loans, fetchPayments]);

  const addPartialPayment = useCallback(async (loanId: string, amount: number, paymentDate?: string) => {
    if (!user || amount <= 0) return;
    const dateStr = paymentDate || new Date().toISOString().split("T")[0];

    await Promise.all([
      supabase.from("payments").insert({
        user_id: user.id, loan_id: loanId, amount, date: dateStr, installment_number: -1,
      }),
      adjustBalance(amount),
    ]);
    await fetchPayments();
  }, [user, fetchPayments]);

  const addInterestOnlyPayment = useCallback(async (loanId: string, paymentDate?: string) => {
    if (!user) return;
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const dateStr = paymentDate || new Date().toISOString().split("T")[0];
    const interestAmount = loan.amount * (loan.interestRate / 100);
    const currentDue = new Date(loan.dueDate + "T00:00:00");
    currentDue.setMonth(currentDue.getMonth() + 1);
    const newDueDate = currentDue.toISOString().split("T")[0];

    await Promise.all([
      supabase.from("payments").insert({
        user_id: user.id, loan_id: loanId, amount: interestAmount,
        date: dateStr, installment_number: 0, previous_due_date: loan.dueDate,
      }),
      supabase.from("loans").update({ due_date: newDueDate }).eq("id", loanId),
      adjustBalance(interestAmount),
    ]);
    await fetchLoans();
    await fetchPayments();
  }, [user, loans, fetchLoans, fetchPayments]);

  const updateLoan = useCallback(async (id: string, data: Partial<Omit<Loan, "id">>) => {
    // If remainingAmount changed, adjust balance by the difference
    if (data.remainingAmount !== undefined) {
      const oldLoan = loans.find((l) => l.id === id);
      if (oldLoan) {
        const oldRemaining = oldLoan.remainingAmount ?? 0;
        const newRemaining = data.remainingAmount ?? 0;
        const diff = newRemaining - oldRemaining;
        if (diff !== 0) await adjustBalance(-diff);
      }
    }
    setLoans((prev) => prev.map((l) => l.id === id ? { ...l, ...data } : l));
    const updateData: any = {};
    if (data.borrowerName !== undefined) updateData.borrower_name = data.borrowerName;
    if (data.borrowerId !== undefined) updateData.borrower_id = data.borrowerId;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.interestRate !== undefined) updateData.interest_rate = data.interestRate;
    if (data.interestType !== undefined) updateData.interest_type = data.interestType;
    if (data.paymentType !== undefined) updateData.payment_type = data.paymentType;
    if (data.startDate !== undefined) updateData.start_date = data.startDate;
    if (data.dueDate !== undefined) updateData.due_date = data.dueDate;
    if (data.installments !== undefined) updateData.installments = data.installments;
    if (data.paidInstallments !== undefined) updateData.paid_installments = data.paidInstallments;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.remainingAmount !== undefined) updateData.remaining_amount = data.remainingAmount;
    await supabase.from("loans").update(updateData).eq("id", id);
  }, [loans]);

  const deleteLoan = useCallback(async (id: string) => {
    const loan = loans.find((l) => l.id === id);
    const loanPayments = payments.filter((p) => p.loanId === id);
    setLoans((prev) => prev.filter((l) => l.id !== id));
    setPayments((prev) => prev.filter((p) => p.loanId !== id));

    if (loan) await adjustBalance(loan.amount);
    for (const p of loanPayments) await adjustBalance(-p.amount);
    await supabase.from("loans").delete().eq("id", id);
  }, [loans, payments]);

  const deletePayment = useCallback(async (id: string) => {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;

    setPayments((prev) => prev.filter((p) => p.id !== id));

    const loan = loans.find((l) => l.id === payment.loanId);

    // Update remainingAmount: add the payment amount back
    if (loan) {
      const newRemaining = (loan.remainingAmount ?? 0) + payment.amount;
      const loanUpdates: any = { remaining_amount: newRemaining };

      if (payment.installmentNumber > 0) {
        const newPaid = Math.max(0, loan.paidInstallments - 1);
        const newStatus = newPaid < loan.installments ? "active" : loan.status;
        loanUpdates.paid_installments = newPaid;
        loanUpdates.status = newStatus;
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, paidInstallments: newPaid, status: newStatus, remainingAmount: newRemaining,
        } : l));
      } else if (payment.installmentNumber === -1 && loan.status === "paid") {
        loanUpdates.status = "active";
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, status: "active", remainingAmount: newRemaining,
        } : l));
      } else if (payment.installmentNumber === 0 && payment.previousDueDate) {
        loanUpdates.due_date = payment.previousDueDate;
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, dueDate: payment.previousDueDate!, remainingAmount: newRemaining,
        } : l));
      } else {
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, remainingAmount: newRemaining,
        } : l));
      }

      await supabase.from("loans").update(loanUpdates).eq("id", payment.loanId);
    }

    await adjustBalance(-payment.amount);
    await supabase.from("payments").delete().eq("id", id);
  }, [payments, loans]);

  return { loans, payments, addLoan, addPayment, addPartialPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment };
}

export function calculateInstallment(principal: number, monthlyRate: number, months: number): number {
  const r = monthlyRate / 100;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export function calculateTotalWithInterest(principal: number, monthlyRate: number, months: number): number {
  return calculateInstallment(principal, monthlyRate, months) * months;
}
