import { DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Loan, Payment } from "@/types/loan";
import { calculateTotalWithInterest, getLoanRemainingAmount } from "@/hooks/useLoans";
import { useHideValues } from "@/contexts/HideValuesContext";

interface Props {
  loans: Loan[];
  payments: Payment[];
}

export function DashboardCards({ loans, payments }: Props) {
  const { mask } = useHideValues();
  const activeLoansData = loans.filter((l) => l.status !== "paid");

  const totalLent = activeLoansData.reduce((sum, l) => sum + l.amount, 0);
  const totalToReceive = activeLoansData.reduce((sum, l) => sum + getLoanRemainingAmount(l, payments), 0);

  const totalInterest = loans.reduce(
    (sum, l) => sum + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
    0
  );
  const activeLoans = activeLoansData.length;
  const overdueLoans = loans.filter((l) => l.status === "overdue").length;

  const cards = [
    { title: "Capital na Rua", value: formatCurrency(totalLent), isCurrency: true, icon: DollarSign, accentClass: "text-primary", bgClass: "bg-primary/10", glowClass: "glow-primary" },
    { title: "Total a Receber", value: formatCurrency(totalToReceive), isCurrency: true, icon: TrendingUp, accentClass: "text-success", bgClass: "bg-success/10", glowClass: "glow-success" },
    { title: "Lucro em Juros", value: formatCurrency(totalInterest), isCurrency: true, icon: TrendingUp, accentClass: "text-warning", bgClass: "bg-warning/10", glowClass: "" },
    { title: "Empréstimos Ativos", value: `${activeLoans}`, isCurrency: false, subtitle: overdueLoans > 0 ? `${overdueLoans} em atraso` : undefined, icon: Users, subtitleIcon: overdueLoans > 0 ? AlertTriangle : undefined, accentClass: "text-primary", bgClass: "bg-primary/10", glowClass: "" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.title} className={`rounded-2xl p-5 bg-card border border-border/30 shadow-sm ${card.glowClass} transition-all hover:shadow-md text-center`}>
          <div className="flex items-center justify-center mb-3">
            <div className={`h-8 w-8 rounded-lg ${card.bgClass} flex items-center justify-center`}>
              <card.icon className={`h-4 w-4 ${card.accentClass}`} />
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.title}</span>
          <p className={`text-2xl font-bold ${card.accentClass} mt-1`}>{card.isCurrency ? mask(card.value) : card.value}</p>
          {card.subtitle && (
            <p className="text-xs mt-2 text-muted-foreground flex items-center justify-center gap-1">
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
