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
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, Trash2, CheckCircle, Receipt, Calendar,
  CircleDollarSign, ChevronLeft, ChevronRight, Undo2, TrendingUp, CalendarDays, Target, Pencil,
  Sparkles,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ExpenseEditDialog } from "@/components/ExpenseEditDialog";
import { personalCategories, getPersonalCategory } from "@/lib/personalExpenseCategories";
import { Progress } from "@/components/ui/progress";
import { usePersonalBudgets } from "@/hooks/usePersonalBudgets";
import { isPiggyExpense } from "@/hooks/usePiggyBanks";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonalAIInsightsCard } from "@/components/PersonalAIInsightsCard";


interface Props {
  expenses: Expense[];
  onPay: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onUnpay?: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
  /**
   * Extra content rendered after the evolution chart.
   * Can be a node, or a render-fn receiving the currently selected month
   * (YYYY-MM) so child components (e.g. credit card invoice) can stay in sync.
   */
  afterEvolution?: React.ReactNode | ((ctx: { selectedMonth: string }) => React.ReactNode);
}

type Filter = "all" | "pending" | "paid" | "overdue";

const FIXED_RECURRING_INSTALLMENTS = 999;

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const isOverdue = (e: Expense) =>
  !e.paid && e.dueDate < new Date().toISOString().split("T")[0];

