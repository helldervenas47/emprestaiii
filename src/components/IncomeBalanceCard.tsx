import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Income } from "@/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, Settings2, Receipt, Info } from "lucide-react";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { getCardInvoiceTotalsForMonth, isCreditCardExpense } from "@/lib/creditCardInvoiceTotals";
import { isPiggyExpense, usePiggyBanks } from "@/hooks/usePiggyBanks";
import { useProducts } from "@/hooks/useProducts";
import { Sale } from "@/types/loan";
import { useBalanceAdjustments } from "@/hooks/useBalanceAdjustments";
import { getMonthEndProjectedBalance } from "@/lib/projectedBalance";

/** Total efetivamente recebido de uma venda (não os lançamentos previstos). */
function saleReceivedTotal(sale: Sale): number {
  const historyTotal = (sale.paymentHistory || []).reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  // Usa o maior dos dois para cobrir vendas antigas cujas parcelas pagas
  // não foram registradas no paymentHistory.
  return Math.max(historyTotal, legacyTotal);
}

/** Total recebido de uma venda no mês (YYYY-MM). */
function saleReceivedInMonth(sale: Sale, monthKey: string): number {
  const history = sale.paymentHistory || [];
  if (history.length > 0) {
    const historyMonthSum = history
      .filter((p) => (p.date || "").startsWith(monthKey))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    // Se o histórico cobre o total recebido, usa o filtro por mês.
    const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
    const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
    if (historyTotal >= legacyTotal) return historyMonthSum;
    // Caso histórico esteja incompleto, atribui a diferença ao mês da venda.
    const missing = legacyTotal - historyTotal;
    return historyMonthSum + ((sale.date || "").startsWith(monthKey) ? missing : 0);
  }
  // Sem histórico: considera o total recebido no mês da venda.
  return (sale.date || "").startsWith(monthKey) ? saleReceivedTotal(sale) : 0;
}

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
  onOpenPendingIncomes?: () => void;
  onOpenStatement?: () => void;
  statementLeftSlot?: React.ReactNode;
  monthKey?: string;
};

