import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { useDataOwner } from "./useDataOwner";
import { toast } from "sonner";
import {
  computePiggyDetailed as computePiggyDetailedSeg,
  type PiggyDetailed,
  type RatePeriod,
} from "@/lib/piggyTax";
import { recordLedger } from "@/lib/ledger";
import { getBalances } from "@/lib/balance";

export interface PiggyBankRateHistory {
  id: string;
  piggyBankId: string;
  annualRate: number;
  effectiveFrom: string; // YYYY-MM-DD
  createdAt: string;
}

export interface PiggyBank {
  id: string;
  shortId: number | null;
  name: string;
  color: string;
  icon: string;
  annualRate: number;
  autoRate: boolean;
  cdiPercent: number;
  goalAmount: number | null;
  category: string | null;
  targetDate: string | null;
  createdAt: string;
}

export interface MarketRate {
  indicator: string;
  annualRate: number;
  source: string | null;
  referenceDate: string | null;
  fetchedAt: string;
}

export interface PiggyBankDeposit {
  id: string;
  piggyBankId: string;
  expenseId?: string | null;
  amount: number;
  depositDate: string; // YYYY-MM-DD
  source?: string; // 'expense' | 'manual' | 'recurring'
  recurrenceId?: string | null;
}

export interface PiggyBankRecurrence {
  id: string;
  piggyBankId: string;
  amount: number;
  startDate: string;
  endDate: string | null;
  dayOfMonth: number;
  description?: string | null;
  active: boolean;
  lastGeneratedDate: string | null;
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
 * Negative deposits (manual withdrawals/adjustments) reduce balance without yield.
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
    if (d.amount >= 0) {
      total += d.amount * Math.pow(dailyFactor, days);
    } else {
      // withdrawals/adjustments don't earn yield going forward
      total += d.amount;
    }
  }
  return { principal, balance: total, yield: total - principal };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/**
 * Generate due dates for a recurrence. Catch-up é limitado ao mês corrente:
 * datas anteriores ao primeiro dia do mês atual são ignoradas (sem geração
 * retroativa de meses passados).
 */
function dueDatesFor(rec: PiggyBankRecurrence, today: Date): string[] {
  const start = parseYmd(rec.startDate);
  const end = rec.endDate ? parseYmd(rec.endDate) : null;
  const lastGen = rec.lastGeneratedDate ? parseYmd(rec.lastGeneratedDate) : null;
  const monthFloor = new Date(today.getFullYear(), today.getMonth(), 1);
  const result: string[] = [];

  // First due date = start
  // Subsequent = same day_of_month each next month
  const firstYear = start.getFullYear();
  const firstMonth = start.getMonth();
  const day = rec.dayOfMonth;

  for (let i = 0; i < 600; i++) {
    const d = new Date(firstYear, firstMonth + i, day);
    if (d.getMonth() !== ((firstMonth + i) % 12 + 12) % 12) {
      // overflow (e.g. day 31 in Feb) -> use last day of month
      d.setDate(0);
    }
    if (d < start) continue;
    if (end && d > end) break;
    if (d > today) break;
    if (lastGen && d <= lastGen) continue;
    if (d < monthFloor) continue; // não gera retroativo de meses passados
    result.push(ymd(d));
  }
  return result;
}

