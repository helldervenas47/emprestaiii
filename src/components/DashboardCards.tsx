import { DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Loan } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";

interface Props {
  loans: Loan[];
  payments: Payment[];
}

export function DashboardCards({ loans, payments }: Props) {
  const activeLoansData = loans.filter((l) => l.status !== "paid");
  
  // Capital na rua = principal dos empréstimos ativos
  const totalLent = activeLoansData.reduce((sum, l) => sum + l.amount, 0);
  
  // Total a receber = total esperado (com juros) - pagamentos já recebidos dos empréstimos ativos
  const totalExpected = activeLoansData.reduce((sum, l) => sum + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
  const totalPaid = activeLoansData.reduce((sum, l) => {
    const loanPayments = payments.filter((p) => p.loanId === l.id);
    return sum + loanPayments.reduce((s, p) => s + p.amount, 0);
  }, 0);
  const totalToReceive = Math.max(0, totalExpected - totalPaid);
  
  const totalInterest = loans.reduce(
    (sum, l) => sum + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
    0
  );
  const activeLoans = activeLoansData.length;
  const overdueLoans = loans.filter((l) => l.status === "overdue").length;

  const cards = [
    {
      title: "Total Emprestado",
      value: formatCurrency(totalLent),
      icon: DollarSign,
      accentClass: "text-primary",
      bgClass: "bg-primary/10",
      glowClass: "glow-primary",
    },
    {
      title: "Total a Receber",
      value: formatCurrency(totalToReceive),
      icon: TrendingUp,
      accentClass: "text-success",
      bgClass: "bg-success/10",
      glowClass: "glow-success",
    },
    {
      title: "Lucro em Juros",
      value: formatCurrency(totalInterest),
      icon: TrendingUp,
      accentClass: "text-warning",
      bgClass: "bg-warning/10",
      glowClass: "",
    },
    {
      title: "Empréstimos Ativos",
      value: `${activeLoans}`,
      subtitle: overdueLoans > 0 ? `${overdueLoans} em atraso` : undefined,
      icon: Users,
      subtitleIcon: overdueLoans > 0 ? AlertTriangle : undefined,
      accentClass: "text-primary",
      bgClass: "bg-primary/10",
      glowClass: "",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`rounded-xl p-5 bg-card border border-border/50 ${card.glowClass} transition-all hover:border-border`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.title}</span>
            <div className={`h-8 w-8 rounded-lg ${card.bgClass} flex items-center justify-center`}>
              <card.icon className={`h-4 w-4 ${card.accentClass}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${card.accentClass}`}>{card.value}</p>
          {card.subtitle && (
            <p className="text-xs mt-2 text-muted-foreground flex items-center gap-1">
              {card.subtitleIcon && <card.subtitleIcon className="h-3 w-3 text-destructive" />}
              {card.subtitle}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