export function IncomeBalanceCard({ incomes, expenses, onAdjust, readOnly, onOpenIncomes, onOpenExpenses, onOpenPendingIncomes, onOpenStatement, statementLeftSlot, monthKey: monthKeyProp }: Props) {
  const { hidden: hide } = useHideValues();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const { sales } = useProducts(true);
  const { deposits: piggyDeposits } = usePiggyBanks();
  const { adjustments } = useBalanceAdjustments();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [projInfoOpen, setProjInfoOpen] = useState(false);

  const now = new Date();
  const monthKey = monthKeyProp ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mkY, mkM] = monthKey.split("-").map(Number);
  const prevDate = new Date(mkY, mkM - 2, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const calc = useMemo(() => {
    // Saldo em Conta (aba Receitas) = receitas recebidas + vendas recebidas − despesas pessoais pagas.
    // Inclui vendas para manter consistência com o Saldo em Conta da Dashboard.
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter((e) => e.paid && (e.scope ?? "business") === "personal")
      .reduce((s, e) => s + e.amount, 0);
    const balance = totalIncomeReceived + totalSalesReceived - totalExpensePaid;

    // Movimentação do mês vigente — alinhada ao total exibido em MonthTransactionsSheet
    // (Entradas/Saídas do mês), considerando todas as ocorrências do mês (pagas + pendentes).
    const monthIn = incomes.reduce((s, i) => {
      if (i.source === "Ajuste manual") return s;
      if (!i.receivedDate.startsWith(monthKey)) return s;
      if (i.status === "received") return s + i.amount;
      if (
        i.recurrence === "once" ||
        i.recurrence === "weekly" ||
        i.recurrence === "biweekly" ||
        i.recurrence === "monthly" ||
        i.recurrence === "yearly"
      ) return s + i.amount;
      return s;
    }, 0);
    // Saídas do mês: apenas despesas pessoais pagas, considerando a data de pagamento.
    const monthOut = expenses.reduce((s, e) => {
      if ((e.scope ?? "business") !== "personal") return s;
      if (!e.paid) return s;
      const d = e.paidDate || e.dueDate || "";
      if (!d.startsWith(monthKey)) return s;
      const amt = e.type === "recorrente" && e.installments && e.installments > 1
        ? e.amount / e.installments
        : e.amount;
      return s + amt;
    }, 0);

    // Futuras do mês selecionado (pendentes/agendadas, não canceladas).
    // Receitas recorrentes são materializadas como lançamentos mensais separados;
    // por isso cada linha deve contar apenas a própria data para evitar duplicidade visual.
    const pendingOccurrencesInMonth = (i: Income): number => {
      if (i.status !== "pending") return 0;
      if (
        i.recurrence === "once" ||
        i.recurrence === "weekly" ||
        i.recurrence === "biweekly" ||
        i.recurrence === "monthly" ||
        i.recurrence === "yearly"
      ) {
        return i.receivedDate.startsWith(monthKey) ? 1 : 0;
      }
      return 0;
    };
    const futureIn = incomes.reduce((s, i) => s + pendingOccurrencesInMonth(i) * i.amount, 0);
    // Para recorrentes parceladas: usar parcela mensal (amount / installments)
    // Para fixas / recorrentes sem parcela: usar amount cheio
    const monthlyExpenseAmount = (e: Expense) => {
      if (e.type === "recorrente" && e.installments && e.installments > 1) {
        return e.amount / e.installments;
      }
      return e.amount;
    };
    // "A pagar" das Despesas Pessoais (mesma lógica do card "A pagar"):
    //  - despesas pessoais (scope=personal), excluindo cofrinho e despesas individuais de cartão
    //  - que ocorrem no mês vigente (dueDate no mês ou recorrente cujo ciclo cobre o mês)
    //  - ainda não pagas, e descartando recorrentes totalmente pagas
    //  + total pendente das faturas de cartão com vencimento no mês vigente
    const occursInMonth = (e: Expense) => {
      const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
      if (!isRec) return (e.dueDate || "").startsWith(monthKey);
      const [curY2, curM2] = monthKey.split("-").map(Number);
      const sel = curY2 * 12 + curM2;
      const [dY, dM] = (e.dueDate || "0-0").split("-").map(Number);
      const start = dY * 12 + dM;
      const end = start + (e.installments! - 1);
      return sel >= start && sel <= end;
    };
    const isRecFullyPaid = (e: Expense) =>
      e.type === "recorrente" && !!e.installments && e.installments > 1 && e.paid;
    const personalSpendingMonth = expenses.filter((e) => {
      if ((e.scope ?? "business") !== "personal") return false;
      if (isPiggyExpense(e.notes)) return false;
      if (isCreditCardExpense(e)) return false;
      if (isRecFullyPaid(e)) return false;
      const inMonth = (e.paid && (e.paidDate || "").startsWith(monthKey)) || occursInMonth(e);
      return inMonth;
    });
    const personalPendingExpenses = personalSpendingMonth
      .filter((e) => !e.paid)
      .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
    const cardInvoiceTotalsMonth = getCardInvoiceTotalsForMonth(expenses, cards, openings, monthKey);
    const cardInvoicePendingMonth = cardInvoiceTotalsMonth.reduce((s, x) => {
      if (x.hasPaidOverride) return s;
      if (x.paid) return s;
      return s + x.total;
    }, 0);
    const futureOut = personalPendingExpenses + cardInvoicePendingMonth;
    const pendingInCount = incomes.reduce((s, i) => s + pendingOccurrencesInMonth(i), 0);

    // Saldo previsto do card: usa exatamente os mesmos totais exibidos no popup.
    const projected = balance + futureIn - futureOut;
    const projectedDiff = projected - balance;

    const prevIn = incomes
      .filter((i) => i.status === "received" && i.receivedDate.startsWith(prevKey))
      .reduce((s, i) => s + i.amount, 0);

    return { balance, monthIn, monthOut, futureIn, futureOut, projected, projectedDiff, prevIn, pendingInCount };
  }, [incomes, expenses, monthKey, prevKey, cards, openings, sales]);

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
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4" />
              <span>Saldo em Conta</span>
            </div>
            {(onOpenStatement || statementLeftSlot) && (
              <div className="flex items-center gap-1.5">
                {statementLeftSlot}
                {onOpenStatement && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 whitespace-nowrap"
                    onClick={onOpenStatement}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Extrato
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className={`mt-2 text-3xl sm:text-4xl font-bold tracking-tight ${balanceColor}`}>
            {fmt(calc.balance, hide)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Receitas recebidas + vendas recebidas − despesas pessoais pagas
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-5">
        <button
          type="button"
          onClick={onOpenIncomes}
          className="rounded-2xl p-3 sm:p-4 bg-foreground/[0.04] dark:bg-white/[0.05] border border-border/40 shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.25)] animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-success/40"
          style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}
        >
          <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center mb-2">
            <ArrowUpRight className="h-4 w-4 text-success" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Entradas mês</p>
          <p className="text-sm sm:text-xl font-bold text-success mt-0.5">{fmt(calc.monthIn, hide)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Toque para detalhes</p>
        </button>
        <button
          type="button"
          onClick={onOpenExpenses}
          className="rounded-2xl p-3 sm:p-4 bg-foreground/[0.04] dark:bg-white/[0.05] border border-border/40 shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.25)] animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-destructive/40"
          style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}
        >
          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
            <ArrowDownRight className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Saídas mês</p>
          <p className="text-sm sm:text-xl font-bold text-destructive mt-0.5">{fmt(calc.monthOut, hide)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Toque para detalhes</p>
        </button>
        <button
          type="button"
          onClick={onOpenPendingIncomes}
          className="rounded-2xl p-3 sm:p-4 bg-foreground/[0.04] dark:bg-white/[0.05] border border-border/40 shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.25)] animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-warning/40"
          style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}
        >
          <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center mb-2">
            {calc.futureIn > 0
              ? <TrendingUp className="h-4 w-4 text-warning" />
              : <TrendingDown className="h-4 w-4 text-warning" />}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Receitas pendentes</p>
          <p className="text-sm sm:text-xl font-bold text-warning mt-0.5">{fmt(calc.futureIn, hide)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {calc.pendingInCount} pendente{calc.pendingInCount === 1 ? "" : "s"}
          </p>
        </button>
        <div
          className="relative rounded-2xl p-3 sm:p-4 bg-foreground/[0.04] dark:bg-white/[0.05] border border-border/40 shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.25)] animate-fade-in flex flex-col items-center text-center"
          style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}
        >
          <button
            type="button"
            aria-label="Ver dados usados no cálculo do saldo previsto"
            title="Ver cálculo do saldo previsto"
            onClick={() => setProjInfoOpen(true)}
            className="absolute top-1.5 right-1.5 h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${calc.projected >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
            {calc.projectedDiff >= 0
              ? <TrendingUp className={`h-4 w-4 ${calc.projected >= 0 ? "text-primary" : "text-destructive"}`} />
              : <TrendingDown className={`h-4 w-4 ${calc.projected >= 0 ? "text-primary" : "text-destructive"}`} />}
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Saldo previsto</p>
          <p className={`text-sm sm:text-xl font-bold mt-0.5 ${calc.projected >= 0 ? "text-primary" : "text-destructive"}`}>{fmt(calc.projected, hide)}</p>
          <p className={`text-[10px] mt-1 ${calc.projectedDiff >= 0 ? "text-success" : "text-destructive"}`}>
            {calc.projectedDiff >= 0 ? "+" : ""}{fmt(calc.projectedDiff, hide)} vs atual
          </p>
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

      <Dialog open={projInfoOpen} onOpenChange={setProjInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Como o Saldo previsto é calculado
            </DialogTitle>
            <DialogDescription>
              Projeção do saldo no último dia do mês selecionado ({monthKey}), encadeando dia a dia receitas e despesas previstas a partir do saldo atual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              Saldo previsto = Saldo em conta<br />
              &nbsp;&nbsp;+ Receitas pendentes do mês<br />
              &nbsp;&nbsp;− Despesas pessoais a pagar do mês<br />
              &nbsp;&nbsp;− Faturas de cartão pendentes do mês
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">Saldo em conta</p>
                <p className="font-semibold">{fmt(calc.balance, false)}</p>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">Receitas pendentes</p>
                <p className="font-semibold text-warning">+ {fmt(calc.futureIn, false)}</p>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">A pagar no mês</p>
                <p className="font-semibold text-destructive">− {fmt(calc.futureOut, false)}</p>
              </div>
              <div className="rounded-md border border-border/40 p-2">
                <p className="text-[10px] text-muted-foreground uppercase">Variação vs atual</p>
                <p className={`font-semibold ${calc.projectedDiff >= 0 ? "text-success" : "text-destructive"}`}>
                  {calc.projectedDiff >= 0 ? "+" : ""}{fmt(calc.projectedDiff, false)}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Saldo previsto (fim do mês)</p>
              <p className="text-lg font-bold text-primary">{fmt(calc.projected, false)}</p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Observação: a projeção dia a dia considera receitas recebidas, vendas, despesas pessoais pagas/a pagar, faturas de cartão e aportes ao cofrinho. Despesas da empresa não afetam este saldo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjInfoOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
