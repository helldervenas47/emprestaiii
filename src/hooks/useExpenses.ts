import { useState, useCallback, useEffect } from "react";
import { Expense } from "@/types/loan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useExpenses(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const fetchExpenses = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setExpenses(data.map((e: any) => ({
        id: e.id, description: e.description, amount: Number(e.amount),
        type: e.type as "fixa" | "recorrente", category: e.category,
        installments: e.installments, paidInstallments: e.paid_installments,
        dueDate: e.due_date, paid: e.paid, paidDate: e.paid_date,
        notes: e.notes, createdAt: e.created_at,
        parentExpenseId: e.parent_expense_id ?? undefined,
        scope: (e.scope as "business" | "personal") ?? "business",
      })));
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
  }, [user, fetchExpenses]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => {
    if (!user || !dataOwnerId) return;
    const tempId = crypto.randomUUID();
    const optimistic: Expense = {
      ...expense, id: tempId, paid: false, paidDate: undefined,
      paidInstallments: 0, createdAt: new Date().toISOString(),
      scope: expense.scope ?? "business",
    };
    setExpenses((prev) => [optimistic, ...prev]);

    const { data, error } = await supabase.from("expenses").insert({
      user_id: dataOwnerId, description: expense.description, amount: expense.amount,
      type: expense.type, category: expense.category, installments: expense.installments,
      paid_installments: 0, due_date: expense.dueDate, paid: false,
      notes: expense.notes ?? null,
      scope: expense.scope ?? "business",
    } as any).select().single();

    if (error) {
      setExpenses((prev) => prev.filter((e) => e.id !== tempId));
    } else if (data) {
      setExpenses((prev) => prev.map((e) => e.id === tempId ? { ...e, id: data.id, createdAt: data.created_at } : e));
      // Trigger budget overrun push notification check (personal scope only)
      if ((expense.scope ?? "business") === "personal") {
        supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
      }
    }
  }, [user, dataOwnerId]);

  const payExpense = useCallback(async (id: string, skipBalanceAdjust = false, payDate?: string) => {
    if (!dataOwnerId) return;
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return;

    const today = payDate || new Date().toISOString().split("T")[0];
    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;

    if (isRecorrenteParcelada) {
      const installmentAmount = expense.amount / expense.installments!;
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

      // Insert historical record (paid installment snapshot)
      await supabase.from("expenses").insert({
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
      });

      // Update parent recurring expense
      await supabase.from("expenses").update({
        paid_installments: newPaid,
        paid: fullyPaid,
        due_date: fullyPaid ? expense.dueDate : nextDueDate,
        paid_date: fullyPaid ? today : null,
      }).eq("id", id);
    } else {
      // Simple fixa expense
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: true, paidDate: today,
      } : e));
      await supabase.from("expenses").update({
        paid: true, paid_date: today,
      }).eq("id", id);
    }

    // Trigger budget overrun alert (push + Telegram) for personal expenses
    if (expense.scope === "personal") {
      supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
    }
  }, [expenses, dataOwnerId]);

  const unpayExpense = useCallback(async (id: string) => {
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;

    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;

    if (isRecorrenteParcelada && (expense.paidInstallments || 0) > 0) {
      const installmentAmount = expense.amount / expense.installments!;
      const newPaid = (expense.paidInstallments || 0) - 1;
      const wasFullyPaid = expense.paid;
      // If was fully paid, dueDate already points to last installment; otherwise step back one month
      const currentDue = new Date(expense.dueDate + "T00:00:00");
      if (!wasFullyPaid) currentDue.setMonth(currentDue.getMonth() - 1);
      const newDueDate = currentDue.toISOString().split("T")[0];

      // Find latest historical child record
      const { data: children } = await supabase
        .from("expenses")
        .select("id, paid_date, created_at")
        .eq("parent_expense_id", id)
        .order("created_at", { ascending: false })
        .limit(1);
      const latestChildId = children?.[0]?.id;

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

      if (latestChildId) {
        await supabase.from("expenses").delete().eq("id", latestChildId);
      }
      await supabase.from("expenses").update({
        paid_installments: newPaid,
        paid: false,
        paid_date: null,
        due_date: newDueDate,
      }).eq("id", id);
    } else if (expense.paid) {
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: false, paidDate: undefined,
      } : e));
      await supabase.from("expenses").update({
        paid: false, paid_date: null,
      }).eq("id", id);
    }
  }, [expenses]);

  const deleteExpense = useCallback(async (id: string, skipBalanceAdjust = false) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("expenses").delete().eq("id", id);
  }, [expenses]);

  const updateExpense = useCallback(async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...data } : e));
    await supabase.from("expenses").update({
      description: data.description, amount: data.amount, type: data.type,
      category: data.category, installments: data.installments,
      paid_installments: data.paidInstallments, due_date: data.dueDate,
      paid: data.paid, paid_date: data.paidDate, notes: data.notes,
    }).eq("id", id);
  }, []);

  return { expenses, addExpense, payExpense, unpayExpense, deleteExpense, updateExpense };
}
