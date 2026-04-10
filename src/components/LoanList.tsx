import { Loan } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Trash2, DollarSign, User, Calendar } from "lucide-react";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Progress } from "@/components/ui/progress";

interface Props {
  loans: Loan[];
  onPayment: (loanId: string) => void;
  onDelete: (loanId: string) => void;
}

const statusMap = {
  active: { label: "Ativo", className: "bg-primary/10 text-primary border-primary/20" },
  paid: { label: "Quitado", className: "bg-success/10 text-success border-success/20" },
  overdue: { label: "Atrasado", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

export function LoanList({ loans, onPayment, onDelete }: Props) {
  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum empréstimo cadastrado</p>
          <p className="text-sm text-muted-foreground/70">Clique em "Novo Empréstimo" para começar</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {loans.map((loan) => {
        const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
        const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
        const paid = loan.paidInstallments * installment;
        const remaining = total - paid;
        const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
        const status = statusMap[loan.status];

        return (
          <Card key={loan.id} className="overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center">
                    <User className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{loan.borrowerName}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {new Date(loan.startDate).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Valor</p>
                  <p className="font-semibold">{formatCurrency(loan.amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Parcela</p>
                  <p className="font-semibold">{formatCurrency(installment)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Juros</p>
                  <p className="font-semibold text-accent">{loan.interestRate}% a.m.</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Restante</p>
                  <p className="font-semibold">{formatCurrency(remaining > 0 ? remaining : 0)}</p>
                </div>
              </div>

              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{loan.paidInstallments}/{loan.installments} parcelas</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {loan.notes && (
                <p className="text-xs text-muted-foreground mb-3 italic">"{loan.notes}"</p>
              )}

              <div className="flex gap-2 justify-end">
                {loan.status !== "paid" && (
                  <Button
                    size="sm"
                    onClick={() => onPayment(loan.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Receber Parcela
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => onDelete(loan.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
