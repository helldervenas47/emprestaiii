import { useState, useCallback, useEffect } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Expense } from "@/types/loan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { extractPiggyId } from "./usePiggyBanks";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { recordLedger, removeLedgerByRef } from "@/lib/ledger";
import {
  cacheRows, getCachedRows, upsertCachedRow, removeCachedRow,
  enqueueMutation, rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";

function rowToExpense(e: any): Expense {
  return {
    id: e.id, description: e.description, amount: Number(e.amount),
    type: e.type as "fixa" | "recorrente", category: e.category,
    installments: e.installments, paidInstallments: e.paid_installments,
    dueDate: e.due_date, paid: e.paid, paidDate: e.paid_date,
    notes: e.notes, createdAt: e.created_at,
    parentExpenseId: e.parent_expense_id ?? undefined,
    scope: (e.scope as "business" | "personal") ?? "business",
    paymentMethodId: e.payment_method_id ?? null,
  };
}

export function useExpenses(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const fetchExpenses = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setExpenses(data.map(rowToExpense));
        cacheRows("expenses", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("expenses");
    if (cached.length > 0) {
      setExpenses(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToExpense));
    }
  }, [user]);

  useEffect(() => { if (enabled) fetchExpenses(); }, [fetchExpenses, enabled]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !enabled) return;
    const channel = supabase
      .channel(`expenses-realtime-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { fetchExpenses(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchExpenses, enabled]);

  // Refetch after offline queue flush
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.tables?.includes("expenses")) fetchExpenses();
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchExpenses]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => {
    if (!user || !dataOwnerId) return;
    const tempId = crypto.randomUUID();
    const optimistic: Expense = {
      ...expense, id: tempId, paid: false, paidDate: undefined,
      paidInstallments: 0, createdAt: new Date().toISOString(),
      scope: expense.scope ?? "business",
    };
    setExpenses((prev) => [optimistic, ...prev]);

    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, description: expense.description, amount: expense.amount,
      type: expense.type, category: expense.category, installments: expense.installments,
      paid_installments: 0, due_date: expense.dueDate, paid: false,
      notes: expense.notes ?? null,
      scope: expense.scope ?? "business",
      payment_method_id: expense.paymentMethodId ?? null,
    };

    await upsertCachedRow("expenses", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "insert", recordId: tempId, payload: insertPayload });
      return;
    }

    const { data, error } = await supabase.from("expenses").insert(insertPayload as any).select().single();

    if (error) {
      if (!error.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "expenses", op: "insert", recordId: tempId, payload: insertPayload });
      } else {
        setExpenses((prev) => prev.filter((e) => e.id !== tempId));
        await removeCachedRow("expenses", tempId);
      }
    } else if (data) {
      setExpenses((prev) => prev.map((e) => e.id === tempId ? { ...e, id: data.id, createdAt: data.created_at } : e));
      await removeCachedRow("expenses", tempId);
      await upsertCachedRow("expenses", data);
      await rewritePendingRecordId("expenses", tempId, data.id);
      // Trigger budget overrun push notification check (personal scope only)
      if ((expense.scope ?? "business") === "personal") {
        supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
      }
    }
  }, [user, dataOwnerId]);

  const payExpense = useCallback(async (id: string, skipBalanceAdjust = false, payDate?: string, paidAmount?: number) => {
    if (!dataOwnerId) return;
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return;

    const today = payDate || todayInAppTz();
    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;
    const online = isOnline();

    if (isRecorrenteParcelada) {
      const originalInstallment = expense.amount / expense.installments!;
      const installmentAmount = typeof paidAmount === "number" && paidAmount > 0 ? paidAmount : originalInstallment;
      const newPaid = (expense.paidInstallments || 0) + 1;
      const fullyPaid = newPaid >= expense.installments!;
      const currentDue = new Date(expense.dueDate + "T00:00:00");
      currentDue.setMonth(currentDue.getMonth() + 1);
      const nextDueDate = currentDue.toISOString().split("T")[0];

      // Optimistic: update parent
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e,
        paidInstallments: newPaid,
        paid: fullyPaid,
        dueDate: fullyPaid ? expense.dueDate : nextDueDate,
        paidDate: fullyPaid ? today : undefined,
      } : e));

      const childTempId = crypto.randomUUID();
      const childPayload = {
        id: childTempId,
        user_id: dataOwnerId,
        description: `${expense.description} (${newPaid}/${expense.installments})`,
        amount: installmentAmount,
        type: "fixa",
        category: expense.category,
        installments: null,
        paid_installments: null,
        due_date: expense.dueDate,
        paid: true,
        paid_date: today,
        notes: expense.notes,
        parent_expense_id: id,
        scope: expense.scope ?? "business",
        payment_method_id: expense.paymentMethodId ?? null,
      };
      const parentUpdate = {
        paid_installments: newPaid,
        paid: fullyPaid,
        due_date: fullyPaid ? expense.dueDate : nextDueDate,
        paid_date: fullyPaid ? today : null,
      };

      await upsertCachedRow("expenses", { ...childPayload, created_at: new Date().toISOString() });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "insert", recordId: childTempId, payload: childPayload });
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: parentUpdate });
        return;
      }

      await supabase.from("expenses").insert(childPayload as any);
      await supabase.from("expenses").update(parentUpdate).eq("id", id);

      // Saída no extrato: parcela paga (apenas business)
      if (!skipBalanceAdjust && (expense.scope ?? "business") === "business") {
        await recordLedger({
          direction: "out", category: "expense", amount: installmentAmount,
          description: `Despesa - ${expense.description} (${newPaid}/${expense.installments})`,
          occurred_on: today, expense_id: childTempId, source: "auto",
          payment_method_id: expense.paymentMethodId ?? null,
          metadata: { parent_expense_id: id, category: expense.category },
        });
      }
    } else {
      // Simple fixa expense — if a different paid amount was provided, update the amount
      // and stash the original in notes so we can restore it on unpay.
      const overrode = typeof paidAmount === "number" && paidAmount > 0 && paidAmount !== expense.amount;
      const finalAmount = overrode ? paidAmount! : expense.amount;
      const baseNotes = (expense.notes ?? "").replace(/\n?\[Original:\s*[\d.]+\]/gi, "").trimEnd();
      const finalNotes = overrode
        ? (baseNotes ? `${baseNotes}\n[Original: ${expense.amount.toFixed(2)}]` : `[Original: ${expense.amount.toFixed(2)}]`)
        : expense.notes ?? null;

      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: true, paidDate: today, amount: finalAmount, notes: finalNotes,
      } : e));

      const updatePayload = { paid: true, paid_date: today, amount: finalAmount, notes: finalNotes };
      await upsertCachedRow("expenses", { ...expense, ...updatePayload, id });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
        return;
      }

      await supabase.from("expenses").update(updatePayload).eq("id", id);

      // Saída no extrato: despesa simples paga (apenas business)
      if (!skipBalanceAdjust && (expense.scope ?? "business") === "business") {
        await recordLedger({
          direction: "out", category: "expense", amount: finalAmount,
          description: `Despesa - ${expense.description}`,
          occurred_on: today, expense_id: id, source: "auto",
          payment_method_id: expense.paymentMethodId ?? null,
          metadata: { category: expense.category },
        });
      }

      // Piggy bank credit: only when the piggy expense is paid.
      const piggyId = extractPiggyId(expense.notes);
      if (piggyId) {
        // Avoid duplicate deposits if one already exists for this expense.
        const { data: existing } = await supabase
          .from("piggy_bank_deposits" as any)
          .select("id")
          .eq("expense_id", id)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("piggy_bank_deposits" as any).insert({
            user_id: dataOwnerId,
            piggy_bank_id: piggyId,
            expense_id: id,
            amount: finalAmount,
            deposit_date: today,
            source: "expense",
          });
        }
      }
    }

    // Trigger budget overrun alert (push + Telegram) for personal expenses
    if (expense.scope === "personal" && online) {
      supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
    }
  }, [expenses, dataOwnerId]);

  const unpayExpense = useCallback(async (id: string) => {
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;

    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;
    const online = isOnline();

    if (isRecorrenteParcelada && (expense.paidInstallments || 0) > 0) {
      const newPaid = (expense.paidInstallments || 0) - 1;
      const wasFullyPaid = expense.paid;
      const currentDue = new Date(expense.dueDate + "T00:00:00");
      if (!wasFullyPaid) currentDue.setMonth(currentDue.getMonth() - 1);
      const newDueDate = currentDue.toISOString().split("T")[0];

      // Find latest historical child record (online only — offline we can only update parent)
      let latestChildId: string | undefined;
      if (online) {
        const { data: children } = await supabase
          .from("expenses")
          .select("id, paid_date, created_at")
          .eq("parent_expense_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        latestChildId = children?.[0]?.id;
      }

      // Optimistic update
      setExpenses((prev) => prev
        .filter((e) => e.id !== latestChildId)
        .map((e) => e.id === id ? {
          ...e,
          paidInstallments: newPaid,
          paid: false,
          paidDate: undefined,
          dueDate: newDueDate,
        } : e));

      const parentUpdate = {
        paid_installments: newPaid,
        paid: false,
        paid_date: null,
        due_date: newDueDate,
      };

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: parentUpdate });
        return;
      }

      if (latestChildId) {
        // Reverte saldo + remove lançamento do extrato vinculado ao child (carteira correta)
        if ((expense.scope ?? "business") === "business") {
          await removeLedgerByRef({ expense_id: latestChildId, category: "expense" });
        }
        await supabase.from("expenses").delete().eq("id", latestChildId);
      }
      await supabase.from("expenses").update(parentUpdate).eq("id", id);
    } else if (expense.paid) {
      // Restore original amount if we stashed it on pay.
      const m = (expense.notes ?? "").match(/\[Original:\s*([\d.]+)\]/i);
      const restoredAmount = m ? parseFloat(m[1]) : expense.amount;
      const restoredNotes = (expense.notes ?? "").replace(/\n?\[Original:\s*[\d.]+\]/gi, "").trim() || null;

      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: false, paidDate: undefined, amount: restoredAmount, notes: restoredNotes,
      } : e));
      const updatePayload = { paid: false, paid_date: null, amount: restoredAmount, notes: restoredNotes };
      await upsertCachedRow("expenses", { ...expense, ...updatePayload, id });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
        return;
      }

      await supabase.from("expenses").update(updatePayload).eq("id", id);

      // Reverte saída do extrato (despesa simples) - apenas business
      if ((expense.scope ?? "business") === "business") {
        await removeLedgerByRef({ expense_id: id, category: "expense" });
      }

      // Reverse piggy bank credit when unpaying a piggy expense.
      if (extractPiggyId(expense.notes)) {
        await supabase.from("piggy_bank_deposits" as any).delete().eq("expense_id", id);
      }
    }
  }, [expenses]);

  const deleteExpense = useCallback(async (id: string, skipBalanceAdjust = false) => {
    const expense = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await removeCachedRow("expenses", id);
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "delete", recordId: id });
      return;
    }
    // Remove any piggy deposit linked to this expense (no-op if none).
    await supabase.from("piggy_bank_deposits" as any).delete().eq("expense_id", id);

    // Remove lançamento do extrato (reverte saldo na carteira correta automaticamente)
    await removeLedgerByRef({ expense_id: id, category: "expense" });

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) await enqueueMutation({ table: "expenses", op: "delete", recordId: id });
  }, [expenses]);

  const updateExpense = useCallback(async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...data } : e));
    const updatePayload: any = {
      description: data.description, amount: data.amount, type: data.type,
      category: data.category, installments: data.installments,
      paid_installments: data.paidInstallments, due_date: data.dueDate,
      paid: data.paid, paid_date: data.paidDate, notes: data.notes,
      payment_method_id: data.paymentMethodId,
    };
    Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
      return;
    }
    const { error } = await supabase.from("expenses").update(updatePayload).eq("id", id);
    if (error) await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
  }, []);

  return { expenses, addExpense, payExpense, unpayExpense, deleteExpense, updateExpense };
}
