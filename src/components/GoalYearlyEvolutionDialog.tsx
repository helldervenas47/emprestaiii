import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useMonthlyGoals, GoalType } from "@/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/hooks/useGoalSnapshots";
import { computeActual } from "@/components/GoalsCard";
import { Loan, Payment, Expense, Client, InstallmentSchedule, LoanRenegotiation } from "@/types/loan";

type Unit = "%" | "R$" | "qtd";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

interface Props {
  open: boolean;
  onClose: () => void;
  goalType: GoalType;
  goalLabel: string;
  unit: Unit;
  inverse?: boolean;
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: LoanRenegotiation[];
}

function fmt(v: number, unit: Unit, hidden: boolean): string {
  if (!isFinite(v)) return "—";
  if (hidden && unit === "R$") return "R$ ••••";
  if (unit === "R$") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  if (unit === "%") return `${v.toFixed(2).replace(".", ",")}%`;
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(v));
}

function fmtCompact(v: number, unit: Unit): string {
  if (!isFinite(v)) return "—";
  if (unit === "%") return `${v.toFixed(2).replace(".", ",")}%`;
  if (unit === "qtd") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Math.round(v));
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(2).replace(".", ",")}k`;
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

export function GoalYearlyEvolutionDialog({
  open, onClose, goalType, goalLabel, unit, inverse,
  loans, payments, expenses, clients, installmentSchedules, renegotiations,
}: Props) {
  const { hidden } = useHideValues();
  const { goals } = useMonthlyGoals();
  const { getSnapshot } = useGoalSnapshots();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const data = useMemo(() => {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const monthKey = `${year}-${String(m).padStart(2, "0")}`;
      const isClosed = monthKey < currentMonthKey;
      const isFuture = monthKey > currentMonthKey;

      let realized = 0;
      if (!isFuture) {
        const snap = getSnapshot(goalType, monthKey);
        if (isClosed && snap?.finalized && goalType !== "daily_received_avg") {
          realized = Number(snap.realizedValue) || 0;
        } else {
          const v = computeActual(goalType, monthKey, loans, payments, expenses, clients, installmentSchedules, renegotiations);
          realized = isFinite(v) ? v : 0;
        }
      }

      // Meta exata (não herdada) apenas
      const exactGoal = goals.find((g) => g.goalType === goalType && g.month === monthKey);
      const hasValidGoal = !!exactGoal;
      const target = exactGoal ? Number(exactGoal.targetValue) || 0 : 0;

      const diff = inverse ? target - realized : realized - target;
      const pct = target > 0 ? (realized / target) * 100 : 0;

      return {
        month: MONTH_LABELS[i],
        monthFull: MONTH_FULL[i],
        realized,
        target,
        diff,
        pct,
        isFuture,
        hasValidGoal,
      };
    });
  }, [year, goalType, loans, payments, expenses, clients, installmentSchedules, renegotiations, goals, getSnapshot, inverse]);

  const totals = useMemo(() => {
    const valid = data.filter((d) => d.hasValidGoal && !d.isFuture);
    const n = valid.length;
    const realizedAvg = n > 0 ? valid.reduce((s, d) => s + d.realized, 0) / n : 0;
    const targetAvg = n > 0 ? valid.reduce((s, d) => s + d.target, 0) / n : 0;
    const attainmentPct = targetAvg > 0 ? (realizedAvg / targetAvg) * 100 : 0;
    return { realizedAvg, targetAvg, attainmentPct, activeMonths: n };
  }, [data]);


  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg truncate">Evolução Anual · {goalLabel}</DialogTitle>
              <DialogDescription className="text-xs">
                Comparativo mês a mês entre o realizado (barras) e a meta (linha).
              </DialogDescription>
            </div>
          </div>

          {/* Year selector */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[110px] text-center rounded-lg border border-border bg-card px-4 py-1.5">
              <span className="text-lg font-bold text-foreground tabular-nums">{year}</span>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {year !== currentYear && (
              <Button variant="ghost" size="sm" className="h-9 text-xs ml-2" onClick={() => setYear(currentYear)}>
                Hoje
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-3 sm:px-6 py-4 space-y-4">
          {/* Totais rápidos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Realizado no ano (média)</p>
              <p className="text-sm sm:text-base font-bold text-success mt-1">{fmt(totals.realizedAvg, unit, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meta acumulada (média)</p>
              <p className="text-sm sm:text-base font-bold text-foreground mt-1">{fmt(totals.targetAvg, unit, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meses considerados</p>
              <p className="text-sm sm:text-base font-bold text-primary mt-1">{totals.activeMonths} de 12</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Resultado anual</p>
              <p className={`text-sm sm:text-base font-bold mt-1 ${totals.attainmentPct >= 100 ? "text-success" : "text-destructive"}`}>
                {totals.targetAvg > 0 ? `${totals.attainmentPct.toFixed(2)}% da meta` : "—"}
              </p>
            </div>
          </div>


          {/* Gráfico */}
          <div className="rounded-lg border border-border bg-card p-2 sm:p-4">
            <div className="w-full h-[340px] sm:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="goalBarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tickFormatter={(v: number) => fmtCompact(v, unit)}
                    width={60}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d: any = payload[0].payload;
                      const okColor = inverse ? (d.realized <= d.target ? "text-success" : "text-destructive")
                                              : (d.realized >= d.target ? "text-success" : "text-destructive");
                      return (
                        <div className="rounded-md border border-border bg-popover shadow-lg p-3 text-xs min-w-[180px]">
                          <div className="font-semibold text-foreground mb-1.5">{d.monthFull}</div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Realizado</span>
                            <span className="font-semibold text-primary">{fmt(d.realized, unit, hidden)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Meta</span>
                            <span className="font-semibold text-foreground">{fmt(d.target, unit, hidden)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Atingimento</span>
                            <span className={`font-semibold ${okColor}`}>{d.target > 0 ? `${d.pct.toFixed(1)}%` : "—"}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Diferença</span>
                            <span className={`font-semibold ${d.diff >= 0 ? "text-success" : "text-destructive"}`}>
                              {d.diff >= 0 ? "+" : ""}{fmt(d.diff, unit, hidden)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}
                    iconType="circle"
                  />
                  <Bar
                    dataKey="realized"
                    name="Realizado"
                    fill="url(#goalBarFill)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    animationDuration={600}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Meta"
                    stroke="hsl(var(--success))"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "hsl(var(--success))", strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    animationDuration={700}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center italic">
            Passe o mouse (ou toque) sobre um mês para ver o detalhamento completo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
