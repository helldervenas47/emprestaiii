import { useState, useMemo, useCallback } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Sale } from "@/types/loan";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarDays, User, DollarSign, CheckCircle, Percent, HandCoins, ChevronDown, ChevronUp, Calendar as CalendarIcon, ShoppingBag, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDueStatusBadge } from "@/lib/dueStatus";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { toast } from "sonner";

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  sales?: Sale[];
  onPayment?: (loanId: string, paymentDate?: string, paymentMethodId?: string | null) => void;
  onPartialPayment?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null) => void;
  onInterestPayment?: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null) => void;
  onUpdate?: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  readOnly?: boolean;
}

const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface DueItem {
  loanId: string;
  borrowerName: string;
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  paid: boolean;
  date: string;
  loan: Loan;
}

export function BillingCalendar({ loans, payments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onUpdate, readOnly = false }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showPartial, setShowPartial] = useState<string | null>(null);
  const [partialAmount, setPartialAmount] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ loanId: string; type: "installment" | "interest" | "partial" | "full" | "payoff"; amount?: number; borrowerName: string } | null>(null);
  const [payoffAmount, setPayoffAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const { activeMethods } = usePaymentMethods();
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  useMemo(() => {
    if (paymentDialog && !selectedMethodId && activeMethods.length > 0) {
      setSelectedMethodId(activeMethods[0].id);
    }
    return null;
  }, [paymentDialog, activeMethods, selectedMethodId]);

  // Build a map of date -> due items
  const dueMap = useMemo(() => {
    const map: Record<string, DueItem[]> = {};

    loans.forEach((loan) => {
      if (loan.status === "paid") return;
      if (loan.installments <= 0) return;
      if (loan.paidInstallments >= loan.installments) return;
      const defaultInstallmentAmount = loan.customInstallmentValue || calculateInstallment(loan.amount, loan.interestRate, loan.installments);

      const nextInstallment = loan.paidInstallments + 1;
      const dueBase = new Date(loan.dueDate + "T00:00:00");

      const loanSchedules = installmentSchedules.filter(s => s.loanId === loan.id);

      for (let i = nextInstallment; i <= loan.installments; i++) {
        const schedule = loanSchedules.find(s => s.installmentNumber === i);
        let dateStr: string;
        if (schedule) {
          dateStr = schedule.dueDate;
        } else {
          const offsetFromNext = i - nextInstallment;
          const freq = loan.interestType || "Mensal";
          const d = new Date(dueBase.getFullYear(), dueBase.getMonth(), dueBase.getDate());
          if (freq === "Semanal") d.setDate(d.getDate() + offsetFromNext * 7);
          else if (freq === "Quinzenal") d.setDate(d.getDate() + offsetFromNext * 15);
          else d.setMonth(d.getMonth() + offsetFromNext);
          dateStr = formatLocalDate(d);
        }
        const amount = schedule ? schedule.amount : defaultInstallmentAmount;

        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push({
          loanId: loan.id,
          borrowerName: loan.borrowerName,
          installmentNumber: i,
          totalInstallments: loan.installments,
          amount,
          paid: false,
          date: dateStr,
          loan,
        });
      }
    });

    return map;
  }, [loans, payments, installmentSchedules]);

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < startDayOfWeek; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const todayStr = formatLocalDate(today);

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
    setExpandedItem(null);
    setShowPartial(null);
  };

  const selectedItems = selectedDate ? (dueMap[selectedDate] || []) : [];
  const overdueSelected = selectedItems.filter((i) => i.date < todayStr);
  const upcomingSelected = selectedItems.filter((i) => i.date >= todayStr);

  const toggleExpand = (itemKey: string) => {
    setExpandedItem(expandedItem === itemKey ? null : itemKey);
    setShowPartial(null);
    setPartialAmount("");
  };

  const openPaymentDialog = (loanId: string, borrowerName: string, type: "installment" | "interest" | "partial" | "full" | "payoff", amount?: number) => {
    setPaymentDate(new Date());
    setPayoffAmount("");
    setPaymentDialog({ loanId, type, amount, borrowerName });
  };

  const confirmPayment = async () => {
    if (!paymentDialog) return;
    if (activeMethods.length > 0 && !selectedMethodId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const dateStr = formatLocalDate(paymentDate);
    const loan = loans.find(l => l.id === paymentDialog.loanId);
    if (!loan) return;
    const mid = selectedMethodId || null;

    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
    const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);

    if (paymentDialog.type === "full") {
      if (onFullPayment) {
        await onFullPayment(paymentDialog.loanId, dateStr, undefined, mid);
      } else {
        await onPartialPayment?.(paymentDialog.loanId, remaining, dateStr, mid);
        await onUpdate?.(paymentDialog.loanId, { paidInstallments: loan.installments, status: "paid" });
      }
    } else if (paymentDialog.type === "payoff") {
      const customRaw = parseFloat(payoffAmount.replace(",", "."));
      const custom = isFinite(customRaw) && customRaw > 0 ? customRaw : 0;
      if (custom <= 0) return;
      if (onFullPayment) {
        await onFullPayment(paymentDialog.loanId, dateStr, custom, mid);
      } else {
        await onPartialPayment?.(paymentDialog.loanId, custom, dateStr, mid);
        await onUpdate?.(paymentDialog.loanId, { paidInstallments: loan.installments, status: "paid" });
      }
      setPayoffAmount("");
    } else if (paymentDialog.type === "installment") {
      await onPayment?.(paymentDialog.loanId, dateStr, mid);
    } else if (paymentDialog.type === "interest") {
      await onInterestPayment?.(paymentDialog.loanId, dateStr, undefined, undefined, mid);
    } else if (paymentDialog.type === "partial" && paymentDialog.amount) {
      await onPartialPayment?.(paymentDialog.loanId, paymentDialog.amount, dateStr, mid);
    }
    setPaymentDialog(null);
    setExpandedItem(null);
  };

  const handlePartialSubmit = (loanId: string, borrowerName: string) => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      openPaymentDialog(loanId, borrowerName, "partial", val);
      setPartialAmount("");
      setShowPartial(null);
    }
  };

  const renderItemWithActions = (item: DueItem, isOverdue: boolean) => {
    const itemKey = `${item.loanId}-${item.installmentNumber}`;
    const isExpanded = expandedItem === itemKey;
    const loan = item.loan;
    const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
    const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
    const baseRemaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);

    // Calculate late fees (same as LoanCardView)
    const dueDate = new Date(loan.dueDate + "T00:00:00");
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysOverdue = Math.max(0, Math.floor((todayNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    let lateInterestTotal = 0;
    if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && daysOverdue > 0 && loan.status !== "paid") {
      if (loan.lateInterestType === "fixed") {
        lateInterestTotal = loan.lateInterestValue * daysOverdue;
      } else {
        lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * daysOverdue;
      }
    }
    const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && daysOverdue > 0 && loan.status !== "paid") ? loan.penaltyValue : 0;
    const lateFees = lateInterestTotal + penaltyTotal;
    const remaining = baseRemaining + lateFees;

    const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
    const calculatedInstallment = remaining / remainingInstallments;
    const installment = loan.customInstallmentValue != null && loan.customInstallmentValue > 0 ? loan.customInstallmentValue : calculatedInstallment;
    const interestOnly = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);

    const colorClass = isOverdue ? "destructive" : "warning";
    const bgClass = isOverdue ? "bg-destructive/5 border-destructive/20" : "bg-warning/5 border-warning/20";
    const avatarBg = isOverdue ? "bg-destructive/10" : "bg-warning/10";
    const avatarText = isOverdue ? "text-destructive" : "text-warning";
    const amountColor = isOverdue ? "text-destructive" : "text-warning";

    return (
      <div key={itemKey} className="overflow-hidden rounded-lg border">
        <button
          onClick={() => toggleExpand(itemKey)}
          className={`flex items-center justify-between p-3 w-full text-left ${bgClass} transition-colors hover:opacity-90`}
        >
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full ${avatarBg} flex items-center justify-center`}>
              <User className={`h-4 w-4 ${avatarText}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{item.borrowerName}</p>
              <p className="text-xs text-muted-foreground">
                Parcela {item.installmentNumber}/{item.totalInstallments}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const badge = getDueStatusBadge(item.date, item.paid, { overdue: "Atrasado" });
              return (
                <div className="text-right">
                  <p className={`text-sm font-bold ${amountColor}`}>{formatCurrency(installment)}</p>
                  <Badge variant={badge.variant} className={`text-[10px] ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>
              );
            })()}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {isExpanded && (
          <div className="p-3 space-y-3 bg-card border-t">
            {/* Loan info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Valor empréstimo</p>
                <p className="font-semibold text-foreground">{formatCurrency(loan.amount)}</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Juros</p>
                <p className="font-semibold text-foreground">{loan.interestRate}% ({loan.interestType})</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Parcelas pagas</p>
                <p className="font-semibold text-foreground">{loan.paidInstallments}/{loan.installments}</p>
              </div>
              <div className="p-2 rounded bg-muted/50">
                <p className="text-muted-foreground">Restante</p>
                <p className="font-semibold text-foreground">{formatCurrency(remaining)}</p>
              </div>
            </div>

            {/* Payment buttons */}
            {!readOnly && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Formas de pagamento</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "installment")}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Parcela</p>
                      <p className="text-[10px] text-primary font-semibold">{formatCurrency(installment)}</p>
                    </div>
                  </button>

                  {loan.installments < 2 && (
                    <button
                      onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "interest")}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-purple/20 bg-purple/5 hover:bg-purple/10 transition-colors"
                    >
                      <div className="h-7 w-7 rounded-full bg-purple/15 flex items-center justify-center shrink-0">
                        <Percent className="h-3.5 w-3.5 text-purple" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-medium text-foreground">Juros</p>
                        <p className="text-[10px] text-purple font-semibold">{formatCurrency(interestOnly)}</p>
                      </div>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setShowPartial(showPartial === itemKey ? null : itemKey);
                      setPartialAmount("");
                    }}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-warning/20 bg-warning/5 hover:bg-warning/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                      <HandCoins className="h-3.5 w-3.5 text-warning" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Parcial</p>
                      <p className="text-[10px] text-warning font-semibold">Definir valor</p>
                    </div>
                  </button>

                  <button
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "full")}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-success/20 bg-success/5 hover:bg-success/10 transition-colors"
                  >
                    <div className="h-7 w-7 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                      <DollarSign className="h-3.5 w-3.5 text-success" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Total</p>
                      <p className="text-[10px] text-success font-semibold">{formatCurrency(remaining)}</p>
                    </div>
                  </button>

                  <button
                    onClick={() => openPaymentDialog(item.loanId, item.borrowerName, "payoff")}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors col-span-2"
                  >
                    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <DollarSign className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-medium text-foreground">Quitar Contrato</p>
                      <p className="text-[10px] text-primary font-semibold">Definir valor de quitação</p>
                    </div>
                  </button>
                </div>

                {showPartial === itemKey && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor parcial (R$)"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      className="h-8 text-sm flex-1"
                      autoFocus
                    />
                    <Button size="sm" className="h-8" onClick={() => handlePartialSubmit(item.loanId, item.borrowerName)}>
                      Pagar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Sort selected items by priority: overdue > today > future, then desc value
  const sortedSelectedItems = useMemo(() => {
    const priority = (d: string) => {
      if (d < todayStr) return 0;
      if (d === todayStr) return 1;
      return 2;
    };
    return [...selectedItems].sort((a, b) => {
      const pa = priority(a.date);
      const pb = priority(b.date);
      if (pa !== pb) return pa - pb;
      return b.amount - a.amount;
    });
  }, [selectedItems, todayStr]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Calendário de Cobrança
        </h2>
        <Button variant="outline" size="sm" onClick={goToToday}>Hoje</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card no3d className="md:sticky md:top-4 md:self-start">
        <CardContent className="p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="icon" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
              onClick={() => {
                const n = new Date();
                setMonth(n.getMonth());
                setYear(n.getFullYear());
              }}
            >
              {monthNames[month]} {year}
            </button>
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
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const hasDue = items.length > 0;
              const isOverdue = dateStr < todayStr && hasDue;
              const isUpcoming = dateStr >= todayStr && hasDue;

              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={`relative flex flex-col items-center justify-center rounded-lg p-1.5 min-h-[48px] text-sm transition-colors
                    ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary" : ""}
                    ${isToday && !isSelected ? "bg-accent font-bold" : ""}
                    ${isOverdue && !isSelected ? "bg-destructive/10" : ""}
                    ${!isSelected && !isToday && !isOverdue ? "hover:bg-muted" : ""}
                  `}
                >
                  <span className={isSelected ? "text-primary-foreground" : "text-foreground"}>
                    {day}
                  </span>
                  {hasDue && (
                    <div className="flex gap-0.5 mt-0.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                        isSelected ? "bg-primary-foreground" : isOverdue ? "bg-destructive" : "bg-warning"
                      }`} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-destructive" /> Atrasado
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-warning" /> A vencer
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected day details — split view on desktop/tablet, stacked on mobile */}
      <Card no3d className="md:max-h-[calc(100vh-8rem)] md:flex md:flex-col animate-fade-in">
        <CardContent className="p-4 md:flex-1 md:overflow-y-auto">
          {!selectedDate ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Selecione uma data no calendário para ver os contratos a receber.</p>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-foreground mb-3">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                })}
              </h3>

              {sortedSelectedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum contrato a receber nesta data.</p>
              ) : (
                <div className="space-y-3 animate-fade-in">
                  {sortedSelectedItems.map((item) => renderItemWithActions(item, item.date < todayStr))}

                  {/* Total */}
                  <div className="flex items-center justify-between pt-2 border-t mt-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <DollarSign className="h-4 w-4" /> Total a cobrar
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      {formatCurrency(sortedSelectedItems.reduce((s, i) => s + i.amount, 0))}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Payment confirmation dialog */}
      <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
        <DialogContent className="sm:max-w-[340px]">
          <DialogHeader>
            <DialogTitle>
              {paymentDialog?.type === "full" ? "Pagamento Total" :
               paymentDialog?.type === "payoff" ? "Quitar Contrato" :
               paymentDialog?.type === "installment" ? "Receber Parcela" :
               paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
              {paymentDialog && <span className="block text-sm font-normal text-muted-foreground mt-1">{paymentDialog.borrowerName}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-2">
            {paymentDialog?.type === "full" && paymentDialog.loanId && (() => {
              const loan = loans.find(l => l.id === paymentDialog.loanId);
              if (!loan) return null;
              const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
              const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
              const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);
              return (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Total restante a receber</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                </div>
              );
            })()}
            {paymentDialog?.type === "payoff" && paymentDialog.loanId && (() => {
              const loan = loans.find(l => l.id === paymentDialog.loanId);
              if (!loan) return null;
              const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
              const totalPaid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
              const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);
              return (
                <div className="w-full space-y-2">
                  <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                    <p className="text-xs text-muted-foreground">Total restante a receber</p>
                    <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="payoff-amount-cal" className="text-xs">Valor para quitar (R$)</Label>
                    <Input
                      id="payoff-amount-cal"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={payoffAmount}
                      onChange={(e) => setPayoffAmount(e.target.value)}
                      placeholder={`Ex: ${remaining.toFixed(2)}`}
                      autoFocus
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Informe o valor de quitação. O contrato será marcado como pago.
                    </p>
                  </div>
                </div>
              );
            })()}
            {paymentDialog?.type === "partial" && paymentDialog.amount && (
              <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                <p className="text-xs text-muted-foreground">Valor parcial</p>
                <p className="text-2xl font-bold text-warning">{formatCurrency(paymentDialog.amount)}</p>
              </div>
            )}
            {activeMethods.length > 0 && (
              <div className="w-full space-y-1">
                <Label className="text-sm text-muted-foreground">Forma de pagamento</Label>
                <Select value={selectedMethodId} onValueChange={setSelectedMethodId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {activeMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Label className="text-sm text-muted-foreground">Selecione a data do pagamento</Label>
            <CalendarUI
              mode="single"
              selected={paymentDate}
              onSelect={(d) => d && setPaymentDate(d)}
              className="rounded-md border pointer-events-auto"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog(null)}>Cancelar</Button>
            <Button onClick={confirmPayment} disabled={paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
