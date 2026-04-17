import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Trash2, CheckCircle, Receipt, Calendar,
  CircleDollarSign, ChevronLeft, ChevronRight, Undo2, TrendingUp, CalendarDays, Target, Pencil,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { personalCategories, getPersonalCategory } from "@/lib/personalExpenseCategories";
import { Progress } from "@/components/ui/progress";
import { usePersonalBudgets } from "@/hooks/usePersonalBudgets";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface Props {
  expenses: Expense[];
  onPay: (id: string, skipBalanceAdjust?: boolean, payDate?: string) => void;
  onUnpay?: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
  afterEvolution?: React.ReactNode;
}

type Filter = "all" | "pending" | "paid" | "overdue";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const isOverdue = (e: Expense) =>
  !e.paid && e.dueDate < new Date().toISOString().split("T")[0];

export function PersonalExpenseList({ expenses, onPay, onUnpay, onDelete, readOnly = false, afterEvolution }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(fmt(v)), [mask]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState("");
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const { budgets, setBudget } = usePersonalBudgets();
  const [historyMonths, setHistoryMonths] = useState<3 | 6 | 12>(6);

  // Monthly evolution per category — last N months
  const historyData = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const base = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let i = historyMonths - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: format(d, "MMM/yy", { locale: ptBR }),
      });
    }
    const monthSet = new Set(months.map((m) => m.key));
    const categoriesPresent = new Set<string>();
    const byMonth: Record<string, Record<string, number>> = {};
    months.forEach((m) => (byMonth[m.key] = {}));
    expenses.forEach((e) => {
      const mk = e.dueDate.slice(0, 7);
      if (!monthSet.has(mk)) return;
      const amt = e.type === "recorrente" && e.installments && e.installments > 1
        ? e.amount / e.installments
        : e.amount;
      byMonth[mk][e.category] = (byMonth[mk][e.category] || 0) + amt;
      categoriesPresent.add(e.category);
    });
    const data = months.map((m) => ({ month: m.label, ...byMonth[m.key] }));
    const cats = [...categoriesPresent];
    return { data, categories: cats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, historyMonths]);

  const getInstallmentAmount = useCallback((e: Expense) => {
    const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
    return isRec ? e.amount / e.installments! : e.amount;
  }, []);

  const monthFiltered = useMemo(() => {
    return expenses.filter((e) => {
      if (e.paid && e.paidDate && e.paidDate.startsWith(selectedMonth)) return true;
      if (e.dueDate.startsWith(selectedMonth)) return true;
      return false;
    });
  }, [expenses, selectedMonth]);

  const isRecFullyPaid = (e: Expense) =>
    e.type === "recorrente" && !!e.installments && e.installments > 1 && e.paid;
  const visibleMonth = monthFiltered.filter((e) => !isRecFullyPaid(e));

  const totalPending = visibleMonth.filter((e) => !e.paid).reduce((s, e) => s + getInstallmentAmount(e), 0);
  const totalPaid = visibleMonth.filter((e) => e.paid).reduce((s, e) => s + getInstallmentAmount(e), 0);
  const totalOverdue = visibleMonth.filter(isOverdue).reduce((s, e) => s + getInstallmentAmount(e), 0);

  // Daily average + projection — only meaningful for current month
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const isCurrentMonth = selYear === now.getFullYear() && selMonthNum === now.getMonth() + 1;
  const daysInMonth = new Date(selYear, selMonthNum, 0).getDate();
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
  const dailyAverage = dayOfMonth > 0 ? totalPaid / dayOfMonth : 0;
  const projection = isCurrentMonth ? totalPaid + dailyAverage * (daysInMonth - dayOfMonth) : totalPaid;

  // Category breakdown (paid only)
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    visibleMonth.filter((e) => e.paid).forEach((e) => {
      map.set(e.category, (map.get(e.category) || 0) + getInstallmentAmount(e));
    });
    const arr = [...map.entries()]
      .map(([name, value]) => ({ name, value, cat: getPersonalCategory(name) }))
      .sort((a, b) => b.value - a.value);
    if (arr.length <= 6) return arr;
    const top = arr.slice(0, 5);
    const rest = arr.slice(5).reduce((s, it) => s + it.value, 0);
    return [...top, { name: "Outros", value: rest, cat: getPersonalCategory("Outros") }];
  }, [visibleMonth, getInstallmentAmount]);

  const totalCategorized = categoryData.reduce((s, it) => s + it.value, 0);

  // Spend per category (paid only) — used by budget progress
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    visibleMonth.filter((e) => e.paid).forEach((e) => {
      map.set(e.category, (map.get(e.category) || 0) + getInstallmentAmount(e));
    });
    return map;
  }, [visibleMonth, getInstallmentAmount]);

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpentBudgeted = budgets.reduce((s, b) => s + (spentByCategory.get(b.category) || 0), 0);

  // Alert when a category exceeds its monthly budget — once per month/category
  useEffect(() => {
    if (!isCurrentMonth || budgets.length === 0) return;
    budgets.forEach((b) => {
      if (b.amount <= 0) return;
      const spent = spentByCategory.get(b.category) || 0;
      if (spent > b.amount) {
        const key = `budget-alert:${selectedMonth}:${b.category}`;
        if (typeof window !== "undefined" && !localStorage.getItem(key)) {
          const over = spent - b.amount;
          toast.warning(`Orçamento estourado: ${b.category}`, {
            description: `Você gastou ${fmt(spent)} de ${fmt(b.amount)} (${fmt(over)} acima do limite).`,
            duration: 8000,
          });
          // Browser notification (when permission granted)
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(`Orçamento estourado: ${b.category}`, {
                body: `Você gastou ${fmt(spent)} de ${fmt(b.amount)} este mês.`,
                icon: "/favicon.ico",
                tag: key,
              });
            } catch { /* ignore */ }
          }
          localStorage.setItem(key, "1");
        }
      }
    });
  }, [budgets, spentByCategory, selectedMonth, isCurrentMonth]);

  const openBudgetEdit = () => {
    const draft: Record<string, string> = {};
    personalCategories.forEach((c) => {
      const b = budgets.find((x) => x.category === c.name);
      draft[c.name] = b ? String(b.amount) : "";
    });
    setBudgetDraft(draft);
    setBudgetEditOpen(true);
  };

  const saveBudgets = async () => {
    for (const c of personalCategories) {
      const raw = budgetDraft[c.name] ?? "";
      const num = Number(raw.replace(",", "."));
      const value = isNaN(num) ? 0 : num;
      const existing = budgets.find((b) => b.category === c.name);
      if ((existing?.amount ?? 0) !== value) {
        await setBudget(c.name, value);
      }
    }
    setBudgetEditOpen(false);
  };

  const filtered = visibleMonth
    .filter((e) =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase())
    )
    .filter((e) => (categoryFilter ? e.category === categoryFilter : true))
    .filter((e) => {
      if (filter === "pending") return !e.paid && !isOverdue(e);
      if (filter === "paid") return e.paid;
      if (filter === "overdue") return isOverdue(e);
      return true;
    })
    .sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return b.dueDate.localeCompare(a.dueDate);
    });

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: visibleMonth.length },
    { id: "pending", label: "Pendentes", count: visibleMonth.filter((e) => !e.paid && !isOverdue(e)).length },
    { id: "overdue", label: "Atrasadas", count: visibleMonth.filter(isOverdue).length },
    { id: "paid", label: "Pagas", count: visibleMonth.filter((e) => e.paid).length },
  ];

  const prevMonth = () => {
    const d = new Date(selYear, selMonthNum - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(selYear, selMonthNum, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const openPayDialog = (id: string) => {
    setPayingId(id);
    setPayDate(new Date().toISOString().split("T")[0]);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center mb-2">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Gasto do mês</p>
            <p className="text-sm sm:text-lg font-bold text-success mt-0.5">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center mb-2">
              <CircleDollarSign className="h-4 w-4 text-warning" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">A pagar</p>
            <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">{formatCurrency(totalPending)}</p>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
              <CircleDollarSign className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Atrasado</p>
            <p className="text-sm sm:text-lg font-bold text-destructive mt-0.5">{formatCurrency(totalOverdue)}</p>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Média diária</p>
            <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">{formatCurrency(dailyAverage)}</p>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-accent/30 flex items-center justify-center mb-2">
              <TrendingUp className="h-4 w-4 text-foreground" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Projeção</p>
            <p className="text-sm sm:text-lg font-bold text-foreground mt-0.5">{formatCurrency(projection)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Month nav */}
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

      {/* Category chart */}
      {categoryData.length > 0 && (
        <Card no3d>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Gastos por categoria</h3>
              <span className="text-xs text-muted-foreground">{formatCurrency(totalCategorized)}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {categoryData.map((entry, idx) => (
                        <Cell key={idx} fill={`hsl(${entry.cat.color})`} />
                      ))}
                    </Pie>
                    <ReTooltip
                      formatter={(value: number) => fmt(value)}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {categoryData.map((entry) => {
                  const Icon = entry.cat.icon;
                  const pct = totalCategorized > 0 ? (entry.value / totalCategorized) * 100 : 0;
                  return (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: `hsl(${entry.cat.color})` }} />
                        <span className="truncate text-foreground">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
                        <span className="font-medium text-foreground">{formatCurrency(entry.value)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {afterEvolution}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar despesa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="grid grid-cols-2 sm:flex gap-1">
          {filters.map((f) => (
            <Button
              key={f.id}
              variant="outline"
              size="sm"
              onClick={() => setFilter(f.id)}
              className={`rounded-xl transition-all duration-200 ${filter === f.id ? "bg-primary text-primary-foreground border-primary" : ""}`}
            >
              {f.label} ({f.count})
            </Button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2">
        <Select
          value={categoryFilter ?? "__all__"}
          onValueChange={(v) => setCategoryFilter(v === "__all__" ? null : v)}
        >
          <SelectTrigger className="h-9 w-full sm:w-64">
            <SelectValue placeholder="Filtrar por categoria" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="__all__">Todas categorias</SelectItem>
            {personalCategories.map((c) => {
              const Icon = c.icon;
              return (
                <SelectItem key={c.name} value={c.name}>
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${c.color})` }} />
                    {c.name}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {categoryFilter && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => setCategoryFilter(null)}>
            Limpar
          </Button>
        )}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <Card no3d>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">
              {expenses.length === 0 ? "Nenhuma despesa pessoal cadastrada" : "Nenhuma despesa encontrada"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((expense) => {
            const overdue = isOverdue(expense);
            const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
            const installmentAmount = isRecorrente ? expense.amount / expense.installments! : expense.amount;
            const cat = getPersonalCategory(expense.category);
            const Icon = cat.icon;

            return (
              <Card no3d key={expense.id} className={overdue ? "border-destructive/50" : ""}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `hsl(${cat.color} / 0.15)` }}
                    >
                      <Icon className="h-5 w-5" style={{ color: `hsl(${cat.color})` }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{expense.description}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                              style={{ borderColor: `hsl(${cat.color} / 0.5)`, color: `hsl(${cat.color})` }}
                            >
                              {expense.category}
                            </Badge>
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(expense.dueDate + "T00:00:00"), "dd/MM/yyyy")}
                            </span>
                            {isRecorrente && (
                              <span className="text-[10px]">
                                {(expense.paidInstallments || 0)}/{expense.installments}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${expense.paid ? "text-success" : overdue ? "text-destructive" : "text-foreground"}`}>
                            {formatCurrency(installmentAmount)}
                          </p>
                          {expense.paid && expense.paidDate && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Pago em {format(new Date(expense.paidDate + "T00:00:00"), "dd/MM/yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-1.5 mt-3">
                          {!expense.paid && (
                            <Button size="sm" className="h-7 text-xs" onClick={() => openPayDialog(expense.id)}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Pagar
                            </Button>
                          )}
                          {expense.paid && onUnpay && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onUnpay(expense.id)}>
                              <Undo2 className="h-3 w-3 mr-1" />
                              Estornar
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteId(expense.id)}>
                            <Trash2 className="h-3 w-3 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pay dialog */}
      <Dialog open={!!payingId} onOpenChange={(o) => !o && setPayingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Data do pagamento</DialogTitle>
            <DialogDescription>Selecione a data em que esta despesa foi paga.</DialogDescription>
          </DialogHeader>
          <DatePickerField value={payDate} onChange={setPayDate} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (payingId) onPay(payingId, false, payDate);
              setPayingId(null);
            }}>
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) onDelete(deleteId);
          setDeleteId(null);
        }}
        title="Excluir despesa"
        description="Tem certeza? Esta ação não pode ser desfeita."
      />

      {/* Budget edit dialog */}
      <Dialog open={budgetEditOpen} onOpenChange={setBudgetEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Definir orçamento mensal</DialogTitle>
            <DialogDescription>Defina um valor por categoria. Deixe em branco ou 0 para remover.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-2">
            {personalCategories.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.name} className="flex items-center gap-2">
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `hsl(${c.color} / 0.15)` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: `hsl(${c.color})` }} />
                  </div>
                  <span className="text-sm flex-1 text-foreground">{c.name}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0,00"
                    className="w-28 h-8 text-sm"
                    value={budgetDraft[c.name] ?? ""}
                    onChange={(e) => setBudgetDraft((p) => ({ ...p, [c.name]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveBudgets}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
