import { useEffect, useMemo, useState } from "react";
import { useIncomes, Income, IncomeStatus } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useClients } from "@/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { todayInAppTz, todayDateInAppTz } from "@/lib/timezone";
import { IncomeBalanceCard } from "./IncomeBalanceCard";
import { IncomeDashboard } from "./IncomeDashboard";
import { FinancialHealthDashboard } from "./FinancialHealthDashboard";
import { IncomePendingCalendar } from "./IncomePendingCalendar";
import { IncomeForm, INCOME_CATEGORIES } from "./IncomeForm";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { MonthTransactionsSheet } from "./MonthTransactionsSheet";
import { FinancialStatement } from "./FinancialStatement";
import { PiggyBanksSummaryCard } from "./PiggyBanksSummaryCard";
import { IncomeTelegramBotButton } from "./IncomeTelegramBotButton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Search, Copy, Pencil, Trash2, CheckCircle2, Clock, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, CalendarCheck, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABEL: Record<IncomeStatus, string> = {
  received: "PAGO",
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
  const { sales } = useProducts();
  const { clients } = useClients();
  const { activeMethods } = usePaymentMethods();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Income | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null);
  const [deleteScope, setDeleteScope] = useState<"single" | "pending" | "all">("single");
  const [sheetType, setSheetType] = useState<"incomes" | "expenses" | null>(null);
  const [sheetInitialFilter, setSheetInitialFilter] = useState<string | undefined>(undefined);
  const [statementOpen, setStatementOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Income | null>(null);
  const [payDate, setPayDate] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [paySaving, setPaySaving] = useState(false);
  const [viewDateTarget, setViewDateTarget] = useState<Income | null>(null);
  const [editingPayDate, setEditingPayDate] = useState(false);
  const [editPayDateValue, setEditPayDateValue] = useState("");
  const [savingPayDate, setSavingPayDate] = useState(false);
  const [incomesExpanded, setIncomesExpanded] = useState(false);

  const nowD = todayDateInAppTz();
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
      const inMonth = i.receivedDate.startsWith(monthKey);
      const belongsToRecurringSeries = Boolean(i.parentId) || i.recurrence !== "once";
      const carriedOver = !belongsToRecurringSeries && i.status !== "received" && i.receivedDate < monthKey + "-01";
      if (!inMonth && !carriedOver) return false;
      
      if (statusFilter === "pending_all" || statusFilter === "pending") {
        if (i.status !== "pending" && i.status !== "overdue") return false;
      } else if (statusFilter === "overdue") {
        if (i.status !== "overdue") return false;
      } else if (statusFilter === "received") {
        if (i.status !== "received") return false;
      } else if (statusFilter !== "all") {
        if (i.status !== statusFilter) return false;
      }
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
      if (sortBy === "amount") return a.amount - b.amount;
      return a.receivedDate.localeCompare(b.receivedDate);
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
            const n = todayDateInAppTz();
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
        onOpenStatement={() => setStatementOpen(true)}
        statementLeftSlot={!readOnly ? <IncomeTelegramBotButton /> : undefined}
        onAdjust={async (delta) => {
          if (!delta) return;
          const today = todayInAppTz();
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

      <Card no3d className="p-4">
        <button
          type="button"
          onClick={() => setIncomesExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 flex-wrap text-left rounded-lg -m-1 p-1 hover:bg-muted/40 active:bg-muted/60 transition-colors"
          aria-expanded={incomesExpanded}
          aria-controls="receitas-content"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Receitas ({filtered.length})</h2>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${incomesExpanded ? "rotate-180" : ""}`}
            />
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground leading-none">
              {!incomesExpanded
                ? "Pendente"
                : statusFilter === "all" ? "Total"
                : statusFilter === "received" ? "Total recebido"
                : statusFilter === "pending" ? "Total a receber"
                : statusFilter === "overdue" ? "Total vencido"
                : statusFilter === "pending_all" ? "Total a receber"
                : "Total"}
            </div>
            <div className={`text-base font-bold ${
              !incomesExpanded ? "text-amber-600 dark:text-amber-400" :
              statusFilter === "received" ? "text-emerald-600 dark:text-emerald-400" :
              statusFilter === "overdue" ? "text-rose-600 dark:text-rose-400" :
              statusFilter === "pending" ? "text-amber-600 dark:text-amber-400" :
              "text-foreground"
            }`}>
              {fmtBRL(
                !incomesExpanded
                  ? incomes
                      .filter((i) =>
                        i.source !== "Ajuste manual" &&
                        i.receivedDate.startsWith(monthKey) &&
                        (i.status === "pending" || i.status === "overdue"),
                      )
                      .reduce((s, i) => s + i.amount, 0)
                  : filtered.reduce((s, i) => s + i.amount, 0),
              )}
            </div>
          </div>
        </button>

        <div
          id="receitas-content"
          className={`grid transition-all duration-300 ease-in-out ${incomesExpanded ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0"}`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0"
                onClick={() => setStatusFilter("all")}
              >
                Todas
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "pending" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0 gap-1.5"
                onClick={() => setStatusFilter("pending")}
              >
                <Clock className="h-3.5 w-3.5" /> Pendentes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={statusFilter === "received" ? "default" : "outline"}
                className="h-9 rounded-full min-w-0 gap-1.5"
                onClick={() => setStatusFilter("received")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Pagas
              </Button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 w-full" />
              </div>
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
                       <div className="flex items-center justify-between gap-1 mt-3 pt-3 border-t border-border/30">
                          <Button
                            variant="ghost"
                            onClick={() => setViewDateTarget(i)}
                            className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0"
                            title="Ver data de pagamento"
                            aria-label="Ver data de pagamento"
                          >
                            <CalendarCheck className="h-4 w-4" />
                            <span className="hidden md:inline">Data</span>
                          </Button>
                          {i.status !== "received" && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setPayTarget(i);
                                setPayDate(todayInAppTz());
                                setPayAmount("");
                              }}
                              className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0"
                              title="Pagar"
                              aria-label="Pagar"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="hidden md:inline">Pagar</span>
                            </Button>
                          )}
                          <Button variant="ghost" onClick={() => { setEditing(i); setFormOpen(true); }} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Editar" aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                            <span className="hidden md:inline">Editar</span>
                          </Button>
                          <Button variant="ghost" onClick={() => duplicateIncome(i.id)} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0" title="Duplicar" aria-label="Duplicar">
                            <Copy className="h-4 w-4" />
                            <span className="hidden md:inline">Duplicar</span>
                          </Button>
                          <Button variant="ghost" onClick={() => { setDeleteTarget(i); setDeleteScope("single"); }} className="h-9 w-9 md:w-auto md:px-3 flex-1 min-h-0 text-destructive hover:text-destructive" title="Excluir" aria-label="Excluir">
                            <Trash2 className="h-4 w-4" />
                            <span className="hidden md:inline">Excluir</span>
                          </Button>
                       </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <PiggyBanksSummaryCard readOnly={readOnly} />
      <IncomePendingCalendar
        incomes={incomes.filter((i) => i.source !== "Ajuste manual")}
        expenses={expenses}
        allIncomes={incomes}
        allExpenses={expenses}
        monthKey={monthKey}
        onMonthChange={setSelectedMonth}
      />
      <FinancialHealthDashboard
        incomes={incomes}
        expenses={expenses}
        monthKey={monthKey}
      />
      <IncomeDashboard
        incomes={incomes.filter(
          (i) =>
            i.source !== "Ajuste manual" &&
            i.receivedDate.startsWith(monthKey) &&
            i.status !== "received",
        )}
        allMonthIncomes={incomes.filter(
          (i) => i.source !== "Ajuste manual" && i.receivedDate.startsWith(monthKey),
        )}
        sales={sales}
        monthKey={monthKey}
      />

      <Sheet open={statementOpen} onOpenChange={setStatementOpen}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Extrato Financeiro</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <FinancialStatement />
          </div>
        </SheetContent>
      </Sheet>





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
                // Para receitas recorrentes (parcelas de uma série), NÃO sobrescrever
                // a data agendada — caso contrário a data muda e pode colidir com outra
                // ocorrência da mesma série, causando duplicidade.
                const isRecurringOccurrence =
                  !!payTarget.parentId || payTarget.recurrence !== "once";
                const patch: any = {
                  status: "received",
                  amount: finalAmount,
                };
                if (!isRecurringOccurrence) {
                  patch.receivedDate = payDate;
                }
                await updateIncome(payTarget.id, patch);
                setPaySaving(false);
                setPayTarget(null);
              }}
            >
              {paySaving ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {deleteTarget && (() => {
        const isRecurring = Boolean(deleteTarget.parentId) || deleteTarget.recurrence !== "once";
        if (!isRecurring) {
          return (
            <ConfirmDeleteDialog
              open={!!deleteTarget}
              onOpenChange={(o) => !o && setDeleteTarget(null)}
              title="Excluir receita?"
              description="Esta ação não pode ser desfeita. Se a receita estava marcada como recebida, o saldo será revertido."
              onConfirm={async () => {
                await deleteIncome(deleteTarget.id, "single");
                setDeleteTarget(null);
              }}
            />
          );
        }
        return (
          <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Excluir receita recorrente</DialogTitle>
                <DialogDescription>
                  Esta receita faz parte de uma série recorrente. Escolha o que deseja excluir.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {[
                  { value: "single", label: "Apenas esta receita", desc: "Exclui somente a ocorrência selecionada." },
                  { value: "pending", label: "Apenas as pendentes", desc: "Exclui esta e todas as ocorrências não recebidas da série." },
                  { value: "all", label: "Todas da série", desc: "Exclui todas as ocorrências, inclusive já recebidas." },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDeleteScope(opt.value as any)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors ${deleteScope === opt.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                  >
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    await deleteIncome(deleteTarget.id, deleteScope);
                    setDeleteTarget(null);
                  }}
                >
                  Excluir
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      <Dialog open={!!viewDateTarget} onOpenChange={(o) => { if (!o) { setViewDateTarget(null); setEditingPayDate(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Data de pagamento</DialogTitle>
            <DialogDescription>
              {viewDateTarget?.description}
            </DialogDescription>
          </DialogHeader>
          {viewDateTarget && (
            <div className="space-y-2 text-sm">
              {viewDateTarget.status === "received" ? (
                <>
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3">
                    <p className="text-xs text-muted-foreground">Recebido em</p>
                    {editingPayDate ? (
                      <div className="mt-1 space-y-2">
                        <DatePickerField value={editPayDateValue} onChange={setEditPayDateValue} />
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setEditingPayDate(false)}>Cancelar</Button>
                          <Button
                            size="sm"
                            disabled={savingPayDate || !editPayDateValue}
                            onClick={async () => {
                              if (!viewDateTarget) return;
                              setSavingPayDate(true);
                              await updateIncome(viewDateTarget.id, { actualReceivedDate: editPayDateValue } as any);
                              setSavingPayDate(false);
                              setEditingPayDate(false);
                              setViewDateTarget({ ...viewDateTarget, actualReceivedDate: editPayDateValue });
                            }}
                          >
                            {savingPayDate ? "Salvando..." : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                          {format(
                            new Date((viewDateTarget.actualReceivedDate || viewDateTarget.receivedDate) + "T00:00:00"),
                            "dd 'de' MMMM 'de' yyyy",
                            { locale: ptBR },
                          )}
                        </p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Alterar data de pagamento"
                          aria-label="Alterar data de pagamento"
                          onClick={() => {
                            setEditPayDateValue(viewDateTarget.actualReceivedDate || viewDateTarget.receivedDate);
                            setEditingPayDate(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Valor: <span className="font-semibold text-foreground">{fmtBRL(viewDateTarget.amount)}</span>
                  </div>
                </>
              ) : (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-base font-semibold text-amber-700 dark:text-amber-400">
                    Ainda não recebida
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vencimento: {format(new Date(viewDateTarget.receivedDate + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setViewDateTarget(null); setEditingPayDate(false); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
