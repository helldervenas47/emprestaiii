import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { useChartOverrides } from "@/hooks/useChartOverrides";
import { useMonthlyGoals } from "@/hooks/useMonthlyGoals";
import { calculateMonthlyInterestRate } from "@/lib/monthlyInterestRate";
import { useAuth } from "@/hooks/useAuth";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase as userSupabase } from "@/integrations/supabase/userClient";
const appSupabase = userSupabase;
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Switch } from "@/components/ui/switch";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Sale, Payment, Expense, InstallmentSchedule, Client } from "@/types/loan";
import { Badge } from "@/components/ui/badge";
import { ManagerCommissionsChart } from "@/components/ManagerCommissionsChart";
import { GoalsCard } from "@/components/GoalsCard";
import { calculateInstallment, calculateTotalWithInterest, getLoanRemainingAmount } from "@/hooks/useLoans";
import { getInstallmentAmount, getOverdueAmount, getOverdueInstallments } from "@/lib/loanInstallmentAmount";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

import { listLedger, type LedgerEntry } from "@/lib/ledger";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight, ChevronDown, Percent, Wallet, Pencil, Check, X, Trash2, Calendar, Eye, Target, Info, Sparkles,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Banknote, Smartphone, ArrowDownToLine, Activity, ShieldCheck, AlertCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";
import { AIReportAudioPlayer } from "@/components/AIReportAudioPlayer";
import { InfoPopover } from "@/components/dashboard/InfoPopover";
import {
  type Period,
  periodLabels,
  monthNames,
  isInRange,
  getRange,
  rawFormatCurrency,
  formatDelta,
  getSaleReceivedAmount,
  getClientKey,
  calculateRealizedProfitForRange,
  summarizeMonthMetrics,
} from "@/components/dashboard/dashboardHelpers";
import { useAccountBalance } from "@/components/dashboard/useAccountBalance";
import { DashboardPeriodFilter } from "@/components/dashboard/DashboardPeriodFilter";
import { DashboardFinancialHealthSection } from "@/components/dashboard/DashboardFinancialHealthSection";
import { DashboardMainCards } from "@/components/dashboard/DashboardMainCards";
import { DashboardPortfolioMetrics } from "@/components/dashboard/DashboardPortfolioMetrics";
import { DashboardBreakdownSection } from "@/components/dashboard/DashboardBreakdownSection";
import { useDashboardOverviewController } from "@/components/dashboard/useDashboardOverviewController";
import { useDashboardMetrics } from "@/components/dashboard/useDashboardMetrics";


interface Props {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  installmentSchedules?: InstallmentSchedule[];
  clients?: Client[];
  onDeletePayment?: (id: string) => void;
  onDeleteSale?: (id: string) => void;
  onDeleteLoan?: (id: string) => void;
  readOnly?: boolean;
}