export function usePiggyBanks() {
  const { user } = useAuth();
  const dataOwnerId = useDataOwner();
  const [piggyBanks, setPiggyBanks] = useState<PiggyBank[]>([]);
  const [deposits, setDeposits] = useState<PiggyBankDeposit[]>([]);
  const [recurrences, setRecurrences] = useState<PiggyBankRecurrence[]>([]);
  const [rateHistory, setRateHistory] = useState<PiggyBankRateHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const [cdiRate, setCdiRate] = useState<MarketRate | null>(null);

  const reload = useCallback(async () => {
    if (!dataOwnerId) return;
    const [pbRes, dpRes, rcRes, rhRes, mrRes] = await Promise.all([
      supabase.from("piggy_banks" as any).select("*").eq("user_id", dataOwnerId).order("created_at"),
      supabase.from("piggy_bank_deposits" as any).select("*").eq("user_id", dataOwnerId),
      supabase.from("piggy_bank_recurrences" as any).select("*").eq("user_id", dataOwnerId),
      supabase.from("piggy_bank_rate_history" as any).select("*").eq("user_id", dataOwnerId).order("effective_from"),
      supabase.from("market_rates" as any).select("*").eq("indicator", "cdi").maybeSingle(),
    ]);
    if (!pbRes.error) {
      setPiggyBanks(((pbRes.data as any[]) || []).map((r) => ({
        id: r.id,
        shortId: r.short_id ?? null,
        name: r.name,
        color: r.color,
        icon: r.icon,
        annualRate: Number(r.annual_rate),
        autoRate: Boolean(r.auto_rate),
        cdiPercent: r.cdi_percent != null ? Number(r.cdi_percent) : 100,
        goalAmount: r.goal_amount != null ? Number(r.goal_amount) : null,
        category: r.category ?? null,
        targetDate: r.target_date ?? null,
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
        source: r.source,
        recurrenceId: r.recurrence_id,
      })));
    }
    if (!rcRes.error) {
      setRecurrences(((rcRes.data as any[]) || []).map((r) => ({
        id: r.id,
        piggyBankId: r.piggy_bank_id,
        amount: Number(r.amount),
        startDate: r.start_date,
        endDate: r.end_date,
        dayOfMonth: r.day_of_month,
        description: r.description,
        active: r.active,
        lastGeneratedDate: r.last_generated_date,
      })));
    }
    if (!rhRes.error) {
      setRateHistory(((rhRes.data as any[]) || []).map((r) => ({
        id: r.id,
        piggyBankId: r.piggy_bank_id,
        annualRate: Number(r.annual_rate),
        effectiveFrom: r.effective_from,
        createdAt: r.created_at,
      })));
    }
    if (!mrRes.error && mrRes.data) {
      const r: any = mrRes.data;
      setCdiRate({
        indicator: r.indicator,
        annualRate: Number(r.annual_rate),
        source: r.source,
        referenceDate: r.reference_date,
        fetchedAt: r.fetched_at,
      });
    }
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { reload(); }, [reload]);

  // Realtime: keep all consumers (form + list) in sync when deposits/banks change.
  useEffect(() => {
    if (!dataOwnerId) return;
    const channel = supabase
      .channel(`piggy-realtime-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'piggy_bank_deposits' }, () => { reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'piggy_banks' }, () => { reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'piggy_bank_recurrences' }, () => { reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'piggy_bank_rate_history' }, () => { reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'market_rates' }, () => { reload(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dataOwnerId, reload]);

  // Auto-refresh CDI rate if cache is stale (>12h) — fire-and-forget.
  useEffect(() => {
    if (!dataOwnerId) return;
    const stale = !cdiRate || (Date.now() - new Date(cdiRate.fetchedAt).getTime()) > 12 * 3600 * 1000;
    if (!stale) return;
    supabase.functions.invoke("sync-cdi-rate", { body: {} }).catch(() => { /* silent */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataOwnerId, cdiRate?.fetchedAt]);

  // Auto-catch-up: generate missing recurring deposits whenever recurrences load.
  useEffect(() => {
    if (!dataOwnerId || recurrences.length === 0) return;
    const today = new Date();
    (async () => {
      let touched = false;
      for (const rec of recurrences) {
        if (!rec.active) continue;
        const due = dueDatesFor(rec, today);
        if (due.length === 0) continue;
        const rows = due.map((d) => ({
          user_id: dataOwnerId,
          piggy_bank_id: rec.piggyBankId,
          amount: rec.amount,
          deposit_date: d,
          source: "recurring",
          recurrence_id: rec.id,
        }));
        const { error } = await supabase.from("piggy_bank_deposits" as any).insert(rows);
        if (!error) {
          await supabase
            .from("piggy_bank_recurrences" as any)
            .update({ last_generated_date: due[due.length - 1] })
            .eq("id", rec.id);
          touched = true;
        }
      }
      if (touched) reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurrences, dataOwnerId]);

  const createPiggyBank = useCallback(async (data: { name: string; color?: string; icon?: string; annualRate?: number; autoRate?: boolean; cdiPercent?: number; shortId?: number | null }) => {
    if (!user || !dataOwnerId) return null;
    const payload: any = {
      user_id: dataOwnerId,
      name: data.name,
      color: data.color ?? "210 80% 55%",
      icon: data.icon ?? "PiggyBank",
      annual_rate: data.annualRate ?? 11.15,
      auto_rate: data.autoRate ?? false,
      cdi_percent: data.cdiPercent ?? 100,
    };
    if (data.shortId !== undefined && data.shortId !== null) payload.short_id = data.shortId;
    const { data: row, error } = await (supabase as any).from("piggy_banks").insert(payload).select().single();
    if (error) {
      const msg = error.message?.includes("piggy_banks_user_short_id_uniq")
        ? `Já existe uma caixinha com o número ${data.shortId}`
        : error.message?.includes("piggy_banks_short_id_range")
          ? "O número da caixinha deve estar entre 1 e 99"
          : "Erro ao criar cofrinho";
      toast.error(msg);
      return null;
    }
    await reload();
    return (row as any)?.id as string;
  }, [user, dataOwnerId, reload]);

  const updatePiggyBank = useCallback(async (id: string, patch: Partial<{ name: string; color: string; icon: string; annualRate: number; autoRate: boolean; cdiPercent: number; shortId: number | null }>) => {
    const dbPatch: any = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.color !== undefined) dbPatch.color = patch.color;
    if (patch.icon !== undefined) dbPatch.icon = patch.icon;
    if (patch.annualRate !== undefined) dbPatch.annual_rate = patch.annualRate;
    if (patch.autoRate !== undefined) dbPatch.auto_rate = patch.autoRate;
    if (patch.cdiPercent !== undefined) dbPatch.cdi_percent = patch.cdiPercent;
    if (patch.shortId !== undefined) dbPatch.short_id = patch.shortId;
    const { error } = await supabase.from("piggy_banks" as any).update(dbPatch).eq("id", id);
    if (error) {
      const msg = error.message?.includes("piggy_banks_user_short_id_uniq")
        ? `Já existe uma caixinha com o número ${patch.shortId}`
        : error.message?.includes("piggy_banks_short_id_range")
          ? "O número da caixinha deve estar entre 1 e 99"
          : "Erro ao atualizar";
      toast.error(msg);
      return;
    }
    await reload();
  }, [reload]);

  const deletePiggyBank = useCallback(async (id: string) => {
    const { error } = await supabase.from("piggy_banks" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir cofrinho"); return; }
    await reload();
  }, [reload]);

  const addDeposit = useCallback(async (input: { piggyBankId: string; amount: number; depositDate: string; expenseId?: string; source?: string }) => {
    if (!dataOwnerId) return;
    const { error } = await supabase.from("piggy_bank_deposits" as any).insert({
      user_id: dataOwnerId,
      piggy_bank_id: input.piggyBankId,
      expense_id: input.expenseId ?? null,
      amount: input.amount,
      deposit_date: input.depositDate,
      source: input.source ?? "expense",
    });
    if (error) { toast.error("Erro ao registrar aporte"); return; }
    await reload();
  }, [dataOwnerId, reload]);

  const removeDepositByExpenseId = useCallback(async (expenseId: string) => {
    await supabase.from("piggy_bank_deposits" as any).delete().eq("expense_id", expenseId);
    await reload();
  }, [reload]);

  /** Update a single deposit's amount and/or date. */
  const updateDeposit = useCallback(async (
    id: string,
    patch: Partial<{ amount: number; depositDate: string }>
  ) => {
    const dbPatch: any = {};
    if (patch.amount !== undefined) dbPatch.amount = patch.amount;
    if (patch.depositDate !== undefined) dbPatch.deposit_date = patch.depositDate;
    const { error } = await supabase.from("piggy_bank_deposits" as any).update(dbPatch).eq("id", id);
    if (error) { toast.error("Erro ao atualizar lançamento"); return; }
    await reload();
  }, [reload]);

  /** Delete a single deposit by id. */
  const deleteDeposit = useCallback(async (id: string) => {
    const { error } = await supabase.from("piggy_bank_deposits" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir lançamento"); return; }
    await reload();
  }, [reload]);

  /** Adjust the balance to a new target value by inserting a delta deposit (positive or negative). */
  const adjustBalance = useCallback(async (
    piggyBankId: string,
    newBalance: number,
    note?: string
  ) => {
    if (!dataOwnerId) return;
    const pb = piggyBanks.find((p) => p.id === piggyBankId);
    if (!pb) return;
    const ds = deposits.filter((d) => d.piggyBankId === piggyBankId);
    const current = computePiggyBalance(ds, pb.annualRate).balance;
    const delta = Number((newBalance - current).toFixed(2));
    if (delta === 0) {
      toast.info("Saldo já está nesse valor");
      return;
    }
    const { error } = await supabase.from("piggy_bank_deposits" as any).insert({
      user_id: dataOwnerId,
      piggy_bank_id: piggyBankId,
      amount: delta,
      deposit_date: ymd(new Date()),
      source: "manual",
      // expense_id stays null -> won't affect any expense
    });
    if (error) { toast.error("Erro ao ajustar saldo"); return; }
    toast.success(`Saldo ajustado em ${delta > 0 ? "+" : ""}${delta.toFixed(2)}`);
    await reload();
  }, [dataOwnerId, piggyBanks, deposits, reload]);

  /**
   * Guarda dinheiro: debita o saldo da conta e credita no cofrinho.
   * Registra uma transferência interna (categoria 'transfer') que NÃO entra
   * em receitas/despesas operacionais nem em relatórios contábeis.
   */
  const storeMoney = useCallback(async (piggyBankId: string, amount: number) => {
    if (!dataOwnerId) return false;
    const value = Number(amount.toFixed(2));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor válido");
      return false;
    }
    const pb = piggyBanks.find((p) => p.id === piggyBankId);
    if (!pb) return false;
    const bal = await getBalances();
    if (value > bal.account + 0.0001) {
      toast.error(`Saldo em conta insuficiente (disponível: ${bal.account.toFixed(2)})`);
      return false;
    }
    const today = ymd(new Date());
    const { error } = await supabase.from("piggy_bank_deposits" as any).insert({
      user_id: dataOwnerId,
      piggy_bank_id: piggyBankId,
      amount: value,
      deposit_date: today,
      source: "transfer_in",
    });
    if (error) { toast.error("Erro ao guardar no cofrinho"); return false; }
    // NÃO grava no account_ledger: o saldo do Dashboard não deve ser afetado.
    // O saldo de "Receitas e Despesas" é derivado dos próprios piggy_bank_deposits.
    try { window.dispatchEvent(new CustomEvent("balance:changed")); } catch { /* noop */ }
    toast.success(`Guardado ${value.toFixed(2)} em "${pb.name}"`);
    await reload();
    return true;
  }, [dataOwnerId, piggyBanks, reload]);

  /**
   * Resgata dinheiro: credita o saldo da conta e debita do cofrinho.
   */
  const withdrawMoney = useCallback(async (piggyBankId: string, amount: number) => {
    if (!dataOwnerId) return false;
    const value = Number(amount.toFixed(2));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Informe um valor válido");
      return false;
    }
    const pb = piggyBanks.find((p) => p.id === piggyBankId);
    if (!pb) return false;
    const ds = deposits.filter((d) => d.piggyBankId === piggyBankId);
    const current = computePiggyBalance(ds, pb.annualRate).balance;
    if (value > current + 0.0001) {
      toast.error(`Saldo do cofrinho insuficiente (disponível: ${current.toFixed(2)})`);
      return false;
    }
    const today = ymd(new Date());
    const { error } = await supabase.from("piggy_bank_deposits" as any).insert({
      user_id: dataOwnerId,
      piggy_bank_id: piggyBankId,
      amount: -value,
      deposit_date: today,
      source: "transfer_out",
    });
    if (error) { toast.error("Erro ao resgatar do cofrinho"); return false; }
    // NÃO grava no account_ledger: o saldo do Dashboard não deve ser afetado.
    // O saldo de "Receitas e Despesas" é derivado dos próprios piggy_bank_deposits.
    try { window.dispatchEvent(new CustomEvent("balance:changed")); } catch { /* noop */ }
    toast.success(`Resgatado ${value.toFixed(2)} de "${pb.name}"`);
    await reload();
    return true;
  }, [dataOwnerId, piggyBanks, deposits, reload]);

  const createRecurrence = useCallback(async (input: {
    piggyBankId: string;
    amount: number;
    startDate: string;
    endDate?: string | null;
    description?: string;
  }) => {
    if (!dataOwnerId) return null;
    const startDay = parseYmd(input.startDate).getDate();
    const { data, error } = await (supabase as any).from("piggy_bank_recurrences").insert({
      user_id: dataOwnerId,
      piggy_bank_id: input.piggyBankId,
      amount: input.amount,
      start_date: input.startDate,
      end_date: input.endDate ?? null,
      day_of_month: startDay,
      description: input.description ?? null,
      active: true,
    }).select().single();
    if (error) { toast.error("Erro ao criar recorrência"); return null; }
    await reload();
    return (data as any)?.id as string;
  }, [dataOwnerId, reload]);

  /** Ativa/desativa uma recorrência (sem apagar histórico). */
  const setRecurrenceActive = useCallback(async (id: string, active: boolean) => {
    const { error } = await (supabase as any)
      .from("piggy_bank_recurrences")
      .update({ active })
      .eq("id", id);
    if (error) { toast.error("Erro ao atualizar recorrência"); return false; }
    await reload();
    return true;
  }, [reload]);

  /** Remove uma recorrência (não apaga aportes já gerados). */
  const deleteRecurrence = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from("piggy_bank_recurrences")
      .delete()
      .eq("id", id);
    if (error) { toast.error("Erro ao excluir recorrência"); return false; }
    toast.success("Recorrência removida");
    await reload();
    return true;
  }, [reload]);

  /**
   * Retorna os períodos de taxa de uma caixinha. Sempre garante pelo menos um
   * período: se não houver histórico, usa a taxa atual valendo desde a criação.
   * Todos os cofrinhos seguem o CDI automaticamente: o último período sempre
   * reflete a taxa CDI vigente quando ela está disponível.
   */
  const periodsFor = useCallback((pb: PiggyBank): RatePeriod[] => {
    const hist = rateHistory
      .filter((h) => h.piggyBankId === pb.id)
      .map<RatePeriod>((h) => ({ effectiveFrom: h.effectiveFrom, annualRate: h.annualRate }));
    let base: RatePeriod[] = hist.length === 0
      ? [{ effectiveFrom: pb.createdAt.slice(0, 10), annualRate: pb.annualRate }]
      : hist;
    // CDI sempre vigente: garante que o último período reflita a taxa CDI atual,
    // ajustada pela porcentagem do CDI configurada na caixinha (ex.: 80%, 110%).
    if (cdiRate) {
      const pct = (pb.cdiPercent ?? 100) / 100;
      const effectiveCdi = cdiRate.annualRate * pct;
      const last = base[base.length - 1];
      const cdiFrom = cdiRate.referenceDate || ymd(new Date());
      const sameRate = Math.abs(last.annualRate - effectiveCdi) < 0.01;
      if (!sameRate) {
        const effectiveFrom = cdiFrom > last.effectiveFrom ? cdiFrom : last.effectiveFrom;
        base = [...base, { effectiveFrom, annualRate: effectiveCdi }];
      }
    }
    return base;
  }, [rateHistory, cdiRate]);

  const balances = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePiggyBalance>>();
    for (const pb of piggyBanks) {
      const ds = deposits.filter((d) => d.piggyBankId === pb.id);
      // Usa cálculo segmentado por taxa; expõe na mesma forma legacy {principal, balance, yield}
      const det = computePiggyDetailedSeg(ds, periodsFor(pb));
      map.set(pb.id, { principal: det.principal, balance: det.balance, yield: det.gross });
    }
    return map;
  }, [piggyBanks, deposits, periodsFor]);

  const detailed = useMemo(() => {
    const map = new Map<string, PiggyDetailed>();
    for (const pb of piggyBanks) {
      const ds = deposits.filter((d) => d.piggyBankId === pb.id);
      map.set(pb.id, computePiggyDetailedSeg(ds, periodsFor(pb)));
    }
    return map;
  }, [piggyBanks, deposits, periodsFor]);

  /**
   * Atualiza a taxa de uma caixinha:
   *  - mode='forward': mantém rendimentos passados; novo período inicia hoje.
   *  - mode='recalc': recalcula tudo com a nova taxa (apaga histórico e
   *    insere uma única linha valendo desde a criação).
   */
  const setPiggyRate = useCallback(async (
    piggyBankId: string,
    newRate: number,
    mode: "forward" | "recalc",
  ) => {
    if (!dataOwnerId) return;
    const pb = piggyBanks.find((p) => p.id === piggyBankId);
    if (!pb) return;
    if (mode === "recalc") {
      await supabase.from("piggy_bank_rate_history" as any).delete().eq("piggy_bank_id", piggyBankId);
      await supabase.from("piggy_bank_rate_history" as any).insert({
        user_id: dataOwnerId,
        piggy_bank_id: piggyBankId,
        annual_rate: newRate,
        effective_from: pb.createdAt.slice(0, 10),
      });
    } else {
      await supabase.from("piggy_bank_rate_history" as any).insert({
        user_id: dataOwnerId,
        piggy_bank_id: piggyBankId,
        annual_rate: newRate,
        effective_from: ymd(new Date()),
      });
    }
    await supabase.from("piggy_banks" as any).update({ annual_rate: newRate }).eq("id", piggyBankId);
    await reload();
  }, [dataOwnerId, piggyBanks, reload]);

  const refreshCdiNow = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sync-cdi-rate", { body: {} });
      if (error) throw error;
      await reload();
      const rate = (data as any)?.annual_rate;
      if (typeof rate === "number") {
        toast.success(`Taxa CDI atualizada: ${rate.toFixed(2)}% a.a.`);
      }
      return data;
    } catch (e: any) {
      toast.error("Não foi possível atualizar a taxa CDI agora");
      return null;
    }
  }, [reload]);

  return {
    piggyBanks,
    deposits,
    recurrences,
    rateHistory,
    balances,
    detailed,
    cdiRate,
    loading,
    createPiggyBank,
    updatePiggyBank,
    deletePiggyBank,
    addDeposit,
    removeDepositByExpenseId,
    updateDeposit,
    deleteDeposit,
    adjustBalance,
    storeMoney,
    withdrawMoney,
    createRecurrence,
    setRecurrenceActive,
    deleteRecurrence,
    setPiggyRate,
    refreshCdiNow,
    reload,
  };
}
