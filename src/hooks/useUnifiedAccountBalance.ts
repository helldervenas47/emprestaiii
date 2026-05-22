import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwner } from "@/hooks/useDataOwner";
import { useIncomes } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useProducts } from "@/hooks/useProducts";
import { isCreditCardExpense } from "@/lib/creditCardInvoiceTotals";
import { isVehicleExpenseForVehicles } from "@/components/VehicleExpenseForm";
import type { Sale } from "@/types/loan";

function saleReceivedTotal(sale: Sale): number {
  const historyTotal = (sale.paymentHistory || []).reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

/**
 * Saldo em Conta unificado — exatamente a mesma base usada pelo
 * card "Saldo em Conta" da aba Receitas (IncomeBalanceCard):
 *
 *   receitas recebidas
 * + vendas recebidas (exceto aluguel de veículo)
 * − despesas pessoais pagas (exceto itens de cartão e veículos)
 * − pagamentos de fatura de cartão lançados no extrato
 * − aportes líquidos nos cofrinhos
 */
export function useUnifiedAccountBalance(): number {
  const ownerId = useDataOwner();
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { sales } = useProducts(true);

  const [cardInvoicePaidTotal, setCardInvoicePaidTotal] = useState(0);
  const [piggyNetTotal, setPiggyNetTotal] = useState(0);

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: ledger }, { data: piggy }] = await Promise.all([
        supabase
          .from("account_ledger")
          .select("amount")
          .eq("user_id", ownerId)
          .eq("direction", "out")
          .eq("metadata->>kind", "credit_card_invoice_payment"),
        supabase
          .from("piggy_bank_deposits" as any)
          .select("amount")
          .eq("user_id", ownerId),
      ]);
      if (cancelled) return;
      setCardInvoicePaidTotal(
        ((ledger as any[]) ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
      );
      setPiggyNetTotal(
        ((piggy as any[]) ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0),
      );
    };
    load();
    const handler = () => load();
    window.addEventListener("ledger:changed", handler);
    window.addEventListener("balance:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("ledger:changed", handler);
      window.removeEventListener("balance:changed", handler);
    };
  }, [ownerId]);

  return useMemo(() => {
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalSalesReceived = sales
      .filter((s) => s.businessType !== "aluguel_veiculo")
      .reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter(
        (e: any) =>
          e.paid &&
          !isCreditCardExpense(e) &&
          ((e.scope ?? "business") === "personal" || isVehicleExpenseForVehicles(e)),
      )
      .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
    return (
      totalIncomeReceived
      + totalSalesReceived
      - totalExpensePaid
      - cardInvoicePaidTotal
      - piggyNetTotal
    );
  }, [incomes, expenses, sales, cardInvoicePaidTotal, piggyNetTotal]);
}
