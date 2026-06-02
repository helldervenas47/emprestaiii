import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { ManagerCommission } from "@/types/loan";

export function useManagerCommissions(enabled: boolean = true) {
  const { user, dataOwnerId } = useAuth();
  const [commissions, setCommissions] = useState<ManagerCommission[]>([]);

  const fetch = useCallback(async () => {
    if (!user || !enabled) return;
    const { data } = await supabase
      .from("manager_commissions")
      .select("*")
      .order("generated_at", { ascending: false });
    if (data) {
      setCommissions(
        data.map((c: any) => ({
          id: c.id,
          loanId: c.loan_id,
          managerId: c.manager_id,
          paymentId: c.payment_id,
          commissionType: c.commission_type as "interest" | "full",
          baseAmount: Number(c.base_amount),
          rate: Number(c.rate),
          amount: Number(c.amount),
          generatedAt: c.generated_at,
          notes: c.notes,
          createdAt: c.created_at,
        }))
      );
    }
  }, [user, enabled]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!user || !enabled) return;
    const channelName = `manager-commissions-realtime-${user.id}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "manager_commissions" },
        () => fetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "loans" },
        () => fetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, enabled, fetch]);

  const addCommission = useCallback(
    async (params: {
      loanId: string;
      managerId: string;
      paymentId?: string | null;
      commissionType: "interest" | "full";
      baseAmount: number;
      rate: number;
      generatedAt: string;
      notes?: string;
    }) => {
      if (!user || !dataOwnerId) return;
      const amount = (params.baseAmount * params.rate) / 100;
      const { error } = await supabase.from("manager_commissions").insert({
        user_id: dataOwnerId,
        loan_id: params.loanId,
        manager_id: params.managerId,
        payment_id: params.paymentId ?? null,
        commission_type: params.commissionType,
        base_amount: params.baseAmount,
        rate: params.rate,
        amount,
        generated_at: params.generatedAt,
        notes: params.notes ?? null,
      });
      if (!error) await fetch();
    },
    [user, dataOwnerId, fetch]
  );

  return { commissions, addCommission, refresh: fetch };
}
