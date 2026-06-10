import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Income, IncomeStatus } from "@/hooks/useIncomes";
import { Expense, Sale } from "@/types/loan";
import { ArrowUpRight, ArrowDownRight, CheckCircle2, Clock, AlertTriangle, Repeat, Check } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { isCreditCardExpense, listPaidInvoicesInRange, getCardInvoiceTotalsForMonth } from "@/lib/creditCardInvoiceTotals";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { isPiggyExpense } from "@/hooks/usePiggyBanks";

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: "incomes" | "expenses";
  monthKey: string;
  incomes: Income[];
  expenses: Expense[];
  sales?: Sale[];
  initialFilter?: string;
  onPayIncome?: (id: string) => Promise<void> | void;
  onPayExpense?: (id: string) => Promise<void> | void;
}

type Row = {
  id: string;
  date: string;
  title: string;
  subtitle?: string;
  amount: number;
  status: "received" | "pending" | "overdue" | "paid" | "due" | "recurring";
  payable?: { kind: "income" | "expense"; refId: string };
};

const STATUS_LABEL: Record<Row["status"], string> = {
  received: "PAGO",
  pending: "Pendente",
  overdue: "Atrasado",
  paid: "Pago",
  due: "A vencer",
  recurring: "Recorrente",
};

const STATUS_BADGE: Record<Row["status"], string> = {
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  due: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  recurring: "bg-primary/15 text-primary border-primary/30",
};

