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
        id: e.id,
        description: e.description,
        amount: Number(e.amount),
        type: e.type as "fixa" | "recorrente",
        category: e.category,
        installments: e.installments,
        paidInstallments: e.paid_installments,
        dueDate: e.due_date,
        paid: e.paid,
        paidDate: e.paid_date,
        notes: e.notes,
        createdAt: e.created_at,
      })));
    }
  }, [user]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => {
    if (!user) return;
    await supabase.from("expenses").insert({
      user_id: user.id,
      description: expense.description,
      amount: expense.amount,
      type: expense.type,
      category: expense.category,
      installments: expense.installments,
      paid_installments: 0,
      due_date: expense.dueDate,
      paid: false,
    });
    fetchExpenses();
  }, [user, fetchExpenses]);

  const payExpense = useCallback(async (id: string) => {
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return;

    if (expense.type === "recorrente" && expense.installments && expense.installments > 1) {
      const installmentAmount = expense.amount / expense.installments;
      await adjustBalance(-installmentAmount);
      const newPaid = (expense.paidInstallments || 0) + 1;
      const fullyPaid = newPaid >= expense.installments;
      await supabase.from("expenses").update({
        paid_installments: newPaid,
        paid: fullyPaid,
        paid_date: fullyPaid ? new Date().toISOString().split("T")[0] : null,
      }).eq("id", id);
    } else {
      await adjustBalance(-expense.amount);
      await supabase.from("expenses").update({
        paid: true,
        paid_date: new Date().toISOString().split("T")[0],
      }).eq("id", id);
    }
    fetchExpenses();
  }, [expenses, fetchExpenses]);

  const deleteExpense = useCallback(async (id: string) => {
    const expense = expenses.find((e) => e.id === id);
    if (expense?.paid) {
      await adjustBalance(expense.amount);
    }
    await supabase.from("expenses").delete().eq("id", id);
    fetchExpenses();
  }, [expenses, fetchExpenses]);

  const updateExpense = useCallback(async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    await supabase.from("expenses").update({
      description: data.description,
      amount: data.amount,
      type: data.type,
      category: data.category,
      installments: data.installments,
      paid_installments: data.paidInstallments,
      due_date: data.dueDate,
      paid: data.paid,
      paid_date: data.paidDate,
      notes: data.notes,
    }).eq("id", id);
    fetchExpenses();
  }, [fetchExpenses]);

  return { expenses, addExpense, payExpense, deleteExpense, updateExpense };
}
