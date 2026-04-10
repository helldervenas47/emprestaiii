import { DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Loan } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";

interface Props {
  loans: Loan[];
}

export function DashboardCards({ loans }: Props) {
  const totalLent = loans.reduce((sum, l) => sum + l.amount, 0);
  const totalToReceive = loans
    .filter((l) => l.status !== "paid")
    .reduce((sum, l) => sum + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
  const totalInterest = loans.reduce(
    (sum, l) => sum + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
    0
  );
  const activeLoans = loans.filter((l) => l.status === "active").length;
  const overdueLoans = loans.filter((l) => l.status === "overdue").length;

  const cards = [
    {
      title: "Total Emprestado",
      value: formatCurrency(totalLent),
      icon: DollarSign,
      gradient: "gradient-primary",
    },
    {
      title: "Total a Receber",
      value: formatCurrency(totalToReceive),
      icon: TrendingUp,
      gradient: "gradient-success",
    },
    {
      title: "Lucro em Juros",
      value: formatCurrency(totalInterest),
      icon: TrendingUp,
      gradient: "gradient-warning",
    },
    {
      title: "Empréstimos Ativos",
      value: `${activeLoans}`,
      subtitle: overdueLoans > 0 ? `${overdueLoans} em atraso` : undefined,
      icon: Users,
      subtitleIcon: overdueLoans > 0 ? AlertTriangle : undefined,
      gradient: "gradient-primary",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className={`${card.gradient} rounded-xl p-5 text-primary-foreground shadow-lg`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">{card.title}</span>
            <card.icon className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{card.value}</p>
          {card.subtitle && (
            <p className="text-xs mt-1 opacity-80 flex items-center gap-1">
              {card.subtitleIcon && <card.subtitleIcon className="h-3 w-3" />}
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
