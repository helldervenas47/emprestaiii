import { useEffect, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Income } from "@/hooks/useIncomes";
import { getBalances } from "@/lib/balance";
import { useHideValues } from "@/contexts/HideValuesContext";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

function fmt(n: number, hide: boolean) {
  if (hide) return "•••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  incomes: Income[];
}

export function IncomeBalanceCard({ incomes }: Props) {
  const { hidden: hide } = useHideValues();
  const { user } = useAuth();
  const [balance, setBalance] = useState({ account: 0, cash: 0, total: 0 });
  const [monthOut, setMonthOut] = useState(0);
  const [prevMonthIn, setPrevMonthIn] = useState(0);

  useEffect(() => {
    getBalances().then(setBalance);
    const handler = () => getBalances().then(setBalance);
    window.addEventListener("balance:changed", handler);
    return () => window.removeEventListener("balance:changed", handler);
  }, []);

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  // outflows + previous month income from ledger
  useEffect(() => {
    if (!user) return;
    (async () => {
      const start = `${monthKey}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
      const { data } = await supabase
        .from("account_ledger")
        .select("direction, amount, occurred_on")
        .gte("occurred_on", start)
        .lte("occurred_on", endDate);
      let out = 0;
      for (const r of (data || []) as any[]) {
        if (r.direction === "out") out += Number(r.amount);
      }
      setMonthOut(out);

      const prevStart = `${prevKey}-01`;
      const prevEnd = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).toISOString().split("T")[0];
      const { data: pdata } = await supabase
        .from("account_ledger")
        .select("direction, amount")
        .gte("occurred_on", prevStart)
        .lte("occurred_on", prevEnd);
      let pin = 0;
      for (const r of (pdata || []) as any[]) {
        if (r.direction === "in") pin += Number(r.amount);
      }
      setPrevMonthIn(pin);
    })();
  }, [user, monthKey, prevKey]);

  const monthIn = useMemo(() => {
    return incomes
      .filter((i) => i.status === "received" && i.receivedDate.startsWith(monthKey))
      .reduce((s, i) => s + i.amount, 0);
  }, [incomes, monthKey]);

  const pendingIn = useMemo(() => {
    return incomes
      .filter((i) => i.status !== "received" && i.receivedDate.startsWith(monthKey))
      .reduce((s, i) => s + i.amount, 0);
  }, [incomes, monthKey]);

  const projected = balance.total + pendingIn;
  const diff = monthIn - prevMonthIn;
  const pct = prevMonthIn > 0 ? (diff / prevMonthIn) * 100 : 0;
  const trend: "up" | "down" | "neutral" = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";

  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";

  return (
    <Card no3d className="p-5 sm:p-6 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>Saldo em Conta</span>
          </div>
          <div className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            {fmt(balance.total, hide)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
            <Eye className="h-3 w-3" />
            Conta {fmt(balance.account, hide)} · Dinheiro {fmt(balance.cash, hide)}
          </div>
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
          {trend === "up" && <TrendingUp className="h-4 w-4" />}
          {trend === "down" && <TrendingDown className="h-4 w-4" />}
          {prevMonthIn > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs mês anterior` : "Sem histórico"}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <ArrowUpRight className="h-3 w-3" /> Entradas mês
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(monthIn, hide)}</div>
        </div>
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <div className="flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 font-medium">
            <ArrowDownRight className="h-3 w-3" /> Saídas mês
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(monthOut, hide)}</div>
        </div>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">Pendentes</div>
          <div className="text-lg font-semibold mt-1">{fmt(pendingIn, hide)}</div>
        </div>
        <div className="rounded-xl bg-primary/10 border border-primary/20 p-3">
          <div className="text-xs text-primary font-medium">Saldo previsto</div>
          <div className="text-lg font-semibold mt-1">{fmt(projected, hide)}</div>
        </div>
      </div>
    </Card>
  );
}
