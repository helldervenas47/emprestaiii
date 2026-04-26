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

  return { renegotiations, refresh: fetchAll };
}
