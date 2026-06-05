import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { useIncomes, Income } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useProducts } from "@/hooks/useProducts";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { isCreditCardExpense, listPaidInvoicesInRange } from "@/lib/creditCardInvoiceTotals";
import type { Expense, Sale } from "@/types/loan";

function saleReceivedTotal(sale: Sale): number {
  const history = sale.paymentHistory || [];
  const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

function saleReceivedInMonth(sale: Sale, monthKey: string): number {
  const history = sale.paymentHistory || [];
  if (history.length > 0) {
    const historyMonthSum = history
      .filter((p) => (p.date || "").startsWith(monthKey))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
    const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
    if (historyTotal >= legacyTotal) return historyMonthSum;
    const missing = legacyTotal - historyTotal;
    return historyMonthSum + ((sale.date || "").startsWith(monthKey) ? missing : 0);
  }
  return (sale.date || "").startsWith(monthKey) ? saleReceivedTotal(sale) : 0;
}

function monthlyExpenseAmount(e: Expense): number {
  if (e.type === "recorrente" && e.installments && e.installments > 1) {
    return e.amount / e.installments;
  }
  return e.amount;
}

export interface MonthFlow {
  monthIn: number;
  monthOut: number;
}

/**
 * Calcula Entradas/Saídas do mês usando exatamente a mesma fórmula do
 * card "Entradas mês" / "Saídas mês" exibida em IncomeBalanceCard.
 */
export function useMonthFlow(monthKey: string): MonthFlow {
  const ownerId = useDataOwner();
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { sales: rawSales } = useProducts(true);
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  const sales = useMemo(
    () => rawSales.filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );

  const [piggyNetByMonth, setPiggyNetByMonth] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = async () => {
      const { data: piggy } = await supabase
        .from("piggy_bank_deposits" as any)
        .select("amount, deposit_date")
        .eq("user_id", ownerId);
      if (cancelled) return;
      const byMonth: Record<string, number> = {};
      for (const r of (piggy as any[]) ?? []) {
        const mk = ((r.deposit_date as string) || "").slice(0, 7);
        if (!mk) continue;
        byMonth[mk] = (byMonth[mk] ?? 0) + (Number(r.amount) || 0);
      }
      setPiggyNetByMonth(byMonth);
    };
    load();
    const handler = () => load();
    window.addEventListener("balance:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("balance:changed", handler);
    };
  }, [ownerId]);

  return useMemo<MonthFlow>(() => {
    const monthInIncomes = incomes.reduce((s, i: Income) => {
      if (i.source === "Ajuste manual") return s;
      if (i.status !== "received") return s;
      if (!i.receivedDate.startsWith(monthKey)) return s;
      return s + i.amount;
    }, 0);
    const monthInSales = sales.reduce((s, sale) => s + saleReceivedInMonth(sale, monthKey), 0);
    const piggyMonth = piggyNetByMonth[monthKey] ?? 0;
    const piggyMonthIn = Math.max(0, -piggyMonth);
    const monthIn = monthInIncomes + monthInSales + piggyMonthIn;

    const monthOutExpenses = expenses.reduce((s, e: any) => {
      if ((e.scope ?? "business") !== "personal") return s;
      if (!e.paid) return s;
      if (isCreditCardExpense(e)) return s;
      const d = e.paidDate || e.dueDate || "";
      if (!d.startsWith(monthKey)) return s;
      return s + monthlyExpenseAmount(e);
    }, 0);
    const [yy, mm] = monthKey.split("-").map(Number);
    let invoicesPaid = 0;
    if (yy && mm) {
      const lastDay = new Date(yy, mm, 0).getDate();
      invoicesPaid = listPaidInvoicesInRange(
        expenses,
        cards,
        openings,
        `${monthKey}-01`,
        `${monthKey}-${String(lastDay).padStart(2, "0")}`,
      ).reduce((s, inv) => s + inv.paidTotal, 0);
    }
    const monthOut = monthOutExpenses + invoicesPaid;

    return { monthIn, monthOut };
  }, [incomes, sales, expenses, cards, openings, piggyNetByMonth, monthKey]);
}
