import React, { useState, useMemo, useCallback } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useHideValues } from "@/contexts/HideValuesContext";
import { format } from "date-fns";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { cn } from "@/lib/utils";
import {
  CheckCircle, Trash2, DollarSign, User, Calendar as CalendarIcon, LayoutGrid, List,
  Search, Percent, Pencil, Check, X, ChevronDown, ChevronRight, FolderOpen, Folder, HandCoins, Tag, MoreHorizontal, MessageCircle, Filter, SlidersHorizontal, History,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (loanId: string, paymentDate?: string) => void;
  onPartialPayment: (loanId: string, amount: number, paymentDate?: string) => void;
  onFullPayment?: (loanId: string, paymentDate?: string) => void;
  onInterestPayment: (loanId: string, paymentDate?: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  existingTags?: string[];
  initialCategory?: Category;
  initialView?: "cards" | "rows" | "folders";
}

type Category = "all" | "overdue" | "paid_interest" | "paid" | "due_today" | "on_track" | "parcelado";

const categoryConfig: { id: Category; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid_interest", label: "Juros", color: "border-purple/30 text-purple", activeColor: "bg-purple text-purple-foreground border-purple" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "parcelado", label: "Parcelados", color: "border-blue-400/30 text-blue-400", activeColor: "bg-blue-500 text-white border-blue-500" },
  { id: "paid", label: "Quitado", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
];

function rawFormatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getNextDate(base: Date, frequency: string, periods: number): Date {
  const d = new Date(base);
  if (frequency === "Semanal") d.setDate(d.getDate() + 7 * periods);
  else if (frequency === "Quinzenal") d.setDate(d.getDate() + 15 * periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
}

function getFirstPendingDate(loan: Loan, schedules: InstallmentSchedule[]): Date {
  const loanSchedules = schedules.filter((s) => s.loanId === loan.id).sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextNum = loan.paidInstallments + 1;
  const saved = loanSchedules.find((s) => s.installmentNumber === nextNum);
  if (saved) return new Date(saved.dueDate + "T00:00:00");
  // Fallback to dueDate
  return new Date(loan.dueDate + "T00:00:00");
}

function getDaysOverdue(loan: Loan, schedules: InstallmentSchedule[] = []): number {
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = getFirstPendingDate(loan, schedules);
  const diff = Math.floor((todayNorm.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function getLoanCategory(loan: Loan, payments: Payment[], schedules: InstallmentSchedule[] = []): "paid" | "paid_interest" | "overdue" | "due_today" | "on_track" {
  if (loan.status === "paid") return "paid";
  const days = getDaysOverdue(loan, schedules);
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  // If due date is in the future, it's on_track regardless of interest payments
  if (days < 0) {
    if (lastPayment && lastPayment.installmentNumber === 0) return "paid_interest";
    return "on_track";
  }
  if (days === 0) return "due_today";
  if (days > 0) return "overdue";
  return "on_track";
}

const statusMap = {
  paid: { label: "Quitado", className: "bg-success/10 text-success border-success/20" },
  paid_interest: { label: "Juros", className: "bg-purple/10 text-purple border-purple/20" },
  overdue: { label: "Atrasado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  due_today: { label: "Vence Hoje", className: "bg-warning/10 text-warning border-warning/20" },
  on_track: { label: "Em Dia", className: "bg-primary/10 text-primary border-primary/20" },
};

interface EditForm {
  borrowerName: string;
  amount: string;
  interestRate: string;
  interestValue: string;
  installmentValue: string;
  installments: string;
  paidInstallments: string;
  startDate: string;
  dueDate: string;
  notes: string;
  tags: string;
  interestType: string;
  remainingAmount: string;
}

function loanToForm(loan: Loan): EditForm {
  const amt = loan.amount;
  const rate = loan.interestRate;
  const months = loan.installments;
  const interestValue = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : amt * (rate / 100);
  const total = calculateTotalWithInterest(amt, rate, months);
  const remainingForCalc = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : total;
  const paidCount = loan.paidInstallments || 0;
  const remainingInst = Math.max(1, months - paidCount);
  const installmentValue = remainingForCalc / remainingInst;
  const totalPaidCalc = loan.remainingAmount != null ? loan.remainingAmount : total;
  return {
    borrowerName: loan.borrowerName,
    amount: String(amt),
    interestRate: String(rate),
    interestValue: interestValue.toFixed(2),
    installmentValue: installmentValue.toFixed(2),
    installments: String(months),
    paidInstallments: String(loan.paidInstallments),
    startDate: loan.startDate,
    dueDate: loan.dueDate,
    notes: loan.notes || "",
    tags: (loan.tags || []).join(", "),
    interestType: loan.interestType || "Mensal",
    remainingAmount: String(totalPaidCalc),
  };
}

function getTotalPaid(loan: Loan, payments: Payment[]): number {
  return payments.filter((p) => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
}

function LoanCardView({
  loan, payments: allPayments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, no3d = false, existingTags = [],
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (date?: string) => void;
  onPartialPayment: (amount: number, date?: string) => void;
  onFullPayment?: (date?: string) => void;
  onInterestPayment: (date?: string) => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  no3d?: boolean;
  existingTags?: string[];
}) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date>(new Date());
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full"; amount?: number } | null>(null);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [showHistory, setShowHistory] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editingInstallment, setEditingInstallment] = useState(false);
  const [installmentInput, setInstallmentInput] = useState("");
  const [showEditSchedule, setShowEditSchedule] = useState(false);
  const [editScheduleRows, setEditScheduleRows] = useState<{ date: Date; value: string }[]>([]);
  const [showLateInterest, setShowLateInterest] = useState(false);
  const [lateInterestType, setLateInterestType] = useState<string>(loan.lateInterestType || "percentage");
  const [lateInterestValue, setLateInterestValue] = useState<string>(loan.lateInterestValue != null ? String(loan.lateInterestValue) : "");
  const [showPenalty, setShowPenalty] = useState(false);
  const [penaltyValue, setPenaltyValue] = useState<string>(loan.penaltyValue != null ? String(loan.penaltyValue) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const unpaidSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextSchedule = unpaidSchedules[0];
  const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
  const baseRemaining = loan.installments >= 2 && allUnpaidScheduleSum > 0
    ? allUnpaidScheduleSum
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);
  const category = getLoanCategory(loan, allPayments, installmentSchedules);
  const daysOverdue = getDaysOverdue(loan, installmentSchedules);

  // Calculate late fees
  const effectiveDaysLate = Math.max(0, daysOverdue);
  let lateInterestTotal = 0;
  if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid") {
    if (loan.lateInterestType === "fixed") {
      lateInterestTotal = loan.lateInterestValue * effectiveDaysLate;
    } else {
      lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * effectiveDaysLate;
    }
  }
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid")
    ? loan.penaltyValue
    : 0;
  const lateFees = lateInterestTotal + penaltyTotal;
  const interestPaymentsReceived = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0)
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = baseRemaining + lateFees;

  const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
  const fullInstallment = nextSchedule
    ? nextSchedule.amount
    : loan.customInstallmentValue != null && loan.customInstallmentValue > 0
      ? loan.customInstallmentValue
      : (loan.installments >= 2 ? total / loan.installments : baseRemaining);
  const actualRemaining = loan.remainingAmount != null && loan.remainingAmount > 0
    ? loan.remainingAmount
    : Math.max(0, total - totalPaid);
  const expectedRemainingForUnpaid = nextSchedule
    ? allUnpaidScheduleSum
    : fullInstallment * remainingInstallments;
  const partialPaidOnCurrent = Math.max(0, expectedRemainingForUnpaid - actualRemaining);
  const installment = Math.max(0, fullInstallment - partialPaidOnCurrent);
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const interestOnly = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : loan.amount * (loan.interestRate / 100);
  const totalInterest = total - loan.amount;
  const profit = totalPaid - loan.amount;
  const badge = statusMap[category];

  // Next installment due date = due date (end of contract)
  const nextInstallmentDate = useMemo(() => {
    if (loan.status === "paid") return null;
    if (loan.paidInstallments >= loan.installments) return null;
    return getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR");
  }, [loan]);

  const startEdit = () => {
    setForm(loanToForm(loan));
    setEditing(true);
    setShowEditSchedule(false);
    const totalInst = loan.installments;
    const paidInst = loan.paidInstallments || 0;
    const rem = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : total;
    const remInst = Math.max(1, totalInst - paidInst);
    const instVal = (rem / remInst).toFixed(2);
    const freq = loan.interestType || "Mensal";
    // Build rows for ALL installments (paid + pending)
    const allSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    if (allSchedules.length > 0) {
      // Fill all installments from schedules
      const rows: { date: Date; value: string }[] = [];
      for (let i = 1; i <= totalInst; i++) {
        const sched = allSchedules.find((s) => s.installmentNumber === i);
        if (sched) {
          rows.push({ date: new Date(sched.dueDate + "T00:00:00"), value: sched.amount.toFixed(2) });
        } else {
          // Generate from first due date
          const firstDue = new Date(loan.dueDate + "T00:00:00");
          rows.push({
            date: getNextDate(firstDue, freq, i - 1),
            value: loan.customInstallmentValue != null && loan.customInstallmentValue > 0
              ? loan.customInstallmentValue.toFixed(2)
              : instVal,
          });
        }
      }
      setEditScheduleRows(rows);
    } else {
      const firstDue = new Date(loan.dueDate + "T00:00:00");
      setEditScheduleRows(
        Array.from({ length: totalInst }, (_, i) => ({
          date: i === 0 ? firstDue : getNextDate(firstDue, freq, i),
          value: loan.customInstallmentValue != null && loan.customInstallmentValue > 0
            ? loan.customInstallmentValue.toFixed(2)
            : instVal,
        }))
      );
    }
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = async () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const firstRow = editScheduleRows[0];
    const dueDate = firstRow ? firstRow.date.toISOString().split("T")[0] : form.dueDate || loan.dueDate;
    const firstVal = firstRow ? parseFloat(firstRow.value) || 0 : 0;
    const remInst = Math.max(1, (parseInt(form.installments) || loan.installments) - (parseInt(form.paidInstallments) || 0));
    const defaultCalc = (parseFloat(form.remainingAmount) || 0) / remInst;
    const hasCustom = firstVal > 0 && Math.abs(firstVal - defaultCalc) > 0.01;

    const manualInterest = parseFloat(form.interestValue) || 0;
    const calcInterest = (parseFloat(form.amount) || 0) * ((parseFloat(form.interestRate) || 0) / 100);
    const hasCustomInterest = manualInterest > 0 && Math.abs(manualInterest - calcInterest) > 0.01;

    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: parseFloat(form.interestRate) || loan.interestRate,
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate,
      interestType: form.interestType,
      notes: form.notes,
      tags: parsedTags,
      remainingAmount: parseFloat(form.remainingAmount) || 0,
      customInstallmentValue: hasCustom ? firstVal : null,
      customInterestValue: hasCustomInterest ? manualInterest : null,
    });

    // Save ALL installment rows
    if (editScheduleRows.length > 0) {
      await onSaveSchedule(loan.id, editScheduleRows.map((row, idx) => ({
        installmentNumber: idx + 1,
        dueDate: row.date.toISOString().split("T")[0],
        amount: parseFloat(row.value) || 0,
      })));
    }

    setEditing(false);
  };

  const openPaymentDialog = (type: "installment" | "interest" | "partial" | "full", amount?: number) => {
    setPaymentDate(new Date());
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = () => {
    if (!paymentDialog) return;
    const dateStr = paymentDate.toISOString().split("T")[0];
    if (paymentDialog.type === "full") {
      onPartialPayment(remaining, dateStr);
      onUpdate({ paidInstallments: loan.installments, status: "paid" });
    } else if (paymentDialog.type === "installment") onPayment(dateStr);
    else if (paymentDialog.type === "interest") onInterestPayment(dateStr);
    else if (paymentDialog.type === "partial" && paymentDialog.amount) onPartialPayment(paymentDialog.amount, dateStr);
    setPaymentDialog(null);
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      const dateStr = partialDate.toISOString().split("T")[0];
      onPartialPayment(val, dateStr);
      setPartialAmount("");
      setPartialDate(new Date());
      setShowPartial(false);
    }
  };

  const updateField = (field: keyof EditForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const amt = parseFloat(next.amount) || 0;
      const months = parseInt(next.installments) || 1;

      if (field === "amount" || field === "interestRate" || field === "installments" || field === "remainingAmount" || field === "paidInstallments") {
        const rate = parseFloat(next.interestRate) || 0;
        next.interestValue = (amt * (rate / 100)).toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, rate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
        // Rebuild ALL schedule rows (paid rows keep existing values)
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setEditScheduleRows((prev) => {
          return Array.from({ length: months }, (_, i) => {
            if (i < paidInst && prev[i]) return prev[i]; // Keep paid rows
            return {
              date: i === 0 ? firstDue : getNextDate(firstDue, next.interestType, i),
              value: next.installmentValue,
            };
          });
        });
      } else if (field === "interestValue") {
        const iv = parseFloat(value) || 0;
        const newRate = amt > 0 ? (iv / amt) * 100 : 0;
        next.interestRate = newRate.toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, newRate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
      } else if (field === "installmentValue") {
        // Manual override — no back-calculation needed
      } else if (field === "interestType" || field === "dueDate") {
        // Rebuild dates when contract type or due date changes
        const paidInst = parseInt(next.paidInstallments) || 0;
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setEditScheduleRows((prev) =>
          Array.from({ length: months }, (_, i) => {
            if (i < paidInst && prev[i]) return prev[i]; // Keep paid rows
            return {
              date: i === 0 ? firstDue : getNextDate(firstDue, next.interestType, i),
              value: prev[i]?.value || next.installmentValue,
            };
          })
        );
      }
      return next;
    });
  };

  if (editing) {
    return (
      <Card className="overflow-hidden border-primary/30">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Editar Empréstimo</h3>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Check className="h-4 w-4 text-success" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Nome do Devedor</Label><Input value={form.borrowerName} onChange={(e) => updateField("borrowerName", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => updateField("amount", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Juros Mensal (%)</Label><Input type="number" step="0.1" value={form.interestRate} onChange={(e) => updateField("interestRate", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor do Juros (R$)</Label><Input type="number" step="0.01" value={form.interestValue} onChange={(e) => updateField("interestValue", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Valor da Parcela (R$)</Label><Input type="number" step="0.01" value={form.installmentValue} onChange={(e) => updateField("installmentValue", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Parcelas</Label><Input type="number" value={form.installments} onChange={(e) => updateField("installments", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Parcelas Pagas</Label><Input type="number" value={form.paidInstallments} onChange={(e) => updateField("paidInstallments", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Restante a Receber (R$)</Label><Input type="number" step="0.01" value={form.remainingAmount} onChange={(e) => updateField("remainingAmount", e.target.value)} className="h-8 text-sm" /></div>
            <div><Label className="text-xs">Total a Receber (R$)</Label><p className="h-8 flex items-center text-sm font-bold text-primary">{formatCurrency((parseFloat(form.amount) || 0) + (parseFloat(form.interestValue) || 0))}</p></div>
            <div><Label className="text-xs">Data Início</Label><DatePickerField value={form.startDate} onChange={(v) => updateField("startDate", v)} className="h-8 text-sm" /></div>
            <div>
              <Label className="text-xs">Data 1ª Parcela</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {form.dueDate ? format(new Date(form.dueDate + "T00:00:00"), "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={form.dueDate ? new Date(form.dueDate + "T00:00:00") : undefined}
                    onSelect={(d) => d && updateField("dueDate", d.toISOString().split("T")[0])}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Tipo Contrato</Label>
              <Select value={form.interestType} onValueChange={(v) => updateField("interestType", v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Semanal">Semanal</SelectItem>
                  <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                  <SelectItem value="Mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Installment Schedule */}
          {(parseInt(form.installments) || 0) >= 2 && editScheduleRows.length > 0 && (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowEditSchedule(!showEditSchedule)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                {showEditSchedule ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Parcelas ({editScheduleRows.length}x)
                <Badge variant="outline" className="ml-auto text-xs">
                  {form.interestType}
                </Badge>
              </button>
              {showEditSchedule && (
                <div>
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                    <div className="flex gap-3">
                      <span className="text-xs font-medium text-success">{parseInt(form.paidInstallments) || 0} pagas</span>
                      <span className="text-xs font-medium text-warning">{Math.max(0, editScheduleRows.length - (parseInt(form.paidInstallments) || 0))} pendentes</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                    {editScheduleRows.map((row, idx) => {
                      const paidCount = parseInt(form.paidInstallments) || 0;
                      const isPaid = idx < paidCount;
                      return (
                        <div key={idx} className={`flex items-center gap-2 px-3 py-2.5 ${isPaid ? "opacity-60" : ""}`}>
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isPaid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                          }`}>
                            {idx + 1}ª
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start" disabled={isPaid}>
                                <CalendarIcon className={`h-3.5 w-3.5 mr-1.5 ${isPaid ? "text-success" : "text-primary"}`} />
                                {format(row.date, "dd/MM/yyyy")}
                              </Button>
                            </PopoverTrigger>
                            {!isPaid && (
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarUI
                                  mode="single"
                                  selected={row.date}
                                  onSelect={(d) => {
                                    if (d) {
                                      setEditScheduleRows((prev) => {
                                        const rows = [...prev];
                                        rows[idx] = { ...rows[idx], date: d };
                                        for (let i = idx + 1; i < rows.length; i++) {
                                          if (i >= paidCount) {
                                            rows[i] = { ...rows[i], date: getNextDate(d, form.interestType, i - idx) };
                                          }
                                        }
                                        return rows;
                                      });
                                    }
                                  }}
                                  initialFocus
                                  className={cn("p-3 pointer-events-auto")}
                                />
                              </PopoverContent>
                            )}
                          </Popover>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.value}
                            disabled={isPaid}
                            onChange={(e) => {
                              setEditScheduleRows((prev) => {
                                const rows = [...prev];
                                const newVal = e.target.value;
                                rows[idx] = { ...rows[idx], value: newVal };
                                if (idx === paidCount && rows.length > paidCount + 1) {
                                  const firstVal = parseFloat(newVal) || 0;
                                  const totalRem = parseFloat(form.remainingAmount) || 0;
                                  const otherCount = rows.length - paidCount - 1;
                                  const otherVal = (Math.max(0, totalRem - firstVal) / otherCount).toFixed(2);
                                  for (let i = paidCount + 1; i < rows.length; i++) {
                                    rows[i] = { ...rows[i], value: otherVal };
                                  }
                                }
                                return rows;
                              });
                            }}
                            className="h-8 w-24 text-xs text-right"
                          />
                          {isPaid && <Badge variant="outline" className="text-[10px] border-success/30 text-success shrink-0">Pago</Badge>}
                        </div>
                      );
                    })}
                    <div className="px-3 py-2 bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        Total: <span className="font-bold text-foreground">{rawFormatCurrency(editScheduleRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs">Etiquetas</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.split(",").map((t) => t.trim()).filter(Boolean).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 text-xs">
                    {tag}
                    <button
                      type="button"
                      onClick={() => {
                        const currentTags = form.tags.split(",").map((t) => t.trim()).filter((t) => t !== tag);
                        updateField("tags", currentTags.join(", "));
                      }}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 text-xs shrink-0">
                      <ChevronDown className="h-3.5 w-3.5 mr-1" />
                      Existentes
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="start">
                    <div className="flex flex-col max-h-40 overflow-y-auto">
                      {existingTags
                        .filter((t: string) => !form.tags.split(",").map((x: string) => x.trim()).filter(Boolean).includes(t))
                        .sort((a: string, b: string) => a.localeCompare(b, "pt-BR"))
                        .map((tag: string) => (
                          <button
                            key={tag}
                            type="button"
                            className="text-left text-sm px-3 py-1.5 hover:bg-muted rounded-sm"
                            onClick={() => {
                              const currentTags = form.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
                              updateField("tags", [...currentTags, tag].join(", "));
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Input
                  value={form.tags}
                  onChange={(e) => updateField("tags", e.target.value)}
                  className="h-8 text-sm flex-1"
                  placeholder="Digite etiquetas separadas por vírgula"
                />
              </div>
            </div>
          </div>
          <div><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} className="text-sm" /></div>
        </CardContent>
      </Card>
    );
  }

  const borderColor =
    category === "overdue" ? "border-l-destructive" :
    category === "due_today" ? "border-l-warning" :
    category === "paid" ? "border-l-success" :
    category === "paid_interest" ? "border-l-purple" :
    "border-l-primary";

  const expectedProfit = remaining + totalPaid - loan.amount;
  const realizedProfit = Math.max(0, totalPaid - loan.amount);
  const realizedProfitPct = expectedProfit > 0 ? Math.round((realizedProfit / expectedProfit) * 100) : 0;

  const cardBorder =
    category === "overdue" ? "border-destructive/50" :
    category === "due_today" ? "border-warning/50" :
    category === "paid" ? "border-success/50" :
    category === "paid_interest" ? "border-purple/50" :
    "border-primary/50";

  const cardBg =
    category === "overdue" ? "bg-destructive/[0.22]" :
    category === "due_today" ? "bg-warning/[0.22]" :
    category === "paid" ? "bg-success/[0.22]" :
    category === "paid_interest" ? "bg-purple/[0.22]" :
    "bg-card";

  const headerBg =
    category === "overdue" ? "bg-destructive/[0.45] border-destructive/30" :
    category === "due_today" ? "bg-warning/[0.45] border-warning/30" :
    category === "paid" ? "bg-success/[0.45] border-success/30" :
    category === "paid_interest" ? "bg-purple/[0.45] border-purple/30" :
    "bg-primary/8 border-border/50";

  return (
    <>
    <Card no3d={no3d} className={`overflow-hidden hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out h-full flex flex-col border ${cardBorder} ${cardBg}`}>
      {/* Client Name Header */}
      <div className={`border-b px-4 py-3 text-center ${headerBg}`}>
        <h3 className="font-bold text-foreground text-lg">{loan.borrowerName}</h3>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        {/* Avatar + Badges + Actions Row */}
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 ${
            category === "overdue" ? "bg-destructive" :
            category === "due_today" ? "bg-warning" :
            category === "paid" ? "bg-success" :
            "gradient-primary"
          }`}>
            {loan.borrowerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={`${badge.className} text-xs font-semibold`}>{badge.label}</Badge>
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 uppercase">
              {loan.interestType}
            </Badge>
            {daysOverdue > 0 && loan.status !== "paid" && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                {daysOverdue}d atraso
              </Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1 flex-wrap">
            {loan.tags && loan.tags.length > 0 && loan.tags.map((tag) => (
              <Badge key={tag} className="bg-primary text-primary-foreground text-xs gap-0.5 pr-1">
                <Tag className="h-2.5 w-2.5" />{tag}
                <button onClick={() => { const updated = (loan.tags || []).filter(t => t !== tag); onUpdate({ tags: updated }); }} className="ml-0.5 hover:text-destructive">
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
            {showTagInput ? (
              <div className="flex items-center gap-1">
                <Input
                  value={newTag} onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Etiqueta" className="h-6 w-24 text-xs" autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTag.trim()) {
                      onUpdate({ tags: [...(loan.tags || []), newTag.trim()] });
                      setNewTag(""); setShowTagInput(false);
                    }
                    if (e.key === "Escape") { setNewTag(""); setShowTagInput(false); }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                  if (newTag.trim()) { onUpdate({ tags: [...(loan.tags || []), newTag.trim()] }); }
                  setNewTag(""); setShowTagInput(false);
                }}><Check className="h-3 w-3 text-success" /></Button>
              </div>
            ) : (
              <button onClick={() => setShowTagInput(true)} className="h-6 w-6 rounded-md border border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:text-primary transition-colors" title="Adicionar etiqueta">
                <Tag className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Large remaining amount */}
        <div className="text-center py-2">
          {(loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments ? (
            <p className={`text-3xl font-bold ${remaining > 0 ? "text-primary" : "text-success"}`}>
              {formatCurrency(installment)}
            </p>
          ) : (
            <p className={`text-3xl font-bold ${remaining > 0 ? "text-primary" : "text-success"}`}>
              {formatCurrency(remaining)}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {(loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments
              ? `parcela pendente (${loan.paidInstallments + 1}ª de ${loan.installments})${loan.customInstallmentValue != null ? " • manual" : ""}`
              : "restante a receber"}
          </p>
          {(loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments && (
            <p className="text-xs text-muted-foreground mt-0.5">Total restante: {formatCurrency(remaining)}</p>
          )}
          {lateFees > 0 && (
            <div className="text-xs text-destructive mt-1 space-y-0.5">
              {lateInterestTotal > 0 && (
                <p>+ Juros atraso ({effectiveDaysLate}d): {rawFormatCurrency(lateInterestTotal)}</p>
              )}
              {penaltyTotal > 0 && (
                <p>+ Multa: {rawFormatCurrency(penaltyTotal)}</p>
              )}
            </div>
          )}
        </div>

        {/* Emprestado / Total a Receber */}
        <div className="grid grid-cols-2 gap-3 border border-border/30 rounded-xl p-3">
          <div>
            <p className="text-xs text-muted-foreground">Emprestado</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(loan.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total a Receber</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100)}</p>
          </div>
        </div>

        {/* Lucro Previsto / Lucro Realizado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">💰 Lucro Previsto</p>
            <p className="text-sm font-bold text-success">{formatCurrency(remaining + totalPaid - loan.amount)}</p>
          </div>
          <div className="bg-muted/30 border border-border/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">✅ Lucro Realizado</p>
            <p className="text-sm font-bold text-foreground">
              {formatCurrency(realizedProfit)} <span className="text-xs text-muted-foreground">{realizedProfitPct}%</span>
            </p>
          </div>
        </div>

        {/* Vencimento / Pago */}
        <div className="grid grid-cols-2 gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer text-left w-full">
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Venc: <Pencil className="inline h-2.5 w-2.5 ml-0.5" /></p>
                  <p className="text-sm font-semibold text-foreground">{getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}</p>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarUI
                mode="single"
                selected={getFirstPendingDate(loan, installmentSchedules)}
                onSelect={async (d) => {
                  if (d) {
                    const newDateStr = d.toISOString().split("T")[0];
                    onUpdate({ dueDate: newDateStr });
                    // Also persist to loan_installments for the next pending installment
                    const nextNum = loan.paidInstallments + 1;
                    const loanSchedules = installmentSchedules
                      .filter((s) => s.loanId === loan.id)
                      .sort((a, b) => a.installmentNumber - b.installmentNumber);
                    const updatedRows = loanSchedules.length > 0
                      ? loanSchedules.map((s) =>
                          s.installmentNumber === nextNum
                            ? { installmentNumber: s.installmentNumber, dueDate: newDateStr, amount: s.amount }
                            : { installmentNumber: s.installmentNumber, dueDate: s.dueDate, amount: s.amount }
                        )
                      : [{ installmentNumber: nextNum, dueDate: newDateStr, amount: calculateInstallment(loan.amount, loan.interestRate, loan.installments) }];
                    await onSaveSchedule(loan.id, updatedRows);
                  }
                }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <DollarSign className="h-4 w-4 text-success shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Pago:</p>
              <p className="text-sm font-bold text-success">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </div>

        {/* Só Juros (por parcela) */}
        <div className="flex items-center justify-between bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
          <span className="text-sm text-muted-foreground">Só Juros (por parcela):</span>
          <span className="text-sm font-bold text-foreground">{formatCurrency(interestOnly)}</span>
        </div>

        {/* Progress */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">{loan.paidInstallments}/{loan.installments} parcelas</span>
            <span className="font-medium text-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2.5" />
        </div>

        {/* Mais Detalhes - Installment Schedule */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center py-1"
        >
          {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showDetails ? "Ocultar detalhes" : "Mais detalhes"}
        </button>

        {showDetails && (
          <div className="space-y-2 bg-muted/30 rounded-lg p-3 border border-border/50">
            <p className="text-xs font-semibold text-foreground mb-2">Cronograma de Parcelas</p>
            <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-muted-foreground">#</span>
              <span className="font-medium text-muted-foreground">Vencimento</span>
              <span className="font-medium text-muted-foreground">Valor</span>
              <span className="font-medium text-muted-foreground">Status</span>
              {Array.from({ length: loan.installments }, (_, idx) => {
                const i = idx + 1;
                // Priority: 1) saved schedule, 2) payment date, 3) calculated fallback
                const savedSchedule = installmentSchedules.find((s) => s.loanId === loan.id && s.installmentNumber === i);
                const firstDueDate = new Date(loan.dueDate + "T00:00:00");
                const fallbackDate = getNextDate(firstDueDate, loan.interestType || "Mensal", i - 1);
                const instDate = savedSchedule
                  ? new Date(savedSchedule.dueDate + "T00:00:00")
                  : i <= loan.paidInstallments
                    ? (() => {
                        const loanPayment = allPayments.find((p) => p.loanId === loan.id && p.installmentNumber === i);
                        return loanPayment ? new Date(loanPayment.date + "T00:00:00") : fallbackDate;
                      })()
                    : fallbackDate;
                const instDateStr = instDate.toLocaleDateString("pt-BR");
                const isPaid = i <= loan.paidInstallments;
                const todayNorm = new Date();
                const todayStr = `${todayNorm.getFullYear()}-${String(todayNorm.getMonth() + 1).padStart(2, "0")}-${String(todayNorm.getDate()).padStart(2, "0")}`;
                const instIso = instDate.toISOString().split("T")[0];
                const isOverdue = !isPaid && instIso < todayStr;
                const isDueToday = !isPaid && instIso === todayStr;
                return (
                  <React.Fragment key={i}>
                    <span className="text-muted-foreground">{i}</span>
                    <span className="text-foreground">{instDateStr}</span>
                    <span className="text-foreground font-medium">{formatCurrency(installment)}</span>
                    <span>
                      {isPaid ? (
                        <Badge className="bg-success/20 text-success border-success/30 text-[10px]">Pago</Badge>
                      ) : isOverdue ? (
                        <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[10px]">Atrasado</Badge>
                      ) : isDueToday ? (
                        <Badge className="bg-warning/20 text-warning border-warning/30 text-[10px]">Hoje</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                      )}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-border/30 text-xs">
              <div>
                <p className="text-muted-foreground">Valor da Parcela</p>
                <p className="font-semibold text-foreground">{formatCurrency(installment)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Juros por Parcela</p>
                <p className="font-semibold text-foreground">{formatCurrency(installment - (loan.amount / loan.installments))}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total de Juros</p>
                <p className="font-semibold text-foreground">{formatCurrency(totalInterest)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Já Recebido</p>
                <p className="font-semibold text-success">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
          </div>
        )}

        {loan.notes && (
          <p className="text-xs text-muted-foreground italic bg-muted/30 rounded-lg px-3 py-2">📝 {loan.notes}</p>
        )}

        {/* Partial payment input */}
        <Dialog open={showPartial} onOpenChange={(open) => { if (!open) { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); } }}>
          <DialogContent className="sm:max-w-[340px]">
            <DialogHeader>
              <DialogTitle>Pagamento Parcial</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Valor (R$)</Label>
                <Input
                  type="number" step="0.01" placeholder="Ex: 150.00"
                  value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                  className="h-9 text-sm mt-1" autoFocus
                />
              </div>
              <div>
                <Label className="text-sm">Data do pagamento</Label>
                <div className="mt-1 flex justify-center">
                  <CalendarUI
                    mode="single"
                    selected={partialDate}
                    onSelect={(d) => d && setPartialDate(d)}
                    className="rounded-md border pointer-events-auto"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); }}>Cancelar</Button>
              <Button onClick={handlePartialSubmit} disabled={!partialAmount || parseFloat(partialAmount) <= 0}>Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50 mt-auto">
          {!readOnly && loan.status !== "paid" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="w-full h-10 text-sm font-semibold gap-2">
                  <DollarSign className="h-4 w-4" /> Pagar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56 p-2 space-y-1">
                <DropdownMenuItem
                  onClick={() => openPaymentDialog("installment")}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <CheckCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Parcela</p>
                    <p className="text-[11px] text-muted-foreground">{formatCurrency(installment)}</p>
                  </div>
                </DropdownMenuItem>
                {loan.installments < 2 && (
                <DropdownMenuItem
                  onClick={() => openPaymentDialog("interest")}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-purple/10 focus:bg-purple/10"
                >
                  <div className="h-8 w-8 rounded-full bg-purple/15 flex items-center justify-center shrink-0">
                    <Percent className="h-4 w-4 text-purple" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Juros</p>
                    <p className="text-[11px] text-muted-foreground">{formatCurrency(interestOnly)}</p>
                  </div>
                </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setShowPartial(!showPartial)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-warning/10 focus:bg-warning/10"
                >
                  <div className="h-8 w-8 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
                    <HandCoins className="h-4 w-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Parcial</p>
                    <p className="text-[11px] text-muted-foreground">Valor personalizado</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openPaymentDialog("full")}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-success/10 focus:bg-success/10"
                >
                  <div className="h-8 w-8 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Total</p>
                    <p className="text-[11px] text-muted-foreground">{formatCurrency(remaining)}</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
           )}
          {!readOnly && loan.status !== "paid" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5 border-warning text-warning" onClick={() => setShowLateInterest(!showLateInterest)}>
                <Percent className="h-3.5 w-3.5" /> Juros por Atraso
              </Button>
              <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5 border-destructive text-destructive" onClick={() => setShowPenalty(!showPenalty)}>
                <DollarSign className="h-3.5 w-3.5" /> Aplicar Multa
              </Button>
            </div>
          )}
          {!readOnly && showLateInterest && (
            <div className="p-3 rounded-lg bg-muted border border-border/50 space-y-2">
              <p className="text-xs font-semibold text-foreground">Juros por Atraso</p>
              <div className="flex gap-2">
                <Button size="sm" variant={lateInterestType === "percentage" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setLateInterestType("percentage")}>
                  % por dia
                </Button>
                <Button size="sm" variant={lateInterestType === "fixed" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setLateInterestType("fixed")}>
                  R$ por dia
                </Button>
              </div>
              <Input
                type="number" step="0.01" min="0"
                placeholder={lateInterestType === "percentage" ? "Ex: 0.5 (%)" : "Ex: 5.00 (R$)"}
                value={lateInterestValue}
                onChange={(e) => setLateInterestValue(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => {
                  const val = parseFloat(lateInterestValue) || 0;
                  onUpdate({ lateInterestType, lateInterestValue: val > 0 ? val : null });
                  setShowLateInterest(false);
                }}>Salvar</Button>
                {loan.lateInterestValue != null && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => {
                    onUpdate({ lateInterestType: null, lateInterestValue: null });
                    setLateInterestValue("");
                    setShowLateInterest(false);
                  }}>Remover</Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowLateInterest(false)}>Cancelar</Button>
              </div>
            </div>
          )}
          {!readOnly && showPenalty && (
            <div className="p-3 rounded-lg bg-muted border border-border/50 space-y-2">
              <p className="text-xs font-semibold text-foreground">Multa por Parcela (valor fixo único)</p>
              <Input
                type="number" step="0.01" min="0"
                placeholder="Ex: 50.00 (R$)"
                value={penaltyValue}
                onChange={(e) => setPenaltyValue(e.target.value)}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => {
                  const val = parseFloat(penaltyValue) || 0;
                  onUpdate({ penaltyValue: val > 0 ? val : null });
                  setShowPenalty(false);
                }}>Salvar</Button>
                {loan.penaltyValue != null && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" onClick={() => {
                    onUpdate({ penaltyValue: null });
                    setPenaltyValue("");
                    setShowPenalty(false);
                  }}>Remover</Button>
                )}
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowPenalty(false)}>Cancelar</Button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-center gap-1">
            {!readOnly && loan.status === "paid" && (
              <Button
                size="icon" variant="ghost" className="h-8 w-8 text-success"
                onClick={() => onUpdate({ status: "active", paidInstallments: 0 })}
                title="Marcar como não pago"
              >
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowHistory(true)} title="Histórico de Pagamentos">
              <History className="h-4 w-4 text-muted-foreground" />
            </Button>
            {!readOnly && (
              <>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setConfirmDelete(true)} title="Excluir">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
           </div>
        </div>
      </CardContent>
    </Card>
    <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle>
            {paymentDialog?.type === "full" ? "Pagamento Total" : paymentDialog?.type === "installment" ? "Receber Parcela" : paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2">
          {paymentDialog?.type === "full" && (
            <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
              <p className="text-xs text-muted-foreground">Valor restante a receber</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
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
          <Button onClick={confirmPayment}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={showHistory} onOpenChange={setShowHistory}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Histórico de Pagamentos — {loan.borrowerName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {(() => {
            const loanPayments = allPayments.filter((p) => p.loanId === loan.id).sort((a, b) => b.date.localeCompare(a.date));
            if (loanPayments.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento registrado</p>;
            return (
              <div className="space-y-2">
                {loanPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${
                          p.installmentNumber > 0 ? "bg-success/10 text-success border-success/20" :
                          p.installmentNumber === 0 ? "bg-purple/10 text-purple border-purple/20" :
                          "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                        }`}>
                          {p.installmentNumber > 0 ? `Parcela ${p.installmentNumber}` : p.installmentNumber === 0 ? "Juros" : "Parcial"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(p.amount)}</p>
                    </div>
                    {!readOnly && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setDeletePaymentId(p.id)} title="Excluir pagamento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowHistory(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir empréstimo</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o empréstimo de <strong>{loan.borrowerName}</strong>? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!deletePaymentId} onOpenChange={() => setDeletePaymentId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir pagamento</AlertDialogTitle>
          <AlertDialogDescription>Tem certeza que deseja excluir este pagamento?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (deletePaymentId) { onDeletePayment(deletePaymentId); setDeletePaymentId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function LoanRowView({
  loan, payments: allPayments, installmentSchedules = [], onPayment, onPartialPayment, onFullPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, readOnly = false, existingTags = [],
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  onPayment: (date?: string) => void;
  onPartialPayment: (amount: number, date?: string) => void;
  onFullPayment?: (date?: string) => void;
  onInterestPayment: (date?: string) => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  readOnly?: boolean;
  existingTags?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date>(new Date());
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full"; amount?: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const unpaidSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
  const baseRemaining = loan.installments >= 2 && allUnpaidScheduleSum > 0
    ? allUnpaidScheduleSum
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);

  const daysOverdue = getDaysOverdue(loan, installmentSchedules);

  // Calculate late fees
  const effectiveDaysLate = Math.max(0, daysOverdue);
  let lateInterestTotal = 0;
  if (loan.lateInterestValue != null && loan.lateInterestValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid") {
    if (loan.lateInterestType === "fixed") {
      lateInterestTotal = loan.lateInterestValue * effectiveDaysLate;
    } else {
      lateInterestTotal = baseRemaining * (loan.lateInterestValue / 100) * effectiveDaysLate;
    }
  }
  const penaltyTotal = (loan.penaltyValue != null && loan.penaltyValue > 0 && effectiveDaysLate > 0 && loan.status !== "paid") ? loan.penaltyValue : 0;
  const lateFees = lateInterestTotal + penaltyTotal;
  const interestPaymentsReceived = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0)
    .reduce((sum, p) => sum + p.amount, 0);
  const remaining = baseRemaining + lateFees;
  const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
  const nextSchedule = unpaidSchedules[0];
  const fullInstallmentValue = nextSchedule
    ? nextSchedule.amount
    : loan.customInstallmentValue != null && loan.customInstallmentValue > 0
      ? loan.customInstallmentValue
      : (loan.installments >= 2 ? total / loan.installments : baseRemaining);
  const actualRemainingRow = loan.remainingAmount != null && loan.remainingAmount > 0
    ? loan.remainingAmount
    : Math.max(0, total - totalPaid);
  const expectedRemainingRow = nextSchedule
    ? allUnpaidScheduleSum
    : fullInstallmentValue * remainingInstallments;
  const partialPaidOnCurrentRow = Math.max(0, expectedRemainingRow - actualRemainingRow);
  const installmentValue = Math.max(0, fullInstallmentValue - partialPaidOnCurrentRow);
  const isParcelado = (loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments;
  const category = getLoanCategory(loan, allPayments, installmentSchedules);
  const badge = statusMap[category];

  const startEdit = () => { setForm(loanToForm(loan)); setEditing(true); setExpanded(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const manualInterest = parseFloat(form.interestValue) || 0;
    const calcInterest = (parseFloat(form.amount) || 0) * ((parseFloat(form.interestRate) || 0) / 100);
    const hasCustomInterest = manualInterest > 0 && Math.abs(manualInterest - calcInterest) > 0.01;
    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: parseFloat(form.interestRate) || loan.interestRate,
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      interestType: form.interestType,
      notes: form.notes,
      tags: parsedTags,
      remainingAmount: parseFloat(form.remainingAmount) || 0,
      customInterestValue: hasCustomInterest ? manualInterest : null,
    });
    setEditing(false);
  };

  const openPaymentDialog = (type: "installment" | "interest" | "partial" | "full", amount?: number) => {
    setPaymentDate(new Date());
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = () => {
    if (!paymentDialog) return;
    const dateStr = paymentDate.toISOString().split("T")[0];
    if (paymentDialog.type === "full") {
      onPartialPayment(remaining, dateStr);
      onUpdate({ paidInstallments: loan.installments, status: "paid" });
    } else if (paymentDialog.type === "installment") onPayment(dateStr);
    else if (paymentDialog.type === "interest") onInterestPayment(dateStr);
    else if (paymentDialog.type === "partial" && paymentDialog.amount) onPartialPayment(paymentDialog.amount, dateStr);
    setPaymentDialog(null);
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      const dateStr = partialDate.toISOString().split("T")[0];
      onPartialPayment(val, dateStr);
      setPartialAmount("");
      setPartialDate(new Date());
      setShowPartial(false);
    }
  };

  const updateField = (field: keyof EditForm, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const amt = parseFloat(next.amount) || 0;
      const months = parseInt(next.installments) || 1;

      if (field === "amount" || field === "interestRate" || field === "installments" || field === "remainingAmount" || field === "paidInstallments") {
        const rate = parseFloat(next.interestRate) || 0;
        next.interestValue = (amt * (rate / 100)).toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, rate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
      } else if (field === "interestValue") {
        const iv = parseFloat(value) || 0;
        const newRate = amt > 0 ? (iv / amt) * 100 : 0;
        next.interestRate = newRate.toFixed(2);
        const totalCalc = calculateTotalWithInterest(amt, newRate, months);
        const rem = parseFloat(next.remainingAmount) || totalCalc;
        const paidInst = parseInt(next.paidInstallments) || 0;
        const remInst = Math.max(1, months - paidInst);
        next.installmentValue = (rem / remInst).toFixed(2);
      } else if (field === "installmentValue") {
        // Manual installment value — don't auto-recalculate
      }
      return next;
    });
  };

  return (
    <>
    <tr className={`border-b border-border/30 hover:bg-muted/30 transition-colors group cursor-pointer ${expanded ? "bg-muted/20" : ""}`} onClick={() => setExpanded(!expanded)}>
      {/* Cliente */}
      <td className="px-1.5 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-3">
          <div className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center text-primary-foreground font-bold text-[9px] sm:text-xs shrink-0 ${
            category === "overdue" ? "bg-destructive" :
            category === "due_today" ? "bg-warning" :
            category === "paid" ? "bg-success" :
            "gradient-primary"
          }`}>
            {loan.borrowerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="font-medium text-[11px] sm:text-sm text-foreground truncate block max-w-[80px] sm:max-w-none">{loan.borrowerName}</span>
            {loan.tags && loan.tags.length > 0 && (
              <div className="flex flex-wrap gap-0.5 mt-0.5 sm:hidden">
                {loan.tags.map((tag) => (
                  <Badge key={tag} className="bg-primary text-primary-foreground text-[8px] px-1 py-0">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </td>
      {/* Status */}
      <td className="px-1.5 sm:px-4 py-2 sm:py-3">
        <Badge variant="outline" className={`${badge.className} text-[9px] sm:text-xs px-1.5 sm:px-2.5`}>{badge.label}</Badge>
      </td>
      {/* Emprestado - hidden on mobile */}
      <td className="hidden sm:table-cell px-4 py-3">
        <span className="text-sm font-medium text-foreground">{formatCurrency(loan.amount)}</span>
      </td>
      {/* Restante / Parcela / Total Pago */}
      <td className="px-1.5 sm:px-4 py-2 sm:py-3">
        {loan.status === "paid" ? (
          <span className="text-[11px] sm:text-sm font-medium text-success">{formatCurrency(totalPaid)}</span>
        ) : isParcelado ? (
          <span className="text-[11px] sm:text-sm font-medium text-destructive">{formatCurrency(installmentValue)}</span>
        ) : (
          <span className="text-[11px] sm:text-sm font-medium text-destructive">{formatCurrency(remaining)}</span>
        )}
      </td>
      {/* Parcelas - hidden on mobile */}
      <td className="hidden sm:table-cell px-4 py-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{loan.paidInstallments}/{loan.installments}</span>
        </div>
        {daysOverdue > 0 && loan.status !== "paid" && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="h-2 w-2 rounded-full bg-destructive inline-block"></span>
            <span className="text-[10px] text-destructive">{daysOverdue} dia{daysOverdue > 1 ? "s" : ""} em atraso</span>
          </div>
        )}
      </td>
      {/* Vencimento */}
      <td className="px-1.5 sm:px-4 py-2 sm:py-3">
        <span className={`text-[11px] sm:text-sm ${category === "overdue" ? "text-warning" : "text-foreground"}`}>
          {getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}
        </span>
      </td>
      {/* Etiquetas - hidden on mobile */}
      <td className="hidden sm:table-cell px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {loan.tags && loan.tags.length > 0 ? loan.tags.map((tag) => (
            <Badge key={tag} className="bg-primary text-primary-foreground text-[10px]">{tag}</Badge>
          )) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </td>
      {/* Chevron */}
      <td className="hidden sm:table-cell px-4 py-3 text-right">
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground inline" /> : <ChevronRight className="h-4 w-4 text-muted-foreground inline" />}
      </td>
    </tr>
    {expanded && (
      <tr className="border-b border-border/30 bg-muted/10">
        <td colSpan={8} className="px-3 sm:px-6 py-4" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Editar Empréstimo</h3>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}><Check className="h-4 w-4 text-success" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Nome do Devedor</Label><Input value={form.borrowerName} onChange={(e) => updateField("borrowerName", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Valor (R$)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => updateField("amount", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Juros Mensal (%)</Label><Input type="number" step="0.1" value={form.interestRate} onChange={(e) => updateField("interestRate", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Valor do Juros (R$)</Label><Input type="number" step="0.01" value={form.interestValue} onChange={(e) => updateField("interestValue", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Valor da Parcela (R$)</Label><Input type="number" step="0.01" value={form.installmentValue} onChange={(e) => updateField("installmentValue", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Parcelas</Label><Input type="number" value={form.installments} onChange={(e) => updateField("installments", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Parcelas Pagas</Label><Input type="number" value={form.paidInstallments} onChange={(e) => updateField("paidInstallments", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Restante a Receber (R$)</Label><Input type="number" step="0.01" value={form.remainingAmount} onChange={(e) => updateField("remainingAmount", e.target.value)} className="h-8 text-sm" /></div>
                <div><Label className="text-xs">Total a Receber (R$)</Label><p className="h-8 flex items-center text-sm font-bold text-primary">{formatCurrency((parseFloat(form.amount) || 0) + (parseFloat(form.interestValue) || 0))}</p></div>
                <div><Label className="text-xs">Data Início</Label><DatePickerField value={form.startDate} onChange={(v) => updateField("startDate", v)} className="h-8 text-sm" /></div>
                <div>
                  <Label className="text-xs">Data 1ª Parcela</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-8 text-sm")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {form.dueDate ? format(new Date(form.dueDate + "T00:00:00"), "dd/MM/yyyy") : "Selecione"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarUI
                        mode="single"
                        selected={form.dueDate ? new Date(form.dueDate + "T00:00:00") : undefined}
                        onSelect={(d) => d && updateField("dueDate", d.toISOString().split("T")[0])}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">Tipo Contrato</Label>
                  <Select value={form.interestType} onValueChange={(v) => updateField("interestType", v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Semanal">Semanal</SelectItem>
                      <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="Mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Etiquetas (separar por vírgula)</Label><Input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} className="h-8 text-sm" placeholder="Ex: VIP, Renovação, Garantia" /></div>
              <div><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={2} className="text-sm" /></div>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-card rounded-lg p-3 border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase">Emprestado</p>
                <p className="text-sm font-bold text-foreground">{formatCurrency(loan.amount)}</p>
              </div>
              <div className="bg-card rounded-lg p-3 border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase">Total a Receber</p>
                <p className="text-sm font-bold text-foreground">{formatCurrency(Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100)}</p>
              </div>
              <div className="bg-card rounded-lg p-3 border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase">Total Pago</p>
                <p className="text-sm font-bold text-success">{formatCurrency(totalPaid)}</p>
              </div>
              <div className="bg-card rounded-lg p-3 border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase">Restante</p>
                <p className="text-sm font-bold text-destructive">{formatCurrency(remaining)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Juros</p>
                <p className="text-xs font-medium">{loan.interestRate}% {loan.interestType}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Parcelas</p>
                <p className="text-xs font-medium">{loan.paidInstallments}/{loan.installments}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Data Saída</p>
                <p className="text-xs font-medium">{new Date(loan.startDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Vencimento</p>
                <p className="text-xs font-medium">
                  {getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
            {daysOverdue > 0 && loan.status !== "paid" && (
              <div className="flex items-center gap-1.5 text-destructive">
                <span className="h-2 w-2 rounded-full bg-destructive inline-block"></span>
                <span className="text-xs font-medium">{daysOverdue} dia{daysOverdue > 1 ? "s" : ""} em atraso</span>
                {lateInterestTotal > 0 && <span className="text-xs">• Juros mora: {formatCurrency(lateInterestTotal)}</span>}
                {penaltyTotal > 0 && <span className="text-xs">• Multa: {formatCurrency(penaltyTotal)}</span>}
              </div>
            )}
            {loan.notes && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Observações</p>
                <p className="text-xs text-foreground mt-0.5">{loan.notes}</p>
              </div>
            )}
            {loan.tags && loan.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {loan.tags.map((tag) => (
                  <Badge key={tag} className="bg-primary text-primary-foreground text-[10px]">{tag}</Badge>
                ))}
              </div>
            )}
            {/* Progress */}
            <div>
              <Progress value={loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0} className="h-2" />
              <p className="text-[10px] text-muted-foreground mt-1">{Math.round(loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0)}% concluído</p>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t border-border/30 w-full">
              {!readOnly && loan.status !== "paid" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" className="w-full h-10 text-sm gap-2" onClick={(e) => e.stopPropagation()}>
                      <DollarSign className="h-4 w-4" /> Pagar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => openPaymentDialog("installment")}>
                      <CheckCircle className="h-4 w-4 mr-2" /> Receber Parcela
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openPaymentDialog("interest")}>
                      <Percent className="h-4 w-4 mr-2" /> Pagar Juros
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowPartial(true)}>
                      <HandCoins className="h-4 w-4 mr-2" /> Pagamento Parcial
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openPaymentDialog("full")}>
                      <DollarSign className="h-4 w-4 mr-2" /> Pagamento Total
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!readOnly && loan.status === "paid" && (
                <Button variant="outline" className="w-full h-10 text-sm gap-2" onClick={(e) => { e.stopPropagation(); onUpdate({ status: "active", paidInstallments: 0 }); }}>
                  <X className="h-4 w-4" /> Marcar como não pago
                </Button>
              )}
              <div className="flex gap-2 w-full">
                <Button variant="ghost" className="flex-1 h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}>
                  <History className="h-3.5 w-3.5" /> Histórico
                </Button>
                {!readOnly && (
                  <>
                    <Button variant="ghost" className="flex-1 h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); startEdit(); }}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="ghost" className="flex-1 h-9 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Dialog open={showPartial} onOpenChange={(open) => { if (!open) { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); } }}>
              <DialogContent className="sm:max-w-[340px]">
                <DialogHeader>
                  <DialogTitle>Pagamento Parcial</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm">Valor (R$)</Label>
                    <Input
                      type="number" step="0.01" placeholder="Ex: 150.00"
                      value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                      className="h-9 text-sm mt-1" autoFocus
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Data do pagamento</Label>
                    <div className="mt-1 flex justify-center">
                      <CalendarUI
                        mode="single"
                        selected={partialDate}
                        onSelect={(d) => d && setPartialDate(d)}
                        className="rounded-md border pointer-events-auto"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); }}>Cancelar</Button>
                  <Button onClick={handlePartialSubmit} disabled={!partialAmount || parseFloat(partialAmount) <= 0}>Confirmar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          )}
        </td>
      </tr>
    )}
    <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle>
            {paymentDialog?.type === "full" ? "Pagamento Total" : paymentDialog?.type === "installment" ? "Receber Parcela" : paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2">
          {paymentDialog?.type === "full" && (
            <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
              <p className="text-xs text-muted-foreground">Valor restante a receber</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
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
          <Button onClick={confirmPayment}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={showHistory} onOpenChange={setShowHistory}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Histórico de Pagamentos — {loan.borrowerName}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[400px] overflow-y-auto">
          {(() => {
            const loanPayments = allPayments.filter((p) => p.loanId === loan.id).sort((a, b) => b.date.localeCompare(a.date));
            if (loanPayments.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">Nenhum pagamento registrado</p>;
            return (
              <div className="space-y-2">
                {loanPayments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${
                          p.installmentNumber > 0 ? "bg-success/10 text-success border-success/20" :
                          p.installmentNumber === 0 ? "bg-purple/10 text-purple border-purple/20" :
                          "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                        }`}>
                          {p.installmentNumber > 0 ? `Parcela ${p.installmentNumber}` : p.installmentNumber === 0 ? "Juros" : "Parcial"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(p.amount)}</p>
                    </div>
                    {!readOnly && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setDeletePaymentId(p.id)} title="Excluir pagamento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowHistory(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir empréstimo</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o empréstimo de <strong>{loan.borrowerName}</strong>? Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!deletePaymentId} onOpenChange={() => setDeletePaymentId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir pagamento</AlertDialogTitle>
          <AlertDialogDescription>Tem certeza que deseja excluir este pagamento?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (deletePaymentId) { onDeletePayment(deletePaymentId); setDeletePaymentId(null); } }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

// Client folder grouping
interface ClientGroup {
  name: string;
  loans: Loan[];
  totalAmount: number;
  totalPaid: number;
  totalReceivable: number;
  hasOverdue: boolean;
}

function ClientFolder({
  group, payments, installmentSchedules, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false,
}: {
  group: ClientGroup;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (id: string, date?: string) => void;
  onPartialPayment: (id: string, amount: number, date?: string) => void;
  onInterestPayment: (id: string, date?: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (id: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
}) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [open, setOpen] = useState(false);
  const activeCount = group.loans.filter((l) => l.status !== "paid").length;
  const paidCount = group.loans.filter((l) => l.status === "paid").length;

  return (
    <Card no3d className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""} ${group.hasOverdue ? "border-destructive/40" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
            {group.hasOverdue && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Atrasado</Badge>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.loans.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Emprestado</p>
            <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Recebido</p>
            <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
            <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3">
          {/* Mobile summary */}
          <div className="flex sm:hidden items-center justify-between text-xs border-b border-border/30 pb-3">
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">Emprestado</p>
              <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">Recebido</p>
              <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
              <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/30 overflow-hidden shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Cliente</th>
                  <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Status</th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Emprestado</th>
                  <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Restante</th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Parcelas</th>
                  <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Venc.</th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Etiquetas</th>
                  <th className="hidden sm:table-cell px-4 py-2.5 text-right text-xs font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {group.loans.map((loan) => (
                  <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={[...new Set(group.loans.flatMap(l => l.tags || []))]}
                    onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                    onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function LoanList({ loans, payments, installmentSchedules, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, initialCategory, initialView }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [view, setView] = useState<"cards" | "rows" | "folders">(initialView ?? "cards");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>(initialCategory ?? "all");
  const [showFilters, setShowFilters] = useState(false);
  const [dueDateQuick, setDueDateQuick] = useState<"yesterday" | "today" | "tomorrow" | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState<"dueDate" | "startDate" | "amount" | "name">("dueDate");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    loans.forEach((l) => l.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [loans]);

  const categorized = useMemo(() => {
    let filtered = loans.filter((l) => l.borrowerName.toLowerCase().includes(search.toLowerCase()));

    // Category filter
    if (category === "all") {
      filtered = filtered.filter((l) => getLoanCategory(l, payments, installmentSchedules) !== "paid");
    } else if (category === "parcelado") {
      filtered = filtered.filter((l) => l.installments >= 2 && l.status !== "paid");
    } else {
      filtered = filtered.filter((l) => getLoanCategory(l, payments, installmentSchedules) === category);
    }

    // Date range filter (startDate = data de saída)
    if (dateFrom) {
      filtered = filtered.filter((l) => l.startDate >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((l) => l.startDate <= dateTo);
    }

    // Amount range filter
    const minAmt = parseFloat(amountMin);
    const maxAmt = parseFloat(amountMax);
    if (!isNaN(minAmt) && minAmt > 0) {
      filtered = filtered.filter((l) => l.amount >= minAmt);
    }
    if (!isNaN(maxAmt) && maxAmt > 0) {
      filtered = filtered.filter((l) => l.amount <= maxAmt);
    }

    // Tag filter
    if (tagFilter) {
      filtered = filtered.filter((l) => l.tags?.includes(tagFilter));
    }

    // Quick due date filter (only applies to rows view)
    if (dueDateQuick && view === "rows") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(today);
      if (dueDateQuick === "yesterday") target.setDate(target.getDate() - 1);
      else if (dueDateQuick === "tomorrow") target.setDate(target.getDate() + 1);
      const targetStr = target.toISOString().split("T")[0];
      filtered = filtered.filter((l) => l.dueDate === targetStr);
    }

    // Sort
    return [...filtered].sort((a, b) => {
      if (sortBy === "dueDate") {
        const aDate = getFirstPendingDate(a, installmentSchedules).getTime();
        const bDate = getFirstPendingDate(b, installmentSchedules).getTime();
        return aDate - bDate;
      }
      if (sortBy === "startDate") return b.startDate.localeCompare(a.startDate);
      if (sortBy === "amount") return b.amount - a.amount;
      return a.borrowerName.localeCompare(b.borrowerName);
    });
  }, [loans, payments, installmentSchedules, search, category, dateFrom, dateTo, amountMin, amountMax, tagFilter, sortBy, dueDateQuick, view]);

  const folderCount = useMemo(() => {
    const byName: Record<string, number> = {};
    loans.forEach((l) => { byName[l.borrowerName] = (byName[l.borrowerName] || 0) + 1; });
    return Object.values(byName).filter((c) => c > 1).length;
  }, [loans]);

  const counts = useMemo(() => {
    const cats = loans.map((l) => getLoanCategory(l, payments, installmentSchedules));
    return {
      all: cats.filter((c) => c !== "paid").length,
      parcelado: loans.filter((l) => l.installments >= 2 && l.status !== "paid").length,
      overdue: cats.filter((c) => c === "overdue").length,
      paid_interest: cats.filter((c) => c === "paid_interest").length,
      paid: cats.filter((c) => c === "paid").length,
      due_today: cats.filter((c) => c === "due_today").length,
      on_track: cats.filter((c) => c === "on_track").length,
    };
  }, [loans, payments, folderCount]);

  // Group by borrower name
  const { grouped, singles } = useMemo(() => {
    const byName: Record<string, Loan[]> = {};
    categorized.forEach((l) => {
      (byName[l.borrowerName] ??= []).push(l);
    });
    const grouped: ClientGroup[] = [];
    const singles: Loan[] = [];
     Object.entries(byName).forEach(([name, loans]) => {
       if (loans.length > 1) {
         const totalPaid = loans.reduce((s, l) => s + getTotalPaid(l, payments), 0);
         const totalReceivable = loans.reduce((s, l) => {
           const t = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
           const paid = getTotalPaid(l, payments);
           return s + Math.max(0, (l.remainingAmount != null && l.remainingAmount > 0 ? l.remainingAmount : t - paid));
         }, 0);
         const hasOverdue = loans.some((l) => l.status !== "paid" && getLoanCategory(l, payments, installmentSchedules) === "overdue");
         grouped.push({ name, loans, totalAmount: loans.reduce((s, l) => s + l.amount, 0), totalPaid, totalReceivable, hasOverdue });
      } else {
        singles.push(loans[0]);
      }
    });
     grouped.sort((a, b) => {
       // Get earliest due date among active loans for each group
       const getEarliestDue = (g: ClientGroup) => {
         const activeLoans = g.loans.filter((l) => l.status !== "paid");
         if (activeLoans.length === 0) return "9999-12-31";
         return activeLoans.reduce((earliest, l) => {
           const date = l.dueDate;
           return date < earliest ? date : earliest;
         }, "9999-12-31");
       };
       return getEarliestDue(a).localeCompare(getEarliestDue(b));
     });
    return { grouped, singles };
  }, [categorized, payments]);

  const summaryData = useMemo(() => {
    const source = categorized;
    const activeSource = source.filter((l) => l.status !== "paid");
    const totalLentRaw = activeSource.reduce((s, l) => s + l.amount, 0);
    
    // When a due date filter is active, sum installment values instead of total remaining
    const useDueDateValues = dueDateQuick && view === "rows";
    const totalToReceive = activeSource.reduce((s, l) => {
      if (useDueDateValues) {
        // Sum the installment value (parcela) for loans due on the selected date
        const isParcelado = (l.paymentType === "Parcelado" || l.installments >= 2) && l.paidInstallments < l.installments;
        if (isParcelado) {
          const unpaid = installmentSchedules
            .filter((sc) => sc.loanId === l.id && sc.installmentNumber > l.paidInstallments)
            .sort((a, b) => a.installmentNumber - b.installmentNumber);
          const next = unpaid[0];
          const remainingInst = Math.max(1, l.installments - l.paidInstallments);
          const remaining = l.remainingAmount != null && l.remainingAmount > 0
            ? l.remainingAmount
            : Math.max(0, calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - payments.filter(p => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0));
          const instValue = next ? next.amount
            : l.customInstallmentValue != null && l.customInstallmentValue > 0
              ? l.customInstallmentValue
              : remaining / remainingInst;
          return s + instValue;
        }
        // For non-parcelado, use remaining
        if (l.remainingAmount != null && l.remainingAmount > 0) return s + l.remainingAmount;
        const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
        const paid = payments.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0);
        return s + Math.max(0, expected - paid);
      }
      if (l.remainingAmount != null && l.remainingAmount > 0) return s + l.remainingAmount;
      const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const paid = loanPayments.reduce((ss, p) => ss + p.amount, 0);
      return s + Math.max(0, expected - paid);
    }, 0);
    const totalLent = totalLentRaw;
    
    const totalInterest = source.reduce(
      (s, l) => s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount), 0
    );
    const activeCount = source.filter((l) => l.status === "active").length;
    const overdueCount = source.filter((l) => getDaysOverdue(l) > 0 && l.status !== "paid").length;
    return { totalLent, totalToReceive, totalInterest, activeCount, overdueCount };
  }, [categorized, payments, dueDateQuick, view, installmentSchedules]);

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
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 w-full">
        {categoryConfig.map((cat) => (
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            className={`px-2 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-colors border whitespace-nowrap ${
              category === cat.id ? cat.activeColor : `bg-card ${cat.color} hover:opacity-80`
            }`}
          >
            {cat.label} ({counts[cat.id]})
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome do cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
          {(dateFrom || dateTo || amountMin || amountMax || tagFilter) && (
            <Badge className="bg-destructive text-destructive-foreground h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">!</Badge>
          )}
        </Button>
        <div className="flex flex-col gap-1 w-full sm:w-auto">
          <div className="flex w-full sm:w-auto bg-muted/60 rounded-xl p-0.5 backdrop-blur-sm border border-border/30">
            <button onClick={() => setView("cards")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />Cards
            </button>
            <button onClick={() => setView("rows")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                view === "rows" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List className="h-3.5 w-3.5" />Linhas
            </button>
            <button onClick={() => setView("folders")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                view === "folders" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Folder className="h-3.5 w-3.5" />Pastas
            </button>
          </div>
          {/* Quick due date filter */}
          {view === "rows" && (
            <div className="flex w-full bg-muted/60 rounded-xl p-0.5 backdrop-blur-sm border border-border/30">
              {([
                { id: "yesterday" as const, label: "Ontem" },
                { id: "today" as const, label: "Hoje" },
                { id: "tomorrow" as const, label: "Amanhã" },
              ]).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setDueDateQuick(dueDateQuick === f.id ? null : f.id)}
                  className={`flex-1 flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                    dueDateQuick === f.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Data Saída (De)</Label>
                <DatePickerField value={dateFrom} onChange={(v) => setDateFrom(v)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data Saída (Até)</Label>
                <DatePickerField value={dateTo} onChange={(v) => setDateTo(v)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Valor Mínimo (R$)</Label>
                <Input type="number" step="0.01" placeholder="0" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Valor Máximo (R$)</Label>
                <Input type="number" step="0.01" placeholder="∞" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Etiqueta</Label>
                <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="">Todas</option>
                  {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ordenar por</Label>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <option value="dueDate">Vencimento</option>
                  <option value="startDate">Data de Saída</option>
                  <option value="amount">Valor</option>
                  <option value="name">Nome</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDateFrom(""); setDateTo(""); setAmountMin(""); setAmountMax(""); setTagFilter(""); setSortBy("dueDate"); }}>
                <X className="h-3 w-3 mr-1" />Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {categorized.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum empréstimo encontrado nesta categoria</p>
          </CardContent>
        </Card>
      ) : (
        <div>
          {view === "cards" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categorized.map((loan, i) => (
                <div key={loan.id} className="animate-fade-in h-full" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}>
                <LoanCardView loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={loans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i)}
                  onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                  onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
                </div>
              ))}
            </div>
          ) : view === "folders" ? (
            <>
            <div className="space-y-4">
              {grouped.map((g) => (
                <ClientFolder key={g.name} group={g} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly}
                  onPayment={onPayment} onPartialPayment={onPartialPayment}
                  onInterestPayment={onInterestPayment} onUpdate={onUpdate} onDelete={onDelete} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
              ))}
              {grouped.length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">Nenhum cliente com múltiplos empréstimos</p>
                  </CardContent>
                </Card>
              )}
            </div>
            </>
          ) : (
            <div className="rounded-2xl border border-border/30 overflow-hidden shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)]">
              <div className="px-4 py-2 flex items-center justify-between border-b border-border/30 bg-muted/30">
                <span className="text-sm text-muted-foreground">{categorized.length} empréstimos</span>
                <span className="text-sm font-semibold text-destructive">{mask(rawFormatCurrency(summaryData.totalToReceive))}</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Cliente</th>
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Status</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Emprestado</th>
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">{category === "paid" ? "Pago" : "Restante"}</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Parcelas</th>
                    <th className="px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Venc.</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Etiquetas</th>
                    <th className="hidden sm:table-cell px-4 py-2.5 text-right text-xs font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {categorized.map((loan) => (
                    <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={loans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i)}
                      onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                      onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
