import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { recordLedger, removeLedgerByRef } from "@/lib/ledger";
import { displayIncomeCategory, incomeCategoryKey, SALARY_INCOME_CATEGORY } from "@/lib/incomeCategory";
import { todayInAppTz } from "@/lib/timezone";
import type { Employee, Payroll, PayrollItems, PayrollStatus, SalaryItem } from "@/types/salary";

function rowToPayroll(r: any): Payroll {
  return {
    id: r.id,
    employeeId: r.employee_id,
    competence: r.competence,
    grossSalary: Number(r.gross_salary ?? 0),
    totalBenefits: Number(r.total_benefits ?? 0),
    totalDeductions: Number(r.total_deductions ?? 0),
    netSalary: Number(r.net_salary ?? 0),
    paidAmount: Number(r.paid_amount ?? 0),
    status: r.status,
    dueDate: r.due_date,
    paidDate: r.paid_date,
    paymentMethodId: r.payment_method_id,
    expenseId: r.expense_id,
    incomeId: r.income_id,
    closed: !!r.closed,
    items: (r.items as PayrollItems) ?? { earnings: [], deductions: [] },
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function sumItems(items: SalaryItem[]) {
  return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

export function buildPayrollFromEmployee(e: Employee): { items: PayrollItems; gross: number; benefits: number; deductions: number; net: number } {
  const earnings: SalaryItem[] = [
    { label: "Salário base", amount: e.baseSalary, kind: "earning" },
    ...(e.benefits ?? []).map((b) => ({ ...b, kind: "benefit" })),
  ];
  const deductions = (e.deductions ?? []).map((d) => ({ ...d, kind: "deduction" }));
  const gross = e.baseSalary;
  const benefits = sumItems(e.benefits ?? []);
  const totalDeductions = sumItems(deductions);
  const net = gross + benefits - totalDeductions;
  return { items: { earnings, deductions }, gross, benefits, deductions: totalDeductions, net };
}

export function usePayrolls(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("payrolls" as any)
      .select("*")
      .order("competence", { ascending: false });
    if (data) setPayrolls((data as any[]).map(rowToPayroll));
    setLoading(false);
  }, [user]);

  useEffect(() => { if (enabled) fetchAll(); }, [enabled, fetchAll]);

  useEffect(() => {
    if (!user || !enabled) return;
    const ch = supabase
      .channel(`payrolls-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payrolls" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, enabled, fetchAll]);

  /** Cria a folha do funcionário na competência informada (se não existir). */
  const generatePayroll = useCallback(async (employee: Employee, competence: string, dueDate?: string) => {
    if (!dataOwnerId) return null;
    const existing = payrolls.find((p) => p.employeeId === employee.id && p.competence === competence);
    if (existing) return existing;
    const calc = buildPayrollFromEmployee(employee);
    const payload = {
      user_id: dataOwnerId,
      employee_id: employee.id,
      competence,
      gross_salary: calc.gross,
      total_benefits: calc.benefits,
      total_deductions: calc.deductions,
      net_salary: calc.net,
      paid_amount: 0,
      status: "pendente" as PayrollStatus,
      due_date: dueDate ?? `${competence}-05`,
      items: calc.items as any,
    };
    const { data, error } = await supabase.from("payrolls" as any).insert(payload as any).select().single();
    if (error) throw error;
    return rowToPayroll(data);
  }, [dataOwnerId, payrolls]);

  /** Gera folhas para todos os funcionários ativos da competência (se faltarem). */
  const generateMonthlyBatch = useCallback(async (employees: Employee[], competence: string) => {
    const created: Payroll[] = [];
    for (const e of employees.filter((x) => x.status === "ativo")) {
      const r = await generatePayroll(e, competence);
      if (r) created.push(r);
    }
    return created;
  }, [generatePayroll]);

  /**
   * Aplica um pagamento (total ou parcial).
   *
   * Regra única de saída financeira:
   *   - A despesa "Salários" criada aqui é o ÚNICO evento que debita o caixa
   *     (via uma entrada no extrato vinculada a essa despesa).
   *
   * Composição opcional (employee.addToIncomes = true):
   *   - Cria também uma entrada na aba Receitas (status recebido), categoria
   *     "Salários", SEM tocar no extrato — serve apenas para compor o saldo
   *     operacional da aba Receitas. Não duplica nem altera o saldo total.
   */
  const payPayroll = useCallback(async (payroll: Payroll, employee: Employee | undefined, amount: number, opts?: { paidDate?: string; paymentMethodId?: string | null; notes?: string }) => {
    if (!dataOwnerId) return;
    const date = opts?.paidDate || todayInAppTz();
    const newPaid = Math.min(payroll.netSalary, payroll.paidAmount + amount);
    const fully = newPaid >= payroll.netSalary - 0.01;
    const status: PayrollStatus = fully ? "pago" : "parcial";

    const empName = employee?.name ?? "Funcionário";
    const baseDesc = `Salário ${empName} - ${payroll.competence}${fully ? "" : " (parcial)"}`;

    // 1. Despesa em "Salários" (única saída financeira real)
    const expensePayload = {
      user_id: dataOwnerId,
      description: baseDesc,
      amount,
      type: "fixa",
      category: "Salários",
      due_date: date,
      paid: true,
      paid_date: date,
      scope: "business",
      payment_method_id: opts?.paymentMethodId ?? null,
      notes: opts?.notes ?? `Folha de pagamento - competência ${payroll.competence} | employee_id=${payroll.employeeId}`,
    };
    const { data: expenseRow } = await supabase.from("expenses").insert(expensePayload as any).select().single();
    const expenseId = (expenseRow as any)?.id ?? null;

    // 2. Extrato (única baixa) — vinculado à despesa
    await recordLedger({
      direction: "out",
      category: "expense",
      amount,
      description: `Salário - ${empName} (${payroll.competence})`,
      occurred_on: date,
      expense_id: expenseId,
      source: "salary",
      payment_method_id: opts?.paymentMethodId ?? null,
      metadata: { payroll_id: payroll.id, competence: payroll.competence, employee_id: payroll.employeeId },
    });

    // 3. Composição opcional na aba Receitas (não toca em saldo/extrato)
    let incomeId: string | null = null;
    if (employee?.addToIncomes) {
      // Resolve a categoria de receita reutilizando a categoria já cadastrada
      // pelo usuário (ex.: "Salário"), evitando criar duplicata "Salários".
      const { data: cats } = await supabase
        .from("income_categories" as any)
        .select("name")
        .eq("user_id", dataOwnerId);
      const existing = ((cats as any[]) ?? [])
        .map((c) => c.name as string)
        .find((n) => incomeCategoryKey(n) === "salario");
      const incomeCategory = displayIncomeCategory(existing ?? SALARY_INCOME_CATEGORY);

      const { data: incomeRow } = await supabase.from("incomes").insert({
        user_id: dataOwnerId,
        description: baseDesc,
        amount,
        category: incomeCategory,
        source: "salary",
        received_date: date,
        actual_received_date: date,
        status: "received",
        recurrence: "once",
        payment_method_id: opts?.paymentMethodId ?? null,
        notes: `Composição interna do salário | payroll_id=${payroll.id} | employee_id=${payroll.employeeId}`,
      } as any).select().single();
      incomeId = (incomeRow as any)?.id ?? null;
    }

    // 4. Histórico do pagamento (vincula despesa + income opcional)
    await supabase.from("payroll_payments" as any).insert({
      user_id: dataOwnerId,
      payroll_id: payroll.id,
      amount,
      paid_date: date,
      payment_method_id: opts?.paymentMethodId ?? null,
      expense_id: expenseId,
      income_id: incomeId,
      notes: opts?.notes ?? null,
    } as any);

    // 5. Atualiza folha
    await supabase.from("payrolls" as any).update({
      paid_amount: newPaid,
      status,
      paid_date: fully ? date : null,
      payment_method_id: opts?.paymentMethodId ?? null,
      expense_id: fully ? expenseId : payroll.expenseId,
      income_id: fully ? incomeId : payroll.incomeId,
      closed: fully ? true : payroll.closed,
    } as any).eq("id", payroll.id);
  }, [dataOwnerId]);

  /** Estorna um pagamento individual: remove despesa, extrato e income vinculados. */
  const reversePayrollPayment = useCallback(async (paymentId: string) => {
    const { data: pay } = await supabase
      .from("payroll_payments" as any)
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();
    if (!pay) return;
    const p = pay as any;
    if (p.expense_id) {
      await removeLedgerByRef({ expense_id: p.expense_id });
      await supabase.from("expenses").delete().eq("id", p.expense_id);
    }
    if (p.income_id) {
      await supabase.from("incomes").delete().eq("id", p.income_id);
    }
    await supabase.from("payroll_payments" as any).delete().eq("id", paymentId);

    // Recalcula totais da folha
    const { data: remaining } = await supabase
      .from("payroll_payments" as any)
      .select("amount")
      .eq("payroll_id", p.payroll_id);
    const newPaid = ((remaining as any[]) ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
    const { data: payrollRow } = await supabase
      .from("payrolls" as any).select("net_salary").eq("id", p.payroll_id).maybeSingle();
    const net = Number((payrollRow as any)?.net_salary ?? 0);
    const fully = newPaid >= net - 0.01;
    const status: PayrollStatus = newPaid <= 0.01 ? "pendente" : fully ? "pago" : "parcial";
    await supabase.from("payrolls" as any).update({
      paid_amount: newPaid,
      status,
      paid_date: fully ? p.paid_date : null,
      closed: fully ? true : false,
    } as any).eq("id", p.payroll_id);
  }, []);

  const reopenPayroll = useCallback(async (payroll: Payroll) => {
    await supabase.from("payrolls" as any).update({ closed: false } as any).eq("id", payroll.id);
  }, []);

  const closePayroll = useCallback(async (payroll: Payroll) => {
    await supabase.from("payrolls" as any).update({ closed: true } as any).eq("id", payroll.id);
  }, []);

  /** Exclui a folha e todos os efeitos colaterais (despesas, incomes, extrato). */
  const deletePayroll = useCallback(async (id: string) => {
    const { data: payments } = await supabase
      .from("payroll_payments" as any)
      .select("expense_id, income_id")
      .eq("payroll_id", id);
    for (const p of ((payments as any[]) ?? [])) {
      if (p.expense_id) {
        await removeLedgerByRef({ expense_id: p.expense_id });
        await supabase.from("expenses").delete().eq("id", p.expense_id);
      }
      if (p.income_id) {
        await supabase.from("incomes").delete().eq("id", p.income_id);
      }
    }
    await supabase.from("payrolls" as any).delete().eq("id", id);
  }, []);

  /**
   * Reorganiza folhas antigas: extrai proventos extras (13º, férias, etc.) que
   * estavam misturados na mesma folha em contracheques separados, preservando
   * a data de vencimento original. Aplica somente em folhas sem pagamentos e
   * não fechadas, para não afetar histórico financeiro.
   */
  const splitLegacyExtraEarnings = useCallback(async () => {
    if (!dataOwnerId) return { split: 0, created: 0 };
    const EXTRA_KINDS = new Set([
      "13_salario", "ferias", "1_3_ferias", "adicional",
      "bonificacao", "hora_extra", "comissao", "outros",
    ]);
    let touched = 0;
    let created = 0;
    for (const p of payrolls) {
      if (p.paidAmount > 0 || p.closed) continue;
      const earnings = p.items?.earnings ?? [];
      const extras = earnings.filter((i) => i.kind && EXTRA_KINDS.has(i.kind));
      if (extras.length === 0) continue;
      const remaining = earnings.filter((i) => !i.kind || !EXTRA_KINDS.has(i.kind));
      const deductions = p.items?.deductions ?? [];

      // Cria um contracheque separado para cada provento extra
      for (const item of extras) {
        const { error } = await supabase.from("payrolls" as any).insert({
          user_id: dataOwnerId,
          employee_id: p.employeeId,
          competence: p.competence,
          gross_salary: Number(item.amount) || 0,
          total_benefits: 0,
          total_deductions: 0,
          net_salary: Number(item.amount) || 0,
          paid_amount: 0,
          status: "pendente",
          due_date: p.dueDate ?? `${p.competence}-05`,
          items: { earnings: [item], deductions: [] } as any,
          notes: `[${item.label}] (reorganizado de folha anterior)`,
        } as any);
        if (error) throw error;
        created++;
      }

      // Atualiza a folha original removendo os extras
      const newEarn = sumItems(remaining);
      const newDed = sumItems(deductions);
      await supabase.from("payrolls" as any).update({
        items: { earnings: remaining, deductions } as any,
        gross_salary: newEarn,
        total_deductions: newDed,
        net_salary: newEarn - newDed,
      } as any).eq("id", p.id);
      touched++;
    }
    await fetchAll();
    return { split: touched, created };
  }, [dataOwnerId, payrolls, fetchAll]);

  const updatePayroll = useCallback(async (id: string, patch: Partial<Payroll>) => {
    const p: any = {};
    if (patch.dueDate !== undefined) p.due_date = patch.dueDate;
    if (patch.notes !== undefined) p.notes = patch.notes;
    if (patch.items !== undefined) {
      p.items = patch.items;
      const earnings = sumItems(patch.items.earnings);
      const ded = sumItems(patch.items.deductions);
      p.gross_salary = earnings;
      p.total_deductions = ded;
      p.net_salary = earnings - ded;
    }
    await supabase.from("payrolls" as any).update(p).eq("id", id);
  }, []);

  return {
    payrolls, loading, refresh: fetchAll,
    generatePayroll, generateMonthlyBatch, payPayroll, reversePayrollPayment,
    reopenPayroll, closePayroll, deletePayroll, updatePayroll,
  };
}
