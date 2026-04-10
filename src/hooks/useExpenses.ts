import { useState, useCallback } from "react";
import { Expense } from "@/types/loan";
import { adjustBalance } from "@/lib/balance";

const EXPENSES_KEY = "expenses_data";

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

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() => loadFromStorage<Expense>(EXPENSES_KEY, []));

  const addExpense = useCallback((expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => {
    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID(),
      paid: false,
      createdAt: new Date().toISOString(),
    };
    setExpenses((prev) => {
      const updated = [...prev, newExpense];
      saveToStorage(EXPENSES_KEY, updated);
      return updated;
    });
  }, []);

  const payExpense = useCallback((id: string) => {
    setExpenses((prev) => {
      const expense = prev.find((e) => e.id === id);
      if (!expense || expense.paid) return prev;
      adjustBalance(-expense.amount);
      const updated = prev.map((e) =>
        e.id === id ? { ...e, paid: true, paidDate: new Date().toISOString().split("T")[0] } : e
      );
      saveToStorage(EXPENSES_KEY, updated);
      return updated;
    });
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => {
      const expense = prev.find((e) => e.id === id);
      if (expense?.paid) {
        adjustBalance(expense.amount);
      }
      const updated = prev.filter((e) => e.id !== id);
      saveToStorage(EXPENSES_KEY, updated);
      return updated;
    });
  }, []);

  const updateExpense = useCallback((id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    setExpenses((prev) => {
      const updated = prev.map((e) => (e.id === id ? { ...e, ...data } : e));
      saveToStorage(EXPENSES_KEY, updated);
      return updated;
    });
  }, []);

  return { expenses, addExpense, payExpense, deleteExpense, updateExpense };
}
