import { useMemo, useCallback } from "react";
import { Loan, Client, Payment, InstallmentSchedule } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { FileText } from "lucide-react";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

interface Props {
  loans: Loan[];
  payments: Payment[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Same "Restante" logic as LoanList line view */
function getLoanRemaining(loan: Loan, payments: Payment[], installmentSchedules: InstallmentSchedule[], todayStr: string): number {
  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);

  // For installment loans, sum overdue installments from schedule
  if (loan.installments >= 2) {
    const overdueSum = installmentSchedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments && s.dueDate <= todayStr)
      .reduce((sum, s) => sum + s.amount, 0);
    if (overdueSum > 0) return overdueSum;
  }

  if (loan.remainingAmount != null && loan.remainingAmount > 0) {
    return loan.remainingAmount;
  }

  return Math.max(0, total - totalPaid);
}

function getDaysOverdue(dueDate: string): number {
  const due = new Date(dueDate + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
}

function calcLateFees(loan: Loan, baseAmount: number): number {
  const daysOverdue = getDaysOverdue(loan.dueDate);
  if (daysOverdue === 0) return 0;

  let lateInterestTotal = 0;
  if (loan.lateInterestValue != null && loan.lateInterestValue > 0) {
    if (loan.lateInterestType === "fixed") {
      lateInterestTotal = loan.lateInterestValue * daysOverdue;
    } else {
      lateInterestTotal = baseAmount * (loan.lateInterestValue / 100) * daysOverdue;
    }
  }
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0) ? loan.penaltyValue : 0;
  return lateInterestTotal + penaltyTotal;
}

function getPaymentType(loan: Loan): string {
  const types: Record<string, string> = {
    monthly: "Mensal",
    biweekly: "Quinzenal",
    weekly: "Semanal",
    daily: "Diário",
  };
  return types[loan.paymentType] || loan.paymentType;
}

function formatDateBR(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR");
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  return days[d.getDay()];
}

