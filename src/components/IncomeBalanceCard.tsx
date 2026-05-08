import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Income } from "@/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";

function fmt(n: number, hide: boolean) {
  if (hide) return "•••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  incomes: Income[];
  expenses: Expense[];
}

export function IncomeBalanceCard({ incomes, expenses }: Props) {
  const { hidden: hide } = useHideValues();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const calc = useMemo(() => {
    // Saldo em Conta = receitas recebidas - despesas pagas (todos os períodos)
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalExpensePaid = expenses
      .filter((e) => e.paid)
      .reduce((s, e) => s + e.amount, 0);
    const balance = totalIncomeReceived - totalExpensePaid;

    // Movimentação do mês vigente
    const monthIn = incomes
      .filter((i) => i.status === "received" && i.receivedDate.startsWith(monthKey))
      .reduce((s, i) => s + i.amount, 0);
    const monthOut = expenses
      .filter((e) => e.paid && (e.paidDate || "").startsWith(monthKey))
      .reduce((s, e) => s + e.amount, 0);

    // Futuras do mês vigente (pendentes/agendadas, não canceladas)
    const futureIn = incomes
      .filter((i) => i.status === "pending" && i.receivedDate.startsWith(monthKey))
      .reduce((s, i) => s + i.amount, 0);
    // Para recorrentes parceladas: usar parcela mensal (amount / installments)
    // Para fixas / recorrentes sem parcela: usar amount cheio
    const monthlyExpenseAmount = (e: Expense) => {
      if (e.type === "recorrente" && e.installments && e.installments > 1) {
        return e.amount / e.installments;
      }
      return e.amount;
    };
    const futureOut = expenses
      .filter((e) => !e.paid && (e.dueDate || "").startsWith(monthKey))
      .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
    const pendingInCount = incomes
      .filter((i) => i.status === "pending" && i.receivedDate.startsWith(monthKey))
      .length;

    // Saldo previsto = saldo atual + futuras receitas mês - futuras despesas mês
    const projected = balance + futureIn - futureOut;
    const projectedDiff = projected - balance;

    const prevIn = incomes
      .filter((i) => i.status === "received" && i.receivedDate.startsWith(prevKey))
      .reduce((s, i) => s + i.amount, 0);

    return { balance, monthIn, monthOut, futureIn, futureOut, projected, projectedDiff, prevIn, pendingInCount };
  }, [incomes, expenses, monthKey, prevKey]);

  const diff = calc.monthIn - calc.prevIn;
  const pct = calc.prevIn > 0 ? (diff / calc.prevIn) * 100 : 0;
  const trend: "up" | "down" | "neutral" = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";

  const balanceColor = calc.balance > 0 ? "text-emerald-600 dark:text-emerald-400"
    : calc.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground";

  return (
    <Card no3d className="p-5 sm:p-6 bg-gradient-to-br from-primary/5 via-card to-card border-primary/20">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span>Saldo em Conta</span>
          </div>
          <div className={`mt-2 text-3xl sm:text-4xl font-bold tracking-tight ${balanceColor}`}>
            {fmt(calc.balance, hide)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Calculado apenas com receitas e despesas desta área
          </div>
        </div>
        <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
          {trend === "up" && <TrendingUp className="h-4 w-4" />}
          {trend === "down" && <TrendingDown className="h-4 w-4" />}
          {calc.prevIn > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs mês anterior` : "Sem histórico"}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <ArrowUpRight className="h-3 w-3" /> Entradas mês
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(calc.monthIn, hide)}</div>
        </div>
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
          <div className="flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 font-medium">
            <ArrowDownRight className="h-3 w-3" /> Saídas mês
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(calc.monthOut, hide)}</div>
        </div>
        <div className={`rounded-xl border p-3 ${calc.projected >= calc.balance ? "bg-primary/10 border-primary/20" : "bg-rose-500/10 border-rose-500/30"}`}>
          <div className="flex items-center justify-between gap-1">
            <span className={`text-xs font-medium ${calc.projected >= calc.balance ? "text-primary" : "text-rose-700 dark:text-rose-400"}`}>Saldo previsto</span>
            {calc.projectedDiff >= 0
              ? <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              : <TrendingDown className="h-3 w-3 text-rose-600 dark:text-rose-400" />}
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(calc.projected, hide)}</div>
          <div className={`text-[10px] mt-0.5 ${calc.projectedDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {calc.projectedDiff >= 0 ? "+" : ""}{fmt(calc.projectedDiff, hide)} vs atual
          </div>
        </div>
      </div>
    </Card>
  );
}
