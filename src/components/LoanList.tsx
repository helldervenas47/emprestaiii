import React, { useState, useMemo, useCallback } from "react";
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
  onInterestPayment: (loanId: string, paymentDate?: string) => void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
}

type Category = "all" | "overdue" | "paid_interest" | "paid" | "due_today" | "on_track" | "parcelado";

const categoryConfig: { id: Category; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "parcelado", label: "Parcelados", color: "border-blue-400/30 text-blue-400", activeColor: "bg-blue-500 text-white border-blue-500" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid_interest", label: "Pagou Juros", color: "border-purple/30 text-purple", activeColor: "bg-purple text-purple-foreground border-purple" },
  { id: "paid", label: "Pagou Total", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
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

function getLoanCategory(loan: Loan, payments: Payment[]): "paid" | "paid_interest" | "overdue" | "due_today" | "on_track" {
  if (loan.status === "paid") return "paid";
  const loanPayments = payments.filter((p) => p.loanId === loan.id);
  const lastPayment = loanPayments.sort((a, b) => b.date.localeCompare(a.date))[0];
  if (lastPayment && lastPayment.installmentNumber === 0) return "paid_interest";
  const days = getDaysOverdue(loan);
  if (days === 0) return "due_today";
  if (days > 0) return "overdue";
  return "on_track";
}

const statusMap = {
  paid: { label: "Pagou Total", className: "bg-success/10 text-success border-success/20" },
  paid_interest: { label: "Pagou Juros", className: "bg-purple/10 text-purple border-purple/20" },
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
  const interestValue = amt * (rate / 100);
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
  loan, payments: allPayments, installmentSchedules, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false,
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (date?: string) => void;
  onPartialPayment: (amount: number, date?: string) => void;
  onInterestPayment: (date?: string) => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
}) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
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

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);
  const remainingInstallments = Math.max(1, loan.installments - loan.paidInstallments);
  const calculatedInstallment = remaining / remainingInstallments;
  const installment = loan.customInstallmentValue != null && loan.customInstallmentValue > 0 ? loan.customInstallmentValue : calculatedInstallment;
  const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
  const interestOnly = loan.amount * (loan.interestRate / 100);
  const totalInterest = total - loan.amount;
  const profit = totalPaid - loan.amount;
  const category = getLoanCategory(loan, allPayments);
  const daysOverdue = getDaysOverdue(loan);
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
    // Use saved schedules if available
    const savedSchedules = installmentSchedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > paidInst)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    if (savedSchedules.length > 0) {
      setEditScheduleRows(savedSchedules.map((s) => ({
        date: new Date(s.dueDate + "T00:00:00"),
        value: s.amount.toFixed(2),
      })));
    } else {
      const firstDue = new Date(loan.dueDate + "T00:00:00");
      setEditScheduleRows(
        Array.from({ length: remInst }, (_, i) => ({
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
    });

    // Save installment schedule
    const paidCount = parseInt(form.paidInstallments) || 0;
    if (editScheduleRows.length > 0) {
      await onSaveSchedule(loan.id, editScheduleRows.map((row, idx) => ({
        installmentNumber: paidCount + idx + 1,
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
      openPaymentDialog("partial", val);
      setPartialAmount("");
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
        // Rebuild schedule rows
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setEditScheduleRows(
          Array.from({ length: remInst }, (_, i) => ({
            date: i === 0 ? firstDue : getNextDate(firstDue, next.interestType, i),
            value: next.installmentValue,
          }))
        );
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
        const remInst = Math.max(1, months - paidInst);
        const firstDue = next.dueDate ? new Date(next.dueDate + "T00:00:00") : new Date();
        setEditScheduleRows((prev) =>
          Array.from({ length: remInst }, (_, i) => ({
            date: i === 0 ? firstDue : getNextDate(firstDue, next.interestType, i),
            value: prev[i]?.value || next.installmentValue,
          }))
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
            <div><Label className="text-xs">Data Início</Label><Input type="date" value={form.startDate} onChange={(e) => updateField("startDate", e.target.value)} className="h-8 text-sm" /></div>
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
                Parcelas Pendentes ({editScheduleRows.length}x)
                <Badge variant="outline" className="ml-auto text-xs">
                  {form.interestType}
                </Badge>
              </button>
              {showEditSchedule && (
                <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                  {editScheduleRows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-muted/40 text-muted-foreground">
                        {(parseInt(form.paidInstallments) || 0) + idx + 1}ª
                      </span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start">
                            <CalendarIcon className="h-3.5 w-3.5 mr-1.5 text-primary" />
                            {format(row.date, "dd/MM/yyyy")}
                          </Button>
                        </PopoverTrigger>
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
                                    rows[i] = { ...rows[i], date: getNextDate(d, form.interestType, i - idx) };
                                  }
                                  return rows;
                                });
                              }
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.value}
                        onChange={(e) => {
                          setEditScheduleRows((prev) => {
                            const rows = [...prev];
                            const newVal = e.target.value;
                            rows[idx] = { ...rows[idx], value: newVal };
                            if (idx === 0 && rows.length > 1) {
                              const firstVal = parseFloat(newVal) || 0;
                              const totalRem = parseFloat(form.remainingAmount) || 0;
                              const otherCount = rows.length - 1;
                              const otherVal = (Math.max(0, totalRem - firstVal) / otherCount).toFixed(2);
                              for (let i = 1; i < rows.length; i++) {
                                rows[i] = { ...rows[i], value: otherVal };
                              }
                            }
                            return rows;
                          });
                        }}
                        className="h-8 w-24 text-xs text-right"
                      />
                    </div>
                  ))}
                  <div className="px-3 py-2 bg-muted/20">
                    <p className="text-xs text-muted-foreground">
                      Total: <span className="font-bold text-foreground">{rawFormatCurrency(editScheduleRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label className="text-xs">Etiquetas (separar por vírgula)</Label><Input value={form.tags} onChange={(e) => updateField("tags", e.target.value)} className="h-8 text-sm" placeholder="Ex: VIP, Renovação, Garantia" /></div>
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

  const realizedProfit = Math.max(0, totalPaid - loan.amount);
  const realizedProfitPct = loan.amount > 0 ? Math.round((realizedProfit / loan.amount) * 100) : 0;

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
    <Card className={`overflow-hidden hover:shadow-lg transition-all h-full flex flex-col border ${cardBorder} ${cardBg}`}>
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
            editingInstallment ? (
              <div className="flex items-center justify-center gap-2">
                <Input
                  type="number" step="0.01" value={installmentInput}
                  onChange={(e) => setInstallmentInput(e.target.value)}
                  className="h-10 w-40 text-center text-lg font-bold" autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = parseFloat(installmentInput);
                      if (val > 0) onUpdate({ customInstallmentValue: val });
                      setEditingInstallment(false);
                    }
                    if (e.key === "Escape") setEditingInstallment(false);
                  }}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                  const val = parseFloat(installmentInput);
                  if (val > 0) onUpdate({ customInstallmentValue: val });
                  setEditingInstallment(false);
                }}><Check className="h-4 w-4 text-success" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingInstallment(false)}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
                {loan.customInstallmentValue != null && (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => {
                    onUpdate({ customInstallmentValue: null });
                    setEditingInstallment(false);
                  }}>Resetar</Button>
                )}
              </div>
            ) : (
              <button
                onClick={() => { setInstallmentInput(installment.toFixed(2)); setEditingInstallment(true); }}
                className="group cursor-pointer"
                title="Clique para alterar o valor da parcela"
              >
                <p className={`text-3xl font-bold ${remaining > 0 ? "text-primary" : "text-success"} group-hover:underline decoration-dotted underline-offset-4`}>
                  {formatCurrency(installment)}
                  <Pencil className="inline h-3.5 w-3.5 ml-1.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                </p>
              </button>
            )
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
        </div>

        {/* Emprestado / Total a Receber */}
        <div className="grid grid-cols-2 gap-3 border border-border/50 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Emprestado</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(loan.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total a Receber</p>
            <p className="text-base font-bold text-foreground">{formatCurrency(total)}</p>
          </div>
        </div>

        {/* Lucro Previsto / Lucro Realizado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">💰 Lucro Previsto</p>
            <p className="text-sm font-bold text-success">{formatCurrency(totalInterest)}</p>
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
        {showPartial && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border/50">
            <Input
              type="number" step="0.01" placeholder="Valor (R$)"
              value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
              className="h-8 text-sm flex-1" autoFocus
              onKeyDown={(e) => e.key === "Enter" && handlePartialSubmit()}
            />
            <Button size="sm" className="h-8" onClick={handlePartialSubmit}><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowPartial(false)}><X className="h-4 w-4" /></Button>
          </div>
        )}

        {/* Action Buttons */}
        {!readOnly && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50 mt-auto">
          {loan.status !== "paid" && (
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
                {loan.paymentType !== "Parcelado" && (
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
          <div className="flex items-center justify-center gap-1">
            {loan.status === "paid" && (
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
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={startEdit} title="Editar">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        )}
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
                          "bg-primary/10 text-primary border-primary/20"
                        }`}>
                          {p.installmentNumber > 0 ? `Parcela ${p.installmentNumber}` : p.installmentNumber === 0 ? "Juros" : "Pagamento"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(p.amount)}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDeletePayment(p.id)} title="Excluir pagamento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
    </>
  );
}

function LoanRowView({
  loan, payments: allPayments, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, readOnly = false,
}: {
  loan: Loan;
  payments: Payment[];
  onPayment: (date?: string) => void;
  onPartialPayment: (amount: number, date?: string) => void;
  onInterestPayment: (date?: string) => void;
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full"; amount?: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const remaining = loan.remainingAmount != null && loan.remainingAmount > 0 ? loan.remainingAmount : Math.max(0, total - totalPaid);
  const category = getLoanCategory(loan, allPayments);
  const daysOverdue = getDaysOverdue(loan);
  const badge = statusMap[category];

  const startEdit = () => { setForm(loanToForm(loan)); setEditing(true); };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
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
      openPaymentDialog("partial", val);
      setPartialAmount("");
      setShowPartial(false);
    }
  };

  const update = (field: keyof EditForm, value: string) => setForm((p) => ({ ...p, [field]: value }));

  if (editing) {
    return (
      <>
      <tr className="border-b border-border/30 bg-primary/5">
        <td colSpan={7} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={form.borrowerName} onChange={(e) => update("borrowerName", e.target.value)} className="h-7 w-28 text-xs" placeholder="Nome" />
            <Input type="number" value={form.amount} onChange={(e) => update("amount", e.target.value)} className="h-7 w-24 text-xs" placeholder="Valor" />
            <Input type="number" value={form.interestRate} onChange={(e) => update("interestRate", e.target.value)} className="h-7 w-16 text-xs" placeholder="Juros%" />
            <Input type="number" value={form.installments} onChange={(e) => update("installments", e.target.value)} className="h-7 w-14 text-xs" placeholder="Parc." />
            <Input type="number" value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} className="h-7 w-14 text-xs" placeholder="Pagas" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-7 w-32 justify-start text-left text-xs font-normal">
                  <CalendarIcon className="mr-1 h-3 w-3" />
                  {form.dueDate ? format(new Date(form.dueDate + "T00:00:00"), "dd/MM/yy") : "1ª Parcela"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarUI
                  mode="single"
                  selected={form.dueDate ? new Date(form.dueDate + "T00:00:00") : undefined}
                  onSelect={(d) => d && update("dueDate", d.toISOString().split("T")[0])}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Select value={form.interestType} onValueChange={(v) => update("interestType", v)}>
              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Semanal">Semanal</SelectItem>
                <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                <SelectItem value="Mensal">Mensal</SelectItem>
              </SelectContent>
            </Select>
            <Input value={form.tags} onChange={(e) => update("tags", e.target.value)} className="h-7 w-28 text-xs" placeholder="Etiquetas" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}><Check className="h-3.5 w-3.5 text-success" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}><X className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </td>
      </tr>
      </>
    );
  }

  return (
    <>
    <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors group">
      {/* Cliente */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 ${
            category === "overdue" ? "bg-destructive" :
            category === "due_today" ? "bg-warning" :
            category === "paid" ? "bg-success" :
            "gradient-primary"
          }`}>
            {loan.borrowerName.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
          </div>
          <span className="font-medium text-sm text-foreground">{loan.borrowerName}</span>
        </div>
      </td>
      {/* Status */}
      <td className="px-4 py-3">
        <Badge variant="outline" className={`${badge.className} text-xs`}>{badge.label}</Badge>
      </td>
      {/* Emprestado */}
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-foreground">{formatCurrency(loan.amount)}</span>
      </td>
      {/* Restante */}
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-destructive">{formatCurrency(remaining)}</span>
      </td>
      {/* Parcelas */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{loan.paidInstallments}/{loan.installments}</span>
        </div>
        {daysOverdue > 0 && loan.status !== "paid" && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="h-2 w-2 rounded-full bg-destructive inline-block"></span>
            <span className="text-[10px] text-destructive">{daysOverdue > 30 ? `${Math.floor(daysOverdue / 30)} em atraso` : `${daysOverdue}d atraso`}</span>
          </div>
        )}
      </td>
      {/* Vencimento */}
      <td className="px-4 py-3">
        <span className={`text-sm ${category === "overdue" ? "text-warning" : "text-foreground"}`}>
          {new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}
        </span>
      </td>
      {/* Etiquetas */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {loan.tags && loan.tags.length > 0 ? loan.tags.map((tag) => (
            <Badge key={tag} className="bg-primary text-primary-foreground text-[10px]">{tag}</Badge>
          )) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </td>
      {/* Ações */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 justify-end">
          {!readOnly && loan.status !== "paid" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> Pagar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openPaymentDialog("full")}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Pagamento Total
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowPartial(!showPartial)}>
                  <HandCoins className="h-4 w-4 mr-2" /> Pagamento Parcial
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openPaymentDialog("interest")}>
                  <Percent className="h-4 w-4 mr-2" /> Pagar Juros
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!readOnly && loan.status !== "paid" && (
                <>
                  <DropdownMenuItem onClick={() => openPaymentDialog("installment")}>
                    <CheckCircle className="h-4 w-4 mr-2" /> Receber Parcela
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openPaymentDialog("interest")}>
                    <Percent className="h-4 w-4 mr-2" /> Pagar Juros
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setShowPartial(!showPartial)}>
                    <HandCoins className="h-4 w-4 mr-2" /> Pagamento Parcial
                  </DropdownMenuItem>
                </>
              )}
              {!readOnly && (
                <DropdownMenuItem onClick={() => loan.status === "paid" ? onUpdate({ status: "active", paidInstallments: 0 }) : openPaymentDialog("full")}>
                  <CheckCircle className="h-4 w-4 mr-2" /> {loan.status === "paid" ? "Marcar como não pago" : "Marcar como pago"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setShowHistory(true)}>
                <History className="h-4 w-4 mr-2" /> Histórico
              </DropdownMenuItem>
              {!readOnly && (
                <>
                  <DropdownMenuItem onClick={startEdit}>
                    <Pencil className="h-4 w-4 mr-2" /> Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
    {showPartial && (
      <tr className="border-b border-border/30 bg-muted/30">
        <td colSpan={8} className="px-4 py-2">
          <div className="flex items-center gap-2">
            <Input
              type="number" step="0.01" placeholder="Valor parcial (R$)"
              value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
              className="h-7 text-xs w-40" autoFocus
              onKeyDown={(e) => e.key === "Enter" && handlePartialSubmit()}
            />
            <Button size="sm" className="h-7 text-xs" onClick={handlePartialSubmit}><Check className="h-3.5 w-3.5 mr-1" />Confirmar</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowPartial(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
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
                          "bg-primary/10 text-primary border-primary/20"
                        }`}>
                          {p.installmentNumber > 0 ? `Parcela ${p.installmentNumber}` : p.installmentNumber === 0 ? "Juros" : "Pagamento"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(p.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                      </div>
                      <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(p.amount)}</p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDeletePayment(p.id)} title="Excluir pagamento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
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
    </>
  );
}

// Client folder grouping
interface ClientGroup {
  name: string;
  loans: Loan[];
  totalAmount: number;
  totalPaid: number;
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
    <Card className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className="h-10 w-10 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md">
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
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
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {group.loans.map((loan) => (
              <LoanCardView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly}
                onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function LoanList({ loans, payments, installmentSchedules, onPayment, onPartialPayment, onInterestPayment, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false }: Props) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [view, setView] = useState<"cards" | "rows" | "folders">("cards");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [showFilters, setShowFilters] = useState(false);
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
      filtered = filtered.filter((l) => getLoanCategory(l, payments) !== "paid");
    } else if (category === "parcelado") {
      filtered = filtered.filter((l) => l.paymentType === "Parcelado" || l.installments >= 2);
    } else {
      filtered = filtered.filter((l) => getLoanCategory(l, payments) === category);
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

    // Sort
    return [...filtered].sort((a, b) => {
      if (sortBy === "dueDate") return a.dueDate.localeCompare(b.dueDate);
      if (sortBy === "startDate") return b.startDate.localeCompare(a.startDate);
      if (sortBy === "amount") return b.amount - a.amount;
      return a.borrowerName.localeCompare(b.borrowerName);
    });
  }, [loans, payments, search, category, dateFrom, dateTo, amountMin, amountMax, tagFilter, sortBy]);

  const folderCount = useMemo(() => {
    const byName: Record<string, number> = {};
    loans.forEach((l) => { byName[l.borrowerName] = (byName[l.borrowerName] || 0) + 1; });
    return Object.values(byName).filter((c) => c > 1).length;
  }, [loans]);

  const counts = useMemo(() => {
    const cats = loans.map((l) => getLoanCategory(l, payments));
    return {
      all: cats.filter((c) => c !== "paid").length,
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
        grouped.push({ name, loans, totalAmount: loans.reduce((s, l) => s + l.amount, 0), totalPaid });
      } else {
        singles.push(loans[0]);
      }
    });
    grouped.sort((a, b) => a.name.localeCompare(b.name));
    return { grouped, singles };
  }, [categorized, payments]);

  const summaryData = useMemo(() => {
    const source = categorized;
    const activeSource = source.filter((l) => l.status !== "paid");
    const totalLentRaw = activeSource.reduce((s, l) => s + l.amount, 0);
    
    // Total a receber = usa remainingAmount quando disponível
    const totalToReceive = activeSource.reduce((s, l) => {
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
  }, [categorized, payments]);

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
      {/* Summary cards that react to filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="gradient-primary rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Capital na Rua</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summaryData.totalLent)}</p>
        </div>
        <div className="gradient-success rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Total a Receber</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summaryData.totalToReceive)}</p>
        </div>
        <div className="gradient-warning rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Lucro em Juros</span>
            <DollarSign className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{formatCurrency(summaryData.totalInterest)}</p>
        </div>
        <div className="gradient-primary rounded-xl p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium opacity-90">Empréstimos Ativos</span>
            <User className="h-5 w-5 opacity-80" />
          </div>
          <p className="text-2xl font-bold">{summaryData.activeCount}</p>
          {summaryData.overdueCount > 0 && (
            <p className="text-xs mt-1 opacity-80">{summaryData.overdueCount} em atraso</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {categoryConfig.map((cat) => (
          <button key={cat.id} onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
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
        <div className="flex bg-muted rounded-lg p-0.5">
          <button onClick={() => setView("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Cards
          </button>
          <button onClick={() => setView("rows")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "rows" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />Linhas
          </button>
          <button onClick={() => setView("folders")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "folders" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Folder className="h-3.5 w-3.5" />Pastas
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Data Saída (De)</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Data Saída (Até)</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-sm" />
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {categorized.map((loan) => (
                <LoanCardView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly}
                  onPayment={(date) => onPayment(loan.id, date)} onPartialPayment={(amt, date) => onPartialPayment(loan.id, amt, date)}
                  onInterestPayment={(date) => onInterestPayment(loan.id, date)} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
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
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <div className="px-4 py-2 flex items-center justify-between border-b border-border/30 bg-muted/30">
                <span className="text-sm text-muted-foreground">{categorized.length} empréstimos</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Cliente</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Emprestado</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Restante</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Parcelas</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Vencimento</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Etiquetas</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {categorized.map((loan) => (
                    <LoanRowView key={loan.id} loan={loan} payments={payments} readOnly={readOnly}
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
