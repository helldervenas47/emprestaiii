import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Target, Pencil, Trash2, Plus, Percent, TrendingUp, Banknote, FileText,
  HandCoins, Coins, Wallet, PiggyBank, AlertTriangle, UserPlus, Copy,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useMonthlyGoals, GoalType, currentMonthKey, formatMonthLabel } from "@/hooks/useMonthlyGoals";
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";
import { useExpenses } from "@/hooks/useExpenses";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useActiveCapitalSnapshots } from "@/hooks/useActiveCapitalSnapshots";
import { todayInAppTz } from "@/lib/timezone";

type Unit = "%" | "R$" | "qtd";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: Unit; color: string; description: string; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal",            icon: Percent,       unit: "%",   color: "text-warning",     description: "Meta da taxa média de juros aplicada nos contratos." },
  profit:             { label: "Faturamento do Período (% do Previsto)", icon: TrendingUp,    unit: "%",   color: "text-success",     description: "Quanto do valor previsto foi efetivamente realizado." },
  loan_volume:        { label: "Volume Emprestado no Mês",         icon: Banknote,      unit: "R$",  color: "text-primary",     description: "Soma do valor de novos empréstimos criados no mês." },
  new_loans_count:    { label: "Novos Empréstimos no Mês",         icon: FileText,      unit: "qtd", color: "text-primary",     description: "Quantidade de novos contratos criados no mês." },
  received_total:     { label: "Recebimentos no Mês",              icon: HandCoins,     unit: "R$",  color: "text-success",     description: "Soma de todos os pagamentos recebidos no mês." },
  interest_received:  { label: "Juros Recebidos no Mês",           icon: Coins,         unit: "R$",  color: "text-success",     description: "Apenas a parte dos juros dos pagamentos recebidos." },
  active_capital:     { label: "Capital Ativo / em Circulação",    icon: Wallet,        unit: "R$",  color: "text-primary",     description: "Valor mensal congelado no fechamento de cada mês." },
  net_profit:         { label: "Lucro Líquido do Mês",             icon: PiggyBank,     unit: "R$",  color: "text-success",     description: "Juros recebidos menos despesas pagas da empresa." },
  max_default_rate:   { label: "Inadimplência Máxima",             icon: AlertTriangle, unit: "%",   color: "text-destructive", description: "Limite máximo de % de parcelas em atraso (meta inversa).", inverse: true },
  new_clients_count:  { label: "Novos Clientes no Mês",            icon: UserPlus,      unit: "qtd", color: "text-primary",     description: "Clientes cadastrados no período." },
};

const ALL_TYPES = Object.keys(GOAL_TYPE_META) as GoalType[];

function inMonth(dateStr: string | undefined | null, month: string): boolean {
  if (!dateStr) return false;
  return dateStr.slice(0, 7) === month;
}

function fmtValue(v: number, unit: Unit, hidden: boolean): string {
  if (unit === "R$") return hidden ? "R$ ••••" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (unit === "%") return `${v.toFixed(2)}%`;
  return Math.round(v).toString();
}

