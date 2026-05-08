import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Income, IncomeStatus } from "@/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { ArrowUpRight, ArrowDownRight, CheckCircle2, Clock, AlertTriangle, Repeat } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  initialFilter?: string;
}

type Row = {
  id: string;
  date: string;
  title: string;
  subtitle?: string;
  amount: number;
  status: "received" | "pending" | "overdue" | "paid" | "due" | "recurring";
};

const STATUS_LABEL: Record<Row["status"], string> = {
  received: "Recebido",
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

export function MonthTransactionsSheet({ open, onOpenChange, type, monthKey, incomes, expenses, initialFilter }: Props) {
  const [filter, setFilter] = useState<string>(initialFilter ?? "all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "amount">("date_desc");

  useEffect(() => {
    if (open) setFilter(initialFilter ?? "all");
  }, [open, initialFilter]);

  const rows = useMemo<Row[]>(() => {
    if (type === "incomes") {
      const out: Row[] = [];
      for (const i of incomes) {
        if (i.source === "Ajuste manual") continue;
        // Recebidos: somente se a receivedDate está no mês
        if (i.status === "received") {
          if (i.receivedDate.startsWith(monthKey)) {
            out.push({
              id: i.id,
              date: i.receivedDate,
              title: i.description,
              subtitle: i.category || i.source || undefined,
              amount: i.amount,
              status: "received",
            });
          }
          continue;
        }
        // Pendentes/atrasadas: receitas recorrentes já foram materializadas em linhas separadas.
        // Usar apenas a própria data evita mostrar a receita antiga novamente nos meses futuros.
        const base = new Date(i.receivedDate + "T00:00:00");
        const pushOcc = (d: Date, idx: number) => {
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          out.push({
            id: `${i.id}-${idx}`,
            date: iso,
            title: i.description,
            subtitle: i.category || i.source || undefined,
            amount: i.amount,
            status: i.status as Row["status"],
          });
        };
        if (
          i.recurrence === "once" ||
          i.recurrence === "weekly" ||
          i.recurrence === "biweekly" ||
          i.recurrence === "monthly" ||
          i.recurrence === "yearly"
        ) {
          if (i.receivedDate.startsWith(monthKey)) pushOcc(base, 0);
        }
      }
      return out;
    }
    return expenses
      .filter((e) => {
        const d = e.dueDate || e.paidDate || "";
        return d.startsWith(monthKey);
      })
      .map((e) => {
        const isRec = e.type === "recorrente";
        const status: Row["status"] = e.paid
          ? "paid"
          : isRec
          ? "recurring"
          : "due";
        return {
          id: e.id,
          date: e.dueDate || e.paidDate || "",
          title: e.description,
          subtitle: e.category || undefined,
          amount: isRec && e.installments && e.installments > 1 ? e.amount / e.installments : e.amount,
          status,
        };
      });
  }, [type, incomes, expenses, monthKey]);

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
            {isIncome ? "Entradas do mês" : "Saídas do mês"}
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
              {isIncome ? (
                <>
                  <SelectItem value="received">Recebidas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="overdue">Atrasadas</SelectItem>
                </>
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
