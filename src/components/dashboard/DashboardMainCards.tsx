import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Wallet, Calendar, Check, X, Eye, ArrowDownToLine, DollarSign, Banknote, Smartphone,
  Percent, ChevronDown, Target, TrendingUp, Info,
} from "lucide-react";
import { calculateMonthlyInterestRate } from "@/lib/monthlyInterestRate";
import { calculateTotalWithInterest } from "@/hooks/useLoans";
import {
  isInRange, monthNames, rawFormatCurrency,
} from "@/components/dashboard/dashboardHelpers";
import type { Loan } from "@/types/loan";

type GoalLike = { targetValue: number } | null | undefined;

interface Props {
  readOnly: boolean;
  // Saldo
  accountBalance: number;
  editingBalance: boolean;
  tempBalance: string;
  setTempBalance: (v: string) => void;
  saveBalance: () => void;
  cancelEditBalance: () => void;
  // Recebido
  receivedByMethod: {
    total: number;
    unassigned: number;
    items: Array<{ id: string; name: string; amount: number }>;
  };
  setReceivedDetailMethodId: (id: string | null) => void;
  // Taxa de Juros
  data: {
    monthlyInterestRate: { hasData: boolean; rate: number | null };
    loanCount: number;
    filteredLoans: Loan[];
    periodProfitRealized: number;
    periodProfitExpected: number;
    periodProfitPct: number;
  };
  portfolio: {
    forecastSunday: number;
    forecastEndMonth: number;
    globalInterestRate: number;
  };
  range: { label: string; start: Date };
  expandedBreakdown: string | null;
  setExpandedBreakdown: (v: string | null) => void;
  interestGoal: GoalLike;
  profitGoal: GoalLike;
  profitTargetAmount: number;
  loans: Loan[];
  getGoal: (key: string, monthKey: string) => GoalLike;
  formatCurrency: (v: number) => string;
}

