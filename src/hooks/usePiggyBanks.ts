import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useDataOwner } from "./useDataOwner";
import { toast } from "sonner";

export interface PiggyBank {
  id: string;
  name: string;
  color: string;
  icon: string;
  annualRate: number;
  createdAt: string;
}

export interface PiggyBankDeposit {
  id: string;
  piggyBankId: string;
  expenseId?: string | null;
  amount: number;
  depositDate: string; // YYYY-MM-DD
}

const PIGGY_TAG_RE = /\[cofrinho:([0-9a-f-]{36})\]/i;

/** Build the notes tag used to mark an expense as a piggy-bank transfer. */
export const buildPiggyTag = (piggyId: string, original?: string) =>
  `[cofrinho:${piggyId}]${original ? " " + original : ""}`;

/** Extract a piggy bank id from an expense.notes string, if present. */
export const extractPiggyId = (notes?: string | null): string | null => {
  if (!notes) return null;
  const m = notes.match(PIGGY_TAG_RE);
  return m ? m[1] : null;
};

/** True when an expense should be excluded from monthly spending totals. */
export const isPiggyExpense = (notes?: string | null) => !!extractPiggyId(notes);

/**
 * Compound daily yield: amount * (1 + annualRate/100)^(days/365) - amount.
 * Uses today's date in local time for the day count.
 */
export function computePiggyBalance(
  deposits: PiggyBankDeposit[],
  annualRatePct: number,
  asOf: Date = new Date()
) {
  const dailyFactor = Math.pow(1 + annualRatePct / 100, 1 / 365);
  const todayMs = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime();
  let principal = 0;
  let total = 0;
  for (const d of deposits) {
    const [y, m, day] = d.depositDate.split("-").map(Number);
    const depMs = new Date(y, (m || 1) - 1, day || 1).getTime();
    const days = Math.max(0, Math.floor((todayMs - depMs) / 86_400_000));
    principal += d.amount;
    total += d.amount * Math.pow(dailyFactor, days);
  }
  return { principal, balance: total, yield: total - principal };
}

export function usePiggyBanks() {
  const { user } = useAuth();
  const dataOwnerId = useDataOwner();
  const [piggyBanks, setPiggyBanks] = useState<PiggyBank[]>([]);
  const [deposits, setDeposits] = useState<PiggyBankDeposit[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!dataOwnerId) return;
    const [pbRes, dpRes] = await Promise.all([
      supabase.from("piggy_banks" as any).select("*").eq("user_id", dataOwnerId).order("created_at"),
      supabase.from("piggy_bank_deposits" as any).select("*").eq("user_id", dataOwnerId),
    ]);
    if (!pbRes.error) {
      setPiggyBanks(((pbRes.data as any[]) || []).map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        icon: r.icon,
        annualRate: Number(r.annual_rate),
        createdAt: r.created_at,
      })));
    }
    if (!dpRes.error) {
      setDeposits(((dpRes.data as any[]) || []).map((r) => ({
        id: r.id,
        piggyBankId: r.piggy_bank_id,
        expenseId: r.expense_id,
        amount: Number(r.amount),
        depositDate: r.deposit_date,
      })));
    }
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { reload(); }, [reload]);

  const createPiggyBank = useCallback(async (data: { name: string; color?: string; icon?: string; annualRate?: number }) => {
    if (!user || !dataOwnerId) return null;
    const { data: row, error } = await (supabase as any).from("piggy_banks").insert({
      user_id: dataOwnerId,
      name: data.name,
      color: data.color ?? "210 80% 55%",
      icon: data.icon ?? "PiggyBank",
      annual_rate: data.annualRate ?? 11.15,
    }).select().single();
    if (error) { toast.error("Erro ao criar cofrinho"); return null; }
    await reload();
    return (row as any)?.id as string;
  }, [user, dataOwnerId, reload]);

  const updatePiggyBank = useCallback(async (id: string, patch: Partial<{ name: string; color: string; icon: string; annualRate: number }>) => {
    const dbPatch: any = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.color !== undefined) dbPatch.color = patch.color;
    if (patch.icon !== undefined) dbPatch.icon = patch.icon;
    if (patch.annualRate !== undefined) dbPatch.annual_rate = patch.annualRate;
    const { error } = await supabase.from("piggy_banks" as any).update(dbPatch).eq("id", id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    await reload();
  }, [reload]);

  const deletePiggyBank = useCallback(async (id: string) => {
    const { error } = await supabase.from("piggy_banks" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir cofrinho"); return; }
    await reload();
  }, [reload]);

  const addDeposit = useCallback(async (input: { piggyBankId: string; amount: number; depositDate: string; expenseId?: string }) => {
    if (!dataOwnerId) return;
    const { error } = await supabase.from("piggy_bank_deposits" as any).insert({
      user_id: dataOwnerId,
      piggy_bank_id: input.piggyBankId,
      expense_id: input.expenseId ?? null,
      amount: input.amount,
      deposit_date: input.depositDate,
    });
    if (error) { toast.error("Erro ao registrar aporte"); return; }
    await reload();
  }, [dataOwnerId, reload]);

  const removeDepositByExpenseId = useCallback(async (expenseId: string) => {
    await supabase.from("piggy_bank_deposits" as any).delete().eq("expense_id", expenseId);
    await reload();
  }, [reload]);

  const balances = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePiggyBalance>>();
    for (const pb of piggyBanks) {
      const ds = deposits.filter((d) => d.piggyBankId === pb.id);
      map.set(pb.id, computePiggyBalance(ds, pb.annualRate));
    }
    return map;
  }, [piggyBanks, deposits]);

  return {
    piggyBanks,
    deposits,
    balances,
    loading,
    createPiggyBank,
    updatePiggyBank,
    deletePiggyBank,
    addDeposit,
    removeDepositByExpenseId,
    reload,
  };
}
