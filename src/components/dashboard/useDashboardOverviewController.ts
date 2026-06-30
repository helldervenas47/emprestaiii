import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChartOverrides } from "@/hooks/useChartOverrides";
import { useMonthlyGoals } from "@/hooks/useMonthlyGoals";
import { listLedger, type LedgerEntry } from "@/lib/ledger";
import { getRange, type Period } from "@/components/dashboard/dashboardHelpers";
import { useAccountBalance } from "@/components/dashboard/useAccountBalance";

/**
 * Controller hook do DashboardOverview.
 *
 * Centraliza estados, navegação de período, carregamento do ledger,
 * memos básicos (range / goal keys) e handlers utilitários — sem alterar
 * regra de negócio nem nomes públicos do componente.
 */
export function useDashboardOverviewController() {
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [comparisonWindow, setComparisonWindow] = useState<3 | 6 | 12>(6);
  const [showAllTx, setShowAllTx] = useState(false);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
  const [overdueDialogOpen, setOverdueDialogOpen] = useState(false);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  const [accountBalance, setAccountBalance] = useAccountBalance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [includeSales, setIncludeSales] = useState(false);
  const [showInterestDetail, setShowInterestDetail] = useState(false);
  const [receivedDetailMethodId, setReceivedDetailMethodId] = useState<string | null>(null);
  const [showInterestExpectedDetail, setShowInterestExpectedDetail] = useState(false);
  const [interestExpectedFilter, setInterestExpectedFilter] = useState<"all" | "pending" | "overdue">("all");
  const [interestReceivedSearch, setInterestReceivedSearch] = useState("");
  const [interestExpectedSearch, setInterestExpectedSearch] = useState("");
  const [showHealthInfo, setShowHealthInfo] = useState(false);
  const [riskAiOpen, setRiskAiOpen] = useState(false);
  const [riskAiLoading, setRiskAiLoading] = useState(false);
  const [riskAiReport, setRiskAiReport] = useState("");
  const [riskAiTitle, setRiskAiTitle] = useState("Relatório IA para reduzir risco");
  const [cachedInsightReports, setCachedInsightReports] = useState<Record<string, string>>({});
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const prefetchingInsightReportsRef = useRef<Set<string>>(new Set());

  const { chartOverrides, setChartOverrides, interestOverrides, setInterestOverrides } = useChartOverrides();
  const { getGoal } = useMonthlyGoals();

  useEffect(() => {
    let alive = true;
    const loadLedger = async () => {
      const entries = await listLedger();
      if (alive) setLedgerEntries(entries);
    };
    loadLedger();
    window.addEventListener("ledger:changed", loadLedger);
    window.addEventListener("balance:changed", loadLedger);
    window.addEventListener("offline-sync:flushed", loadLedger);
    window.addEventListener("focus", loadLedger);
    return () => {
      alive = false;
      window.removeEventListener("ledger:changed", loadLedger);
      window.removeEventListener("balance:changed", loadLedger);
      window.removeEventListener("offline-sync:flushed", loadLedger);
      window.removeEventListener("focus", loadLedger);
    };
  }, []);

  const range = useMemo(() => getRange(period, offset), [period, offset]);

  const goalMonthKey = useMemo(
    () => `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`,
    [range],
  );
  const interestGoal = getGoal("interest_rate", goalMonthKey);
  const profitGoal = getGoal("profit", goalMonthKey);

  const handleChangePeriod = useCallback((p: Period) => {
    setPeriod(p);
    setOffset(0);
  }, []);

  const startEditBalance = useCallback(() => {
    setTempBalance(String(accountBalance));
    setEditingBalance(true);
  }, [accountBalance]);
  const saveBalance = useCallback(() => {
    setAccountBalance(parseFloat(tempBalance) || 0);
    setEditingBalance(false);
  }, [tempBalance, setAccountBalance]);
  const cancelEditBalance = useCallback(() => setEditingBalance(false), []);

  return {
    // periodo
    period, setPeriod, offset, setOffset, handleChangePeriod,
    range, goalMonthKey, interestGoal, profitGoal,
    // listagens / filtros
    txFilter, setTxFilter,
    comparisonWindow, setComparisonWindow,
    showAllTx, setShowAllTx,
    expandedBreakdown, setExpandedBreakdown,
    overdueDialogOpen, setOverdueDialogOpen,
    expandedInsightId, setExpandedInsightId,
    // saldo
    accountBalance, setAccountBalance,
    editingBalance, setEditingBalance,
    tempBalance, setTempBalance,
    startEditBalance, saveBalance, cancelEditBalance,
    // toggles / detalhes
    includeSales, setIncludeSales,
    showInterestDetail, setShowInterestDetail,
    receivedDetailMethodId, setReceivedDetailMethodId,
    showInterestExpectedDetail, setShowInterestExpectedDetail,
    interestExpectedFilter, setInterestExpectedFilter,
    interestReceivedSearch, setInterestReceivedSearch,
    interestExpectedSearch, setInterestExpectedSearch,
    showHealthInfo, setShowHealthInfo,
    // risk AI
    riskAiOpen, setRiskAiOpen,
    riskAiLoading, setRiskAiLoading,
    riskAiReport, setRiskAiReport,
    riskAiTitle, setRiskAiTitle,
    cachedInsightReports, setCachedInsightReports,
    // ledger
    ledgerEntries, setLedgerEntries,
    prefetchingInsightReportsRef,
    // overrides
    chartOverrides, setChartOverrides,
    interestOverrides, setInterestOverrides,
    // goals util
    getGoal,
  };
}
