import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { todayInAppTz } from "@/lib/timezone";

export type IncomeStatus = "pending" | "received" | "overdue";
export type IncomeRecurrence = "once" | "weekly" | "biweekly" | "monthly" | "yearly";

export interface Income {
  id: string;
  description: string;
  amount: number;
  category: string | null;
  clientId: string | null;
  source: string | null;
  paymentMethodId: string | null;
  receivedDate: string;
  status: IncomeStatus;
  notes: string | null;
  recurrence: IncomeRecurrence;
  parentId: string | null;
  createdAt: string;
}

function rowToIncome(r: any): Income {
  return {
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    category: r.category,
    clientId: r.client_id,
    source: r.source,
    paymentMethodId: r.payment_method_id,
    receivedDate: r.received_date,
    status: r.status,
    notes: r.notes,
    recurrence: r.recurrence,
    parentId: r.parent_id,
    createdAt: r.created_at,
  };
}

export function useIncomes(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("incomes" as any)
      .select("*")
      .order("received_date", { ascending: false });
    if (data) setIncomes((data as any[]).map(rowToIncome));
    setLoading(false);
  }, [user]);

  useEffect(() => { if (enabled) fetch(); }, [fetch, enabled]);

  useEffect(() => {
    if (!user || !enabled) return;
    const channel = supabase
      .channel(`incomes-rt-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incomes" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetch, enabled]);

  const insertSingle = useCallback(async (
    input: Omit<Income, "id" | "createdAt">,
  ): Promise<Income | null> => {
    if (!dataOwnerId) return null;
    const payload: any = {
      user_id: dataOwnerId,
      description: input.description,
      amount: input.amount,
      category: input.category,
      client_id: input.clientId,
      source: input.source,
      payment_method_id: input.paymentMethodId,
      received_date: input.receivedDate,
      status: input.status,
      notes: input.notes,
      recurrence: input.recurrence,
      parent_id: input.parentId,
    };
    const { data, error } = await supabase.from("incomes" as any).insert(payload).select().single();
    if (error || !data) return null;
    return rowToIncome(data);
  }, [dataOwnerId]);

  // Quantos meses à frente materializar receitas mensais/anuais
  const FUTURE_MONTHS_HORIZON = 12;

  function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function monthlyDates(baseIso: string, horizonMonths: number): string[] {
    const base = new Date(baseIso + "T00:00:00");
    const day = base.getDate();
    const startY = base.getFullYear();
    const startM = base.getMonth();
    const today = new Date();
    const endY = today.getFullYear();
    const endM = today.getMonth() + horizonMonths;
    const out: string[] = [];
    let y = startY;
    let m = startM;
    while (y < endY || (y === endY && m <= endM)) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const useDay = Math.min(day, lastDay);
      out.push(ymd(new Date(y, m, useDay)));
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    return out;
  }

  function yearlyDates(baseIso: string, horizonMonths: number): string[] {
    const base = new Date(baseIso + "T00:00:00");
    const today = new Date();
    const endY = today.getFullYear() + Math.ceil(horizonMonths / 12);
    const out: string[] = [];
    let y = base.getFullYear();
    while (y <= endY) {
      const lastDay = new Date(y, base.getMonth() + 1, 0).getDate();
      const useDay = Math.min(base.getDate(), lastDay);
      out.push(ymd(new Date(y, base.getMonth(), useDay)));
      y += 1;
    }
    return out;
  }

  // Expande receitas recorrentes (semanais/quinzenais no mês, mensais/anuais até o horizonte)
  const addIncome = useCallback(async (
    input: Omit<Income, "id" | "createdAt">,
  ): Promise<Income | null> => {
    if (!dataOwnerId) return null;
    const today = todayInAppTz();
    let dates: string[] | null = null;
    if (input.recurrence === "weekly" || input.recurrence === "biweekly") {
      const stepDays = input.recurrence === "weekly" ? 7 : 14;
      const base = new Date(input.receivedDate + "T00:00:00");
      const y = base.getFullYear();
      const m = base.getMonth();
      const endMonth = new Date(y, m + 1, 0);
      dates = [];
      let d = new Date(base);
      while (d <= endMonth) {
        dates.push(ymd(d));
        d.setDate(d.getDate() + stepDays);
      }
    } else if (input.recurrence === "monthly") {
      dates = monthlyDates(input.receivedDate, FUTURE_MONTHS_HORIZON);
    } else if (input.recurrence === "yearly") {
      dates = yearlyDates(input.receivedDate, FUTURE_MONTHS_HORIZON);
    }
    if (dates && dates.length > 0) {
      const baseNotes = (input.notes ?? "").trim();
      const stampedNotes = baseNotes ? `${baseNotes}\n[Expanded]` : "[Expanded]";
      let parent: Income | null = null;
      const created: Income[] = [];
      for (let i = 0; i < dates.length; i++) {
        const isFirst = i === 0;
        const inc = await insertSingle({
          ...input,
          receivedDate: dates[i],
          status: dates[i] > today ? "pending" : input.status,
          recurrence: isFirst ? input.recurrence : "once",
          parentId: isFirst ? input.parentId : (parent?.id ?? null),
          notes: isFirst ? stampedNotes : input.notes,
        });
        if (!inc) continue;
        if (isFirst) parent = inc;
        created.push(inc);
      }
      if (created.length > 0) {
        setIncomes((prev) => [...created, ...prev]);
      }
      return parent;
    }
    const inc = await insertSingle(input);
    if (inc) setIncomes((prev) => [inc, ...prev]);
    return inc;
  }, [dataOwnerId, insertSingle]);

  const updateIncome = useCallback(async (id: string, patch: Partial<Income>) => {
    const updatePayload: any = {};
    if (patch.description !== undefined) updatePayload.description = patch.description;
    if (patch.amount !== undefined) updatePayload.amount = patch.amount;
    if (patch.category !== undefined) updatePayload.category = patch.category;
    if (patch.clientId !== undefined) updatePayload.client_id = patch.clientId;
    if (patch.source !== undefined) updatePayload.source = patch.source;
    if (patch.paymentMethodId !== undefined) updatePayload.payment_method_id = patch.paymentMethodId;
    if (patch.receivedDate !== undefined) updatePayload.received_date = patch.receivedDate;
    if (patch.status !== undefined) updatePayload.status = patch.status;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;
    if (patch.recurrence !== undefined) updatePayload.recurrence = patch.recurrence;

    setIncomes((arr) => arr.map((i) => i.id === id ? { ...i, ...patch } : i));
    await supabase.from("incomes" as any).update(updatePayload).eq("id", id);
  }, []);

  const deleteIncome = useCallback(async (id: string) => {
    setIncomes((arr) => arr.filter((i) => i.id !== id));
    await supabase.from("incomes" as any).delete().eq("id", id);
  }, []);

  const duplicateIncome = useCallback(async (id: string) => {
    const src = incomes.find((i) => i.id === id);
    if (!src) return;
    const { id: _, createdAt: __, ...rest } = src;
    await addIncome({ ...rest, status: "pending", receivedDate: todayInAppTz() });
  }, [incomes, addIncome]);

  const markReceived = useCallback(async (id: string) => {
    await updateIncome(id, { status: "received", receivedDate: todayInAppTz() });
  }, [updateIncome]);

  // Backfill: para receitas recorrentes antigas que ainda não foram expandidas,
  // gera as ocorrências restantes (semanal/quinzenal no mês; mensal/anual no horizonte futuro).
  const processingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!enabled || !dataOwnerId || incomes.length === 0) return;
    const parents = incomes.filter((i) =>
      (i.recurrence === "weekly" || i.recurrence === "biweekly" || i.recurrence === "monthly" || i.recurrence === "yearly")
      && !i.parentId
      && !((i.notes ?? "").includes("[Expanded]"))
      && !processingRef.current.has(i.id)
    );
    if (parents.length === 0) return;
    parents.forEach((p) => processingRef.current.add(p.id));
    let cancelled = false;
    (async () => {
      for (const p of parents) {
        if (cancelled) return;
        // 1) Marca o pai como [Expanded] ANTES de inserir filhos para fechar a janela de corrida.
        const baseNotes = (p.notes ?? "").trim();
        const stamped = baseNotes ? `${baseNotes}\n[Expanded]` : "[Expanded]";
        await supabase.from("incomes" as any).update({ notes: stamped }).eq("id", p.id);

        const today = todayInAppTz();
        let allDates: string[] = [];
        if (p.recurrence === "weekly" || p.recurrence === "biweekly") {
          const stepDays = p.recurrence === "weekly" ? 7 : 14;
          const base = new Date(p.receivedDate + "T00:00:00");
          const endMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
          let d = new Date(base);
          while (d <= endMonth) {
            allDates.push(ymd(d));
            d.setDate(d.getDate() + stepDays);
          }
        } else if (p.recurrence === "monthly") {
          allDates = monthlyDates(p.receivedDate, FUTURE_MONTHS_HORIZON);
        } else if (p.recurrence === "yearly") {
          allDates = yearlyDates(p.receivedDate, FUTURE_MONTHS_HORIZON);
        }
        const childDates = allDates.filter((dt) => dt !== p.receivedDate);

        // 2) Busca filhos já existentes direto do banco para evitar duplicatas em concorrência.
        const { data: existingRows } = await supabase
          .from("incomes" as any)
          .select("received_date")
          .eq("parent_id", p.id);
        const existingDates = new Set(((existingRows as any[]) ?? []).map((r) => r.received_date));

        for (const dt of childDates) {
          if (existingDates.has(dt)) continue;
          await insertSingle({
            description: p.description,
            amount: p.amount,
            category: p.category,
            clientId: p.clientId,
            source: p.source,
            paymentMethodId: p.paymentMethodId,
            receivedDate: dt,
            status: dt > today ? "pending" : p.status,
            notes: p.notes,
            recurrence: "once",
            parentId: p.id,
          });
          existingDates.add(dt);
        }
      }
      if (!cancelled) fetch();
    })();
    return () => { cancelled = true; };
  }, [incomes, enabled, dataOwnerId, insertSingle, fetch]);

  return { incomes, loading, addIncome, updateIncome, deleteIncome, duplicateIncome, markReceived, refetch: fetch };
}
