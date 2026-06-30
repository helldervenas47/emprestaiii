import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { useDataOwner } from "./useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";
import type { PiggyDetailed, RatePeriod } from "@/lib/piggyTax";

/**
 * Adapter sobre a nova arquitetura financeira (tabelas `cofrinhos`,
 * `cofrinho_aportes`, `cofrinho_eventos`, `cofrinho_rendimento_diario`,
 * `taxa_referencia`) + Edge Functions:
 *   - processar-deposito-cofrinho
 *   - processar-resgate-cofrinho
 *   - sync-taxas-financeiras
 *
 * A interface pública foi mantida intacta para preservar compatibilidade
 * com todos os consumidores existentes (PiggyBankList, PiggyBankDetail,
 * useAccountBalance, useExternalAccountSources, ConsolidatedBalanceCards,
 * IncomePendingCalendar, FinancialHealthDashboard, PiggyBanksSummaryCard,
 * PiggyBanksBreakdownDialog, PersonalExpenseForm, etc.).
 *
 * A tabela legada `piggy_banks` NÃO é mais lida nem escrita. Permanece no
 * banco para preservar histórico — não está sendo dropada nesta migração.
 *
 * Cores/ícones/categoria/data-alvo são serializados em `cofrinhos.descricao`
 * como JSON, já que o novo schema não possui esses campos.
 */

export interface PiggyBankRateHistory {
  id: string;
  piggyBankId: string;
  annualRate: number;
  effectiveFrom: string;
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
  depositDate: string;
  source?: string;
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

// ---------------------------------------------------------------------------
// Compat layer: as funções abaixo são exportadas porque outros módulos do app
// (PersonalExpenseForm, useExpenses, etc.) ainda dependem delas para marcar
// expenses como transferências para cofrinho.
// ---------------------------------------------------------------------------

const PIGGY_TAG_RE = /\[cofrinho:([0-9a-f-]{36})\]/i;

export const buildPiggyTag = (piggyId: string, original?: string) =>
  `[cofrinho:${piggyId}]${original ? " " + original : ""}`;

export const extractPiggyId = (notes?: string | null): string | null => {
  if (!notes) return null;
  const m = notes.match(PIGGY_TAG_RE);
  return m ? m[1] : null;
};

export const isPiggyExpense = (notes?: string | null) => !!extractPiggyId(notes);

/**
 * Mantida para compat com módulos que ainda chamam diretamente. NÃO é usada
 * internamente — o backend é a fonte de verdade do saldo agora.
 */
export function computePiggyBalance(
  deposits: PiggyBankDeposit[],
  annualRatePct: number,
  asOf: Date = new Date(),
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
    if (d.amount >= 0) total += d.amount * Math.pow(dailyFactor, days);
    else total += d.amount;
  }
  return { principal, balance: total, yield: total - principal };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Descricao JSON helpers — extras visuais que o novo schema não comporta.
// ---------------------------------------------------------------------------
interface DescricaoMeta {
  cor?: string;
  icone?: string;
  categoria?: string | null;
  data_prevista?: string | null;
  short_id?: number | null;
  note?: string;
  // legacy keys (compat com registros antigos)
  color?: string;
  icon?: string;
  category?: string | null;
  targetDate?: string | null;
  shortId?: number | null;
}

const parseDescricao = (raw: any): DescricaoMeta => {
  if (raw == null) return {};
  if (typeof raw === "object") return { ...(raw as DescricaoMeta) };
  if (typeof raw !== "string") return {};
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (!trimmed.startsWith("{")) return { note: trimmed };
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed ? parsed : { note: trimmed };
  } catch {
    return { note: trimmed };
  }
};

const readMeta = (m: DescricaoMeta) => ({
  cor: m.cor ?? m.color ?? DEFAULT_COLOR,
  icone: m.icone ?? m.icon ?? DEFAULT_ICON,
  categoria: m.categoria ?? m.category ?? null,
  data_prevista: m.data_prevista ?? m.targetDate ?? null,
  short_id: m.short_id ?? m.shortId ?? null,
});