export function DashboardOverview({ loans, sales, payments, expenses, installmentSchedules = [], clients = [], onDeletePayment, onDeleteSale, onDeleteLoan, readOnly = false }: Props) {
  const { mask } = useHideValues();
  const { role } = useAuth();
  const { renegotiations } = useLoanRenegotiations();
  const { methods: paymentMethods } = usePaymentMethods();
  const isMobile = useIsMobile();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const controller = useDashboardOverviewController();
  const {
    period, setPeriod, offset, setOffset, handleChangePeriod,
    range, goalMonthKey, interestGoal, profitGoal,
    txFilter, setTxFilter,
    comparisonWindow, setComparisonWindow,
    showAllTx, setShowAllTx,
    expandedBreakdown, setExpandedBreakdown,
    overdueDialogOpen, setOverdueDialogOpen,
    expandedInsightId, setExpandedInsightId,
    accountBalance, setAccountBalance,
    editingBalance, setEditingBalance,
    tempBalance, setTempBalance,
    startEditBalance, saveBalance, cancelEditBalance,
    includeSales, setIncludeSales,
    showInterestDetail, setShowInterestDetail,
    receivedDetailMethodId, setReceivedDetailMethodId,
    showInterestExpectedDetail, setShowInterestExpectedDetail,
    interestExpectedFilter, setInterestExpectedFilter,
    interestReceivedSearch, setInterestReceivedSearch,
    interestExpectedSearch, setInterestExpectedSearch,
    showHealthInfo, setShowHealthInfo,
    riskAiOpen, setRiskAiOpen,
    riskAiLoading, setRiskAiLoading,
    riskAiReport, setRiskAiReport,
    riskAiTitle, setRiskAiTitle,
    cachedInsightReports, setCachedInsightReports,
    ledgerEntries, setLedgerEntries,
    prefetchingInsightReportsRef,
    chartOverrides, setChartOverrides,
    interestOverrides, setInterestOverrides,
    getGoal,
  } = controller;

  const {
    data,
    receivedByMethod,
    receivedDetail,
    profitTargetAmount,
    portfolio,
    monthComparison,
    yearlyAverages,
    riskReturn,
    monthlyChartBase,
    monthlyChart,
    interestChartBase,
    interestChart,
  } = useDashboardMetrics({
    loans, sales, payments, expenses, installmentSchedules, ledgerEntries,
    range, period, includeSales, comparisonWindow,
    chartOverrides, interestOverrides,
    paymentMethods, profitGoal, receivedDetailMethodId,
  });

  const buildLocalAiReport = useCallback((type: "risk-reduction" | "priority-insight", metrics: Record<string, unknown>) => {
    const asNumber = (value: unknown) => {
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const asPercent = (value: unknown) => `${asNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
    if (type === "priority-insight") {
      const insight = String(metrics.title ?? metrics.insight ?? "Insight prioritário");
      return `## Resumo executivo\n- ${insight}\n- Priorize a ação de maior impacto com base nos indicadores atuais.\n\n## Ação imediata\n- Revise os contratos ou clientes que mais pesam no indicador.\n- Acompanhe o efeito da ação no próximo fechamento do período.`;
    }
    const risk = metrics.riskScore ?? metrics.risco ?? metrics.risk ?? 0;
    const returns = metrics.returnScore ?? metrics.retorno ?? metrics.return ?? 0;
    const defaultRate = metrics.defaultRate ?? metrics.inadimplencia ?? metrics.default_rate ?? 0;
    const received = metrics.received ?? metrics.recebido ?? metrics.totalIncome ?? metrics.income ?? 0;
    return `## Resumo executivo\n- Risco atual: ${asPercent(risk)}; retorno: ${asPercent(returns)}; inadimplência: ${asPercent(defaultRate)}.\n- Recebido no período: ${formatCurrency(asNumber(received))}. Foque em reduzir exposição sem travar operações rentáveis.\n\n## Ações imediatas\n- Priorize cobrança dos maiores saldos em atraso e renegocie contratos com maior risco.\n- Evite novas liberações para perfis com atraso recorrente até o indicador estabilizar.`;
  }, [formatCurrency]);

  const generateAiReport = useCallback(async ({ title, type, metrics, cacheKey, openSheet = true }: { title: string; type: "risk-reduction" | "priority-insight"; metrics: Record<string, unknown>; cacheKey?: string; openSheet?: boolean }) => {
    const localReport = buildLocalAiReport(type, metrics);
    if (openSheet) {
      setRiskAiOpen(true);
      setRiskAiLoading(true);
      setRiskAiTitle(title);
      setRiskAiReport(localReport);
      if (cacheKey && cachedInsightReports[cacheKey]) {
        setRiskAiReport(cachedInsightReports[cacheKey]);
        setRiskAiLoading(false);
        return;
      }
    }
    try {
      const { data: userCheck, error: userErr } = await userSupabase.auth.getUser();
      if (userErr || !userCheck?.user) {
        await userSupabase.auth.signOut({ scope: "local" });
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const { data: appSession } = await appSupabase.auth.getSession();
      if (!appSession.session?.access_token) {
        if (cacheKey) {
          setCachedInsightReports((current) => ({ ...current, [cacheKey]: localReport }));
        }
        if (openSheet) {
          setRiskAiReport(localReport);
        }
        return;
      }
      const { data: result, error } = await appSupabase.functions.invoke("generate-risk-reduction-report", {
        body: { type, metrics },
      });

      if (error) {
        if (cacheKey) {
          setCachedInsightReports((current) => ({ ...current, [cacheKey]: localReport }));
        }
        if (openSheet) {
          toast.info("Relatório gerado em modo local", { description: "A IA demorou para responder. Mantivemos o relatório local com os dados disponíveis." });
          setRiskAiReport(localReport);
        }
        return;
      }
      const payload = (result ?? {}) as { report?: string; fallback?: boolean; message?: string };
      if (payload.fallback) {
        const fb = payload.message || "A IA demorou para responder. Um relatório local foi gerado com os dados disponíveis.";
        const report = payload.report ?? `> ${fb}`;
        if (cacheKey) {
          setCachedInsightReports((current) => ({ ...current, [cacheKey]: report }));
        }
        if (openSheet) {
          toast.info("Relatório gerado em modo local", { description: fb });
          setRiskAiReport(report);
        }
        return;
      }
      const report = payload.report ?? "Não foi possível gerar o relatório.";
      if (cacheKey) {
        setCachedInsightReports((current) => ({ ...current, [cacheKey]: report }));
      }
      if (openSheet) setRiskAiReport(report);
    } catch (error: any) {
      if (cacheKey) {
        setCachedInsightReports((current) => ({ ...current, [cacheKey]: localReport }));
      }
      const message = error?.message || "A IA demorou para responder. Um relatório local foi gerado com os dados disponíveis.";
      if (openSheet) {
        toast.info("Relatório gerado em modo local", { description: message });
        setRiskAiReport(localReport);
      }
    } finally {
      if (openSheet) setRiskAiLoading(false);
      if (cacheKey) prefetchingInsightReportsRef.current.delete(cacheKey);
    }
  }, [buildLocalAiReport, cachedInsightReports]);

  const generateRiskAiReport = useCallback(async () => {
    await generateAiReport({
      title: "Relatório IA para reduzir risco",
      type: "risk-reduction",
      metrics: {
        periodo: `Ano ${new Date().getFullYear()}`,
        scoreRisco: riskReturn.riskScore,
        scoreRetorno: riskReturn.returnScore,
        classificacao: riskReturn.classification,
        inadimplenciaPercentual: portfolio.defaultRate,
        atrasoMedioDias: Math.round(riskReturn.averageDelayDays),
        concentracaoReceitaPercentual: Number(riskReturn.concentrationShare.toFixed(1)),
        taxaJurosMediaAnual: yearlyAverages.interestRate.rate,
        jurosRecebidosAno: yearlyAverages.interestReceived,
        lucroGerado: data.periodProfitRealized,
        insightAtual: riskReturn.insight,
      },
    });
  }, [data.periodProfitRealized, generateAiReport, portfolio.defaultRate, riskReturn, yearlyAverages]);

  const prioritizedInsights = useMemo(() => {
    const current = monthComparison.current;
    const previous = monthComparison.previous;
    if (!current) return [] as { id: string; title: string; body: string; detail: string; recommendation: string; score: number; tone: "positive" | "warning" | "negative"; }[];

    const averageLast3 = monthComparison.series.slice(-3).reduce((acc, item) => ({
      revenue: acc.revenue + item.revenue,
      profit: acc.profit + item.profit,
      interestRate: acc.interestRate + (item.interestRate ?? 0),
      ticketAverage: acc.ticketAverage + item.ticketAverage,
      serviceVolume: acc.serviceVolume + item.serviceVolume,
      overdueRate: acc.overdueRate + item.overdueRate,
      overdueAmount: acc.overdueAmount + item.overdueAmount,
      top3Share: acc.top3Share + item.top3Share,
    }), { revenue: 0, profit: 0, interestRate: 0, ticketAverage: 0, serviceVolume: 0, overdueRate: 0, overdueAmount: 0, top3Share: 0 });

    const divisor = Math.max(1, monthComparison.series.slice(-3).length);
    const avg3 = {
      revenue: averageLast3.revenue / divisor,
      profit: averageLast3.profit / divisor,
      interestRate: averageLast3.interestRate / divisor,
      ticketAverage: averageLast3.ticketAverage / divisor,
      serviceVolume: averageLast3.serviceVolume / divisor,
      overdueRate: averageLast3.overdueRate / divisor,
      overdueAmount: averageLast3.overdueAmount / divisor,
      top3Share: averageLast3.top3Share / divisor,
    };

    const insights: { id: string; title: string; body: string; detail: string; recommendation: string; score: number; tone: "positive" | "warning" | "negative"; }[] = [];
    const revenueVariation = monthComparison.revenueDelta;
    if (revenueVariation !== null && Math.abs(revenueVariation) > 10) {
      insights.push({
        id: "revenue-variation",
        title: revenueVariation > 0 ? "Crescimento de faturamento" : "Queda de faturamento",
        body: revenueVariation > 0
          ? `Seu faturamento cresceu ${Math.abs(revenueVariation).toFixed(1)}% em relação ao mês passado. Continue focando nos contratos e recebimentos que mais puxaram esse avanço.`
          : `Seu faturamento caiu ${Math.abs(revenueVariation).toFixed(1)}% em relação ao mês passado. Revise a entrada de novos contratos e a cadência de recebimentos para reagir rápido.`,
        detail: `Atual: ${rawFormatCurrency(current.revenue)} • Anterior: ${rawFormatCurrency(previous?.revenue ?? 0)} • Média 3 meses: ${rawFormatCurrency(avg3.revenue)}.`,
        recommendation: revenueVariation > 0 ? "Mantenha foco nos produtos, clientes ou contratos que mais contribuíram para esse crescimento." : "Revise originação, cobrança e recorrência de entradas para recuperar ritmo no próximo ciclo.",
        score: Math.abs(current.revenue - (previous?.revenue ?? 0)) + (revenueVariation < 0 ? 35 : 20),
        tone: revenueVariation > 0 ? "positive" : "negative",
      });
    }

    if (interestGoal && current.interestRate !== null) {
      const diff = current.interestRate - interestGoal.targetValue;
      insights.push({
        id: "interest-goal",
        title: diff >= 0 ? "Rentabilidade acima da meta" : "Rentabilidade abaixo da meta",
        body: diff >= 0
          ? `Você está ${Math.abs(diff).toFixed(1)} p.p. acima da meta de juros do mês. Mantenha o mix atual dos contratos mais rentáveis.`
          : `Sua taxa de juros está ${Math.abs(diff).toFixed(1)} p.p. abaixo da meta do mês. Reavalie preço, prazo e condições dos novos empréstimos.`,
        detail: `Taxa atual: ${current.interestRate.toFixed(2)}% • Meta: ${interestGoal.targetValue.toFixed(2)}% • Diferença: ${diff >= 0 ? "+" : "-"}${Math.abs(diff).toFixed(2)} p.p.`,
        recommendation: diff >= 0 ? "Preserve as condições que estão sustentando a rentabilidade sem elevar demais o risco da carteira." : "Ajuste taxa, prazo e seleção de contratos novos para aproximar a rentabilidade da meta.",
        score: Math.abs(diff) * 30 + (diff < 0 ? 30 : 18),
        tone: diff >= 0 ? "positive" : "warning",
      });
    }

    if (current.overdueRate > 0.2 || (previous && current.overdueRate > previous.overdueRate)) {
      const overdueDelta = previous ? (current.overdueRate - previous.overdueRate) * 100 : current.overdueRate * 100;
      insights.push({
        id: "default-risk",
        title: "Alerta de inadimplência",
        body: current.overdueRate > 0.2
          ? `A inadimplência do período está em ${(current.overdueRate * 100).toFixed(1)}%, sinalizando risco elevado. Priorize cobrança e renegociação dos contratos atrasados.`
          : `A inadimplência aumentou ${Math.abs(overdueDelta).toFixed(1)} p.p. versus o mês anterior. Vale revisar sua política de cobrança antes que isso pressione o caixa.`,
        detail: `Inadimplência atual: ${(current.overdueRate * 100).toFixed(1)}% • Anterior: ${((previous?.overdueRate ?? 0) * 100).toFixed(1)}% • Valor em atraso: ${rawFormatCurrency(current.overdueAmount)}.`,
        recommendation: "Ataque primeiro os maiores atrasos e contratos com maior saldo pendente para aliviar o caixa mais rápido.",
        score: (current.overdueAmount || 0) + (current.overdueRate * 1000),
        tone: "negative",
      });
    }

    if (current.ticketAverage > avg3.ticketAverage && current.serviceVolume < avg3.serviceVolume) {
      insights.push({
        id: "efficiency-up",
        title: "Eficiência por cliente maior",
        body: `Seu ticket médio subiu para ${rawFormatCurrency(current.ticketAverage)}, mas o volume caiu para ${current.serviceVolume} atendimentos. Você está ganhando mais por cliente, porém atendendo menos.`,
        detail: `Ticket médio atual: ${rawFormatCurrency(current.ticketAverage)} • Média 3 meses: ${rawFormatCurrency(avg3.ticketAverage)} • Volume atual: ${current.serviceVolume} • Média 3 meses: ${avg3.serviceVolume.toFixed(1)}.`,
        recommendation: "Tente manter o ticket atual enquanto recupera volume com ofertas ou reativação de clientes recorrentes.",
        score: Math.abs(current.ticketAverage - avg3.ticketAverage) + Math.abs(current.serviceVolume - avg3.serviceVolume) * 20,
        tone: "warning",
      });
    }

    if (current.ticketAverage < avg3.ticketAverage && current.serviceVolume > avg3.serviceVolume) {
      insights.push({
        id: "efficiency-down",
        title: "Mais volume com menor ticket",
        body: `O volume subiu para ${current.serviceVolume} atendimentos, mas o ticket médio caiu para ${rawFormatCurrency(current.ticketAverage)}. Você vendeu mais, porém com menor valor por atendimento.`,
        detail: `Volume atual: ${current.serviceVolume} • Média 3 meses: ${avg3.serviceVolume.toFixed(1)} • Ticket médio atual: ${rawFormatCurrency(current.ticketAverage)} • Média 3 meses: ${rawFormatCurrency(avg3.ticketAverage)}.`,
        recommendation: "Avalie combos, reajustes ou upsell para aumentar valor médio sem perder o fluxo atual.",
        score: Math.abs(current.ticketAverage - avg3.ticketAverage) + Math.abs(current.serviceVolume - avg3.serviceVolume) * 20,
        tone: "warning",
      });
    }

    if (current.top3Share > 0.5) {
      insights.push({
        id: "concentration-risk",
        title: "Dependência de poucos clientes",
        body: `${(current.top3Share * 100).toFixed(1)}% da receita do período veio dos 3 principais clientes. Diversificar a carteira reduz o risco de concentração.`,
        detail: `Top 3 clientes representam ${(current.top3Share * 100).toFixed(1)}% da receita no período, acima do nível saudável para uma carteira equilibrada.`,
        recommendation: "Busque distribuir melhor a receita entre mais clientes para reduzir dependência e volatilidade.",
        score: current.top3Share * 1000,
        tone: "warning",
      });
    }

    const visible = insights.sort((a, b) => b.score - a.score).slice(0, 3);
    if (role === "visualizador") {
      return visible.map((item) => ({ ...item, body: item.body.replace(/meta|inadimplência|rentabilidade|carteira/gi, "desempenho") }));
    }
    return visible;
  }, [interestGoal, monthComparison, role]);

  useEffect(() => {
    const negativeInsights = prioritizedInsights.filter((insight) => insight.tone === "negative");

    negativeInsights.forEach((insight) => {
      if (cachedInsightReports[insight.id] || prefetchingInsightReportsRef.current.has(insight.id)) return;
      prefetchingInsightReportsRef.current.add(insight.id);

      void generateAiReport({
        title: `Relatório IA: ${insight.title}`,
        type: "priority-insight",
        cacheKey: insight.id,
        openSheet: false,
        metrics: {
          periodo: range.label,
          insightId: insight.id,
          insightTitulo: insight.title,
          insightResumo: insight.body,
          detalhe: insight.detail,
          recomendacaoAtual: insight.recommendation,
          classificacao: insight.tone,
          scorePrioridade: insight.score,
          scoreRiscoAtual: riskReturn.riskScore,
          scoreRetornoAtual: riskReturn.returnScore,
          inadimplenciaPercentual: portfolio.defaultRate,
          taxaJurosMedia: data.monthlyInterestRate.rate,
          lucroGerado: data.periodProfitRealized,
        },
      });
    });
  }, [cachedInsightReports, data.monthlyInterestRate.rate, data.periodProfitRealized, generateAiReport, portfolio.defaultRate, prioritizedInsights, range.label, riskReturn]);

  // Manual overrides for monthly chart values
  const [editingChart, setEditingChart] = useState(false);
  const [tempOverrides, setTempOverrides] = useState<Record<string, { emprestado: string; recebido: string }>>({});

  // Interest chart - manual overrides UI state
  const [editingInterest, setEditingInterest] = useState(false);
  const [tempInterestOverrides, setTempInterestOverrides] = useState<Record<string, string>>({});

  const startEditChart = () => {
    const temp: Record<string, { emprestado: string; recebido: string }> = {};
    monthlyChart.forEach((m) => {
      temp[m.month] = { emprestado: String(m.emprestado), recebido: String(m.recebido) };
    });
    setTempOverrides(temp);
    setEditingChart(true);
  };

  const saveChartOverrides = () => {
    const newOverrides: Record<string, { emprestado?: number; recebido?: number }> = {};
    monthlyChartBase.forEach((m) => {
      const temp = tempOverrides[m.month];
      if (!temp) return;
      const totalEmprestado = parseFloat(temp.emprestado) || 0;
      const totalRecebido = parseFloat(temp.recebido) || 0;
      const diffEmprestado = totalEmprestado - m.emprestado;
      const diffRecebido = totalRecebido - m.recebido;
      if (diffEmprestado !== 0 || diffRecebido !== 0) {
        newOverrides[m.month] = {
          ...(diffEmprestado !== 0 ? { emprestado: diffEmprestado } : {}),
          ...(diffRecebido !== 0 ? { recebido: diffRecebido } : {}),
        };
      }
    });
    setChartOverrides(newOverrides);
    setEditingChart(false);
  };

  const resetChartOverrides = () => {
    setChartOverrides({});
    setEditingChart(false);
  };

  const startEditInterest = () => {
    const temp: Record<string, string> = {};
    interestChart.forEach((m) => { temp[m.month] = String(m.juros); });
    setTempInterestOverrides(temp);
    setEditingInterest(true);
  };

  const saveInterestOverrides = () => {
    const newOverrides: Record<string, number> = {};
    interestChartBase.forEach((m) => {
      const raw = tempInterestOverrides[m.month];
      if (raw === undefined || raw === "") return;
      const totalVal = parseFloat(raw);
      if (!Number.isFinite(totalVal)) return;
      newOverrides[m.month] = totalVal;
    });
    setInterestOverrides(newOverrides);
    setEditingInterest(false);
  };

  const resetInterestOverrides = () => {
    setInterestOverrides({});
    setEditingInterest(false);
  };



  const healthColor = portfolio.score >= 70 ? "text-success" : portfolio.score >= 40 ? "text-warning" : "text-destructive";
  const healthBg = portfolio.score >= 70 ? "from-success/20 to-success/5" : portfolio.score >= 40 ? "from-warning/20 to-warning/5" : "from-destructive/20 to-destructive/5";
  const healthStroke = portfolio.score >= 70 ? "stroke-success" : portfolio.score >= 40 ? "stroke-warning" : "stroke-destructive";

  return (
    <div className="space-y-6">
      {/* Period filter + navigation */}
      <DashboardPeriodFilter
        rangeLabel={range.label}
        period={period}
        offset={offset}
        onPrev={() => setOffset(offset - 1)}
        onNext={() => setOffset(offset + 1)}
        onReset={() => setOffset(0)}
        onChangePeriod={handleChangePeriod}
      />


      {/* Account balance + Received + Interest rate + Profit */}
      <DashboardMainCards
        readOnly={readOnly}
        accountBalance={accountBalance}
        editingBalance={editingBalance}
        tempBalance={tempBalance}
        setTempBalance={setTempBalance}
        saveBalance={saveBalance}
        cancelEditBalance={cancelEditBalance}
        receivedByMethod={receivedByMethod}
        setReceivedDetailMethodId={setReceivedDetailMethodId}
        data={data}
        portfolio={portfolio}
        range={range}
        expandedBreakdown={expandedBreakdown}
        setExpandedBreakdown={setExpandedBreakdown}
        interestGoal={interestGoal}
        profitGoal={profitGoal}
        profitTargetAmount={profitTargetAmount}
        loans={loans}
        getGoal={getGoal}
        formatCurrency={formatCurrency}
      />


      {/* Portfolio metrics */}
      <DashboardPortfolioMetrics
        portfolio={portfolio}
        periodProfitRealized={data.periodProfitRealized}
        periodProfitExpected={data.periodProfitExpected}
        formatCurrency={formatCurrency}
        onOpenInterestReceived={() => setShowInterestDetail(true)}
        onOpenInterestExpectedAll={() => { setInterestExpectedFilter("all"); setShowInterestExpectedDetail(true); }}
        onOpenInterestPending={() => { setInterestExpectedFilter("pending"); setShowInterestExpectedDetail(true); }}
      />


      {/* Health Score — Glass Grid */}
      <DashboardFinancialHealthSection
        portfolio={portfolio}
        rangeLabel={range.label}
        installmentSchedules={installmentSchedules}
        formatCurrency={formatCurrency}
        overdueDialogOpen={overdueDialogOpen}
        setOverdueDialogOpen={setOverdueDialogOpen}
        onOpenHealthInfo={() => setShowHealthInfo(true)}
      />


      {/* Goals Card */}
      <GoalsCard loans={loans} payments={payments} expenses={expenses} clients={clients ?? []} installmentSchedules={installmentSchedules} renegotiations={renegotiations} selectedMonth={goalMonthKey} periodLabel={range.label} />

      {/* Manager Commissions Chart - isolated, view-only */}
      <ManagerCommissionsChart clients={clients} loans={loans} installmentSchedules={installmentSchedules} payments={payments} range={{ start: range.start, end: range.end }} rangeLabel={range.label} />

      <Card no3d>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Indicador risco vs retorno</h3>
            <p className="text-xs text-muted-foreground">Score simples, classificação e alerta visual da operação atual.</p>
          </div>

          <div className="space-y-4">
            <button type="button" onClick={generateRiskAiReport} className="w-full rounded-xl border border-primary/20 bg-card/70 p-5 text-left shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:bg-card/80 hover:border-primary/30">
              <div className="mb-3 flex justify-end">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                <span>Baixo risco / baixo retorno</span>
                <span>Alto risco / alto retorno</span>
              </div>
              <div className="relative h-6 rounded-full bg-gradient-to-r from-success/40 via-warning/35 to-destructive/45">
                <div className="absolute top-1/2 h-8 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-card shadow" style={{ left: `${riskReturn.axisPosition}%` }} />
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Taxa de juros média (ano)</p>
                <p className="text-lg font-bold text-foreground mt-1">{yearlyAverages.interestRate.rate !== null ? `${yearlyAverages.interestRate.rate.toFixed(2)}%` : "Sem dados"}</p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Média juros recebidos (ano)</p>
                <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(yearlyAverages.interestReceived)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card no3d>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Histórico Mensal (Últimos 12 Meses)</h3>
            <div className="flex items-center gap-1">
              {editingChart ? (
                <>
                  <Button variant="ghost" size="sm" onClick={resetChartOverrides} className="text-xs text-muted-foreground">
                    Resetar
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingChart(false)}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveChartOverrides}>
                    <Check className="h-3.5 w-3.5 text-success" />
                  </Button>
                </>
              ) : !readOnly ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditChart} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          {editingChart && (
            <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground">Mês</th>
                    <th className="text-right p-2 font-medium text-warning">Emprestado</th>
                    <th className="text-right p-2 font-medium text-success">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyChart.map((m) => (
                    <tr key={m.month} className="border-t border-border/50">
                      <td className="p-2 font-medium">{m.month}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={tempOverrides[m.month]?.emprestado ?? ""}
                          onChange={(e) => setTempOverrides((prev) => ({ ...prev, [m.month]: { ...prev[m.month], emprestado: e.target.value } }))}
                          className="h-7 w-28 text-xs text-right ml-auto"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={tempOverrides[m.month]?.recebido ?? ""}
                          onChange={(e) => setTempOverrides((prev) => ({ ...prev, [m.month]: { ...prev[m.month], recebido: e.target.value } }))}
                          className="h-7 w-28 text-xs text-right ml-auto"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name === "emprestado" ? "Emprestado" : "Recebido"]}
                  labelFormatter={(label) => label}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                />
                <Legend formatter={(value) => value === "emprestado" ? "Emprestado" : "Recebido"} />
                <Bar dataKey="emprestado" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recebido" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Interest Received Monthly Chart */}
      <Card no3d>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Juros Recebidos por Mês (Últimos 12 Meses)</h3>
            <div className="flex items-center gap-1">
              {editingInterest ? (
                <>
                  <Button variant="ghost" size="sm" onClick={resetInterestOverrides} className="text-xs text-muted-foreground">Resetar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingInterest(false)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveInterestOverrides}><Check className="h-3.5 w-3.5 text-success" /></Button>
                </>
              ) : !readOnly ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditInterest} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          {editingInterest && (
            <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground">Mês</th>
                    <th className="text-right p-2 font-medium text-primary">Juros Recebidos</th>
                  </tr>
                </thead>
                <tbody>
                  {interestChart.map((m) => (
                    <tr key={m.month} className="border-t border-border/50">
                      <td className="p-2 font-medium">{m.month}</td>
                      <td className="p-2">
                        <Input
                          type="number" step="0.01"
                          value={tempInterestOverrides[m.month] ?? ""}
                          onChange={(e) => setTempInterestOverrides((prev) => ({ ...prev, [m.month]: e.target.value }))}
                          className="h-7 w-28 text-xs text-right ml-auto"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={interestChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Juros Recebidos"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                />
                <Legend formatter={() => "Juros Recebidos"} />
                <Bar dataKey="juros" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>


      {/* Breakdown */}
      <DashboardBreakdownSection
        data={data}
        loans={loans}
        includeSales={includeSales}
        setIncludeSales={setIncludeSales}
        expandedBreakdown={expandedBreakdown}
        setExpandedBreakdown={setExpandedBreakdown}
        formatCurrency={formatCurrency}
      />


      {/* Monthly transactions */}
      <Card no3d>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-semibold text-foreground">Movimentações — {range.label}</h3>
            <div className="flex items-center gap-2">
              <div className="flex bg-muted rounded-lg p-0.5">
                {([
                  { id: "in" as const, label: "Entradas" },
                  { id: "out" as const, label: "Saídas" },
                ]).map((f) => (
                  <button key={f.id} onClick={() => setTxFilter(f.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${txFilter === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              {!showAllTx && data.transactions.length > 10 && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAllTx(true)}>
                  Ver todas ({data.transactions.length})
                </Button>
              )}
              {showAllTx && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowAllTx(false)}>
                  Resumir
                </Button>
              )}
            </div>
          </div>

          {(() => {
            const filtered = data.transactions.filter((t) => txFilter === "all" ? true : t.type === txFilter);
            const displayed = showAllTx ? filtered : filtered.slice(0, 10);
            const totalIn = filtered.filter(t => t.type === "in").reduce((s, t) => s + t.amount, 0);
            const totalOut = filtered.filter(t => t.type === "out").reduce((s, t) => s + t.amount, 0);

            if (filtered.length === 0) {
              return <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação no período</p>;
            }

            return (
              <>
                {/* Summary bar */}
                <div className="flex gap-4 mb-3 text-xs">
                  {(txFilter === "all" || txFilter === "in") && (
                    <span className="text-success font-medium">↑ Entradas: {formatCurrency(totalIn)} ({filtered.filter(t => t.type === "in").length})</span>
                  )}
                  {(txFilter === "all" || txFilter === "out") && (
                    <span className="text-destructive font-medium">↓ Saídas: {formatCurrency(totalOut)} ({filtered.filter(t => t.type === "out").length})</span>
                  )}
                </div>
                <div className={`space-y-2 ${showAllTx ? "max-h-[600px]" : "max-h-[400px]"} overflow-y-auto`}>
                  {displayed.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${t.type === "in" ? "bg-success/10" : "bg-destructive/10"}`}>
                        {t.type === "in" ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{t.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(`${t.date}T00:00:00`).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${t.type === "in" ? "text-success" : "text-destructive"}`}>
                        {t.type === "in" ? "+" : "−"}{formatCurrency(t.amount)}
                      </span>
                      {!readOnly && (
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (t.source === "payment" && onDeletePayment) onDeletePayment(t.id);
                            else if (t.source === "sale" && onDeleteSale) onDeleteSale(t.id);
                            else if (t.source === "loan" && onDeleteLoan) onDeleteLoan(t.id);
                          }}
                          title="Excluir lançamento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
      {/* Health Info Dialog */}
      <Dialog open={showHealthInfo} onOpenChange={setShowHealthInfo}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Como cada indicador é calculado
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Score (0–100)</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Pontuação geral da carteira combinando taxa de recebimento, inadimplência e atividade dos contratos.
                Acima de <span className="text-success font-medium">70</span> = saudável,
                entre <span className="text-warning font-medium">40 e 70</span> = atenção,
                abaixo de <span className="text-destructive font-medium">40</span> = crítico.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Taxa de Recebimento</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Percentual do que já foi efetivamente recebido em relação ao total esperado da carteira no período.
                <br />
                <span className="font-mono text-[11px]">= (Recebido ÷ Total esperado) × 100</span>
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Inadimplência</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Percentual do valor da carteira que está em atraso em relação ao total a receber.
                <br />
                <span className="font-mono text-[11px]">= (Valor atrasado ÷ Total a receber) × 100</span>
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Recebido</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Soma de todos os pagamentos efetivamente registrados no período selecionado (critério: data de pagamento).
                Inclui parcelas, juros avulsos e quitações.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">Atrasado</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Soma do valor restante de todas as parcelas com vencimento anterior à data de hoje que ainda não foram quitadas.
                O número de contratos abaixo é a quantidade de empréstimos com pelo menos uma parcela vencida.
                Clique no card para ver o detalhamento por cliente.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interest Detail Sheet */}
      <Sheet open={showInterestDetail} onOpenChange={setShowInterestDetail}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>Juros Recebidos — {range.label}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            <Input
              placeholder="Buscar por nome do cliente..."
              value={interestReceivedSearch}
              onChange={(e) => setInterestReceivedSearch(e.target.value)}
              className="h-9"
            />
            {(() => {
              const q = interestReceivedSearch.trim().toLowerCase();
              const filtered = q
                ? data.interestDetailRecords.filter((r) => r.borrowerName.toLowerCase().includes(q))
                : data.interestDetailRecords;
              if (filtered.length === 0) {
                return <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro encontrado.</p>;
              }
              return (
                <>
                  {filtered.map((rec, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                          {rec.tags && rec.tags.length > 0 && rec.tags.map((t, idx) => (
                            <Badge key={idx} variant="outline" className="text-[9px] h-4 py-0 px-1 border-primary/40 text-primary bg-primary/5">
                              #{t}
                            </Badge>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(rec.date + "T00:00:00").toLocaleDateString("pt-BR")} — {rec.type === "quitação" ? "Lucro na quitação" : "Juros da parcela"}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className="text-sm font-bold text-warning">{formatCurrency(rec.interestPortion)}</p>
                        {rec.type === "juros" && (
                          <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.totalPayment)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <p className="text-sm font-semibold">Total{q ? " (filtrado)" : ""}</p>
                    <p className="text-sm font-bold text-warning">
                      {formatCurrency(filtered.reduce((s, r) => s + r.interestPortion, 0))}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>
      {/* Received by payment method detail */}
      <Sheet open={!!receivedDetailMethodId} onOpenChange={(o) => { if (!o) setReceivedDetailMethodId(null); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Recebido via {receivedDetail?.methodName} — {range.label}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {!receivedDetail || receivedDetail.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum recebimento nesta forma de pagamento no período.</p>
            ) : (
              <>
                {receivedDetail.rows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.borrowerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-success ml-3">{formatCurrency(r.amount)}</p>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <p className="text-sm font-semibold">Total</p>
                  <p className="text-sm font-bold text-success">{formatCurrency(receivedDetail.total)}</p>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {/* Interest Expected Detail Sheet */}
      <Sheet open={showInterestExpectedDetail} onOpenChange={setShowInterestExpectedDetail}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
          <SheetHeader>
            <SheetTitle>
              {interestExpectedFilter === "pending"
                ? "Juros Pendentes do Mês"
                : interestExpectedFilter === "overdue"
                ? "Juros Vencidos"
                : "Juros a Receber no Mês"} — {range.label}
            </SheetTitle>
          </SheetHeader>
          {(() => {
            const q = interestExpectedSearch.trim().toLowerCase();
            const matches = (name: string) => !q || name.toLowerCase().includes(q);
            const today = todayInAppTz();
            const allPending = data.interestExpectedRecords
              .filter((r) => !r.paid && matches(r.borrowerName))
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
            const overdueRecs = allPending.filter((r) => r.dueDate < today);
            const pendingRecs = interestExpectedFilter === "overdue" ? overdueRecs : allPending;
            const pendingTotal = pendingRecs.reduce((s, r) => s + r.interestPortion, 0);
            const overdueTotal = overdueRecs.reduce((s, r) => s + r.interestPortion, 0);
            const receivedRecs = data.interestDetailRecords
              .filter((r) => matches(r.borrowerName))
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date));
            const receivedTotal = receivedRecs.reduce((s, r) => s + r.interestPortion, 0);
            const showReceived = interestExpectedFilter === "all";
            const isOverdueView = interestExpectedFilter === "overdue";
            const pendingLabel = isOverdueView ? "Vencidos" : "Pendentes";
            const pendingColor = isOverdueView ? "text-destructive" : "text-warning";
            const pendingBg = isOverdueView ? "bg-destructive/5 border-destructive/30" : "bg-warning/5 border-warning/30";
            const pendingBadgeBg = isOverdueView ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning";
            const pendingValueColor = isOverdueView ? "text-destructive" : "text-warning";
            const grandTotal = pendingTotal + (showReceived ? receivedTotal : 0);
            return (
              <div className="mt-4 space-y-4">
                {/* Filtros */}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={interestExpectedFilter === "all" ? "default" : "outline"}
                    onClick={() => setInterestExpectedFilter("all")}
                    className="h-8 text-xs"
                  >
                    Todos
                  </Button>
                  <Button
                    size="sm"
                    variant={interestExpectedFilter === "pending" ? "default" : "outline"}
                    onClick={() => setInterestExpectedFilter("pending")}
                    className="h-8 text-xs"
                  >
                    Pendentes ({allPending.length})
                  </Button>
                  <Button
                    size="sm"
                    variant={interestExpectedFilter === "overdue" ? "default" : "outline"}
                    onClick={() => setInterestExpectedFilter("overdue")}
                    className="h-8 text-xs"
                  >
                    Vencidos ({overdueRecs.length})
                  </Button>
                </div>
                <Input
                  placeholder="Buscar por nome do cliente..."
                  value={interestExpectedSearch}
                  onChange={(e) => setInterestExpectedSearch(e.target.value)}
                  className="h-9"
                />
                {/* Recebidos */}
                {showReceived && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-success">Recebidos</p>
                      <p className="text-xs text-muted-foreground">{receivedRecs.length} registro(s)</p>
                    </div>
                    {receivedRecs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">Nenhum juros recebido neste período.</p>
                    ) : (
                      <>
                        {receivedRecs.map((rec, i) => (
                          <div key={`r-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/30">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-success/20 text-success">Recebido</span>
                                <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                                {rec.tags && rec.tags.length > 0 && rec.tags.map((t, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] h-4 py-0 px-1 border-primary/40 text-primary bg-primary/5">
                                    #{t}
                                  </Badge>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(rec.date + "T00:00:00").toLocaleDateString("pt-BR")} — {rec.type}
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <p className="text-sm font-bold text-success">{formatCurrency(rec.interestPortion)}</p>
                              <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.totalPayment)}</p>
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-2 border-t border-border/60">
                          <p className="text-xs font-semibold">Subtotal recebido</p>
                          <p className="text-sm font-bold text-success">{formatCurrency(receivedTotal)}</p>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Pendentes / Vencidos */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-semibold uppercase tracking-wider ${pendingColor}`}>{pendingLabel}</p>
                    <p className="text-xs text-muted-foreground">{pendingRecs.length} registro(s)</p>
                  </div>
                  {pendingRecs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      {isOverdueView ? "Nenhum juros vencido." : "Nenhum juros pendente neste período."}
                    </p>
                  ) : (
                    <>
                      {pendingRecs.map((rec, i) => {
                        const isOverdue = rec.dueDate < today;
                        const rowBg = isOverdueView || isOverdue ? "bg-destructive/5 border-destructive/30" : "bg-warning/5 border-warning/30";
                        const badgeBg = isOverdueView || isOverdue ? "bg-destructive/20 text-destructive" : "bg-warning/20 text-warning";
                        const valueColor = isOverdueView || isOverdue ? "text-destructive" : "text-warning";
                        const badgeLabel = isOverdueView || isOverdue ? "Vencido" : "Pendente";
                        return (
                        <div key={`p-${i}`} className={`flex items-center justify-between p-3 rounded-lg border ${rowBg}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${badgeBg}`}>{badgeLabel}</span>
                                <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                                {rec.tags && rec.tags.length > 0 && rec.tags.map((t, idx) => (
                                  <Badge key={idx} variant="outline" className="text-[9px] h-4 py-0 px-1 border-primary/40 text-primary bg-primary/5">
                                    #{t}
                                  </Badge>
                                ))}
                              </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(rec.dueDate + "T00:00:00").toLocaleDateString("pt-BR")} — Parcela {rec.installmentNumber}/{rec.totalInstallments}
                            </p>
                          </div>
                          <div className="text-right ml-3">
                            <p className={`text-sm font-bold ${valueColor}`}>{formatCurrency(rec.interestPortion)}</p>
                            <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.installmentAmount)}</p>
                          </div>
                        </div>
                        );
                      })}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <p className="text-xs font-semibold">Subtotal {pendingLabel}</p>
                        <p className={`text-sm font-bold ${pendingValueColor}`}>{formatCurrency(pendingTotal)}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-3 border-t-2 border-border">
                  <p className="text-sm font-semibold">
                    {showReceived
                      ? "Total (Recebidos + Pendentes)"
                      : isOverdueView
                      ? "Total Vencidos"
                      : "Total Pendente"}
                  </p>
                  <p className="text-base font-bold text-foreground">{formatCurrency(grandTotal)}</p>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>


      {isMobile ? (
        <Sheet open={riskAiOpen} onOpenChange={setRiskAiOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl bg-card/80 backdrop-blur-xl backdrop-saturate-150">
            <SheetHeader className="rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150">
              <SheetTitle className="flex items-center gap-2 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                {riskAiTitle}
              </SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                <Button type="button" size="sm" onClick={generateRiskAiReport} disabled={riskAiLoading} className="gap-2">
                  <Sparkles className={`h-3.5 w-3.5 ${riskAiLoading ? "animate-pulse" : ""}`} />
                  {riskAiLoading ? "Gerando..." : "Gerar novamente"}
                </Button>
                {!riskAiLoading && riskAiReport && (
                  <AIReportAudioPlayer text={riskAiReport} cacheKey={`risk-ai-mobile-${riskAiTitle}-${riskAiReport.length}`} />
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                {riskAiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 animate-pulse text-primary" />Analisando risco, retorno e prioridades de ação...</div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground">
                    <ReactMarkdown>{riskAiReport}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={riskAiOpen} onOpenChange={setRiskAiOpen}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-primary/20 bg-card/80 backdrop-blur-xl backdrop-saturate-150">
            <DialogHeader className="rounded-xl border border-primary/20 bg-card/70 p-4 pr-12 text-left shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150">
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                {riskAiTitle}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                <Button type="button" size="sm" onClick={generateRiskAiReport} disabled={riskAiLoading} className="gap-2">
                  <Sparkles className={`h-3.5 w-3.5 ${riskAiLoading ? "animate-pulse" : ""}`} />
                  {riskAiLoading ? "Gerando..." : "Gerar novamente"}
                </Button>
                {!riskAiLoading && riskAiReport && (
                  <AIReportAudioPlayer text={riskAiReport} cacheKey={`risk-ai-desktop-${riskAiTitle}-${riskAiReport.length}`} />
                )}
              </div>

              <div className="rounded-xl border border-primary/20 bg-card/70 p-4 shadow-[0_12px_32px_-18px_hsl(var(--primary)/0.3)] backdrop-blur-xl backdrop-saturate-150">
                {riskAiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 animate-pulse text-primary" />Analisando risco, retorno e prioridades de ação...</div>
                ) : (
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:text-foreground prose-headings:text-foreground prose-strong:text-foreground">
                    <ReactMarkdown>{riskAiReport}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
