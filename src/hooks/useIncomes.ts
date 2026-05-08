import { useState, useCallback, useEffect } from "react";
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

  // Expande receitas semanais/quinzenais para todas as ocorrências do mês cadastrado
  const addIncome = useCallback(async (
    input: Omit<Income, "id" | "createdAt">,
  ): Promise<Income | null> => {
    if (!dataOwnerId) return null;
    const today = todayInAppTz();
    if (input.recurrence === "weekly" || input.recurrence === "biweekly") {
      const stepDays = input.recurrence === "weekly" ? 7 : 14;
      const base = new Date(input.receivedDate + "T00:00:00");
      const y = base.getFullYear();
      const m = base.getMonth();
      const endMonth = new Date(y, m + 1, 0);
      // gera datas a partir da base, dentro do mês
      const dates: string[] = [];
      let d = new Date(base);
      while (d <= endMonth) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        dates.push(iso);
        d.setDate(d.getDate() + stepDays);
      }
      // primeiro registro: pai (mantém recorrência); demais: filhos "once"
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

  return { incomes, loading, addIncome, updateIncome, deleteIncome, duplicateIncome, markReceived, refetch: fetch };
}
