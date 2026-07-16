import { useEffect, useMemo, useState } from "react";
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
import { isCreditCardExpense, listPaidInvoicesInRange } from "@/lib/creditCardInvoiceTotals";
import { isVehicleExpenseForVehicles } from "@/components/VehicleExpenseForm";
import { useProducts } from "@/hooks/useProducts";
import { Sale } from "@/types/loan";
import { supabase } from "@/integrations/supabase/userClient";
import { useDataOwner } from "@/hooks/useDataOwner";
import { calculateIncomeProjectedSummary } from "@/lib/incomeProjectedSummary";
import { useFinanceComponentDebug, financeFetchStart, financeFetchSuccess, financeSetState, financeInvalidate } from "@/lib/financeDebug";

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
  onOpenPendingExpenses?: () => void;
  onOpenStatement?: () => void;
  statementLeftSlot?: React.ReactNode;
  monthKey?: string;
};

export function IncomeBalanceCard({ incomes, expenses, onAdjust, readOnly, onOpenIncomes, onOpenExpenses, onOpenPendingIncomes, onOpenPendingExpenses, onOpenStatement, statementLeftSlot, monthKey: monthKeyProp }: Props) {
  useFinanceComponentDebug("IncomeBalanceCard");
  const { hidden: hide } = useHideValues();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const { sales: rawSales } = useProducts(true);
  // Aluguéis de veículo são isolados na aba "Veículos" e não impactam este saldo.
  const sales = useMemo(
    () => rawSales.filter((s) => s.businessType !== "aluguel_veiculo"),
    [rawSales],
  );
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [projInfoOpen, setProjInfoOpen] = useState(false);
  const ownerId = useDataOwner();
  // Pagamentos de fatura de cartão registrados no extrato (account_ledger).
  // Usados para debitar o "Saldo em Conta" exatamente pelo valor pago da fatura,
  // independente do escopo dos itens (pessoais/empresa) ou do saldo inicial.
  const [cardInvoicePaidByMonth, setCardInvoicePaidByMonth] = useState<Record<string, number>>({});
  const cardInvoicePaidTotal = useMemo(
    () => Object.values(cardInvoicePaidByMonth).reduce((s, v) => s + v, 0),
    [cardInvoicePaidByMonth],
  );
  // Aportes (positivos) e resgates (negativos) dos cofrinhos.
  // Aporte sai do "Saldo em Conta"; resgate retorna ao "Saldo em Conta".
  const [piggyNetByMonth, setPiggyNetByMonth] = useState<Record<string, number>>({});
  const piggyNetTotal = useMemo(
    () => Object.values(piggyNetByMonth).reduce((s, v) => s + v, 0),
    [piggyNetByMonth],
  );

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    const load = async () => {
      financeFetchStart("IncomeBalanceCard", "account_ledger/cofrinhos/cofrinho_aportes", { ownerId: "present" });
      // Nova arquitetura de cofrinhos: cruza `cofrinhos` (do owner) com
      // `cofrinho_aportes` (depósitos) usando `data_aporte` como data financeira.
      // Os resgates já estão refletidos no saldo via `cofrinhos.saldo_principal`,
      // então ajustamos o total para casar com o saldo principal corrente.
      const [{ data: ledger }, { data: banks }] = await Promise.all([
        supabase
          .from("account_ledger")
          .select("amount, occurred_on, metadata")
          .eq("user_id", ownerId)
          .eq("direction", "out")
          .eq("metadata->>kind", "credit_card_invoice_payment"),
        supabase
          .from("cofrinhos" as any)
          .select("id, saldo_principal, ativo")
          .eq("usuario_id", ownerId),
      ]);
      const activeBanks = ((banks as any[]) ?? []).filter((b) => b.ativo !== false);
      const bankIds = activeBanks.map((b) => b.id);
      const principalTotal = activeBanks.reduce(
        (s, b) => s + (Number(b.saldo_principal) || 0),
        0,
      );
      let aportes: any[] = [];
      if (bankIds.length > 0) {
        const { data: ap } = await supabase
          .from("cofrinho_aportes" as any)
          .select("valor_original, data_aporte, created_at")
          .in("cofrinho_id", bankIds);
        aportes = (ap as any[]) ?? [];
      }
      if (cancelled) return;
      const cardByMonth: Record<string, number> = {};
      for (const r of (ledger as any[]) ?? []) {
        const mk = ((r.occurred_on as string) || "").slice(0, 7);
        if (!mk) continue;
        cardByMonth[mk] = (cardByMonth[mk] ?? 0) + (Number(r.amount) || 0);
      }
      financeSetState("IncomeBalanceCard", "cardInvoicePaidByMonth", { months: Object.keys(cardByMonth).length });
      setCardInvoicePaidByMonth(cardByMonth);
      const piggyByMonth: Record<string, number> = {};
      let aportesTotal = 0;
      for (const r of aportes) {
        const raw = (r.data_aporte as string) || (r.created_at as string) || "";
        const mk = raw.slice(0, 7);
        const v = Math.abs(Number(r.valor_original) || 0);
        aportesTotal += v;
        if (!mk) continue;
        piggyByMonth[mk] = (piggyByMonth[mk] ?? 0) + v;
      }
      // Reconcilia com o saldo_principal atual: a diferença (aportes − saldo)
      // representa resgates já realizados; é distribuída no mês corrente como
      // entrada negativa, mantendo o saldo total alinhado.
      const resgatesTotal = aportesTotal - principalTotal;
      if (Math.abs(resgatesTotal) > 0.005) {
        const nowMk = new Date().toISOString().slice(0, 7);
        piggyByMonth[nowMk] = (piggyByMonth[nowMk] ?? 0) - resgatesTotal;
      }
      financeSetState("IncomeBalanceCard", "piggyNetByMonth", { months: Object.keys(piggyByMonth).length });
      setPiggyNetByMonth(piggyByMonth);
      financeFetchSuccess("IncomeBalanceCard", "account_ledger/cofrinhos/cofrinho_aportes", {
        ledgerRows: ((ledger as any[]) ?? []).length,
        bankRows: ((banks as any[]) ?? []).length,
        aporteRows: aportes.length,
      });

    };

    load();
    const handler = (event: Event) => {
      financeInvalidate("IncomeBalanceCard", "account_ledger/cofrinhos/cofrinho_aportes", { event: event.type });
      load();
    };
    window.addEventListener("ledger:changed", handler);
    window.addEventListener("balance:changed", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("ledger:changed", handler);
      window.removeEventListener("balance:changed", handler);
    };
  }, [ownerId]);

  const now = new Date();
  const monthKey = monthKeyProp ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mkY, mkM] = monthKey.split("-").map(Number);
  const prevDate = new Date(mkY, mkM - 2, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const calc = useMemo(() => {
    // Saldo em Conta (aba Receitas) = receitas recebidas + vendas recebidas − despesas pessoais pagas
    // (exceto itens de cartão, que são contabilizados pelo pagamento real da fatura no extrato).
    const totalIncomeReceived = incomes
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + i.amount, 0);
    const totalSalesReceived = sales.reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expenses
      .filter((e) => e.paid && (e.scope ?? "business") === "personal" && !isCreditCardExpense(e) && !isVehicleExpenseForVehicles(e))
      .reduce((s, e) => s + e.amount, 0);
    const balance = totalIncomeReceived + totalSalesReceived - totalExpensePaid - cardInvoicePaidTotal - piggyNetTotal;

    // Movimentação do mês vigente — alinhada ao total exibido em MonthTransactionsSheet
    // (Entradas/Saídas do mês), considerando todas as ocorrências do mês (pagas + pendentes).
    // Apenas receitas efetivamente recebidas no mês entram em "Entradas mês".
    const monthInIncomes = incomes.reduce((s, i) => {
      if (i.source === "Ajuste manual") return s;
      if (i.status !== "received") return s;
      if (!i.receivedDate.startsWith(monthKey)) return s;
      return s + i.amount;
    }, 0);
    const monthInSales = sales.reduce((s, sale) => s + saleReceivedInMonth(sale, monthKey), 0);
    const monthIn = monthInIncomes + monthInSales;
    // Will be adjusted with piggy withdrawals below.
    // Saídas do mês: despesas pessoais pagas (exceto itens de cartão, que entram
    // pelo total consolidado da fatura quitada no mês) + faturas de cartão quitadas
    // dentro do mês. Mesma base usada no detalhamento "Saídas do mês" (sheet).
    const monthOutExpenses = expenses.reduce((s, e) => {
      if ((e.scope ?? "business") !== "personal") return s;
      if (!e.paid) return s;
      if (isCreditCardExpense(e)) return s;
      const d = e.paidDate || e.dueDate || "";
      if (!d.startsWith(monthKey)) return s;
      const amt = e.type === "recorrente" && e.installments && e.installments > 1
        ? e.amount / e.installments
        : e.amount;
      return s + amt;
    }, 0);
    const [mY, mM] = monthKey.split("-").map(Number);
    const lastDay = new Date(mY, mM, 0).getDate();
    const monthFromISO = `${monthKey}-01`;
    const monthToISO = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
    const monthInvoicesPaid = listPaidInvoicesInRange(
      expenses,
      cards,
      openings,
      monthFromISO,
      monthToISO,
    ).reduce((s, inv) => s + inv.paidTotal, 0);
    const piggyMonth = piggyNetByMonth[monthKey] ?? 0;
    const monthOut = monthOutExpenses + monthInvoicesPaid;
    const piggyMonthIn = Math.max(0, -piggyMonth);

    const projectedSummary = calculateIncomeProjectedSummary({
      baseBalance: balance,
      incomes,
      expenses,
      cards,
      openings,
      monthKey,
    });

    const prevIn = incomes
      .filter((i) => i.status === "received" && i.receivedDate.startsWith(prevKey))
      .reduce((s, i) => s + i.amount, 0);

    return { balance, monthIn: monthIn + piggyMonthIn, monthOut, prevIn, ...projectedSummary };
  }, [incomes, expenses, monthKey, prevKey, cards, openings, sales, cardInvoicePaidByMonth, cardInvoicePaidTotal, piggyNetByMonth, piggyNetTotal]);

  const diff = calc.monthIn - calc.prevIn;
  const pct = calc.prevIn > 0 ? (diff / calc.prevIn) * 100 : 0;
  const trend: "up" | "down" | "neutral" = diff > 0 ? "up" : diff < 0 ? "down" : "neutral";
  const trendColor = trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground";

  const balanceColor = calc.balance > 0 ? "text-emerald-600 dark:text-emerald-400"
    : calc.balance < 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground";

  return (
    <Card no3d className="p-5 sm:p-6 bg-gradient-to-br from-primary/5 via-card to-card border border-border/50 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.08)] animate-fade-in">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="truncate">Saldo em Conta</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {statementLeftSlot}
            {onOpenStatement && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onOpenStatement}
                aria-label="Extrato"
                title="Extrato"
              >
                <Receipt className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="-mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`text-3xl sm:text-4xl font-bold tracking-tight ${balanceColor} truncate`}>
              {fmt(calc.balance, hide)}
            </div>
            {!readOnly && onAdjust && (
              <button
                type="button"
                className="p-1 hover:bg-accent rounded-md transition-colors shrink-0"
                onClick={() => { setTarget(calc.balance.toFixed(2)); setAdjustOpen(true); }}
                aria-label="Ajustar saldo"
                title="Ajustar saldo"
              >
                <Settings2 className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
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
        </div>
      </div>


      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 mt-5 items-stretch">
        <button
          type="button"
          onClick={onOpenIncomes}
          className="h-full rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-success/40"
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
          className="h-full rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-destructive/40"
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
          className="h-full rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-warning/40"
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
        <button
          type="button"
          onClick={onOpenPendingExpenses}
          className="h-full rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm animate-fade-in flex flex-col items-center text-center transition-all hover:scale-[1.02] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-destructive/40"
          style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}
        >
          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
            <ArrowDownRight className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Despesas pendentes</p>
          <p className="text-sm sm:text-xl font-bold text-destructive mt-0.5">{fmt(calc.futureOut, hide)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Toque para detalhes</p>
        </button>
        <div
          className="relative h-full col-span-2 lg:col-span-1 rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm animate-fade-in flex flex-col items-center text-center"
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
