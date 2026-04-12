import { useState, useCallback, useEffect } from "react";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { adjustBalance } from "@/lib/balance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useLoans() {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installmentSchedules, setInstallmentSchedules] = useState<InstallmentSchedule[]>([]);

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
        customInstallmentValue: l.custom_installment_value != null ? Number(l.custom_installment_value) : null,
        customInterestValue: l.custom_interest_value != null ? Number(l.custom_interest_value) : null,
        tags: l.tags, notes: l.notes, createdAt: l.created_at,
        lateInterestType: l.late_interest_type, lateInterestValue: l.late_interest_value != null ? Number(l.late_interest_value) : null,
        penaltyValue: l.penalty_value != null ? Number(l.penalty_value) : null,
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

  const fetchSchedules = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("loan_installments").select("*").eq("user_id", user.id)
      .order("installment_number", { ascending: true });
    if (data) {
      setInstallmentSchedules(data.map((s: any) => ({
        id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number,
        dueDate: s.due_date, amount: Number(s.amount),
      })));
    }
  }, [user]);

  useEffect(() => { fetchLoans(); fetchPayments(); fetchSchedules(); }, [fetchLoans, fetchPayments, fetchSchedules]);

  const saveSchedule = useCallback(async (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => {
    if (!user) return;
    // Delete existing schedule for this loan then insert new
    await supabase.from("loan_installments").delete().eq("loan_id", loanId);
    if (rows.length > 0) {
      await supabase.from("loan_installments").insert(
        rows.map((r) => ({
          user_id: user.id,
          loan_id: loanId,
          installment_number: r.installmentNumber,
          due_date: r.dueDate,
          amount: r.amount,
        }))
      );
    }
    await fetchSchedules();
  }, [user, fetchSchedules]);

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
      custom_interest_value: loan.customInterestValue ?? null,
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

    const remaining = getLoanRemainingAmount(loan, payments);
    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const calculatedInstallment = remaining / remainingInstallments;
    const installmentAmount = loan.customInstallmentValue != null && loan.customInstallmentValue > 0
      ? loan.customInstallmentValue
      : calculatedInstallment;
    const newPaid = loan.paidInstallments + 1;
    const newRemaining = Math.max(0, remaining - installmentAmount);

    await Promise.all([
      supabase.from("payments").insert({
        user_id: user.id, loan_id: loanId, amount: installmentAmount,
        date: dateStr, installment_number: newPaid,
      }),
      supabase.from("loans").update({
        paid_installments: newPaid,
        status: newPaid >= loan.installments ? "paid" : loan.status,
        remaining_amount: newRemaining,
      }).eq("id", loanId),
      adjustBalance(installmentAmount),
    ]);
    await fetchPayments();
    await fetchLoans();
  }, [user, loans, payments, fetchLoans, fetchPayments]);

  const addPartialPayment = useCallback(async (loanId: string, amount: number, paymentDate?: string) => {
    if (!user || amount <= 0) return;
    const dateStr = paymentDate || new Date().toISOString().split("T")[0];
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const newRemaining = Math.max(0, getLoanRemainingAmount(loan, payments) - amount);

    await Promise.all([
      supabase.from("payments").insert({
        user_id: user.id, loan_id: loanId, amount, date: dateStr, installment_number: -1,
      }),
      supabase.from("loans").update({
        remaining_amount: newRemaining,
      }).eq("id", loanId),
      adjustBalance(amount),
    ]);
    await fetchPayments();
    await fetchLoans();
  }, [user, loans, payments, fetchLoans, fetchPayments]);

  const addInterestOnlyPayment = useCallback(async (loanId: string, paymentDate?: string) => {
    if (!user) return;
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const dateStr = paymentDate || new Date().toISOString().split("T")[0];
    const interestAmount = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
    const currentDue = new Date(loan.dueDate + "T00:00:00");
    const freq = loan.interestType || "Mensal";
    if (freq === "Semanal") currentDue.setDate(currentDue.getDate() + 7);
    else if (freq === "Quinzenal") currentDue.setDate(currentDue.getDate() + 15);
    else currentDue.setMonth(currentDue.getMonth() + 1);
    const newDueDate = currentDue.toISOString().split("T")[0];
    const newRemaining = Math.max(0, getLoanRemainingAmount(loan, payments) - interestAmount);

    // Also update any saved installment schedule for the next pending installment
    const nextNum = loan.paidInstallments + 1;
    const scheduleUpdate = supabase.from("loan_installments")
      .update({ due_date: newDueDate })
      .eq("loan_id", loanId)
      .eq("installment_number", nextNum);

    await Promise.all([
      supabase.from("payments").insert({
        user_id: user.id, loan_id: loanId, amount: interestAmount,
        date: dateStr, installment_number: 0, previous_due_date: loan.dueDate,
      }),
      supabase.from("loans").update({ due_date: newDueDate, remaining_amount: newRemaining }).eq("id", loanId),
      scheduleUpdate,
      adjustBalance(interestAmount),
    ]);
    await fetchLoans();
    await fetchPayments();
    await fetchSchedules();
  }, [user, loans, payments, fetchLoans, fetchPayments]);

  const updateLoan = useCallback(async (id: string, data: Partial<Omit<Loan, "id">>) => {
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
    if (data.customInstallmentValue !== undefined) updateData.custom_installment_value = data.customInstallmentValue;
    if (data.customInterestValue !== undefined) updateData.custom_interest_value = data.customInterestValue;
    if (data.lateInterestType !== undefined) updateData.late_interest_type = data.lateInterestType;
    if (data.lateInterestValue !== undefined) updateData.late_interest_value = data.lateInterestValue;
    if (data.penaltyValue !== undefined) updateData.penalty_value = data.penaltyValue;
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
        // Also restore the installment schedule date
        const nextNum = loan.paidInstallments + 1;
        await supabase.from("loan_installments")
          .update({ due_date: payment.previousDueDate })
          .eq("loan_id", payment.loanId)
          .eq("installment_number", nextNum);
      } else {
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, remainingAmount: newRemaining,
        } : l));
      }

      await supabase.from("loans").update(loanUpdates).eq("id", payment.loanId);
    }

    await adjustBalance(-payment.amount);
    await supabase.from("payments").delete().eq("id", id);
    await fetchSchedules();
  }, [payments, loans, fetchSchedules]);

  return { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment, saveSchedule };
}

export function calculateInstallment(principal: number, monthlyRate: number, months: number): number {
  const r = monthlyRate / 100;
  if (r === 0) return principal / months;
  return (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
}

export function calculateTotalWithInterest(principal: number, monthlyRate: number, months: number): number {
  return calculateInstallment(principal, monthlyRate, months) * months;
}

export function getLoanRemainingAmount(loan: Loan, payments: Payment[]): number {
  const totalExpected = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((sum, p) => sum + p.amount, 0);

  if (loan.remainingAmount == null) {
    return Math.max(0, totalExpected - totalPaid);
  }

  const isLegacyDefaultRemaining = Math.abs(loan.remainingAmount - totalExpected) < 0.01;
  if (isLegacyDefaultRemaining) {
    return Math.max(0, totalExpected - totalPaid);
  }

  return Math.max(0, loan.remainingAmount);
}
