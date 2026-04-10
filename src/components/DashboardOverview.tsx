import { useMemo, useState } from "react";
import { Loan, Sale, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { calculateInstallment } from "@/hooks/useLoans";
import { TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Props {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
}

type Period = "day" | "week" | "month";

const periodLabels: Record<Period, string> = { day: "Hoje", week: "Esta Semana", month: "Este Mês" };

function isInPeriod(dateStr: string, period: Period): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "day") {
    return date >= today;
  }
  if (period === "week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    return date >= weekStart;
  }
  // month
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return date >= monthStart;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function DashboardOverview({ loans, sales, payments }: Props) {
  const [period, setPeriod] = useState<Period>("month");

  const data = useMemo(() => {
    // Income: payments received + sales
    const filteredPayments = payments.filter((p) => isInPeriod(p.date, period));
    const filteredSales = sales.filter((s) => isInPeriod(s.date, period));

    const incomeFromPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);
    const incomeFromSales = filteredSales.reduce((s, sale) => s + sale.total, 0);
    const totalIncome = incomeFromPayments + incomeFromSales;

    // Outgoing: loans given in the period
    const filteredLoans = loans.filter((l) => isInPeriod(l.startDate, period));
    const totalOutgoing = filteredLoans.reduce((s, l) => s + l.amount, 0);

    const balance = totalIncome - totalOutgoing;

    // Recent transactions
    const transactions: { id: string; type: "in" | "out"; description: string; amount: number; date: string }[] = [];

    filteredPayments.forEach((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      transactions.push({
        id: p.id,
        type: "in",
        description: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`,
        amount: p.amount,
        date: p.date,
      });
    });

    filteredSales.forEach((s) => {
      transactions.push({
        id: s.id,
        type: "in",
        description: `Venda: ${s.productName}${s.customerName ? ` — ${s.customerName}` : ""}`,
        amount: s.total,
        date: s.date,
      });
    });

    filteredLoans.forEach((l) => {
      transactions.push({
        id: l.id,
        type: "out",
        description: `Empréstimo para ${l.borrowerName}`,
        amount: l.amount,
        date: l.startDate,
      });
    });

    transactions.sort((a, b) => b.date.localeCompare(a.date));

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length };
  }, [loans, sales, payments, period]);

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Visão Geral</h2>
        <div className="flex bg-muted rounded-lg p-0.5">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors ${
                period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
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
            <span>{data.paymentCount} parcela(s)</span>
            <span>·</span>
            <span>{data.saleCount} venda(s)</span>
          </div>
        </div>

        <div className="gradient-warning rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium opacity-90">Saídas</span>
            <TrendingDown className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(data.totalOutgoing)}</p>
          <div className="flex gap-3 mt-2 text-xs opacity-80">
            <span>{data.loanCount} empréstimo(s)</span>
          </div>
        </div>

        <div className={`${data.balance >= 0 ? "gradient-primary" : "bg-destructive"} rounded-xl p-5 text-primary-foreground shadow-lg`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium opacity-90">Saldo</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(data.balance)}</p>
          <p className="text-xs mt-2 opacity-80">{periodLabels[period]}</p>
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
                <span className="font-medium">{formatCurrency(data.totalOutgoing)}</span>
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
          <h3 className="text-sm font-semibold text-foreground mb-4">Movimentações — {periodLabels[period]}</h3>
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
