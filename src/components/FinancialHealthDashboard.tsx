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
import { useProducts } from "@/hooks/useProducts";
import { Sale } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { isCreditCardExpense, listPaidInvoicesInRange } from "@/lib/creditCardInvoiceTotals";
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

type IndicatorKey = "control" | "reserve" | "debts" | "investments" | "stability";

const INDICATORS: { key: IndicatorKey; label: string; icon: React.ReactNode }[] = [
  { key: "control", label: "Controle", icon: <Wallet className="h-3.5 w-3.5" /> },
  { key: "reserve", label: "Reserva", icon: <Shield className="h-3.5 w-3.5" /> },
  { key: "debts", label: "Dívidas", icon: <Scale className="h-3.5 w-3.5" /> },
  { key: "investments", label: "Investim.", icon: <Banknote className="h-3.5 w-3.5" /> },
  { key: "stability", label: "Estabilid.", icon: <LineChartIcon className="h-3.5 w-3.5" /> },
];

function scoreColorOf(score: number): string {
  if (score >= 70) return COLOR_GREEN;
  if (score >= 40) return COLOR_YELLOW;
  return COLOR_RED;
}

function scoreLabelOf(score: number): string {
  if (score >= 70) return "Bom";
  if (score >= 40) return "Atenção";
  return "Ruim";
}

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

function saleReceivedTotal(sale: Sale): number {
  const history = sale.paymentHistory || [];
  const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
  return Math.max(historyTotal, legacyTotal);
}