export function WhatsAppReport({ loans, payments, clients, installmentSchedules }: Props) {
  const todayStr = getTodayStr();

  const activeLoans = useMemo(() =>
    loans.filter((l) => l.status !== "paid"),
    [loans]
  );

  const dueTodayLoans = useMemo(() => {
    return activeLoans
      .filter((loan) => loan.dueDate === todayStr)
      .map((loan) => {
        const base = getLoanRemaining(loan, payments, installmentSchedules, todayStr);
        const lateFees = calcLateFees(loan, base);
        return { loan, amount: base + lateFees, baseAmount: base, lateFees };
      });
  }, [activeLoans, payments, installmentSchedules, todayStr]);

  const overdueLoans = useMemo(() => {
    return activeLoans
      .filter((loan) => loan.dueDate < todayStr)
      .map((loan) => {
        const base = getLoanRemaining(loan, payments, installmentSchedules, todayStr);
        const lateFees = calcLateFees(loan, base);
        return { loan, amount: base + lateFees, baseAmount: base, lateFees };
      })
      .sort((a, b) => a.loan.dueDate.localeCompare(b.loan.dueDate));
  }, [activeLoans, payments, installmentSchedules, todayStr]);

  const totalDueToday = dueTodayLoans.reduce((s, d) => s + d.amount, 0);
  const totalOverdue = overdueLoans.reduce((s, d) => s + d.amount, 0);
  const totalPending = totalDueToday + totalOverdue;

  const buildReport = useCallback(() => {
    const lines: string[] = [];

    lines.push(`📊 *RELATÓRIO DIÁRIO*`);
    lines.push(`🗓 ${formatDateBR(todayStr)} • ${getDayOfWeek(todayStr)}`);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`—`);
    lines.push(``);
    lines.push(`💰 *RESUMO DO DIA*`);
    lines.push(`▸ A cobrar hoje: ${rawFormatCurrency(totalDueToday)} (${dueTodayLoans.length} parcelas)`);
    lines.push(`▸ Em atraso: ${rawFormatCurrency(totalOverdue)} (${overdueLoans.length} parcelas)`);
    lines.push(`▸ Total pendente: ${rawFormatCurrency(totalPending)}`);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`—`);
    lines.push(``);

    // Vence Hoje
    lines.push(`⏰ *VENCE HOJE — ${rawFormatCurrency(totalDueToday)}*`);
    lines.push(``);
    if (dueTodayLoans.length === 0) {
      lines.push(`Nenhum empréstimo vencendo hoje.`);
    } else {
      lines.push(`💵 Empréstimos (${dueTodayLoans.length})`);
      dueTodayLoans.forEach(({ loan, amount, lateFees }) => {
        const feesInfo = lateFees > 0 ? ` (inclui ${rawFormatCurrency(lateFees)} juros/multa)` : "";
        lines.push(`• *${loan.borrowerName}*  — ${rawFormatCurrency(amount)}${feesInfo}`);
        lines.push(`  └ ${getPaymentType(loan)}`);
      });
    }
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`—`);
    lines.push(``);

    // Em Atraso
    lines.push(`🚨 *EM ATRASO — ${rawFormatCurrency(totalOverdue)}*`);
    lines.push(``);
    if (overdueLoans.length === 0) {
      lines.push(`Nenhum empréstimo em atraso!`);
    } else {
      lines.push(`💵 Empréstimos (${overdueLoans.length})`);
      overdueLoans.forEach(({ loan, amount, lateFees }) => {
        const feesInfo = lateFees > 0 ? ` (inclui ${rawFormatCurrency(lateFees)} juros/multa)` : "";
        lines.push(`• *${loan.borrowerName}*  — ${rawFormatCurrency(amount)}${feesInfo}`);
        lines.push(`  └ ${getPaymentType(loan)} • Venc. ${formatDateBR(loan.dueDate)}`);
      });
    }

    return lines.join("\n");
  }, [todayStr, dueTodayLoans, overdueLoans, totalDueToday, totalOverdue, totalPending]);

  const handleSendReport = () => {
    const report = buildReport();
    window.open(`https://wa.me/?text=${encodeURIComponent(report)}`, "_blank");
  };

  // Preview of the report
  return (
    <Card no3d>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Relatório WhatsApp
          </h3>
          <Button
            onClick={handleSendReport}
            className="bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,38%)] text-white"
            size="sm"
          >
            <WhatsAppIcon className="h-3.5 w-3.5 mr-1" />
            Enviar para WhatsApp
          </Button>
        </div>

        {/* Report Preview */}
        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-3 font-mono text-xs leading-relaxed">
          <div>
            <p className="font-bold">📊 RELATÓRIO DIÁRIO</p>
            <p className="text-muted-foreground">🗓 {formatDateBR(todayStr)} • {getDayOfWeek(todayStr)}</p>
          </div>

          <hr className="border-border" />

          <div>
            <p className="font-bold">💰 RESUMO DO DIA</p>
            <p>▸ A cobrar hoje: {rawFormatCurrency(totalDueToday)} ({dueTodayLoans.length} parcelas)</p>
            <p>▸ Em atraso: {rawFormatCurrency(totalOverdue)} ({overdueLoans.length} parcelas)</p>
            <p>▸ Total pendente: {rawFormatCurrency(totalPending)}</p>
          </div>

          <hr className="border-border" />

          <div>
            <p className="font-bold">⏰ VENCE HOJE — {rawFormatCurrency(totalDueToday)}</p>
            {dueTodayLoans.length === 0 ? (
              <p className="text-muted-foreground">Nenhum empréstimo vencendo hoje.</p>
            ) : (
              <div className="mt-1">
                <p>💵 Empréstimos ({dueTodayLoans.length})</p>
                {dueTodayLoans.map(({ loan, amount, lateFees }) => (
                  <div key={loan.id} className="ml-2">
                    <p>• <strong>{loan.borrowerName}</strong> — {rawFormatCurrency(amount)}
                      {lateFees > 0 && <span className="text-destructive"> (inclui {rawFormatCurrency(lateFees)} juros/multa)</span>}
                    </p>
                    <p className="text-muted-foreground ml-3">└ {getPaymentType(loan)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-border" />

          <div>
            <p className="font-bold">🚨 EM ATRASO — {rawFormatCurrency(totalOverdue)}</p>
            {overdueLoans.length === 0 ? (
              <p className="text-muted-foreground">Nenhum empréstimo em atraso!</p>
            ) : (
              <div className="mt-1">
                <p>💵 Empréstimos ({overdueLoans.length})</p>
                {overdueLoans.map(({ loan, amount, lateFees }) => (
                  <div key={loan.id} className="ml-2">
                    <p>• <strong>{loan.borrowerName}</strong> — {rawFormatCurrency(amount)}
                      {lateFees > 0 && <span className="text-destructive"> (inclui {rawFormatCurrency(lateFees)} juros/multa)</span>}
                    </p>
                    <p className="text-muted-foreground ml-3">└ {getPaymentType(loan)} • Venc. {formatDateBR(loan.dueDate)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