const DEFAULT_COLOR = "210 80% 55%";
const DEFAULT_ICON = "PiggyBank";

export function usePiggyBanks() {
  const { user } = useAuth();
  const dataOwnerId = useDataOwner();
  const [piggyBanks, setPiggyBanks] = useState<PiggyBank[]>([]);
  const [deposits, setDeposits] = useState<PiggyBankDeposit[]>([]);
  const [cofrinhoRows, setCofrinhoRows] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [cdiRate, setCdiRate] = useState<MarketRate | null>(null);

  // Recurrences/RateHistory ainda não migradas para a nova arquitetura.
  // Mantidas como arrays vazios para preservar a interface pública.
  const recurrences: PiggyBankRecurrence[] = [];
  const rateHistory: PiggyBankRateHistory[] = [];

  const reload = useCallback(async () => {
    if (!dataOwnerId) return;
    const [cofRes, apoRes, taxaRes] = await Promise.all([
      supabase
        .from("cofrinhos" as any)
        .select("*")
        .eq("usuario_id", dataOwnerId)
        .order("created_at"),
      supabase
        .from("cofrinho_aportes" as any)
        .select("id, cofrinho_id, valor_original, data_aporte, percentual_cdi, created_at"),
      supabase
        .from("taxa_referencia" as any)
        .select("*")
        .limit(1),
    ]);

    if (!cofRes.error && Array.isArray(cofRes.data)) {
      const rowsMap: Record<string, any> = {};
      const list: PiggyBank[] = (cofRes.data as any[])
        .filter((r) => r.ativo !== false)
        .map((r) => {
          rowsMap[r.id] = r;
          const meta = parseDescricao(r.descricao);
          const m = readMeta(meta);
          return {
            id: r.id,
            shortId: m.short_id,
            name: r.nome,
            color: m.cor,
            icon: m.icone,
            annualRate: 0, // backend controla; campo legado mantido por compat
            autoRate: true,
            cdiPercent: r.percentual_cdi != null ? Number(r.percentual_cdi) : 100,
            goalAmount: r.meta != null ? Number(r.meta) : null,
            category: m.categoria,
            targetDate: m.data_prevista,
            createdAt: r.created_at,
          };
        });
      setPiggyBanks(list);
      setCofrinhoRows(rowsMap);
    }

    if (!apoRes.error && Array.isArray(apoRes.data)) {
      setDeposits(
        (apoRes.data as any[]).map((r) => ({
          id: r.id,
          piggyBankId: r.cofrinho_id,
          expenseId: null,
          amount: Number(r.valor_original),
          depositDate: r.data_aporte,
          source: "manual",
          recurrenceId: null,
        })),
      );
    }

    if (!taxaRes.error && Array.isArray(taxaRes.data) && taxaRes.data.length > 0) {
      const r: any = taxaRes.data[0];
      const annual =
        r.taxa_anual ?? r.valor_anual ?? r.taxa ?? r.valor ?? r.annual_rate ?? null;
      if (annual != null) {
        setCdiRate({
          indicator: "cdi",
          annualRate: Number(annual),
          source: r.fonte ?? r.source ?? null,
          referenceDate: r.data_referencia ?? r.reference_date ?? null,
          fetchedAt: r.atualizado_em ?? r.updated_at ?? new Date().toISOString(),
        });
      }
    }

    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Realtime
  useEffect(() => {
    if (!dataOwnerId) return;
    const channel = supabase
      .channel(`cofrinhos-realtime-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinhos" }, () => {
        reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinho_aportes" }, () => {
        reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "cofrinho_eventos" }, () => {
        reload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "taxa_referencia" }, () => {
        reload();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dataOwnerId, reload]);

  // ---------------------------------------------------------------------------
  // CRUD de cofrinhos
  // ---------------------------------------------------------------------------

  const createPiggyBank = useCallback(
    async (data: {
      name: string;
      color?: string;
      icon?: string;
      annualRate?: number;
      autoRate?: boolean;
      cdiPercent?: number;
      shortId?: number | null;
      goalAmount?: number | null;
      category?: string | null;
      targetDate?: string | null;
    }) => {
      assertWritable();
      if (!user || !dataOwnerId) return null;
      const descricao = stringifyDescricao({
        color: data.color ?? DEFAULT_COLOR,
        icon: data.icon ?? DEFAULT_ICON,
        category: data.category ?? null,
        targetDate: data.targetDate ?? null,
        shortId: data.shortId ?? null,
      });
      const payload: any = {
        usuario_id: dataOwnerId,
        nome: data.name,
        descricao,
        meta: data.goalAmount ?? null,
        percentual_cdi: data.cdiPercent ?? 100,
        tipo_rendimento: "CDI",
        rendimento_automatico: true,
        ativo: true,
      };
      const { data: row, error } = await (supabase as any)
        .from("cofrinhos")
        .insert(payload)
        .select()
        .single();
      if (error) {
        toast.error(error.message || "Erro ao criar cofrinho");
        return null;
      }
      await reload();
      return (row as any)?.id as string;
    },
    [user, dataOwnerId, reload],
  );

  const updatePiggyBank = useCallback(
    async (
      id: string,
      patch: Partial<{
        name: string;
        color: string;
        icon: string;
        annualRate: number;
        autoRate: boolean;
        cdiPercent: number;
        shortId: number | null;
        goalAmount: number | null;
        category: string | null;
        targetDate: string | null;
      }>,
    ) => {
      assertWritable();
      const current = cofrinhoRows[id];
      const meta = parseDescricao(current?.descricao);
      const newMeta: DescricaoMeta = { ...meta };
      if (patch.color !== undefined) newMeta.color = patch.color;
      if (patch.icon !== undefined) newMeta.icon = patch.icon;
      if (patch.category !== undefined) newMeta.category = patch.category;
      if (patch.targetDate !== undefined) newMeta.targetDate = patch.targetDate;
      if (patch.shortId !== undefined) newMeta.shortId = patch.shortId;
      const dbPatch: any = { descricao: stringifyDescricao(newMeta) };
      if (patch.name !== undefined) dbPatch.nome = patch.name;
      if (patch.cdiPercent !== undefined) dbPatch.percentual_cdi = patch.cdiPercent;
      if (patch.goalAmount !== undefined) dbPatch.meta = patch.goalAmount;
      const { error } = await supabase.from("cofrinhos" as any).update(dbPatch).eq("id", id);
      if (error) {
        toast.error(error.message || "Erro ao atualizar");
        return;
      }
      await reload();
    },
    [cofrinhoRows, reload],
  );

  const deletePiggyBank = useCallback(
    async (id: string) => {
      assertWritable();
      // Soft delete para preservar histórico de aportes/eventos.
      const { error } = await supabase
        .from("cofrinhos" as any)
        .update({ ativo: false })
        .eq("id", id);
      if (error) {
        toast.error("Erro ao excluir cofrinho");
        return;
      }
      await reload();
    },
    [reload],
  );

  // ---------------------------------------------------------------------------
  // Depósitos e resgates — TODOS via Edge Function
  // ---------------------------------------------------------------------------

  // Chama a edge function via fetch explícito para garantir que o
  // Authorization (access_token do usuário) e a apikey sejam enviados.
  // `supabase.functions.invoke` às vezes falha com
  // "failed to send a request to the edge function" quando a sessão
  // ainda não foi hidratada no client externo.
  const callCofrinhoFn = useCallback(
    async (fnName: string, payload: Record<string, unknown>) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const baseUrl = (import.meta as any).env.VITE_EXTERNAL_SUPABASE_URL as string;
      const anonKey = (import.meta as any).env.VITE_EXTERNAL_SUPABASE_ANON_KEY as string;
      const url = `${baseUrl}/functions/v1/${fnName}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
          },
          body: JSON.stringify(payload),
        });
      } catch (e: any) {
        throw new Error(e?.message || "Falha de rede ao chamar edge function");
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* resposta não-JSON */
      }
      if (!res.ok) {
        const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return json;
    },
    [],
  );

  const invokeDeposit = useCallback(
    async (cofrinhoId: string, valor: number, dataAporte?: string, percentualCdi?: number) => {
      const payload: Record<string, unknown> = {
        cofrinho_id: cofrinhoId,
        valor,
        percentual_cdi: percentualCdi ?? 100,
      };
      if (dataAporte) payload.data_aporte = dataAporte;
      return callCofrinhoFn("processar-deposito-cofrinho", payload);
    },
    [callCofrinhoFn],
  );

  const invokeWithdraw = useCallback(
    async (cofrinhoId: string, valor: number, dataResgate?: string) => {
      const payload: Record<string, unknown> = {
        cofrinho_id: cofrinhoId,
        valor,
      };
      if (dataResgate) payload.data_resgate = dataResgate;
      return callCofrinhoFn("processar-resgate-cofrinho", payload);
    },
    [callCofrinhoFn],
  );

  /** Aporte simples (compat). */
  const addDeposit = useCallback(
    async (input: {
      piggyBankId: string;
      amount: number;
      depositDate: string;
      expenseId?: string;
      source?: string;
    }) => {
      assertWritable();
      try {
        await invokeDeposit(input.piggyBankId, input.amount, input.depositDate);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        await reload();
      } catch (e: any) {
        toast.error(e?.message || "Erro ao registrar aporte");
      }
    },
    [invokeDeposit, reload],
  );

  /**
   * Remoção via expenseId: no novo schema os aportes não carregam expense_id,
   * então essa operação vira no-op silencioso (a despesa será apagada pelo
   * fluxo normal de despesas; o cofrinho continua com o aporte registrado).
   */
  const removeDepositByExpenseId = useCallback(async (_expenseId: string) => {
    // intencionalmente vazio na nova arquitetura
  }, []);

  const updateDeposit = useCallback(
    async (_id: string, _patch: Partial<{ amount: number; depositDate: string }>) => {
      toast.info(
        "Edição direta de aporte indisponível. Use um resgate parcial ou aporte de ajuste.",
      );
    },
    [],
  );

  const deleteDeposit = useCallback(async (_id: string) => {
    toast.info(
      "Exclusão direta de aporte indisponível. Use um resgate para retirar o valor.",
    );
  }, []);

  const adjustBalance = useCallback(
    async (piggyBankId: string, newBalance: number, _note?: string) => {
      assertWritable();
      const row = cofrinhoRows[piggyBankId];
      if (!row) return;
      const current = Number(row.saldo_total ?? 0);
      const delta = Number((newBalance - current).toFixed(2));
      if (delta === 0) {
        toast.info("Saldo já está nesse valor");
        return;
      }
      try {
        if (delta > 0) await invokeDeposit(piggyBankId, delta);
        else await invokeWithdraw(piggyBankId, Math.abs(delta));
        toast.success(`Saldo ajustado em ${delta > 0 ? "+" : ""}${delta.toFixed(2)}`);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        await reload();
      } catch (e: any) {
        toast.error(e?.message || "Erro ao ajustar saldo");
      }
    },
    [cofrinhoRows, invokeDeposit, invokeWithdraw, reload],
  );

  const storeMoney = useCallback(
    async (piggyBankId: string, amount: number) => {
      const value = Number(amount.toFixed(2));
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Informe um valor válido");
        return false;
      }
      const pb = piggyBanks.find((p) => p.id === piggyBankId);
      try {
        await invokeDeposit(piggyBankId, value);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        toast.success(`Guardado ${value.toFixed(2)} em "${pb?.name ?? "cofrinho"}"`);
        await reload();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Erro ao guardar no cofrinho");
        return false;
      }
    },
    [piggyBanks, invokeDeposit, reload],
  );

  const withdrawMoney = useCallback(
    async (piggyBankId: string, amount: number) => {
      const value = Number(amount.toFixed(2));
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Informe um valor válido");
        return false;
      }
      const pb = piggyBanks.find((p) => p.id === piggyBankId);
      try {
        await invokeWithdraw(piggyBankId, value);
        try {
          window.dispatchEvent(new CustomEvent("balance:changed"));
        } catch {
          /* noop */
        }
        toast.success(`Resgatado ${value.toFixed(2)} de "${pb?.name ?? "cofrinho"}"`);
        await reload();
        return true;
      } catch (e: any) {
        toast.error(e?.message || "Erro ao resgatar do cofrinho");
        return false;
      }
    },
    [piggyBanks, invokeWithdraw, reload],
  );

  // ---------------------------------------------------------------------------
  // Recorrências — feature ainda não disponível na nova arquitetura (stubs)
  // ---------------------------------------------------------------------------
  const createRecurrence = useCallback(
    async (_input: {
      piggyBankId: string;
      amount: number;
      startDate: string;
      endDate?: string | null;
      description?: string;
    }) => {
      toast.info("Aportes recorrentes serão reintroduzidos em uma próxima atualização.");
      return null;
    },
    [],
  );
  const setRecurrenceActive = useCallback(async (_id: string, _active: boolean) => false, []);
  const deleteRecurrence = useCallback(async (_id: string) => false, []);

  // Taxa controlada automaticamente pelo backend.
  const setPiggyRate = useCallback(
    async (_piggyBankId: string, _newRate: number, _mode: "forward" | "recalc") => {
      toast.info("A taxa é controlada automaticamente pelo CDI/backend.");
    },
    [],
  );

  const refreshCdiNow = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sync-taxas-financeiras", {
        body: {},
      });
      if (error) throw error;
      await reload();
      const rate = (data as any)?.cdi?.taxa_anual ?? (data as any)?.annual_rate;
      if (typeof rate === "number") {
        toast.success(`Taxa CDI atualizada: ${rate.toFixed(2)}% a.a.`);
      } else {
        toast.success("Taxas financeiras atualizadas");
      }
      return data;
    } catch {
      toast.error("Não foi possível atualizar a taxa CDI agora");
      return null;
    }
  }, [reload]);

  // ---------------------------------------------------------------------------
  // Saldos derivados — leitura direta da tabela `cofrinhos`
  // ---------------------------------------------------------------------------

  const balances = useMemo(() => {
    const map = new Map<string, { principal: number; balance: number; yield: number }>();
    for (const pb of piggyBanks) {
      const row = cofrinhoRows[pb.id] || {};
      const principal = Number(row.saldo_principal ?? 0);
      const balance = Number(row.saldo_total ?? 0);
      const net = Number(row.saldo_rendimento_liquido ?? 0);
      map.set(pb.id, { principal, balance, yield: net });
    }
    return map;
  }, [piggyBanks, cofrinhoRows]);

  const detailed = useMemo(() => {
    const map = new Map<string, PiggyDetailed>();
    for (const pb of piggyBanks) {
      const row = cofrinhoRows[pb.id] || {};
      const principal = Number(row.saldo_principal ?? 0);
      const balance = Number(row.saldo_total ?? 0);
      const gross = Number(row.saldo_rendimento_bruto ?? 0);
      const net = Number(row.saldo_rendimento_liquido ?? 0);
      const tax = Math.max(0, gross - net);
      const cdi = cdiRate?.annualRate ?? 0;
      const currentRate = cdi * ((pb.cdiPercent ?? 100) / 100);
      map.set(pb.id, {
        principal,
        balance,
        gross,
        tax,
        net,
        projectionNetEom: net,
        currentNet: principal + net,
        currentRate,
      });
    }
    return map;
  }, [piggyBanks, cofrinhoRows, cdiRate]);

  // Exposto para compat com qualquer consumidor que chame `periodsFor(pb)`.
  const _periodsFor = useCallback(
    (pb: PiggyBank): RatePeriod[] => {
      const annual = (cdiRate?.annualRate ?? 0) * ((pb.cdiPercent ?? 100) / 100);
      return [{ effectiveFrom: pb.createdAt?.slice(0, 10) || ymd(new Date()), annualRate: annual }];
    },
    [cdiRate],
  );
  void _periodsFor;

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
    /** Dados crus do cofrinho (saldo_principal, saldo_total etc.) para UIs que
     *  queiram surface fields novos (saldo_rendimento_bruto, ultimo_rendimento,
     *  proximo_rendimento, tipo_rendimento). */
    cofrinhoRows,
  };
}