function saleReceivedInMonth(sale: Sale, monthKey: string): number {
  const history = sale.paymentHistory || [];
  if (history.length > 0) {
    const historyMonthSum = history
      .filter((p) => (p.date || "").startsWith(monthKey))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const historyTotal = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
    const legacyTotal = (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
    if (historyTotal >= legacyTotal) return historyMonthSum;
    const missing = legacyTotal - historyTotal;
    return historyMonthSum + ((sale.date || "").startsWith(monthKey) ? missing : 0);
  }
  return (sale.date || "").startsWith(monthKey) ? saleReceivedTotal(sale) : 0;
}

function computeMonthMetrics(
  incomes: Income[],
  expenses: Expense[],
  sales: Sale[],
  cards: ReturnType<typeof useCreditCards>["cards"],
  openings: ReturnType<typeof useCreditCardOpenings>["openings"],
  key: string,
): MonthMetrics {
  const incomeFromIncomes = incomes
    .filter((i) => i.status === "received" && i.receivedDate.startsWith(key))
    .reduce((s, i) => s + i.amount, 0);
  const incomeFromSales = sales.reduce((s, sale) => s + saleReceivedInMonth(sale, key), 0);
  const income = incomeFromIncomes + incomeFromSales;
  const personal = expenses.filter((e) => (e.scope ?? "business") === "personal");
  // Saídas do mês = despesas pessoais pagas (exceto itens de cartão) + faturas de cartão quitadas no mês.
  const expensePaidNonCard = personal
    .filter((e) => e.paid && (e.paidDate || "").startsWith(key) && !isCreditCardExpense(e))
    .reduce((s, e) => s + monthlyExpenseAmount(e), 0);
  const [yy, mm] = key.split("-").map(Number);
  let invoicesPaid = 0;
  if (yy && mm) {
    const lastDay = new Date(yy, mm, 0).getDate();
    const fromISO = `${key}-01`;
    const toISO = `${key}-${String(lastDay).padStart(2, "0")}`;
    invoicesPaid = listPaidInvoicesInRange(expenses, cards, openings, fromISO, toISO)
      .reduce((s, inv) => s + inv.paidTotal, 0);
  }
  const expense = expensePaidNonCard + invoicesPaid;
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
  const { sales } = useProducts(true);
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();
  const [expanded, setExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportContent, setReportContent] = useState<string>("");
  const [openIndicator, setOpenIndicator] = useState<IndicatorKey | null>(null);

  const data = useMemo(() => {
    const piggyBalance = deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);

    // Últimos 6 meses (incluindo o atual)
    const months = Array.from({ length: 6 }, (_, i) => monthKeyOffset(monthKey, -(5 - i)));
    const monthsMetrics = months.map((k) => computeMonthMetrics(incomes, expenses, sales, k));
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
      avgExpense,
      indicatorScores: {
        control: Math.round(spendControl),
        reserve: Math.round(reserve),
        debts: Math.round(debts),
        investments: Math.round(investments),
        stability: Math.round(stability),
      },
    };
  }, [incomes, expenses, sales, monthKey, deposits]);

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

  const toggleExpandedMobile = (e: React.MouseEvent) => {
    // Só age em mobile (sm:hidden equivalente). Ignora se o clique veio de um elemento interativo.
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [role='button'], input, select, textarea")) return;
    setExpanded((v) => !v);
  };

  return (
    <div
      onClick={toggleExpandedMobile}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-slate-50 to-blue-50/60 dark:from-[#0B1120] dark:via-[#0F172A] dark:to-[#1E293B] p-5 sm:p-7 shadow-[0_20px_60px_-20px_hsl(220_30%_8%/0.18)] dark:shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] border border-black/5 dark:border-white/5 cursor-pointer sm:cursor-default select-none sm:select-auto"
    >
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

      {/* Indicadores de saúde — 5 anéis clicáveis (estilo fintech) */}
      <div className={`${expanded ? "block" : "hidden"} sm:block mb-6`}>
        <div className="flex items-center gap-2 mb-3">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-foreground/80 text-xs font-semibold uppercase tracking-wider">
            Indicadores essenciais
          </h4>
        </div>
        {/* Mobile: destaque Reserva + 2x2 demais */}
        <div className="space-y-3 md:hidden">
          <IndicatorGaugeCard
            key="reserve-m"
            title="Reserva financeira"
            icon={<Shield className="h-4 w-4" />}
            score={data.indicatorScores.reserve}
            onClick={() => setOpenIndicator("reserve")}
            featured
          />
          <div className="grid grid-cols-2 gap-3">
            {INDICATORS.filter((i) => i.key !== "reserve").map((ind) => (
              <IndicatorGaugeCard
                key={ind.key}
                title={ind.label}
                icon={ind.icon}
                score={data.indicatorScores[ind.key]}
                onClick={() => setOpenIndicator(ind.key)}
              />
            ))}
          </div>
        </div>

        {/* Desktop/Tablet: 5 indicadores lado a lado em uma única linha */}
        <div className="hidden md:grid grid-cols-5 gap-3">
          {INDICATORS.map((ind) => (
            <IndicatorGaugeCard
              key={ind.key}
              title={ind.label}
              icon={ind.icon}
              score={data.indicatorScores[ind.key]}
              onClick={() => setOpenIndicator(ind.key)}
            />
          ))}
        </div>
      </div>

      {/* Dialog: ações concretas por indicador */}
      <IndicatorActionsDialog
        open={openIndicator !== null}
        onOpenChange={(o) => !o && setOpenIndicator(null)}
        indicatorKey={openIndicator}
        data={data}
        hidden={hidden}
      />

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

// =====================================================================
// Indicadores essenciais — 5 velocímetros clicáveis
// =====================================================================

function RingGauge({ score, color, size, stroke }: { score: number; color: string; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      role="img"
      aria-label={`Pontuação ${score} de 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="hsl(var(--foreground) / 0.08)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
      />
    </svg>
  );
}

function IndicatorGaugeCard({
  title,
  icon,
  score,
  onClick,
  featured = false,
}: {
  title: string;
  icon: React.ReactNode;
  score: number;
  onClick: () => void;
  featured?: boolean;
}) {
  const color = scoreColorOf(score);
  const label = scoreLabelOf(score);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-foreground/[0.04] backdrop-blur-xl text-left transition-all hover:bg-white dark:hover:bg-foreground/[0.08] hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-[0_4px_20px_-8px_hsl(220_30%_8%/0.12)] ${
        featured ? "p-4" : "p-3"
      }`}
    >
      {featured ? (
        // Featured: layout horizontal com anel grande à direita
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-xl shrink-0"
                style={{ background: `${color}1f`, color }}
              >
                {icon}
              </span>
              <span className="text-foreground text-sm font-semibold truncate">{title}</span>
            </div>
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: `${color}1f`, color }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          </div>
          <div className="relative shrink-0">
            <RingGauge score={score} color={color} size={92} stroke={10} />
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-2xl font-bold tabular-nums" style={{ color }}>
                {score}
              </span>
              <span className="text-[9px] text-muted-foreground mt-0.5">de 100</span>
            </div>
          </div>
        </div>
      ) : (
        // Compacto: anel centralizado com título acima e label abaixo
        <div className="flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-1.5 max-w-full">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-md shrink-0"
              style={{ background: `${color}1f`, color }}
            >
              {icon}
            </span>
            <span className="text-foreground/90 text-[11px] font-semibold truncate">{title}</span>
          </div>
          <div className="relative">
            <RingGauge score={score} color={color} size={76} stroke={8} />
            <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-xl font-bold tabular-nums" style={{ color }}>
                {score}
              </span>
              <span className="text-[8px] text-muted-foreground mt-0.5">de 100</span>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
            style={{ background: `${color}1f`, color }}
          >
            <span className="h-1 w-1 rounded-full" style={{ background: color }} />
            {label}
          </span>
        </div>
      )}
    </button>
  );
}

interface ActionsData {
  current: MonthMetrics;
  previous: MonthMetrics;
  piggyBalance: number;
  avgExpense: number;
  monthsCovered: number;
  indicatorScores: Record<IndicatorKey, number>;
}

function buildActions(key: IndicatorKey, d: ActionsData, hidden: boolean): {
  title: string;
  subtitle: string;
  bullets: string[];
} {
  const fmt = (n: number) => fmtBRL(Math.max(0, n), hidden);
  const inc = d.current.income;
  const exp = d.current.expense;

  switch (key) {
    case "control": {
      const ratio = inc > 0 ? (exp / inc) * 100 : 0;
      const target = inc * 0.65; // gastar até 65% para entrar em zona saudável
      const gap = exp - target;
      return {
        title: "Controle de gastos",
        subtitle:
          inc <= 0
            ? "Sem receitas registradas neste mês — registre seus recebimentos para medir o controle."
            : `Você gastou ${ratio.toFixed(0)}% da sua renda este mês.`,
        bullets:
          inc <= 0
            ? ["Registre suas receitas do mês para que o app calcule o seu controle."]
            : gap > 0
            ? [
                `Reduza ${fmt(gap)} nas despesas do mês para chegar à meta de 65% da renda.`,
                "Abra o donut de categorias e revise as 1-2 categorias com maior gasto.",
                "Adie despesas não essenciais para o próximo ciclo.",
              ]
            : [
                "Você já está dentro da meta — mantenha o ritmo.",
                "Direcione a sobra deste mês ao cofrinho de reserva.",
              ],
      };
    }
    case "reserve": {
      const target = d.avgExpense * 6;
      const missing = target - d.piggyBalance;
      return {
        title: "Reserva de emergência",
        subtitle:
          d.avgExpense > 0
            ? `Sua reserva cobre ${d.monthsCovered.toFixed(1)} meses de despesa (meta: 6 meses).`
            : "Ainda não há despesas suficientes para calcular a reserva ideal.",
        bullets:
          missing > 0
            ? [
                `Aporte ${fmt(missing)} no cofrinho para alcançar 6 meses de despesa.`,
                "Programe um aporte recorrente mensal para o cofrinho de reserva.",
                "Evite usar a reserva para gastos não emergenciais.",
              ]
            : [
                "Reserva completa — parabéns!",
                "Considere mover o excedente para um cofrinho de investimento.",
              ],
      };
    }
    case "debts": {
      const ratio = inc > 0 ? (d.current.pendingExpense / inc) * 100 : 0;
      const safe = inc * 0.3;
      const overdue = d.current.pendingExpense - safe;
      return {
        title: "Dívidas e contas em aberto",
        subtitle:
          inc > 0
            ? `${ratio.toFixed(0)}% da sua renda está comprometida com contas em aberto este mês.`
            : "Sem receitas neste mês para calcular o comprometimento.",
        bullets:
          d.current.pendingExpense <= 0
            ? ["Nenhuma despesa pendente — saúde excelente neste indicador."]
            : overdue > 0
            ? [
                `Antecipe ${fmt(overdue)} em pagamentos para reduzir o comprometimento abaixo de 30%.`,
                "Priorize quitar as contas com maior valor primeiro.",
                "Renegocie prazos das despesas que não couberem no orçamento do mês.",
              ]
            : [
                "Comprometimento dentro da faixa segura (<30%).",
                "Quite as contas pendentes ainda este mês para manter o score em alta.",
              ],
      };
    }
    case "investments": {
      const target = inc * 3;
      const missing = target - d.piggyBalance;
      return {
        title: "Investimentos / patrimônio",
        subtitle:
          inc > 0
            ? `Saldo investido equivale a ${(d.piggyBalance / inc).toFixed(1)}× sua renda mensal (meta: 3×).`
            : "Registre receitas para que o app calcule sua meta de investimento.",
        bullets:
          missing > 0
            ? [
                `Acumule ${fmt(missing)} em cofrinhos para alcançar 3× a renda mensal.`,
                "Aumente em 5-10% o aporte mensal recorrente do cofrinho.",
                "Crie um cofrinho separado da reserva, voltado a longo prazo.",
              ]
            : [
                "Você atingiu a meta de patrimônio (3× a renda).",
                "Reavalie sua estratégia: diversifique os cofrinhos por objetivo.",
              ],
      };
    }
    case "stability": {
      const ratio = inc > 0 ? exp / inc : 0;
      const diff = (ratio - 0.6) * 100;
      return {
        title: "Estabilidade financeira",
        subtitle:
          inc > 0
            ? `Seus gastos estão em ${(ratio * 100).toFixed(0)}% da renda (faixa ideal: ~60%).`
            : "Sem receitas para medir a estabilidade.",
        bullets:
          inc <= 0
            ? ["Registre as receitas do mês para o cálculo."]
            : Math.abs(diff) <= 10
            ? [
                "Você está dentro da faixa ideal de estabilidade.",
                "Mantenha receitas e despesas equilibradas mês a mês.",
              ]
            : diff > 10
            ? [
                `Reduza ${fmt(inc * (ratio - 0.6))} nas despesas para voltar à faixa ideal.`,
                "Evite picos de gasto: divida compras grandes em parcelas planejadas.",
              ]
            : [
                "Você está gastando bem abaixo de 60% — ótimo controle.",
                "Direcione o excedente para reserva ou investimento, em vez de deixar parado.",
              ],
      };
    }
  }
}

function IndicatorActionsDialog({
  open,
  onOpenChange,
  indicatorKey,
  data,
  hidden,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  indicatorKey: IndicatorKey | null;
  data: ActionsData;
  hidden: boolean;
}) {
  if (!indicatorKey) return null;
  const score = data.indicatorScores[indicatorKey];
  const color = scoreColorOf(score);
  const label = scoreLabelOf(score);
  const content = buildActions(indicatorKey, data, hidden);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: `${color}22`, color }}
            >
              <Gauge className="h-4 w-4" />
            </span>
            <div className="flex flex-col">
              <span>{content.title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                Score atual: <span className="font-semibold" style={{ color }}>{score}/100</span> · {label}
              </span>
            </div>
          </DialogTitle>
          <DialogDescription className="pt-1.5">{content.subtitle}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 pt-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            O que fazer agora
          </p>
          <ul className="space-y-2">
            {content.bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-xl border border-black/5 dark:border-white/5 bg-foreground/[0.02] p-3"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5"
                  style={{ background: `${color}22`, color }}
                >
                  {i + 1}
                </span>
                <span className="text-sm text-foreground/90 leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
