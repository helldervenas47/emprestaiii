import { useMemo, useState, useEffect, useCallback } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { useChartOverrides } from "@/hooks/useChartOverrides";
import { useMonthlyGoals } from "@/hooks/useMonthlyGoals";
import { calculateMonthlyInterestRate } from "@/lib/monthlyInterestRate";
import { Switch } from "@/components/ui/switch";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Sale, Payment, Expense, InstallmentSchedule, Client } from "@/types/loan";
import { ManagerCommissionsChart } from "@/components/ManagerCommissionsChart";
import { GoalsCard } from "@/components/GoalsCard";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getBalance, setBalance } from "@/lib/balance";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight, ChevronDown, Percent, Wallet, Pencil, Check, X, Trash2, Calendar, Eye, Target, Info,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";

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

function summarizeMonthMetrics(loans: Loan[], sales: Sale[], payments: Payment[], includeSales: boolean, start: Date, end: Date) {
  const monthPayments = payments.filter((payment) => isInRange(payment.date, start, end));
  const monthSales = sales.filter((sale) => isInRange(sale.date, start, end));
  const monthLoans = loans.filter((loan) => isInRange(loan.startDate, start, end));
  const revenue = monthPayments.reduce((sum, payment) => sum + payment.amount, 0)
    + (includeSales ? monthSales.reduce((sum, sale) => sum + getSaleReceivedAmount(sale), 0) : 0);

  return {
    revenue,
    profit: calculateRealizedProfitForRange(loans, payments, start, end),
    interestRate: calculateMonthlyInterestRate(monthLoans).rate,
  };
}


