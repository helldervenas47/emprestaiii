import { useMemo } from "react";
import { useIncomes } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useProducts } from "@/hooks/useProducts";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import { useExternalAccountSources } from "@/hooks/useExternalAccountSources";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { creditCardInvoiceExtraPaid, creditCardLedgerHandled, cycleKeyForDate, isCreditCardExpense } from "@/lib/creditCardInvoiceTotals";
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
  const external = useExternalAccountSources();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

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
    // Excedente pago de faturas de cartão (saldo inicial / override) que não está em despesas individuais.
    const ccExtra = creditCardInvoiceExtraPaid(expenses as any, cards, openings);
    const base =
      totalIncomeReceived +
      totalSalesReceived -
      totalExpensePaid -
      totalPiggyManualDeposits -
      ccExtra;
    // Soma saldos externos (Dashboard conta+dinheiro, Cofrinhos, Veículos)
    return base + external.total;
  }, [incomes, sales, expenses, piggyDeposits, external.total, cards, openings]);

  return balance;
}

export { saleReceivedTotal };
