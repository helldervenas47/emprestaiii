import { useMemo } from "react";
import { useIncomes } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useProducts } from "@/hooks/useProducts";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import type { Sale } from "@/types/loan";

/**
 * Fonte oficial e única do "Saldo em Conta" do app.
 * Espelha exatamente o cálculo exibido na tela inicial da aba Receitas e Despesas
 * (IncomeBalanceCard). Todos os módulos (Dashboard, Cofrinhos, Cards consolidados,
 * indicadores, etc.) devem consumir este hook para garantir consistência.
 */
function saleReceivedTotal(sale: Sale): number {
  const historyTotal = (sale.paymentHistory || []).reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const iv =
    sale.installmentValue ??
    (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal =
    (sale.downPayment || 0) +
    (sale.paidInstallments || 0) * iv +
    (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

export function useAccountBalance() {
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { sales } = useProducts(true);
  const { deposits: piggyDeposits } = usePiggyBanks();

  const balance = useMemo(() => {
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce(
      (s, sale) => s + saleReceivedTotal(sale),
      0,
    );
    const totalExpensePaid = expenses
      .filter((e: any) => e.paid && (e.scope ?? "business") === "personal")
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    const totalPiggyManualDeposits = piggyDeposits
      .filter((d) => !d.expenseId)
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return (
      totalIncomeReceived +
      totalSalesReceived -
      totalExpensePaid -
      totalPiggyManualDeposits
    );
  }, [incomes, sales, expenses, piggyDeposits]);

  return balance;
}

export { saleReceivedTotal };
