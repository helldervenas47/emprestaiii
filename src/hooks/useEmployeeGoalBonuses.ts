import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export interface EmployeeGoalBonus {
  id: string;
  employeeId: string;
  enabled: boolean;
  minScore: number;
  bonusAmount: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS =
  "id, employee_id, enabled, min_score, bonus_amount, start_date, end_date, notes, created_at, updated_at";

function rowToBonus(r: any): EmployeeGoalBonus {
  return {
    id: r.id,
    employeeId: r.employee_id,
    enabled: !!r.enabled,
    minScore: Number(r.min_score ?? 0),
    bonusAmount: Number(r.bonus_amount ?? 0),
    startDate: r.start_date,
    endDate: r.end_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function useEmployeeGoalBonuses() {
  const { user, dataOwnerId } = useAuth();
  const [bonuses, setBonuses] = useState<EmployeeGoalBonus[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("employee_goal_bonuses" as any)
      .select(COLUMNS);
    setBonuses(((data as any[]) ?? []).map(rowToBonus));
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!user || !dataOwnerId) return;
    const ch = supabase
      .channel(`employee_goal_bonuses:${dataOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_goal_bonuses", filter: `user_id=eq.${dataOwnerId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, dataOwnerId, fetchAll]);

  const getForEmployee = useCallback(
    (employeeId: string) => bonuses.find((b) => b.employeeId === employeeId) ?? null,
    [bonuses],
  );

  const upsertForEmployee = useCallback(async (
    employeeId: string,
    patch: Omit<EmployeeGoalBonus, "id" | "employeeId" | "createdAt" | "updatedAt">,
  ) => {
    assertWritable();
    if (!dataOwnerId) return;
    const existing = bonuses.find((b) => b.employeeId === employeeId);
    const payload: any = {
      user_id: dataOwnerId,
      employee_id: employeeId,
      enabled: patch.enabled,
      min_score: patch.minScore,
      bonus_amount: patch.bonusAmount,
      start_date: patch.startDate,
      end_date: patch.endDate,
      notes: patch.notes,
    };
    if (existing) {
      await supabase.from("employee_goal_bonuses" as any).update(payload).eq("id", existing.id);
    } else {
      await supabase.from("employee_goal_bonuses" as any).insert(payload);
    }
    await fetchAll();
  }, [dataOwnerId, bonuses, fetchAll]);

  const removeForEmployee = useCallback(async (employeeId: string) => {
    assertWritable();
    const existing = bonuses.find((b) => b.employeeId === employeeId);
    if (!existing) return;
    await supabase.from("employee_goal_bonuses" as any).delete().eq("id", existing.id);
    await fetchAll();
  }, [bonuses, fetchAll]);

  return { bonuses, loading, getForEmployee, upsertForEmployee, removeForEmployee, refresh: fetchAll };
}
