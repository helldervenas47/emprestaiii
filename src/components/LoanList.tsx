import { useState } from "react";
import { Loan } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Trash2, DollarSign, User, Calendar, LayoutGrid, List } from "lucide-react";
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function LoanCardView({ loan, onPayment, onDelete }: { loan: Loan; onPayment: () => void; onDelete: () => void }) {
  const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const paid = loan.paidInstallments * installment;
  const remaining = total - paid;
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const status = statusMap[loan.status];

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
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
          <Badge variant="outline" className={status.className}>{status.label}</Badge>
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
        {loan.notes && <p className="text-xs text-muted-foreground mb-3 italic">"{loan.notes}"</p>}
        <div className="flex gap-2 justify-end">
          {loan.status !== "paid" && (
            <Button size="sm" onClick={onPayment}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Receber Parcela
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LoanRowView({ loan, onPayment, onDelete }: { loan: Loan; onPayment: () => void; onDelete: () => void }) {
  const installment = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const paid = loan.paidInstallments * installment;
  const remaining = total - paid;
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const status = statusMap[loan.status];

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-card rounded-lg border hover:shadow-sm transition-shadow">
      <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-primary-foreground" />
      </div>
      <div className="min-w-[120px]">
        <p className="font-medium text-sm text-foreground truncate">{loan.borrowerName}</p>
        <p className="text-xs text-muted-foreground">{new Date(loan.startDate).toLocaleDateString("pt-BR")}</p>
      </div>
      <div className="hidden sm:block min-w-[90px]">
        <p className="text-xs text-muted-foreground">Valor</p>
        <p className="text-sm font-semibold">{formatCurrency(loan.amount)}</p>
      </div>
      <div className="hidden md:block min-w-[90px]">
        <p className="text-xs text-muted-foreground">Parcela</p>
        <p className="text-sm font-semibold">{formatCurrency(installment)}</p>
      </div>
      <div className="hidden md:block min-w-[70px]">
        <p className="text-xs text-muted-foreground">Juros</p>
        <p className="text-sm font-semibold text-accent">{loan.interestRate}%</p>
      </div>
      <div className="hidden lg:block min-w-[90px]">
        <p className="text-xs text-muted-foreground">Restante</p>
        <p className="text-sm font-semibold">{formatCurrency(remaining > 0 ? remaining : 0)}</p>
      </div>
      <div className="hidden sm:flex flex-col min-w-[100px] gap-1">
        <span className="text-xs text-muted-foreground">{loan.paidInstallments}/{loan.installments}</span>
        <Progress value={progress} className="h-1.5" />
      </div>
      <Badge variant="outline" className={`${status.className} shrink-0 text-xs`}>{status.label}</Badge>
      <div className="flex gap-1 ml-auto shrink-0">
        {loan.status !== "paid" && (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onPayment} title="Receber Parcela">
            <CheckCircle className="h-4 w-4 text-primary" />
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete} title="Excluir">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function LoanList({ loans, onPayment, onDelete }: Props) {
  const [view, setView] = useState<"cards" | "rows">("cards");

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
      <div className="flex justify-end">
        <div className="flex bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setView("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Caixas
          </button>
          <button
            onClick={() => setView("rows")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "rows" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Linhas
          </button>
        </div>
      </div>

      {view === "cards" ? (
        <div className="space-y-3">
          {loans.map((loan) => (
            <LoanCardView key={loan.id} loan={loan} onPayment={() => onPayment(loan.id)} onDelete={() => onDelete(loan.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {loans.map((loan) => (
            <LoanRowView key={loan.id} loan={loan} onPayment={() => onPayment(loan.id)} onDelete={() => onDelete(loan.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
