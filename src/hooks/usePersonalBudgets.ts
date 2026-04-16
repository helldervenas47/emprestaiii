import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface PersonalBudget {
  id: string;
  category: string;
  amount: number;
}

export function usePersonalBudgets(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [budgets, setBudgets] = useState<PersonalBudget[]>([]);

  const fetchBudgets = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("personal_budgets" as any)
      .select("id, category, amount");
    if (data) {
      setBudgets((data as any[]).map((b) => ({ id: b.id, category: b.category, amount: Number(b.amount) })));
    }
  }, [user]);

  useEffect(() => { if (enabled) fetchBudgets(); }, [fetchBudgets, enabled]);

  useEffect(() => {
    if (!user || !enabled) return;
    const channel = supabase
      .channel("personal_budgets-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "personal_budgets" }, () => fetchBudgets())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, enabled, fetchBudgets]);

  const setBudget = useCallback(async (category: string, amount: number) => {
    if (!dataOwnerId) return;
    const existing = budgets.find((b) => b.category === category);
    if (amount <= 0) {
      if (existing) {
        setBudgets((prev) => prev.filter((b) => b.id !== existing.id));
        await supabase.from("personal_budgets" as any).delete().eq("id", existing.id);
      }
      return;
    }
    if (existing) {
      setBudgets((prev) => prev.map((b) => b.id === existing.id ? { ...b, amount } : b));
      await supabase.from("personal_budgets" as any).update({ amount }).eq("id", existing.id);
    } else {
      const tempId = crypto.randomUUID();
      setBudgets((prev) => [...prev, { id: tempId, category, amount }]);
      const { data } = await supabase
        .from("personal_budgets" as any)
        .insert({ user_id: dataOwnerId, category, amount } as any)
        .select()
        .single();
      if (data) setBudgets((prev) => prev.map((b) => b.id === tempId ? { ...b, id: (data as any).id } : b));
    }
  }, [budgets, dataOwnerId]);

  return { budgets, setBudget };
}