export function DashboardMainCards({
  readOnly,
  accountBalance,
  editingBalance,
  tempBalance,
  setTempBalance,
  saveBalance,
  cancelEditBalance,
  receivedByMethod,
  setReceivedDetailMethodId,
  data,
  portfolio,
  range,
  expandedBreakdown,
  setExpandedBreakdown,
  interestGoal,
  profitGoal,
  profitTargetAmount,
  loans,
  getGoal,
  formatCurrency,
}: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-5 items-stretch">
      {/* Saldo em Conta */}
      <Card no3d className="animate-fade-in h-full" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
        <CardContent className="p-4 h-full relative flex flex-col">
          {!readOnly && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver extrato" onClick={() => window.dispatchEvent(new CustomEvent("open-ledger"))}>
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          )}
          <div className="flex items-center justify-center">
            <div className="text-center flex-col flex items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mb-1">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">Saldo em Conta</p>
              {editingBalance ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Input type="number" value={tempBalance} onChange={(e) => setTempBalance(e.target.value)}
                    className="h-7 w-32 text-sm" onKeyDown={(e) => e.key === "Enter" && saveBalance()} autoFocus />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveBalance}><Check className="h-3.5 w-3.5 text-success" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditBalance}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              ) : (
                <p className={`text-lg md:text-xl font-bold tabular-nums ${accountBalance < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(accountBalance)}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 flex-1">
            <div className="bg-muted/50 rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center min-h-[72px] md:min-h-[88px] md:h-[88px]">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="h-3 w-3 text-primary" />
                <p className="text-[10px] text-muted-foreground">Domingo</p>
              </div>
              <p className={`text-sm font-semibold tabular-nums ${(accountBalance + portfolio.forecastSunday) < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(accountBalance + portfolio.forecastSunday)}</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center min-h-[72px] md:min-h-[88px] md:h-[88px]">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="h-3 w-3 text-primary" />
                <p className="text-[10px] text-muted-foreground">Fim do Mês</p>
              </div>
              <p className={`text-sm font-semibold tabular-nums ${(accountBalance + portfolio.forecastEndMonth) < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(accountBalance + portfolio.forecastEndMonth)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Valores Recebidos — dinâmico conforme filtro de período */}
      <Card no3d className="animate-fade-in h-full" style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}>
        <CardContent className="p-4 h-full relative flex flex-col">
          <div className="flex items-center justify-center">
            <div className="text-center flex-col flex items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0 mb-1">
                <ArrowDownToLine className="h-5 w-5 text-success" />
              </div>
              <p className="text-xs text-muted-foreground">Valores Recebidos</p>
              <p className="text-lg md:text-xl font-bold tabular-nums text-success">{formatCurrency(receivedByMethod.total)}</p>
              
            </div>
          </div>
          <div className="mt-3 flex-1">
            {receivedByMethod.items.length === 0 && receivedByMethod.unassigned <= 0 ? (
              <div className="bg-muted/50 rounded-lg p-3 border border-border/30 text-center">
                <p className="text-[11px] text-muted-foreground">Nenhum pagamento no período</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {receivedByMethod.items.map((it) => {
                  const lower = it.name.toLowerCase();
                  const Icon = lower.includes("pix") ? Smartphone
                    : lower.includes("dinheiro") ? Banknote
                    : DollarSign;
                  const displayName = lower.includes("pix") ? "Pix"
                    : lower.includes("dinheiro") ? "Dinheiro"
                    : it.name;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setReceivedDetailMethodId(it.id); }}
                      className="bg-muted/50 hover:bg-muted/80 transition-colors rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center cursor-pointer min-h-[72px] md:min-h-[88px] md:h-[88px]"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3 w-3 text-success" />
                        <p className="text-[10px] text-muted-foreground">{displayName}</p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(it.amount)}</p>
                    </button>
                  );
                })}
                {receivedByMethod.unassigned > 0 && (
                  <button
                    type="button"
                    onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setReceivedDetailMethodId("__unassigned__"); }}
                    className="bg-muted/50 hover:bg-muted/80 transition-colors rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center cursor-pointer min-h-[72px] md:min-h-[88px] md:h-[88px]"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      <p className="text-[10px] text-muted-foreground">Sem forma</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(receivedByMethod.unassigned)}</p>
                  </button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Taxa de Juros Mensal */}
      <Card no3d className="animate-fade-in cursor-pointer h-full" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }} onClick={() => setExpandedBreakdown(expandedBreakdown === "interest-rate" ? null : "interest-rate")}>
        <CardContent className="p-4 h-full relative flex flex-col">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5 text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Taxa de Juros Mensal</p>
              <p className="text-lg md:text-xl font-bold tabular-nums text-foreground">{data.monthlyInterestRate.hasData && data.monthlyInterestRate.rate !== null ? `${data.monthlyInterestRate.rate.toFixed(2)}%` : "Sem dados no período"}</p>
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{data.loanCount} no período</span>
                <span>Geral: <span className="font-bold text-warning">{portfolio.globalInterestRate.toFixed(1)}%</span></span>
              </div>
              {/* Meta */}
              <div className="mt-2 pt-2 border-t border-border/30">
                {interestGoal ? (() => {
                  const currentRate = data.monthlyInterestRate.rate;
                  const hasRate = currentRate !== null;
                  const pct = hasRate && interestGoal.targetValue > 0 ? Math.min(150, (currentRate / interestGoal.targetValue) * 100) : 0;
                  const reached = hasRate && currentRate >= interestGoal.targetValue;
                  const status = reached ? "atingida" : pct >= 80 ? "perto" : "abaixo";
                  const color = reached ? "text-success" : pct >= 80 ? "text-warning" : "text-destructive";
                  return (
                    <>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 text-muted-foreground"><Target className="h-3 w-3" /> Meta: {interestGoal.targetValue.toFixed(1)}%</span>
                        <span className={`font-bold ${hasRate ? color : "text-muted-foreground"}`}>{hasRate ? (status === "atingida" ? "✓ Atingida" : status === "perto" ? "Quase lá" : "Abaixo") : "Sem dados"}</span>
                      </div>
                      <Progress value={Math.min(100, pct)} className="h-1.5 mt-1" />
                    </>
                  );
                })() : (
                  <p className="text-[10px] text-muted-foreground italic flex items-center gap-1"><Target className="h-3 w-3" /> Defina uma meta em Relatórios → Metas</p>
                )}
              </div>
              {/* Histórico — últimos 2 meses */}
              <div className="mt-3 pt-2 border-t border-border/30 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                {[2, 1].map((monthsAgo) => {
                  const base = range.start;
                  const d = new Date(base.getFullYear(), base.getMonth(), 1);
                  d.setMonth(d.getMonth() - monthsAgo);
                  const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
                  const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
                  const mLoans = loans.filter((l) => isInRange(l.startDate, mStart, mEnd));
                  const summary = calculateMonthlyInterestRate(mLoans);
                  const realized = summary.rate ?? 0;
                  const goal = getGoal("interest_rate", mKey);
                  const target = goal?.targetValue ?? 0;
                  const pct = target > 0 && summary.rate !== null ? Math.min(100, (realized / target) * 100) : 0;
                  const reached = target > 0 && summary.rate !== null && realized >= target;
                  const colorVar = reached ? "hsl(var(--success))" : "hsl(var(--destructive))";
                  const trackVar = "hsl(var(--muted))";
                  const monthShort = monthNames[d.getMonth()].slice(0, 3);
                  return (
                    <div key={monthsAgo} className="flex flex-col items-center gap-1">
                      <div
                        className="relative h-14 w-14 rounded-full flex items-center justify-center"
                        style={{ background: `conic-gradient(${colorVar} ${pct * 3.6}deg, ${trackVar} 0deg)` }}
                        title={target > 0 ? `Meta: ${target.toFixed(1)}%` : "Sem meta cadastrada"}
                      >
                        <div className="absolute inset-1 rounded-full bg-card flex items-center justify-center">
                          <span className={`text-[10px] font-bold ${reached ? "text-success" : "text-destructive"}`}>
                            {summary.rate !== null ? `${realized.toFixed(1)}%` : "--"}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground capitalize">{monthShort}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedBreakdown === "interest-rate" ? "rotate-180" : ""}`} />
          </div>
          {expandedBreakdown === "interest-rate" && data.filteredLoans.length > 0 && (
            <div className="mt-3 border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Empréstimos considerados</p>
              {data.filteredLoans.map((l) => {
                const totalToReceive = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
                const totalPct = l.amount > 0 ? ((totalToReceive - l.amount) / l.amount) * 100 : 0;
                return (
                  <div key={l.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg p-2">
                    <div>
                      <p className="font-medium text-foreground">{l.borrowerName}</p>
                      <p className="text-muted-foreground">
                        Emprestado: {rawFormatCurrency(l.amount)} → Receber: {rawFormatCurrency(totalToReceive)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-warning">{totalPct.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {expandedBreakdown === "interest-rate" && data.filteredLoans.length === 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground text-center">Nenhum empréstimo no período</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profit Card — Faturamento do Período */}
      <Card no3d className="animate-fade-in h-full" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Faturamento do Período</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs text-muted-foreground">Previsto restante</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Como o Previsto restante é calculado"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-72 text-xs leading-relaxed">
                    <p className="font-semibold text-foreground mb-1">Como é calculado</p>
                    <p className="text-muted-foreground">
                      Soma dos <strong>lucros já realizados</strong> com os
                      <strong> lucros pendentes</strong> que vencem no período selecionado.
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
              <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(
                data.periodProfitRealized + data.periodProfitExpected
              )}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Realizado</span>
              <span className="text-sm font-bold tabular-nums text-success">{formatCurrency(data.periodProfitRealized)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">% lucro realizado</span>
              <span className={`text-sm font-bold ${data.periodProfitPct >= 100 ? "text-success" : data.periodProfitPct >= 50 ? "text-warning" : "text-foreground"}`}>
                {data.periodProfitPct}%
              </span>
            </div>
            {profitGoal && (() => {
              const metaPct = profitTargetAmount > 0 ? (data.periodProfitRealized / profitTargetAmount) * 100 : 0;
              return (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">% atingimento da meta</span>
                  <span className={`text-sm font-bold ${metaPct >= 100 ? "text-success" : "text-destructive"}`}>
                    {metaPct.toFixed(1)}%
                  </span>
                </div>
              );
            })()}
            <div className="pt-1.5 border-t border-border/30">
              {profitGoal ? (() => {
                const pct = profitTargetAmount > 0 ? Math.min(150, (data.periodProfitRealized / profitTargetAmount) * 100) : 0;
                const reached = data.periodProfitRealized >= profitTargetAmount && profitTargetAmount > 0;
                const status = reached ? "atingida" : "abaixo";
                const color = reached ? "text-success" : "text-destructive";
                return (
                  <>
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="flex items-center gap-1 text-muted-foreground"><Target className="h-3 w-3" /> Meta do período: {profitGoal.targetValue}% do lucro total ({formatCurrency(profitTargetAmount)})</span>
                      <span className={`font-bold ${color}`}>{status === "atingida" ? "✓ Meta atingida" : "Em andamento"}</span>
                    </div>
                    <Progress value={Math.min(100, pct)} className="h-1.5 mt-1" />
                  </>
                );
              })() : (
                <p className="text-[10px] text-muted-foreground italic flex items-center gap-1"><Target className="h-3 w-3" /> Defina uma meta em Relatórios → Metas</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
