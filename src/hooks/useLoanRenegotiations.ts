import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { LoanRenegotiation } from "@/types/loan";

function rowToRenegotiation(r: any): LoanRenegotiation {
  return {
    id: r.id,
    loanId: r.loan_id,
    userId: r.user_id,
    renegotiatedAt: r.renegotiated_at,
    type: r.type,
    previousAmount: Number(r.previous_amount ?? 0),
    newAmount: Number(r.new_amount ?? 0),
    penaltyAmount: Number(r.penalty_amount ?? 0),
    penaltyMode: r.penalty_mode ?? null,
    penaltyInput: r.penalty_input != null ? Number(r.penalty_input) : null,
    previousInstallments: r.previous_installments ?? null,
    newInstallments: r.new_installments ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
  };
}

export function useLoanRenegotiations() {
  const { user, dataOwnerId } = useAuth();
  const [renegotiations, setRenegotiations] = useState<LoanRenegotiation[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("loan_renegotiations" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setRenegotiations((data as any[]).map(rowToRenegotiation));
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll, dataOwnerId]);

  const updateRenegotiation = useCallback(
    async (
      id: string,
      patch: { notes?: string | null; type?: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null },
    ) => {
      const updatePayload: any = {};
      if (patch.notes !== undefined) updatePayload.notes = patch.notes;
      if (patch.type !== undefined) updatePayload.type = patch.type;
      if (patch.penaltyMode !== undefined) updatePayload.penalty_mode = patch.penaltyMode;
      if (patch.penaltyInput !== undefined) updatePayload.penalty_input = patch.penaltyInput;
      const { error } = await supabase
        .from("loan_renegotiations" as any)
        .update(updatePayload)
        .eq("id", id);
      if (error) throw new Error(error.message);
      setRenegotiations((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                notes: patch.notes !== undefined ? patch.notes : r.notes,
                type: patch.type !== undefined ? patch.type : r.type,
                penaltyMode: patch.penaltyMode !== undefined ? patch.penaltyMode : r.penaltyMode,
                penaltyInput: patch.penaltyInput !== undefined ? patch.penaltyInput : r.penaltyInput,
              }
            : r,
        ),
      );
    },
    [],
  );

  const deleteRenegotiation = useCallback(async (id: string) => {
    const { error } = await supabase.from("loan_renegotiations" as any).delete().eq("id", id);
    if (error) throw new Error(error.message);
    setRenegotiations((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { renegotiations, refresh: fetchAll, updateRenegotiation, deleteRenegotiation };
}