export function MonthTransactionsSheet({ open, onOpenChange, type, monthKey, incomes, expenses, sales, initialFilter, onPayIncome, onPayExpense }: Props) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(initialFilter ?? "all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount">("date_desc");

  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  useEffect(() => {
    if (open) setFilter(initialFilter === "pending" ? "all" : (initialFilter ?? "all"));
  }, [open, initialFilter]);

  // Faturas de cartão pagas dentro do mês selecionado — derivadas das despesas
  // pagas + openings (mesma lógica usada no extrato financeiro).
  const paidInvoices = useMemo(() => {
    if (type !== "expenses") return [];
    const [yy, mm] = monthKey.split("-").map(Number);
    if (!yy || !mm) return [];
    const lastDay = new Date(yy, mm, 0).getDate();
    const fromISO = `${monthKey}-01`;
    const toISO = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
    return listPaidInvoicesInRange(expenses, cards, openings, fromISO, toISO);
  }, [type, monthKey, expenses, cards, openings]);

  const pendingMode = initialFilter === "pending";

  // Faturas de cartão pendentes no mês — usado no modo "Despesas pendentes".
  const cardInvoicesPendingMonth = useMemo(() => {
    if (type !== "expenses" || !pendingMode) return [] as Array<{ card: any; cycleKey: string; total: number; dueDate: string }>;
    const [yy, mm] = monthKey.split("-").map(Number);
    return getCardInvoiceTotalsForMonth(expenses, cards, openings, monthKey)
      .filter((x) => !x.hasPaidOverride && !x.paid && x.total > 0)
      .map((x) => {
        const dueDay = Math.min(x.card.dueDay || 1, new Date(yy, mm, 0).getDate());
        const dueDate = `${monthKey}-${String(dueDay).padStart(2, "0")}`;
        return { card: x.card, cycleKey: monthKey, total: Math.max(0, x.total - x.paidTotal), dueDate };
      });
  }, [type, pendingMode, expenses, cards, openings, monthKey]);

  const rows = useMemo<Row[]>(() => {
    if (type === "incomes") {
      const out: Row[] = [];
      if (pendingMode) {
        for (const i of incomes) {
          if (i.source === "Ajuste manual") continue;
          if (!i.receivedDate.startsWith(monthKey)) continue;
          if (i.status !== "pending" && i.status !== "overdue") continue;
          out.push({
            id: i.id,
            date: i.receivedDate,
            title: i.description,
            subtitle: i.category || i.source || undefined,
            amount: i.amount,
            status: i.status === "overdue" ? "overdue" : "pending",
            payable: { kind: "income", refId: i.id },
          });
        }
        return out;
      }
      for (const i of incomes) {
        if (i.source === "Ajuste manual") continue;
        if (!i.receivedDate.startsWith(monthKey)) continue;
        // Apenas receitas efetivamente recebidas no mês.
        if (i.status !== "received") continue;
        out.push({
          id: i.id,
          date: i.receivedDate,
          title: i.description,
          subtitle: i.category || i.source || undefined,
          amount: i.amount,
          status: "received",
        });
      }
      // Vendas recebidas no mês — mesma lógica do card "Entradas mês".
      for (const sale of sales || []) {
        const history = sale.paymentHistory || [];
        const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
        const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
        const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const title = `Venda — ${sale.productName || "Produto"}`;
        const subtitle = sale.customerName || sale.category || "Venda";
        if (history.length > 0) {
          for (let pi = 0; pi < history.length; pi++) {
            const p = history[pi];
            if (!(p.date || "").startsWith(monthKey)) continue;
            out.push({
              id: `sale-${sale.id}-${pi}`,
              date: p.date,
              title,
              subtitle,
              amount: Number(p.amount) || 0,
              status: "received",
            });
          }
          if (historyTotal < legacyTotal && (sale.date || "").startsWith(monthKey)) {
            out.push({
              id: `sale-${sale.id}-legacy`,
              date: sale.date,
              title,
              subtitle,
              amount: legacyTotal - historyTotal,
              status: "received",
            });
          }
        } else if ((sale.date || "").startsWith(monthKey) && legacyTotal > 0) {
          out.push({
            id: `sale-${sale.id}-legacy`,
            date: sale.date,
            title,
            subtitle,
            amount: legacyTotal,
            status: "received",
          });
        }
      }
      return out;
    }
    if (pendingMode) {
      // Despesas pessoais pendentes que ocorrem no mês (mesma lógica do card).
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
      const out: Row[] = [];
      for (const e of expenses) {
        if ((e.scope ?? "business") !== "personal") continue;
        if (e.paid) continue;
        if (isPiggyExpense(e.notes)) continue;
        if (isCreditCardExpense(e)) continue;
        if (!occursInMonth(e)) continue;
        const amt = e.type === "recorrente" && e.installments && e.installments > 1
          ? e.amount / e.installments
          : e.amount;
        const today = new Date().toISOString().slice(0, 10);
        const isOverdue = (e.dueDate || "") < today;
        out.push({
          id: e.id,
          date: e.dueDate || "",
          title: e.description,
          subtitle: e.category || undefined,
          amount: amt,
          status: isOverdue ? "overdue" : "due",
        });
      }
      for (const inv of cardInvoicesPendingMonth) {
        const today = new Date().toISOString().slice(0, 10);
        const isOverdue = (inv.dueDate || "") < today;
        out.push({
          id: `card-invoice-pending-${inv.card.id}-${inv.cycleKey}`,
          date: inv.dueDate,
          title: `Fatura ${inv.card.nickname || inv.card.bank || "Cartão"}`,
          subtitle: `Ciclo ${inv.cycleKey}`,
          amount: inv.total,
          status: isOverdue ? "overdue" : "due",
        });
      }
      return out;
    }
    const exp: Row[] = expenses
      .filter((e) => {
        if ((e.scope ?? "business") !== "personal") return false;
        if (!e.paid) return false;
        // Itens individuais vinculados ao cartão entram pelo pagamento consolidado
        // da fatura (account_ledger) — não contar de novo aqui para evitar duplicidade.
        if (isCreditCardExpense(e)) return false;
        const d = e.paidDate || e.dueDate || "";
        return d.startsWith(monthKey);
      })
      .map((e) => {
        const isRec = e.type === "recorrente";
        return {
          id: e.id,
          date: e.paidDate || e.dueDate || "",
          title: e.description,
          subtitle: e.category || undefined,
          amount: isRec && e.installments && e.installments > 1 ? e.amount / e.installments : e.amount,
          status: "paid" as Row["status"],
        };
      });
    // Faturas de cartão quitadas dentro do mês selecionado — entram como uma
    // única saída consolidada (substituem os lançamentos individuais filtrados acima).
    for (const inv of paidInvoices) {
      exp.push({
        id: `card-invoice-${inv.card.id}-${inv.cycleKey}`,
        date: inv.paidDate,
        title: `Fatura ${inv.card.nickname || inv.card.bank || "Cartão"}`,
        subtitle: `Ciclo ${inv.cycleKey}`,
        amount: inv.paidTotal,
        status: "paid",
      });
    }
    return exp;
  }, [type, incomes, expenses, sales, monthKey, paidInvoices, pendingMode, cardInvoicesPendingMonth]);

  const filtered = useMemo(() => {
    let arr = rows;
    if (filter !== "all") arr = arr.filter((r) => r.status === filter);
    arr = [...arr].sort((a, b) => {
      if (sortBy === "amount") return b.amount - a.amount;
      if (sortBy === "date_asc") return a.date.localeCompare(b.date);
      return b.date.localeCompare(a.date);
    });
    return arr;
  }, [rows, filter, sortBy]);

  const total = filtered.reduce((s, r) => s + r.amount, 0);
  const isIncome = type === "incomes";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] sm:h-[80vh] overflow-y-auto rounded-t-2xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            {isIncome
              ? <ArrowUpRight className="h-5 w-5 text-emerald-500" />
              : <ArrowDownRight className="h-5 w-5 text-rose-500" />}
            {pendingMode
              ? (isIncome ? "Receitas pendentes do mês" : "Despesas pendentes do mês")
              : (isIncome ? "Entradas do mês" : "Saídas do mês")}
          </SheetTitle>
          <SheetDescription>
            {filtered.length} lançamento{filtered.length === 1 ? "" : "s"} · Total{" "}
            <span className={isIncome ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-rose-600 dark:text-rose-400 font-semibold"}>
              {fmt(total)}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {pendingMode ? (
                <>
                  <SelectItem value={isIncome ? "pending" : "due"}>A vencer</SelectItem>
                  <SelectItem value="overdue">Atrasadas</SelectItem>
                </>
              ) : isIncome ? (
                <SelectItem value="received">Recebidas</SelectItem>
              ) : (
                <>
                  <SelectItem value="paid">Pagas</SelectItem>
                  <SelectItem value="due">A vencer</SelectItem>
                  <SelectItem value="recurring">Recorrentes</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Data (mais recente)</SelectItem>
              <SelectItem value="date_asc">Data (mais antiga)</SelectItem>
              <SelectItem value="amount">Maior valor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 space-y-2 pb-6 animate-fade-in">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhum lançamento neste filtro
            </div>
          ) : filtered.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-border/40 bg-card/60 p-3 hover:border-border/80 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{r.title}</span>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[r.status]}`}>
                      {(r.status === "received" || r.status === "paid") && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {(r.status === "pending" || r.status === "due") && <Clock className="h-3 w-3 mr-1" />}
                      {r.status === "overdue" && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {r.status === "recurring" && <Repeat className="h-3 w-3 mr-1" />}
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                    {r.date && <span>{format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>}
                    {r.subtitle && <span>{r.subtitle}</span>}
                  </div>
                </div>
                <div className={`text-base font-bold ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {isIncome ? "+" : "-"}{fmt(r.amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
