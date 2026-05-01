import { useState, useCallback, useEffect } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Loan, Payment, InstallmentSchedule, PaymentSplit } from "@/types/loan";
import { adjustBalance, adjustBalanceOffline } from "@/lib/balance";
import { recordLedger, removeLedgerByRef } from "@/lib/ledger";
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
    startDate: l.start_date, dueDate: l.due_date, originalDueDate: l.original_due_date ?? l.due_date, installments: l.installments,
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
    autoBillingEnabled: l.auto_billing_enabled ?? true,
    renegotiationPenaltyTotal: l.renegotiation_penalty_total != null ? Number(l.renegotiation_penalty_total) : 0,
  };
}

function rowToPayment(p: any): Payment {
  return {
    id: p.id, loanId: p.loan_id, amount: Number(p.amount), date: p.date,
    installmentNumber: p.installment_number, previousDueDate: p.previous_due_date,
    paymentMethodId: p.payment_method_id ?? null,
    metadata: p.metadata ?? null,
    createdAt: p.created_at ?? undefined,
  };
}

/**
 * Validates a payment split (must have 2 parts whose amounts sum to expected total).
 * Returns the normalized split or null if invalid/empty.
 */
function normalizeSplit(split: PaymentSplit | null | undefined, expectedTotal: number): PaymentSplit | null {
  if (!split || !Array.isArray(split.parts) || split.parts.length < 2) return null;
  const parts = split.parts.filter((p) => p && Number(p.amount) > 0);
  if (parts.length < 2) return null;
  const sum = parts.reduce((acc, p) => acc + Number(p.amount), 0);
  if (Math.abs(sum - expectedTotal) > 0.02) return null;
  return { parts: parts.map((p) => ({ paymentMethodId: p.paymentMethodId ?? null, amount: Number(p.amount) })) };
}

/**
 * Builds metadata object including split info if provided. Preserves existing metadata.
 */
