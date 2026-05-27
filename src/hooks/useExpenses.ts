import { useState, useCallback, useEffect } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { Expense } from "@/types/loan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { extractPiggyId } from "./usePiggyBanks";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { recordLedger, removeLedgerByRef } from "@/lib/ledger";
import { isVehicleExpenseForVehicles } from "@/components/VehicleExpenseForm";
import { adjustVehicleBalance } from "@/lib/vehicleBalance";
import {
  cacheRows, getCachedRows, upsertCachedRow, removeCachedRow,
  enqueueMutation, rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";

async function syncLinkedBoletoPaid(expenseId: string, paid: boolean, paidDate: string | null, amount: number) {
  try {
    const { data: boleto } = await supabase
      .from("my_boletos")
      .select("id, status, amount, owner_id")
      .eq("expense_id", expenseId)
      .maybeSingle();
    if (!boleto) return;
    const b: any = boleto;
    if (paid) {
      if (b.status === "pago") return;
      await supabase.from("my_boletos")
        .update({ status: "pago", paid_at: paidDate })
        .eq("id", b.id);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) {
        const { data: profile } = await supabase
          .from("profiles").select("display_name").eq("user_id", uid).maybeSingle();
        await supabase.from("my_boleto_payments").insert({
          boleto_id: b.id,
          owner_id: b.owner_id,
          user_id: uid,
          paid_at: paidDate ?? new Date().toISOString().slice(0, 10),
          amount: Number(amount) || Number(b.amount) || 0,
          payment_method: null,
          status: "pago",
          notes: "Pago automaticamente ao quitar a despesa vinculada",
          user_name: (profile as any)?.display_name ?? auth.user?.email ?? null,
        });
      }
    } else {
      await supabase.from("my_boletos")
        .update({ status: "pendente", paid_at: null })
        .eq("id", b.id);
      await supabase.from("my_boleto_payments").delete().eq("boleto_id", b.id);
    }
  } catch { /* noop */ }
}



function rowToExpense(e: any): Expense {
  return {
    id: e.id, description: e.description, amount: Number(e.amount),
    type: e.type as "fixa" | "recorrente", category: e.category,
    installments: e.installments, paidInstallments: e.paid_installments,
    dueDate: e.due_date, paid: e.paid, paidDate: e.paid_date,
    notes: e.notes, createdAt: e.created_at,
    parentExpenseId: e.parent_expense_id ?? undefined,
    scope: (e.scope as "business" | "personal") ?? "business",
    paymentMethodId: e.payment_method_id ?? null,
    generateIncomeOnPay: !!e.generate_income_on_pay,
    generatedIncomeId: e.generated_income_id ?? null,
  };
}

/** Cria receita vinculada a uma despesa paga (idempotente via marker em notes). */
async function createLinkedIncome(opts: {
  ownerId: string;
  expenseId: string;           // referência usada como marker e dedup
  description: string;
  amount: number;
  category: string | null;
  paymentMethodId: string | null;
  date: string;
  parentExpenseId?: string | null;
}): Promise<string | null> {
  const marker = `[FromExpense:${opts.expenseId}]`;
  // Dedup: já existe?
  const { data: existing } = await supabase
    .from("incomes" as any)
    .select("id")
    .eq("user_id", opts.ownerId)
    .ilike("notes", `%${marker}%`)
    .limit(1);
  if (existing && existing.length > 0) return (existing[0] as any).id as string;

  const payload: any = {
    user_id: opts.ownerId,
    description: opts.description,
    amount: opts.amount,
    category: opts.category,
    client_id: null,
    source: "expense",
    payment_method_id: opts.paymentMethodId,
    received_date: opts.date,
    actual_received_date: opts.date,
    status: "received",
    notes: `Gerada automaticamente pela despesa\n${marker}`,
    recurrence: "once",
    parent_id: null,
  };
  const { data, error } = await supabase.from("incomes" as any).insert(payload).select("id").single();
  if (error || !data) return null;
  return (data as any).id as string;
}

async function deleteLinkedIncomeFor(ownerId: string, expenseId: string): Promise<void> {
  const marker = `[FromExpense:${expenseId}]`;
  await supabase
    .from("incomes" as any)
    .delete()
    .eq("user_id", ownerId)
    .ilike("notes", `%${marker}%`);
}