export function MonthlyGoalsManager({ readOnly = false }: { readOnly?: boolean } = {}) {
  const { goals, upsertGoal, deleteGoal, loading } = useMonthlyGoals();
  const { loans, payments } = useLoans();
  const { clients } = useClients();
  const { expenses } = useExpenses(true);
  const { hidden } = useHideValues();
  const currentActiveCapital = useMemo(
    () => loans.filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((s: number, l: any) => s + (Number(l.remainingAmount ?? l.remaining_amount) || 0), 0),
    [loans]
  );
  const { currentMonth, getSnapshotAmount } = useActiveCapitalSnapshots(currentActiveCapital);

  const [goalType, setGoalType] = useState<GoalType>("loan_volume");
  const [month, setMonth] = useState(currentMonthKey());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState<string>(currentMonthKey());

  const reset = () => {
    setEditId(null);
    setGoalType("loan_volume");
    setMonth(currentMonthKey());
    setValue("");
    setNotes("");
  };

  const handleSave = async () => {
    const num = parseFloat(value.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    await upsertGoal(goalType, month, num, notes);
    reset();
  };

  const handleEdit = (g: typeof goals[number]) => {
    setEditId(g.id);
    setGoalType(g.goalType);
    setMonth(g.month);
    setValue(String(g.targetValue));
    setNotes(g.notes || "");
  };

  // Computa o valor realizado para uma meta
  const computeActual = (type: GoalType, m: string): number => {
    switch (type) {
      case "loan_volume":
        return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m))
          .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
      case "new_loans_count":
        return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m)).length;
      case "received_total":
        return payments.filter((p: any) => inMonth(p.date, m))
          .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
      case "interest_received": {
        return payments.filter((p: any) => inMonth(p.date, m)).reduce((s: number, p: any) => {
          const loan: any = loans.find((l: any) => l.id === p.loan_id);
          if (!loan) return s;
          const principalPerInstall = Number(loan.amount) / Math.max(1, Number(loan.installments) || 1);
          return s + Math.max(0, (Number(p.amount) || 0) - principalPerInstall);
        }, 0);
      }
      case "active_capital":
        return m === currentMonth ? currentActiveCapital : (getSnapshotAmount(m) ?? 0);
      case "net_profit": {
        const interest = payments.filter((p: any) => inMonth(p.date, m)).reduce((s: number, p: any) => {
          const loan: any = loans.find((l: any) => l.id === p.loan_id);
          if (!loan) return s;
          const principalPerInstall = Number(loan.amount) / Math.max(1, Number(loan.installments) || 1);
          return s + Math.max(0, (Number(p.amount) || 0) - principalPerInstall);
        }, 0);
        const exp = expenses.filter((e: any) => e.paid && e.scope !== "personal" && inMonth(e.paid_date || e.paidDate || e.due_date || e.dueDate, m))
          .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
        return interest - exp;
      }
      case "max_default_rate": {
        // % de parcelas vencidas e não pagas até hoje
        const today = new Date().toISOString().slice(0, 10);
        let total = 0, late = 0;
        loans.forEach((l: any) => {
          const inst = Number(l.installments) || 1;
          const paid = Number(l.paidInstallments ?? l.paid_installments) || 0;
          total += inst;
          // estimativa simples: parcelas vencidas baseadas em dueDate + paid
          const due = (l.dueDate || l.due_date || "").slice(0, 10);
          if (due && due < today) {
            const overdue = Math.max(0, inst - paid);
            late += overdue;
          }
        });
        return total === 0 ? 0 : (late / total) * 100;
      }
      case "new_clients_count":
        return clients.filter((c: any) => inMonth(c.created_at || c.createdAt, m)).length;
      case "interest_rate": {
        const monthLoans = loans.filter((l: any) => inMonth(l.startDate || l.start_date, m));
        if (monthLoans.length === 0) return 0;
        const sum = monthLoans.reduce((s: number, l: any) => s + (Number(l.interestRate ?? l.interest_rate) || 0), 0);
        return sum / monthLoans.length;
      }
      case "profit": {
        // Aproximação: % lucro líquido do mês sobre meta cadastrada
        return 0;
      }
      default:
        return 0;
    }
  };

  const enrichedGoals = useMemo(() =>
    goals.map((g) => {
      const meta = GOAL_TYPE_META[g.goalType];
      const actual = computeActual(g.goalType, g.month);
      let pct = 0;
      if (g.targetValue > 0) {
        pct = meta?.inverse
          ? Math.max(0, 100 - (actual / g.targetValue) * 100)
          : Math.min(100, (actual / g.targetValue) * 100);
      }
      return { ...g, actual, pct };
    }),
    [goals, loans, payments, clients, expenses]
  );

  // Helpers de mês
  const shiftMonthKey = (m: string, delta: number) => {
    const [y, mm] = m.split("-").map(Number);
    const d = new Date(y, mm - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const prevMonthKey = (m: string) => shiftMonthKey(m, -1);
  const goPrevMonth = () => setFilterMonth((m) => shiftMonthKey(m, -1));
  const goNextMonth = () => setFilterMonth((m) => shiftMonthKey(m, 1));

  // Agrupa metas do mês filtrado pelo tipo (nome)
  const groupedGoals = useMemo(() => {
    const filtered = enrichedGoals.filter((g) => g.month === filterMonth);
    const map = new Map<GoalType, typeof enrichedGoals>();
    filtered.forEach((g) => {
      const arr = map.get(g.goalType) || [];
      arr.push(g);
      map.set(g.goalType, arr);
    });
    return Array.from(map.entries()).map(([type, items]) => ({
      type,
      items: [...items].sort((a, b) => b.month.localeCompare(a.month)),
    }));
  }, [enrichedGoals, filterMonth]);

  // Tipos cadastrados no mês anterior mas não no atual filtrado
  const prevMonth = prevMonthKey(filterMonth);
  const missingFromPrev = useMemo(() => {
    const currentTypes = new Set(goals.filter((g) => g.month === filterMonth).map((g) => g.goalType));
    return goals.filter((g) => g.month === prevMonth && !currentTypes.has(g.goalType));
  }, [goals, filterMonth, prevMonth]);

  const copyFromPrevMonth = async () => {
    if (missingFromPrev.length === 0) {
      toast.info("Nenhuma meta nova para copiar do mês anterior");
      return;
    }
    for (const g of missingFromPrev) {
      await upsertGoal(g.goalType, filterMonth, g.targetValue, g.notes || undefined);
    }
    toast.success(`${missingFromPrev.length} meta(s) copiada(s) do mês anterior`);
  };

  const selectedMeta = GOAL_TYPE_META[goalType];

  return (
    <div className="space-y-4">
      {!readOnly && (
      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">{editId ? "Editar Meta" : "Nova Meta"}</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de meta</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)} disabled={!!editId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {ALL_TYPES.map((t) => {
                    const m = GOAL_TYPE_META[t];
                    const Icon = m.icon;
                    return (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          <Icon className={`h-3.5 w-3.5 ${m.color}`} /> {m.label} <span className="text-xs text-muted-foreground">({m.unit})</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{selectedMeta.description}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Mês/Ano</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={!!editId} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor da meta ({selectedMeta.unit})</Label>
              <Input
                type="number"
                step={selectedMeta.unit === "qtd" ? "1" : "0.01"}
                placeholder={selectedMeta.unit === "R$" ? "Ex: 10000" : selectedMeta.unit === "%" ? "Ex: 15" : "Ex: 5"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={!value}>
              <Plus className="h-4 w-4" /> {editId ? "Salvar" : "Criar Meta"}
            </Button>
            {editId && <Button variant="outline" onClick={reset}>Cancelar</Button>}
          </div>
        </CardContent>
      </Card>
      )}

      <Card no3d>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <h3 className="font-semibold text-foreground">Metas cadastradas</h3>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Mês:</Label>
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="h-8 w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {availableMonths.map((m) => (
                      <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyFromPrevMonth}
                  disabled={missingFromPrev.length === 0}
                  title={missingFromPrev.length === 0 ? "Nada novo para copiar do mês anterior" : `Copiar ${missingFromPrev.length} meta(s) de ${formatMonthLabel(prevMonth)}`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar do mês anterior
                  {missingFromPrev.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{missingFromPrev.length}</Badge>
                  )}
                </Button>
              )}
            </div>
          </div>
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && groupedGoals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma meta cadastrada para {formatMonthLabel(filterMonth)}.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {groupedGoals.map(({ type, items }) => {
              const meta = GOAL_TYPE_META[type];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <div
                  key={type}
                  className="rounded-2xl p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] backdrop-blur-sm transition-all duration-300 hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] flex flex-col"
                >
                  <div className="flex items-center justify-center mb-2">
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                      <Icon className={`h-4 w-4 ${meta.color}`} />
                    </div>
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center leading-tight">
                    {meta.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground text-center mt-0.5">
                    {items.length} {items.length === 1 ? "meta" : "metas"}
                  </p>

                  <div className="mt-3 space-y-2 flex-1">
                    {items.map((g) => {
                      const targetStr = fmtValue(g.targetValue, meta.unit, hidden);
                      const actualStr = fmtValue(g.actual, meta.unit, hidden);
                      const pctRound = Math.round(g.pct);
                      const reached = meta.inverse ? g.actual <= g.targetValue : g.actual >= g.targetValue;
                      return (
                        <div key={g.id} className="rounded-lg border border-border/30 bg-muted/20 p-2 space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {formatMonthLabel(g.month)}
                            </Badge>
                            {!readOnly && (
                              <div className="flex gap-0.5 shrink-0">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEdit(g)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(g.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground">Meta</span>
                            <span className={`text-xs font-bold ${meta.color} truncate`}>{targetStr}</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground">Real</span>
                            <span className="text-xs font-semibold text-foreground truncate">{actualStr}</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-end text-[10px]">
                              <span className={reached ? "text-success font-semibold" : "text-muted-foreground"}>
                                {pctRound}% {reached && "✓"}
                              </span>
                            </div>
                            <Progress value={Math.max(0, Math.min(100, g.pct))} className="h-1" />
                          </div>
                          {g.notes && (
                            <p className="text-[10px] text-muted-foreground truncate" title={g.notes}>
                              {g.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
        onConfirm={() => { if (deleteId) { deleteGoal(deleteId); setDeleteId(null); } }}
        title="Excluir meta"
        description="Tem certeza que deseja excluir esta meta?"
      />
    </div>
  );
}
