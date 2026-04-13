import { useState, useCallback, useEffect } from "react";
import { Expense } from "@/types/loan";
import { adjustBalance } from "@/lib/balance";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useExpenses() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const fetchExpenses = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setExpenses(data.map((e: any) => ({
        id: e.id, description: e.description, amount: Number(e.amount),
        type: e.type as "fixa" | "recorrente", category: e.category,
        installments: e.installments, paidInstallments: e.paid_installments,
        dueDate: e.due_date, paid: e.paid, paidDate: e.paid_date,
        notes: e.notes, createdAt: e.created_at,
      })));
    }
  }, [user]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => {
    if (!user) return;
    const tempId = crypto.randomUUID();
    const optimistic: Expense = {
      ...expense, id: tempId, paid: false, paidDate: undefined,
      paidInstallments: 0, createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => [optimistic, ...prev]);

    const { data, error } = await supabase.from("expenses").insert({
      user_id: user.id, description: expense.description, amount: expense.amount,
      type: expense.type, category: expense.category, installments: expense.installments,
      paid_installments: 0, due_date: expense.dueDate, paid: false,
    }).select().single();

    if (error) {
      setExpenses((prev) => prev.filter((e) => e.id !== tempId));
    } else if (data) {
      setExpenses((prev) => prev.map((e) => e.id === tempId ? { ...e, id: data.id, createdAt: data.created_at } : e));
    }
  }, [user]);

  const payExpense = useCallback(async (id: string, skipBalanceAdjust = false) => {
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return;

    if (expense.type === "recorrente" && expense.installments && expense.installments > 1) {
      const installmentAmount = expense.amount / expense.installments;
      const newPaid = (expense.paidInstallments || 0) + 1;
      const fullyPaid = newPaid >= expense.installments;
      // Advance due date to next month
      const currentDue = new Date(expense.dueDate + "T00:00:00");
      currentDue.setMonth(currentDue.getMonth() + 1);
      const newDueDate = fullyPaid ? expense.dueDate : currentDue.toISOString().split("T")[0];
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paidInstallments: newPaid, paid: fullyPaid,
        dueDate: newDueDate,
        paidDate: fullyPaid ? new Date().toISOString().split("T")[0] : undefined,
      } : e));
      if (!skipBalanceAdjust) await adjustBalance(-installmentAmount);
      await supabase.from("expenses").update({
        paid_installments: newPaid, paid: fullyPaid,
        due_date: newDueDate,
        paid_date: fullyPaid ? new Date().toISOString().split("T")[0] : null,
      }).eq("id", id);
    } else {
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: true, paidDate: new Date().toISOString().split("T")[0],
      } : e));
      if (!skipBalanceAdjust) await adjustBalance(-expense.amount);
      await supabase.from("expenses").update({
        paid: true, paid_date: new Date().toISOString().split("T")[0],
      }).eq("id", id);
    }
  }, [expenses]);

  const unpayExpense = useCallback(async (id: string) => {
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;

    if (expense.type === "recorrente" && expense.installments && expense.installments > 1 && (expense.paidInstallments || 0) > 0) {
      const installmentAmount = expense.amount / expense.installments;
      const newPaid = (expense.paidInstallments || 0) - 1;
      // Move due date back one month
      const currentDue = new Date(expense.dueDate + "T00:00:00");
      currentDue.setMonth(currentDue.getMonth() - 1);
      const newDueDate = currentDue.toISOString().split("T")[0];
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paidInstallments: newPaid, paid: false, paidDate: undefined, dueDate: newDueDate,
      } : e));
      await adjustBalance(installmentAmount);
      await supabase.from("expenses").update({
        paid_installments: newPaid, paid: false, paid_date: null, due_date: newDueDate,
      }).eq("id", id);
    } else if (expense.paid) {
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: false, paidDate: undefined,
      } : e));
      await adjustBalance(expense.amount);
      await supabase.from("expenses").update({
        paid: false, paid_date: null,
      }).eq("id", id);
    }

  const deleteExpense = useCallback(async (id: string, skipBalanceAdjust = false) => {
    const expense = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (expense?.paid && !skipBalanceAdjust) {
      await adjustBalance(expense.amount);
    }
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

  return { expenses, addExpense, payExpense, deleteExpense, updateExpense };
}
