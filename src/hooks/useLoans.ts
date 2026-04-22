import { useState, useCallback, useEffect } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { adjustBalance, adjustBalanceOffline } from "@/lib/balance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { getLoanLateFees } from "@/lib/loanLateFees";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import {
  cacheRows, getCachedRows, upsertCachedRow, removeCachedRow,
  enqueueMutation, rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";

function rowToLoan(l: any): Loan {
  return {
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
    hasManager: l.has_manager ?? false,
    managerId: l.manager_id ?? null,
    managerCommissionRate: l.manager_commission_rate != null ? Number(l.manager_commission_rate) : 10,
  };
}

function rowToPayment(p: any): Payment {
  return {
    id: p.id, loanId: p.loan_id, amount: Number(p.amount), date: p.date,
    installmentNumber: p.installment_number, previousDueDate: p.previous_due_date,
  };
}

export function useLoans() {
  const { user, dataOwnerId } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installmentSchedules, setInstallmentSchedules] = useState<InstallmentSchedule[]>([]);

  const fetchLoans = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("loans").select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setLoans(data.map(rowToLoan));
        cacheRows("loans", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("loans");
    if (cached.length > 0) {
      setLoans(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToLoan));
    }
  }, [user]);

  const fetchPayments = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("payments").select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setPayments(data.map(rowToPayment));
        cacheRows("payments", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("payments");
    if (cached.length > 0) {
      setPayments(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToPayment));
    }
  }, [user]);

  const fetchSchedules = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("loan_installments").select("*")
        .order("installment_number", { ascending: true });
      if (!error && data) {
        setInstallmentSchedules(data.map((s: any) => ({
          id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number,
          dueDate: s.due_date, amount: Number(s.amount),
        })));
        cacheRows("loan_installments", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("loan_installments");
    if (cached.length > 0) {
      setInstallmentSchedules(cached.map((s: any) => ({
        id: s.id, loanId: s.loan_id, installmentNumber: s.installment_number,
        dueDate: s.due_date, amount: Number(s.amount),
      })));
    }
  }, [user]);

  useEffect(() => { fetchLoans(); fetchPayments(); fetchSchedules(); }, [fetchLoans, fetchPayments, fetchSchedules]);

  // Refetch after offline queue flush
  useEffect(() => {
    const handler = (e: any) => {
      const tables: string[] = e.detail?.tables || [];
      if (tables.includes("loans")) fetchLoans();
      if (tables.includes("payments")) fetchPayments();
      if (tables.includes("loan_installments")) fetchSchedules();
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchLoans, fetchPayments, fetchSchedules]);

  // Realtime subscriptions for auto-refresh
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`loans-realtime-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loans' }, () => { fetchLoans(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { fetchPayments(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_installments' }, () => { fetchSchedules(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchLoans, fetchPayments, fetchSchedules]);

  const saveSchedule = useCallback(async (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => {
    if (!user || !dataOwnerId) {
      console.warn("[saveSchedule] Skipped: missing user or dataOwnerId", { user: !!user, dataOwnerId });
      throw new Error("Usuário não autenticado");
    }
    const { error: delErr } = await supabase.from("loan_installments").delete().eq("loan_id", loanId);
    if (delErr) {
      console.error("[saveSchedule] delete error", delErr);
      throw delErr;
    }
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("loan_installments").insert(
        rows.map((r) => ({
          user_id: dataOwnerId,
          loan_id: loanId,
          installment_number: r.installmentNumber,
          due_date: r.dueDate,
          amount: r.amount,
        }))
      );
      if (insErr) {
        console.error("[saveSchedule] insert error", insErr);
        throw insErr;
      }
    }
    await fetchSchedules();
  }, [user, dataOwnerId, fetchSchedules]);

  const addLoan = useCallback(async (loan: Omit<Loan, "id"> & { status?: string; paidInstallments?: number }): Promise<string | null> => {
    if (!user || !dataOwnerId) return null;

    // Check loan limit based on subscription plan
    const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
    const subEnv = clientToken?.startsWith("test_") ? "sandbox" : "live";
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("product_id, status")
      .eq("user_id", user.id)
      .eq("environment", subEnv)
      .maybeSingle();

    const PLAN_MAX_LOANS: Record<string, number> = {
      basico_plan: 50,
      profissional_plan: 200,
      empresarial_plan: 9999,
    };

    const isSubActive = sub && ["active", "trialing"].includes(sub.status);
    const maxLoans = isSubActive ? (PLAN_MAX_LOANS[sub.product_id] || 50) : 5;
    const activeLoansCount = loans.filter(l => l.status === "active").length;

    if (activeLoansCount >= maxLoans) {
      toast.error(
        isSubActive
          ? `Limite de ${maxLoans} empréstimos ativos atingido no seu plano. Faça upgrade para aumentar.`
          : "Limite de empréstimos atingido. Assine um plano para continuar."
      );
      return null;
    }

    const status = (loan.status as Loan["status"]) || "active";
    const tempId = crypto.randomUUID();
    const optimistic: Loan = {
      ...loan, id: tempId, status, paidInstallments: loan.paidInstallments ?? 0,
      createdAt: new Date().toISOString(),
    };
    setLoans((prev) => [optimistic, ...prev]);

    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, borrower_name: loan.borrowerName, borrower_id: loan.borrowerId,
      amount: loan.amount, interest_rate: loan.interestRate,
      interest_type: loan.interestType || "Mensal", payment_type: loan.paymentType || "Parcelado",
      start_date: loan.startDate, due_date: loan.dueDate, installments: loan.installments,
      paid_installments: loan.paidInstallments ?? 0, status, tags: loan.tags,
      notes: loan.notes != null ? String(loan.notes) : null,
      remaining_amount: loan.remainingAmount ?? 0,
      custom_interest_value: loan.customInterestValue ?? null,
      has_manager: loan.hasManager ?? false,
      manager_id: loan.managerId ?? null,
      manager_commission_rate: loan.managerCommissionRate ?? 10,
    };

    await upsertCachedRow("loans", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "loans", op: "insert", recordId: tempId, payload: insertPayload });
      // Balance adjust will sync next time online via realtime/refresh; skip here
      return tempId;
    }

    const { data, error } = await supabase.from("loans").insert(insertPayload as any).select().single();

    if (error) {
      if (!error.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "loans", op: "insert", recordId: tempId, payload: insertPayload });
        return tempId;
      }
      setLoans((prev) => prev.filter((l) => l.id !== tempId));
      await removeCachedRow("loans", tempId);
      return null;
    } else if (data) {
      setLoans((prev) => prev.map((l) => l.id === tempId ? { ...l, id: data.id, createdAt: data.created_at } : l));
      await removeCachedRow("loans", tempId);
      await upsertCachedRow("loans", data);
      await rewritePendingRecordId("loans", tempId, data.id);
      if (status === "paid") {
        const totalReceived = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
        await adjustBalance(totalReceived - loan.amount);
      } else {
        await adjustBalance(-loan.amount);
      }
      return data.id;
    }
    return null;
  }, [user, dataOwnerId]);

  const addPayment = useCallback(async (loanId: string, paymentDate?: string) => {
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");

    const remaining = getLoanRemainingAmount(loan, payments);
    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const calculatedInstallment = remaining / remainingInstallments;
    const installmentAmount = loan.customInstallmentValue != null && loan.customInstallmentValue > 0
      ? loan.customInstallmentValue
      : calculatedInstallment;
    const newPaid = loan.paidInstallments + 1;
    const newRemaining = Math.max(0, remaining - installmentAmount);
    const online = isOnline();

    // Calculate next due date from schedule or by frequency
    let nextDueDate = loan.dueDate;
    if (newPaid < loan.installments) {
      const fromSchedule = installmentSchedules.find(
        (s) => s.loanId === loanId && s.installmentNumber === newPaid + 1,
      );
      if (fromSchedule?.dueDate) {
        nextDueDate = fromSchedule.dueDate;
      } else if (online) {
        const { data: nextSchedule } = await supabase
          .from("loan_installments")
          .select("due_date")
          .eq("loan_id", loanId)
          .eq("installment_number", newPaid + 1)
          .maybeSingle();
        if (nextSchedule?.due_date) {
          nextDueDate = nextSchedule.due_date;
        } else {
          nextDueDate = computeNextDueDate(loan.dueDate, loan.interestType || "Mensal", newPaid);
        }
      } else {
        nextDueDate = computeNextDueDate(loan.dueDate, loan.interestType || "Mensal", newPaid);
      }
    }

    const newStatus = newPaid >= loan.installments ? "paid" : loan.status;
    const tempPaymentId = crypto.randomUUID();
    const paymentPayload = {
      id: tempPaymentId,
      user_id: dataOwnerId,
      loan_id: loanId,
      amount: installmentAmount,
      date: dateStr,
      installment_number: newPaid,
    };
    const loanUpdate = {
      paid_installments: newPaid,
      status: newStatus,
      remaining_amount: newRemaining,
      due_date: nextDueDate,
    };

    // Optimistic state
    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: installmentAmount, date: dateStr, installmentNumber: newPaid },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l, paidInstallments: newPaid, status: newStatus as Loan["status"],
      remainingAmount: newRemaining, dueDate: nextDueDate,
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await adjustBalanceOffline(installmentAmount);
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    const { error: paymentError } = await supabase.from("payments").insert(paymentPayload as any);
    if (paymentError) {
      console.error("[addPayment] insert payment failed:", paymentError);
      await revertOptimisticState();
      throw new Error(paymentError.message);
    }

    const { data: updatedLoan, error: loanError } = await supabase
      .from("loans")
      .update(loanUpdate)
      .eq("id", loanId)
      .select("id")
      .maybeSingle();
    if (loanError || !updatedLoan) {
      console.error("[addPayment] update loan failed:", loanError ?? new Error("Nenhum empréstimo foi atualizado"));
      await supabase.from("payments").delete().eq("id", tempPaymentId);
      await revertOptimisticState();
      throw new Error(loanError?.message ?? "Falha ao atualizar o empréstimo");
    }

    try {
      await adjustBalance(installmentAmount);
    } catch (balanceError: any) {
      console.error("[addPayment] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({
          paid_installments: loan.paidInstallments,
          status: loan.status,
          remaining_amount: loan.remainingAmount ?? 0,
          due_date: loan.dueDate,
        }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    await fetchPayments();
    await fetchLoans();
  }, [user, dataOwnerId, loans, payments, installmentSchedules, fetchLoans, fetchPayments]);

  const addPartialPayment = useCallback(async (loanId: string, amount: number, paymentDate?: string) => {
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    if (amount <= 0) throw new Error("Informe um valor de pagamento válido");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const newRemaining = Math.max(0, getLoanRemainingAmount(loan, payments) - amount);
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const paymentPayload = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount, date: dateStr, installment_number: -1,
    };
    const loanUpdate = { remaining_amount: newRemaining };

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount, date: dateStr, installmentNumber: -1 },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? { ...l, remainingAmount: newRemaining } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await adjustBalanceOffline(amount);
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    const { error: paymentError } = await supabase.from("payments").insert(paymentPayload as any);
    if (paymentError) {
      console.error("[addPartialPayment] insert payment failed:", paymentError);
      await revertOptimisticState();
      throw new Error(paymentError.message);
    }

    const { data: updatedLoan, error: loanError } = await supabase
      .from("loans")
      .update(loanUpdate)
      .eq("id", loanId)
      .select("id")
      .maybeSingle();
    if (loanError || !updatedLoan) {
      console.error("[addPartialPayment] update loan failed:", loanError ?? new Error("Nenhum empréstimo foi atualizado"));
      await supabase.from("payments").delete().eq("id", tempPaymentId);
      await revertOptimisticState();
      throw new Error(loanError?.message ?? "Falha ao atualizar o empréstimo");
    }

    try {
      await adjustBalance(amount);
    } catch (balanceError: any) {
      console.error("[addPartialPayment] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({ remaining_amount: loan.remainingAmount ?? 0 }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    await fetchPayments();
    await fetchLoans();
  }, [user, dataOwnerId, loans, payments, fetchLoans, fetchPayments]);

  const payOffLoan = useCallback(async (loanId: string, paymentDate?: string, customAmount?: number) => {
    if (!user || !dataOwnerId) throw new Error("Usuário não autenticado");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const remaining = getLoanRemainingAmount(loan, payments);
    if (remaining <= 0 && !(typeof customAmount === "number" && customAmount > 0)) {
      throw new Error("Não há saldo restante para quitar");
    }

    const payAmount = typeof customAmount === "number" && customAmount > 0
      ? customAmount
      : remaining;
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const paymentPayload = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount: payAmount,
      date: dateStr, installment_number: loan.installments,
    };
    const loanUpdate = {
      paid_installments: loan.installments,
      status: "paid",
      remaining_amount: 0,
    };

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: payAmount, date: dateStr, installmentNumber: loan.installments },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l, paidInstallments: loan.installments, status: "paid", remainingAmount: 0,
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await adjustBalanceOffline(payAmount);
      // Manager commission é pulada offline; será criada manualmente ao reconectar pelo usuário se necessário.
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    const { data: insertedPayment, error: paymentError } = await supabase
      .from("payments")
      .insert(paymentPayload as any)
      .select("id")
      .single();

    if (paymentError || !insertedPayment) {
      console.error("[payOffLoan] insert payment failed:", paymentError ?? new Error("Pagamento não retornado"));
      await revertOptimisticState();
      throw new Error(paymentError?.message ?? "Falha ao registrar pagamento");
    }

    const { data: updatedLoan, error: loanError } = await supabase
      .from("loans")
      .update(loanUpdate)
      .eq("id", loanId)
      .select("id")
      .maybeSingle();

    if (loanError || !updatedLoan) {
      console.error("[payOffLoan] update loan failed:", loanError ?? new Error("Nenhum empréstimo foi atualizado"));
      await supabase.from("payments").delete().eq("id", tempPaymentId);
      await revertOptimisticState();
      throw new Error(loanError?.message ?? "Falha ao atualizar o empréstimo");
    }

    try {
      await adjustBalance(payAmount);
    } catch (balanceError: any) {
      console.error("[payOffLoan] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({
          paid_installments: loan.paidInstallments,
          status: loan.status,
          remaining_amount: loan.remainingAmount ?? remaining,
        }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    // Manager commission (isolated — does NOT affect balance/profit/expenses)
    if (loan.hasManager && loan.managerId) {
      const rate = loan.managerCommissionRate ?? 10;
      const amount = (loan.amount * rate) / 100;
      await supabase.from("manager_commissions").insert({
        user_id: dataOwnerId,
        loan_id: loanId,
        manager_id: loan.managerId,
        payment_id: insertedPayment.id,
        commission_type: "full",
        base_amount: loan.amount,
        rate,
        amount,
        generated_at: dateStr,
      } as any);
    }

    await fetchPayments();
    await fetchLoans();
  }, [user, dataOwnerId, loans, payments, fetchLoans, fetchPayments]);

  const addInterestOnlyPayment = useCallback(async (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number) => {
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const dateStr = paymentDate || todayInAppTz();
    const isInstallmentLoan = loan.installments >= 2;
    const { lateFees } = getLoanLateFees(loan, payments, installmentSchedules);
    const appliedFees = feesAmount != null && feesAmount > 0 ? feesAmount : lateFees;

    if (isInstallmentLoan) {
      const nextInstallmentNumber = loan.paidInstallments + 1;
      const nextSchedule = installmentSchedules.find(
        (schedule) => schedule.loanId === loanId && schedule.installmentNumber === nextInstallmentNumber,
      );
      const currentAmount = nextSchedule?.amount
        ?? (loan.customInstallmentValue != null && loan.customInstallmentValue > 0
          ? loan.customInstallmentValue
          : calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments) / Math.max(1, loan.installments));
      const updatedAmount = Math.round((currentAmount + appliedFees) * 100) / 100;

      if (nextSchedule?.id) {
        if (!isOnline()) {
          setInstallmentSchedules((prev) => prev.map((schedule) => schedule.id === nextSchedule.id ? { ...schedule, amount: updatedAmount } : schedule));
          await enqueueMutation({ table: "loan_installments", op: "update", recordId: nextSchedule.id, payload: { amount: updatedAmount } });
          return;
        }

        const { data: updatedSchedule, error: scheduleError } = await supabase
          .from("loan_installments")
          .update({ amount: updatedAmount })
          .eq("id", nextSchedule.id)
          .select("id")
          .maybeSingle();

        if (scheduleError || !updatedSchedule) {
          console.error("[addInterestOnlyPayment] update schedule failed:", scheduleError ?? new Error("Nenhuma parcela foi atualizada"));
          throw new Error(scheduleError?.message ?? "Falha ao atualizar a parcela");
        }

        await fetchSchedules();
        await fetchLoans();
        return;
      }

      const { error: insertScheduleError } = await supabase.from("loan_installments").insert({
        user_id: dataOwnerId,
        loan_id: loanId,
        installment_number: nextInstallmentNumber,
        due_date: loan.dueDate,
        amount: updatedAmount,
      } as any);

      if (insertScheduleError) {
        console.error("[addInterestOnlyPayment] insert schedule failed:", insertScheduleError);
        throw new Error(insertScheduleError.message);
      }

      await fetchSchedules();
      await fetchLoans();
      return;
    }

    const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
    const interestAmount = customAmount != null && customAmount > 0 ? customAmount : baseInterest;
    const feesExtra = feesAmount != null && feesAmount > 0 ? feesAmount : 0;
    const currentDue = new Date(loan.dueDate + "T00:00:00");
    const freq = loan.interestType || "Mensal";
    if (freq === "Semanal") currentDue.setDate(currentDue.getDate() + 7);
    else if (freq === "Quinzenal") currentDue.setDate(currentDue.getDate() + 15);
    else currentDue.setMonth(currentDue.getMonth() + 1);
    const newDueDate = currentDue.toISOString().split("T")[0];
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const paymentPayload = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount: interestAmount,
      date: dateStr, installment_number: 0, previous_due_date: loan.dueDate,
    };
    const loanUpdate = { due_date: newDueDate };

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: interestAmount, date: dateStr, installmentNumber: 0, previousDueDate: loan.dueDate },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? { ...l, dueDate: newDueDate } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await adjustBalanceOffline(interestAmount);
      if (feesExtra > 0) {
        const feesPaymentId = crypto.randomUUID();
        const feesPayload = {
          id: feesPaymentId,
          user_id: dataOwnerId, loan_id: loanId, amount: feesExtra,
          date: dateStr, installment_number: -2, previous_due_date: loan.dueDate,
        };
        setPayments((prev) => [
          { id: feesPaymentId, loanId, amount: feesExtra, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate },
          ...prev,
        ]);
        await upsertCachedRow("payments", { ...feesPayload, created_at: new Date().toISOString() });
        await enqueueMutation({ table: "payments", op: "insert", recordId: feesPaymentId, payload: feesPayload });
        await adjustBalanceOffline(feesExtra);
      }
      return;
    }

    const revertOptimisticState = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    const { data: insertedPayment, error: paymentError } = await supabase
      .from("payments")
      .insert(paymentPayload as any)
      .select("id")
      .single();

    if (paymentError || !insertedPayment) {
      console.error("[addInterestOnlyPayment] insert payment failed:", paymentError ?? new Error("Pagamento não retornado"));
      await revertOptimisticState();
      throw new Error(paymentError?.message ?? "Falha ao registrar juros");
    }

    const { data: updatedLoan, error: loanError } = await supabase
      .from("loans")
      .update(loanUpdate)
      .eq("id", loanId)
      .select("id")
      .maybeSingle();

    if (loanError || !updatedLoan) {
      console.error("[addInterestOnlyPayment] update loan failed:", loanError ?? new Error("Nenhum empréstimo foi atualizado"));
      await supabase.from("payments").delete().eq("id", tempPaymentId);
      await revertOptimisticState();
      throw new Error(loanError?.message ?? "Falha ao atualizar o vencimento");
    }

    const nextNum = loan.paidInstallments + 1;
    const { error: scheduleError } = await supabase
      .from("loan_installments")
      .update({ due_date: newDueDate })
      .eq("loan_id", loanId)
      .eq("installment_number", nextNum);

    if (scheduleError) {
      console.error("[addInterestOnlyPayment] update schedule due date failed:", scheduleError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({ due_date: loan.dueDate }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(scheduleError.message);
    }

    try {
      await adjustBalance(interestAmount);
    } catch (balanceError: any) {
      console.error("[addInterestOnlyPayment] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({ due_date: loan.dueDate }).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    // If paying interest + late fees, record the fees as a separate payment entry for traceability
    if (feesExtra > 0) {
      const feesPaymentId = crypto.randomUUID();
      const feesPayload = {
        id: feesPaymentId,
        user_id: dataOwnerId, loan_id: loanId, amount: feesExtra,
        date: dateStr, installment_number: -2, previous_due_date: loan.dueDate,
      };
      const { error: feeInsertError } = await supabase.from("payments").insert(feesPayload as any);
      if (feeInsertError) {
        console.error("[addInterestOnlyPayment] insert fee payment failed:", feeInsertError);
        await Promise.all([
          supabase.from("payments").delete().eq("id", tempPaymentId),
          supabase.from("loans").update({ due_date: loan.dueDate }).eq("id", loanId),
        ]);
        await revertOptimisticState();
        throw new Error(feeInsertError.message);
      }

      try {
        await adjustBalance(feesExtra);
      } catch (feeBalanceError: any) {
        console.error("[addInterestOnlyPayment] adjust fee balance failed:", feeBalanceError);
        await Promise.all([
          supabase.from("payments").delete().eq("id", feesPaymentId),
          supabase.from("payments").delete().eq("id", tempPaymentId),
          supabase.from("loans").update({ due_date: loan.dueDate }).eq("id", loanId),
        ]);
        await revertOptimisticState();
        throw new Error(feeBalanceError?.message ?? "Falha ao atualizar saldo das taxas");
      }

      setPayments((prev) => [
        { id: feesPaymentId, loanId, amount: feesExtra, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate },
        ...prev,
      ]);
      await upsertCachedRow("payments", { ...feesPayload, created_at: new Date().toISOString() });
    }

    // Manager commission on interest payments — 10% of ORIGINAL loan amount, isolated
    if (loan.hasManager && loan.managerId && loan.status !== "paid") {
      const rate = loan.managerCommissionRate ?? 10;
      const amount = (loan.amount * rate) / 100;
      await supabase.from("manager_commissions").insert({
        user_id: dataOwnerId,
        loan_id: loanId,
        manager_id: loan.managerId,
        payment_id: insertedPayment.id,
        commission_type: "interest",
        base_amount: loan.amount,
        rate,
        amount,
        generated_at: dateStr,
      } as any);
    }

    await fetchLoans();
    await fetchPayments();
    await fetchSchedules();
  }, [user, dataOwnerId, loans, payments, fetchLoans, fetchPayments]);

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
    if (data.notes !== undefined) updateData.notes = data.notes != null ? String(data.notes) : null;
    if (data.remainingAmount !== undefined) updateData.remaining_amount = data.remainingAmount;
    if (data.customInstallmentValue !== undefined) updateData.custom_installment_value = data.customInstallmentValue;
    if (data.customInterestValue !== undefined) updateData.custom_interest_value = data.customInterestValue;
    if (data.lateInterestType !== undefined) updateData.late_interest_type = data.lateInterestType;
    if (data.lateInterestValue !== undefined) updateData.late_interest_value = data.lateInterestValue;
    if (data.penaltyValue !== undefined) updateData.penalty_value = data.penaltyValue;
    if (data.hasManager !== undefined) (updateData as any).has_manager = data.hasManager;
    if (data.managerId !== undefined) (updateData as any).manager_id = data.managerId;
    if (data.managerCommissionRate !== undefined) (updateData as any).manager_commission_rate = data.managerCommissionRate ?? 10;
    if (!isOnline()) {
      await enqueueMutation({ table: "loans", op: "update", recordId: id, payload: updateData });
      return;
    }
    const { error: updateErr } = await supabase.from("loans").update(updateData).eq("id", id);
    if (updateErr) {
      if (!updateErr.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "loans", op: "update", recordId: id, payload: updateData });
      } else {
        console.error("[updateLoan] Falha ao salvar:", updateErr);
        toast.error("Falha ao salvar alterações: " + updateErr.message);
        await fetchLoans();
      }
    }
  }, [loans, fetchLoans]);

  const deleteLoan = useCallback(async (id: string) => {
    const loan = loans.find((l) => l.id === id);
    const loanPayments = payments.filter((p) => p.loanId === id);
    setLoans((prev) => prev.filter((l) => l.id !== id));
    setPayments((prev) => prev.filter((p) => p.loanId !== id));
    await removeCachedRow("loans", id);

    // Net balance impact: refund principal, then revert all received payments
    const netDelta = (loan ? loan.amount : 0) - loanPayments.reduce((s, p) => s + p.amount, 0);

    if (!isOnline()) {
      await enqueueMutation({ table: "loans", op: "delete", recordId: id });
      if (netDelta !== 0) await adjustBalanceOffline(netDelta);
      return;
    }
    if (netDelta !== 0) await adjustBalance(netDelta);
    const { error } = await supabase.from("loans").delete().eq("id", id);
    if (error) await enqueueMutation({ table: "loans", op: "delete", recordId: id });
  }, [loans, payments]);

  const deletePayment = useCallback(async (id: string) => {
    const payment = payments.find((p) => p.id === id);
    if (!payment) return;
    const online = isOnline();

    setPayments((prev) => prev.filter((p) => p.id !== id));
    await removeCachedRow("payments", id);

    const loan = loans.find((l) => l.id === payment.loanId);
    let loanUpdates: any = null;

    if (loan) {
      const newRemaining = (loan.remainingAmount ?? 0) + payment.amount;
      loanUpdates = { remaining_amount: newRemaining };

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
        delete loanUpdates.remaining_amount;
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, dueDate: payment.previousDueDate!,
        } : l));
        if (online) {
          const nextNum = loan.paidInstallments + 1;
          await supabase.from("loan_installments")
            .update({ due_date: payment.previousDueDate })
            .eq("loan_id", payment.loanId)
            .eq("installment_number", nextNum);
        }
      } else {
        setLoans((prev) => prev.map((l) => l.id === payment.loanId ? {
          ...l, remainingAmount: newRemaining,
        } : l));
      }
    }

    if (!online) {
      if (loan && loanUpdates) {
        await enqueueMutation({ table: "loans", op: "update", recordId: payment.loanId, payload: loanUpdates });
      }
      await enqueueMutation({ table: "payments", op: "delete", recordId: id });
      await adjustBalanceOffline(-payment.amount);
      return;
    }

    if (loan && loanUpdates) {
      await supabase.from("loans").update(loanUpdates).eq("id", payment.loanId);
    }
    await adjustBalance(-payment.amount);
    await supabase.from("payments").delete().eq("id", id);
    await fetchSchedules();
    await fetchLoans();
    await fetchPayments();
  }, [payments, loans, fetchSchedules, fetchLoans, fetchPayments]);

  return { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, payOffLoan, addInterestOnlyPayment, updateLoan, deleteLoan, deletePayment, saveSchedule };
}

export function calculateInstallment(principal: number, rate: number, months: number): number {
  const total = principal * (1 + rate / 100);
  return months > 0 ? total / months : total;
}

function computeNextDueDate(currentDueDate: string, frequency: string, paidCount: number): string {
  const base = new Date(currentDueDate + "T00:00:00");
  if (frequency === "Semanal") base.setDate(base.getDate() + 7 * paidCount);
  else if (frequency === "Quinzenal") base.setDate(base.getDate() + 15 * paidCount);
  else base.setMonth(base.getMonth() + paidCount);
  return base.toISOString().split("T")[0];
}

export function calculateTotalWithInterest(principal: number, rate: number, _months: number): number {
  return Math.round(principal * (1 + rate / 100));
}

export function getLoanRemainingAmount(loan: Loan, payments: Payment[]): number {
  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return Math.max(0, loan.remainingAmount);
  }

  if (loan.status === "paid") {
    return 0;
  }

  const totalExpected = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((sum, p) => sum + p.amount, 0);

  return Math.max(0, totalExpected - totalPaid);
}
