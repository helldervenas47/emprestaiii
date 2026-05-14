import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/** Mesmo cálculo da aba Vendas: total pago considerando installmentAmounts/downPayment/partialPaid. */
function getSalePaidAmount(s: Sale): number {
  const amounts = s.installmentAmounts;
  if (amounts && amounts.length > 0) {
    let paid = s.downPayment || 0;
    for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
      paid += amounts[i] || 0;
    }
    return paid + (s.partialPaid || 0);
  }
  const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
  return vp * s.paidInstallments + (s.downPayment || 0) + (s.partialPaid || 0);
}

/** Categoriza igual à aba Vendas, para excluir vendas quitadas do "a receber". */
function isSalePaid(s: Sale): boolean {
  const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
  return isRecorrente ? s.paidInstallments >= s.installments : s.paidInstallments >= 1;
}

export function ConsolidatedBalanceCards() {
  const { loans } = useLoans();
  const { sales } = useProducts(true);
  const { incomes } = useIncomes(true);
  const { expenses } = useExpenses(true);
  const { piggyBanks, balances: piggyBalances, deposits: piggyDeposits } = usePiggyBanks();

  const [dashboardBalance, setDashboardBalance] = useState(0);
  const [vehicleBalance, setVehicleBalance] = useState(0);
  const [openRua, setOpenRua] = useState(false);
  const [openMaos, setOpenMaos] = useState(false);

  const reloadExternalBalances = useCallback(async () => {
    const [b, { data: { session } }] = await Promise.all([
      getBalances(),
      supabase.auth.getSession(),
    ]);
    setDashboardBalance(b.total);
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

  const pendingLoans = useMemo(
    () => loans
      .filter((l) => l.status !== "paid")
      .reduce((s, l) => s + (l.remainingAmount ?? 0), 0),
    [loans],
  );
  const pendingSales = useMemo(
    () => sales
      .filter((s) => s.businessType === "venda" && !isSalePaid(s))
      .reduce((s, sale) => s + Math.max(0, sale.total - getSalePaidAmount(sale)), 0),
    [sales],
  );
  const totalNaRua = pendingLoans + pendingSales;

  // Saldo em Conta (Receitas) — espelha exatamente IncomeBalanceCard:
  //  recebidos + vendas recebidas − despesas pessoais pagas − aportes manuais ao cofrinho.
  const incomesBalance = useMemo(() => {
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter((e) => e.paid && (e.scope ?? "business") === "personal")
      .reduce((s, e) => s + e.amount, 0);
    const totalPiggyManualDeposits = piggyDeposits
      .filter((d) => !d.expenseId)
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return totalIncomeReceived + totalSalesReceived - totalExpensePaid - totalPiggyManualDeposits;
  }, [incomes, sales, expenses, piggyDeposits]);

  const piggyTotal = useMemo(() => {
    let sum = 0;
    piggyBanks.forEach((pb) => {
      const b = piggyBalances.get(pb.id);
      if (b) sum += b.balance;
    });
    return sum;
  }, [piggyBanks, piggyBalances]);

  const totalEmMaos = dashboardBalance + incomesBalance + piggyTotal + vehicleBalance;

  const Row = ({ label, value }: { label: string; value: number }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${value < 0 ? "text-destructive" : "text-foreground"}`}>
        {formatBRL(value)}
      </span>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenRua(true)}>
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
        <Card no3d className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => setOpenMaos(true)}>
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

      <Dialog open={openRua} onOpenChange={setOpenRua}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-warning" /> Saldo Total na Rua
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Row label="Pendente de empréstimos" value={pendingLoans} />
            <Row label="Pendente de vendas" value={pendingSales} />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
              <span className="text-sm font-semibold">Total consolidado</span>
              <span className={`text-base font-bold tabular-nums ${totalNaRua < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(totalNaRua)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openMaos} onOpenChange={setOpenMaos}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-success" /> Saldo Total em Mãos
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Row label="Saldo em conta (Dashboard)" value={dashboardBalance} />
            <Row label="Saldo em conta (Receitas)" value={incomesBalance} />
            <Row label="Total dos Cofrinhos" value={piggyTotal} />
            <Row label="Saldo (Veículos)" value={vehicleBalance} />
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-border">
              <span className="text-sm font-semibold">Total consolidado</span>
              <span className={`text-base font-bold tabular-nums ${totalEmMaos < 0 ? "text-destructive" : "text-foreground"}`}>
                {formatBRL(totalEmMaos)}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
