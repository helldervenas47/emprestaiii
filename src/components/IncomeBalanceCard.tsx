import { useMemo, useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Income } from "@/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Settings2 } from "lucide-react";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { getCardInvoiceTotalsForMonth, isCreditCardExpense } from "@/lib/creditCardInvoiceTotals";
import { isPiggyExpense } from "@/hooks/usePiggyBanks";

function fmt(n: number, hide: boolean) {
  if (hide) return "•••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  incomes: Income[];
  expenses: Expense[];
  onAdjust?: (delta: number) => Promise<void> | void;
  readOnly?: boolean;
  onOpenIncomes?: () => void;
  onOpenExpenses?: () => void;
}

export function IncomeBalanceCard({ incomes, expenses, onAdjust, readOnly, onOpenIncomes, onOpenExpenses }: Props) {
  const { hidden: hide } = useHideValues();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

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
    // Inclui despesa no mês vigente quando:
    //  • dueDate cai no mês, OU
    //  • é recorrente parcelada/fixa cujo ciclo ativo cobre o mês vigente
    //    (ainda restam parcelas a pagar e o mês está dentro do range total).
    const [curY, curM] = monthKey.split("-").map(Number);
    const currentMonths = curY * 12 + curM;
    const coversCurrentMonth = (e: Expense) => {
      if ((e.dueDate || "").startsWith(monthKey)) return true;
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      if (!isRec) return false;
      const [dY, dM] = e.dueDate.split("-").map(Number);
      const startMonths = dY * 12 + dM;
      const endMonths = startMonths + (e.installments! - 1);
      // Parent's dueDate aponta para a próxima parcela em aberto. Se já está no futuro
      // (mês > vigente), significa que a parcela do mês vigente já foi paga (existe um
      // child histórico com paid=true) — não recontar aqui.
      if (startMonths > currentMonths) return false;
      return currentMonths <= endMonths;
    };
    // Despesas pessoais pendentes do mês vigente (apenas scope=personal e não pagas)
    const futureOut = expenses
      .filter((e) => !e.paid && (e.scope ?? "business") === "personal" && coversCurrentMonth(e))
      .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
    const pendingInCount = incomes
      .filter((i) => i.status === "pending" && i.receivedDate.startsWith(monthKey))
      .length;

    // Saldo previsto = saldo em conta + receitas pendentes do mês - despesas pessoais pendentes do mês
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
    <Card no3d className="p-5 sm:p-6 bg-gradient-to-br from-primary/5 via-card to-card border border-border/50 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.08)] animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
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
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <div className={`flex items-center gap-1 text-sm font-medium whitespace-nowrap ${trendColor}`}>
              {trend === "up" && <TrendingUp className="h-4 w-4" />}
              {trend === "down" && <TrendingDown className="h-4 w-4" />}
              {calc.prevIn > 0 ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs mês anterior` : "Sem histórico"}
            </div>
            {!readOnly && onAdjust && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 whitespace-nowrap"
                onClick={() => { setTarget(calc.balance.toFixed(2)); setAdjustOpen(true); }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Ajustar saldo
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <button
          type="button"
          onClick={onOpenIncomes}
          className="text-left rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        >
          <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            <ArrowUpRight className="h-3 w-3" /> Entradas mês
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(calc.monthIn, hide)}</div>
          <div className="text-[10px] mt-0.5 text-emerald-700/70 dark:text-emerald-400/70">Toque para ver detalhes</div>
        </button>
        <button
          type="button"
          onClick={onOpenExpenses}
          className="text-left rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 transition-all hover:border-rose-500/40 hover:bg-rose-500/15 hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        >
          <div className="flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 font-medium">
            <ArrowDownRight className="h-3 w-3" /> Saídas mês
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(calc.monthOut, hide)}</div>
          <div className="text-[10px] mt-0.5 text-rose-700/70 dark:text-rose-400/70">Toque para ver detalhes</div>
        </button>
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Receitas pendentes</span>
            {calc.futureIn > 0
              ? <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              : <TrendingDown className="h-3 w-3 text-muted-foreground" />}
          </div>
          <div className="text-lg font-semibold mt-1">{fmt(calc.futureIn, hide)}</div>
          <div className="text-[10px] mt-0.5 text-amber-700/80 dark:text-amber-400/80">
            {calc.pendingInCount} {calc.pendingInCount === 1 ? "recebimento" : "recebimentos"} pendente{calc.pendingInCount === 1 ? "" : "s"}
          </div>
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

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajustar saldo em conta</DialogTitle>
            <DialogDescription>
              Informe o novo saldo desejado. Será criado um lançamento de ajuste para chegar ao valor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="text-xs text-muted-foreground">Saldo atual</div>
              <div className="font-semibold">{fmt(calc.balance, false)}</div>
            </div>
            <div>
              <Label>Novo saldo</Label>
              <Input
                type="number"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0,00"
              />
              {target !== "" && !isNaN(Number(target)) && (
                <p className="text-xs text-muted-foreground mt-1">
                  Diferença: <span className={Number(target) - calc.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {Number(target) - calc.balance >= 0 ? "+" : ""}{fmt(Number(target) - calc.balance, false)}
                  </span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
            <Button
              disabled={saving || target === "" || isNaN(Number(target)) || Number(target) === calc.balance}
              onClick={async () => {
                if (!onAdjust) return;
                setSaving(true);
                await onAdjust(Number(target) - calc.balance);
                setSaving(false);
                setAdjustOpen(false);
              }}
            >
              {saving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
