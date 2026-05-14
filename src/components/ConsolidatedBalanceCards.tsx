import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Wallet } from "lucide-react";
import { useLoans } from "@/hooks/useLoans";
import { useProducts } from "@/hooks/useProducts";
import { useIncomes } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import { getBalances } from "@/lib/balance";
import { supabase } from "@/integrations/supabase/client";
import type { Sale } from "@/types/loan";

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function saleReceivedTotal(sale: Sale): number {
  if (sale.paymentHistory && sale.paymentHistory.length > 0) {
    return sale.paymentHistory.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  return (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
}

export function ConsolidatedBalanceCards() {
  const { loans } = useLoans();
  const { sales } = useProducts(true);
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { piggyBanks, balances: piggyBalances } = usePiggyBanks();

  const [dashboardBalance, setDashboardBalance] = useState(0);
  const [vehicleBalance, setVehicleBalance] = useState(0);

  const reloadExternalBalances = useCallback(async () => {
    const [b, { data: { session } }] = await Promise.all([
      getBalances(),
      supabase.auth.getSession(),
    ]);
    setDashboardBalance(b.account);
    const user = session?.user;
    if (user) {
      const { data: ownerRow } = await supabase
        .from("user_owner" as any)
        .select("owner_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const ownerId = (ownerRow as any)?.owner_id || user.id;
      const { data } = await supabase
        .from("vehicle_balance" as any)
        .select("amount")
        .eq("user_id", ownerId)
        .maybeSingle();
      setVehicleBalance(Number((data as any)?.amount ?? 0));
    }
  }, []);

  useEffect(() => { reloadExternalBalances(); }, [reloadExternalBalances]);
  useEffect(() => {
    const onChange = () => { reloadExternalBalances(); };
    window.addEventListener("balance:changed", onChange);
    return () => window.removeEventListener("balance:changed", onChange);
  }, [reloadExternalBalances]);

  // Saldo Total na Rua = pendentes empréstimos + pendentes vendas
  const pendingLoans = useMemo(
    () => loans
      .filter((l) => l.status !== "paid")
      .reduce((s, l) => s + (l.remainingAmount ?? 0), 0),
    [loans],
  );
  const pendingSales = useMemo(
    () => sales.reduce((s, sale) => s + Math.max(0, sale.total - saleReceivedTotal(sale)), 0),
    [sales],
  );
  const totalNaRua = pendingLoans + pendingSales;

  // Saldo Receitas (mesma fórmula do IncomeBalanceCard)
  const incomesBalance = useMemo(() => {
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter((e) => e.paid && (e.scope ?? "business") === "personal")
      .reduce((s, e) => s + e.amount, 0);
    return totalIncomeReceived + totalSalesReceived - totalExpensePaid;
  }, [incomes, sales, expenses]);

  const piggyTotal = useMemo(() => {
    let sum = 0;
    piggyBanks.forEach((pb) => {
      const b = piggyBalances.get(pb.id);
      if (b) sum += b.balance;
    });
    return sum;
  }, [piggyBanks, piggyBalances]);

  const totalEmMaos = dashboardBalance + incomesBalance + piggyTotal + vehicleBalance;

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <Card no3d>
        <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
          <div className="flex items-center justify-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-warning" />
            <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo Total na Rua</p>
          </div>
          <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
            {formatBRL(totalNaRua)}
          </p>
        </CardContent>
      </Card>
      <Card no3d>
        <CardContent className="p-2.5 sm:p-3 flex flex-col items-center text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
            <p className="text-[11px] sm:text-xs text-muted-foreground">Saldo Total em Mãos</p>
          </div>
          <p className={`text-base sm:text-xl font-bold truncate leading-tight mt-0.5 ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
            {formatBRL(totalEmMaos)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
