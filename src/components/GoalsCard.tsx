import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useMonthlyGoals, GoalType, formatMonthLabel } from "@/hooks/useMonthlyGoals";
import { Loan, Payment, Expense, Client } from "@/types/loan";
import {
  Target, Percent, TrendingUp, Banknote, FileText,
  HandCoins, Coins, Wallet, PiggyBank, AlertTriangle, UserPlus,
  Sparkles, CheckCircle2, AlertCircle, TrendingDown, Lightbulb,
} from "lucide-react";

type Unit = "%" | "R$" | "qtd";

const GOAL_TYPE_META: Record<GoalType, { label: string; icon: any; unit: Unit; color: string; bgColor: string; description: string; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal",            icon: Percent,       unit: "%",   color: "text-warning",     bgColor: "bg-warning/15",     description: "Meta da taxa média de juros aplicada nos contratos." },
  profit:             { label: "Lucro do Período",                 icon: TrendingUp,    unit: "%",   color: "text-success",     bgColor: "bg-success/15",     description: "Quanto do lucro previsto foi efetivamente realizado." },
  loan_volume:        { label: "Volume Emprestado",                icon: Banknote,      unit: "R$",  color: "text-primary",     bgColor: "bg-primary/15",     description: "Soma do valor de novos empréstimos criados no mês." },
  new_loans_count:    { label: "Novos Empréstimos",                icon: FileText,      unit: "qtd", color: "text-primary",     bgColor: "bg-primary/15",     description: "Quantidade de novos contratos criados no mês." },
  received_total:     { label: "Recebimentos no Mês",              icon: HandCoins,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Soma de todos os pagamentos recebidos no mês." },
  interest_received:  { label: "Juros Recebidos",                  icon: Coins,         unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Apenas a parte dos juros dos pagamentos recebidos." },
  active_capital:     { label: "Capital Ativo",                    icon: Wallet,        unit: "R$",  color: "text-primary",     bgColor: "bg-primary/15",     description: "Total ainda a receber em contratos ativos." },
  net_profit:         { label: "Lucro Líquido",                    icon: PiggyBank,     unit: "R$",  color: "text-success",     bgColor: "bg-success/15",     description: "Juros recebidos menos despesas pagas da empresa." },
  max_default_rate:   { label: "Inadimplência Máxima",             icon: AlertTriangle, unit: "%",   color: "text-destructive", bgColor: "bg-destructive/15", description: "Limite máximo de % de parcelas em atraso (meta inversa).", inverse: true },
  new_clients_count:  { label: "Novos Clientes",                   icon: UserPlus,      unit: "qtd", color: "text-primary",     bgColor: "bg-primary/15",     description: "Clientes cadastrados no período." },
};

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  selectedMonth?: string; // YYYY-MM — filtra metas exibidas (exceto active_capital)
  periodLabel?: string;
}

// Metas que NÃO devem ser filtradas pelo mês (sempre visíveis)
const ALWAYS_VISIBLE_GOALS: GoalType[] = ["active_capital"];

function inMonth(dateStr: string | undefined | null, month: string): boolean {
  if (!dateStr) return false;
  return String(dateStr).slice(0, 7) === month;
}

function fmtValue(v: number, unit: Unit, hidden: boolean): string {
  if (hidden && unit === "R$") return "R$ ••••";
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  if (unit === "%") return `${v.toFixed(1)}%`;
  return String(Math.round(v));
}

function computeActual(
  type: GoalType,
  m: string,
  loans: Loan[],
  payments: Payment[],
  expenses: Expense[],
  clients: Client[]
): number {
  switch (type) {
    case "loan_volume":
      return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m))
        .reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0);
    case "new_loans_count":
      return loans.filter((l: any) => inMonth(l.startDate || l.start_date, m)).length;
    case "received_total":
      return payments.filter((p: any) => inMonth(p.date, m))
        .reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    case "interest_received":
      return payments.filter((p: any) => inMonth(p.date, m)).reduce((s: number, p: any) => {
        const loan: any = loans.find((l: any) => l.id === (p as any).loanId || l.id === (p as any).loan_id);
        if (!loan) return s;
        const principalPerInstall = Number(loan.amount) / Math.max(1, Number(loan.installments) || 1);
        return s + Math.max(0, (Number(p.amount) || 0) - principalPerInstall);
      }, 0);
    case "active_capital":
      return loans.filter((l: any) => l.status !== "completed" && l.status !== "paid")
        .reduce((s: number, l: any) => s + (Number(l.remainingAmount ?? l.remaining_amount) || 0), 0);
    case "net_profit": {
      const interest = payments.filter((p: any) => inMonth(p.date, m)).reduce((s: number, p: any) => {
        const loan: any = loans.find((l: any) => l.id === (p as any).loanId || l.id === (p as any).loan_id);
        if (!loan) return s;
        const principalPerInstall = Number(loan.amount) / Math.max(1, Number(loan.installments) || 1);
        return s + Math.max(0, (Number(p.amount) || 0) - principalPerInstall);
      }, 0);
      const exp = expenses.filter((e: any) => e.paid && e.scope !== "personal" && inMonth(e.paid_date || e.paidDate || e.due_date || e.dueDate, m))
        .reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
      return interest - exp;
    }
    case "max_default_rate": {
      const today = new Date().toISOString().slice(0, 10);
      let total = 0, late = 0;
      loans.forEach((l: any) => {
        const inst = Number(l.installments) || 1;
        const paid = Number(l.paidInstallments ?? l.paid_installments) || 0;
        total += inst;
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
    case "profit":
      return 0;
    default:
      return 0;
  }
}

export function GoalsCard({ loans, payments, expenses, clients, selectedMonth, periodLabel }: Props) {
  const { goals } = useMonthlyGoals();
  const { hidden } = useHideValues();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const enriched = useMemo(() => {
    // Filtra pelo mês selecionado, exceto metas sempre visíveis (ex: capital ativo)
    const filtered = selectedMonth
      ? goals.filter((g) => g.month === selectedMonth || ALWAYS_VISIBLE_GOALS.includes(g.goalType))
      : goals;
    // Para metas "sempre visíveis", usa o mês selecionado para o cálculo (snapshot atual)
    return filtered.map((g) => {
      const meta = GOAL_TYPE_META[g.goalType];
      const computeMonth = ALWAYS_VISIBLE_GOALS.includes(g.goalType) && selectedMonth ? selectedMonth : g.month;
      const actual = computeActual(g.goalType, computeMonth, loans, payments, expenses, clients);
      let pct = 0;
      if (g.targetValue > 0) {
        pct = meta?.inverse
          ? Math.max(0, 100 - (actual / g.targetValue) * 100)
          : Math.min(100, (actual / g.targetValue) * 100);
      }
      return { ...g, actual, pct, meta };
    }).sort((a, b) => b.month.localeCompare(a.month));
  }, [goals, loans, payments, expenses, clients, selectedMonth]);

  const totalGoals = enriched.length;
  const onTrack = enriched.filter((g) => g.pct >= 80).length;
  const offTrack = enriched.filter((g) => g.pct < 50).length;

  const selected = enriched.find((g) => g.id === selectedGoalId) || null;

  return (
    <Card no3d>
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col items-center text-center gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Metas</h3>
              <p className="text-[10px] text-muted-foreground">Acompanhe o progresso das suas metas cadastradas</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:gap-6">
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">No Caminho</p>
              <p className="text-xs sm:text-sm font-bold text-success leading-tight">{onTrack}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Atenção</p>
              <p className="text-xs sm:text-sm font-bold text-destructive leading-tight">{offTrack}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Total</p>
              <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{totalGoals}</p>
            </div>
          </div>
        </div>

        {enriched.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            {selectedMonth
              ? `Nenhuma meta cadastrada para ${periodLabel || formatMonthLabel(selectedMonth)}.`
              : "Nenhuma meta cadastrada. Cadastre metas em Configurações → Metas para acompanhar aqui."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {enriched.map((g) => {
              const Icon = g.meta?.icon || Target;
              const status = g.pct >= 80 ? "success" : g.pct >= 50 ? "warning" : "destructive";
              const statusColor =
                status === "success" ? "text-success" : status === "warning" ? "text-warning" : "text-destructive";
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGoalId(g.id)}
                  className="rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm transition-all p-2.5 sm:p-4 flex flex-col items-center text-center gap-2 sm:gap-3 sm:items-stretch sm:text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-md ${g.meta?.bgColor || "bg-primary/15"} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${g.meta?.color || "text-primary"}`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground leading-tight break-words sm:truncate" title={g.meta?.label}>
                        {g.meta?.label || g.goalType}
                      </p>
                      <div className="flex items-center justify-center sm:justify-start gap-1 mt-0.5 flex-wrap">
                        {ALWAYS_VISIBLE_GOALS.includes(g.goalType) ? (
                          <Badge variant="outline" className="text-[8px] sm:text-[9px] px-1 py-0 h-3.5 border-primary/40 text-primary bg-primary/5 uppercase tracking-wide leading-none">
                            Sempre
                          </Badge>
                        ) : (
                          <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">
                            {formatMonthLabel(g.month)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full sm:items-stretch">
                    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Meta</span>
                      <span className="text-xs sm:text-sm font-semibold text-foreground break-all sm:break-normal">
                        {fmtValue(g.targetValue, g.meta?.unit || "qtd", hidden)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Realizado</span>
                      <span className={`text-xs sm:text-sm font-semibold ${statusColor} break-all sm:break-normal`}>
                        {fmtValue(g.actual, g.meta?.unit || "qtd", hidden)}
                      </span>
                    </div>
                    <div className="border-t border-border w-full my-0.5 sm:my-1" />
                    <div className="w-full">
                      <Progress value={g.pct} className="h-1.5" />
                      <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between mt-1">
                        <span className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">Progresso</span>
                        <span className={`text-sm sm:text-base font-bold ${statusColor} break-all sm:break-normal`}>
                          {g.pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
          Toque em uma meta para abrir o relatório inteligente com análise e sugestões.
        </p>
      </CardContent>

      <GoalDetailDialog
        open={!!selected}
        onClose={() => setSelectedGoalId(null)}
        goal={selected}
      />
    </Card>
  );
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  goal: (ReturnType<typeof useMonthlyGoals>["goals"][number] & { actual: number; pct: number; meta: typeof GOAL_TYPE_META[GoalType] }) | null;
}

function GoalDetailDialog({ open, onClose, goal }: DialogProps) {
  const { hidden } = useHideValues();

  const analysis = useMemo(() => {
    if (!goal) return null;
    const { meta, actual, targetValue, pct, month } = goal;
    const unit = meta.unit;
    const inverse = !!meta.inverse;
    const diff = inverse ? targetValue - actual : actual - targetValue;
    const diffPct = targetValue > 0 ? (Math.abs(diff) / targetValue) * 100 : 0;

    // Determinação do status
    let status: "excellent" | "ontrack" | "warning" | "critical";
    if (pct >= 100) status = "excellent";
    else if (pct >= 80) status = "ontrack";
    else if (pct >= 50) status = "warning";
    else status = "critical";

    // Verificação de mês corrente vs passado
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const isCurrentMonth = month === currentMonth;
    const isPastMonth = month < currentMonth;

    // Dias restantes / decorridos no mês
    let dayProgressPct = 100;
    let daysLeft = 0;
    if (isCurrentMonth) {
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      const dayOfMonth = today.getDate();
      dayProgressPct = (dayOfMonth / daysInMonth) * 100;
      daysLeft = daysInMonth - dayOfMonth;
    }

    // Análise de "ritmo": estamos atrás, no ritmo, ou à frente do tempo?
    let pace: "ahead" | "ontrack" | "behind" | null = null;
    let projection: number | null = null;
    if (isCurrentMonth && !inverse && targetValue > 0) {
      const expectedPctByNow = dayProgressPct;
      if (pct >= expectedPctByNow + 10) pace = "ahead";
      else if (pct >= expectedPctByNow - 10) pace = "ontrack";
      else pace = "behind";
      projection = dayProgressPct > 0 ? (actual / dayProgressPct) * 100 : actual;
    }

    // Pontos de melhoria & sugestões
    const insights: { icon: any; type: "positive" | "warning" | "negative" | "info"; text: string }[] = [];

    if (status === "excellent") {
      insights.push({ icon: CheckCircle2, type: "positive", text: `Meta superada em ${fmtValue(Math.abs(diff), unit, false)}! Excelente desempenho.` });
    } else if (status === "ontrack") {
      insights.push({ icon: CheckCircle2, type: "positive", text: `Você está no caminho certo (${pct.toFixed(0)}% da meta atingida).` });
    } else if (status === "warning") {
      insights.push({ icon: AlertCircle, type: "warning", text: `Atenção: progresso de ${pct.toFixed(0)}% — precisa acelerar para bater a meta.` });
    } else {
      insights.push({ icon: AlertCircle, type: "negative", text: `Crítico: apenas ${pct.toFixed(0)}% da meta atingida. Revise a estratégia.` });
    }

    if (pace === "ahead") {
      insights.push({ icon: TrendingUp, type: "positive", text: `Ritmo acima do esperado: ${pct.toFixed(0)}% atingido com ${dayProgressPct.toFixed(0)}% do mês decorrido.` });
    } else if (pace === "behind") {
      insights.push({ icon: TrendingDown, type: "warning", text: `Ritmo abaixo do esperado: ${pct.toFixed(0)}% atingido com ${dayProgressPct.toFixed(0)}% do mês decorrido.` });
    } else if (pace === "ontrack") {
      insights.push({ icon: TrendingUp, type: "info", text: `Ritmo alinhado com o tempo decorrido do mês.` });
    }

    if (isCurrentMonth && projection !== null && targetValue > 0) {
      const projPct = (projection / targetValue) * 100;
      if (projPct >= 100) {
        insights.push({ icon: Sparkles, type: "positive", text: `Projeção: ${fmtValue(projection, unit, false)} ao fim do mês (${projPct.toFixed(0)}% da meta).` });
      } else {
        insights.push({ icon: Sparkles, type: "warning", text: `Projeção atual: ${fmtValue(projection, unit, false)} (${projPct.toFixed(0)}% da meta) se mantiver o ritmo.` });
      }
    }

    if (isCurrentMonth && status !== "excellent" && daysLeft > 0 && targetValue > 0) {
      const remaining = Math.max(0, targetValue - actual);
      const perDay = remaining / daysLeft;
      if (unit === "R$") {
        insights.push({ icon: Lightbulb, type: "info", text: `Faltam ${fmtValue(remaining, unit, false)} em ${daysLeft} dias — meta diária de ${fmtValue(perDay, unit, false)}.` });
      } else if (unit === "qtd") {
        insights.push({ icon: Lightbulb, type: "info", text: `Faltam ${Math.ceil(remaining)} em ${daysLeft} dias.` });
      }
    }

    if (isPastMonth) {
      if (status === "excellent" || status === "ontrack") {
        insights.push({ icon: CheckCircle2, type: "positive", text: `Mês encerrado com sucesso. Use essa meta como referência para os próximos.` });
      } else {
        insights.push({ icon: AlertCircle, type: "negative", text: `Mês encerrado abaixo do esperado. Considere ajustar a estratégia ou rever a meta.` });
      }
    }

    // Sugestões específicas por tipo de meta
    const suggestions: string[] = [];
    if (status !== "excellent" && status !== "ontrack") {
      switch (goal.goalType) {
        case "loan_volume":
        case "new_loans_count":
          suggestions.push("Intensifique a prospecção de novos clientes e acompanhamento de leads.");
          suggestions.push("Revise as taxas e condições oferecidas para atrair mais contratos.");
          break;
        case "received_total":
        case "interest_received":
          suggestions.push("Reforce a cobrança de parcelas em atraso na aba Cobranças.");
          suggestions.push("Revise contratos com inadimplência recorrente.");
          break;
        case "net_profit":
          suggestions.push("Reduza despesas operacionais não essenciais.");
          suggestions.push("Aumente a margem de juros nos novos contratos.");
          break;
        case "max_default_rate":
          suggestions.push("Ative notificações de cobrança automáticas.");
          suggestions.push("Revise critérios de aprovação de novos empréstimos.");
          break;
        case "new_clients_count":
          suggestions.push("Invista em divulgação e programas de indicação.");
          break;
        case "interest_rate":
          suggestions.push("Ajuste a política de juros padrão nos novos contratos.");
          break;
        case "active_capital":
          suggestions.push("Reaplique o capital recebido em novos empréstimos.");
          break;
      }
    }

    return { status, diff, diffPct, isCurrentMonth, isPastMonth, dayProgressPct, daysLeft, pace, projection, insights, suggestions };
  }, [goal]);

  if (!goal || !analysis) return null;

  const Icon = goal.meta.icon;
  const statusBadge = {
    excellent: { label: "Meta superada", className: "bg-success/15 text-success border-success/30" },
    ontrack: { label: "No caminho", className: "bg-success/15 text-success border-success/30" },
    warning: { label: "Atenção", className: "bg-warning/15 text-warning border-warning/30" },
    critical: { label: "Crítico", className: "bg-destructive/15 text-destructive border-destructive/30" },
  }[analysis.status];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-lg ${goal.meta.bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`h-5 w-5 ${goal.meta.color}`} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base truncate">{goal.meta.label}</DialogTitle>
              <DialogDescription className="text-xs">
                {formatMonthLabel(goal.month)} · {goal.meta.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-2">
            {/* Resumo */}
            <Card no3d className="bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                  <span className={`text-2xl font-bold ${goal.pct >= 80 ? "text-success" : goal.pct >= 50 ? "text-warning" : "text-destructive"}`}>
                    {goal.pct.toFixed(0)}%
                  </span>
                </div>
                <Progress value={goal.pct} className="h-2 mb-3" />
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Meta</p>
                    <p className="text-sm font-bold">{fmtValue(goal.targetValue, goal.meta.unit, hidden)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Realizado</p>
                    <p className={`text-sm font-bold ${goal.pct >= 80 ? "text-success" : goal.pct >= 50 ? "text-warning" : "text-destructive"}`}>
                      {fmtValue(goal.actual, goal.meta.unit, hidden)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">{goal.meta.inverse ? "Folga" : "Diferença"}</p>
                    <p className={`text-sm font-bold ${analysis.diff >= 0 ? "text-success" : "text-destructive"}`}>
                      {analysis.diff >= 0 ? "+" : ""}{fmtValue(analysis.diff, goal.meta.unit, hidden)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progresso temporal */}
            {analysis.isCurrentMonth && (
              <Card no3d>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" /> Progresso do Mês
                  </h4>
                  <Progress value={analysis.dayProgressPct} className="h-1.5 mb-2" />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{analysis.dayProgressPct.toFixed(0)}% do mês decorrido</span>
                    <span>{analysis.daysLeft} dias restantes</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Insights */}
            <Card no3d>
              <CardContent className="p-4">
                <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Análise Inteligente
                </h4>
                <div className="space-y-2">
                  {analysis.insights.map((ins, i) => {
                    const InsIcon = ins.icon;
                    const colorMap = {
                      positive: "text-success bg-success/10 border-success/20",
                      warning: "text-warning bg-warning/10 border-warning/20",
                      negative: "text-destructive bg-destructive/10 border-destructive/20",
                      info: "text-primary bg-primary/10 border-primary/20",
                    };
                    return (
                      <div key={i} className={`flex items-start gap-2 p-2 rounded-md border ${colorMap[ins.type]}`}>
                        <InsIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <p className="text-xs leading-snug">{ins.text}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Sugestões */}
            {analysis.suggestions.length > 0 && (
              <Card no3d className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-primary" /> Sugestões de Ajuste
                  </h4>
                  <ul className="space-y-1.5">
                    {analysis.suggestions.map((s, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {goal.notes && (
              <Card no3d>
                <CardContent className="p-4">
                  <h4 className="text-xs font-semibold text-foreground mb-2">Notas</h4>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{goal.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
