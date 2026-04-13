import { useMemo, useCallback } from "react";
import { Loan, Client, InstallmentSchedule } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { calculateInstallment } from "@/hooks/useLoans";
import { FileText, Send } from "lucide-react";

interface Props {
  loans: Loan[];
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

function getInstallmentAmount(loan: Loan, schedules: InstallmentSchedule[]): number {
  const schedule = schedules.find(s => s.loanId === loan.id && s.installmentNumber === loan.paidInstallments + 1);
  if (schedule) return schedule.amount;
  return loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);
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

export function WhatsAppReport({ loans, clients, installmentSchedules }: Props) {
  const todayStr = getTodayStr();

  const activeLoans = useMemo(() =>
    loans.filter((l) => l.status !== "paid"),
    [loans]
  );

  const dueTodayLoans = useMemo(() => {
    return activeLoans
      .filter((loan) => loan.dueDate === todayStr)
      .map((loan) => {
        const base = getInstallmentAmount(loan, installmentSchedules);
        return { loan, amount: base };
      });
  }, [activeLoans, installmentSchedules, todayStr]);

  const overdueLoans = useMemo(() => {
    return activeLoans
      .filter((loan) => loan.dueDate < todayStr)
      .map((loan) => {
        const base = getInstallmentAmount(loan, installmentSchedules);
        const lateFees = calcLateFees(loan, base);
        return { loan, amount: base + lateFees, baseAmount: base, lateFees };
      })
      .sort((a, b) => a.loan.dueDate.localeCompare(b.loan.dueDate));
  }, [activeLoans, installmentSchedules, todayStr]);

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
      dueTodayLoans.forEach(({ loan, amount }) => {
        lines.push(`• ${loan.borrowerName}  — ${rawFormatCurrency(amount)}`);
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
      overdueLoans.forEach(({ loan, amount }) => {
        lines.push(`• ${loan.borrowerName}  — ${rawFormatCurrency(amount)}`);
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
            <Send className="h-3.5 w-3.5 mr-1" />
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
                {dueTodayLoans.map(({ loan, amount }) => (
                  <div key={loan.id} className="ml-2">
                    <p>• {loan.borrowerName} — {rawFormatCurrency(amount)}</p>
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
                {overdueLoans.map(({ loan, amount }) => (
                  <div key={loan.id} className="ml-2">
                    <p>• {loan.borrowerName} — {rawFormatCurrency(amount)}</p>
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
