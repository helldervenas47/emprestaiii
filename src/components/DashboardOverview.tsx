import { useCallback, useEffect } from "react";
import { useDashboardLoanTotals } from "@/hooks/useDashboardLoanTotals";
import { useAuth } from "@/hooks/useAuth";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Sale, Payment, Expense, InstallmentSchedule, Client } from "@/types/loan";
import { ManagerCommissionsChart } from "@/components/ManagerCommissionsChart";
import { GoalsCard } from "@/components/GoalsCard";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { rawFormatCurrency } from "@/components/dashboard/dashboardHelpers";
import { DashboardPeriodFilter } from "@/components/dashboard/DashboardPeriodFilter";
import { DashboardFinancialHealthSection } from "@/components/dashboard/DashboardFinancialHealthSection";
import { DashboardMainCards } from "@/components/dashboard/DashboardMainCards";
import { DashboardPortfolioMetrics } from "@/components/dashboard/DashboardPortfolioMetrics";
import { DashboardBreakdownSection } from "@/components/dashboard/DashboardBreakdownSection";
import { DashboardChartsSection } from "@/components/dashboard/DashboardChartsSection";
import { DashboardInsightsSection } from "@/components/dashboard/DashboardInsightsSection";
import { useDashboardOverviewController } from "@/components/dashboard/useDashboardOverviewController";
import { useDashboardMetrics } from "@/components/dashboard/useDashboardMetrics";
import { useDashboardAiReports } from "@/components/dashboard/useDashboardAiReports";
import { usePatrimonioPublisher } from "@/hooks/usePatrimonioPublisher";

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
  usePatrimonioPublisher(loans);
  const { mask } = useHideValues();
  const { role } = useAuth();
  const { renegotiations } = useLoanRenegotiations();
  const { methods: paymentMethods } = usePaymentMethods();
  const isMobile = useIsMobile();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const controller = useDashboardOverviewController();
  const {
    period, offset, setOffset, handleChangePeriod,
    range, goalMonthKey, interestGoal, profitGoal,
    txFilter, setTxFilter,
    comparisonWindow,
    showAllTx, setShowAllTx,
    expandedBreakdown, setExpandedBreakdown,
    overdueDialogOpen, setOverdueDialogOpen,
    accountBalance,
    editingBalance,
    tempBalance, setTempBalance,
    saveBalance, cancelEditBalance,
    includeSales, setIncludeSales,
    showInterestDetail, setShowInterestDetail,
    receivedDetailMethodId, setReceivedDetailMethodId,
    showInterestExpectedDetail, setShowInterestExpectedDetail,
    interestExpectedFilter, setInterestExpectedFilter,
    interestReceivedSearch, setInterestReceivedSearch,
    interestExpectedSearch, setInterestExpectedSearch,
    showHealthInfo, setShowHealthInfo,
    riskAiOpen, setRiskAiOpen,
    riskAiLoading,
    riskAiReport,
    riskAiTitle,
    ledgerEntries,
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

  // P0-03 (etapa A): RPC agregada em MODO COMPARAÇÃO.
  // Não substitui os cards — apenas registra divergências no console em dev
  // para validar a paridade antes de migrarmos os cards.
  const { data: rpcTotals, missing: rpcMissing } = useDashboardLoanTotals({
    start: range.start,
    end: range.end,
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (rpcMissing) {
      console.warn(
        "[dashboard_loan_totals] RPC não publicada. Rode supabase/sql/p0_03_dashboard_loan_totals.sql.",
      );
      return;
    }
    if (!rpcTotals) return;
    const front = {
      total_received: Number(data?.income || 0),
      remaining_capital: Number(portfolio?.remainingCapital || 0),
      overdue_count: Number(portfolio?.overdueCount || 0),
    };
    const rpc = {
      total_received: rpcTotals.total_received,
      remaining_capital: rpcTotals.remaining_capital,
      overdue_count: rpcTotals.overdue_count,
    };
    const diffs: Record<string, { front: number; rpc: number; delta: number }> = {};
    (Object.keys(front) as (keyof typeof front)[]).forEach((k) => {
      const delta = Math.abs(front[k] - rpc[k]);
      if (delta > 0.5) diffs[k] = { front: front[k], rpc: rpc[k], delta };
    });
    if (Object.keys(diffs).length > 0) {
      console.warn("[dashboard_loan_totals] divergências", {
        range: range.label, diffs,
      });
    } else {
      console.info("[dashboard_loan_totals] ✔ paridade OK", { range: range.label, rpc });
    }
  }, [rpcTotals, rpcMissing, data, portfolio, range.label]);

  const { generateRiskAiReport } = useDashboardAiReports({
    controller,
    formatCurrency,
    role,
    monthComparison,
    interestGoal,
    riskReturn,
    yearlyAverages,
    portfolio,
    data,
    range,
  });

  return (
    <div className="space-y-6">
      <DashboardPeriodFilter
        rangeLabel={range.label}
        period={period}
        offset={offset}
        onPrev={() => setOffset(offset - 1)}
        onNext={() => setOffset(offset + 1)}
        onReset={() => setOffset(0)}
        onChangePeriod={handleChangePeriod}
      />

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

      <DashboardPortfolioMetrics
        portfolio={portfolio}
        periodProfitRealized={data.periodProfitRealized}
        periodProfitExpected={data.periodProfitExpected}
        formatCurrency={formatCurrency}
        onOpenInterestReceived={() => setShowInterestDetail(true)}
        onOpenInterestExpectedAll={() => { setInterestExpectedFilter("all"); setShowInterestExpectedDetail(true); }}
        onOpenInterestPending={() => { setInterestExpectedFilter("pending"); setShowInterestExpectedDetail(true); }}
      />

      <DashboardFinancialHealthSection
        portfolio={portfolio}
        rangeLabel={range.label}
        installmentSchedules={installmentSchedules}
        formatCurrency={formatCurrency}
        overdueDialogOpen={overdueDialogOpen}
        setOverdueDialogOpen={setOverdueDialogOpen}
        onOpenHealthInfo={() => setShowHealthInfo(true)}
      />

      <GoalsCard loans={loans} payments={payments} expenses={expenses} clients={clients ?? []} installmentSchedules={installmentSchedules} renegotiations={renegotiations} selectedMonth={goalMonthKey} periodLabel={range.label} />

      <ManagerCommissionsChart clients={clients} loans={loans} installmentSchedules={installmentSchedules} payments={payments} range={{ start: range.start, end: range.end }} rangeLabel={range.label} />

      <DashboardChartsSection
        readOnly={readOnly}
        formatCurrency={formatCurrency}
        riskReturn={riskReturn}
        yearlyAverages={yearlyAverages}
        onRiskAiClick={generateRiskAiReport}
        monthlyChart={monthlyChart}
        monthlyChartBase={monthlyChartBase}
        interestChart={interestChart}
        interestChartBase={interestChartBase}
        setChartOverrides={setChartOverrides}
        setInterestOverrides={setInterestOverrides}
      />

      <DashboardBreakdownSection
        data={data}
        loans={loans}
        includeSales={includeSales}
        setIncludeSales={setIncludeSales}
        expandedBreakdown={expandedBreakdown}
        setExpandedBreakdown={setExpandedBreakdown}
        formatCurrency={formatCurrency}
      />

      <DashboardInsightsSection
        readOnly={readOnly}
        isMobile={isMobile}
        rangeLabel={range.label}
        formatCurrency={formatCurrency}
        data={data}
        receivedDetail={receivedDetail}
        txFilter={txFilter}
        setTxFilter={setTxFilter}
        showAllTx={showAllTx}
        setShowAllTx={setShowAllTx}
        onDeletePayment={onDeletePayment}
        onDeleteSale={onDeleteSale}
        onDeleteLoan={onDeleteLoan}
        showHealthInfo={showHealthInfo}
        setShowHealthInfo={setShowHealthInfo}
        showInterestDetail={showInterestDetail}
        setShowInterestDetail={setShowInterestDetail}
        interestReceivedSearch={interestReceivedSearch}
        setInterestReceivedSearch={setInterestReceivedSearch}
        receivedDetailMethodId={receivedDetailMethodId}
        setReceivedDetailMethodId={setReceivedDetailMethodId}
        showInterestExpectedDetail={showInterestExpectedDetail}
        setShowInterestExpectedDetail={setShowInterestExpectedDetail}
        interestExpectedFilter={interestExpectedFilter}
        setInterestExpectedFilter={setInterestExpectedFilter}
        interestExpectedSearch={interestExpectedSearch}
        setInterestExpectedSearch={setInterestExpectedSearch}
        riskAiOpen={riskAiOpen}
        setRiskAiOpen={setRiskAiOpen}
        riskAiLoading={riskAiLoading}
        riskAiReport={riskAiReport}
        riskAiTitle={riskAiTitle}
        generateRiskAiReport={generateRiskAiReport}
      />
    </div>
  );
}
