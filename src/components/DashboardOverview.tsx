import { useMemo, useState, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Sale, Payment, Expense, InstallmentSchedule } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getBalance, setBalance } from "@/lib/balance";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight, ChevronDown, Percent, Wallet, Pencil, Check, X, Trash2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  installmentSchedules?: InstallmentSchedule[];
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

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
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

export function DashboardOverview({ loans, sales, payments, expenses, installmentSchedules = [], onDeletePayment, onDeleteSale, onDeleteLoan }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [showAllTx, setShowAllTx] = useState(false);
  const [expandedBreakdown, setExpandedBreakdown] = useState<string | null>(null);
  
  const [accountBalance, setAccountBalance] = useAccountBalance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [includeSales, setIncludeSales] = useState(false);
  const [chartOverrides, setChartOverrides] = useLocalStorage<Record<string, { emprestado?: number; recebido?: number }>>("hvcred-chart-overrides", {});

  const range = useMemo(() => getRange(period, offset), [period, offset]);

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

    const totalLentInPeriod = filteredLoans.reduce((s, l) => s + l.amount, 0);
    const totalToReceiveInPeriod = filteredLoans.reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    const avgInterestRate = totalLentInPeriod > 0
      ? ((totalToReceiveInPeriod - totalLentInPeriod) / totalLentInPeriod) * 100
      : 0;

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

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length, avgInterestRate, filteredPayments, filteredLoans, filteredExpenses, salesWithReceived };
  }, [loans, sales, payments, expenses, range, includeSales, period, chartOverrides]);

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

    // Total a receber = sum of remainingAmount for active loans (uses manual value when set)
    const totalToReceive = activeLoans.reduce((s, l) => {
      if (l.remainingAmount != null && l.remainingAmount > 0) return s + l.remainingAmount;
      const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const paid = allPaymentsForActive.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0);
      return s + Math.max(0, expected - paid);
    }, 0);

    // Total received globally
    const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

    // Split received into principal vs interest per loan (ALL payments)
    // Uses proportional split: each payment is divided based on the ratio of principal to total
    let principalReceived = 0;
    let interestReceived = 0;
    loans.forEach((l) => {
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const principalRatio = totalWithInterest > 0 ? l.amount / totalWithInterest : 1;
      loanPayments.forEach((p) => {
        if (p.installmentNumber === 0) {
          // Interest-only payment
          interestReceived += p.amount;
        } else {
          // Proportional split based on actual payment amount
          principalReceived += p.amount * principalRatio;
          interestReceived += p.amount * (1 - principalRatio);
        }
      });
    });

    const principalToReceive = Math.max(0, totalPrincipal - principalReceived);
    const interestToReceive = Math.max(0, totalInterestExpected - interestReceived);

    // Overdue (global) — uses same "Restante" logic as LoanList line view
    const todayStr = new Date().toISOString().split("T")[0];
    const overdueLoans = activeLoans.filter((l) => l.dueDate <= todayStr);
    const overdueAmount = overdueLoans.reduce((s, l) => {
      // For installment loans, sum overdue installments from schedule
      if (l.installments >= 2) {
        const overdueSum = installmentSchedules
          .filter((sc) => sc.loanId === l.id && sc.installmentNumber > l.paidInstallments && sc.dueDate <= todayStr)
          .reduce((sum, sc) => sum + sc.amount, 0);
        if (overdueSum > 0) return s + overdueSum;
      }
      if (l.remainingAmount != null && l.remainingAmount > 0) return s + l.remainingAmount;
      const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const paid = payments.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0);
      return s + Math.max(0, expected - paid);
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

    return {
      score: Math.max(0, Math.min(100, score)),
      receivingRate: Math.min(100, receivingRate),
      defaultRate,
      totalReceived,
      overdueAmount,
      overdueLoans,
      capitalOnStreet,
      totalToReceive,
      principalReceived,
      interestReceived,
      principalToReceive,
      interestToReceive,
    };
  }, [loans, payments]);

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
  const [interestOverrides, setInterestOverrides] = useLocalStorage<Record<string, number>>("hvcred-interest-overrides", {});
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
        loanPayments.forEach((p) => {
          if (p.installmentNumber === 0) {
            interestInMonth += p.amount;
          } else if (p.installmentNumber > 0) {
            interestInMonth += installmentAmount - principalPerInstallment;
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
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOffset(offset + 1)} disabled={offset >= 0}>
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

      {/* Account balance + Interest rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="animate-fade-in" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo em Conta</p>
                {editingBalance ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Input type="number" value={tempBalance} onChange={(e) => setTempBalance(e.target.value)}
                      className="h-7 w-32 text-sm" onKeyDown={(e) => e.key === "Enter" && saveBalance()} autoFocus />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveBalance}><Check className="h-3.5 w-3.5 text-success" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditBalance}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-foreground">{formatCurrency(accountBalance)}</p>
                )}
              </div>
            </div>
            {!editingBalance && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditBalance}>
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in cursor-pointer" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }} onClick={() => setExpandedBreakdown(expandedBreakdown === "interest-rate" ? null : "interest-rate")}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <Percent className="h-5 w-5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">Taxa de Juros Mensal</p>
                <p className="text-lg font-bold text-foreground">{data.avgInterestRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">{data.loanCount} empréstimo(s) no período</p>
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl p-5 bg-card border border-success/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out animate-fade-in" style={{ animationDelay: '200ms', animationFillMode: 'backwards' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entradas</span>
            <div className="h-8 w-8 rounded-xl bg-success/15 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
          </div>
          <p className="text-2xl font-bold text-success">{formatCurrency(data.totalIncome)}</p>
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>{data.paymentCount} parcela(s)</span><span>·</span><span>{data.saleCount} venda(s)</span>
          </div>
        </div>

        <div className="rounded-2xl p-5 bg-card border border-warning/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out animate-fade-in" style={{ animationDelay: '280ms', animationFillMode: 'backwards' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saídas</span>
            <div className="h-8 w-8 rounded-xl bg-warning/15 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-warning" />
            </div>
          </div>
          <p className="text-2xl font-bold text-warning">{formatCurrency(data.totalOutgoing)}</p>
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>{data.loanCount} empréstimo(s)</span><span>·</span><span>{data.expenseCount} despesa(s)</span>
          </div>
        </div>

        <div className={`rounded-2xl p-5 bg-card border shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out animate-fade-in ${data.balance >= 0 ? "border-primary/20" : "border-destructive/20"}`} style={{ animationDelay: '360ms', animationFillMode: 'backwards' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo do Período</span>
            <div className={`h-8 w-8 rounded-xl ${data.balance >= 0 ? "bg-primary/15" : "bg-destructive/15"} flex items-center justify-center`}>
              <DollarSign className={`h-4 w-4 ${data.balance >= 0 ? "text-primary" : "text-destructive"}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${data.balance >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(data.balance)}</p>
          <p className="text-xs mt-2 text-muted-foreground">{range.label}</p>
        </div>
      </div>

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {[
          { label: "Capital na Rua", value: formatCurrency(portfolio.capitalOnStreet), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary" },
          { label: "Total a Receber", value: formatCurrency(portfolio.totalToReceive), color: "text-foreground", iconBg: "bg-primary/10", iconColor: "text-primary" },
          { label: "Principal Recebido", value: formatCurrency(portfolio.principalReceived), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success" },
          { label: "Juros Recebido", value: formatCurrency(portfolio.interestReceived), color: "text-success", iconBg: "bg-success/10", iconColor: "text-success" },
          { label: "Principal a Receber", value: formatCurrency(portfolio.principalToReceive), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning" },
          { label: "Juros a Receber", value: formatCurrency(portfolio.interestToReceive), color: "text-warning", iconBg: "bg-warning/10", iconColor: "text-warning" },
        ].map((item, i) => (
          <Card key={item.label}>
            <CardContent className="p-3 sm:p-4 flex flex-col items-center text-center">
              <div className={`h-8 w-8 rounded-lg ${item.iconBg} flex items-center justify-center mb-2`}>
                <DollarSign className={`h-4 w-4 ${item.iconColor}`} />
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-sm sm:text-lg font-bold ${item.color} mt-0.5`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health Score Gauge */}
      <Card>
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
              <Card className={`bg-gradient-to-br ${healthBg} border-0`}>
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Taxa de Recebimento</p>
                  <p className={`text-base sm:text-xl font-bold ${portfolio.receivingRate >= 70 ? "text-success" : portfolio.receivingRate >= 40 ? "text-warning" : "text-destructive"}`}>
                    {portfolio.receivingRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card className={`bg-gradient-to-br ${portfolio.defaultRate <= 20 ? "from-success/20 to-success/5" : portfolio.defaultRate <= 50 ? "from-warning/20 to-warning/5" : "from-destructive/20 to-destructive/5"} border-0`}>
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Inadimplência</p>
                  <p className={`text-base sm:text-xl font-bold ${portfolio.defaultRate <= 20 ? "text-success" : portfolio.defaultRate <= 50 ? "text-warning" : "text-destructive"}`}>
                    {portfolio.defaultRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-success/10 to-success/5">
                <CardContent className="p-3 sm:p-4">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Recebido</p>
                  <p className="text-base sm:text-xl font-bold text-success">{formatCurrency(portfolio.totalReceived)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-destructive/10 to-destructive/5 cursor-pointer transition-all duration-300" onClick={() => setExpandedBreakdown(expandedBreakdown === "overdue" ? null : "overdue")}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Atrasado</p>
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ${expandedBreakdown === "overdue" ? "rotate-180" : ""}`} />
                  </div>
                  <p className="text-base sm:text-xl font-bold text-destructive">{formatCurrency(portfolio.overdueAmount)}</p>
                  <p className="text-[10px] text-muted-foreground">{portfolio.overdueLoans.length} contrato{portfolio.overdueLoans.length !== 1 ? "s" : ""}</p>
                  {expandedBreakdown === "overdue" && portfolio.overdueLoans.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-destructive/20 space-y-2 max-h-60 overflow-y-auto">
                      {portfolio.overdueLoans.map((l) => {
                        const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
                        const paid = payments.filter((p) => p.loanId === l.id).reduce((s, p) => s + p.amount, 0);
                        const remaining = Math.max(0, expected - paid);
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

      {/* Monthly Bar Chart - Last 12 months */}
      <Card>
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
      <Card>
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
        <Card>
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
        <Card>
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
      <Card>
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
    </div>
  );
}
