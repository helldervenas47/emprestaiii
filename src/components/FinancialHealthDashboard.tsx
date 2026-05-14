import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Income } from "@/hooks/useIncomes";
import { Expense } from "@/types/loan";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import { useHideValues } from "@/contexts/HideValuesContext";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  Heart,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Shield,
  Wallet,
  PiggyBank,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Gauge,
  Scale,
  Banknote,
  LineChart as LineChartIcon,
} from "lucide-react";

const COLOR_GREEN = "#10B981";
const COLOR_YELLOW = "#F59E0B";
const COLOR_RED = "#EF4444";
const DONUT_COLORS = ["#10B981", "#06B6D4", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899"];

interface Props {
  incomes: Income[];
  expenses: Expense[];
  monthKey: string;
}

function fmtBRL(n: number, hide: boolean) {
  if (hide) return "•••••";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function monthKeyOffset(base: string, offset: number): string {
  const [y, m] = base.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

interface MonthMetrics {
  income: number;
  expense: number;
  pendingExpense: number;
}

function monthlyExpenseAmount(e: Expense): number {
  const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
  return isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
}

function computeMonthMetrics(incomes: Income[], expenses: Expense[], key: string): MonthMetrics {
  const income = incomes
    .filter((i) => i.status === "received" && i.receivedDate.startsWith(key))
    .reduce((s, i) => s + i.amount, 0);
  const personal = expenses.filter((e) => (e.scope ?? "business") === "personal");
  const expense = personal
    .filter((e) => e.paid && (e.paidDate || "").startsWith(key))
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  const pendingExpense = personal
    .filter((e) => !e.paid && (e.dueDate || "").startsWith(key))
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  return { income, expense, pendingExpense };
}

function computeScore(m: MonthMetrics, piggyBalance: number, avgExpense: number): number {
  // Componentes (cada 0-100)
  const spendControl = m.income > 0 ? clamp(((m.income - m.expense) / m.income) * 200) : 30;
  const reserve = avgExpense > 0 ? clamp((piggyBalance / avgExpense / 6) * 100) : piggyBalance > 0 ? 60 : 30;
  const debts = m.income > 0 ? clamp(100 - (m.pendingExpense / m.income) * 100) : 50;
  const investments = m.income > 0 ? clamp((piggyBalance / (m.income * 3)) * 100) : 0;
  const stability = m.income > 0 && m.expense >= 0
    ? clamp(100 - Math.abs(m.expense / m.income - 0.6) * 120)
    : 50;
  return Math.round((spendControl + reserve + debts + investments + stability) / 5);
}

export function FinancialHealthDashboard({ incomes, expenses, monthKey }: Props) {
  const { hidden } = useHideValues();
  const { deposits } = usePiggyBanks();
  const [expanded, setExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string>("");

  const data = useMemo(() => {
    const piggyBalance = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    // Últimos 6 meses (incluindo o atual)
    const months = Array.from({ length: 6 }, (_, i) => monthKeyOffset(monthKey, -(5 - i)));
    const monthsMetrics = months.map((k) => computeMonthMetrics(incomes, expenses, k));
    const avgExpense =
      monthsMetrics.reduce((s, m) => s + m.expense, 0) / Math.max(1, monthsMetrics.filter((m) => m.expense > 0).length);

    const evolution = months.map((k, idx) => ({
      month: monthLabel(k),
      score: computeScore(monthsMetrics[idx], piggyBalance, avgExpense),
    }));

    const current = monthsMetrics[5];
    const previous = monthsMetrics[4];
    const score = computeScore(current, piggyBalance, avgExpense);
    const previousScore = computeScore(previous, piggyBalance, avgExpense);
    const improvementPct = previousScore > 0 ? Math.round(((score - previousScore) / previousScore) * 100) : 0;

    // Radar
    const spendControl = current.income > 0 ? clamp(((current.income - current.expense) / current.income) * 200) : 30;
    const reserve = avgExpense > 0 ? clamp((piggyBalance / avgExpense / 6) * 100) : piggyBalance > 0 ? 60 : 30;
    const debts = current.income > 0 ? clamp(100 - (current.pendingExpense / current.income) * 100) : 50;
    const investments = current.income > 0 ? clamp((piggyBalance / (current.income * 3)) * 100) : 0;
    const stability = current.income > 0
      ? clamp(100 - Math.abs(current.expense / current.income - 0.6) * 120)
      : 50;

    const radar = [
      { axis: "Controle", value: Math.round(spendControl) },
      { axis: "Reserva", value: Math.round(reserve) },
      { axis: "Dívidas", value: Math.round(debts) },
      { axis: "Investim.", value: Math.round(investments) },
      { axis: "Estabilid.", value: Math.round(stability) },
    ];

    // Donut por categoria de despesa do mês atual
    const map = new Map<string, number>();
    expenses
      .filter((e) => (e.scope ?? "business") === "personal" && e.paid && (e.paidDate || "").startsWith(monthKey))
      .forEach((e) => {
        const k = e.category || "Outros";
        map.set(k, (map.get(k) || 0) + monthlyExpenseAmount(e));
      });
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4);
    const rest = sorted.slice(4).reduce((s, [, v]) => s + v, 0);
    const categories = [
      ...top.map(([name, value]) => ({ name, value })),
      ...(rest > 0 ? [{ name: "Outros", value: rest }] : []),
    ];

    // Insights
    const monthsCovered = avgExpense > 0 ? piggyBalance / avgExpense : 0;
    const expenseDelta = previous.expense > 0
      ? Math.round(((current.expense - previous.expense) / previous.expense) * 100)
      : 0;

    return {
      score,
      improvementPct,
      evolution,
      radar,
      categories,
      current,
      previous,
      monthsCovered,
      expenseDelta,
      piggyBalance,
    };
  }, [incomes, expenses, monthKey, deposits]);

  const generateReport = async () => {
    setReportOpen(true);
    if (reportContent) return;
    setReportLoading(true);
    try {
      const [yy, mm] = monthKey.split("-").map(Number);
      const periodStart = `${monthKey}-01`;
      const lastDay = new Date(yy, mm, 0).getDate();
      const periodEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
      const monthLabelFull = new Date(yy, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const { data: res, error } = await supabase.functions.invoke("generate-income-health-report", {
        body: {
          metrics: {
            score: data.score,
            improvementPct: data.improvementPct,
            monthsCovered: data.monthsCovered,
            expenseDelta: data.expenseDelta,
            piggyBalance: data.piggyBalance,
            current: data.current,
            previous: data.previous,
            radar: data.radar,
            categories: data.categories,
            monthKey,
            monthLabel: monthLabelFull,
            periodStart,
            periodEnd,
          },
        },
      });
      if (error) throw error;
      if ((res as any)?.error) throw new Error((res as any).error);
      setReportContent((res as any)?.content || "Não foi possível gerar o relatório.");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar relatório");
      setReportOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const scoreColor =
    data.score >= 70 ? COLOR_GREEN : data.score >= 40 ? COLOR_YELLOW : COLOR_RED;
  const scoreLabel =
    data.score >= 70 ? "Saudável" : data.score >= 40 ? "Atenção" : "Crítico";

  const gaugeData = [{ name: "score", value: data.score, fill: scoreColor }];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-slate-50 to-blue-50/60 dark:from-[#0B1120] dark:via-[#0F172A] dark:to-[#1E293B] p-5 sm:p-7 shadow-[0_20px_60px_-20px_hsl(220_30%_8%/0.18)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] border border-black/5 dark:border-white/5">
      {/* Glow accents */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-25 dark:opacity-30"
        style={{ background: `radial-gradient(circle, ${scoreColor}, transparent 70%)` }}
      />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full blur-3xl opacity-15 dark:opacity-20"
        style={{ background: "radial-gradient(circle, #6366F1, transparent 70%)" }}
      />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-black/10 dark:border-white/10 backdrop-blur-md"
            style={{ background: `linear-gradient(135deg, ${scoreColor}33, transparent)` }}
          >
            <Heart className="h-5 w-5" style={{ color: scoreColor }} />
          </div>
          <div>
            <h3 className="text-foreground text-base sm:text-lg font-semibold tracking-tight">Saúde Financeira</h3>
            <p className="text-muted-foreground text-xs">Visão geral do mês</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={generateReport}
            disabled={reportLoading}
            className="h-9 gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600 border-0 shadow-md"
          >
            {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline text-xs font-medium">Relatório IA</span>
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="sm:hidden flex h-9 w-9 items-center justify-center rounded-full bg-foreground/5 border border-black/10 dark:border-white/10 backdrop-blur-md text-foreground/80 active:scale-95 transition"
            aria-label={expanded ? "Recolher" : "Expandir"}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Gauge principal */}
      <div className="relative mx-auto mb-2 w-full max-w-sm">
        <div className="relative aspect-square">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="78%"
              outerRadius="100%"
              startAngle={210}
              endAngle={-30}
              data={gaugeData}
            >
              <defs>
                <linearGradient id="gaugeFill" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={scoreColor} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={scoreColor} stopOpacity={1} />
                </linearGradient>
              </defs>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar
                background={{ fill: "hsl(var(--foreground) / 0.06)" }}
                dataKey="value"
                cornerRadius={20}
                fill="url(#gaugeFill)"
                isAnimationActive
                animationDuration={1400}
              />
            </RadialBarChart>
          </ResponsiveContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-muted-foreground text-[11px] tracking-widest uppercase">Score</span>
            <span
              className="text-6xl sm:text-7xl font-bold leading-none mt-1 transition-all"
              style={{ color: scoreColor, textShadow: `0 0 32px ${scoreColor}66` }}
            >
              {data.score}
            </span>
            <span className="text-muted-foreground text-sm mt-1">de 100</span>
            <div
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full border backdrop-blur-md"
              style={{
                background: `${scoreColor}22`,
                borderColor: `${scoreColor}55`,
                color: scoreColor,
              }}
            >
              <Shield className="h-3 w-3" />
              <span className="text-xs font-semibold">{scoreLabel}</span>
            </div>
          </div>
        </div>

        {/* Faixas */}
        <div className="-mt-4 flex items-center justify-between px-2 text-[10px] uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR_RED }} />
            <span className="text-muted-foreground">0-39</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR_YELLOW }} />
            <span className="text-muted-foreground">40-69</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLOR_GREEN }} />
            <span className="text-muted-foreground">70-100</span>
          </div>
        </div>
      </div>

      {/* Mensagem de evolução */}
      <div className="text-center mb-7">
        <div
          className={`inline-flex items-center gap-1.5 text-sm ${
            data.improvementPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {data.improvementPct >= 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span className="font-medium">
            Você {data.improvementPct >= 0 ? "melhorou" : "caiu"} {Math.abs(data.improvementPct)}% este mês
          </span>
        </div>
      </div>

      {/* Cards de insights */}
      <div className={`${expanded ? "grid" : "hidden"} sm:grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6`}>
        <InsightCard
          icon={<Wallet className="h-4 w-4" />}
          accent={data.current.income >= data.current.expense ? COLOR_GREEN : COLOR_RED}
          title={data.current.income >= data.current.expense ? "Você gastou menos do que ganhou" : "Você gastou mais do que ganhou"}
          value={fmtBRL(data.current.income - data.current.expense, hidden)}
        />
        <InsightCard
          icon={<PiggyBank className="h-4 w-4" />}
          accent={COLOR_GREEN}
          title="Sua reserva cobre"
          value={`${data.monthsCovered.toFixed(1)} meses`}
        />
        <InsightCard
          icon={<ArrowDownRight className="h-4 w-4" />}
          accent={data.expenseDelta <= 0 ? COLOR_GREEN : COLOR_YELLOW}
          title={data.expenseDelta <= 0 ? "Suas despesas caíram" : "Suas despesas subiram"}
          value={`${Math.abs(data.expenseDelta)}%`}
        />
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" />
              Relatório IA — Saúde da aba Receitas
            </DialogTitle>
            <DialogDescription>
              Análise personalizada com recomendações para melhorar sua saúde financeira.
            </DialogDescription>
          </DialogHeader>
          {reportLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">Gerando análise personalizada...</p>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2">
              <ReactMarkdown>{reportContent}</ReactMarkdown>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setReportContent(""); generateReport(); }}
              disabled={reportLoading}
            >
              Gerar novamente
            </Button>
            <Button size="sm" onClick={() => setReportOpen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GlassCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-black/10 dark:border-white/10 bg-foreground/[0.03] backdrop-blur-xl p-4 shadow-[0_8px_32px_-12px_hsl(220_30%_8%/0.18)] dark:shadow-[0_8px_32px_-12px_rgba(0,0,0,0.4)] ${className}`}
    >
      <h4 className="text-foreground/80 text-xs font-semibold uppercase tracking-wider mb-3">{title}</h4>
      {children}
    </div>
  );
}

function InsightCard({
  icon,
  accent,
  title,
  value,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  value: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 bg-foreground/[0.03] backdrop-blur-xl p-4 transition-all hover:bg-foreground/[0.06] hover:scale-[1.02]">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-muted-foreground text-xs">{title}</span>
      </div>
      <div className="text-foreground text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
