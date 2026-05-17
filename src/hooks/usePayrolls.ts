import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { recordLedger } from "@/lib/ledger";
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

  /** Aplica um pagamento (total ou parcial) e gera despesa + extrato. */
  const payPayroll = useCallback(async (payroll: Payroll, employee: Employee | undefined, amount: number, opts?: { paidDate?: string; paymentMethodId?: string | null; notes?: string }) => {
    if (!dataOwnerId) return;
    const date = opts?.paidDate || todayInAppTz();
    const newPaid = Math.min(payroll.netSalary, payroll.paidAmount + amount);
    const fully = newPaid >= payroll.netSalary - 0.01;
    const status: PayrollStatus = fully ? "pago" : "parcial";

    // 1. Cria despesa "Salários" já marcada como paga
    const empName = employee?.name ?? "Funcionário";
    const expensePayload = {
      user_id: dataOwnerId,
      description: `Salário ${empName} - ${payroll.competence}${fully ? "" : " (parcial)"}`,
      amount,
      type: "fixa",
      category: "Salários",
      due_date: date,
      paid: true,
      paid_date: date,
      scope: "business",
      payment_method_id: opts?.paymentMethodId ?? null,
      notes: opts?.notes ?? `Folha de pagamento - competência ${payroll.competence}`,
    };
    const { data: expenseRow } = await supabase.from("expenses").insert(expensePayload as any).select().single();
    const expenseId = expenseRow?.id ?? null;

    // 2. Registra no extrato (ledger)
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

    // 3. Salva histórico do pagamento
    await supabase.from("payroll_payments" as any).insert({
      user_id: dataOwnerId,
      payroll_id: payroll.id,
      amount,
      paid_date: date,
      payment_method_id: opts?.paymentMethodId ?? null,
      expense_id: expenseId,
      notes: opts?.notes ?? null,
    } as any);

    // 4. Atualiza folha
    await supabase.from("payrolls" as any).update({
      paid_amount: newPaid,
      status,
      paid_date: fully ? date : null,
      payment_method_id: opts?.paymentMethodId ?? null,
      expense_id: fully ? expenseId : payroll.expenseId,
      closed: fully ? true : payroll.closed,
    } as any).eq("id", payroll.id);
  }, [dataOwnerId]);

  const reopenPayroll = useCallback(async (payroll: Payroll) => {
    await supabase.from("payrolls" as any).update({ closed: false } as any).eq("id", payroll.id);
  }, []);

  const closePayroll = useCallback(async (payroll: Payroll) => {
    await supabase.from("payrolls" as any).update({ closed: true } as any).eq("id", payroll.id);
  }, []);

  const deletePayroll = useCallback(async (id: string) => {
    await supabase.from("payrolls" as any).delete().eq("id", id);
  }, []);

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
    generatePayroll, generateMonthlyBatch, payPayroll,
    reopenPayroll, closePayroll, deletePayroll, updatePayroll,
  };
}
