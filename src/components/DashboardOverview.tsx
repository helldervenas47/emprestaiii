import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { useChartOverrides } from "@/hooks/useChartOverrides";
import { useMonthlyGoals } from "@/hooks/useMonthlyGoals";
import { calculateMonthlyInterestRate } from "@/lib/monthlyInterestRate";
import { useAuth } from "@/hooks/useAuth";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
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
import { getBalance, setBalance } from "@/lib/balance";
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

const InfoPopover = ({ text }: { text: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 left-2 p-1 -m-1 text-muted-foreground hover:text-foreground transition-colors z-10"
        aria-label="Mais informações"
      >
        <Info className="h-3 w-3" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      side="top"
      align="start"
      className="w-64 text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {text}
    </PopoverContent>
  </Popover>
);

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

type Period = "day" | "week" | "month";

const periodLabels: Record<Period, string> = { day: "Dia", week: "Semana", month: "Mês" };

const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function isInRange(dateStr: string, start: Date, end: Date): boolean {
  const date = new Date(dateStr + "T00:00:00");
  return date >= start && date <= end;
}

function getRange(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "day") {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    return { start: d, end, label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) };
  }
  if (period === "week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + offset * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return {
      start: weekStart, end: weekEnd,
      label: `${weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${weekEnd.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`,
    };
  }
  // month
  const m = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: m, end: mEnd, label: `${monthNames[m.getMonth()]} ${m.getFullYear()}` };
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDelta(value: number | null, suffix = "%") {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function getSaleReceivedAmount(sale: Sale) {
  let received = 0;
  if (sale.installmentAmounts && sale.installmentAmounts.length > 0) {
    for (let i = 0; i < sale.paidInstallments; i++) received += sale.installmentAmounts[i] || 0;
  } else if (sale.installmentValue) {
    received = sale.paidInstallments * sale.installmentValue;
  } else if (sale.installments > 0) {
    received = sale.paidInstallments * (sale.total / sale.installments);
  }
  return received + (sale.partialPaid || 0);
}

function getClientKey(loan: Loan) {
  return loan.borrowerId || loan.borrowerName.trim().toLocaleLowerCase("pt-BR");
}

function calculateRealizedProfitForRange(loans: Loan[], payments: Payment[], start: Date, end: Date) {
  const paymentsInPeriod = payments.filter((p) => isInRange(p.date, start, end));
  const quitadoLoanIds = new Set<string>();

  loans.forEach((loan) => {
    if (loan.status !== "paid") return;
    const loanPays = payments.filter((payment) => payment.loanId === loan.id);
    if (loanPays.length === 0) return;
    const lastPayDate = loanPays.reduce((max, payment) => payment.date > max ? payment.date : max, loanPays[0].date);
    if (isInRange(lastPayDate, start, end)) quitadoLoanIds.add(loan.id);
  });

  const interestOnlyProfit = paymentsInPeriod
    .filter((payment) => payment.installmentNumber === 0 && !quitadoLoanIds.has(payment.loanId))
    .reduce((sum, payment) => sum + payment.amount, 0);

  const quitadoProfit = Array.from(quitadoLoanIds).reduce((sum, loanId) => {
    const loan = loans.find((item) => item.id === loanId);
    if (!loan) return sum;
    const totalPaid = payments.filter((payment) => payment.loanId === loanId).reduce((acc, payment) => acc + payment.amount, 0);
    return sum + Math.max(0, totalPaid - loan.amount);
  }, 0);

  const activeInstallmentProfit = paymentsInPeriod
    .filter((payment) => payment.installmentNumber !== 0 && !quitadoLoanIds.has(payment.loanId))
    .reduce((sum, payment) => {
      const loan = loans.find((item) => item.id === payment.loanId);
      if (!loan) return sum;
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      return sum + (payment.amount * interestRatio);
    }, 0);

  return interestOnlyProfit + quitadoProfit + activeInstallmentProfit;
}

function summarizeMonthMetrics(loans: Loan[], sales: Sale[], payments: Payment[], includeSales: boolean, start: Date, end: Date, installmentSchedules: InstallmentSchedule[] = []) {
  const monthPayments = payments.filter((payment) => isInRange(payment.date, start, end));
  const monthSales = sales.filter((sale) => isInRange(sale.date, start, end));
  const monthLoans = loans.filter((loan) => isInRange(loan.startDate, start, end));
  const activeLoans = loans.filter((loan) => loan.status !== "paid");
  const revenue = monthPayments.reduce((sum, payment) => sum + payment.amount, 0)
    + (includeSales ? monthSales.reduce((sum, sale) => sum + getSaleReceivedAmount(sale), 0) : 0);
  const serviceVolume = monthPayments.length + (includeSales ? monthSales.length : 0);
  const ticketAverage = serviceVolume > 0 ? revenue / serviceVolume : 0;
  const clientRevenue = new Map<string, number>();

  monthPayments.forEach((payment) => {
    const loan = loans.find((item) => item.id === payment.loanId);
    const key = loan ? getClientKey(loan) : payment.loanId;
    clientRevenue.set(key, (clientRevenue.get(key) ?? 0) + payment.amount);
  });

  if (includeSales) {
    monthSales.forEach((sale) => {
      const key = sale.customerName.trim().toLocaleLowerCase("pt-BR");
      clientRevenue.set(key, (clientRevenue.get(key) ?? 0) + getSaleReceivedAmount(sale));
    });
  }

  const overdueBase = activeLoans.filter((loan) => isInRange(loan.dueDate, start, end));
  const todayStr = todayInAppTz();
  const overdueLoans = overdueBase.filter((loan) => getOverdueInstallments(loan, installmentSchedules, todayStr).length > 0);
  const overdueAmount = overdueLoans.reduce((sum, loan) => sum + getOverdueAmount(loan, installmentSchedules, todayStr), 0);
  const overdueRate = overdueBase.length > 0 ? overdueLoans.length / overdueBase.length : 0;
  const top3Share = revenue > 0
    ? Array.from(clientRevenue.values()).sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) / revenue
    : 0;

  return {
    revenue,
    profit: calculateRealizedProfitForRange(loans, payments, start, end),
    interestRate: calculateMonthlyInterestRate(monthLoans).rate,
    serviceVolume,
    ticketAverage,
    overdueRate,
    overdueAmount,
    top3Share,
  };
}


// Subscribe to balance changes via offline-sync events + light polling
function useAccountBalance(): [number, (v: number) => void] {
  const [bal, setBal] = useState(0);
  useEffect(() => {
    const load = () => { getBalance().then(setBal); };
    load();
    const interval = setInterval(load, 10000);
    const onSync = () => load();
    window.addEventListener("offline-sync:flushed", onSync);
    window.addEventListener("offline-sync:pending-changed", onSync);
    window.addEventListener("focus", onSync);
    window.addEventListener("balance:changed", onSync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("offline-sync:flushed", onSync);
      window.removeEventListener("offline-sync:pending-changed", onSync);
      window.removeEventListener("focus", onSync);
      window.removeEventListener("balance:changed", onSync);
    };
  }, []);
  const update = (v: number) => { setBalance(v); setBal(v); };
  return [bal, update];
}