// Subscribe to balance changes via storage events + polling
function useAccountBalance(): [number, (v: number) => void] {
  const [bal, setBal] = useState(0);
  useEffect(() => {
    const load = () => { getBalance().then(setBal); };
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);
  const update = (v: number) => { setBalance(v); setBal(v); };
  return [bal, update];
}

export function DashboardOverview({ loans, sales, payments, expenses, installmentSchedules = [], clients = [], onDeletePayment, onDeleteSale, onDeleteLoan }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [comparisonWindow, setComparisonWindow] = useState<3 | 6 | 12>(6);
  const [showAllTx, setShowAllTx] = useState(false);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
  
  const [accountBalance, setAccountBalance] = useAccountBalance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [includeSales, setIncludeSales] = useState(false);
  const [showInterestDetail, setShowInterestDetail] = useState(false);
  const [showInterestExpectedDetail, setShowInterestExpectedDetail] = useState(false);
  const [interestExpectedFilter, setInterestExpectedFilter] = useState<"pending" | "paid">("pending");
  const { chartOverrides, setChartOverrides, interestOverrides, setInterestOverrides } = useChartOverrides();
  const { getGoal } = useMonthlyGoals();

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
    const incomeFromSales = filteredSales.reduce((s, sale) => {
      let received = 0;
      if (sale.installmentAmounts && sale.installmentAmounts.length > 0) {
        for (let i = 0; i < sale.paidInstallments; i++) {
          received += sale.installmentAmounts[i] || 0;
        }
      } else if (sale.installmentValue) {
        received = sale.paidInstallments * sale.installmentValue;
      } else if (sale.installments > 0) {
        received = sale.paidInstallments * (sale.total / sale.installments);
      }
      received += sale.partialPaid || 0;
      return s + received;
    }, 0);

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

    const transactions: { id: string; type: "in" | "out"; source: "payment" | "sale" | "loan" | "expense"; description: string; amount: number; date: string }[] = [];

    filteredPayments.forEach((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      transactions.push({ id: p.id, type: "in", source: "payment", description: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`, amount: p.amount, date: p.date });
    });
    filteredLoans.forEach((l) => {
      transactions.push({ id: l.id, type: "out", source: "loan", description: `Empréstimo para ${l.borrowerName}`, amount: l.amount, date: l.startDate });
    });
    filteredExpenses.forEach((e) => {
      transactions.push({ id: e.id, type: "out", source: "expense", description: `Despesa: ${e.description}`, amount: e.amount, date: e.paidDate! });
    });
    transactions.sort((a, b) => b.date.localeCompare(a.date));

    const monthlyInterestRate = calculateMonthlyInterestRate(filteredLoans);

    // Juros previstos do período — porção de juros das parcelas com vencimento no período
    // Inclui TODOS os contratos (ativos, atrasados E quitados) — bruto, sem subtrair pagamentos.
    const interestExpectedRecords: { borrowerName: string; dueDate: string; installmentNumber: number; totalInstallments: number; installmentAmount: number; interestPortion: number; loanStatus: string; paid: boolean }[] = [];
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
              interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: sc.dueDate, installmentNumber: sc.installmentNumber, totalInstallments: loan.installments, installmentAmount: sc.amount, interestPortion: interest, loanStatus: loan.status, paid: isInstallmentPaid(sc.installmentNumber) });
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
            interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: dStr, installmentNumber: i + 1, totalInstallments: loan.installments, installmentAmount, interestPortion: interestPerInstallment, loanStatus: loan.status, paid: isInstallmentPaid(i + 1) });
          }
        }
        return sum + acc;
      }
      // Parcela única
      if (loan.dueDate && isInRange(loan.dueDate, range.start, range.end)) {
        interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: loan.dueDate, installmentNumber: 1, totalInstallments: 1, installmentAmount: totalWithInterest, interestPortion: totalInterest, loanStatus: loan.status, paid: isInstallmentPaid(1) });
        return sum + totalInterest;
      }
      return sum;
    }, 0);
    interestExpectedRecords.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    
    // Lucro Realizado — 3 componentes:
    // 1) Pagamentos de juros (installmentNumber === 0): valor integral é lucro
    // 2) Contratos quitados no período: lucro total = total pago - principal
    // 3) Parcelas regulares/parciais de contratos em aberto: proporção de juros
    const paymentsInPeriod = payments.filter((p) => isInRange(p.date, range.start, range.end));

    // Identificar contratos quitados no período (último pagamento no período + status paid)
    const quitadoLoanIds = new Set<string>();
    loans.forEach(l => {
      if (l.status !== "paid") return;
      const loanPays = payments.filter(pp => pp.loanId === l.id);
      if (loanPays.length === 0) return;
      const lastPayDate = loanPays.reduce((max, pp) => pp.date > max ? pp.date : max, loanPays[0].date);
      if (isInRange(lastPayDate, range.start, range.end)) quitadoLoanIds.add(l.id);
    });

    // 1) Juros avulsos de contratos NÃO quitados no período
    const interestOnlyProfit = paymentsInPeriod
      .filter(p => p.installmentNumber === 0 && !quitadoLoanIds.has(p.loanId))
      .reduce((s, p) => s + p.amount, 0);

    // 2) Lucro total de contratos quitados no período
    const quitadoProfit = Array.from(quitadoLoanIds).reduce((s, loanId) => {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) return s;
      const totalPaid = payments.filter(p => p.loanId === loanId).reduce((sum, p) => sum + p.amount, 0);
      return s + Math.max(0, totalPaid - loan.amount);
    }, 0);

    // 3) Parcelas regulares e parciais de contratos em aberto (não quitados no período)
    const activeInstallmentProfit = paymentsInPeriod
      .filter(p => p.installmentNumber !== 0 && !quitadoLoanIds.has(p.loanId))
      .reduce((s, p) => {
        const loan = loans.find(l => l.id === p.loanId);
        if (!loan) return s;
        const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
        const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
        return s + (p.amount * interestRatio);
      }, 0);

    const periodProfitRealized = interestOnlyProfit + quitadoProfit + activeInstallmentProfit;
    
    // Build detail records for "Juros Recebidos no Mês"
    const interestDetailRecords: { borrowerName: string; date: string; totalPayment: number; interestPortion: number; type: "juros" | "quitação" | "parcial" }[] = [];
    // Records from interest-only payments (non-quitado)
    paymentsInPeriod.filter(p => p.installmentNumber === 0 && !quitadoLoanIds.has(p.loanId)).forEach(p => {
      const loan = loans.find(l => l.id === p.loanId);
      if (!loan) return;
      interestDetailRecords.push({ borrowerName: loan.borrowerName, date: p.date, totalPayment: p.amount, interestPortion: p.amount, type: "juros" });
    });
    // Records from quitado contracts
    Array.from(quitadoLoanIds).forEach(loanId => {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) return;
      const totalPaid = payments.filter(p => p.loanId === loanId).reduce((sum, p) => sum + p.amount, 0);
      const profit = Math.max(0, totalPaid - loan.amount);
      const loanPays = payments.filter(p => p.loanId === loanId);
      const lastDate = loanPays.reduce((max, p) => p.date > max ? p.date : max, loanPays[0].date);
      if (profit > 0) interestDetailRecords.push({ borrowerName: loan.borrowerName, date: lastDate, totalPayment: totalPaid, interestPortion: profit, type: "quitação" });
    });
    // Records from regular/partial payments on active contracts
    paymentsInPeriod.filter(p => p.installmentNumber !== 0 && !quitadoLoanIds.has(p.loanId)).forEach(p => {
      const loan = loans.find(l => l.id === p.loanId);
      if (!loan) return;
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      const interest = p.amount * interestRatio;
      if (interest > 0) interestDetailRecords.push({ borrowerName: loan.borrowerName, date: p.date, totalPayment: p.amount, interestPortion: interest, type: p.installmentNumber === -1 ? "parcial" : "juros" });
    });
    interestDetailRecords.sort((a, b) => b.date.localeCompare(a.date));
    
    const totalProfitExpected = periodProfitExpected;
    const totalProfitRealized = periodProfitRealized;
    const previstoTotal = totalProfitRealized + totalProfitExpected;
    const periodProfitPct = previstoTotal > 0 ? Math.round((totalProfitRealized / previstoTotal) * 100) : 0;

    // Build sales with received amounts for breakdown
    const salesWithReceived = filteredSales.map(sale => {
      let received = 0;
      if (sale.installmentAmounts && sale.installmentAmounts.length > 0) {
        for (let i = 0; i < sale.paidInstallments; i++) {
          received += sale.installmentAmounts[i] || 0;
        }
      } else if (sale.installmentValue) {
        received = sale.paidInstallments * sale.installmentValue;
      } else if (sale.installments > 0) {
        received = sale.paidInstallments * (sale.total / sale.installments);
      }
      received += sale.partialPaid || 0;
      return { ...sale, received };
    });

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length, monthlyInterestRate, filteredPayments, filteredLoans, filteredExpenses, salesWithReceived, periodProfitExpected: totalProfitExpected, periodProfitRealized: totalProfitRealized, periodProfitPct, interestDetailRecords, interestExpectedRecords };
  }, [loans, sales, payments, expenses, range, includeSales, period, chartOverrides, installmentSchedules]);

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

    // Overdue — contratos com 1 ou mais dias de atraso (baseado na data atual)
    const todayStr = todayInAppTz();
    const overdueLoans = activeLoans.filter((l) => l.dueDate < todayStr);
    const overdueAmount = overdueLoans.reduce((s, l) => {
      let baseRemaining: number;
      if (l.installments >= 2) {
        const overdueSum = installmentSchedules
          .filter((sc) => sc.loanId === l.id && sc.installmentNumber > l.paidInstallments && sc.dueDate < todayStr)
          .reduce((sum, sc) => sum + sc.amount, 0);
        baseRemaining = overdueSum > 0 ? overdueSum : (l.remainingAmount > 0 ? l.remainingAmount : Math.max(0, calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - payments.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0)));
      } else if (l.remainingAmount != null && l.remainingAmount > 0) {
        baseRemaining = l.remainingAmount;
      } else {
        const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
        const paid = payments.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0);
        baseRemaining = Math.max(0, expected - paid);
      }
      const dueDate = new Date(l.dueDate + "T00:00:00");
      const refNorm = new Date(todayStr + "T00:00:00");
      const daysLate = Math.max(0, Math.floor((refNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      let lateFees = 0;
      if (l.lateInterestValue != null && l.lateInterestValue > 0 && daysLate > 0) {
        lateFees += l.lateInterestType === "fixed"
          ? l.lateInterestValue * daysLate
          : baseRemaining * (l.lateInterestValue / 100) * daysLate;
      }
      if (l.penaltyValue != null && l.penaltyValue > 0 && daysLate > 0) {
        lateFees += l.penaltyValue;
      }
      return s + baseRemaining + lateFees;
    }, 0);

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
      pendingReceivable: activeLoans.reduce((s, l) => s + (l.remainingAmount ?? 0), 0),
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
      const metrics = summarizeMonthMetrics(loans, sales, payments, includeSales, monthStart, monthEnd);

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

  const riskReturn = useMemo(() => {
    const activeLoans = loans.filter((loan) => loan.status !== "paid");
    const today = new Date(`${todayInAppTz()}T00:00:00`);
    const overdueLoans = activeLoans.filter((loan) => new Date(`${loan.dueDate}T00:00:00`) < today);
    const averageDelayDays = overdueLoans.length > 0
      ? overdueLoans.reduce((sum, loan) => {
          const dueDate = new Date(`${loan.dueDate}T00:00:00`);
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
    const now = new Date();
    const months: { month: string; juros: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      let interestInMonth = 0;
      loans.forEach((l) => {
        const loanPayments = payments.filter((p) => {
          const pd = new Date(p.date + "T00:00:00");
          return p.loanId === l.id && pd >= d && pd <= end;
        });
        const installmentAmount = calculateInstallment(l.amount, l.interestRate, l.installments);
        const principalPerInstallment = l.installments > 0 ? l.amount / l.installments : 0;
        const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
        const interestRatio = totalWithInterest > 0 ? 1 - (l.amount / totalWithInterest) : 0;
        loanPayments.forEach((p) => {
          if (p.installmentNumber === 0) {
            // Interest-only payment
            interestInMonth += p.amount;
          } else if (p.installmentNumber > 0) {
            // Regular installment - interest portion
            interestInMonth += installmentAmount - principalPerInstallment;
          } else if (p.installmentNumber === -1) {
            // Partial payment - proportional interest portion
            interestInMonth += p.amount * interestRatio;
          }
        });
      });
      months.push({ month: label, juros: interestInMonth });
    }
    return months;
  }, [loans, payments]);

  const interestChart = useMemo(() => {
    return interestChartBase.map((m) => ({
      month: m.month,
      juros: m.juros + (interestOverrides[m.month] ?? 0),
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
      const totalVal = parseFloat(tempInterestOverrides[m.month]) || 0;
      const diff = totalVal - m.juros;
      if (diff !== 0) newOverrides[m.month] = diff;
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

      {/* Account balance + Interest rate + Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card no3d className="animate-fade-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-4 h-full relative flex flex-col">
            {!editingBalance && (
              <Button variant="ghost" size="icon" className="h-7 w-7 absolute top-2 right-2 z-10" onClick={startEditBalance}>
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
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
                  const interestPct = l.amount > 0 ? ((totalToReceive - l.amount) / l.amount) * 100 : 0;
                  return (
                    <div key={l.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-lg p-2">
                      <div>
                        <p className="font-medium text-foreground">{l.borrowerName}</p>
                        <p className="text-muted-foreground">
                          Emprestado: {rawFormatCurrency(l.amount)} → Receber: {rawFormatCurrency(totalToReceive)}
                        </p>
                      </div>
                      <span className="font-bold text-warning">{interestPct.toFixed(1)}%</span>
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Previsto</span>
                <span className="text-sm font-bold text-foreground">{formatCurrency(data.periodProfitExpected)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Realizado</span>
                <span className="text-sm font-bold text-success">{formatCurrency(data.periodProfitRealized)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">% Lucro</span>
                <span className={`text-sm font-bold ${data.periodProfitPct >= 100 ? "text-success" : data.periodProfitPct >= 50 ? "text-warning" : "text-foreground"}`}>
                  {data.periodProfitPct}%
                </span>
              </div>
              {profitGoal && (() => {
                const previstoTotal = data.periodProfitRealized + data.periodProfitExpected;
                const targetAmount = previstoTotal * (profitGoal.targetValue / 100);
                const metaPct = targetAmount > 0 ? (data.periodProfitRealized / targetAmount) * 100 : 0;
                return (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">% Meta</span>
                    <span className={`text-sm font-bold ${metaPct >= 100 ? "text-success" : "text-destructive"}`}>
                      {metaPct.toFixed(1)}%
                    </span>
                  </div>
                );
              })()}
              <div className="pt-1.5 border-t border-border/30">
                {profitGoal ? (() => {
                  const previstoTotal = data.periodProfitRealized + data.periodProfitExpected;
                  const targetAmount = previstoTotal * (profitGoal.targetValue / 100);
                  const pct = targetAmount > 0 ? Math.min(150, (data.periodProfitRealized / targetAmount) * 100) : 0;
                  const reached = data.periodProfitRealized >= targetAmount && targetAmount > 0;
                  const status = reached ? "atingida" : "abaixo";
                  const color = reached ? "text-success" : "text-destructive";
                  return (
                    <>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="flex items-center gap-1 text-muted-foreground"><Target className="h-3 w-3" /> Meta: {profitGoal.targetValue}% ({formatCurrency(targetAmount)})</span>
                        <span className={`font-bold ${color}`}>{status === "atingida" ? "✓ Atingida" : "Abaixo"}</span>
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
        const interestDueInPeriod = data.periodProfitExpected;
        const interestReceivedInPeriod = data.periodProfitRealized;
        const interestPendingInPeriod = Math.max(0, interestDueInPeriod - interestReceivedInPeriod);

        const items: Array<{ label: string; value: string; color: string; iconBg: string; iconColor: string; onClick?: () => void; tooltip?: string }> = [
          { label: "Capital na Rua", value: formatCurrency(portfolio.capitalOnStreet), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary", tooltip: "Soma do valor principal (sem juros) de todos os contratos ativos que ainda não foram totalmente quitados. Representa quanto do seu dinheiro está atualmente emprestado." },
          { label: "Total a Receber", value: formatCurrency(portfolio.totalToReceive), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary", tooltip: "Soma de tudo que ainda falta receber dos contratos ativos: principal + juros de todas as parcelas em aberto." },
          { label: "Pendente de Recebimento", value: formatCurrency(portfolio.pendingReceivable), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", tooltip: "Valor das parcelas já vencidas (atrasadas) que ainda não foram pagas. Indica quanto está em atraso no momento." },
          { label: "Lucro Estimado", value: formatCurrency(portfolio.estimatedProfit), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", tooltip: "Total de juros previstos a receber considerando todos os contratos ativos até o final dos seus ciclos. É o lucro projetado se todos pagarem conforme o combinado." },
          { label: "Juros a Receber no Mês", value: formatCurrency(interestDueInPeriod), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success", onClick: () => setShowInterestExpectedDetail(true), tooltip: "Critério: DATA DE VENCIMENTO. Soma a porção de juros de TODAS as parcelas cujo vencimento cai no mês selecionado (cronograma do contrato), incluindo parcelas já pagas, atrasadas ou de contratos já quitados. Valor bruto previsto pelo contrato — não diminui conforme os juros são pagos. Por isso pode divergir de 'Juros Recebidos no Mês', que usa data de pagamento." },
          { label: "Juros Recebidos no Mês", value: formatCurrency(interestReceivedInPeriod), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning", onClick: () => setShowInterestDetail(true), tooltip: "Critério: DATA DE PAGAMENTO. Soma os juros efetivamente recebidos em pagamentos registrados no mês, independentemente do mês de vencimento. Inclui: juros avulsos, lucro integral de contratos quitados antecipadamente e a porção de juros de parcelas regulares/parciais. Por usar data de pagamento (e não vencimento), pode divergir de 'Juros a Receber no Mês'. Clique para ver o detalhamento." },
          { label: "Juros Pendentes do Mês", value: formatCurrency(interestPendingInPeriod), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning", tooltip: "Diferença entre 'Juros a Receber no Mês' (vencimento) e 'Juros Recebidos no Mês' (pagamento). Como os dois usam critérios temporais diferentes, este valor é uma estimativa e pode não refletir exatamente o que falta receber das parcelas do mês." },
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

      {/* Goals Card - placed above Health Score */}
      <GoalsCard loans={loans} payments={payments} expenses={expenses} clients={clients ?? []} installmentSchedules={installmentSchedules} selectedMonth={goalMonthKey} periodLabel={range.label} />

      {/* Health Score Gauge */}
      <Card no3d>
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Saúde da Operação</h3>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            {/* Gauge */}
            <div className="relative w-28 h-28 sm:w-40 sm:h-40 shrink-0">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
                <circle
                  cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round"
                  className={healthStroke}
                  strokeDasharray={`${(portfolio.score / 100) * 326.7} 326.7`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl sm:text-3xl font-bold ${healthColor}`}>{portfolio.score}</span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">de 100</span>
              </div>
            </div>
            {/* Metrics */}
            <div className="flex-1 grid grid-cols-2 gap-2 sm:gap-4 w-full">
              <Card no3d className={`bg-gradient-to-br ${healthBg} border-0`}>
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Taxa de Recebimento</p>
                  <p className={`text-base sm:text-xl font-bold ${portfolio.receivingRate >= 70 ? "text-success" : portfolio.receivingRate >= 40 ? "text-warning" : "text-destructive"}`}>
                    {portfolio.receivingRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card no3d className={`bg-gradient-to-br ${portfolio.defaultRate <= 20 ? "from-success/20 to-success/5" : portfolio.defaultRate <= 50 ? "from-warning/20 to-warning/5" : "from-destructive/20 to-destructive/5"} border-0`}>
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Inadimplência</p>
                  <p className={`text-base sm:text-xl font-bold ${portfolio.defaultRate <= 20 ? "text-success" : portfolio.defaultRate <= 50 ? "text-warning" : "text-destructive"}`}>
                    {portfolio.defaultRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card no3d className="border-0 bg-gradient-to-br from-success/10 to-success/5">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Recebido</p>
                  <p className="text-base sm:text-xl font-bold text-success">{formatCurrency(portfolio.totalReceived)}</p>
                </CardContent>
              </Card>
              <Card no3d className="border-0 bg-gradient-to-br from-destructive/10 to-destructive/5 cursor-pointer transition-all duration-300" onClick={() => setExpandedBreakdown(expandedBreakdown === "overdue" ? null : "overdue")}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Atrasado</p>
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${expandedBreakdown === "overdue" ? "rotate-180" : ""}`} />
                  </div>
                  <p className="text-base sm:text-xl font-bold text-destructive">{formatCurrency(portfolio.overdueAmount)}</p>
                  <p className="text-[10px] text-muted-foreground">{portfolio.overdueLoans.length} contrato{portfolio.overdueLoans.length !== 1 ? "s" : ""}</p>
                  {expandedBreakdown === "overdue" && portfolio.overdueLoans.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-destructive/20 space-y-2 max-h-60 overflow-y-auto">
                      {[...portfolio.overdueLoans].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((l) => {
                        const todayIso = todayInAppTz();
                        let remaining: number;
                        if (l.installments >= 2) {
                          const overdueSum = installmentSchedules
                            .filter((sc) => sc.loanId === l.id && sc.installmentNumber > l.paidInstallments && sc.dueDate <= todayIso)
                            .reduce((sum, sc) => sum + sc.amount, 0);
                          remaining = overdueSum > 0 ? overdueSum : (l.remainingAmount > 0 ? l.remainingAmount : Math.max(0, calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - payments.filter((p) => p.loanId === l.id).reduce((s, p) => s + p.amount, 0)));
                        } else if (l.remainingAmount != null && l.remainingAmount > 0) {
                          remaining = l.remainingAmount;
                        } else {
                          const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
                          const paid = payments.filter((p) => p.loanId === l.id).reduce((s, p) => s + p.amount, 0);
                          remaining = Math.max(0, expected - paid);
                        }
                        const dueDate = new Date(l.dueDate + "T00:00:00");
                        const daysLate = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                        return (
                          <div key={l.id} className="flex items-center justify-between text-xs">
                            <div>
                              <p className="font-medium text-foreground">{l.borrowerName}</p>
                              <p className="text-[10px] text-muted-foreground">{daysLate} dia{daysLate !== 1 ? "s" : ""} atraso • Venc. {dueDate.toLocaleDateString("pt-BR")}</p>
                            </div>
                            <span className="font-bold text-destructive whitespace-nowrap">{rawFormatCurrency(remaining)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Manager Commissions Chart - isolated, view-only */}
      <ManagerCommissionsChart clients={clients} loans={loans} installmentSchedules={installmentSchedules} payments={payments} range={{ start: range.start, end: range.end }} rangeLabel={range.label} />
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
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditChart} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
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
              ) : (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditInterest} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          </div>

          {editingInterest && (
            <div className="mb-4 max-h-60 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-muted-foreground">Mês</th>
                    <th className="text-right p-2 font-medium text-primary">Juros Recebido</th>
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
                  formatter={(value: number) => [formatCurrency(value), "Juros Recebido"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                />
                <Legend formatter={() => "Juros Recebido"} />
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
                <span className="text-accent">{formatCurrency(data.totalIncome)}</span>
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
                        <p className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString("pt-BR")}</p>
                      </div>
                      <span className={`text-sm font-semibold shrink-0 ${t.type === "in" ? "text-success" : "text-destructive"}`}>
                        {t.type === "in" ? "+" : "−"}{formatCurrency(t.amount)}
                      </span>
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
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
      {/* Interest Detail Sheet */}
      <Sheet open={showInterestDetail} onOpenChange={setShowInterestDetail}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Juros Recebidos no Mês — {range.label}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {data.interestDetailRecords.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro de juros recebidos neste período.</p>
            ) : (
              <>
                {data.interestDetailRecords.map((rec, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
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
                  <p className="text-sm font-semibold">Total</p>
                  <p className="text-sm font-bold text-warning">
                    {formatCurrency(data.interestDetailRecords.reduce((s, r) => s + r.interestPortion, 0))}
                  </p>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {/* Interest Expected Detail Sheet */}
      <Sheet open={showInterestExpectedDetail} onOpenChange={(open) => { setShowInterestExpectedDetail(open); if (open) setInterestExpectedFilter("pending"); }}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Juros a Receber no Mês — {range.label}</SheetTitle>
          </SheetHeader>
          {(() => {
            const pendingRecs = data.interestExpectedRecords.filter((r) => !r.paid);
            const paidRecs = data.interestExpectedRecords.filter((r) => r.paid);
            const pendingTotal = pendingRecs.reduce((s, r) => s + r.interestPortion, 0);
            const paidTotal = paidRecs.reduce((s, r) => s + r.interestPortion, 0);
            const visible = interestExpectedFilter === "pending" ? pendingRecs : paidRecs;
            const visibleTotal = interestExpectedFilter === "pending" ? pendingTotal : paidTotal;
            return (
              <>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInterestExpectedFilter("pending")}
                    className={`rounded-lg border p-3 text-left transition-all ${interestExpectedFilter === "pending" ? "border-warning bg-warning/10" : "border-border bg-muted/30 hover:bg-muted/50"}`}
                  >
                    <p className="text-[11px] text-muted-foreground">Pendentes</p>
                    <p className="text-lg font-bold text-warning">{formatCurrency(pendingTotal)}</p>
                    <p className="text-[10px] text-muted-foreground">{pendingRecs.length} parcela(s)</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInterestExpectedFilter("paid")}
                    className={`rounded-lg border p-3 text-left transition-all ${interestExpectedFilter === "paid" ? "border-success bg-success/10" : "border-border bg-muted/30 hover:bg-muted/50"}`}
                  >
                    <p className="text-[11px] text-muted-foreground">Quitados</p>
                    <p className="text-lg font-bold text-success">{formatCurrency(paidTotal)}</p>
                    <p className="text-[10px] text-muted-foreground">{paidRecs.length} parcela(s)</p>
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {visible.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {interestExpectedFilter === "pending" ? "Nenhum juros pendente neste período." : "Nenhum juros quitado neste período."}
                    </p>
                  ) : (
                    <>
                      {visible.map((rec, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/30">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{rec.borrowerName}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(rec.dueDate + "T00:00:00").toLocaleDateString("pt-BR")} — Parcela {rec.installmentNumber}/{rec.totalInstallments}
                              {rec.paid && <span className="ml-1 text-success">(quitado)</span>}
                            </p>
                          </div>
                          <div className="text-right ml-3">
                            <p className={`text-sm font-bold ${rec.paid ? "text-success" : "text-warning"}`}>{formatCurrency(rec.interestPortion)}</p>
                            <p className="text-[10px] text-muted-foreground">de {formatCurrency(rec.installmentAmount)}</p>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <p className="text-sm font-semibold">Total {interestExpectedFilter === "pending" ? "Pendente" : "Quitado"}</p>
                        <p className={`text-sm font-bold ${interestExpectedFilter === "pending" ? "text-warning" : "text-success"}`}>
                          {formatCurrency(visibleTotal)}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
