import { useMemo, useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";
import { Loan, Sale, Payment, Expense } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getBalance, setBalance } from "@/lib/balance";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight, Percent, Wallet, Pencil, Check, X, Trash2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
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

function formatCurrency(v: number) {
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
  const [bal, setBal] = useState(getBalance);
  useEffect(() => {
    const onStorage = () => setBal(getBalance());
    window.addEventListener("storage", onStorage);
    // Poll to catch same-tab localStorage writes from other hooks
    const interval = setInterval(() => setBal(getBalance()), 500);
    return () => { window.removeEventListener("storage", onStorage); clearInterval(interval); };
  }, []);
  const update = (v: number) => { setBalance(v); setBal(v); };
  return [bal, update];
}

export function DashboardOverview({ loans, sales, payments, expenses, onDeletePayment, onDeleteSale, onDeleteLoan }: Props) {
  const [period, setPeriod] = useState<Period>("month");
  const [offset, setOffset] = useState(0);
  
  const [accountBalance, setAccountBalance] = useAccountBalance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [includeSales, setIncludeSales] = useState(false);

  const range = useMemo(() => getRange(period, offset), [period, offset]);

  const data = useMemo(() => {
    const filteredPayments = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const filteredSales = sales.filter((s) => isInRange(s.date, range.start, range.end));
    const incomeFromPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);
    const incomeFromSales = filteredSales.reduce((s, sale) => s + sale.total, 0);
    const totalIncome = incomeFromPayments + (includeSales ? incomeFromSales : 0);

    const filteredLoans = loans.filter((l) => isInRange(l.startDate, range.start, range.end));
    const totalLoanOutgoing = filteredLoans.reduce((s, l) => s + l.amount, 0);

    const filteredExpenses = expenses.filter((e) => e.paid && e.paidDate && isInRange(e.paidDate, range.start, range.end));
    const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

    const totalOutgoing = totalLoanOutgoing + totalExpenses;
    const balance = totalIncome - totalOutgoing;

    const transactions: { id: string; type: "in" | "out"; source: "payment" | "sale" | "loan" | "expense"; description: string; amount: number; date: string }[] = [];

    filteredPayments.forEach((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      transactions.push({ id: p.id, type: "in", source: "payment", description: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`, amount: p.amount, date: p.date });
    });
    filteredSales.forEach((s) => {
      transactions.push({ id: s.id, type: "in", source: "sale", description: `Venda: ${s.productName}${s.customerName ? ` — ${s.customerName}` : ""}`, amount: s.total, date: s.date });
    });
    filteredLoans.forEach((l) => {
      transactions.push({ id: l.id, type: "out", source: "loan", description: `Empréstimo para ${l.borrowerName}`, amount: l.amount, date: l.startDate });
    });
    filteredExpenses.forEach((e) => {
      transactions.push({ id: e.id, type: "out", source: "expense", description: `Despesa: ${e.description}`, amount: e.amount, date: e.paidDate! });
    });
    transactions.sort((a, b) => b.date.localeCompare(a.date));

    // Average interest rate of loans in the period
    const avgInterestRate = filteredLoans.length > 0
      ? filteredLoans.reduce((s, l) => s + l.interestRate, 0) / filteredLoans.length
      : 0;

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length, avgInterestRate };
  }, [loans, sales, payments, expenses, range, includeSales]);

  // Portfolio metrics (global)
  const portfolio = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status !== "paid");
    const totalLoans = loans.length;

    // Total principal lent (capital na rua = principal of active loans)
    const capitalOnStreet = activeLoans.reduce((s, l) => s + l.amount, 0);
    // Total expected (principal + interest) from all loans
    const totalExpected = loans.reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    const totalPrincipal = loans.reduce((s, l) => s + l.amount, 0);
    const totalInterestExpected = totalExpected - totalPrincipal;

    // Total received
    const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

    // Split received into principal vs interest per loan
    let principalReceived = 0;
    let interestReceived = 0;
    loans.forEach((l) => {
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const installmentAmount = calculateInstallment(l.amount, l.interestRate, l.installments);
      const principalPerInstallment = l.installments > 0 ? l.amount / l.installments : 0;
      loanPayments.forEach((p) => {
        if (p.installmentNumber === 0) {
          // Interest-only payment
          interestReceived += p.amount;
        } else if (p.installmentNumber > 0) {
          // Regular installment: split into principal and interest
          principalReceived += principalPerInstallment;
          interestReceived += installmentAmount - principalPerInstallment;
        } else {
          // Partial payment (-1): count as principal
          principalReceived += p.amount;
        }
      });
    });

    const principalToReceive = Math.max(0, totalPrincipal - principalReceived);
    const interestToReceive = Math.max(0, totalInterestExpected - interestReceived);
    const totalToReceive = Math.max(0, totalExpected - totalReceived);

    // Overdue
    const today = new Date().toISOString().split("T")[0];
    const overdueLoans = activeLoans.filter((l) => l.dueDate < today);
    const overdueAmount = overdueLoans.reduce((s, l) => {
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
      capitalOnStreet,
      totalToReceive,
      principalReceived,
      interestReceived,
      principalToReceive,
      interestToReceive,
    };
  }, [loans, payments]);

  // Last 12 months chart data
  const monthlyChart = useMemo(() => {
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Visão Geral</h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOffset(offset - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[160px] text-center">{range.label}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOffset(offset + 1)} disabled={offset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex bg-muted rounded-lg p-0.5 ml-2">
            {(["day", "week", "month"] as Period[]).map((p) => (
              <button key={p} onClick={() => handleChangePeriod(p)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {periodLabels[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Account balance + Interest rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
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

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Percent className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Taxa de Juros Mensal (Média)</p>
              <p className="text-lg font-bold text-foreground">{data.avgInterestRate.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">{data.loanCount} empréstimo(s) no período</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-5 bg-card border border-success/20 glow-success">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Entradas</span>
            <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
          </div>
          <p className="text-2xl font-bold text-success">{formatCurrency(data.totalIncome)}</p>
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>{data.paymentCount} parcela(s)</span><span>·</span><span>{data.saleCount} venda(s)</span>
          </div>
        </div>

        <div className="rounded-xl p-5 bg-card border border-warning/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saídas</span>
            <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <TrendingDown className="h-4 w-4 text-warning" />
            </div>
          </div>
          <p className="text-2xl font-bold text-warning">{formatCurrency(data.totalOutgoing)}</p>
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            <span>{data.loanCount} empréstimo(s)</span><span>·</span><span>{data.expenseCount} despesa(s)</span>
          </div>
        </div>

        <div className={`rounded-xl p-5 bg-card border ${data.balance >= 0 ? "border-primary/20 glow-primary" : "border-destructive/20"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saldo do Período</span>
            <div className={`h-8 w-8 rounded-lg ${data.balance >= 0 ? "bg-primary/10" : "bg-destructive/10"} flex items-center justify-center`}>
              <DollarSign className={`h-4 w-4 ${data.balance >= 0 ? "text-primary" : "text-destructive"}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${data.balance >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(data.balance)}</p>
          <p className="text-xs mt-2 text-muted-foreground">{range.label}</p>
        </div>
      </div>

      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Capital na Rua</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(portfolio.capitalOnStreet)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total a Receber</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(portfolio.totalToReceive)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Principal Recebido</p>
            <p className="text-lg font-bold text-success">{formatCurrency(portfolio.principalReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Juros Recebido</p>
            <p className="text-lg font-bold text-success">{formatCurrency(portfolio.interestReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Principal a Receber</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(portfolio.principalToReceive)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Juros a Receber</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(portfolio.interestToReceive)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Health Score Gauge */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Saúde da Operação</h3>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Gauge */}
            <div className="relative w-40 h-40 shrink-0">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
                <circle
                  cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round"
                  className={healthStroke}
                  strokeDasharray={`${(portfolio.score / 100) * 326.7} 326.7`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold ${healthColor}`}>{portfolio.score}</span>
                <span className="text-xs text-muted-foreground">de 100</span>
              </div>
            </div>
            {/* Metrics */}
            <div className="flex-1 grid grid-cols-2 gap-4 w-full">
              <Card className={`bg-gradient-to-br ${healthBg} border-0`}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Taxa de Recebimento</p>
                  <p className={`text-xl font-bold ${portfolio.receivingRate >= 70 ? "text-success" : portfolio.receivingRate >= 40 ? "text-warning" : "text-destructive"}`}>
                    {portfolio.receivingRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card className={`bg-gradient-to-br ${portfolio.defaultRate <= 20 ? "from-success/20 to-success/5" : portfolio.defaultRate <= 50 ? "from-warning/20 to-warning/5" : "from-destructive/20 to-destructive/5"} border-0`}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Inadimplência</p>
                  <p className={`text-xl font-bold ${portfolio.defaultRate <= 20 ? "text-success" : portfolio.defaultRate <= 50 ? "text-warning" : "text-destructive"}`}>
                    {portfolio.defaultRate.toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-success/10 to-success/5">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Recebido</p>
                  <p className="text-xl font-bold text-success">{formatCurrency(portfolio.totalReceived)}</p>
                </CardContent>
              </Card>
              <Card className="border-0 bg-gradient-to-br from-destructive/10 to-destructive/5">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Atrasado</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(portfolio.overdueAmount)}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Bar Chart - Last 12 months */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Histórico Mensal (Últimos 12 Meses)</h3>
          <div className="h-72">
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


      {/* Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Entradas</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Parcelas recebidas</span>
                <span className="font-medium">{formatCurrency(data.incomeFromPayments)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <div className="flex items-center gap-2">
                  <span className={`text-muted-foreground ${!includeSales ? "line-through opacity-50" : ""}`}>Vendas de produtos</span>
                  <Switch checked={includeSales} onCheckedChange={setIncludeSales} className="scale-75" />
                </div>
                <span className={`font-medium ${!includeSales ? "opacity-50" : ""}`}>{formatCurrency(data.incomeFromSales)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="text-accent">{formatCurrency(data.totalIncome)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Detalhamento de Saídas</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Empréstimos concedidos</span>
                <span className="font-medium">{formatCurrency(data.totalLoanOutgoing)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Despesas pagas</span>
                <span className="font-medium">{formatCurrency(data.totalExpenses)}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-semibold">
                <span>Total</span>
                <span className="text-destructive">{formatCurrency(data.totalOutgoing)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Movimentações — {range.label}</h3>
          {data.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação no período</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.transactions.map((t) => (
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
                    size="icon"
                    variant="ghost"
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