export function PersonalExpenseList({ expenses, onPay, onUnpay, onDelete, onUpdate, readOnly = false, afterEvolution }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(fmt(v)), [mask]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "auto" | "manual">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState("");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [unpayingId, setUnpayingId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});
  const {
    budgets,
    monthBudgets,
    effectiveMonth,
    isInherited,
    targetMonth,
    setBudget,
    deleteBudget,
    inheritIntoMonth,
  } = usePersonalBudgets(true, selectedMonth);
  const [historyMonths, setHistoryMonths] = useState<3 | 6 | 12>(6);

  // Helpers de recorrência: parceladas e fixas se replicam mês a mês.
  const isRecurringMonthly = (e: Expense) =>
    e.type === "recorrente" && !!e.installments && e.installments > 1;

  /** True se a despesa parcelada/fixa "ocorre" no mês YYYY-MM informado. */
  const occursInMonth = useCallback((e: Expense, yyyymm: string) => {
    if (!isRecurringMonthly(e)) return e.dueDate.startsWith(yyyymm);
    const [sY, sM] = yyyymm.split("-").map(Number);
    const [dY, dM] = e.dueDate.split("-").map(Number);
    const start = dY * 12 + dM;
    const sel = sY * 12 + sM;
    const end = start + (e.installments! - 1);
    return sel >= start && sel <= end;
  }, []);

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
    const categoriesPresent = new Set<string>();
    const byMonth: Record<string, Record<string, number>> = {};
    months.forEach((m) => (byMonth[m.key] = {}));
    expenses.forEach((e) => {
      if (isPiggyExpense(e.notes)) return; // Cofrinho transfers are not spending
      const isRec = isRecurringMonthly(e);
      const amt = isRec ? e.amount / e.installments! : e.amount;
      months.forEach((m) => {
        if (!occursInMonth(e, m.key)) return;
        byMonth[m.key][e.category] = (byMonth[m.key][e.category] || 0) + amt;
        categoriesPresent.add(e.category);
      });
    });
    const data = months.map((m) => ({ month: m.label, ...byMonth[m.key] }));
    const cats = [...categoriesPresent];
    return { data, categories: cats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, historyMonths, occursInMonth]);

  const getInstallmentAmount = useCallback((e: Expense) => {
    const isRec = isRecurringMonthly(e);
    return isRec ? e.amount / e.installments! : e.amount;
  }, []);

  const monthFiltered = useMemo(() => {
    return expenses.filter((e) => {
      if (e.paid && e.paidDate && e.paidDate.startsWith(selectedMonth)) return true;
      return occursInMonth(e, selectedMonth);
    });
  }, [expenses, selectedMonth, occursInMonth]);

  const isRecFullyPaid = (e: Expense) =>
    e.type === "recorrente" && !!e.installments && e.installments > 1 && e.paid;
  // Cofrinho expenses (savings transfers) stay in the list but must NOT count as monthly spending.
  const visibleMonth = monthFiltered.filter((e) => !isRecFullyPaid(e));
  const spendingMonth = visibleMonth.filter((e) => !isPiggyExpense(e.notes));

  const totalPending = spendingMonth.filter((e) => !e.paid).reduce((s, e) => s + getInstallmentAmount(e), 0);
  const totalPaid = spendingMonth.reduce((s, e) => s + getInstallmentAmount(e), 0);
  const totalOverdue = spendingMonth.filter(isOverdue).reduce((s, e) => s + getInstallmentAmount(e), 0);

  // Daily average + projection — only meaningful for current month
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const isCurrentMonth = selYear === now.getFullYear() && selMonthNum === now.getMonth() + 1;
  const daysInMonth = new Date(selYear, selMonthNum, 0).getDate();
  const dayOfMonth = isCurrentMonth ? now.getDate() : daysInMonth;
  const dailyAverage = dayOfMonth > 0 ? totalPaid / dayOfMonth : 0;
  const projection = isCurrentMonth ? totalPaid + dailyAverage * (daysInMonth - dayOfMonth) : totalPaid;

  // Category breakdown — includes all expenses of the selected month (paid + pending),
  // ensuring consistency with monthly totals and accurate display for past months.
  // Only categories with value > 0 are shown.
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    spendingMonth.forEach((e) => {
      const v = getInstallmentAmount(e);
      if (v <= 0) return;
      map.set(e.category, (map.get(e.category) || 0) + v);
    });
    const arr = [...map.entries()]
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value, cat: getPersonalCategory(name) }))
      .sort((a, b) => b.value - a.value);
    if (arr.length <= 6) return arr;
    const top = arr.slice(0, 5);
    const rest = arr.slice(5).reduce((s, it) => s + it.value, 0);
    return [...top, { name: "Outros", value: rest, cat: getPersonalCategory("Outros") }];
  }, [spendingMonth, getInstallmentAmount]);

  const totalCategorized = categoryData.reduce((s, it) => s + it.value, 0);

  // Spend per category (paid only, excluding cofrinho) — used by budget progress
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    spendingMonth.filter((e) => e.paid).forEach((e) => {
      map.set(e.category, (map.get(e.category) || 0) + getInstallmentAmount(e));
    });
    return map;
  }, [spendingMonth, getInstallmentAmount]);

  // Committed per category — used to sort budget subcards.
  // Inclui pagos no mês + pendentes cuja data de vencimento esteja no mês selecionado.
  const committedByCategory = useMemo(() => {
    const map = new Map<string, number>();
    spendingMonth.forEach((e) => {
      const inMonth = e.paid
        ? true // já está em spendingMonth porque foi pago no mês
        : occursInMonth(e, selectedMonth);
      if (!inMonth) return;
      map.set(e.category, (map.get(e.category) || 0) + getInstallmentAmount(e));
    });
    return map;
  }, [spendingMonth, getInstallmentAmount, selectedMonth]);

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpentBudgeted = budgets.reduce((s, b) => s + (spentByCategory.get(b.category) || 0), 0);

  // Budget overrun alert intentionally disabled on the Despesas tab.

  const openBudgetEdit = () => {
    const draft: Record<string, string> = {};
    personalCategories.forEach((c) => {
      // Pré-preenche com o limite do próprio mês; se não houver, usa o herdado
      // (assim editar gera um novo registro próprio sem alterar o mês de origem).
      const own = monthBudgets.find((b) => b.category === c.name);
      const inherited = budgets.find((b) => b.category === c.name);
      const value = own?.amount ?? inherited?.amount ?? 0;
      draft[c.name] = value > 0 ? String(value) : "";
    });
    setBudgetDraft(draft);
    setBudgetEditOpen(true);
  };

  const saveBudgets = async () => {
    for (const c of personalCategories) {
      const raw = budgetDraft[c.name] ?? "";
      const num = Number(raw.replace(",", "."));
      const value = isNaN(num) ? 0 : num;
      const ownExisting = monthBudgets.find((b) => b.category === c.name);
      // Se mantiver o valor herdado e não há limite próprio, não precisa criar.
      const inheritedSame =
        !ownExisting && isInherited &&
        budgets.find((b) => b.category === c.name)?.amount === value &&
        value > 0;
      if (inheritedSame) continue;
      if ((ownExisting?.amount ?? 0) !== value) {
        await setBudget(c.name, value);
      }
    }
    toast.success("Limites atualizados");
    setBudgetEditOpen(false);
  };

  const formatMonthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return format(new Date(y, m - 1, 1), "MMM/yyyy", { locale: ptBR });
  };

  const isBotExpense = (e: Expense) => /\[\s*bot\s*\]/i.test(e.notes ?? "");

  const filtered = visibleMonth
    .filter((e) =>
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.category.toLowerCase().includes(search.toLowerCase())
    )
    .filter((e) => (categoryFilter ? e.category === categoryFilter : true))
    .filter((e) => {
      if (sourceFilter === "auto") return isBotExpense(e);
      if (sourceFilter === "manual") return !isBotExpense(e);
      return true;
    })
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
    setPaidAmountInput("");
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-5 md:gap-3">
        {/* Featured: Gasto do mês — destaque no topo no mobile, mesmo design dos demais */}
        <Card no3d>
          <CardContent className="p-3 md:p-4 flex flex-col items-center text-center">
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center mb-2">
              <CheckCircle className="h-4 w-4 text-success" />
            </div>
            <p className="text-[10px] md:text-xs text-muted-foreground">Gasto do mês</p>
            <p className="text-sm md:text-lg font-bold text-success mt-0.5">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>

        {/* Outros cards: 2 colunas no mobile, fluem no grid pai no desktop */}
        <div className="grid grid-cols-2 gap-2 md:contents">
          <Card no3d>
            <CardContent className="p-3 md:p-4 flex flex-col items-center text-center">
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center mb-2">
                <CircleDollarSign className="h-4 w-4 text-warning" />
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">A pagar</p>
              <p className="text-sm md:text-lg font-bold text-foreground mt-0.5">{formatCurrency(totalPending)}</p>
            </CardContent>
          </Card>
          <Card no3d>
            <CardContent className="p-3 md:p-4 flex flex-col items-center text-center">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
                <CircleDollarSign className="h-4 w-4 text-destructive" />
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Atrasado</p>
              <p className="text-sm md:text-lg font-bold text-destructive mt-0.5">{formatCurrency(totalOverdue)}</p>
            </CardContent>
          </Card>
          <Card no3d>
            <CardContent className="p-3 md:p-4 flex flex-col items-center text-center">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Média diária</p>
              <p className="text-sm md:text-lg font-bold text-foreground mt-0.5">{formatCurrency(dailyAverage)}</p>
            </CardContent>
          </Card>
          <Card no3d>
            <CardContent className="p-3 md:p-4 flex flex-col items-center text-center">
              <div className="h-8 w-8 rounded-lg bg-accent/30 flex items-center justify-center mb-2">
                <TrendingUp className="h-4 w-4 text-foreground" />
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">Projeção</p>
              <p className="text-sm md:text-lg font-bold text-foreground mt-0.5">{formatCurrency(projection)}</p>
            </CardContent>
          </Card>
        </div>
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

      {/* Limites de gastos por categoria (escopo mensal + herança) */}
      <Card no3d>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground leading-tight">
                  Limites de gastos
                </h3>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {budgets.length === 0
                    ? "Defina um valor máximo mensal por categoria"
                    : isInherited && effectiveMonth
                      ? `Herdado de ${formatMonthLabel(effectiveMonth)}`
                      : `${budgets.length} ${budgets.length === 1 ? "categoria" : "categorias"} configuradas`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isInherited && !readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => inheritIntoMonth()}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Usar para este mês
                </Button>
              )}
              <Button
                variant={budgets.length === 0 ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={openBudgetEdit}
                disabled={readOnly}
              >
                <Target className="h-3.5 w-3.5 mr-1" />
                {budgets.length === 0 ? "Definir limites" : "Editar limites"}
              </Button>
            </div>
          </div>

          {budgets.length > 0 && (
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {budgets
                  .slice()
                  .sort((a, b) => {
                    const sa = committedByCategory.get(a.category) || 0;
                    const sb = committedByCategory.get(b.category) || 0;
                    if (sb !== sa) return sb - sa;
                    return a.category.localeCompare(b.category, "pt-BR");
                  })
                  .slice(0, 4)
                  .map((b) => {
                    const cat = getPersonalCategory(b.category);
                    const Icon = cat.icon;
                    const spent = spentByCategory.get(b.category) || 0;
                    const pct = b.amount > 0 ? Math.min(200, (spent / b.amount) * 100) : 0;
                    const over = spent > b.amount;
                    const own = monthBudgets.find((x) => x.id === b.id);
                    return (
                      <div
                        key={b.id}
                        className={`rounded-lg border p-2.5 bg-card flex flex-col gap-1.5 ${
                          over ? "border-destructive/40" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div
                              className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `hsl(${cat.color} / 0.12)` }}
                            >
                              <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${cat.color})` }} />
                            </div>
                            <span className="truncate text-xs font-medium text-foreground">
                              {b.category}
                            </span>
                          </div>
                          {own && !readOnly && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() => deleteBudget(own.id)}
                              title="Remover limite deste mês"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-baseline justify-between gap-1">
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              over ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {formatCurrency(spent)}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            / {formatCurrency(b.amount)}
                          </span>
                        </div>
                        <Progress
                          value={Math.min(100, pct)}
                          className={over ? "h-1.5 [&>div]:bg-destructive" : "h-1.5"}
                        />
                        <span
                          className={`text-[10px] tabular-nums ${
                            over ? "text-destructive font-medium" : "text-muted-foreground"
                          }`}
                        >
                          {Math.round(pct)}% utilizado
                        </span>
                      </div>
                    );
                  })}
              </div>
              {budgets.length > 4 && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Mostrando as 4 categorias com maior gasto. {budgets.length - 4}{" "}
                  {budgets.length - 4 === 1 ? "outra" : "outras"} configurada
                  {budgets.length - 4 === 1 ? "" : "s"}.
                </p>
              )}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border">
                <span>Total</span>
                <span>
                  {formatCurrency(totalSpentBudgeted)} / {formatCurrency(totalBudget)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* AI-generated intelligent report */}
      <PersonalAIInsightsCard
        month={selectedMonth}
        exceededCategories={budgets
          .filter((b) => b.amount > 0 && (spentByCategory.get(b.category) || 0) > b.amount)
          .map((b) => b.category)}
        hasExpenses={spendingMonth.length > 0}
        categoryStats={(() => {
          const cats = new Set<string>([
            ...budgets.map((b) => b.category),
            ...Array.from(spentByCategory.keys()),
          ]);
          return Array.from(cats).map((cat) => ({
            category: cat,
            spent: spentByCategory.get(cat) || 0,
            budget: budgets.find((b) => b.category === cat)?.amount || 0,
          }));
        })()}
      />

      {typeof afterEvolution === "function"
        ? afterEvolution({ selectedMonth })
        : afterEvolution}

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

      {/* Source filter (auto vs manual) */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSourceFilter(sourceFilter === "auto" ? "all" : "auto")}
          className={`rounded-xl transition-all duration-200 ${sourceFilter === "auto" ? "bg-primary text-primary-foreground border-primary" : ""}`}
          title="Despesas lançadas pelo bot do Telegram"
        >
          Automáticas ({visibleMonth.filter(isBotExpense).length})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSourceFilter(sourceFilter === "manual" ? "all" : "manual")}
          className={`rounded-xl transition-all duration-200 ${sourceFilter === "manual" ? "bg-primary text-primary-foreground border-primary" : ""}`}
          title="Despesas registradas manualmente no app"
        >
          Manuais ({visibleMonth.filter((e) => !isBotExpense(e)).length})
        </Button>
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
                            {expense.type !== "fixa" && isRecorrente && expense.installments! < FIXED_RECURRING_INSTALLMENTS && (() => {
                              const total = expense.installments!;
                              const paidCount = expense.paidInstallments || 0;
                              // Reconstrói a data da 1ª parcela (dueDate atual - paidCount meses)
                              // para localizar corretamente a parcela do mês selecionado.
                              const [dY, dM] = expense.dueDate.split("-").map(Number);
                              const firstMonthIdx = (dY * 12 + dM) - paidCount;
                              const [sY, sM] = selectedMonth.split("-").map(Number);
                              const selIdx = sY * 12 + sM;
                              const offset = selIdx - firstMonthIdx; // 0-based
                              const current = expense.paid
                                ? total
                                : Math.min(Math.max(1, offset + 1), total);
                              return (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-semibold">
                                  Parcela {current}/{total}
                                </Badge>
                              );
                            })()}
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
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUnpayingId(expense.id)}>
                              <Undo2 className="h-3 w-3 mr-1" />
                              Estornar
                            </Button>
                          )}
                          {onUpdate && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingExpense(expense)}>
                              <Pencil className="h-3 w-3 mr-1" />
                              Editar
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
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>Confirme a data e, se quiser, informe o valor efetivamente pago.</DialogDescription>
          </DialogHeader>
          {(() => {
            const exp = expenses.find((e) => e.id === payingId);
            const suggested = exp ? getInstallmentAmount(exp) : 0;
            return (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Data</Label>
                  <DatePickerField value={payDate} onChange={setPayDate} />
                </div>
                <div>
                  <Label htmlFor="pay-amount-personal" className="text-xs">Valor pago (opcional)</Label>
                  <Input
                    id="pay-amount-personal"
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    placeholder={suggested.toFixed(2)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Em branco usa o valor original ({formatCurrency(suggested)}).
                  </p>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayingId(null)}>Cancelar</Button>
            <Button onClick={() => {
              if (payingId) {
                const parsed = parseFloat(paidAmountInput);
                const paidAmount = paidAmountInput.trim() && !isNaN(parsed) && parsed > 0 ? parsed : undefined;
                onPay(payingId, false, payDate, paidAmount);
              }
              setPayingId(null);
              setPaidAmountInput("");
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

      {/* Unpay confirm */}
      <Dialog open={!!unpayingId} onOpenChange={(o) => !o && setUnpayingId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Estornar pagamento</DialogTitle>
            <DialogDescription>
              Esta despesa voltará para o status pendente. Aportes vinculados a cofrinhos também serão revertidos. Deseja continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnpayingId(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (unpayingId && onUnpay) onUnpay(unpayingId);
                setUnpayingId(null);
              }}
            >
              Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <ExpenseEditDialog
        open={!!editingExpense}
        onOpenChange={(o) => !o && setEditingExpense(null)}
        expense={editingExpense}
        onSave={async (patch) => {
          if (!editingExpense || !onUpdate) return;
          await onUpdate(editingExpense.id, {
            description: patch.description,
            amount: patch.amount,
            dueDate: patch.dueDate,
            category: patch.category,
            notes: patch.notes ?? undefined,
          });
          toast.success("Despesa atualizada");
        }}
      />
      <Dialog open={budgetEditOpen} onOpenChange={setBudgetEditOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Limites de {formatMonthLabel(targetMonth)}</DialogTitle>
            <DialogDescription>
              Defina um valor máximo por categoria para este mês. Deixe em branco ou 0 para remover.
              {isInherited && effectiveMonth && (
                <> Sem alteração, os limites de <strong>{formatMonthLabel(effectiveMonth)}</strong> continuam valendo.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5 py-2">
            {personalCategories
              .slice()
              .sort((a, b) => {
                const sa = committedByCategory.get(a.name) || 0;
                const sb = committedByCategory.get(b.name) || 0;
                if (sb !== sa) return sb - sa;
                return a.name.localeCompare(b.name, "pt-BR");
              })
              .map((c) => {
                const Icon = c.icon;
                const spent = spentByCategory.get(c.name) || 0;
                return (
                  <div key={c.name} className="flex items-center gap-2">
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `hsl(${c.color} / 0.15)` }}
                    >
                      <Icon className="h-4 w-4" style={{ color: `hsl(${c.color})` }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        Gasto: {formatCurrency(spent)}
                      </div>
                    </div>
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