export function useExpenses(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const fetchExpenses = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setExpenses(data.map(rowToExpense));
        cacheRows("expenses", data).catch(() => { /* noop */ });
        return;
      }
    }
    const cached = await getCachedRows("expenses");
    if (cached.length > 0) {
      setExpenses(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToExpense));
    }
  }, [user]);

  useEffect(() => { if (enabled) fetchExpenses(); }, [fetchExpenses, enabled]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !enabled) return;
    const channel = supabase
      .channel(`expenses-realtime-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => { fetchExpenses(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchExpenses, enabled]);

  // Refetch after offline queue flush
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.tables?.includes("expenses")) fetchExpenses();
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchExpenses]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">): Promise<string | null> => {
    if (!user || !dataOwnerId) return null;
    const tempId = crypto.randomUUID();
    const optimistic: Expense = {
      ...expense, id: tempId, paid: false, paidDate: undefined,
      paidInstallments: 0, createdAt: new Date().toISOString(),
      scope: expense.scope ?? "business",
    };
    setExpenses((prev) => [optimistic, ...prev]);

    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, description: expense.description, amount: expense.amount,
      type: expense.type, category: expense.category, installments: expense.installments,
      paid_installments: 0, due_date: expense.dueDate, paid: false,
      notes: expense.notes ?? null,
      scope: expense.scope ?? "business",
      payment_method_id: expense.paymentMethodId ?? null,
      generate_income_on_pay: !!expense.generateIncomeOnPay,
    };

    await upsertCachedRow("expenses", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "insert", recordId: tempId, payload: insertPayload });
      return tempId;
    }

    const { data, error } = await supabase.from("expenses").insert(insertPayload as any).select().single();

    if (error) {
      if (!error.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "expenses", op: "insert", recordId: tempId, payload: insertPayload });
        return tempId;
      } else {
        setExpenses((prev) => prev.filter((e) => e.id !== tempId));
        await removeCachedRow("expenses", tempId);
        return null;
      }
    } else if (data) {
      setExpenses((prev) => prev.map((e) => e.id === tempId ? { ...e, id: data.id, createdAt: data.created_at } : e));
      await removeCachedRow("expenses", tempId);
      await upsertCachedRow("expenses", data);
      await rewritePendingRecordId("expenses", tempId, data.id);
      if ((expense.scope ?? "business") === "personal") {
        supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
      }
      return (data as any).id as string;
    }
    return tempId;
  }, [user, dataOwnerId]);

  const payExpense = useCallback(async (id: string, skipBalanceAdjust = false, payDate?: string, paidAmount?: number) => {
    if (!dataOwnerId) return;
    const expense = expenses.find((e) => e.id === id);
    if (!expense || expense.paid) return;

    const today = payDate || todayInAppTz();
    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;
    const online = isOnline();

    if (isRecorrenteParcelada) {
      const originalInstallment = expense.amount / expense.installments!;
      const installmentAmount = typeof paidAmount === "number" && paidAmount > 0 ? paidAmount : originalInstallment;
      const newPaid = (expense.paidInstallments || 0) + 1;
      const fullyPaid = newPaid >= expense.installments!;
      const currentDue = new Date(expense.dueDate + "T00:00:00");
      currentDue.setMonth(currentDue.getMonth() + 1);
      const nextDueDate = currentDue.toISOString().split("T")[0];

      // Stash previous dueDate in notes so unpay can restore it exactly (avoid day-of-month drift)
      const prevDueStash = `[PrevDue: ${expense.dueDate}]`;
      const baseNotesRec = (expense.notes ?? "").replace(/\n?\[PrevDue:\s*[\d-]+\]/gi, "").trimEnd();
      const stashedNotes = fullyPaid
        ? expense.notes ?? null
        : (baseNotesRec ? `${baseNotesRec}\n${prevDueStash}` : prevDueStash);

      // Optimistic: update parent
      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e,
        paidInstallments: newPaid,
        paid: fullyPaid,
        dueDate: fullyPaid ? expense.dueDate : nextDueDate,
        paidDate: fullyPaid ? today : undefined,
        notes: stashedNotes,
      } : e));

      const childTempId = crypto.randomUUID();
      const childPayload = {
        id: childTempId,
        user_id: dataOwnerId,
        description: `${expense.description} (${newPaid}/${expense.installments})`,
        amount: installmentAmount,
        type: "fixa",
        category: expense.category,
        installments: null,
        paid_installments: null,
        due_date: expense.dueDate,
        paid: true,
        paid_date: today,
        notes: expense.notes,
        parent_expense_id: id,
        scope: expense.scope ?? "business",
        payment_method_id: expense.paymentMethodId ?? null,
      };
      const parentUpdate = {
        paid_installments: newPaid,
        paid: fullyPaid,
        due_date: fullyPaid ? expense.dueDate : nextDueDate,
        paid_date: fullyPaid ? today : null,
        notes: stashedNotes,
      };

      await upsertCachedRow("expenses", { ...childPayload, created_at: new Date().toISOString() });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "insert", recordId: childTempId, payload: childPayload });
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: parentUpdate });
        return;
      }

      await supabase.from("expenses").insert(childPayload as any);
      await supabase.from("expenses").update(parentUpdate).eq("id", id);

      // Saída no extrato: parcela paga (apenas business; despesas de veículos NÃO
      // entram no extrato — são debitadas exclusivamente do "Saldo em Conta" da aba Veículos).
      if (!skipBalanceAdjust && (expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        await recordLedger({
          direction: "out", category: "expense", amount: installmentAmount,
          description: `Despesa - ${expense.description} (${newPaid}/${expense.installments})`,
          occurred_on: today, expense_id: childTempId, source: "auto",
          payment_method_id: expense.paymentMethodId ?? null,
          metadata: { parent_expense_id: id, category: expense.category },
        });
      } else if (!skipBalanceAdjust && isVehicleExpenseForVehicles(expense)) {
        // Debita o "Saldo em Conta" da aba Veículos.
        await adjustVehicleBalance(-installmentAmount);
      }

      // Receita gerada automaticamente (flag opt-in na despesa pai)
      if (expense.generateIncomeOnPay && (expense.scope ?? "business") === "business") {
        await createLinkedIncome({
          ownerId: dataOwnerId,
          expenseId: childTempId,
          description: `${expense.description} (${newPaid}/${expense.installments})`,
          amount: installmentAmount,
          category: expense.category,
          paymentMethodId: expense.paymentMethodId ?? null,
          date: today,
          parentExpenseId: id,
        });
      }
    } else {
      // Simple fixa expense — if a different paid amount was provided, update the amount
      // and stash the original in notes so we can restore it on unpay.
      const overrode = typeof paidAmount === "number" && paidAmount > 0 && paidAmount !== expense.amount;
      const finalAmount = overrode ? paidAmount! : expense.amount;
      const baseNotes = (expense.notes ?? "").replace(/\n?\[Original:\s*[\d.]+\]/gi, "").trimEnd();
      const finalNotes = overrode
        ? (baseNotes ? `${baseNotes}\n[Original: ${expense.amount.toFixed(2)}]` : `[Original: ${expense.amount.toFixed(2)}]`)
        : expense.notes ?? null;

      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: true, paidDate: today, amount: finalAmount, notes: finalNotes,
      } : e));

      const updatePayload = { paid: true, paid_date: today, amount: finalAmount, notes: finalNotes };
      await upsertCachedRow("expenses", { ...expense, ...updatePayload, id });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
        return;
      }

      await supabase.from("expenses").update(updatePayload).eq("id", id);

      // Saída no extrato: despesa simples paga (apenas business; despesas de veículos NÃO
      // entram no extrato — são debitadas exclusivamente do "Saldo em Conta" da aba Veículos).
      if (!skipBalanceAdjust && (expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        await recordLedger({
          direction: "out", category: "expense", amount: finalAmount,
          description: `Despesa - ${expense.description}`,
          occurred_on: today, expense_id: id, source: "auto",
          payment_method_id: expense.paymentMethodId ?? null,
          metadata: { category: expense.category },
        });
      } else if (!skipBalanceAdjust && isVehicleExpenseForVehicles(expense)) {
        // Debita o "Saldo em Conta" da aba Veículos.
        await adjustVehicleBalance(-finalAmount);
      }

      // Receita gerada automaticamente (flag opt-in)
      if (expense.generateIncomeOnPay && (expense.scope ?? "business") === "business") {
        const incomeId = await createLinkedIncome({
          ownerId: dataOwnerId,
          expenseId: id,
          description: expense.description,
          amount: finalAmount,
          category: expense.category,
          paymentMethodId: expense.paymentMethodId ?? null,
          date: today,
        });
        if (incomeId) {
          await supabase.from("expenses").update({ generated_income_id: incomeId } as any).eq("id", id);
          setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, generatedIncomeId: incomeId } : e));
        }
      }


      // Piggy bank credit: only when the piggy expense is paid.
      const piggyId = extractPiggyId(expense.notes);
      if (piggyId) {
        // Avoid duplicate deposits if one already exists for this expense.
        const { data: existing } = await supabase
          .from("piggy_bank_deposits" as any)
          .select("id")
          .eq("expense_id", id)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("piggy_bank_deposits" as any).insert({
            user_id: dataOwnerId,
            piggy_bank_id: piggyId,
            expense_id: id,
            amount: finalAmount,
            deposit_date: today,
            source: "expense",
          });
        }
      }
    }

    // Trigger budget overrun alert (push + Telegram) for personal expenses
    if (expense.scope === "personal" && online) {
      supabase.functions.invoke("notify-budget-overrun").catch(() => { /* silent */ });
    }
  }, [expenses, dataOwnerId]);

  const unpayExpense = useCallback(async (id: string) => {
    const expense = expenses.find((e) => e.id === id);
    if (!expense) return;

    const isRecorrenteParcelada = expense.type === "recorrente" && expense.installments && expense.installments > 1;
    const online = isOnline();

    if (isRecorrenteParcelada && (expense.paidInstallments || 0) > 0) {
      const newPaid = (expense.paidInstallments || 0) - 1;
      const wasFullyPaid = expense.paid;
      // Prefer restoring the exact previous dueDate that was stashed in notes when paying.
      const stashMatch = (expense.notes ?? "").match(/\[PrevDue:\s*([\d-]+)\]/i);
      let newDueDate: string;
      if (stashMatch) {
        newDueDate = stashMatch[1];
      } else {
        const currentDue = new Date(expense.dueDate + "T00:00:00");
        if (!wasFullyPaid) currentDue.setMonth(currentDue.getMonth() - 1);
        newDueDate = currentDue.toISOString().split("T")[0];
      }
      const restoredNotesRec = (expense.notes ?? "").replace(/\n?\[PrevDue:\s*[\d-]+\]/gi, "").trim() || null;

      // Find latest historical child record (online only — offline we can only update parent)
      let latestChildId: string | undefined;
      if (online) {
        const { data: children } = await supabase
          .from("expenses")
          .select("id, paid_date, created_at")
          .eq("parent_expense_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        latestChildId = children?.[0]?.id;
      }

      // Optimistic update
      setExpenses((prev) => prev
        .filter((e) => e.id !== latestChildId)
        .map((e) => e.id === id ? {
          ...e,
          paidInstallments: newPaid,
          paid: false,
          paidDate: undefined,
          dueDate: newDueDate,
          notes: restoredNotesRec,
        } : e));

      const parentUpdate = {
        paid_installments: newPaid,
        paid: false,
        paid_date: null,
        due_date: newDueDate,
        notes: restoredNotesRec,
      };

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: parentUpdate });
        return;
      }

      if (latestChildId) {
        // Reverte saldo + remove lançamento do extrato vinculado ao child (carteira correta)
        if ((expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
          await removeLedgerByRef({ expense_id: latestChildId, category: "expense" });
        }
        // Estorno em despesa de veículo: devolve o valor da parcela ao "Saldo em Conta" da aba Veículos.
        if (isVehicleExpenseForVehicles(expense)) {
          const { data: child } = await supabase
            .from("expenses")
            .select("amount")
            .eq("id", latestChildId)
            .maybeSingle();
          const refund = Number((child as any)?.amount ?? (expense.amount / (expense.installments || 1)));
          await adjustVehicleBalance(refund);
        }
        // Remove receita gerada para esta parcela específica, se existir
        if (dataOwnerId) await deleteLinkedIncomeFor(dataOwnerId, latestChildId);
        await supabase.from("expenses").delete().eq("id", latestChildId);
      }
      await supabase.from("expenses").update(parentUpdate).eq("id", id);
    } else if (expense.paid) {
      // Restore original amount if we stashed it on pay.
      const m = (expense.notes ?? "").match(/\[Original:\s*([\d.]+)\]/i);
      const restoredAmount = m ? parseFloat(m[1]) : expense.amount;
      const restoredNotes = (expense.notes ?? "").replace(/\n?\[Original:\s*[\d.]+\]/gi, "").trim() || null;

      setExpenses((prev) => prev.map((e) => e.id === id ? {
        ...e, paid: false, paidDate: undefined, amount: restoredAmount, notes: restoredNotes,
      } : e));
      const updatePayload = { paid: false, paid_date: null, amount: restoredAmount, notes: restoredNotes };
      await upsertCachedRow("expenses", { ...expense, ...updatePayload, id });

      if (!online) {
        await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
        return;
      }

      await supabase.from("expenses").update(updatePayload).eq("id", id);

      // Reverte saída do extrato (despesa simples) - apenas business não-veículo
      if ((expense.scope ?? "business") === "business" && !isVehicleExpenseForVehicles(expense)) {
        await removeLedgerByRef({ expense_id: id, category: "expense" });
      }
      // Estorno em despesa simples de veículo: devolve ao "Saldo em Conta" da aba Veículos.
      if (isVehicleExpenseForVehicles(expense)) {
        await adjustVehicleBalance(expense.amount);
      }

      // Remove receita gerada (se houver) e limpa o vínculo
      if (dataOwnerId) {
        await deleteLinkedIncomeFor(dataOwnerId, id);
        await supabase.from("expenses").update({ generated_income_id: null } as any).eq("id", id);
        setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, generatedIncomeId: null } : e));
      }

      // Reverse piggy bank credit when unpaying a piggy expense.
      if (extractPiggyId(expense.notes)) {
        await supabase.from("piggy_bank_deposits" as any).delete().eq("expense_id", id);
      }
    }
  }, [expenses, dataOwnerId]);

  const deleteExpense = useCallback(async (id: string, skipBalanceAdjust = false) => {
    const expense = expenses.find((e) => e.id === id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    await removeCachedRow("expenses", id);
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "delete", recordId: id });
      return;
    }
    // Remove any piggy deposit linked to this expense (no-op if none).
    await supabase.from("piggy_bank_deposits" as any).delete().eq("expense_id", id);

    // Remove lançamento do extrato (reverte saldo na carteira correta automaticamente)
    await removeLedgerByRef({ expense_id: id, category: "expense" });

    // Despesa de veículo paga sendo excluída: devolve o valor pago ao "Saldo em Conta" da aba Veículos.
    if (!skipBalanceAdjust && expense && isVehicleExpenseForVehicles(expense) && expense.paid) {
      const refund = expense.type === "recorrente" && expense.installments && expense.installments > 1
        ? expense.amount / expense.installments
        : expense.amount;
      await adjustVehicleBalance(refund);
    }

    // Remove receita gerada vinculada (se houver)
    if (dataOwnerId) await deleteLinkedIncomeFor(dataOwnerId, id);

    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) await enqueueMutation({ table: "expenses", op: "delete", recordId: id });
  }, [expenses, dataOwnerId]);

  const updateExpense = useCallback(async (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...data } : e));
    const updatePayload: any = {
      description: data.description, amount: data.amount, type: data.type,
      category: data.category, installments: data.installments,
      paid_installments: data.paidInstallments, due_date: data.dueDate,
      paid: data.paid, paid_date: data.paidDate, notes: data.notes,
      payment_method_id: data.paymentMethodId,
      generate_income_on_pay: data.generateIncomeOnPay,
    };
    Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);
    if (!isOnline()) {
      await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
      return;
    }
    const { error } = await supabase.from("expenses").update(updatePayload).eq("id", id);
    if (error) await enqueueMutation({ table: "expenses", op: "update", recordId: id, payload: updatePayload });
  }, []);


  return { expenses, addExpense, payExpense, unpayExpense, deleteExpense, updateExpense };
}
