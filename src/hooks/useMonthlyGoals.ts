import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";

export type GoalType = "interest_rate" | "profit";

export interface MonthlyGoal {
  id: string;
  goalType: GoalType;
  month: string; // YYYY-MM
  targetValue: number;
  notes?: string | null;
}

export function useMonthlyGoals() {
  const ownerId = useDataOwner();
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("monthly_goals")
      .select("*")
      .order("month", { ascending: false });
    if (error) {
      console.error("Erro ao carregar metas:", error);
      return;
    }
    setGoals(
      (data || []).map((d: any) => ({
        id: d.id,
        goalType: d.goal_type as GoalType,
        month: d.month,
        targetValue: Number(d.target_value),
        notes: d.notes,
      }))
    );
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (ownerId) load();
  }, [ownerId, load]);

  const upsertGoal = async (goalType: GoalType, month: string, targetValue: number, notes?: string) => {
    if (!ownerId) return;
    const { error } = await supabase
      .from("monthly_goals")
      .upsert(
        { user_id: ownerId, goal_type: goalType, month, target_value: targetValue, notes: notes || null },
        { onConflict: "user_id,goal_type,month" }
      );
    if (error) {
      toast.error("Erro ao salvar meta");
      return;
    }
    toast.success("Meta salva!");
    await load();
  };

  const deleteGoal = async (id: string) => {
    const { error } = await supabase.from("monthly_goals").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao excluir meta");
      return;
    }
    toast.success("Meta excluída!");
    await load();
  };

  const getGoal = useCallback(
    (goalType: GoalType, month: string): MonthlyGoal | undefined =>
      goals.find((g) => g.goalType === goalType && g.month === month),
    [goals]
  );

  return { goals, loading, upsertGoal, deleteGoal, getGoal, reload: load };
}

export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${names[m - 1]} ${y}`;
}