export function DashboardOverview({ loans, sales, payments, expenses, installmentSchedules = [], clients = [], onDeletePayment, onDeleteSale, onDeleteLoan, readOnly = false }: Props) {
  const { mask } = useHideValues();
  const { role } = useAuth();
  const { renegotiations } = useLoanRenegotiations();
  const { methods: paymentMethods } = usePaymentMethods();
  const isMobile = useIsMobile();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
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
  const [interestExpectedFilter, setInterestExpectedFilter] = useState<"all" | "pending">("all");
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

  // Use the month of range.start as the goal key (works for any period)
  const goalMonthKey = useMemo(
    () => `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`,
    [range]
  );
  const interestGoal = getGoal("interest_rate", goalMonthKey);
  const profitGoal = getGoal("profit", goalMonthKey);

  // Helper to get chart month label from a date range
  const getChartLabel = (start: Date) => {
    return `${monthNames[start.getMonth()].slice(0, 3)}/${String(start.getFullYear()).slice(2)}`;
  };

  const data = useMemo(() => {
    const filteredPayments = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const filteredSales = sales.filter((s) => isInRange(s.date, range.start, range.end));
    let incomeFromPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);

    // Receitas de vendas no período: considera TODAS as vendas (não só as criadas no período),
    // somando entrada (se a venda é do período) + cada recebimento do paymentHistory cuja data
    // caia no período. Para vendas antigas sem paymentHistory, usa fallback proporcional apenas
    // se a venda foi criada no período (mantém comportamento legado).
    const salesWithReceived = sales.filter((sale) => sale.businessType !== "aluguel_veiculo").map((sale) => {
      const history = sale.paymentHistory || [];
      let received = 0;
      const receipts: { amount: number; date: string; type: "downPayment" | "full" | "partial" | "legacy" }[] = [];

      // Entrada (downPayment) — atribuída à data da venda
      if ((sale.downPayment || 0) > 0 && isInRange(sale.date, range.start, range.end)) {
        received += sale.downPayment;
        receipts.push({ amount: sale.downPayment, date: sale.date, type: "downPayment" });
      }

      if (history.length > 0) {
        // Usa histórico de pagamentos (filtrado pela data do recebimento)
        history.forEach((rec) => {
          if (isInRange(rec.date, range.start, range.end)) {
            received += rec.amount || 0;
            receipts.push({ amount: rec.amount || 0, date: rec.date, type: rec.type });
          }
        });
      } else {
        // Fallback legado para vendas sem paymentHistory:
        // Se houver installmentDates, atribui cada parcela paga à sua data de vencimento.
        // Caso contrário, atribui tudo à data da venda (somente se a venda for do período).
        const dates = sale.installmentDates || [];
        const amounts = sale.installmentAmounts || [];
        const fallbackInstAmount = sale.installmentValue
          || (sale.installments > 0 ? sale.total / sale.installments : 0);

        if (dates.length > 0 && sale.paidInstallments > 0) {
          for (let i = 0; i < sale.paidInstallments; i++) {
            const d = dates[i];
            const amt = amounts[i] ?? fallbackInstAmount;
            if (d && isInRange(d, range.start, range.end) && amt > 0) {
              received += amt;
              receipts.push({ amount: amt, date: d, type: "legacy" });
            }
          }
          if ((sale.partialPaid || 0) > 0 && isInRange(sale.date, range.start, range.end)) {
            received += sale.partialPaid;
            receipts.push({ amount: sale.partialPaid, date: sale.date, type: "legacy" });
          }
        } else if (isInRange(sale.date, range.start, range.end)) {
          let legacy = 0;
          if (amounts.length > 0) {
            for (let i = 0; i < sale.paidInstallments; i++) legacy += amounts[i] || 0;
          } else {
            legacy = sale.paidInstallments * fallbackInstAmount;
          }
          legacy += sale.partialPaid || 0;
          if (legacy > 0) {
            received += legacy;
            receipts.push({ amount: legacy, date: sale.date, type: "legacy" });
          }
        }
      }

      return { ...sale, received, receipts };
    }).filter((s) => s.received > 0);

    const incomeFromSales = salesWithReceived.reduce((s, x) => s + x.received, 0);

    const filteredLoans = loans.filter((l) => isInRange(l.startDate, range.start, range.end));
    let totalLoanOutgoing = filteredLoans.reduce((s, l) => s + l.amount, 0);

    const filteredExpenses = expenses.filter((e) => e.paid && e.paidDate && isInRange(e.paidDate, range.start, range.end));
    const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

    // Apply chart overrides when viewing a month period
    if (period === "month") {
      const label = getChartLabel(range.start);
      const override = chartOverrides[label];
      if (override) {
        if (override.emprestado !== undefined) totalLoanOutgoing += override.emprestado;
        if (override.recebido !== undefined) incomeFromPayments += override.recebido;
      }
    }

    const totalIncome = incomeFromPayments + (includeSales ? incomeFromSales : 0);
    const totalOutgoing = totalLoanOutgoing + totalExpenses;
    const balance = totalIncome - totalOutgoing;

    const transactions: { id: string; type: "in" | "out"; source: "payment" | "sale" | "loan" | "expense" | "ledger"; description: string; amount: number; date: string; createdAt?: string }[] = [];
    const visibleLoanIds = new Set(loans.map((loan) => loan.id));
    const visiblePaymentLedgerEntries = ledgerEntries.filter((entry) => (
      entry.category === "payment"
      && entry.direction === "in"
      && (!entry.loan_id || visibleLoanIds.has(entry.loan_id))
      && isInRange(entry.occurred_on, range.start, range.end)
    ));
    const paymentIdsFromLedger = new Set(
      visiblePaymentLedgerEntries
        .filter((entry) => entry.payment_id)
        .map((entry) => entry.payment_id as string),
    );

    filteredPayments.forEach((p) => {
      if (paymentIdsFromLedger.has(p.id)) return;
      const metadata = p.metadata ?? {};
      if (metadata.kind === "late_fee" && typeof metadata.consolidated_with === "string" && paymentIdsFromLedger.has(metadata.consolidated_with)) return;
      const loan = loans.find((l) => l.id === p.loanId);
      transactions.push({ id: p.id, type: "in", source: "payment", description: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`, amount: p.amount, date: p.date, createdAt: p.createdAt });
    });
    visiblePaymentLedgerEntries
      .forEach((entry) => {
        transactions.push({
          id: entry.payment_id || entry.id,
          type: "in",
          source: entry.payment_id ? "payment" : "ledger",
          description: entry.description || "Pagamento recebido",
          amount: Number(entry.amount) || 0,
          date: entry.occurred_on,
          createdAt: entry.created_at,
        });
      });
    filteredLoans.forEach((l) => {
      transactions.push({ id: l.id, type: "out", source: "loan", description: `Empréstimo para ${l.borrowerName}`, amount: l.amount, date: l.startDate });
    });
    filteredExpenses.forEach((e) => {
      transactions.push({ id: e.id, type: "out", source: "expense", description: `Despesa: ${e.description}`, amount: e.amount, date: e.paidDate! });
    });
    transactions.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    const monthlyInterestRate = calculateMonthlyInterestRate(filteredLoans);

    // Juros previstos do período — porção de juros das parcelas com vencimento no período
    // Inclui TODOS os contratos (ativos, atrasados E quitados) — bruto, sem subtrair pagamentos.
    const interestExpectedRecords: { borrowerName: string; dueDate: string; installmentNumber: number; totalInstallments: number; installmentAmount: number; interestPortion: number; loanStatus: string; paid: boolean; tags: string[] }[] = [];
    const periodProfitExpected = loans.reduce((sum, loan) => {
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const totalInterest = Math.max(0, totalWithInterest - loan.amount);
      if (totalInterest <= 0) return sum;
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      const isInstallmentPaid = (n: number) => loan.status === "paid" || n <= (loan.paidInstallments || 0);

      if (loan.installments >= 2) {
        const interestPerInstallment = totalInterest / loan.installments;
        const loanSchedules = installmentSchedules.filter((sc) => sc.loanId === loan.id);
        if (loanSchedules.length > 0) {
          let acc = 0;
          loanSchedules
            .filter((sc) => isInRange(sc.dueDate, range.start, range.end))
            .forEach((sc) => {
              const interest = sc.amount * interestRatio;
              acc += interest;
              interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: sc.dueDate, installmentNumber: sc.installmentNumber, totalInstallments: loan.installments, installmentAmount: sc.amount, interestPortion: interest, loanStatus: loan.status, paid: isInstallmentPaid(sc.installmentNumber), tags: loan.tags || [] });
            });
          return sum + acc;
        }
        if (!loan.dueDate) return sum;
        const baseDate = new Date(loan.dueDate + "T00:00:00");
        if (isNaN(baseDate.getTime())) return sum;
        const installmentAmount = totalWithInterest / loan.installments;
        let acc = 0;
        for (let i = 0; i < loan.installments; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (isInRange(dStr, range.start, range.end)) {
            acc += interestPerInstallment;
            interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: dStr, installmentNumber: i + 1, totalInstallments: loan.installments, installmentAmount, interestPortion: interestPerInstallment, loanStatus: loan.status, paid: isInstallmentPaid(i + 1), tags: loan.tags || [] });
          }
        }
        return sum + acc;
      }
      // Parcela única
      if (loan.dueDate && isInRange(loan.dueDate, range.start, range.end)) {
        interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: loan.dueDate, installmentNumber: 1, totalInstallments: 1, installmentAmount: totalWithInterest, interestPortion: totalInterest, loanStatus: loan.status, paid: isInstallmentPaid(1), tags: loan.tags || [] });
        return sum + totalInterest;
      }
      return sum;
    }, 0);

    // Pagamentos somente de juros (installmentNumber === 0) feitos no período empurram
    // a parcela seguinte para o próximo vencimento, removendo-a do "Previsto" do período.
    // Para manter o Previsto estável, somamos de volta o valor desses juros pagos no período.
    const interestOnlyInPeriod = payments
      .filter((p) => p.installmentNumber === 0 && isInRange(p.date, range.start, range.end))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const periodProfitExpectedWithInterestOnly = periodProfitExpected + interestOnlyInPeriod;

    interestExpectedRecords.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    
    // ===== Lucro Realizado — Contabilidade "juros primeiro" por contrato =====
    // Regra:
    //  - Pagamentos com installmentNumber === 0 (juros avulsos / juros sobre saldo): valor integral é juros.
    //  - Demais pagamentos amortizam primeiro o juros pendente do contrato (juros total esperado − juros já pago),
    //    o restante vai para o principal.
    //  - Na quitação (loan.status === 'paid'), qualquer juros/lucro residual (incl. acordos com valor maior que o esperado)
    //    é alocado integralmente ao último pagamento — garantindo que "Lucro na quitação" reflita o restante.
    //  - Descontos (totalPago < totalEsperado) reduzem o juros do último pagamento.
    const paymentsInPeriod = payments.filter((p) => isInRange(p.date, range.start, range.end));

    // Ordena pagamentos cronologicamente por contrato (date asc, depois createdAt como desempate)
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });

    // Mapa: pagamentoId → juros alocado
    const interestByPaymentId = new Map<string, number>();
    // Juros restante por contrato durante o processamento
    const loanInterestRemaining = new Map<string, number>();
    loans.forEach((l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      loanInterestRemaining.set(l.id, Math.max(0, total - l.amount));
    });

    // Alocação juros-primeiro por pagamento
    paymentsSorted.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt <= 0) {
        interestByPaymentId.set(p.id, 0);
        return;
      }
      if (p.installmentNumber === 0 || p.installmentNumber === -2) {
        // Juros avulso / juros sobre saldo / multa-encargos (late_fee): 100% juros
        interestByPaymentId.set(p.id, amt);
        // Não capa por loanInterestRemaining — juros excedente (rolagem, multa) é receita real
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - amt));
      } else if (p.installmentNumber === -3) {
        // Amortização: 100% principal, 0% juros
        interestByPaymentId.set(p.id, 0);
      } else if (p.installmentNumber === -1) {
        // Pagamento parcial: aloca juros proporcionalmente à composição da operação
        // (juros total / total com juros), abatendo o restante do principal.
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      } else {
        // Parcela regular: juros proporcional à composição da operação
        // (cada parcela contém a mesma proporção de juros/principal).
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      }
    });

    // Conjunto de loans quitados (para classificar tipo "quitação" no detalhe)
    const paidLoanIds = new Set(loans.filter((l) => l.status === "paid").map((l) => l.id));
    // Último pagamento por contrato (após ordenação cronológica)
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });

    // Ajuste de quitação: lucro residual ou desconto vai para o último pagamento
    loans.forEach((l) => {
      if (l.status !== "paid") return;
      const lastId = lastPaymentByLoanId.get(l.id);
      if (!lastId) return;
      const totalPaid = payments
        .filter((p) => p.loanId === l.id)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      // Principal de referência para apurar o lucro real: usa o PRINCIPAL ORIGINAL
      // (imutável). Cair em l.amount apenas como fallback para contratos legados
      // sem o campo populado. Isso evita superestimar o lucro quando há
      // amortizações que reduziram o saldo principal vigente.
      const principalRef = l.originalAmount != null && l.originalAmount > 0 ? l.originalAmount : l.amount;
      const totalExpected = calculateTotalWithInterest(principalRef, l.interestRate, l.installments);
      const expectedInterest = Math.max(0, totalExpected - principalRef);
      // Juros já alocado para este contrato
      const allocatedInterest = payments
        .filter((p) => p.loanId === l.id)
        .reduce((s, p) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
      // Lucro real = totalPago - principal original (incl. acordos com bônus ou desconto)
      const realProfit = totalPaid - principalRef;
      const diff = realProfit - allocatedInterest;
      if (Math.abs(diff) < 0.005) return;
      const cur = interestByPaymentId.get(lastId) ?? 0;
      interestByPaymentId.set(lastId, Math.max(0, cur + diff));
      // Atualiza expectedInterest no remaining (não usado adiante mas mantém consistência)
      loanInterestRemaining.set(l.id, 0);
      void expectedInterest;
    });

    // Lucro realizado no período = soma do juros alocado aos pagamentos do período
    const periodProfitRealized = paymentsInPeriod.reduce(
      (s, p) => s + (interestByPaymentId.get(p.id) ?? 0),
      0,
    );

    // Build detail records para "Juros Recebidos no Mês"
    const interestDetailRecords: { borrowerName: string; date: string; totalPayment: number; interestPortion: number; type: "juros" | "quitação" | "parcial"; tags: string[] }[] = [];
    paymentsInPeriod.forEach((p) => {
      const interest = interestByPaymentId.get(p.id) ?? 0;
      if (interest <= 0.005) return;
      const loan = loans.find((l) => l.id === p.loanId);
      if (!loan) return;
      const isLastOfPaid = paidLoanIds.has(loan.id) && lastPaymentByLoanId.get(loan.id) === p.id;
      const type: "juros" | "quitação" | "parcial" = isLastOfPaid
        ? "quitação"
        : p.installmentNumber === -1
          ? "parcial"
          : "juros";
      interestDetailRecords.push({
        borrowerName: loan.borrowerName,
        date: p.date,
        totalPayment: Number(p.amount) || 0,
        interestPortion: interest,
        type,
        tags: loan.tags || [],
      });
    });
    interestDetailRecords.sort((a, b) => b.date.localeCompare(a.date));
    
    const totalProfitExpected = interestExpectedRecords
      .filter((r) => !r.paid)
      .reduce((s, r) => s + r.interestPortion, 0);
    const totalProfitRealized = periodProfitRealized;
    const previstoTotal = totalProfitRealized + totalProfitExpected;
    const periodProfitPct = previstoTotal > 0 ? Math.round((totalProfitRealized / previstoTotal) * 100) : 0;

    // salesWithReceived já calculado acima usando paymentHistory + entrada (filtro por data do recebimento)

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length, monthlyInterestRate, filteredPayments, filteredLoans, filteredExpenses, salesWithReceived, periodProfitExpected: totalProfitExpected, periodProfitRealized: totalProfitRealized, periodProfitPct, interestDetailRecords, interestExpectedRecords };
  }, [loans, sales, payments, expenses, range, includeSales, period, chartOverrides, installmentSchedules, ledgerEntries]);

  // Recebido por forma de pagamento (apenas pagamentos de empréstimos no período)
  const receivedByMethod = useMemo(() => {
    const byId: Record<string, number> = {};
    let unassigned = 0;
    let total = 0;
    data.filteredPayments.forEach((p) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0) return;
      total += amount;
      const split = (p.metadata as any)?.split?.parts as Array<{ paymentMethodId: string | null; amount: number }> | undefined;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((part) => {
          const v = Number(part.amount) || 0;
          if (v <= 0) return;
          if (part.paymentMethodId) byId[part.paymentMethodId] = (byId[part.paymentMethodId] || 0) + v;
          else unassigned += v;
        });
      } else if (p.paymentMethodId) {
        byId[p.paymentMethodId] = (byId[p.paymentMethodId] || 0) + amount;
      } else {
        unassigned += amount;
      }
    });
    const items = paymentMethods
      .map((m) => ({ id: m.id, name: m.name, icon: m.icon, amount: byId[m.id] || 0 }))
      .filter((it) => it.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { total, items, unassigned };
  }, [data.filteredPayments, paymentMethods]);

  const receivedDetail = useMemo(() => {
    if (!receivedDetailMethodId) return null;
    const targetId = receivedDetailMethodId === "__unassigned__" ? null : receivedDetailMethodId;
    const method = targetId ? paymentMethods.find((m) => m.id === targetId) : null;
    const methodName = targetId ? (method?.name ?? "Forma desconhecida") : "Sem forma definida";
    type Row = { id: string; date: string; borrowerName: string; amount: number; loanId: string };
    const rows: Row[] = [];
    data.filteredPayments.forEach((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      const borrowerName = loan?.borrowerName ?? "—";
      const split = (p.metadata as any)?.split?.parts as Array<{ paymentMethodId: string | null; amount: number }> | undefined;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((part, idx) => {
          const v = Number(part.amount) || 0;
          if (v <= 0) return;
          if ((part.paymentMethodId ?? null) === targetId) {
            rows.push({ id: `${p.id}-${idx}`, date: p.date, borrowerName, amount: v, loanId: p.loanId });
          }
        });
      } else {
        const amount = Number(p.amount) || 0;
        if (amount <= 0) return;
        const pid = p.paymentMethodId ?? null;
        if (pid === targetId) {
          rows.push({ id: p.id, date: p.date, borrowerName, amount, loanId: p.loanId });
        }
      }
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { methodName, rows, total };
  }, [receivedDetailMethodId, data.filteredPayments, loans, paymentMethods]);

  const profitTargetAmount = useMemo(() => {
    if (!profitGoal) return 0;
    const previstoTotal = data.periodProfitRealized + data.periodProfitExpected;
    return previstoTotal * (profitGoal.targetValue / 100);
  }, [data.periodProfitExpected, data.periodProfitRealized, profitGoal]);

  // Portfolio metrics — global (not filtered by period)
  const portfolio = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status !== "paid");
    const totalLoans = loans.length;

    const allPaymentsForActive = payments.filter((p) => activeLoans.some((l) => l.id === p.loanId));

    // Capital na rua = principal of ALL active loans
    const capitalOnStreet = activeLoans.reduce((s, l) => s + l.amount, 0);

    // Total expected from ALL loans
    const totalExpected = loans.reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    const totalPrincipal = loans.reduce((s, l) => s + l.amount, 0);
    const totalInterestExpected = totalExpected - totalPrincipal;
    const globalInterestRate = totalPrincipal > 0 ? ((totalExpected - totalPrincipal) / totalPrincipal) * 100 : 0;

    // Total a receber = total do contrato + multa/juros atraso + juros recebidos (installmentNumber === 0)
    const todayNorm = new Date(); todayNorm.setHours(0, 0, 0, 0);
    const totalToReceive = activeLoans.reduce((s, l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);

      // Late fees calculation
      const dueDate = new Date(l.dueDate + "T00:00:00");
      const daysLate = Math.max(0, Math.floor((todayNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      let lateFees = 0;
      if (l.lateInterestValue != null && l.lateInterestValue > 0 && daysLate > 0) {
        const baseRemaining = l.remainingAmount != null && l.remainingAmount > 0 ? l.remainingAmount : Math.max(0, total - allPaymentsForActive.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0));
        lateFees += l.lateInterestType === "fixed"
          ? l.lateInterestValue * daysLate
          : baseRemaining * (l.lateInterestValue / 100) * daysLate;
      }
      if (l.penaltyValue != null && l.penaltyValue > 0 && daysLate > 0) {
        lateFees += l.penaltyValue;
      }

      // Interest-only payments received
      const interestPaymentsReceived = payments
        .filter((p) => p.loanId === l.id && p.installmentNumber === 0)
        .reduce((sum, p) => sum + p.amount, 0);

      return s + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
    }, 0);

    // Total received globally
    const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

    // Lucro Estimado = Total a Receber - Capital na Rua
    const estimatedProfit = totalToReceive - capitalOnStreet;

    // Juros a receber no mês: interest portion of installments due this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    let interestDueThisMonth = 0;
    activeLoans.forEach((l) => {
      const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const principalPerInstallment = l.installments > 0 ? l.amount / l.installments : 0;
      const installmentAmount = calculateInstallment(l.amount, l.interestRate, l.installments);
      const interestPerInstallment = installmentAmount - principalPerInstallment;

      if (l.installments >= 2) {
        // Parceled: check each installment schedule due this month
        const schedulesThisMonth = installmentSchedules.filter((sc) => {
          if (sc.loanId !== l.id) return false;
          const d = new Date(sc.dueDate + "T00:00:00");
          return d >= monthStart && d <= monthEnd;
        });
        if (schedulesThisMonth.length > 0) {
          schedulesThisMonth.forEach((sc) => {
            const interestRatio = totalWithInterest > 0 ? 1 - (l.amount / totalWithInterest) : 0;
            interestDueThisMonth += sc.amount * interestRatio;
          });
        } else {
          // Fallback: check if loan due_date falls in this month
          const dueD = new Date(l.dueDate + "T00:00:00");
          if (dueD >= monthStart && dueD <= monthEnd) {
            interestDueThisMonth += interestPerInstallment;
          }
        }
      } else {
        // Single installment: check due date
        const dueD = new Date(l.dueDate + "T00:00:00");
        if (dueD >= monthStart && dueD <= monthEnd) {
          interestDueThisMonth += totalWithInterest - l.amount;
        }
      }
    });

    // Overdue — soma todas as parcelas vencidas, sem saldo futuro ou multa/juros.
    const todayStr = todayInAppTz();
    const overdueLoans = activeLoans.filter((l) => getOverdueInstallments(l, installmentSchedules, todayStr).length > 0);
    const overdueAmount = overdueLoans.reduce((s, l) => s + getOverdueAmount(l, installmentSchedules, todayStr), 0);
    const pendingReceivable = activeLoans.reduce((s, l) => s + getLoanRemainingAmount(l, payments), 0);

    // Rates
    const receivingRate = totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0;
    const defaultRate = totalLoans > 0 ? (overdueLoans.length / totalLoans) * 100 : 0;
    const profitMargin = totalPrincipal > 0 ? ((totalReceived - totalPrincipal) / totalPrincipal) * 100 : 0;

    // Health score
    const receivingScore = Math.min(100, receivingRate);
    const defaultScore = Math.max(0, 100 - defaultRate * 2);
    const profitScore = Math.min(100, Math.max(0, 50 + profitMargin));
    const score = Math.round(receivingScore * 0.4 + defaultScore * 0.35 + profitScore * 0.25);

    // Forecast: next Sunday
    const todayForecast = new Date(); todayForecast.setHours(0, 0, 0, 0);
    const dayOfWeek = todayForecast.getDay(); // 0=Sun
    const nextSunday = new Date(todayForecast);
    if (dayOfWeek === 0) {
      // today is Sunday — use today
    } else {
      nextSunday.setDate(nextSunday.getDate() + (7 - dayOfWeek));
    }
    nextSunday.setHours(23, 59, 59, 999);

    // Forecast: end of month
    const endOfMonth = new Date(todayForecast.getFullYear(), todayForecast.getMonth() + 1, 0, 23, 59, 59, 999);

    const calcForecast = (limitDate: Date) => {
      let sum = 0;
      activeLoans.forEach((l) => {
        if (l.installments >= 2) {
          installmentSchedules.filter((sc) => {
            if (sc.loanId !== l.id) return false;
            if (sc.installmentNumber <= l.paidInstallments) return false;
            const d = new Date(sc.dueDate + "T00:00:00");
            return d <= limitDate;
          }).forEach((sc) => { sum += sc.amount; });
        } else {
          if (l.paidInstallments < 1) {
            const d = new Date(l.dueDate + "T00:00:00");
            if (d <= limitDate) {
              sum += calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            }
          }
        }
      });
      return sum;
    };

    const forecastSunday = calcForecast(nextSunday);
    const forecastEndMonth = calcForecast(endOfMonth);

    return {
      score: Math.max(0, Math.min(100, score)),
      receivingRate: Math.min(100, receivingRate),
      defaultRate,
      totalReceived,
      overdueAmount,
      overdueLoans,
      capitalOnStreet,
      totalToReceive,
      pendingReceivable,
      estimatedProfit,
      interestDueThisMonth,
      globalInterestRate,
      forecastSunday,
      forecastEndMonth,
    };
  }, [loans, payments, installmentSchedules]);



  const monthComparison = useMemo(() => {
    const anchor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const series = Array.from({ length: comparisonWindow }, (_, index) => {
      const monthDate = new Date(anchor.getFullYear(), anchor.getMonth() - (comparisonWindow - 1 - index), 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const metrics = summarizeMonthMetrics(loans, sales, payments, includeSales, monthStart, monthEnd, installmentSchedules);

      return {
        key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
        label: `${monthNames[monthDate.getMonth()].slice(0, 3)}/${String(monthDate.getFullYear()).slice(2)}`,
        ...metrics,
      };
    });

    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    const revenueDelta = previous ? (previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null) : null;
    const profitDelta = previous ? (previous.profit > 0 ? ((current.profit - previous.profit) / previous.profit) * 100 : null) : null;
    const interestDelta = previous && current.interestRate !== null && previous.interestRate !== null
      ? current.interestRate - previous.interestRate
      : null;

    const insightCandidates = [
      {
        weight: Math.abs(revenueDelta ?? 0),
        text: revenueDelta === null
          ? "Ainda não há base suficiente para comparar o faturamento com o mês anterior."
          : revenueDelta >= 0
            ? `Seu faturamento cresceu ${Math.abs(revenueDelta).toFixed(1)}% em relação ao mês passado.`
            : `Seu faturamento caiu ${Math.abs(revenueDelta).toFixed(1)}% em relação ao mês passado.`
      },
      {
        weight: Math.abs(interestDelta ?? 0),
        text: interestDelta === null
          ? "A taxa de juros ainda não tem base suficiente para comparação mês a mês."
          : interestDelta >= 0
            ? `A taxa de juros subiu ${Math.abs(interestDelta).toFixed(1)} p.p., reforçando a rentabilidade do mês.`
            : `A taxa de juros caiu ${Math.abs(interestDelta).toFixed(1)} p.p., atenção à rentabilidade.`
      },
      {
        weight: Math.abs(profitDelta ?? 0),
        text: profitDelta === null
          ? "Ainda não há base suficiente para comparar o lucro com o mês anterior."
          : profitDelta >= 0
            ? `Seu lucro avançou ${Math.abs(profitDelta).toFixed(1)}% contra o mês anterior.`
            : `Seu lucro recuou ${Math.abs(profitDelta).toFixed(1)}% contra o mês anterior.`
      },
    ].sort((a, b) => b.weight - a.weight);

    return {
      series,
      current,
      previous,
      revenueDelta,
      profitDelta,
      interestDelta,
      insight: insightCandidates[0]?.text ?? "Sem dados suficientes para gerar insight no período.",
    };
  }, [comparisonWindow, includeSales, loans, payments, range.start, sales]);

  // Médias anuais usadas no indicador risco vs retorno
  // - Taxa: usa a taxa geral global do portfólio (mesma fonte do card "Taxa de Juros Mensal — Geral")
  // - Juros recebidos: média dos meses com juros recebidos > 0 nos últimos 12 meses (mesma base do gráfico "Juros Recebidos por Mês")
  const yearlyAverages = useMemo(() => {
    // Mesma alocação "juros primeiro por contrato" do card e do gráfico mensal.
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    const interestByPaymentId = new Map<string, number>();
    const loanInterestRemaining = new Map<string, number>();
    loans.forEach((l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      loanInterestRemaining.set(l.id, Math.max(0, total - l.amount));
    });
    paymentsSorted.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt <= 0) { interestByPaymentId.set(p.id, 0); return; }
      if (p.installmentNumber === 0) {
        interestByPaymentId.set(p.id, amt);
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - amt));
      } else {
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(amt, rem);
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      }
    });
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });
    loans.forEach((l) => {
      if (l.status !== "paid") return;
      const lastId = lastPaymentByLoanId.get(l.id);
      if (!lastId) return;
      const loanPays = payments.filter((p) => p.loanId === l.id);
      const totalPaid = loanPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const allocated = loanPays.reduce((s, p) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
      const diff = (totalPaid - l.amount) - allocated;
      if (Math.abs(diff) < 0.005) return;
      const cur = interestByPaymentId.get(lastId) ?? 0;
      interestByPaymentId.set(lastId, Math.max(0, cur + diff));
    });

    const now = new Date();
    const monthlyInterests: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      let interestInMonth = 0;
      payments.forEach((p) => {
        if ((p.date || "").slice(0, 7) !== key) return;
        interestInMonth += interestByPaymentId.get(p.id) ?? 0;
      });
      const finalVal = interestOverrides[label] !== undefined ? interestOverrides[label] : interestInMonth;
      monthlyInterests.push(finalVal);
    }

    const monthsWithInterest = monthlyInterests.filter((v) => v > 0);
    const avgInterestReceived = monthsWithInterest.length > 0
      ? monthsWithInterest.reduce((s, v) => s + v, 0) / monthsWithInterest.length
      : 0;

    const rate = portfolio.globalInterestRate;
    const interestRate = {
      totalLent: 0,
      totalToReceive: 0,
      rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      hasData: Number.isFinite(rate) && rate > 0,
    };

    return { interestRate, interestReceived: avgInterestReceived };
  }, [loans, payments, interestOverrides, portfolio.globalInterestRate]);

  const riskReturn = useMemo(() => {
    const activeLoans = loans.filter((loan) => loan.status !== "paid");
    const today = new Date(`${todayInAppTz()}T00:00:00`);
    const todayStrForOverdue = todayInAppTz();
    const overdueLoans = activeLoans
      .map((loan) => ({ loan, items: getOverdueInstallments(loan, installmentSchedules, todayStrForOverdue) }))
      .filter((x) => x.items.length > 0);
    const averageDelayDays = overdueLoans.length > 0
      ? overdueLoans.reduce((sum, { items }) => {
          // usa a parcela vencida mais antiga para medir o atraso
          const oldest = items.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
          const dueDate = new Date(`${oldest.dueDate}T00:00:00`);
          const diff = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + diff;
        }, 0) / overdueLoans.length
      : 0;

    const clientExposure = activeLoans.reduce<Record<string, number>>((acc, loan) => {
      const key = loan.borrowerId || loan.borrowerName;
      acc[key] = (acc[key] ?? 0) + (loan.remainingAmount || loan.amount);
      return acc;
    }, {});
    const totalExposure = Object.values(clientExposure).reduce((sum, value) => sum + value, 0);
    const topExposure = Object.values(clientExposure).sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0);
    const concentrationShare = totalExposure > 0 ? (topExposure / totalExposure) * 100 : 0;

    const defaultScore = Math.min(100, portfolio.defaultRate * 2.2);
    const delayScore = Math.min(100, (averageDelayDays / 30) * 100);
    const concentrationScore = Math.min(100, Math.max(0, ((concentrationShare - 35) / 40) * 100));
    const riskScore = Math.round((defaultScore * 0.45) + (delayScore * 0.3) + (concentrationScore * 0.25));

    const interestScore = Math.min(100, Math.max(0, ((data.monthlyInterestRate.rate ?? 0) / 25) * 100));
    const profitMargin = data.totalIncome > 0 ? (data.periodProfitRealized / data.totalIncome) * 100 : 0;
    const profitScore = Math.min(100, Math.max(0, (profitMargin / 20) * 100));
    const returnScore = Math.round((interestScore * 0.55) + (profitScore * 0.45));
    const axisPosition = Math.round((riskScore * 0.5) + (returnScore * 0.5));

    const classification = riskScore < 35 ? "Baixo risco" : riskScore < 70 ? "Médio risco" : "Alto risco";
    const classificationColor = riskScore < 35 ? "text-success" : riskScore < 70 ? "text-warning" : "text-destructive";

    let insight = "Risco e retorno estão equilibrados; mantenha atenção na inadimplência para sustentar a margem.";
    if (riskScore >= 70 && returnScore >= 65) insight = "Você está operando com alto retorno, porém com risco elevado.";
    else if (riskScore < 35 && returnScore >= 65) insight = "Você mantém bom retorno com risco controlado.";
    else if (riskScore < 35 && returnScore < 50) insight = "Seu risco está controlado, mas o retorno pode ser melhorado.";
    else if (riskScore >= 70 && returnScore < 50) insight = "O risco está alto para o retorno atual; revise inadimplência e concentração.";

    return {
      riskScore,
      returnScore,
      axisPosition,
      classification,
      classificationColor,
      insight,
      averageDelayDays,
      concentrationShare,
    };
  }, [data.monthlyInterestRate.rate, data.periodProfitRealized, data.totalIncome, loans, portfolio.defaultRate]);

  const generateAiReport = useCallback(async ({ title, type, metrics, cacheKey, openSheet = true }: { title: string; type: "risk-reduction" | "priority-insight"; metrics: Record<string, unknown>; cacheKey?: string; openSheet?: boolean }) => {
    if (openSheet) {
      setRiskAiOpen(true);
      setRiskAiLoading(true);
      setRiskAiTitle(title);
      if (cacheKey && cachedInsightReports[cacheKey]) {
        setRiskAiReport(cachedInsightReports[cacheKey]);
        setRiskAiLoading(false);
        return;
      }
    }
    try {
      // Validate session against the server before invoking — cached JWTs may be stale.
      const { data: userCheck, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userCheck?.user) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("Sessão expirada. Faça login novamente.");
      }
      const { data: result, error } = await supabase.functions.invoke("generate-risk-reduction-report", {
        body: { type, metrics },
      });

      if (error) throw error;
      const report = (result as { report?: string })?.report ?? "Não foi possível gerar o relatório.";
      if (cacheKey) {
        setCachedInsightReports((current) => ({ ...current, [cacheKey]: report }));
      }
      if (openSheet) setRiskAiReport(report);
    } catch (error: any) {
      const message = error?.message || "Erro ao gerar relatório com IA";
      if (openSheet) {
        toast.error("Falha ao gerar relatório", { description: message });
        setRiskAiReport("Não foi possível gerar o relatório agora.");
      }
    } finally {
      if (openSheet) setRiskAiLoading(false);
      if (cacheKey) prefetchingInsightReportsRef.current.delete(cacheKey);
    }
  }, [cachedInsightReports]);

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
  // chartOverrides already declared above
  const [editingChart, setEditingChart] = useState(false);
  const [tempOverrides, setTempOverrides] = useState<Record<string, { emprestado: string; recebido: string }>>({});

  // Last 12 months chart data (calculated)
  const monthlyChartBase = useMemo(() => {
    const now = new Date();
    const months: { month: string; emprestado: number; recebido: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      const lent = loans
        .filter((l) => { const ld = new Date(l.startDate + "T00:00:00"); return ld >= d && ld <= end; })
        .reduce((s, l) => s + l.amount, 0);
      const received = payments
        .filter((p) => { const pd = new Date(p.date + "T00:00:00"); return pd >= d && pd <= end; })
        .reduce((s, p) => s + p.amount, 0);
      months.push({ month: label, emprestado: lent, recebido: received });
    }
    return months;
  }, [loans, payments]);

  // Apply overrides
  const monthlyChart = useMemo(() => {
    return monthlyChartBase.map((m) => {
      const override = chartOverrides[m.month];
      return {
        month: m.month,
        emprestado: m.emprestado + (override?.emprestado ?? 0),
        recebido: m.recebido + (override?.recebido ?? 0),
      };
    });
  }, [monthlyChartBase, chartOverrides]);

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

  // Interest chart - monthly interest received (last 12 months)
  const [editingInterest, setEditingInterest] = useState(false);
  const [tempInterestOverrides, setTempInterestOverrides] = useState<Record<string, string>>({});

  const interestChartBase = useMemo(() => {
    // Usa a MESMA contabilidade do card "Juros Recebidos no Mês":
    // alocação PROPORCIONAL (cada parcela contém a mesma proporção juros/principal),
    // com tratamento especial para installmentNumber 0 / -1 / -2 / -3 e
    // redistribuição do lucro residual no último pagamento de contratos quitados.
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    const interestByPaymentId = new Map<string, number>();
    const loanInterestRemaining = new Map<string, number>();
    loans.forEach((l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      loanInterestRemaining.set(l.id, Math.max(0, total - l.amount));
    });
    paymentsSorted.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt <= 0) { interestByPaymentId.set(p.id, 0); return; }
      if (p.installmentNumber === 0 || p.installmentNumber === -2) {
        interestByPaymentId.set(p.id, amt);
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - amt));
      } else if (p.installmentNumber === -3) {
        interestByPaymentId.set(p.id, 0);
      } else {
        // Parcela regular ou parcial (-1): juros proporcional à composição da operação
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      }
    });
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });
    loans.forEach((l) => {
      if (l.status !== "paid") return;
      const lastId = lastPaymentByLoanId.get(l.id);
      if (!lastId) return;
      const loanPays = payments.filter((p) => p.loanId === l.id);
      const totalPaid = loanPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const allocated = loanPays.reduce((s, p) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
      // Usa principal ORIGINAL (imutável) para apurar o lucro real e não inflar
      // por amortizações que reduziram o saldo vigente.
      const principalRef = l.originalAmount != null && l.originalAmount > 0 ? l.originalAmount : l.amount;
      const realProfit = totalPaid - principalRef;
      const diff = realProfit - allocated;
      if (Math.abs(diff) < 0.005) return;
      const cur = interestByPaymentId.get(lastId) ?? 0;
      interestByPaymentId.set(lastId, Math.max(0, cur + diff));
    });

    const now = new Date();
    const months: { month: string; juros: number; key: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: label, juros: 0, key });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    payments.forEach((p) => {
      const k = (p.date || "").slice(0, 7);
      const row = byKey.get(k);
      if (!row) return;
      row.juros += interestByPaymentId.get(p.id) ?? 0;
    });
    return months.map(({ month, juros }) => ({ month, juros }));
  }, [loans, payments]);

  // Override só é aplicado quando NÃO há juros calculados a partir de pagamentos reais
  // do mês. Assim, novos pagamentos de juros sempre refletem no gráfico, e ajustes manuais
  // só preenchem meses sem dados reais (ex.: histórico antigo importado).
  const interestChart = useMemo(() => {
    return interestChartBase.map((m) => ({
      month: m.month,
      juros: interestOverrides[m.month] !== undefined ? interestOverrides[m.month] : m.juros,
    }));
  }, [interestChartBase, interestOverrides]);

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

  const handleChangePeriod = (p: Period) => { setPeriod(p); setOffset(0); };

  const startEditBalance = () => { setTempBalance(String(accountBalance)); setEditingBalance(true); };
  const saveBalance = () => { setAccountBalance(parseFloat(tempBalance) || 0); setEditingBalance(false); };
  const cancelEditBalance = () => setEditingBalance(false);


  const healthColor = portfolio.score >= 70 ? "text-success" : portfolio.score >= 40 ? "text-warning" : "text-destructive";
  const healthBg = portfolio.score >= 70 ? "from-success/20 to-success/5" : portfolio.score >= 40 ? "from-warning/20 to-warning/5" : "from-destructive/20 to-destructive/5";
  const healthStroke = portfolio.score >= 70 ? "stroke-success" : portfolio.score >= 40 ? "stroke-warning" : "stroke-destructive";

  return (
    <div className="space-y-6">
      {/* Period filter + navigation */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Visão Geral</h2>
        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOffset(offset - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs sm:text-sm font-medium text-foreground min-w-[120px] sm:min-w-[160px] text-center cursor-pointer hover:text-primary transition-colors" onClick={() => setOffset(0)}>{range.label}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOffset(offset + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex bg-muted/60 rounded-xl p-0.5 ml-auto backdrop-blur-sm border border-border/30">
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button key={p} onClick={() => handleChangePeriod(p)}
                className={`px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Account balance + Received + Interest rate + Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card no3d className="animate-fade-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
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
                  <p className={`text-lg font-bold ${accountBalance < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(accountBalance)}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 flex-1">
              <div className="bg-muted/50 rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar className="h-3 w-3 text-primary" />
                  <p className="text-[10px] text-muted-foreground">Prev. Domingo</p>
                </div>
                <p className={`text-sm font-semibold ${(accountBalance + portfolio.forecastSunday) < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(accountBalance + portfolio.forecastSunday)}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-1.5 mb-1">
                  <Calendar className="h-3 w-3 text-primary" />
                  <p className="text-[10px] text-muted-foreground">Prev. Fim do Mês</p>
                </div>
                <p className={`text-sm font-semibold ${(accountBalance + portfolio.forecastEndMonth) < 0 ? "text-destructive" : "text-foreground"}`}>{formatCurrency(accountBalance + portfolio.forecastEndMonth)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Valores Recebidos — dinâmico conforme filtro de período */}
        <Card no3d className="animate-fade-in" style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-4 h-full relative flex flex-col">
            <div className="flex items-center justify-center">
              <div className="text-center flex-col flex items-center justify-center">
                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0 mb-1">
                  <ArrowDownToLine className="h-5 w-5 text-success" />
                </div>
                <p className="text-xs text-muted-foreground">Valores Recebidos</p>
                <p className="text-lg font-bold text-success">{formatCurrency(receivedByMethod.total)}</p>
                <p className="text-[10px] text-muted-foreground">{range.label}</p>
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
                        className="bg-muted/50 hover:bg-muted/80 transition-colors rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className="h-3 w-3 text-success" />
                          <p className="text-[10px] text-muted-foreground">{displayName}</p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(it.amount)}</p>
                      </button>
                    );
                  })}
                  {receivedByMethod.unassigned > 0 && (
                    <button
                      type="button"
                      onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setReceivedDetailMethodId("__unassigned__"); }}
                      className="bg-muted/50 hover:bg-muted/80 transition-colors rounded-lg p-3 border border-border/30 flex flex-col items-center justify-center text-center cursor-pointer"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">Sem forma</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(receivedByMethod.unassigned)}</p>
                    </button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card no3d className="animate-fade-in cursor-pointer" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }} onClick={() => setExpandedBreakdown(expandedBreakdown === "interest-rate" ? null : "interest-rate")}>
          <CardContent className="p-4 h-full relative flex flex-col">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                <Percent className="h-5 w-5 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Taxa de Juros Mensal</p>
                <p className="text-lg font-bold text-foreground">{data.monthlyInterestRate.hasData && data.monthlyInterestRate.rate !== null ? `${data.monthlyInterestRate.rate.toFixed(2)}%` : "Sem dados no período"}</p>
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

        {/* Profit Card */}
        <Card no3d className="animate-fade-in" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
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
                <span className="text-sm font-bold text-foreground">{formatCurrency(
                  data.periodProfitRealized + data.periodProfitExpected
                )}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Realizado</span>
                <span className="text-sm font-bold text-success">{formatCurrency(data.periodProfitRealized)}</span>
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

      {/* Portfolio metrics */}
      {(() => {
        // Interest metrics based on selected period filter (installment due dates)
        // Use interestExpectedRecords como fonte única para garantir consistência com o detalhamento
        const interestReceivedInPeriod = data.periodProfitRealized;
        const interestPendingInPeriod = data.periodProfitExpected;
        const interestDueInPeriod = interestReceivedInPeriod + interestPendingInPeriod;

        const items: Array<{ label: string; value: string; color: string; iconBg: string; iconColor: string; onClick?: () => void; tooltip?: string }> = [
          { label: "Capital na Rua", value: formatCurrency(portfolio.capitalOnStreet), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary", tooltip: "Soma do valor principal (sem juros) de todos os contratos ativos que ainda não foram totalmente quitados. Representa quanto do seu dinheiro está atualmente emprestado." },
          { label: "Total a Receber", value: formatCurrency(portfolio.totalToReceive), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary", tooltip: "Soma de tudo que ainda falta receber dos contratos ativos: principal + juros de todas as parcelas em aberto." },
          { label: "Pendente de Recebimento", value: formatCurrency(portfolio.pendingReceivable), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", tooltip: "Valor restante a receber de todos os contratos de empréstimos ativos." },
          { label: "Lucro Estimado", value: formatCurrency(portfolio.estimatedProfit), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", tooltip: "Total de juros previstos a receber considerando todos os contratos ativos até o final dos seus ciclos. É o lucro projetado se todos pagarem conforme o combinado." },
          { label: "Juros a Receber no Mês", value: formatCurrency(interestDueInPeriod), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", onClick: () => { setInterestExpectedFilter("all"); setShowInterestExpectedDetail(true); }, tooltip: "Soma dos 'Juros Recebidos no Mês' + 'Juros Pendentes do Mês'. Representa o total de juros do período: o que já entrou somado ao que ainda falta receber. Clique para ver o detalhamento." },
          { label: "Juros Recebidos", value: formatCurrency(interestReceivedInPeriod), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning", onClick: () => setShowInterestDetail(true), tooltip: "Critério: DATA DE PAGAMENTO + contabilidade JUROS PRIMEIRO. Cada pagamento amortiza antes o juros pendente do contrato; juros avulsos (sem parcela) contam 100% como juros; na quitação, todo o lucro residual (incl. acordos com bônus ou desconto) é alocado ao último pagamento. Clique para ver o detalhamento." },
          { label: "Juros Pendentes do Mês", value: formatCurrency(interestPendingInPeriod), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning", onClick: () => { setInterestExpectedFilter("pending"); setShowInterestExpectedDetail(true); }, tooltip: "Diferença entre 'Juros a Receber no Mês' (vencimento) e 'Juros Recebidos no Mês' (pagamento). Clique para ver o detalhamento do que está pendente de recebimento." },
        ];

        const pendingCard = items[2]; // Pendente de Recebimento
        const otherCards = [...items.slice(0, 2), ...items.slice(3)];

        return (
          <>
            {/* Desktop: all 7 in one row */}
            <div className="hidden lg:grid lg:grid-cols-7 gap-2">
              {items.map((item) => (
                <Card no3d key={item.label} className={item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""} onClick={item.onClick}>
                  <CardContent className="p-3 flex flex-col items-center text-center relative">
                    {item.tooltip && <InfoPopover text={item.tooltip} />}
                      {item.onClick && <Eye className="h-3 w-3 text-muted-foreground absolute top-2 right-2" />}
                    <div className={`h-6 w-6 rounded-md ${item.iconBg} flex items-center justify-center mb-1.5`}>
                      <DollarSign className={`h-3 w-3 ${item.iconColor}`} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className={`text-base font-bold ${item.color} mt-0.5`}>{item.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Tablet (sm-lg): Pendente full width on top, then 2 rows of 3 */}
            <div className="hidden sm:grid lg:hidden gap-2">
              <Card no3d>
                <CardContent className="p-4 flex flex-col items-center text-center relative">
                  {pendingCard.tooltip && <InfoPopover text={pendingCard.tooltip} />}
                  <div className={`h-8 w-8 rounded-lg ${pendingCard.iconBg} flex items-center justify-center mb-2`}>
                    <DollarSign className={`h-4 w-4 ${pendingCard.iconColor}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{pendingCard.label}</p>
                  <p className={`text-lg font-bold ${pendingCard.color} mt-0.5`}>{pendingCard.value}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-3 gap-2">
                {otherCards.slice(0, 3).map((item) => (
                  <Card no3d key={item.label} className={item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""} onClick={item.onClick}>
                    <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center relative">
                      {item.tooltip && <InfoPopover text={item.tooltip} />}
                      {item.onClick && <Eye className="h-3 w-3 text-muted-foreground absolute top-2 right-2" />}
                      <div className={`h-8 w-8 rounded-lg ${item.iconBg} flex items-center justify-center mb-2`}>
                        <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-sm sm:text-lg font-bold ${item.color} mt-0.5`}>{item.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {otherCards.slice(3, 6).map((item) => (
                  <Card no3d key={item.label} className={item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""} onClick={item.onClick}>
                    <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center relative">
                      {item.tooltip && <InfoPopover text={item.tooltip} />}
                      {item.onClick && <Eye className="h-3 w-3 text-muted-foreground absolute top-2 right-2" />}
                      <div className={`h-8 w-8 rounded-lg ${item.iconBg} flex items-center justify-center mb-2`}>
                        <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-sm sm:text-lg font-bold ${item.color} mt-0.5`}>{item.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Mobile: Pendente full width on top, then 3 rows of 2 */}
            <div className="grid sm:hidden gap-2">
              <Card no3d>
                <CardContent className="p-3 flex flex-col items-center text-center relative">
                  {pendingCard.tooltip && <InfoPopover text={pendingCard.tooltip} />}
                  <div className={`h-8 w-8 rounded-lg ${pendingCard.iconBg} flex items-center justify-center mb-2`}>
                    <DollarSign className={`h-4 w-4 ${pendingCard.iconColor}`} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{pendingCard.label}</p>
                  <p className={`text-sm font-bold ${pendingCard.color} mt-0.5`}>{pendingCard.value}</p>
                </CardContent>
              </Card>
              <div className="grid grid-cols-2 gap-2">
                {otherCards.slice(0, 2).map((item) => (
                  <Card no3d key={item.label} className={item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""} onClick={item.onClick}>
                    <CardContent className="p-3 flex flex-col items-center text-center relative">
                      {item.tooltip && <InfoPopover text={item.tooltip} />}
                      {item.onClick && <Eye className="h-3 w-3 text-muted-foreground absolute top-2 right-2" />}
                      <div className={`h-8 w-8 rounded-lg ${item.iconBg} flex items-center justify-center mb-2`}>
                        <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color} mt-0.5`}>{item.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {otherCards.slice(2, 4).map((item) => (
                  <Card no3d key={item.label} className={item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""} onClick={item.onClick}>
                    <CardContent className="p-3 flex flex-col items-center text-center relative">
                      {item.tooltip && <InfoPopover text={item.tooltip} />}
                      {item.onClick && <Eye className="h-3 w-3 text-muted-foreground absolute top-2 right-2" />}
                      <div className={`h-8 w-8 rounded-lg ${item.iconBg} flex items-center justify-center mb-2`}>
                        <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color} mt-0.5`}>{item.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {otherCards.slice(4, 6).map((item) => (
                  <Card no3d key={item.label} className={item.onClick ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""} onClick={item.onClick}>
                    <CardContent className="p-3 flex flex-col items-center text-center relative">
                      {item.tooltip && <InfoPopover text={item.tooltip} />}
                      {item.onClick && <Eye className="h-3 w-3 text-muted-foreground absolute top-2 right-2" />}
                      <div className={`h-8 w-8 rounded-lg ${item.iconBg} flex items-center justify-center mb-2`}>
                        <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      <p className={`text-sm font-bold ${item.color} mt-0.5`}>{item.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {/* Health Score — Glass Grid */}
      {(() => {
        const status = portfolio.score >= 70 ? "Saudável" : portfolio.score >= 40 ? "Atenção" : "Crítico";
        const accent = portfolio.score >= 70 ? "success" : portfolio.score >= 40 ? "warning" : "destructive";
        const recAccent = portfolio.receivingRate >= 70 ? "success" : portfolio.receivingRate >= 40 ? "warning" : "destructive";
        const defAccent = portfolio.defaultRate <= 20 ? "success" : portfolio.defaultRate <= 50 ? "warning" : "destructive";
        const accentMap = {
          success: { text: "text-success", bg: "bg-success", border: "border-success/30", soft: "bg-success/10" },
          warning: { text: "text-warning", bg: "bg-warning", border: "border-warning/30", soft: "bg-warning/10" },
          destructive: { text: "text-destructive", bg: "bg-destructive", border: "border-destructive/30", soft: "bg-destructive/10" },
        } as const;
        const a = accentMap[accent];
        const ra = accentMap[recAccent];
        const da = accentMap[defAccent];
        // Segmented health bar: 10 segments, fill proportional to score
        const filledSegments = Math.round((portfolio.score / 100) * 10);
        const expanded = overdueDialogOpen;
        return (
          <Card no3d className="relative overflow-hidden border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl">
            {/* Background glow */}
            <div className={`pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full blur-[80px] opacity-60`} style={{ background: `hsl(var(--${accent}) / 0.25)` }} />

            <CardContent className="relative p-5 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between gap-3 mb-8">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-10 w-10 rounded-xl border ${a.border} ${a.soft} flex items-center justify-center shrink-0`}>
                    <ShieldCheck className={`h-5 w-5 ${a.text}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-foreground font-semibold text-base sm:text-lg tracking-tight truncate">Saúde da Operação</h3>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-widest truncate">Visão em tempo real</p>
                  </div>
                </div>
                <div className={`shrink-0 px-3 py-1 rounded-full border ${a.border} ${a.soft}`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${a.text}`}>{status}</span>
                </div>
              </div>

              {/* Score */}
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-5xl sm:text-6xl font-black text-foreground tracking-tighter tabular-nums leading-none">{portfolio.score}</span>
                <span className="text-lg sm:text-xl font-medium text-muted-foreground">/100</span>
                <button
                  type="button"
                  onClick={() => setShowHealthInfo(true)}
                  className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                  aria-label="Como cada indicador é calculado"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Segmented health bar */}
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden mb-8 flex gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-full flex-1 rounded-full transition-colors ${i < filledSegments ? a.bg : "bg-white/5"}`}
                    style={i < filledSegments ? { boxShadow: `0 0 8px hsl(var(--${accent}) / 0.6)` } : undefined}
                  />
                ))}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <p className="text-muted-foreground text-[10px] sm:text-xs mb-1 font-medium uppercase tracking-wider">Taxa de Recebimento</p>
                  <p className={`font-bold text-base sm:text-lg tabular-nums ${ra.text}`}>{portfolio.receivingRate.toFixed(1)}%</p>
                </div>
                <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <p className="text-muted-foreground text-[10px] sm:text-xs mb-1 font-medium uppercase tracking-wider">Inadimplência</p>
                  <p className={`font-bold text-base sm:text-lg tabular-nums ${da.text}`}>{portfolio.defaultRate.toFixed(1)}%</p>
                </div>
                <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                  <p className="text-muted-foreground text-[10px] sm:text-xs mb-1 font-medium uppercase tracking-wider">Recebido</p>
                  <p className="text-success font-bold text-base sm:text-lg tabular-nums leading-tight truncate">{formatCurrency(portfolio.totalReceived)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOverdueDialogOpen(true)}
                  className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-left transition-all hover:bg-white/[0.06] hover:border-white/20"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-muted-foreground text-[10px] sm:text-xs font-medium uppercase tracking-wider">Atrasado</p>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <p className="text-destructive font-bold text-base sm:text-lg tabular-nums leading-tight truncate">{formatCurrency(portfolio.overdueAmount)}</p>
                  {portfolio.overdueLoans.length > 0 && (
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">{portfolio.overdueLoans.length} contrato{portfolio.overdueLoans.length !== 1 ? "s" : ""}</p>
                  )}
                </button>
              </div>

              {/* Footer */}
              <div className="mt-5 pt-4 border-t border-white/5 flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wider">{range.label}</span>
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest ${a.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${a.bg} animate-pulse`} />Live
                </span>
              </div>
            </CardContent>

            {/* Overdue Modal */}
            <Dialog open={expanded} onOpenChange={(o) => setOverdueDialogOpen(o)}>
              <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col p-0 gap-0 border border-white/10 bg-card/80 backdrop-blur-2xl backdrop-saturate-150 shadow-2xl">
                <DialogHeader className="p-5 pb-4 border-b border-white/10">
                  <DialogTitle className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl border border-destructive/30 bg-destructive/10 flex items-center justify-center shrink-0">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="text-base font-semibold text-foreground truncate">Contratos em atraso</p>
                      <p className="text-[11px] font-normal text-muted-foreground">
                        {portfolio.overdueLoans.length} contrato{portfolio.overdueLoans.length !== 1 ? "s" : ""} · {rawFormatCurrency(portfolio.overdueAmount)}
                      </p>
                    </div>
                  </DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {portfolio.overdueLoans.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      Nenhum contrato em atraso.
                    </div>
                  ) : (
                    [...portfolio.overdueLoans].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((l) => {
                      const remaining = getOverdueAmount(l, installmentSchedules, todayInAppTz());
                      const dueDate = new Date(l.dueDate + "T00:00:00");
                      const daysLate = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                      return (
                        <div key={l.id} className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3.5 transition-colors hover:bg-destructive/10">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-foreground truncate">{l.borrowerName}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                                  {daysLate}d em atraso
                                </span>
                                <span className="text-[11px] text-muted-foreground">venc. {dueDate.toLocaleDateString("pt-BR")}</span>
                              </div>
                            </div>
                            <span className="font-bold text-destructive whitespace-nowrap tabular-nums text-sm">{rawFormatCurrency(remaining)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </Card>
        );
      })()}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card no3d>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Entradas</h3>
            <div className="space-y-1">
              <button
                className="flex justify-between text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setExpandedBreakdown(expandedBreakdown === "payments" ? null : "payments")}
              >
                <span className="text-muted-foreground flex items-center gap-1">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "payments" ? "rotate-0" : "-rotate-90"}`} />
                  Parcelas recebidas ({data.filteredPayments.length})
                </span>
                <span className="font-medium">{formatCurrency(data.incomeFromPayments)}</span>
              </button>
              {expandedBreakdown === "payments" && (
                <div className="ml-5 space-y-1 max-h-[200px] overflow-y-auto">
                  {data.filteredPayments.map((p) => {
                    const loan = loans.find((l) => l.id === p.loanId);
                    return (
                      <div key={p.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                        <span className="text-muted-foreground truncate mr-2">Parcela {p.installmentNumber} — {loan?.borrowerName || "Empréstimo"}</span>
                        <span className="font-medium shrink-0 text-success">{formatCurrency(p.amount)}</span>
                      </div>
                    );
                  })}
                  {data.filteredPayments.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma parcela no período</p>}
                </div>
              )}
              <button
                className="flex justify-between items-center text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setExpandedBreakdown(expandedBreakdown === "sales" ? null : "sales")}
              >
                <span className={`text-muted-foreground flex items-center gap-1 ${!includeSales ? "line-through opacity-50" : ""}`}>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "sales" ? "rotate-0" : "-rotate-90"}`} />
                  Vendas de produtos ({data.salesWithReceived.length})
                </span>
                <span className="flex items-center gap-2">
                  <Switch checked={includeSales} onCheckedChange={setIncludeSales} className="scale-75" onClick={(e) => e.stopPropagation()} />
                  <span className={`font-medium ${!includeSales ? "opacity-50" : ""}`}>{formatCurrency(data.incomeFromSales)}</span>
                </span>
              </button>
              {expandedBreakdown === "sales" && (
                <div className="ml-5 space-y-1 max-h-[200px] overflow-y-auto">
                  {data.salesWithReceived.map((s) => (
                    <div key={s.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                      <span className="text-muted-foreground truncate mr-2">{s.productName}{s.customerName ? ` — ${s.customerName}` : ""}</span>
                      <span className="font-medium shrink-0 text-success">{formatCurrency(s.received)}</span>
                    </div>
                  ))}
                  {data.salesWithReceived.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma venda no período</p>}
                </div>
              )}
              <div className="border-t pt-2 flex justify-between text-sm font-semibold px-2">
                <span>Total</span>
                <span className="text-success">{formatCurrency(data.totalIncome)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card no3d>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Saídas</h3>
            <div className="space-y-1">
              <button
                className="flex justify-between text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setExpandedBreakdown(expandedBreakdown === "loans" ? null : "loans")}
              >
                <span className="text-muted-foreground flex items-center gap-1">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "loans" ? "rotate-0" : "-rotate-90"}`} />
                  Empréstimos concedidos ({data.filteredLoans.length})
                </span>
                <span className="font-medium">{formatCurrency(data.totalLoanOutgoing)}</span>
              </button>
              {expandedBreakdown === "loans" && (
                <div className="ml-5 space-y-1 max-h-[200px] overflow-y-auto">
                  {data.filteredLoans.map((l) => (
                    <div key={l.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                      <span className="text-muted-foreground truncate mr-2">{l.borrowerName}</span>
                      <span className="font-medium shrink-0 text-destructive">{formatCurrency(l.amount)}</span>
                    </div>
                  ))}
                  {data.filteredLoans.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhum empréstimo no período</p>}
                </div>
              )}
              <button
                className="flex justify-between text-sm w-full py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setExpandedBreakdown(expandedBreakdown === "expenses" ? null : "expenses")}
              >
                <span className="text-muted-foreground flex items-center gap-1">
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedBreakdown === "expenses" ? "rotate-0" : "-rotate-90"}`} />
                  Despesas pagas ({data.filteredExpenses.length})
                </span>
                <span className="font-medium">{formatCurrency(data.totalExpenses)}</span>
              </button>
              {expandedBreakdown === "expenses" && (
                <div className="ml-5 space-y-1 max-h-[200px] overflow-y-auto">
                  {data.filteredExpenses.map((e) => (
                    <div key={e.id} className="flex justify-between text-xs py-1 border-b border-border/20 last:border-0">
                      <span className="text-muted-foreground truncate mr-2">{e.description}</span>
                      <span className="font-medium shrink-0 text-destructive">{formatCurrency(e.amount)}</span>
                    </div>
                  ))}
                  {data.filteredExpenses.length === 0 && <p className="text-xs text-muted-foreground py-1">Nenhuma despesa no período</p>}
                </div>
              )}
              <div className="border-t pt-2 flex justify-between text-sm font-semibold px-2">
                <span>Total</span>
                <span className="text-destructive">{formatCurrency(data.totalOutgoing)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <SheetTitle>{interestExpectedFilter === "pending" ? "Juros Pendentes do Mês" : "Juros a Receber no Mês"} — {range.label}</SheetTitle>
          </SheetHeader>
          {(() => {
            const q = interestExpectedSearch.trim().toLowerCase();
            const matches = (name: string) => !q || name.toLowerCase().includes(q);
            const pendingRecs = data.interestExpectedRecords
              .filter((r) => !r.paid && matches(r.borrowerName))
              .slice()
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
            const pendingTotal = pendingRecs.reduce((s, r) => s + r.interestPortion, 0);
            const receivedRecs = data.interestDetailRecords
              .filter((r) => matches(r.borrowerName))
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date));
            const receivedTotal = receivedRecs.reduce((s, r) => s + r.interestPortion, 0);
            const showReceived = interestExpectedFilter === "all";
            const grandTotal = pendingTotal + (showReceived ? receivedTotal : 0);
            return (
              <div className="mt-4 space-y-4">
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

                {/* Pendentes */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-warning">Pendentes</p>
                    <p className="text-xs text-muted-foreground">{pendingRecs.length} registro(s)</p>
                  </div>
                  {pendingRecs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">Nenhum juros pendente neste período.</p>
                  ) : (
                    <>
                      {pendingRecs.map((rec, i) => (
                        <div key={`p-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-warning/5 border border-warning/30">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning">Pendente</span>
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
                            <p className="text-sm font-bold text-warning">{formatCurrency(rec.interestPortion)}</p>
                            <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.installmentAmount)}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-2 border-t border-border/60">
                        <p className="text-xs font-semibold">Subtotal Pendente</p>
                        <p className="text-sm font-bold text-warning">{formatCurrency(pendingTotal)}</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Total */}
                <div className="flex items-center justify-between pt-3 border-t-2 border-border">
                  <p className="text-sm font-semibold">{showReceived ? "Total (Recebidos + Pendentes)" : "Total Pendente"}</p>
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