function withSplit(base: Record<string, any> | null | undefined, split: PaymentSplit | null): Record<string, any> | undefined {
  if (!split) return base ?? undefined;
  return { ...(base ?? {}), split };
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
      start_date: loan.startDate, due_date: loan.dueDate, original_due_date: loan.dueDate, installments: loan.installments,
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
        // Ledger: registra a saída do principal e a entrada total como pagamento.
        await recordLedger({
          direction: "out", category: "loan", amount: loan.amount,
          description: `Empréstimo concedido - ${loan.borrowerName}`,
          occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
        });
        await recordLedger({
          direction: "in", category: "payment", amount: totalReceived,
          description: `Empréstimo quitado na criação - ${loan.borrowerName}`,
          occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
        });
      } else {
        await adjustBalance(-loan.amount);
        await recordLedger({
          direction: "out", category: "loan", amount: loan.amount,
          description: `Empréstimo concedido - ${loan.borrowerName}`,
          occurred_on: loan.startDate, loan_id: data.id, source: "auto", syncBalance: false,
        });
      }
      return data.id;
    }
    return null;
  }, [user, dataOwnerId]);

  const addPayment = useCallback(async (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
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
          nextDueDate = computeNextDueDate(loan.dueDate, loan.interestType || "Mensal", 1);
        }
      } else {
        nextDueDate = computeNextDueDate(loan.dueDate, loan.interestType || "Mensal", 1);
      }
    }

    const newStatus = newPaid >= loan.installments ? "paid" : loan.status;
    const tempPaymentId = crypto.randomUUID();
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, installmentAmount);
    const splitMetadata = withSplit(null, normalizedSplit);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId,
      loan_id: loanId,
      amount: installmentAmount,
      date: dateStr,
      installment_number: newPaid,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    const loanUpdate = {
      paid_installments: newPaid,
      status: newStatus,
      remaining_amount: newRemaining,
      due_date: nextDueDate,
    };

    // Optimistic state
    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: installmentAmount, date: dateStr, installmentNumber: newPaid, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
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
      await recordLedger({
        direction: "in", category: "payment", amount: installmentAmount,
        description: `Parcela ${newPaid}/${loan.installments} recebida - ${loan.borrowerName}`,
        occurred_on: dateStr, loan_id: loanId, payment_id: tempPaymentId, source: "auto", syncBalance: false,
      });
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

  const addPartialPayment = useCallback(async (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    if (amount <= 0) throw new Error("Informe um valor de pagamento válido");
    const dateStr = paymentDate || todayInAppTz();
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    const newRemaining = Math.max(0, getLoanRemainingAmount(loan, payments) - amount);
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, amount);
    const splitMetadata = withSplit(null, normalizedSplit);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount, date: dateStr, installment_number: -1,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    const loanUpdate = { remaining_amount: newRemaining };

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount, date: dateStr, installmentNumber: -1, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
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
      await recordLedger({
        direction: "in", category: "payment", amount,
        description: `Pagamento parcial - ${loan.borrowerName}`,
        occurred_on: dateStr, loan_id: loanId, payment_id: tempPaymentId, source: "auto", syncBalance: false,
      });
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

  const payOffLoan = useCallback(async (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
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
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, payAmount);
    const splitMetadata = withSplit(null, normalizedSplit);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount: payAmount,
      date: dateStr, installment_number: loan.installments,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    const loanUpdate = {
      paid_installments: loan.installments,
      status: "paid",
      remaining_amount: 0,
    };

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: payAmount, date: dateStr, installmentNumber: loan.installments, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
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
      await recordLedger({
        direction: "in", category: "payment", amount: payAmount,
        description: `Quitação - ${loan.borrowerName}`,
        occurred_on: dateStr, loan_id: loanId, payment_id: tempPaymentId, source: "auto", syncBalance: false,
      });
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

  const addInterestOnlyPayment = useCallback(async (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => {
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
    // Regra: o próximo vencimento após pagar juros é SEMPRE calculado a partir
    // da ÂNCORA original (originalDueDate), IGNORANDO qualquer adiamento feito
    // por renegociação no due_date. Avançamos ciclos a partir da âncora até
    // ficar estritamente APÓS a data do pagamento.
    // Âncora = original_due_date, mas com proteção: se o "original" salvo for
    // posterior ao due_date atual, ele está corrompido (bug histórico ou edição
    // manual posterior) — nesse caso usamos o due_date como âncora.
    const rawAnchor = loan.originalDueDate || loan.dueDate;
    const anchorRef = rawAnchor > loan.dueDate ? loan.dueDate : rawAnchor;
    const freq = loan.interestType || "Mensal";
    const advance = (d: Date) => {
      if (freq === "Semanal") d.setDate(d.getDate() + 7);
      else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
      else {
        const anchorDay = Number(anchorRef.split("-")[2]);
        d.setMonth(d.getMonth() + 1);
        if (Number.isFinite(anchorDay) && anchorDay >= 1 && anchorDay <= 31) {
          const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          d.setDate(Math.min(anchorDay, lastDay));
        }
      }
    };
    const currentDue = new Date(anchorRef + "T00:00:00");
    // Avança no mínimo 1 período; continua avançando enquanto for ≤ data do pagamento
    advance(currentDue);
    let guard = 0;
    while (currentDue.toISOString().split("T")[0] <= dateStr && guard < 600) {
      advance(currentDue);
      guard += 1;
    }
    const newDueDate = currentDue.toISOString().split("T")[0];
    const online = isOnline();

    const tempPaymentId = crypto.randomUUID();
    const totalReceivedNow = interestAmount + feesExtra;
    const normalizedSplit = normalizeSplit(paymentSplit ?? null, totalReceivedNow);
    const splitMetadata = withSplit(null, normalizedSplit);
    const paymentPayload: any = {
      id: tempPaymentId,
      user_id: dataOwnerId, loan_id: loanId, amount: interestAmount,
      date: dateStr, installment_number: 0, previous_due_date: loan.dueDate,
      payment_method_id: paymentMethodId ?? null,
    };
    if (splitMetadata) paymentPayload.metadata = splitMetadata;
    // Se o usuário escolheu pagar "Juros + multa/atraso" e há multa de renegociação
    // pendente, ela está incluída em feesExtra → quitamos no contrato (zera o saldo
    // de multa de renegociação e abate do remaining_amount).
    const renegPenaltyPending = Number(loan.renegotiationPenaltyTotal || 0);
    const shouldClearRenegPenalty = feesExtra > 0 && renegPenaltyPending > 0;
    const loanUpdate: any = { due_date: newDueDate };
    if (shouldClearRenegPenalty) {
      loanUpdate.renegotiation_penalty_total = 0;
      loanUpdate.remaining_amount = Math.max(0, Math.round((Number(loan.remainingAmount || 0) - renegPenaltyPending) * 100) / 100);
    }

    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: interestAmount, date: dateStr, installmentNumber: 0, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: (splitMetadata as any) ?? null },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l,
      dueDate: newDueDate,
      ...(shouldClearRenegPenalty ? {
        renegotiationPenaltyTotal: 0,
        remainingAmount: Math.max(0, Math.round((Number(l.remainingAmount || 0) - renegPenaltyPending) * 100) / 100),
      } : {}),
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      // Ajusta o saldo offline com o TOTAL (juros + multa) em uma única operação
      await adjustBalanceOffline(interestAmount + feesExtra);
      if (feesExtra > 0) {
        const feesPaymentId = crypto.randomUUID();
        const feesPayload = {
          id: feesPaymentId,
          user_id: dataOwnerId, loan_id: loanId, amount: feesExtra,
          date: dateStr, installment_number: -2, previous_due_date: loan.dueDate,
          payment_method_id: paymentMethodId ?? null,
          metadata: { kind: "late_fee", consolidated_with: tempPaymentId } as any,
        };
        setPayments((prev) => [
          { id: feesPaymentId, loanId, amount: feesExtra, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: { kind: "late_fee", consolidated_with: tempPaymentId } as any },
          ...prev,
        ]);
        await upsertCachedRow("payments", { ...feesPayload, created_at: new Date().toISOString() });
        await enqueueMutation({ table: "payments", op: "insert", recordId: feesPaymentId, payload: feesPayload });
        // NÃO ajusta saldo aqui — já incluído no total acima
      }
      return;
    }

    const loanRollback: any = { due_date: loan.dueDate };
    if (shouldClearRenegPenalty) {
      loanRollback.renegotiation_penalty_total = renegPenaltyPending;
      loanRollback.remaining_amount = Number(loan.remainingAmount || 0);
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
        supabase.from("loans").update(loanRollback).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(scheduleError.message);
    }

    try {
      const totalReceived = interestAmount + feesExtra;
      await adjustBalance(totalReceived);
      const ledgerDescription = feesExtra > 0
        ? `Pagamento de empréstimo (juros + multa) - ${loan.borrowerName}`
        : `Juros mensal - ${loan.borrowerName}`;
      await recordLedger({
        direction: "in", category: "payment", amount: totalReceived,
        description: ledgerDescription,
        occurred_on: dateStr, loan_id: loanId, payment_id: tempPaymentId, source: "auto", syncBalance: false,
        metadata: feesExtra > 0 ? { interest_amount: interestAmount, fees_amount: feesExtra } : undefined,
      });
    } catch (balanceError: any) {
      console.error("[addInterestOnlyPayment] adjust balance failed:", balanceError);
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update(loanRollback).eq("id", loanId),
      ]);
      await revertOptimisticState();
      throw new Error(balanceError?.message ?? "Falha ao atualizar saldo");
    }

    // If paying interest + late fees, record the fees as a separate payment row
    // (for traceability in "movimentações"), but DO NOT adjust balance/ledger again
    // — the total (interest + fees) was already recorded as a single ledger entry above.
    if (feesExtra > 0) {
      const feesPaymentId = crypto.randomUUID();
      const feesPayload = {
        id: feesPaymentId,
        user_id: dataOwnerId, loan_id: loanId, amount: feesExtra,
        date: dateStr, installment_number: -2, previous_due_date: loan.dueDate,
        payment_method_id: paymentMethodId ?? null,
        metadata: { kind: "late_fee", consolidated_with: tempPaymentId } as any,
      };
      const { error: feeInsertError } = await supabase.from("payments").insert(feesPayload as any);
      if (feeInsertError) {
        console.error("[addInterestOnlyPayment] insert fee payment failed:", feeInsertError);
        await Promise.all([
          supabase.from("payments").delete().eq("id", tempPaymentId),
          supabase.from("loans").update(loanRollback).eq("id", loanId),
        ]);
        await revertOptimisticState();
        throw new Error(feeInsertError.message);
      }

      setPayments((prev) => [
        { id: feesPaymentId, loanId, amount: feesExtra, date: dateStr, installmentNumber: -2, previousDueDate: loan.dueDate, paymentMethodId: paymentMethodId ?? null, metadata: { kind: "late_fee", consolidated_with: tempPaymentId } as any },
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

  /**
   * Amortizar contrato: reduz o principal do empréstimo pelo valor informado,
   * reduzindo proporcionalmente os juros futuros (juros são recalculados sobre
   * o novo principal). Atualiza o saldo restante e o cronograma de parcelas
   * pendentes. Registra a operação no histórico (installment_number = -3).
   */
  const amortizeLoan = useCallback(async (
    loanId: string,
    amortizeAmount: number,
    paymentDate?: string,
    paymentMethodId?: string | null,
    paymentSplit?: PaymentSplit | null,
  ) => {
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    if (amortizeAmount == null || isNaN(Number(amortizeAmount)) || Number(amortizeAmount) <= 0) {
      throw new Error("Informe um valor de amortização válido (maior que zero)");
    }
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    if (loan.status === "paid") {
      throw new Error("Este contrato já está quitado e não pode ser amortizado");
    }
    if (loan.status !== "active" && loan.status !== "overdue") {
      throw new Error("Apenas contratos em aberto podem ser amortizados");
    }
    const remainingBalance = getLoanRemainingAmount(loan, payments);
    if (remainingBalance <= 0) {
      throw new Error("Este contrato já está quitado e não pode ser amortizado");
    }

    const dateStr = paymentDate || todayInAppTz();
    // Valida data dentro do período do contrato
    const startStr = loan.startDate;
    const endStr = loan.dueDate;
    if (startStr && dateStr < startStr) {
      throw new Error(`A data da amortização não pode ser anterior ao início do contrato (${startStr})`);
    }
    if (endStr && dateStr > endStr) {
      throw new Error(`A data da amortização não pode ser posterior ao vencimento do contrato (${endStr})`);
    }
    const rate = Number(loan.interestRate) || 0;
    const oldPrincipal = Number(loan.amount) || 0;
    if (amortizeAmount > oldPrincipal) {
      throw new Error(`O valor da amortização não pode ser maior que o saldo principal (R$ ${oldPrincipal.toFixed(2)})`);
    }
    const newPrincipal = Math.max(0, oldPrincipal - amortizeAmount);

    // Recalcula juros proporcionalmente ao novo principal
    const newCustomInterest = loan.customInterestValue != null && loan.customInterestValue > 0 && oldPrincipal > 0
      ? (loan.customInterestValue * (newPrincipal / oldPrincipal))
      : null;
    const newInterestTotal = newCustomInterest != null
      ? newCustomInterest
      : newPrincipal * (rate / 100);
    const newTotalContract = newPrincipal + newInterestTotal;

    // Quanto já foi pago em parcelas/quitações (exclui juros-only e taxas)
    const paidPrincipalAndInstallments = payments
      .filter((p) => p.loanId === loanId && p.installmentNumber !== 0 && p.installmentNumber !== -2)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const newRemaining = Math.max(0, newTotalContract - paidPrincipalAndInstallments);
    const remainingInst = Math.max(1, loan.installments - loan.paidInstallments);
    const newInstallmentValue = Math.round((newRemaining / remainingInst) * 100) / 100;

    const oldInterestTotal = loan.customInterestValue != null && loan.customInterestValue > 0
      ? Number(loan.customInterestValue)
      : oldPrincipal * (rate / 100);
    const interestSaved = Math.max(0, oldInterestTotal - newInterestTotal);

    const normalizedSplit = normalizeSplit(paymentSplit ?? null, amortizeAmount);
    const amortizationMetadata: Record<string, any> = {
      kind: "amortization" as const,
      old_principal: oldPrincipal,
      new_principal: newPrincipal,
      old_interest_total: oldInterestTotal,
      new_interest_total: newInterestTotal,
      interest_saved: interestSaved,
      new_remaining: newRemaining,
      interest_rate: rate,
    };
    if (normalizedSplit) amortizationMetadata.split = normalizedSplit;

    const online = isOnline();
    const tempPaymentId = crypto.randomUUID();
    const paymentPayload = {
      id: tempPaymentId,
      user_id: dataOwnerId,
      loan_id: loanId,
      amount: amortizeAmount,
      date: dateStr,
      installment_number: -3, // marcador de amortização
      payment_method_id: paymentMethodId ?? null,
      metadata: amortizationMetadata,
    };
    const loanUpdate: any = {
      amount: newPrincipal,
      remaining_amount: newRemaining,
      custom_interest_value: newCustomInterest,
      custom_installment_value: newInstallmentValue,
    };

    // Atualização otimista
    setPayments((prev) => [
      { id: tempPaymentId, loanId, amount: amortizeAmount, date: dateStr, installmentNumber: -3, paymentMethodId: paymentMethodId ?? null, metadata: amortizationMetadata as any },
      ...prev,
    ]);
    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l,
      amount: newPrincipal,
      remainingAmount: newRemaining,
      customInterestValue: newCustomInterest,
      customInstallmentValue: newInstallmentValue,
    } : l));
    await upsertCachedRow("payments", { ...paymentPayload, created_at: new Date().toISOString() });

    if (!online) {
      await enqueueMutation({ table: "payments", op: "insert", recordId: tempPaymentId, payload: paymentPayload });
      await enqueueMutation({ table: "loans", op: "update", recordId: loanId, payload: loanUpdate });
      await adjustBalanceOffline(amortizeAmount);
      toast.success("Amortização registrada (offline)");
      return;
    }

    const revert = async () => {
      setPayments((prev) => prev.filter((p) => p.id !== tempPaymentId));
      setLoans((prev) => prev.map((l) => l.id === loanId ? loan : l));
      await removeCachedRow("payments", tempPaymentId);
    };

    const { error: payErr } = await supabase.from("payments").insert(paymentPayload as any);
    if (payErr) {
      await revert();
      throw new Error(payErr.message);
    }

    const { data: updLoan, error: loanErr } = await supabase
      .from("loans").update(loanUpdate).eq("id", loanId).select("id").maybeSingle();
    if (loanErr || !updLoan) {
      await supabase.from("payments").delete().eq("id", tempPaymentId);
      await revert();
      throw new Error(loanErr?.message ?? "Falha ao atualizar empréstimo");
    }

    // Atualiza valores das parcelas futuras (não pagas) proporcionalmente
    const unpaidScheds = installmentSchedules
      .filter((s) => s.loanId === loanId && s.installmentNumber > loan.paidInstallments)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    if (unpaidScheds.length > 0) {
      const evenValue = Math.round((newRemaining / unpaidScheds.length) * 100) / 100;
      // ajusta a última parcela para fechar a soma exata
      const total = evenValue * unpaidScheds.length;
      const diff = Math.round((newRemaining - total) * 100) / 100;
      for (let i = 0; i < unpaidScheds.length; i++) {
        const sched = unpaidScheds[i];
        const isLast = i === unpaidScheds.length - 1;
        const amt = isLast ? Math.max(0, evenValue + diff) : evenValue;
        if (sched.id) {
          await supabase.from("loan_installments").update({ amount: amt }).eq("id", sched.id);
        }
      }
    }

    try {
      await adjustBalance(amortizeAmount);
      await recordLedger({
        direction: "in", category: "payment", amount: amortizeAmount,
        description: `Amortização - ${loan.borrowerName}`,
        occurred_on: dateStr, loan_id: loanId, payment_id: tempPaymentId, source: "auto", syncBalance: false,
      });
    } catch (balErr: any) {
      // reverter
      await Promise.all([
        supabase.from("payments").delete().eq("id", tempPaymentId),
        supabase.from("loans").update({
          amount: oldPrincipal,
          remaining_amount: loan.remainingAmount ?? null,
          custom_interest_value: loan.customInterestValue ?? null,
          custom_installment_value: loan.customInstallmentValue ?? null,
        }).eq("id", loanId),
      ]);
      await revert();
      throw new Error(balErr?.message ?? "Falha ao atualizar saldo");
    }

    await fetchPayments();
    await fetchLoans();
    await fetchSchedules();
  }, [user, dataOwnerId, loans, payments, installmentSchedules, fetchPayments, fetchLoans, fetchSchedules]);

  const updateLoan = useCallback(async (id: string, data: Partial<Omit<Loan, "id">>) => {
    if (data.remainingAmount !== undefined) {
      const oldLoan = loans.find((l) => l.id === id);
      if (oldLoan) {
        const oldRemaining = oldLoan.remainingAmount ?? 0;
        const newRemaining = data.remainingAmount ?? 0;
        const diff = newRemaining - oldRemaining;
        if (diff !== 0) {
          // diff > 0: saldo devedor aumentou → saída de caixa (emprestamos mais)
          // diff < 0: saldo devedor diminuiu → entrada de caixa (recebemos)
          const direction: "in" | "out" = diff > 0 ? "out" : "in";
          const absAmount = Math.abs(diff);
          const borrower = oldLoan.borrowerName || "empréstimo";
          try {
            await recordLedger({
              direction,
              category: "adjustment",
              amount: absAmount,
              description: `Ajuste de saldo do empréstimo de ${borrower}`,
              loan_id: id,
              source: "loan_adjustment",
              metadata: { old_remaining: oldRemaining, new_remaining: newRemaining },
            });
          } catch (err) {
            console.error("[updateLoan] Falha ao registrar ajuste no extrato:", err);
            // Fallback: ajusta apenas o saldo se o ledger falhar
            await adjustBalance(-diff);
          }
        }
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
    if (data.autoBillingEnabled !== undefined) (updateData as any).auto_billing_enabled = data.autoBillingEnabled;
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
    // Remove todos os lançamentos do extrato vinculados a esse empréstimo (sem mexer no saldo, já feito acima)
    if (loan) {
      await removeLedgerByRef({ loan_id: id }, { syncBalance: false });
    }
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
    // Remove a entrada do extrato (sem mexer no saldo de novo)
    await removeLedgerByRef({ payment_id: id }, { syncBalance: false });
    await supabase.from("payments").delete().eq("id", id);
    await fetchSchedules();
    await fetchLoans();
    await fetchPayments();
  }, [payments, loans, fetchSchedules, fetchLoans, fetchPayments]);

  /**
   * Renegociar contrato:
   * - "no_interest": apenas ajusta valor/parcelas (sem multa)
   * - "with_penalty": adiciona multa (R$ fixo ou % do saldo restante) ao valor total.
   * Preserva start_date (data de saída do contrato).
   * Registra histórico imutável em loan_renegotiations.
   */
  const renegotiateLoan = useCallback(async (
    loanId: string,
    params: {
      type: "no_interest" | "with_penalty";
      penaltyMode?: "fixed" | "percentage" | null;
      penaltyInput?: number | null;
      penaltyDistribution?: "diluted" | "first" | null;
      newInstallments?: number | null;
      notes?: string | null;
      selectedInstallmentNumbers?: number[] | null;
      firstDueDate?: string | null;
      frequency?: "monthly" | "biweekly" | "weekly" | "daily" | null;
      customDates?: string[] | null;
    }
  ) => {
    if (!user || !dataOwnerId) throw new Error("Sessão ainda não carregada");
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) throw new Error("Empréstimo não encontrado");
    if (loan.status === "paid") throw new Error("Contratos quitados não podem ser renegociados");

    const totalRemaining = getLoanRemainingAmount(loan, payments);
    if (totalRemaining <= 0) throw new Error("Não há saldo a renegociar");

    // Cronograma atual de parcelas
    const allScheds = installmentSchedules
      .filter((s) => s.loanId === loanId)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    const pendingScheds = allScheds.filter((s) => s.installmentNumber > loan.paidInstallments);

    const isInstallmentLoan = loan.paymentType === "Parcelado" && loan.installments > 1;
    const hasSchedule = pendingScheds.length > 0;

    // Determina parcelas selecionadas (somente para parcelado com cronograma)
    const selectedSet = new Set<number>(
      isInstallmentLoan && hasSchedule && params.selectedInstallmentNumbers && params.selectedInstallmentNumbers.length > 0
        ? params.selectedInstallmentNumbers.filter(
            (n) => n > loan.paidInstallments && n <= loan.installments
          )
        : pendingScheds.map((s) => s.installmentNumber)
    );

    const isPartialReneg = isInstallmentLoan && hasSchedule && selectedSet.size < pendingScheds.length;

    // Saldo a renegociar = soma das parcelas selecionadas (parcelado) ou saldo total
    let remaining: number;
    if (isInstallmentLoan && hasSchedule) {
      const sum = pendingScheds
        .filter((s) => selectedSet.has(s.installmentNumber))
        .reduce((acc, s) => acc + Number(s.amount || 0), 0);
      remaining = Math.round(sum * 100) / 100;
    } else {
      remaining = totalRemaining;
    }
    if (remaining <= 0) throw new Error("Selecione ao menos uma parcela com saldo");

    let penaltyAmount = 0;
    if (params.type === "with_penalty") {
      const input = Number(params.penaltyInput ?? 0);
      if (!input || input <= 0) throw new Error("Informe um valor de multa válido");
      if (params.penaltyMode === "percentage") {
        penaltyAmount = Math.round((remaining * input / 100) * 100) / 100;
      } else {
        penaltyAmount = Math.round(input * 100) / 100;
      }
    }

    const newAmount = Math.round((remaining + penaltyAmount) * 100) / 100;

    // Quantas parcelas substituirão as selecionadas
    const desiredNewPending = params.newInstallments && params.newInstallments > 0
      ? Math.floor(params.newInstallments)
      : (isInstallmentLoan && hasSchedule
          ? Math.max(1, selectedSet.size)
          : Math.max(1, loan.installments - loan.paidInstallments));

    // Modo "first": multa inteira na 1ª nova parcela (só faz sentido com multa > 0 e mais de uma parcela).
    const useFirstMode =
      params.type === "with_penalty" &&
      penaltyAmount > 0 &&
      params.penaltyDistribution === "first" &&
      desiredNewPending > 1;

    // Valor "base" das novas parcelas. No modo "first", a base ignora a multa.
    const baseInstallmentValue = useFirstMode
      ? Math.round((remaining / desiredNewPending) * 100) / 100
      : Math.round((newAmount / desiredNewPending) * 100) / 100;
    const firstInstallmentValue = useFirstMode
      ? Math.round((baseInstallmentValue + penaltyAmount) * 100) / 100
      : baseInstallmentValue;
    // Mantém variável original para compatibilidade no resto do fluxo (custom_installment_value etc.)
    const newInstallmentValue = baseInstallmentValue;

    // Saldo total novo do contrato (parcelas pagas + não selecionadas + novas renegociadas)
    const unselectedPendingTotal = pendingScheds
      .filter((s) => !selectedSet.has(s.installmentNumber))
      .reduce((acc, s) => acc + Number(s.amount || 0), 0);
    const newLoanRemaining = Math.round((unselectedPendingTotal + newAmount) * 100) / 100;

    // Total de parcelas do contrato após a renegociação
    const newInstallmentsTotal = isInstallmentLoan && hasSchedule
      ? loan.paidInstallments + (pendingScheds.length - selectedSet.size) + desiredNewPending
      : loan.paidInstallments + desiredNewPending;

    const renegotiatedAt = todayInAppTz();

    // Snapshot do estado anterior do contrato (usado para reverter ao excluir a renegociação)
    const previousState = {
      version: 1,
      loan: {
        remaining_amount: Number(loan.remainingAmount ?? 0),
        installments: loan.installments,
        custom_installment_value: loan.customInstallmentValue ?? null,
        renegotiation_penalty_total: Number(loan.renegotiationPenaltyTotal ?? 0),
        due_date: loan.dueDate,
      },
      schedules: allScheds.map((s) => ({
        installment_number: s.installmentNumber,
        due_date: s.dueDate,
        amount: Number(s.amount ?? 0),
      })),
    };

    const renegRow = {
      loan_id: loanId,
      user_id: dataOwnerId,
      renegotiated_at: renegotiatedAt,
      type: params.type,
      previous_amount: remaining,
      new_amount: newAmount,
      penalty_amount: penaltyAmount,
      penalty_mode: params.type === "with_penalty" ? (params.penaltyMode ?? null) : null,
      penalty_input: params.type === "with_penalty" ? Number(params.penaltyInput ?? 0) : null,
      previous_installments: loan.installments,
      new_installments: newInstallmentsTotal,
      notes: isPartialReneg
        ? `[Parcelas ${Array.from(selectedSet).sort((a, b) => a - b).join(", ")}] ${params.notes ?? ""}`.trim()
        : (params.notes ?? null),
      previous_state: previousState,
    };

    const { error: renegErr } = await supabase
      .from("loan_renegotiations" as any)
      .insert(renegRow as any);
    if (renegErr) throw new Error(renegErr.message);

    const overrideFirstDateTop = params.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(params.firstDueDate)
      ? params.firstDueDate
      : null;

    const loanUpdate: any = {
      remaining_amount: newLoanRemaining,
      installments: newInstallmentsTotal,
      // custom_installment_value só faz sentido se TODAS as pendentes têm o mesmo valor.
      // No modo "first", a 1ª parcela carrega a multa → valores diferentes → null.
      custom_installment_value: (isPartialReneg || useFirstMode) ? null : newInstallmentValue,
      // A multa já está embutida em newAmount (e portanto em newLoanRemaining e nas parcelas).
      // Não acumular em renegotiation_penalty_total para evitar cobrança em dobro.
      renegotiation_penalty_total: Number(loan.renegotiationPenaltyTotal) || 0,
      ...(overrideFirstDateTop ? { due_date: overrideFirstDateTop } : {}),
    };

    const { error: loanErr } = await supabase
      .from("loans").update(loanUpdate).eq("id", loanId);
    if (loanErr) throw new Error(loanErr.message);

    if (hasSchedule) {
      // Estratégia: remover as parcelas selecionadas, depois reinserir desiredNewPending novas parcelas
      // mantendo as não selecionadas. Por fim, renumerar todas as pendentes em ordem cronológica
      // para manter integridade de installment_number sequencial.

      // 1) Apaga as selecionadas
      const idsToDelete = pendingScheds
        .filter((s) => selectedSet.has(s.installmentNumber) && s.id)
        .map((s) => s.id as string);
      if (idsToDelete.length > 0) {
        await supabase.from("loan_installments").delete().in("id", idsToDelete);
      }

      // 2) Calcula datas das novas parcelas: começam após a última parcela existente (paga ou não selecionada)
      const remainingScheds = pendingScheds.filter((s) => !selectedSet.has(s.installmentNumber));
      const lastDate = remainingScheds.length > 0
        ? remainingScheds[remainingScheds.length - 1].dueDate
        : (allScheds.length > 0 ? allScheds[allScheds.length - 1].dueDate : loan.dueDate);

      // Se substituiu TODAS as pendentes, manter a primeira data igual à primeira selecionada
      const firstSelectedDate = isPartialReneg
        ? null
        : (pendingScheds.find((s) => selectedSet.has(s.installmentNumber))?.dueDate || loan.dueDate);

      // Override: usuário escolheu nova data de vencimento
      const overrideFirstDate = params.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(params.firstDueDate)
        ? params.firstDueDate
        : null;

      // 3) Cria novas parcelas
      const freq = params.frequency || "monthly";
      const stepFreq = (baseISO: string, n: number): string => {
        const d = new Date(baseISO + "T00:00:00");
        if (isNaN(d.getTime())) return baseISO;
        if (freq === "monthly") d.setMonth(d.getMonth() + n);
        else if (freq === "biweekly") d.setDate(d.getDate() + 15 * n);
        else if (freq === "weekly") d.setDate(d.getDate() + 7 * n);
        else d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };
      const customDates = Array.isArray(params.customDates) ? params.customDates : null;

      let acc = 0;
      const newScheds: { dueDate: string; amount: number }[] = [];
      for (let i = 0; i < desiredNewPending; i++) {
        let dueStr: string;
        const customForI = customDates && customDates[i] && /^\d{4}-\d{2}-\d{2}$/.test(customDates[i])
          ? customDates[i]
          : null;
        if (customForI) {
          dueStr = customForI;
        } else if (overrideFirstDate) {
          dueStr = stepFreq(overrideFirstDate, i);
        } else if (!isPartialReneg && i === 0 && firstSelectedDate) {
          dueStr = firstSelectedDate;
        } else {
          const baseDate = !isPartialReneg && firstSelectedDate ? firstSelectedDate : lastDate;
          const offset = !isPartialReneg && firstSelectedDate ? i : (i + 1);
          dueStr = stepFreq(baseDate, offset);
        }
        const isLast = i === desiredNewPending - 1;
        let amt: number;
        if (useFirstMode && i === 0) {
          amt = firstInstallmentValue;
        } else if (isLast) {
          amt = Math.round((newAmount - acc) * 100) / 100;
        } else {
          amt = baseInstallmentValue;
        }
        acc += amt;
        newScheds.push({ dueDate: dueStr, amount: amt });
      }

      // 4) Renumera tudo: pegamos as parcelas pagas + não selecionadas + novas (ordenadas por data)
      //    e reescrevemos installment_number sequencialmente.
      const paidScheds = allScheds.filter((s) => s.installmentNumber <= loan.paidInstallments);

      // Atualiza installment_number das pagas (devem manter a ordem)
      // Não tocamos as pagas — mantêm seus números (1..paidInstallments).

      // Combina pendentes não selecionadas + novas, ordena por data
      const combinedPending = [
        ...remainingScheds.map((s) => ({ id: s.id, dueDate: s.dueDate, amount: Number(s.amount || 0), isNew: false })),
        ...newScheds.map((s) => ({ id: undefined as string | undefined, dueDate: s.dueDate, amount: s.amount, isNew: true })),
      ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

      // Atualiza/insere com numeração sequencial após as pagas
      for (let i = 0; i < combinedPending.length; i++) {
        const item = combinedPending[i];
        const newNumber = loan.paidInstallments + i + 1;
        if (item.isNew) {
          await supabase.from("loan_installments").insert({
            loan_id: loanId,
            user_id: dataOwnerId,
            installment_number: newNumber,
            due_date: item.dueDate,
            amount: item.amount,
          } as any);
        } else if (item.id) {
          await supabase.from("loan_installments").update({
            installment_number: newNumber,
            amount: item.amount,
          }).eq("id", item.id);
        }
      }
    }

    setLoans((prev) => prev.map((l) => l.id === loanId ? {
      ...l,
      remainingAmount: newLoanRemaining,
      installments: newInstallmentsTotal,
      customInstallmentValue: (isPartialReneg || useFirstMode) ? null : newInstallmentValue,
      renegotiationPenaltyTotal: Number(l.renegotiationPenaltyTotal) || 0,
      ...(overrideFirstDateTop ? { dueDate: overrideFirstDateTop } : {}),
    } : l));

    await fetchLoans();
    await fetchSchedules();
    notifyRemoteUpdate("loans");

    // Avisa o hook useLoanRenegotiations para recarregar o histórico imediatamente
    try {
      window.dispatchEvent(
        new CustomEvent("offline-sync:flushed", {
          detail: { tables: ["loan_renegotiations", "loans", "loan_installments"] },
        }),
      );
    } catch {}
    toast.success(
      params.type === "with_penalty"
        ? `Renegociação registrada com multa de R$ ${penaltyAmount.toFixed(2)}`
        : "Renegociação registrada"
    );
  }, [user, dataOwnerId, loans, payments, installmentSchedules, fetchLoans, fetchSchedules]);

  return { loans, payments, installmentSchedules, addLoan, addPayment, addPartialPayment, payOffLoan, addInterestOnlyPayment, amortizeLoan, renegotiateLoan, updateLoan, deleteLoan, deletePayment, saveSchedule };
}

export function calculateInstallment(principal: number, rate: number, months: number): number {
  const total = principal * (1 + rate / 100);
  return months > 0 ? total / months : total;
}

export function computeNextDueDate(currentDueDate: string, frequency: string, paidCount: number): string {
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
