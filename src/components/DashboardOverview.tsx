import { useMemo, useState, useEffect } from "react";
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
  const [interestRate, setInterestRate] = useLocalStorage("hvcred_interest_rate", 10);
  const [accountBalance, setAccountBalance] = useAccountBalance();
  const [editingBalance, setEditingBalance] = useState(false);
  const [editingRate, setEditingRate] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [tempRate, setTempRate] = useState("");

  const range = useMemo(() => getRange(period, offset), [period, offset]);

  const data = useMemo(() => {
    const filteredPayments = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const filteredSales = sales.filter((s) => isInRange(s.date, range.start, range.end));
    const incomeFromPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);
    const incomeFromSales = filteredSales.reduce((s, sale) => s + sale.total, 0);
    const totalIncome = incomeFromPayments + incomeFromSales;

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

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length };
  }, [loans, sales, payments, expenses, range]);

  // Health score computation (global, not period-filtered)
  const health = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status !== "paid");
    const paidLoans = loans.filter((l) => l.status === "paid");
    const totalLoans = loans.length;

    // Total expected from all loans
    const totalExpected = loans.reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    // Total received
    const totalReceived = payments.reduce((s, p) => s + p.amount, 0);
    // Overdue loans
    const today = new Date().toISOString().split("T")[0];
    const overdueLoans = activeLoans.filter((l) => l.dueDate < today);
    const overdueAmount = overdueLoans.reduce((s, l) => {
      const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const paid = payments.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0);
      return s + Math.max(0, expected - paid);
    }, 0);
    // Total lent
    const totalLent = loans.reduce((s, l) => s + l.amount, 0);

    // Rates
    const receivingRate = totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0;
    const defaultRate = totalLoans > 0 ? (overdueLoans.length / totalLoans) * 100 : 0;
    const profitMargin = totalLent > 0 ? ((totalReceived - totalLent) / totalLent) * 100 : 0;

    // Health score: weighted average
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
    };
  }, [loans, payments]);

  const handleChangePeriod = (p: Period) => { setPeriod(p); setOffset(0); };

  const startEditBalance = () => { setTempBalance(String(accountBalance)); setEditingBalance(true); };
  const saveBalance = () => { setAccountBalance(parseFloat(tempBalance) || 0); setEditingBalance(false); };
  const cancelEditBalance = () => setEditingBalance(false);

  const startEditRate = () => { setTempRate(String(interestRate)); setEditingRate(true); };
  const saveRate = () => { setInterestRate(parseFloat(tempRate) || 0); setEditingRate(false); };
  const cancelEditRate = () => setEditingRate(false);

  const healthColor = health.score >= 70 ? "text-success" : health.score >= 40 ? "text-warning" : "text-destructive";
  const healthBg = health.score >= 70 ? "from-success/20 to-success/5" : health.score >= 40 ? "from-warning/20 to-warning/5" : "from-destructive/20 to-destructive/5";
  const healthStroke = health.score >= 70 ? "stroke-success" : health.score >= 40 ? "stroke-warning" : "stroke-destructive";

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
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
                <Percent className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taxa de Juros Mensal</p>
                {editingRate ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Input type="number" value={tempRate} onChange={(e) => setTempRate(e.target.value)}
                      className="h-7 w-24 text-sm" onKeyDown={(e) => e.key === "Enter" && saveRate()} autoFocus />
                    <span className="text-sm text-muted-foreground">%</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveRate}><Check className="h-3.5 w-3.5 text-success" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditRate}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-foreground">{interestRate}%</p>
                )}
              </div>
            </div>
            {!editingRate && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditRate}>
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="gradient-success rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium opacity-90">Entradas</span>
            <TrendingUp className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(data.totalIncome)}</p>
          <div className="flex gap-3 mt-2 text-xs opacity-80">
            <span>{data.paymentCount} parcela(s)</span><span>·</span><span>{data.saleCount} venda(s)</span>
          </div>
        </div>

        <div className="gradient-warning rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium opacity-90">Saídas</span>
            <TrendingDown className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(data.totalOutgoing)}</p>
          <div className="flex gap-3 mt-2 text-xs opacity-80">
            <span>{data.loanCount} empréstimo(s)</span><span>·</span><span>{data.expenseCount} despesa(s)</span>
          </div>
        </div>

        <div className={`${data.balance >= 0 ? "gradient-primary" : "bg-destructive"} rounded-xl p-5 text-primary-foreground shadow-lg`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium opacity-90">Saldo do Período</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(data.balance)}</p>
          <p className="text-xs mt-2 opacity-80">{range.label}</p>
        </div>
      </div>

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
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vendas de produtos</span>
                <span className="font-medium">{formatCurrency(data.incomeFromSales)}</span>
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
