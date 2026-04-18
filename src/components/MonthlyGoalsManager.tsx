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
  HandCoins, Coins, Wallet, PiggyBank, AlertTriangle, UserPlus,
} from "lucide-react";
import { useMonthlyGoals, GoalType, currentMonthKey, formatMonthLabel } from "@/hooks/useMonthlyGoals";
import { useLoans } from "@/hooks/useLoans";
import { useClients } from "@/hooks/useClients";
import { useExpenses } from "@/hooks/useExpenses";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useHideValues } from "@/contexts/HideValuesContext";

type Unit = "%" | "R$" | "qtd";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: Unit; color: string; description: string; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal",            icon: Percent,       unit: "%",   color: "text-warning",     description: "Meta da taxa média de juros aplicada nos contratos." },
  profit:             { label: "Lucro do Período (% do Previsto)", icon: TrendingUp,    unit: "%",   color: "text-success",     description: "Quanto do lucro previsto foi efetivamente realizado." },
  loan_volume:        { label: "Volume Emprestado no Mês",         icon: Banknote,      unit: "R$",  color: "text-primary",     description: "Soma do valor de novos empréstimos criados no mês." },
  new_loans_count:    { label: "Novos Empréstimos no Mês",         icon: FileText,      unit: "qtd", color: "text-primary",     description: "Quantidade de novos contratos criados no mês." },
  received_total:     { label: "Recebimentos no Mês",              icon: HandCoins,     unit: "R$",  color: "text-success",     description: "Soma de todos os pagamentos recebidos no mês." },
  interest_received:  { label: "Juros Recebidos no Mês",           icon: Coins,         unit: "R$",  color: "text-success",     description: "Apenas a parte dos juros dos pagamentos recebidos." },
  active_capital:     { label: "Capital Ativo / em Circulação",    icon: Wallet,        unit: "R$",  color: "text-primary",     description: "Total ainda a receber em contratos ativos." },
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

export function MonthlyGoalsManager() {
  const { goals, upsertGoal, deleteGoal, loading } = useMonthlyGoals();
  const { loans, payments } = useLoans();
  const { clients } = useClients();
  const { expenses } = useExpenses(true);
  const { hidden } = useHideValues();

  const [goalType, setGoalType] = useState<GoalType>("loan_volume");
  const [month, setMonth] = useState(currentMonthKey());
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
        return loans.filter((l: any) => l.status !== "completed")
          .reduce((s: number, l: any) => s + (Number(l.remainingAmount ?? l.remaining_amount) || 0), 0);
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

  const selectedMeta = GOAL_TYPE_META[goalType];

  return (
    <div className="space-y-4">
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

      <Card no3d>
        <CardContent className="p-4">
          <h3 className="font-semibold text-foreground mb-3">Metas cadastradas</h3>
          {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {!loading && enrichedGoals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma meta cadastrada ainda.</p>
          )}
          <div className="space-y-2">
            {enrichedGoals.map((g) => {
              const meta = GOAL_TYPE_META[g.goalType];
              if (!meta) return null;
              const Icon = meta.icon;
              const targetStr = fmtValue(g.targetValue, meta.unit, hidden);
              const actualStr = fmtValue(g.actual, meta.unit, hidden);
              const pctRound = Math.round(g.pct);
              const reached = meta.inverse ? g.actual <= g.targetValue : g.actual >= g.targetValue;
              return (
                <div key={g.id} className="p-3 rounded-lg border border-border/30 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{meta.label}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-[10px]">{formatMonthLabel(g.month)}</Badge>
                          <span className={`text-xs font-bold ${meta.color}`}>Meta: {targetStr}</span>
                        </div>
                        {g.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate">{g.notes}</p>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(g)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(g.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Realizado: <span className="font-semibold text-foreground">{actualStr}</span></span>
                      <span className={reached ? "text-success font-semibold" : "text-muted-foreground"}>
                        {pctRound}% {reached && "✓"}
                      </span>
                    </div>
                    <Progress value={Math.max(0, Math.min(100, g.pct))} className="h-1.5" />
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
