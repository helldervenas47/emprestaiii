import { useState, useMemo } from "react";
import { Loan, Payment } from "@/types/loan";
import { calculateInstallment } from "@/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays, User, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  loans: Loan[];
  payments: Payment[];
}

const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface DueItem {
  loanId: string;
  borrowerName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  paid: boolean;
  date: string;
}

export function BillingCalendar({ loans, payments }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Build a map of date -> due items
  const dueMap = useMemo(() => {
    const map: Record<string, DueItem[]> = {};

    loans.forEach((loan) => {
      if (loan.installments <= 0) return;
      const installmentAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
      const loanPayments = payments.filter((p) => p.loanId === loan.id);
      const paidInstallmentNumbers = new Set(
        loanPayments.filter((p) => p.installmentNumber > 0).map((p) => p.installmentNumber)
      );

      const start = new Date(loan.startDate + "T00:00:00");

      for (let i = 1; i <= loan.installments; i++) {
        const dueDate = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
        const dateStr = dueDate.toISOString().split("T")[0];

        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: loan.id,
          borrowerName: loan.borrowerName,
          installmentNumber: i,
          totalInstallments: loan.installments,
          amount: installmentAmount,
          paid: paidInstallmentNumbers.has(i),
          date: dateStr,
        });
      }
    });

    return map;
  }, [loans, payments]);

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const todayStr = today.toISOString().split("T")[0];

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayStr);
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
  };

  const selectedItems = selectedDate ? (dueMap[selectedDate] || []) : [];
  const unpaidSelected = selectedItems.filter((i) => !i.paid);
  const paidSelected = selectedItems.filter((i) => i.paid);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Calendário de Cobrança
        </h2>
        <Button variant="outline" size="sm" onClick={goToToday}>Hoje</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground">
              {monthNames[month]} {year}
            </span>
            <Button variant="ghost" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {dayNames.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => {
              if (day === null) return <div key={`empty-${idx}`} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const items = dueMap[dateStr] || [];
              const unpaid = items.filter((i) => !i.paid);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasDue = items.length > 0;
              const hasUnpaid = unpaid.length > 0;
              const isPast = dateStr < todayStr && hasUnpaid;

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`relative flex flex-col items-center justify-center rounded-lg p-1.5 min-h-[48px] text-sm transition-colors
                    ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary" : ""}
                    ${isToday && !isSelected ? "bg-accent font-bold" : ""}
                    ${isPast && !isSelected ? "bg-destructive/10" : ""}
                    ${!isSelected && !isToday && !isPast ? "hover:bg-muted" : ""}
                  `}
                >
                  <span className={isSelected ? "text-primary-foreground" : isToday ? "text-foreground" : "text-foreground"}>
                    {day}
                  </span>
                  {hasDue && (
                    <div className="flex gap-0.5 mt-0.5">
                      {hasUnpaid && (
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-destructive"}`} />
                      )}
                      {items.some((i) => i.paid) && (
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${isSelected ? "bg-primary-foreground/60" : "bg-success"}`} />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" /> A cobrar
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-success" /> Pago
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected day details */}
      {selectedDate && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </h3>

            {selectedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma cobrança para este dia.</p>
            ) : (
              <div className="space-y-2">
                {unpaidSelected.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-destructive mb-1">
                      A cobrar ({unpaidSelected.length})
                    </p>
                    {unpaidSelected.map((item) => (
                      <div
                        key={`${item.loanId}-${item.installmentNumber}`}
                        className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-destructive" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.borrowerName}</p>
                            <p className="text-xs text-muted-foreground">
                              Parcela {item.installmentNumber}/{item.totalInstallments}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-destructive">{formatCurrency(item.amount)}</p>
                          <Badge variant="destructive" className="text-[10px]">Pendente</Badge>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {paidSelected.length > 0 && (
                  <>
                    <p className="text-xs font-medium text-success mt-3 mb-1">
                      Recebido ({paidSelected.length})
                    </p>
                    {paidSelected.map((item) => (
                      <div
                        key={`${item.loanId}-${item.installmentNumber}`}
                        className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-success" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.borrowerName}</p>
                            <p className="text-xs text-muted-foreground">
                              Parcela {item.installmentNumber}/{item.totalInstallments}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-success">{formatCurrency(item.amount)}</p>
                          <Badge variant="outline" className="text-[10px] text-success border-success">Pago</Badge>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Total */}
                {unpaidSelected.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t mt-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <DollarSign className="h-4 w-4" /> Total a cobrar
                    </div>
                    <p className="text-sm font-bold text-destructive">
                      {formatCurrency(unpaidSelected.reduce((s, i) => s + i.amount, 0))}
                    </p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
