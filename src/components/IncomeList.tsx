import { useEffect, useMemo, useState } from "react";
import { useIncomes, Income, IncomeStatus } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useClients } from "@/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { todayInAppTz } from "@/lib/timezone";
import { IncomeBalanceCard } from "./IncomeBalanceCard";
import { IncomeDashboard } from "./IncomeDashboard";
import { IncomePendingCalendar } from "./IncomePendingCalendar";
import { IncomeForm, INCOME_CATEGORIES } from "./IncomeForm";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { MonthTransactionsSheet } from "./MonthTransactionsSheet";
import { Plus, Search, Copy, Pencil, Trash2, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<IncomeStatus, string> = {
  received: "Recebido",
  pending: "Pendente",
  overdue: "Atrasado",
};

const STATUS_BADGE: Record<IncomeStatus, string> = {
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  overdue: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

interface Props {
  readOnly?: boolean;
}

export function IncomeList({ readOnly }: Props) {
  const { incomes, addIncome, updateIncome, deleteIncome, duplicateIncome, markReceived } = useIncomes();
  const { expenses } = useExpenses();
  const { clients } = useClients();
  const { activeMethods } = usePaymentMethods();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sheetType, setSheetType] = useState<"incomes" | "expenses" | null>(null);
  const [sheetInitialFilter, setSheetInitialFilter] = useState<string | undefined>(undefined);
  const [payTarget, setPayTarget] = useState<Income | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [paySaving, setPaySaving] = useState(false);

  const nowD = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`,
  );
  const monthKey = selectedMonth;
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const prevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  useEffect(() => {
    if (readOnly) return;
    const handler = () => { setEditing(null); setFormOpen(true); };
    window.addEventListener("open-income-form", handler as EventListener);
    return () => window.removeEventListener("open-income-form", handler as EventListener);
  }, [readOnly]);

  const filtered = useMemo(() => {
    let arr = incomes.filter((i) => {
      if (i.source === "Ajuste manual") return false;
      if (!i.receivedDate.startsWith(monthKey)) return false;
      
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (categoryFilter !== "all" && (i.category || "Outros") !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const cName = clients.find((c) => c.id === i.clientId)?.name || "";
        const haystack = `${i.description} ${i.category ?? ""} ${i.source ?? ""} ${cName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      if (sortBy === "amount") return b.amount - a.amount;
      return b.receivedDate.localeCompare(a.receivedDate);
    });
    return arr;
  }, [incomes, search, statusFilter, categoryFilter, sortBy, clients, monthKey]);

  const clientName = (i: Income) =>
    i.clientId ? clients.find((c) => c.id === i.clientId)?.name || "—" : (i.source || "—");

  const methodName = (id: string | null) =>
    id ? activeMethods.find((m) => m.id === id)?.name || "—" : "—";

  return (
    <div className="space-y-4 overflow-x-hidden max-w-full">
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = new Date();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <IncomeBalanceCard
        incomes={incomes}
        expenses={expenses}
        readOnly={readOnly}
        monthKey={monthKey}
        onOpenIncomes={() => { setSheetInitialFilter(undefined); setSheetType("incomes"); }}
        onOpenExpenses={() => { setSheetInitialFilter(undefined); setSheetType("expenses"); }}
        onOpenPendingIncomes={() => { setSheetInitialFilter("pending"); setSheetType("incomes"); }}
        onAdjust={async (delta) => {
          if (!delta) return;
          const today = new Date().toISOString().slice(0, 10);
          await addIncome({
            description: delta >= 0 ? "Ajuste de saldo (entrada)" : "Ajuste de saldo (saída)",
            amount: Number(delta.toFixed(2)),
            category: "Outros",
            clientId: null,
            source: "Ajuste manual",
            paymentMethodId: null,
            receivedDate: today,
            status: "received",
            notes: "Ajuste manual de saldo",
            recurrence: "once",
            parentId: null,
          });
        }}
      />

      <MonthTransactionsSheet
        open={sheetType !== null}
        onOpenChange={(o) => { if (!o) setSheetType(null); }}
        type={sheetType ?? "incomes"}
        monthKey={monthKey}
        incomes={incomes}
        expenses={expenses}
        initialFilter={sheetInitialFilter}
      />

      <IncomePendingCalendar incomes={incomes.filter((i) => i.source !== "Ajuste manual")} />
      <IncomeDashboard incomes={incomes.filter((i) => i.source !== "Ajuste manual")} />
      <Card no3d className="p-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Receitas ({filtered.length})</h2>
          {!readOnly && (
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Nova receita
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="received">Recebido</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="overdue">Atrasado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {INCOME_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger>
              <ArrowUpDown className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Mais recente</SelectItem>
              <SelectItem value="amount">Maior valor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">Nenhuma receita encontrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((i) => (
              <div
                key={i.id}
                className="rounded-xl border border-border/40 bg-card/60 p-3 sm:p-4 hover:border-border/80 transition-all"
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{i.description}</span>
                      <Badge variant="outline" className={STATUS_BADGE[i.status]}>
                        {i.status === "received" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {i.status === "pending" && <Clock className="h-3 w-3 mr-1" />}
                        {i.status === "overdue" && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {STATUS_LABEL[i.status]}
                      </Badge>
                      {i.category && <Badge variant="secondary" className="text-xs">{i.category}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{format(new Date(i.receivedDate + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
                      <span>{clientName(i)}</span>
                      <span>{methodName(i.paymentMethodId)}</span>
                      {i.recurrence !== "once" && <span className="text-primary">↻ {({ weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal", yearly: "Anual" } as Record<string, string>)[i.recurrence] ?? i.recurrence}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {fmtBRL(i.amount)}
                    </div>
                  </div>
                </div>
                {!readOnly && (
                  <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border/30">
                    {i.status !== "received" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPayTarget(i);
                          setPayDate(todayInAppTz());
                          setPayAmount("");
                        }}
                        className="h-8 gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Pagar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setFormOpen(true); }} className="h-8 gap-1">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => duplicateIncome(i.id)} className="h-8 gap-1">
                      <Copy className="h-3.5 w-3.5" /> Duplicar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleteId(i.id)} className="h-8 gap-1 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <IncomeForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSubmit={async (data) => {
          if (editing) await updateIncome(editing.id, data);
          else await addIncome(data);
        }}
      />

      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) setPayTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagar receita</DialogTitle>
            <DialogDescription>
              Informe a data do recebimento e, opcionalmente, o valor recebido.
              Se deixar o valor em branco, será considerado o valor cadastrado.
            </DialogDescription>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <div className="font-medium truncate">{payTarget.description}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Valor cadastrado: {fmtBRL(payTarget.amount)}
                </div>
              </div>
              <div>
                <Label>Data do recebimento</Label>
                <DatePickerField value={payDate} onChange={setPayDate} />
              </div>
              <div>
                <Label>Valor recebido (opcional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={payTarget.amount.toFixed(2)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Cancelar</Button>
            <Button
              disabled={paySaving || !payDate}
              onClick={async () => {
                if (!payTarget) return;
                setPaySaving(true);
                const finalAmount = payAmount.trim() && Number(payAmount) > 0
                  ? Number(payAmount)
                  : payTarget.amount;
                await updateIncome(payTarget.id, {
                  status: "received",
                  receivedDate: payDate,
                  amount: finalAmount,
                });
                setPaySaving(false);
                setPayTarget(null);
              }}
            >
              {paySaving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Excluir receita?"
        description="Esta ação não pode ser desfeita. Se a receita estava marcada como recebida, o saldo será revertido."
        onConfirm={async () => {
          if (deleteId) await deleteIncome(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}
