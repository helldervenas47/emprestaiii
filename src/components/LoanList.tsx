import React, { useState, useMemo, useCallback, useRef } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useHideValues } from "@/contexts/HideValuesContext";
import { format } from "date-fns";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { todayInAppTz, formatYmdInAppTz } from "@/lib/timezone";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateInstallment, calculateTotalWithInterest } from "@/hooks/useLoans";
import { getInstallmentAmount, getOverdueAmount } from "@/lib/loanInstallmentAmount";
import { getLoanLateFees, getBaseRemainingAmount } from "@/lib/loanLateFees";
import { cn } from "@/lib/utils";
import {
  CheckCircle, CheckCircle2, Trash2, DollarSign, User, Calendar as CalendarIcon, LayoutGrid, List,
  Search, Percent, Pencil, Check, X, ChevronDown, ChevronRight, ChevronUp, FolderOpen, Folder, HandCoins, Tag, MoreHorizontal, MessageCircle, Filter, SlidersHorizontal, History, UserCog, Calculator, BellRing, BellOff, RefreshCw, FileDown, AlertTriangle, StickyNote, ShoppingBag, Clock,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { AdjustDueDateDialog } from "@/components/AdjustDueDateDialog";
import { AmortizationSimulator } from "@/components/AmortizationSimulator";
import { RenegotiateLoanDialog } from "@/components/RenegotiateLoanDialog";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { generateLoanReportPdf } from "@/lib/loanReportPdf";
import type { LoanRenegotiation } from "@/types/loan";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { buildBillingWhatsappLink } from "@/lib/whatsappBilling";
import { WhatsappPreviewDialog } from "@/components/WhatsappPreviewDialog";

function WhatsappBillButton({
  loan,
  clients,
  payments,
  installmentSchedules,
  variant = "icon",
}: {
  loan: Loan;
  clients: Client[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  variant?: "icon" | "compact";
}) {
  const { messages } = useWhatsappBillingMessages();
  const client = clients.find(
    (c) => c.name.trim().toLowerCase() === loan.borrowerName.trim().toLowerCase(),
  );
  const phone = client?.phone || "";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    phone: string;
    message: string;
    status: ReturnType<typeof buildBillingWhatsappLink>["status"];
    name: string;
  } | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!phone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    const built = buildBillingWhatsappLink({
      client,
      loan,
      schedules: installmentSchedules,
      payments,
      messages,
    });
    setPreviewData({
      phone: built.phone,
      message: built.message,
      status: built.status,
      name: client?.name ?? loan.borrowerName,
    });
    setPreviewOpen(true);
  };

  const buttonNode = variant === "compact" ? (
    <Button
      variant="ghost"
      className="flex-1 h-9 text-xs gap-1.5 text-success hover:text-success"
      onClick={handleClick}
      title={phone ? "Cobrar via WhatsApp" : "Cliente sem telefone"}
      disabled={!phone}
    >
      <MessageCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">WhatsApp</span>
    </Button>
  ) : (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8 text-success hover:text-success"
      onClick={handleClick}
      title={phone ? "Cobrar via WhatsApp" : "Cliente sem telefone"}
      disabled={!phone}
    >
      <MessageCircle className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      {buttonNode}
      {previewData && (
        <WhatsappPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          phone={previewData.phone}
          message={previewData.message}
          status={previewData.status}
          recipientName={previewData.name}
        />
      )}
    </>
  );
}

interface Props {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (loanId: string, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (loanId: string, paymentDate?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (loanId: string, paymentDate?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (loanId: string, params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (loanId: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  existingTags?: string[];
  initialCategory?: Category;
  initialView?: "cards" | "rows" | "folders";
  clients?: Client[];
  onOpenClientHistory?: () => void;
  onOpenSimulator?: () => void;
}

type Category = "all" | "overdue" | "paid_interest" | "paid" | "due_today" | "on_track" | "parcelado" | "venda";

const categoryConfig: { id: Category; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid_interest", label: "Juros", color: "border-purple/30 text-purple", activeColor: "bg-purple text-purple-foreground border-purple" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "parcelado", label: "Parcelados", color: "border-blue-400/30 text-blue-400", activeColor: "bg-blue-500 text-white border-blue-500" },
  { id: "venda", label: "Vendas", color: "border-amber-500/30 text-amber-600 dark:text-amber-400", activeColor: "bg-amber-500 text-white border-amber-500" },
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

function getInstallmentDueDate(loan: Loan, installmentNumber: number, schedules: InstallmentSchedule[]) {
  const savedSchedule = schedules.find((s) => s.loanId === loan.id && s.installmentNumber === installmentNumber);
  if (savedSchedule?.dueDate) return savedSchedule.dueDate;
  const firstDue = new Date(loan.dueDate + "T00:00:00");
  return getNextDate(firstDue, loan.interestType || "Mensal", Math.max(0, installmentNumber - 1)).toISOString().split("T")[0];
}

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

function PaymentHistoryItem({
  payment, formatCurrency, onDelete, readOnly,
}: {
  payment: Payment;
  formatCurrency: (v: number) => string;
  onDelete?: (id: string) => void;
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isAmortization = payment.installmentNumber === -3;
  const meta = payment.metadata || {};

  const badgeLabel = payment.installmentNumber > 0
    ? `Parcela ${payment.installmentNumber}`
    : payment.installmentNumber === 0 ? "Juros"
    : payment.installmentNumber === -3 ? "Amortização"
    : "Parcial";
  const badgeClass = payment.installmentNumber > 0
    ? "bg-success/10 text-success border-success/20"
    : payment.installmentNumber === 0 ? "bg-purple/10 text-purple border-purple/20"
    : payment.installmentNumber === -3 ? "bg-primary/10 text-primary border-primary/20"
    : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30">
      <div className="flex items-center justify-between p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${badgeClass}`}>{badgeLabel}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(payment.date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
          </div>
          <p className="text-sm font-bold text-foreground mt-1">{formatCurrency(payment.amount)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isAmortization && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Ocultar detalhes" : "Ver detalhes"}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
          {!readOnly && onDelete && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDelete(payment.id)} title="Excluir pagamento">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {isAmortization && expanded && (
        <div className="border-t border-border/50 px-3 py-2.5 space-y-1 text-[11px] bg-background/40">
          {meta.old_principal != null && meta.new_principal != null && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Saldo devedor antes</span><span className="tabular-nums">{formatCurrency(Number(meta.old_principal))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Novo saldo devedor</span><span className="font-semibold text-primary tabular-nums">{formatCurrency(Number(meta.new_principal))}</span></div>
            </>
          )}
          {meta.old_interest_total != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Juros antes</span><span className="tabular-nums">{formatCurrency(Number(meta.old_interest_total))}</span></div>
          )}
          {meta.new_interest_total != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Juros depois</span><span className="tabular-nums">{formatCurrency(Number(meta.new_interest_total))}</span></div>
          )}
          {meta.interest_saved != null && Number(meta.interest_saved) > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Juros economizados</span><span className="font-semibold text-success tabular-nums">{formatCurrency(Number(meta.interest_saved))}</span></div>
          )}
          {meta.new_remaining != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Restante a receber</span><span className="tabular-nums">{formatCurrency(Number(meta.new_remaining))}</span></div>
          )}
          {meta.interest_rate != null && (
            <div className="flex justify-between"><span className="text-muted-foreground">Taxa de juros</span><span className="tabular-nums">{Number(meta.interest_rate)}%</span></div>
          )}
          {meta.old_principal == null && (
            <p className="text-muted-foreground italic">Detalhes desta amortização não foram registrados.</p>
          )}
        </div>
      )}
    </div>
  );
}



function LoanCardView({
  loan, payments: allPayments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, no3d = false, existingTags = [], clients = [],
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (date?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (date?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  renegotiations?: LoanRenegotiation[];
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  no3d?: boolean;
  existingTags?: string[];
  clients?: Client[];
}) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  // Keep form in sync with loan prop when not editing (prevents stale notes/etc on refetch)
  React.useEffect(() => {
    if (!editing) setForm(loanToForm(loan));
  }, [loan, editing]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date>(new Date());
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize"; amount?: number } | null>(null);
  const [interestSelection, setInterestSelection] = useState<"normal" | "withFees">("normal");
  const [interestPartialEnabled, setInterestPartialEnabled] = useState(false);
  const [interestPartialAmount, setInterestPartialAmount] = useState("");
  const [interestNotes, setInterestNotes] = useState("");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [amortizeAmount, setAmortizeAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [showHistory, setShowHistory] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
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
  const [showRenegotiateDialog, setShowRenegotiateDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [showAdjustDueDate, setShowAdjustDueDate] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [payMenuOpen, setPayMenuOpen] = useState(false);
  React.useEffect(() => {
    if (!payMenuOpen) return;
    const close = () => setPayMenuOpen(false);
    // Use timeout so the opening tap doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", close, { once: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
    };
  }, [payMenuOpen]);
  const { activeMethods } = usePaymentMethods();
  const { celebrate } = usePaymentCelebration();
  const [selectedMethodId, setSelectedMethodId] = useState<string>("");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitMethod2Id, setSplitMethod2Id] = useState<string>("");
  const [splitAmount1Input, setSplitAmount1Input] = useState<string>("");
  React.useEffect(() => {
    // Reset selection when payment dialog closes — user must explicitly pick a method.
    if (!paymentDialog) setSelectedMethodId("");
  }, [paymentDialog]);
  React.useEffect(() => {
    if (!showPartial) setSelectedMethodId("");
  }, [showPartial]);
  React.useEffect(() => {
    // Reset split when dialog closes
    if (!paymentDialog) {
      setSplitEnabled(false);
      setSplitMethod2Id("");
      setSplitAmount1Input("");
    }
  }, [paymentDialog]);
  const [editHasManager, setEditHasManager] = useState<boolean>(loan.hasManager ?? false);
  const [editIsSale, setEditIsSale] = useState<boolean>(loan.isSale ?? false);
  const [editManagerId, setEditManagerId] = useState<string>(loan.managerId ?? "");
  const [editCommissionRate, setEditCommissionRate] = useState<string>(String(loan.managerCommissionRate ?? 10));
  const managerOptions = useMemo(() => clients.filter((c) => c.isManager && c.active !== false), [clients]);

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const unpaidSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const nextSchedule = unpaidSchedules[0];
  const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
  // Source of truth: loan.remainingAmount (same value shown in the create/edit form).
  // Fallback to total - totalPaid só quando o campo salvo está ausente.
  // Contratos quitados sempre têm restante 0 — mesmo se foram quitados com valor menor (acordo/desconto).
  const baseRemaining = loan.status === "paid"
    ? 0
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
  // Multa de renegociação pendente — para contratos de parcela única, é cobrada junto
  // com o pagamento de juros (opção "Juros + multa/atraso"). Em parcelados, ela já está
  // diluída nas próximas parcelas.
  const renegPenaltyPending = (loan.installments < 2 && loan.status !== "paid")
    ? Number(loan.renegotiationPenaltyTotal || 0)
    : 0;
  const lateFees = lateInterestTotal + penaltyTotal + renegPenaltyPending;
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
  const actualRemaining = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
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
  const interestCyclePartialPayments = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
      && (p as any).metadata?.kind === "interest_partial"
      && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const interestCyclePartials = interestCyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const lastCyclePartial = interestCyclePartialPayments[interestCyclePartialPayments.length - 1];
  const lastCyclePendingAfter = lastCyclePartial ? Number((lastCyclePartial as any).metadata?.cycle_pending_after) : NaN;
  const interestPending = Number.isFinite(lastCyclePendingAfter)
    ? Math.max(0, Math.round(lastCyclePendingAfter * 100) / 100)
    : Math.max(0, Math.round((interestOnly - interestCyclePartials) * 100) / 100);
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
    if (editHasManager && !editManagerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }
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

    // Aviso: alterar campos financeiros de contrato com pagamentos pode descalibrar histórico.
    const loanPaymentsCount = allPayments.filter((p) => p.loanId === loan.id).length;
    const newAmount = parseFloat(form.amount) || loan.amount;
    const newRemaining = parseFloat(form.remainingAmount) || 0;
    const newInstallments = parseInt(form.installments) || loan.installments;
    const newPaidInstallments = parseInt(form.paidInstallments) || 0;
    const sensitiveDiff =
      newAmount !== loan.amount ||
      newRemaining !== (loan.remainingAmount ?? 0) ||
      newInstallments !== loan.installments ||
      newPaidInstallments !== loan.paidInstallments;
    if (loanPaymentsCount > 0 && sensitiveDiff) {
      const ok = window.confirm(
        `Este contrato já tem ${loanPaymentsCount} pagamento(s) registrado(s).\n\n` +
        `Alterar o valor emprestado, valor restante ou número de parcelas pode descalibrar o histórico.\n\n` +
        `Para reestruturar valores preservando os pagamentos, use a opção "Renegociar".\n\n` +
        `Deseja continuar mesmo assim?`
      );
      if (!ok) return;
    }

    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: form.interestRate.trim() === "" || isNaN(parseFloat(form.interestRate)) ? loan.interestRate : Math.max(0, parseFloat(form.interestRate)),
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
      hasManager: editHasManager,
      managerId: editHasManager && editManagerId ? editManagerId : null,
      managerCommissionRate: editHasManager ? parseFloat(editCommissionRate) || 10 : null,
      isSale: editIsSale,
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

  const openPaymentDialog = (type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize", amount?: number) => {
    setPaymentDate(new Date());
    setPayoffAmount("");
    setAmortizeAmount("");
    setInterestSelection("normal");
    setInterestPartialEnabled(false);
    setInterestPartialAmount("");
    setInterestNotes("");
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = async () => {
    if (!paymentDialog) return;
    if (activeMethods.length > 0 && !selectedMethodId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const dateStr = formatYmdInAppTz(paymentDate);
    const dialogType = paymentDialog.type;
    const dialogAmount = paymentDialog.amount;
    const mid = selectedMethodId || null;

    // Compute expected total for the chosen action so we can validate the split
    const baseInterestForSplit = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
    const customRawForSplit = parseFloat(payoffAmount.replace(",", "."));
    const amortRawForSplit = parseFloat(amortizeAmount.replace(",", "."));
    let expectedTotal = 0;
    if (dialogType === "full") expectedTotal = remaining;
    else if (dialogType === "payoff") expectedTotal = isFinite(customRawForSplit) && customRawForSplit > 0 ? customRawForSplit : 0;
    else if (dialogType === "amortize") expectedTotal = isFinite(amortRawForSplit) && amortRawForSplit > 0 ? amortRawForSplit : 0;
    else if (dialogType === "installment") expectedTotal = installment + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
    else if (dialogType === "interest") {
      expectedTotal = interestSelection === "withFees" && lateFees > 0
        ? baseInterestForSplit + lateFees
        : baseInterestForSplit;
    } else if (dialogType === "partial" && dialogAmount) expectedTotal = dialogAmount;

    // Build split
    let split: PaymentSplit | null = null;
    if (splitEnabled && expectedTotal > 0) {
      if (!splitMethod2Id || splitMethod2Id === selectedMethodId) {
        toast.error("Selecione um segundo meio de pagamento diferente");
        return;
      }
      const a1 = parseFloat(splitAmount1Input.replace(",", "."));
      if (!isFinite(a1) || a1 <= 0 || a1 >= expectedTotal) {
        toast.error("Informe o valor do primeiro meio (entre 0 e o total)");
        return;
      }
      const a2 = Math.round((expectedTotal - a1) * 100) / 100;
      split = {
        parts: [
          { paymentMethodId: mid, amount: Math.round(a1 * 100) / 100 },
          { paymentMethodId: splitMethod2Id, amount: a2 },
        ],
      };
    }

    setPayoffAmount("");
    const amortRaw = parseFloat(amortizeAmount.replace(",", "."));
    setAmortizeAmount("");
    setPaymentDialog(null);
    try {
      if (dialogType === "full") {
        // Repassa o `remaining` (já inclui juros/multa de atraso) para garantir
        // que o valor total recebido seja registrado, e não só o principal+juros do contrato.
        if (onFullPayment) {
          await onFullPayment(dateStr, remaining, mid, split);
        } else {
          await onPartialPayment(remaining, dateStr, mid, split);
          await onUpdate({ paidInstallments: loan.installments, status: "paid" });
        }
      } else if (dialogType === "payoff") {
        const customRaw = parseFloat(payoffAmount.replace(",", ".") || String(customRawForSplit));
        const custom = isFinite(customRaw) && customRaw > 0 ? customRaw : (customRawForSplit > 0 ? customRawForSplit : 0);
        if (custom <= 0) return;
        if (onFullPayment) {
          await onFullPayment(dateStr, custom, mid, split);
        } else {
          await onPartialPayment(custom, dateStr, mid, split);
          await onUpdate({ paidInstallments: loan.installments, status: "paid" });
        }
      } else if (dialogType === "amortize") {
        if (!onAmortize) { toast.error("Amortização indisponível"); return; }
        const val = isFinite(amortRaw) && amortRaw > 0 ? amortRaw : 0;
        if (val <= 0) { toast.error("Informe um valor válido"); return; }
        await onAmortize(val, dateStr, mid, split);
      } else if (dialogType === "installment") {
        if (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2) {
          // Registra a multa/juros como um pagamento separado (entrada
          // própria no extrato). Split é forçado para método único pois
          // o valor da parcela em si segue inalterado abaixo.
          await onInterestPayment(dateStr, undefined, lateFees, mid, null, { partial: false, notes: "Juros/multa por atraso" });
          await onPayment(dateStr, mid, null);
        } else {
          await onPayment(dateStr, mid, split);
        }

      } else if (dialogType === "interest") {
        const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
        const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : undefined;
        const notes = interestNotes.trim() || null;
        const opts = (interestPartialEnabled || notes) ? { partial: interestPartialEnabled, notes } : undefined;
        if (interestSelection === "withFees" && lateFees > 0) {
          await onInterestPayment(dateStr, partialVal, lateFees, mid, split, opts);
        } else {
          await onInterestPayment(dateStr, partialVal, undefined, mid, split, opts);
        }
      } else if (dialogType === "partial" && dialogAmount) {
        await onPartialPayment(dialogAmount, dateStr, mid, split);
      }
      const celebrateAmount =
        dialogType === "full" ? remaining
        : dialogType === "payoff" ? (parseFloat(payoffAmount.replace(",", ".")) || customRawForSplit || undefined)
        : dialogType === "amortize" ? (isFinite(amortRaw) && amortRaw > 0 ? amortRaw : undefined)
        : dialogType === "partial" ? dialogAmount
        : undefined;
      void celebrateAmount;
      toast.success(dialogType === "amortize" ? "Amortização registrada" : "Pagamento registrado");
    } catch (err: any) {
      console.error("[confirmPayment]", err);
      toast.error(`Falha ao registrar: ${err?.message ?? "tente novamente"}`);
    }
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      if (activeMethods.length > 0 && !selectedMethodId) {
        toast.error("Selecione a forma de pagamento");
        return;
      }
      const dateStr = formatYmdInAppTz(partialDate);
      const mid = selectedMethodId || null;
      onPartialPayment(val, dateStr, mid);
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
               <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="w-[25px] h-[25px] text-destructive" /></Button>
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

          {/* Manager edit block */}
          <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`edit-mgr-${loan.id}`}
                checked={editHasManager}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setEditHasManager(checked);
                  updateField("interestRate", checked ? "20" : "30");
                }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor={`edit-mgr-${loan.id}`} className="text-xs font-medium cursor-pointer">
                Empréstimo com gerente
              </Label>
            </div>
            {editHasManager && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <Label className="text-xs">Gerente</Label>
                  <Select value={editManagerId} onValueChange={setEditManagerId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {managerOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Comissão (%)</Label>
                  <Input type="number" step="0.1" value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            )}
          </div>

          {/* Sale toggle */}
          <div className="border border-border rounded-lg p-3 bg-muted/20">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={`edit-sale-${loan.id}`}
                checked={editIsSale}
                onChange={(e) => setEditIsSale(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor={`edit-sale-${loan.id}`} className="text-xs font-medium cursor-pointer">
                Contrato de venda
              </Label>
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
      <div className={`border-b px-4 py-3 text-center ${headerBg} relative`}>
        <h3 className="font-bold text-foreground text-lg inline-flex items-center gap-1.5">
          {loan.borrowerName}
          {renegotiations.length > 0 && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-300 border border-amber-500/40 cursor-help"
                    aria-label={`Renegociado ${renegotiations.length}x`}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Renegociado {renegotiations.length}x
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </h3>
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
            {loan.hasManager && (
              <Badge variant="outline" className="text-xs bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 dark:border-emerald-500/60 gap-1">
                <UserCog className="h-3 w-3" />Com gerente
              </Badge>
            )}
            {loan.isSale && (
              <Badge variant="outline" className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-1">
                <ShoppingBag className="h-3 w-3" />Venda
              </Badge>
            )}
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
              {renegPenaltyPending > 0 && (
                <p>+ Multa de renegociação: {rawFormatCurrency(renegPenaltyPending)}</p>
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
            <p className="text-base font-bold text-foreground">{formatCurrency(Math.round((totalPaid + remaining) * 100) / 100)}</p>
            {loan.amount > 0 && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Juros acumulado: {(((totalPaid + remaining) - loan.amount) / loan.amount * 100).toFixed(2)}%
              </p>
            )}
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

        {/* Saldo pendente de juros do ciclo atual */}
        {loan.installments < 2 && loan.status !== "paid" && (() => {
          const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
            ? loan.customInterestValue
            : loan.amount * (loan.interestRate / 100);
          const cyclePartialPayments = allPayments
            .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
              && (p as any).metadata?.kind === "interest_partial"
              && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate));
          const cyclePartials = cyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
          if (cyclePartials <= 0) return null;
          const cycleFees = cyclePartialPayments.reduce(
            (m, p) => Math.max(m, Number((p as any).metadata?.cycle_fees_total || 0)),
            0,
          );
          const cycleTarget = Math.round((baseInterest + cycleFees) * 100) / 100;
          const pending = Math.max(0, Math.round((cycleTarget - cyclePartials) * 100) / 100);
          const dueStr = new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
          return (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-warning flex items-center gap-1">⏳ Juros parcial em aberto</span>
                <span className="text-[10px] text-muted-foreground">Ciclo de {dueStr}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-muted-foreground text-[10px]">{cycleFees > 0 ? "Total do ciclo" : "Juros do período"}</p>
                  <p className="font-semibold text-foreground tabular-nums">{formatCurrency(cycleTarget)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Já recebido</p>
                  <p className="font-semibold text-success tabular-nums">{formatCurrency(cyclePartials)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[10px]">Saldo pendente</p>
                  <p className="font-semibold text-warning tabular-nums">{formatCurrency(pending)}</p>
                </div>
              </div>
              {cycleFees > 0 && (
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Juros base: <span className="tabular-nums text-foreground">{formatCurrency(baseInterest)}</span></span>
                  <span>Encargos: <span className="tabular-nums text-warning">{formatCurrency(cycleFees)}</span></span>
                </div>
              )}
              <div className="border-t border-warning/20 pt-1.5 flex justify-between">
                <span className="text-muted-foreground">Vencimento atual</span>
                <span className="font-medium tabular-nums">{dueStr}</span>
              </div>
              <p className="text-[10px] text-muted-foreground italic">Próximo vencimento será exibido após a quitação total deste ciclo.</p>
            </div>
          );
        })()}

        {/* Vencimento / Pago */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
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
                      const newDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                      const newDateStr = newDate.toISOString().split("T")[0];
                      const nextNum = loan.paidInstallments + 1;
                      // If editing the first installment, also update loan.dueDate so reports stay in sync
                      if (nextNum === 1) {
                        onUpdate({ dueDate: newDateStr });
                      }
                      const freq = loan.interestType || "Mensal";
                      const loanSchedules = installmentSchedules
                        .filter((s) => s.loanId === loan.id)
                        .sort((a, b) => a.installmentNumber - b.installmentNumber);
                      const defaultAmount = calculateInstallment(loan.amount, loan.interestRate, loan.installments);
                      // Build full schedule: keep paid installments untouched, recalc pending from newDate
                      const totalInstallments = loan.installments;
                      const updatedRows = Array.from({ length: totalInstallments }, (_, i) => {
                        const num = i + 1;
                        const existing = loanSchedules.find((s) => s.installmentNumber === num);
                        const amount = existing?.amount ?? defaultAmount;
                        if (num < nextNum) {
                          // Paid installment — preserve original date
                          const firstDue = new Date(loan.dueDate + "T00:00:00");
                          const fallback = getNextDate(firstDue, freq, num - 1).toISOString().split("T")[0];
                          return { installmentNumber: num, dueDate: existing?.dueDate ?? fallback, amount };
                        }
                        // Pending — recompute from newDate using the contract cadence
                        const offset = num - nextNum;
                        const computed = getNextDate(newDate, freq, offset).toISOString().split("T")[0];
                        return { installmentNumber: num, dueDate: computed, amount };
                      });
                      await onSaveSchedule(loan.id, updatedRows);
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2 bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <DollarSign className="h-4 w-4 text-success shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Pago:</p>
              <p className="text-sm font-bold text-success">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
        </div>

        <AdjustDueDateDialog
          open={showAdjustDueDate}
          onOpenChange={setShowAdjustDueDate}
          loan={loan}
          installmentSchedules={installmentSchedules}
          onSaveSchedule={onSaveSchedule}
          onUpdate={onUpdate}
        />

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
                const instAmount = savedSchedule?.amount ?? installment;
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
                    <span className="text-foreground font-medium">{formatCurrency(instAmount)}</span>
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

        {showDetails && (() => {
          // Auditoria: original_due_date vs due_date atual e próximo vencimento (juros)
          const fmt = (iso?: string | null) => {
            if (!iso) return "—";
            const [y, m, d] = iso.split("-");
            return `${d}/${m}/${y}`;
          };
          const currentDueIso = loan.dueDate;
          const rawOriginal = loan.originalDueDate || loan.dueDate;
          // Proteção: se "original" > due_date atual, está corrompido — usa due_date como âncora.
          const originalDueIso = rawOriginal > currentDueIso ? currentDueIso : rawOriginal;
          const wasRenegotiated = !!loan.originalDueDate && loan.originalDueDate !== loan.dueDate && loan.originalDueDate <= loan.dueDate;
          const freq = loan.interestType || "Mensal";
          // Replica regra de addInterestOnlyPayment: avança 1 período a partir do dueDate atual
          // e, no caso Mensal, "snap" para o dia da âncora (originalDueDate)
          const nextDue = (() => {
            // Regra alinhada com addInterestOnlyPayment: parte da âncora e avança
            // ciclos até ficar > hoje (ignora renegociações no due_date).
            const today = new Date().toISOString().split("T")[0];
            const advance = (d: Date) => {
              if (freq === "Semanal") d.setDate(d.getDate() + 7);
              else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
              else {
                const anchorDay = Number(originalDueIso.split("-")[2]);
                d.setMonth(d.getMonth() + 1);
                if (Number.isFinite(anchorDay)) {
                  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                  d.setDate(Math.min(anchorDay, lastDay));
                }
              }
            };
            const d = new Date(originalDueIso + "T00:00:00");
            advance(d);
            let guard = 0;
            while (d.toISOString().split("T")[0] <= today && guard < 600) {
              advance(d);
              guard += 1;
            }
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${yyyy}-${mm}-${dd}`;
          })();
          return (
            <div className="space-y-2 bg-muted/20 rounded-lg p-3 border border-dashed border-border/60">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                🔍 Auditoria de Vencimento
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Vencimento original (âncora)</p>
                  <p className="font-semibold text-foreground">{fmt(originalDueIso)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Vencimento atual{wasRenegotiated ? " (renegociado)" : ""}</p>
                  <p className={`font-semibold ${wasRenegotiated ? "text-warning" : "text-foreground"}`}>{fmt(currentDueIso)}</p>
                </div>
                <div className="col-span-2 pt-1 mt-1 border-t border-border/30">
                  <p className="text-muted-foreground">Próximo vencimento se pagar apenas juros agora</p>
                  <p className="font-semibold text-primary">{fmt(nextDue)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {freq === "Mensal"
                      ? `Cálculo: próximo dia ${originalDueIso.split("-")[2]} (âncora original) após hoje. Renegociações no vencimento são ignoradas.`
                      : `Cálculo: próximo ciclo de ${freq === "Semanal" ? "7" : "15"} dias a partir da âncora, após hoje.`}
                  </p>
                </div>
                <div className="col-span-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5"
                    onClick={() => setShowAccountModal(true)}
                  >
                    📒 Ver conta passo a passo
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Modal: Conta passo a passo */}
        <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
          <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>📒 Conta passo a passo</DialogTitle>
            </DialogHeader>
            {(() => {
              const fmtBR = (iso: string) => {
                const [y, m, d] = iso.split("-");
                return `${d}/${m}/${y}`;
              };
              const addPeriod = (iso: string, anchorIso: string, freq: string) => {
                const d = new Date(iso + "T00:00:00");
                if (freq === "Semanal") d.setDate(d.getDate() + 7);
                else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
                else {
                  const anchorDay = Number(anchorIso.split("-")[2]);
                  d.setMonth(d.getMonth() + 1);
                  if (Number.isFinite(anchorDay)) {
                    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                    d.setDate(Math.min(anchorDay, lastDay));
                  }
                }
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              };
              const freq = loan.interestType || "Mensal";
              const rawBase = loan.originalDueDate || loan.dueDate;
              // Proteção: se "original" > due atual, está corrompido — usa due_date.
              const baseIso = rawBase > loan.dueDate ? loan.dueDate : rawBase;
              const interestPayments = allPayments
                .filter((p) => p.loanId === loan.id && p.metadata?.kind !== "amortization")
                .sort((a, b) => a.date.localeCompare(b.date));
              const steps: { label: string; date: string; detail?: string; highlight?: boolean }[] = [];
              steps.push({
                label: "Data base (vencimento original — âncora fixa)",
                date: fmtBR(baseIso),
                detail: `Frequência: ${freq}. Esta data nunca muda, mesmo após renegociações.`,
              });
              let runningDue = baseIso;
              interestPayments.forEach((p, idx) => {
                const prev = p.previousDueDate || runningDue;
                const next = addPeriod(prev, baseIso, freq);
                steps.push({
                  label: `Pagamento de juros #${idx + 1} em ${fmtBR(p.date)}`,
                  date: `${fmtBR(prev)} → ${fmtBR(next)}`,
                  detail: `Valor pago: ${formatCurrency(p.amount)}. Novo vencimento = ${fmtBR(prev)} + 1 ${freq.toLowerCase()}${freq === "Mensal" ? `, ajustado para o dia ${baseIso.split("-")[2]}` : ""}.`,
                });
                runningDue = next;
              });
              steps.push({
                label: "Vencimento atual no sistema",
                date: fmtBR(loan.dueDate),
                detail: loan.originalDueDate && loan.originalDueDate !== loan.dueDate
                  ? "⚠️ Renegociado — diferente da âncora."
                  : "Alinhado com a âncora original.",
              });
              const todayIso = new Date().toISOString().split("T")[0];
              let nextProj = addPeriod(baseIso, baseIso, freq);
              let g = 0;
              while (nextProj <= todayIso && g < 600) {
                nextProj = addPeriod(nextProj, baseIso, freq);
                g += 1;
              }
              steps.push({
                label: "Se pagar juros agora",
                date: `${fmtBR(loan.dueDate)} → ${fmtBR(nextProj)}`,
                detail: `Próximo vencimento sempre calculado a partir da âncora ${fmtBR(baseIso)}${freq === "Mensal" ? ` (dia ${baseIso.split("-")[2]})` : ""}, ignorando renegociações.`,
                highlight: true,
              });
              return (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Linha do tempo do ciclo de vencimentos baseada nos pagamentos reais registrados.
                  </p>
                  <ol className="space-y-2">
                    {steps.map((s, i) => (
                      <li
                        key={i}
                        className={cn(
                          "rounded-lg border p-3 space-y-1",
                          s.highlight ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">
                            {i + 1}. {s.label}
                          </span>
                          <span className={cn("text-xs font-mono tabular-nums shrink-0", s.highlight ? "text-primary font-bold" : "text-foreground")}>
                            {s.date}
                          </span>
                        </div>
                        {s.detail && <p className="text-[11px] text-muted-foreground">{s.detail}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAccountModal(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loan.notes && (
          <p className="text-xs text-muted-foreground italic bg-muted/30 rounded-lg px-3 py-2">📝 {loan.notes}</p>
        )}

        {/* Partial payment input */}
        <Dialog open={showPartial} onOpenChange={(open) => { if (!open) { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); } }}>
          <DialogContent
            onOpenAutoFocus={(e) => e.preventDefault()}
            style={{ padding: 0 }}
            className="left-1 right-1 top-1 bottom-1 h-auto w-auto max-w-none translate-x-0 translate-y-0 flex flex-col overflow-hidden p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-auto sm:max-h-[85svh] sm:w-full sm:max-w-[340px] sm:translate-x-[-50%] sm:translate-y-[-50%]"
          >
            <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
              <DialogTitle className="text-base sm:text-lg">Pagamento Parcial</DialogTitle>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 pb-3 sm:px-6 sm:pb-4 space-y-3">
              <div>
                <Label className="text-sm">Valor (R$)</Label>
                <Input
                  type="number" step="0.01" placeholder="Ex: 150.00"
                  value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                  className="h-9 text-sm mt-1"
                />
              </div>
              {activeMethods.length > 0 && (
                <div>
                  <Label className="text-sm">Forma de pagamento</Label>
                  <Select value={selectedMethodId} onValueChange={setSelectedMethodId}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {activeMethods.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
            <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); }}>Cancelar</Button>
              <Button className="flex-[2] sm:flex-none sm:h-11 gap-2" onClick={handlePartialSubmit} disabled={!partialAmount || parseFloat(partialAmount) <= 0 || (activeMethods.length > 0 && !selectedMethodId)}>
                <CheckCircle2 className="h-4 w-4" /> Confirmar pagamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-2 border-t border-border/50 mt-auto">
          {!readOnly && loan.status !== "paid" && (
            <DropdownMenu open={payMenuOpen} onOpenChange={setPayMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button className="w-full h-10 text-sm font-semibold gap-2">
                  <DollarSign className="h-4 w-4" /> Pagar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56 p-2 space-y-1">
                {loan.installments >= 2 && (
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
                )}
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
                    <p className="text-[11px] text-muted-foreground">
                      {interestCyclePartials > 0 && interestPending < interestOnly
                        ? <>Pendente: <span className="font-semibold text-warning">{formatCurrency(interestPending)}</span></>
                        : formatCurrency(interestOnly)}
                    </p>
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
                <DropdownMenuItem
                  onClick={() => openPaymentDialog("payoff")}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <DollarSign className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Quitar Contrato</p>
                    <p className="text-[11px] text-muted-foreground">Definir valor de quitação</p>
                  </div>
                </DropdownMenuItem>
                {onAmortize && (
                <DropdownMenuItem
                  onClick={() => openPaymentDialog("amortize")}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-purple/10 focus:bg-purple/10"
                >
                  <div className="h-8 w-8 rounded-full bg-purple/15 flex items-center justify-center shrink-0">
                    <Percent className="h-4 w-4 text-purple" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Amortizar</p>
                    <p className="text-[11px] text-muted-foreground">Reduz principal e juros</p>
                  </div>
                </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
           )}
          {!readOnly && loan.status !== "paid" && (
            <div className="flex gap-2">
              {onRenegotiate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 text-xs gap-1.5 border-warning text-warning"
                  onClick={() => setShowRenegotiateDialog(true)}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Renegociar
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9 text-xs gap-1.5 border-primary text-primary"
                onClick={async () => {
                  try {
                    await generateLoanReportPdf({
                      loan,
                      payments: allPayments,
                      installmentSchedules,
                      renegotiations,
                    });
                    toast.success("Relatório gerado");
                  } catch (e: any) {
                    toast.error(e?.message || "Falha ao gerar relatório");
                  }
                }}
              >
                <FileDown className="h-3.5 w-3.5" /> Baixar PDF
              </Button>
            </div>
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
            {loan.status !== "paid" && (loan.autoBillingEnabled ?? true) && (
              <WhatsappBillButton
                loan={loan}
                clients={clients}
                payments={allPayments}
                installmentSchedules={installmentSchedules}
              />
            )}
            {!readOnly && loan.status !== "paid" && (
              <Button
                size="icon"
                variant="ghost"
                className={cn("h-8 w-8", (loan.autoBillingEnabled ?? true) ? "text-primary" : "text-muted-foreground")}
                onClick={() => onUpdate({ autoBillingEnabled: !(loan.autoBillingEnabled ?? true) })}
                title={(loan.autoBillingEnabled ?? true) ? "Desativar cobrança automática" : "Ativar cobrança automática"}
              >
                {(loan.autoBillingEnabled ?? true) ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
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
      <DialogContent
        style={{ padding: 0 }}
        className={cn(
          "left-1 right-1 top-1 bottom-1 h-auto w-auto max-w-none translate-x-0 translate-y-0 flex flex-col overflow-hidden p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-auto sm:max-h-[92svh] sm:w-full sm:max-w-[440px] md:max-w-[760px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:grid sm:grid-rows-[auto_minmax(0,1fr)_auto] sm:gap-0",
          ((paymentDialog?.type === "interest" || paymentDialog?.type === "installment") && lateFees > 0) && "sm:max-w-[460px] md:max-w-[780px]"
        )}
      >
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="text-base sm:text-lg">
            {paymentDialog?.type === "full" ? "Pagamento Total" :
             paymentDialog?.type === "payoff" ? "Quitar Contrato" :
             paymentDialog?.type === "amortize" ? "Amortizar Contrato" :
             paymentDialog?.type === "installment" ? "Receber Parcela" :
             paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 pb-3 sm:px-6 sm:pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mt-2">
            <div className="space-y-4">

          {paymentDialog?.type === "full" && (
            <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
              <p className="text-xs text-muted-foreground">Total restante a receber</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
            </div>
          )}
          {paymentDialog?.type === "payoff" && (
            <div className="w-full space-y-2">
              <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                <p className="text-xs text-muted-foreground">Total restante a receber</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="payoff-amount" className="text-xs">Valor para quitar (R$)</Label>
                <Input
                  id="payoff-amount"
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
          )}
          {paymentDialog?.type === "amortize" && (() => {
            const oldPrincipal = Number(loan.amount) || 0;
            const rate = Number(loan.interestRate) || 0;
            const oldInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? Number(loan.customInterestValue)
              : oldPrincipal * (rate / 100);
            const oldTotal = oldPrincipal + oldInterest;
            const paidPrincipalAndInstallments = allPayments
              .filter((p) => p.loanId === loan.id && p.installmentNumber !== 0 && p.installmentNumber !== -2)
              .reduce((sum, p) => sum + Number(p.amount), 0);
            const oldRemaining = Math.max(0, oldTotal - paidPrincipalAndInstallments);
            const remainingInst = Math.max(1, loan.installments - loan.paidInstallments);
            const oldInstallment = oldRemaining / remainingInst;
            const amortRaw = parseFloat(amortizeAmount.replace(",", "."));
            const v = isFinite(amortRaw) && amortRaw > 0 ? amortRaw : 0;
            const validV = v > 0 && v <= oldPrincipal;
            const newPrincipal = Math.max(0, oldPrincipal - v);
            const newCustomInterest = loan.customInterestValue != null && loan.customInterestValue > 0 && oldPrincipal > 0
              ? loan.customInterestValue * (newPrincipal / oldPrincipal)
              : null;
            const newInterest = newCustomInterest != null ? newCustomInterest : newPrincipal * (rate / 100);
            const newTotal = newPrincipal + newInterest;
            const newRemaining = Math.max(0, newTotal - paidPrincipalAndInstallments);
            const newInstallment = newRemaining / remainingInst;
            const interestSaved = Math.max(0, oldInterest - newInterest);
            return (
              <div className="w-full space-y-2">
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Saldo principal atual</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(oldPrincipal)}</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amort-amount" className="text-xs">Valor da amortização (R$)</Label>
                  <Input
                    id="amort-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={amortizeAmount}
                    onChange={(e) => setAmortizeAmount(e.target.value)}
                    placeholder="Ex: 500.00"
                    autoFocus
                  />
                </div>
                {v > oldPrincipal && (
                  <p className="text-[11px] text-destructive">O valor não pode ser maior que o principal.</p>
                )}
                {validV && (
                  <div className="rounded-md bg-muted/40 p-2.5 text-[11px] space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-muted-foreground">Principal</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(oldPrincipal)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(newPrincipal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Juros total</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(oldInterest)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(newInterest)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Restante</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(oldRemaining)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(newRemaining)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/40 pt-2">
                      <span className="text-muted-foreground">Juros economizados</span>
                      <span className="font-semibold text-success tabular-nums">{rawFormatCurrency(interestSaved)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Parcela estimada</span>
                      <span className="tabular-nums">
                        <span className="line-through text-muted-foreground mr-2">{rawFormatCurrency(oldInstallment)}</span>
                        <span className="font-semibold text-primary">{rawFormatCurrency(newInstallment)}</span>
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">A amortização reduz o saldo devedor e recalcula os juros e parcelas futuras proporcionalmente.</p>
              </div>
            );
          })()}
          {paymentDialog?.type === "interest" && lateFees > 0 && (() => {
            const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? loan.customInterestValue
              : loan.amount * (loan.interestRate / 100);
            const totalWithFees = baseInterest + lateFees;
            return (
              <div className="w-full space-y-2.5">
                <p className="text-xs font-medium text-foreground">Como deseja receber?</p>
                <button
                  type="button"
                  onClick={() => setInterestSelection("normal")}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    interestSelection === "normal"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                      interestSelection === "normal" ? "border-primary" : "border-muted-foreground/40"
                    )}>
                      {interestSelection === "normal" && <div className="size-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">Apenas juros</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(baseInterest)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Recebe somente o juros do mês. Multa/atraso continuam pendentes.</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setInterestSelection("withFees")}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    interestSelection === "withFees"
                      ? "border-warning bg-warning/5 ring-1 ring-warning"
                      : "border-border bg-card hover:border-warning/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                      interestSelection === "withFees" ? "border-warning" : "border-muted-foreground/40"
                    )}>
                      {interestSelection === "withFees" && <div className="size-2 rounded-full bg-warning" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">Juros + multa/atraso</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Quita juros e regulariza encargos de atraso.</p>
                      <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Juros do mês</span>
                          <span className="text-foreground tabular-nums">{rawFormatCurrency(baseInterest)}</span>
                        </div>
                        {penaltyTotal > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Multa</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(penaltyTotal)}</span>
                          </div>
                        )}
                        {lateInterestTotal > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(lateInterestTotal)}</span>
                          </div>
                        )}
                        {renegPenaltyPending > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Multa de renegociação</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(renegPenaltyPending)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })()}
          {paymentDialog?.type === "interest" && (() => {
            const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? loan.customInterestValue
              : loan.amount * (loan.interestRate / 100);
            const cyclePartialPayments = allPayments
              .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
                && (p as any).metadata?.kind === "interest_partial"
                && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate));
            const cyclePartials = cyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const priorCycleFees = cyclePartialPayments.reduce(
              (m, p) => Math.max(m, Number((p as any).metadata?.cycle_fees_total || 0)),
              0,
            );
            const includeFeesNow = interestSelection === "withFees" && lateFees > 0;
            const cycleFees = Math.max(priorCycleFees, includeFeesNow ? lateFees : 0);
            const cycleTarget = Math.round((baseInterest + cycleFees) * 100) / 100;
            const pending = Math.max(0, Math.round((cycleTarget - cyclePartials) * 100) / 100);
            const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
            const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : 0;
            const exceeds = interestPartialEnabled && partialVal > pending && pending > 0;
            const willClose = !interestPartialEnabled || (partialVal + 0.005 >= pending);
            // Próxima data após quitação total: avança 1 ciclo a partir da âncora original
            const rawAnchor = loan.originalDueDate || loan.dueDate;
            const anchorRef = rawAnchor > loan.dueDate ? loan.dueDate : rawAnchor;
            const freq = loan.interestType || "Mensal";
            const advance = (d: Date) => {
              if (freq === "Semanal") d.setDate(d.getDate() + 7);
              else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
              else {
                const anchorDay = Number(anchorRef.split("-")[2]);
                d.setMonth(d.getMonth() + 1);
                if (Number.isFinite(anchorDay)) {
                  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                  d.setDate(Math.min(anchorDay, lastDay));
                }
              }
            };
            const nextD = new Date(anchorRef + "T00:00:00");
            advance(nextD);
            const todayStr = formatYmdInAppTz(paymentDate);
            let g = 0;
            while (formatYmdInAppTz(nextD) <= todayStr && g < 600) { advance(nextD); g++; }
            const nextDateStr = nextD.toLocaleDateString("pt-BR");
            const dueStr = new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
            const today = todayInAppTz();
            const isLate = loan.dueDate < today;
            const daysLate = isLate ? Math.floor((new Date(today + "T00:00:00").getTime() - new Date(loan.dueDate + "T00:00:00").getTime()) / 86400000) : 0;
            return (
              <div className="w-full space-y-2.5">
                {isLate && (
                  <Alert variant="destructive" className="py-2.5">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-semibold">Pagamento atrasado</AlertTitle>
                    <AlertDescription className="text-[11px]">
                      Vencimento em {dueStr} — {daysLate} {daysLate === 1 ? "dia" : "dias"} de atraso. Confirme antes de prosseguir.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Juros base</span><span className="tabular-nums">{rawFormatCurrency(baseInterest)}</span></div>
                  {cycleFees > 0 && (
                    <>
                      {penaltyTotal > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Multa por atraso</span><span className="tabular-nums text-warning">{rawFormatCurrency(penaltyTotal)}</span></div>
                      )}
                      {lateInterestTotal > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span><span className="tabular-nums text-warning">{rawFormatCurrency(lateInterestTotal)}</span></div>
                      )}
                      {renegPenaltyPending > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Multa de renegociação</span><span className="tabular-nums text-warning">{rawFormatCurrency(renegPenaltyPending)}</span></div>
                      )}
                      {!includeFeesNow && priorCycleFees > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Encargos do ciclo</span><span className="tabular-nums text-warning">{rawFormatCurrency(priorCycleFees)}</span></div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between border-t border-border/40 pt-1.5"><span className="text-muted-foreground">Total do ciclo</span><span className="font-semibold tabular-nums">{rawFormatCurrency(cycleTarget)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Já pago no ciclo</span><span className="tabular-nums text-success">{rawFormatCurrency(cyclePartials)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendente</span><span className="font-semibold tabular-nums text-primary">{rawFormatCurrency(pending)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vencimento atual</span><span className="tabular-nums">{dueStr}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Próximo após quitação</span><span className="tabular-nums">{nextDateStr}</span></div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="size-3.5 accent-primary" checked={interestPartialEnabled} onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }} />
                  Receber valor parcial
                </label>
                {interestPartialEnabled && (
                  <div className="space-y-1">
                    <Label htmlFor="int-partial" className="text-xs">Valor recebido (R$)</Label>
                    <Input id="int-partial" type="number" step="0.01" min="0" inputMode="decimal" value={interestPartialAmount} onChange={(e) => setInterestPartialAmount(e.target.value)} placeholder={`Pendente: ${pending.toFixed(2)}`} />
                    {exceeds && <p className="text-[11px] text-warning">Valor excede o saldo pendente. O excedente será desconsiderado.</p>}
                    {!willClose && partialVal > 0 && <p className="text-[11px] text-muted-foreground">Vencimento permanece em {dueStr} até a quitação total do ciclo.</p>}
                    {willClose && partialVal > 0 && <p className="text-[11px] text-success">Quita o ciclo. Próximo vencimento: {nextDateStr}.</p>}
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="int-notes" className="text-xs">Observação (opcional)</Label>
                  <Textarea id="int-notes" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} placeholder="Ex: pago via Pix" className="min-h-[60px] text-sm" />
                </div>
              </div>
            );
          })()}
          {paymentDialog?.type === "installment" && loan.installments >= 2 && (() => {
            const baseInstallment = installment;
            const totalWithFees = baseInstallment + lateFees;
            // (reference date is the selected payment date)
            const refDate = formatYmdInAppTz(paymentDate);
            const refStr = new Date(refDate + "T00:00:00").toLocaleDateString("pt-BR");
            return (
              <div className="w-full space-y-2.5">
                {lateFees > 0 ? (
                  <>
                    <p className="text-xs font-medium text-foreground">Como deseja receber esta parcela?</p>
                    <button
                      type="button"
                      onClick={() => setInterestSelection("normal")}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        interestSelection === "normal"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/40"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                          interestSelection === "normal" ? "border-primary" : "border-muted-foreground/40"
                        )}>
                          {interestSelection === "normal" && <div className="size-2 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">Apenas a parcela</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(baseInstallment)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Recebe somente o valor da parcela. Multa/atraso seguem pendentes.</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterestSelection("withFees")}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        interestSelection === "withFees"
                          ? "border-warning bg-warning/5 ring-1 ring-warning"
                          : "border-border bg-card hover:border-warning/40"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                          interestSelection === "withFees" ? "border-warning" : "border-muted-foreground/40"
                        )}>
                          {interestSelection === "withFees" && <div className="size-2 rounded-full bg-warning" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">Parcela + juros/multa</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Quita a parcela e regulariza encargos de atraso.</p>
                          <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Valor da parcela</span>
                              <span className="text-foreground tabular-nums">{rawFormatCurrency(baseInstallment)}</span>
                            </div>
                            {penaltyTotal > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Multa</span>
                                <span className="text-warning tabular-nums">{rawFormatCurrency(penaltyTotal)}</span>
                              </div>
                            )}
                            {lateInterestTotal > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span>
                                <span className="text-warning tabular-nums">{rawFormatCurrency(lateInterestTotal)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                              <span className="text-muted-foreground">Total a receber</span>
                              <span className="font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Cálculo em</span>
                              <span className="tabular-nums">{refStr}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor da parcela</span><span className="font-semibold tabular-nums">{rawFormatCurrency(baseInstallment)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Referência</span><span className="tabular-nums">{refStr}</span></div>
                  </div>
                )}
              </div>
            );
          })()}
            </div>
            <div className="flex flex-col gap-4">
              {paymentDialog?.type === "full" && (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Total restante a receber</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                </div>
              )}
              {paymentDialog?.type === "payoff" && (
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Total restante a receber</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
                </div>
              )}

              <div className="hidden md:block rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
                <p className="text-xs font-semibold text-foreground">Resumo do empréstimo</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <div>
                    <p className="text-muted-foreground">Total emprestado</p>
                    <p className="font-semibold text-foreground tabular-nums">{formatCurrency(loan.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Já recebido</p>
                    <p className="font-semibold text-success tabular-nums">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Parcelas pagas</p>
                    <p className="font-semibold text-foreground tabular-nums">{loan.paidInstallments} / {loan.installments}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Pendentes</p>
                    <p className="font-semibold text-foreground tabular-nums">{Math.max(0, loan.installments - loan.paidInstallments)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Próximo vencimento</p>
                    <p className="font-semibold text-foreground tabular-nums">{nextSchedule?.dueDate ? new Date(nextSchedule.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Taxa de juros</p>
                    <p className="font-semibold text-foreground tabular-nums">{Number(loan.interestRate).toFixed(2)}% a.m.</p>
                  </div>
                </div>
              </div>

              {activeMethods.length > 0 && (() => {
                const baseInt = loan.customInterestValue != null && loan.customInterestValue > 0 ? loan.customInterestValue : loan.amount * (loan.interestRate / 100);
                const cRaw = parseFloat(payoffAmount.replace(",", "."));
                const aRaw = parseFloat(amortizeAmount.replace(",", "."));
                const dt = paymentDialog?.type;
                let totalForSplit = 0;
                if (dt === "full") totalForSplit = remaining;
                else if (dt === "payoff") totalForSplit = isFinite(cRaw) && cRaw > 0 ? cRaw : 0;
                else if (dt === "amortize") totalForSplit = isFinite(aRaw) && aRaw > 0 ? aRaw : 0;
                else if (dt === "installment") totalForSplit = installment + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
                else if (dt === "interest") totalForSplit = interestSelection === "withFees" && lateFees > 0 ? baseInt + lateFees : baseInt;
                else if (dt === "partial") totalForSplit = paymentDialog?.amount ?? 0;
                const a1 = parseFloat(splitAmount1Input.replace(",", "."));
                const validA1 = isFinite(a1) && a1 > 0 && a1 < totalForSplit;
                const a2 = validA1 ? Math.round((totalForSplit - a1) * 100) / 100 : 0;
                return (
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
                    {totalForSplit > 0 && activeMethods.length >= 2 && (
                      <div className="pt-1.5 space-y-1.5">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" className="size-3.5 accent-primary" checked={splitEnabled} onChange={(e) => setSplitEnabled(e.target.checked)} />
                          Dividir em 2 meios de pagamento
                        </label>
                        {splitEnabled && (
                          <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-1.5">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Valor no meio 1 (R$)</Label>
                              <Input type="number" step="0.01" min="0" inputMode="decimal" value={splitAmount1Input} onChange={(e) => setSplitAmount1Input(e.target.value)} placeholder={`Total: ${rawFormatCurrency(totalForSplit)}`} className="h-8 text-sm" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px]">Meio 2</Label>
                              <Select value={splitMethod2Id} onValueChange={setSplitMethod2Id}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  {activeMethods.filter((m) => m.id !== selectedMethodId).map((m) => (
                                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {validA1 && (
                              <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                                <span className="text-muted-foreground">Restante meio 2</span>
                                <span className="font-semibold text-primary tabular-nums">{rawFormatCurrency(a2)}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="flex flex-col gap-3">
                <Label className="text-sm text-muted-foreground">Selecione a data do pagamento</Label>
                <div className="flex justify-center w-full">
                  <CalendarUI
                    mode="single"
                    selected={paymentDate}
                    onSelect={(d) => d && setPaymentDate(d)}
                    className="rounded-md border pointer-events-auto mx-auto"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
          <Button variant="outline" onClick={() => setPaymentDialog(null)} className="flex-1 sm:flex-none">Cancelar</Button>
          <Button size="lg" onClick={confirmPayment} disabled={(activeMethods.length > 0 && !selectedMethodId) || (paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)) || (paymentDialog?.type === "amortize" && !(parseFloat(amortizeAmount.replace(",", ".")) > 0 && parseFloat(amortizeAmount.replace(",", ".")) <= (Number(loan.amount) || 0)))} className="flex-[2] sm:flex-none sm:h-11"><CheckCircle2 className="h-4 w-4" /> Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AmortizationSimulator
      loan={loan}
      payments={allPayments}
      open={showSimulator}
      onOpenChange={setShowSimulator}
      onApply={onAmortize ? (amount, date) => onAmortize(amount, date, null) : undefined}
    />
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
                  <PaymentHistoryItem
                    key={p.id}
                    payment={p}
                    formatCurrency={formatCurrency}
                    onDelete={(id) => setDeletePaymentId(id)}
                    readOnly={readOnly}
                  />
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
    {onRenegotiate && (
      <RenegotiateLoanDialog
        open={showRenegotiateDialog}
        onOpenChange={setShowRenegotiateDialog}
        loan={loan}
        payments={allPayments}
        installmentSchedules={installmentSchedules}
        history={renegotiations}
        onConfirm={async (params) => { await onRenegotiate(params); }}
      />
    )}
    </>
  );
}

function LoanRowView({
  loan, payments: allPayments, installmentSchedules = [], onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, existingTags = [], clients = [],
}: {
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  onPayment: (date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (date?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (date?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  renegotiations?: LoanRenegotiation[];
  onUpdate: (data: Partial<Omit<Loan, "id">>) => void;
  onDelete: () => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule?: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  existingTags?: string[];
  clients?: Client[];
}) {
  const [showAdjustDueDateRow, setShowAdjustDueDateRow] = useState(false);
  const [payMenuOpen, setPayMenuOpen] = useState(false);
  React.useEffect(() => {
    if (!payMenuOpen) return;
    const close = () => setPayMenuOpen(false);
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", close, { once: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", close);
    };
  }, [payMenuOpen]);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>(loanToForm(loan));
  // Keep form in sync with loan prop when not editing (prevents stale notes/etc on refetch)
  React.useEffect(() => {
    if (!editing) setForm(loanToForm(loan));
  }, [loan, editing]);
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date>(new Date());
  const [paymentDialog, setPaymentDialog] = useState<{ type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize"; amount?: number } | null>(null);
  const [interestSelection, setInterestSelection] = useState<"normal" | "withFees">("normal");
  const [interestPartialEnabled, setInterestPartialEnabled] = useState(false);
  const [interestPartialAmount, setInterestPartialAmount] = useState("");
  const [interestNotes, setInterestNotes] = useState("");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [amortizeAmount, setAmortizeAmount] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [editHasManager, setEditHasManager] = useState<boolean>(loan.hasManager ?? false);
  const [editIsSale, setEditIsSale] = useState<boolean>(loan.isSale ?? false);
  const [editManagerId, setEditManagerId] = useState<string>(loan.managerId ?? "");
  const [editCommissionRate, setEditCommissionRate] = useState<string>(String(loan.managerCommissionRate ?? 10));
  const [showLateInterest, setShowLateInterest] = useState(false);
  const [lateInterestType, setLateInterestType] = useState<string>(loan.lateInterestType || "percentage");
  const [lateInterestValue, setLateInterestValue] = useState<string>(loan.lateInterestValue != null ? String(loan.lateInterestValue) : "");
  const [showPenalty, setShowPenalty] = useState(false);
  const [penaltyValue, setPenaltyValue] = useState<string>(loan.penaltyValue != null ? String(loan.penaltyValue) : "");
  const [showRenegotiateDialog, setShowRenegotiateDialog] = useState(false);
  const [showRowDetails, setShowRowDetails] = useState(false);
  const [showRowAccountModal, setShowRowAccountModal] = useState(false);
  const managerOptions = useMemo(() => clients.filter((c) => c.isManager && c.active !== false), [clients]);
  const { activeMethods: rowActiveMethods } = usePaymentMethods();
  const { celebrate } = usePaymentCelebration();
  const [rowSelectedMethodId, setRowSelectedMethodId] = useState<string>("");
  const [rowSplitEnabled, setRowSplitEnabled] = useState(false);
  const [rowSplitMethod2Id, setRowSplitMethod2Id] = useState<string>("");
  const [rowSplitAmount1Input, setRowSplitAmount1Input] = useState<string>("");
  React.useEffect(() => {
    if (!paymentDialog) setRowSelectedMethodId("");
  }, [paymentDialog]);
  React.useEffect(() => {
    if (!showPartial) setRowSelectedMethodId("");
  }, [showPartial]);
  React.useEffect(() => {
    if (!paymentDialog) {
      setRowSplitEnabled(false);
      setRowSplitMethod2Id("");
      setRowSplitAmount1Input("");
    }
  }, [paymentDialog]);

  const total = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
  const totalPaid = getTotalPaid(loan, allPayments);
  const unpaidSchedules = installmentSchedules
    .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const allUnpaidScheduleSum = unpaidSchedules.reduce((sum, s) => sum + s.amount, 0);
  // Source of truth: loan.remainingAmount (same value shown in the create/edit form).
  // Fallback to total - totalPaid only when the saved field is missing.
  const baseRemaining = loan.status === "paid"
    ? 0
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
  const renegPenaltyPending = (loan.installments < 2 && loan.status !== "paid")
    ? Number(loan.renegotiationPenaltyTotal || 0)
    : 0;
  const lateFees = lateInterestTotal + penaltyTotal + renegPenaltyPending;
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
  const actualRemainingRow = loan.status === "paid"
    ? 0
    : loan.remainingAmount != null && loan.remainingAmount > 0
      ? loan.remainingAmount
      : Math.max(0, total - totalPaid);
  const expectedRemainingRow = nextSchedule
    ? allUnpaidScheduleSum
    : fullInstallmentValue * remainingInstallments;
  const partialPaidOnCurrentRow = Math.max(0, expectedRemainingRow - actualRemainingRow);
  const installmentValue = Math.max(0, fullInstallmentValue - partialPaidOnCurrentRow);
  const interestOnlyRow = loan.customInterestValue != null && loan.customInterestValue > 0
    ? loan.customInterestValue
    : loan.amount * (loan.interestRate / 100);
  const interestCyclePartialPaymentsRow = allPayments
    .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
      && (p as any).metadata?.kind === "interest_partial"
      && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate))
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const interestCyclePartialsRow = interestCyclePartialPaymentsRow.reduce((s, p) => s + Number(p.amount || 0), 0);
  const lastCyclePartialRow = interestCyclePartialPaymentsRow[interestCyclePartialPaymentsRow.length - 1];
  const lastCyclePendingAfterRow = lastCyclePartialRow ? Number((lastCyclePartialRow as any).metadata?.cycle_pending_after) : NaN;
  const interestPendingRow = Number.isFinite(lastCyclePendingAfterRow)
    ? Math.max(0, Math.round(lastCyclePendingAfterRow * 100) / 100)
    : Math.max(0, Math.round((interestOnlyRow - interestCyclePartialsRow) * 100) / 100);
  const isParcelado = (loan.paymentType === "Parcelado" || loan.installments >= 2) && loan.status !== "paid" && loan.paidInstallments < loan.installments;
  const category = getLoanCategory(loan, allPayments, installmentSchedules);
  const badge = statusMap[category];

  const startEdit = () => {
    setForm(loanToForm(loan));
    setEditHasManager(loan.hasManager ?? false);
    setEditManagerId(loan.managerId ?? "");
    setEditCommissionRate(String(loan.managerCommissionRate ?? 10));
    setEditing(true);
    setExpanded(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    const parsedTags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const manualInterest = parseFloat(form.interestValue) || 0;
    const calcInterest = (parseFloat(form.amount) || 0) * ((parseFloat(form.interestRate) || 0) / 100);
    const hasCustomInterest = manualInterest > 0 && Math.abs(manualInterest - calcInterest) > 0.01;
    if (editHasManager && !editManagerId) {
      toast.error("Selecione um gerente para o empréstimo com gerente.");
      return;
    }
    // Aviso: alterar campos financeiros de contrato com pagamentos pode descalibrar histórico.
    const loanPaymentsCount = allPayments.filter((p) => p.loanId === loan.id).length;
    const newAmount = parseFloat(form.amount) || loan.amount;
    const newRemaining = parseFloat(form.remainingAmount) || 0;
    const newInstallments = parseInt(form.installments) || loan.installments;
    const newPaidInstallments = parseInt(form.paidInstallments) || 0;
    const sensitiveDiff =
      newAmount !== loan.amount ||
      newRemaining !== (loan.remainingAmount ?? 0) ||
      newInstallments !== loan.installments ||
      newPaidInstallments !== loan.paidInstallments;
    if (loanPaymentsCount > 0 && sensitiveDiff) {
      const ok = window.confirm(
        `Este contrato já tem ${loanPaymentsCount} pagamento(s) registrado(s).\n\n` +
        `Alterar o valor emprestado, valor restante ou número de parcelas pode descalibrar o histórico.\n\n` +
        `Para reestruturar valores preservando os pagamentos, use a opção "Renegociar".\n\n` +
        `Deseja continuar mesmo assim?`
      );
      if (!ok) return;
    }
    onUpdate({
      borrowerName: form.borrowerName,
      amount: parseFloat(form.amount) || loan.amount,
      interestRate: form.interestRate.trim() === "" || isNaN(parseFloat(form.interestRate)) ? loan.interestRate : Math.max(0, parseFloat(form.interestRate)),
      installments: parseInt(form.installments) || loan.installments,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      startDate: form.startDate || loan.startDate,
      dueDate: form.dueDate || loan.dueDate,
      interestType: form.interestType,
      notes: form.notes,
      tags: parsedTags,
      remainingAmount: parseFloat(form.remainingAmount) || 0,
      customInterestValue: hasCustomInterest ? manualInterest : null,
      hasManager: editHasManager,
      managerId: editHasManager && editManagerId ? editManagerId : null,
      managerCommissionRate: editHasManager ? parseFloat(editCommissionRate) || 10 : null,
      isSale: editIsSale,
    });
    setEditing(false);
  };

  const openPaymentDialog = (type: "installment" | "interest" | "partial" | "full" | "payoff" | "amortize", amount?: number) => {
    setPaymentDate(new Date());
    setPayoffAmount("");
    setAmortizeAmount("");
    setInterestSelection("normal");
    setInterestPartialEnabled(false);
    setInterestPartialAmount("");
    setInterestNotes("");
    setPaymentDialog({ type, amount });
  };

  const confirmPayment = async () => {
    if (!paymentDialog) return;
    if (rowActiveMethods.length > 0 && !rowSelectedMethodId) {
      toast.error("Selecione a forma de pagamento");
      return;
    }
    const dateStr = formatYmdInAppTz(paymentDate);
    const dialogType = paymentDialog.type;
    const dialogAmount = paymentDialog.amount;
    const mid = rowSelectedMethodId || null;

    const baseInterestForSplit = loan.customInterestValue != null && loan.customInterestValue > 0
      ? loan.customInterestValue
      : loan.amount * (loan.interestRate / 100);
    const customRawForSplit = parseFloat(payoffAmount.replace(",", "."));
    const amortRawForSplit = parseFloat(amortizeAmount.replace(",", "."));
    let expectedTotal = 0;
    if (dialogType === "full") expectedTotal = remaining;
    else if (dialogType === "payoff") expectedTotal = isFinite(customRawForSplit) && customRawForSplit > 0 ? customRawForSplit : 0;
    else if (dialogType === "amortize") expectedTotal = isFinite(amortRawForSplit) && amortRawForSplit > 0 ? amortRawForSplit : 0;
    else if (dialogType === "installment") expectedTotal = installmentValue + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
    else if (dialogType === "interest") {
      expectedTotal = interestSelection === "withFees" && lateFees > 0
        ? baseInterestForSplit + lateFees
        : baseInterestForSplit;
    } else if (dialogType === "partial" && dialogAmount) expectedTotal = dialogAmount;

    let split: PaymentSplit | null = null;
    if (rowSplitEnabled && expectedTotal > 0) {
      if (!rowSplitMethod2Id || rowSplitMethod2Id === rowSelectedMethodId) {
        toast.error("Selecione um segundo meio de pagamento diferente");
        return;
      }
      const a1 = parseFloat(rowSplitAmount1Input.replace(",", "."));
      if (!isFinite(a1) || a1 <= 0 || a1 >= expectedTotal) {
        toast.error("Informe o valor do primeiro meio (entre 0 e o total)");
        return;
      }
      const a2 = Math.round((expectedTotal - a1) * 100) / 100;
      split = {
        parts: [
          { paymentMethodId: mid, amount: Math.round(a1 * 100) / 100 },
          { paymentMethodId: rowSplitMethod2Id, amount: a2 },
        ],
      };
    }

    setPayoffAmount("");
    const amortRaw = parseFloat(amortizeAmount.replace(",", "."));
    setAmortizeAmount("");
    setPaymentDialog(null);
    try {
      if (dialogType === "full") {
        if (onFullPayment) {
          await onFullPayment(dateStr, remaining, mid, split);
        } else {
          await onPartialPayment(remaining, dateStr, mid, split);
          await onUpdate({ paidInstallments: loan.installments, status: "paid" });
        }
      } else if (dialogType === "payoff") {
        const customRaw = parseFloat(payoffAmount.replace(",", ".") || String(customRawForSplit));
        const custom = isFinite(customRaw) && customRaw > 0 ? customRaw : (customRawForSplit > 0 ? customRawForSplit : 0);
        if (custom <= 0) return;
        if (onFullPayment) {
          await onFullPayment(dateStr, custom, mid, split);
        } else {
          await onPartialPayment(custom, dateStr, mid, split);
          await onUpdate({ paidInstallments: loan.installments, status: "paid" });
        }
      } else if (dialogType === "amortize") {
        if (!onAmortize) { toast.error("Amortização indisponível"); return; }
        const val = isFinite(amortRaw) && amortRaw > 0 ? amortRaw : 0;
        if (val <= 0) { toast.error("Informe um valor válido"); return; }
        await onAmortize(val, dateStr, mid, split);
      } else if (dialogType === "installment") {
        if (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2) {
          await onInterestPayment(dateStr, undefined, lateFees, mid, null, { partial: false, notes: "Parcela paga com juros/multa de atraso" });
        }
        await onPayment(dateStr, mid, split);
      } else if (dialogType === "interest") {
        const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
        const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : undefined;
        const notes = interestNotes.trim() || null;
        const opts = (interestPartialEnabled || notes) ? { partial: interestPartialEnabled, notes } : undefined;
        if (interestSelection === "withFees" && lateFees > 0) {
          await onInterestPayment(dateStr, partialVal, lateFees, mid, split, opts);
        } else {
          await onInterestPayment(dateStr, partialVal, undefined, mid, split, opts);
        }
      } else if (dialogType === "partial" && dialogAmount) {
        await onPartialPayment(dialogAmount, dateStr, mid, split);
      }
      const celebrateAmount =
        dialogType === "full" ? remaining
        : dialogType === "payoff" ? (parseFloat(payoffAmount.replace(",", ".")) || customRawForSplit || undefined)
        : dialogType === "amortize" ? (isFinite(amortRaw) && amortRaw > 0 ? amortRaw : undefined)
        : dialogType === "partial" ? dialogAmount
        : undefined;
      void celebrateAmount;
      toast.success(dialogType === "amortize" ? "Amortização registrada" : "Pagamento registrado");
    } catch (err: any) {
      console.error("[confirmPayment]", err);
      toast.error(`Falha ao registrar: ${err?.message ?? "tente novamente"}`);
    }
  };

  const handlePartialSubmit = () => {
    const val = parseFloat(partialAmount);
    if (val > 0) {
      if (rowActiveMethods.length > 0 && !rowSelectedMethodId) {
        toast.error("Selecione a forma de pagamento");
        return;
      }
      const dateStr = formatYmdInAppTz(partialDate);
      const mid = rowSelectedMethodId || null;
      onPartialPayment(val, dateStr, mid);
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
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-medium text-[11px] sm:text-sm text-foreground truncate block max-w-[80px] sm:max-w-none">{loan.borrowerName}</span>
              {loan.isSale && (
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40 gap-0.5">
                  <ShoppingBag className="h-2.5 w-2.5" />Venda
                </Badge>
              )}
              {loan.notes?.trim() && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center justify-center h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-muted text-muted-foreground border border-border/50 shrink-0 cursor-help"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Possui observação"
                      >
                        <MessageCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-[240px]">
                      {loan.notes}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {renegotiations.length > 0 && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="inline-flex items-center justify-center h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-amber-500/20 text-amber-700 dark:bg-amber-400/25 dark:text-amber-300 border border-amber-500/40 shrink-0 cursor-help"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Renegociado ${renegotiations.length}x`}
                      >
                        <RefreshCw className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Renegociado {renegotiations.length}x
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {loan.hasManager && (
                <Badge variant="outline" className="bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 dark:border-emerald-500/60 text-[9px] sm:text-[10px] px-1 py-0 gap-0.5 shrink-0" title="Com gerente">
                  <UserCog className="h-3 w-3" /><span className="hidden sm:inline">Gerente</span>
                </Badge>
              )}
            </div>
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
      {/* Status - hidden on mobile and tablet */}
      <td className="hidden lg:table-cell px-1.5 sm:px-4 py-2 sm:py-3">
        <Badge variant="outline" className={`${badge.className} text-[9px] sm:text-xs px-1.5 sm:px-2.5`}>{badge.label}</Badge>
      </td>
      {/* Emprestado - hidden on mobile */}
      <td className="hidden sm:table-cell px-2 lg:px-4 py-3">
        <span className="text-xs lg:text-sm font-medium text-foreground whitespace-nowrap">{formatCurrency(loan.amount)}</span>
      </td>
      {/* Restante / Parcela / Total Pago */}
      <td className="px-1.5 sm:px-2 lg:px-4 py-2 sm:py-3">
        {loan.status === "paid" ? (
          <span className="text-[11px] sm:text-xs lg:text-sm font-medium text-success whitespace-nowrap">{formatCurrency(totalPaid)}</span>
        ) : isParcelado ? (
          <div className="flex flex-col">
            <span className="text-[11px] sm:text-xs lg:text-sm font-medium text-destructive whitespace-nowrap">{formatCurrency(installmentValue + lateFees)}</span>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="text-[11px] sm:text-xs lg:text-sm font-medium text-destructive whitespace-nowrap">{formatCurrency(remaining)}</span>
          </div>
        )}
      </td>
      {/* Parcelas - hidden on mobile */}
      <td className="hidden sm:table-cell px-2 lg:px-4 py-3">
        <div className="flex items-center gap-1 lg:gap-1.5">
          <CheckCircle className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-primary shrink-0" />
          <span className="text-xs lg:text-sm font-medium">{loan.paidInstallments}/{loan.installments}</span>
        </div>
        {daysOverdue > 0 && loan.status !== "paid" && (
          <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
            <span className="h-2 w-2 rounded-full bg-destructive inline-block shrink-0"></span>
            <span className="text-[10px] text-destructive">{daysOverdue}d em atraso</span>
          </div>
        )}
      </td>
      {/* Vencimento */}
      <td className="px-1.5 sm:px-2 lg:px-4 py-2 sm:py-3 whitespace-nowrap">
        <span className={`text-[11px] sm:text-xs lg:text-sm ${category === "overdue" ? "text-warning" : "text-foreground"}`}>
          {getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}
        </span>
      </td>
      {/* Etiquetas - hidden on mobile */}
      <td className="hidden sm:table-cell px-2 lg:px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {loan.tags && loan.tags.length > 0 ? loan.tags.map((tag) => (
            <Badge key={tag} className="bg-primary text-primary-foreground text-[10px]">{tag}</Badge>
          )) : <span className="text-xs text-muted-foreground">—</span>}
        </div>
      </td>
      {/* Chevron - somente desktop */}
      <td className="hidden lg:table-cell px-4 py-3 text-right">
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
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}><X className="w-[25px] h-[25px] text-destructive" /></Button>
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
              {/* Manager edit block */}
              <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`row-edit-mgr-${loan.id}`}
                    checked={editHasManager}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditHasManager(checked);
                      updateField("interestRate", checked ? "20" : "30");
                    }}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor={`row-edit-mgr-${loan.id}`} className="text-xs font-medium cursor-pointer">
                    Empréstimo com gerente
                  </Label>
                </div>
                {editHasManager && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <Label className="text-xs">Gerente</Label>
                      <Select value={editManagerId} onValueChange={setEditManagerId}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {managerOptions.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Comissão (%)</Label>
                      <Input type="number" step="0.1" value={editCommissionRate} onChange={(e) => setEditCommissionRate(e.target.value)} className="h-8 text-xs" />
                    </div>
                  </div>
                )}
              </div>
              {/* Sale toggle */}
              <div className="border border-border rounded-lg p-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`row-edit-sale-${loan.id}`}
                    checked={editIsSale}
                    onChange={(e) => setEditIsSale(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Label htmlFor={`row-edit-sale-${loan.id}`} className="text-xs font-medium cursor-pointer">
                    Contrato de venda
                  </Label>
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
                <p className="text-sm font-bold text-foreground">{formatCurrency(Math.round((totalPaid + remaining) * 100) / 100)}</p>
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
                {loan.amount > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Acumulado: {(((totalPaid + remaining) - loan.amount) / loan.amount * 100).toFixed(2)}%
                  </p>
                )}
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
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium">
                    {getFirstPendingDate(loan, installmentSchedules).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
            </div>
            {daysOverdue > 0 && loan.status !== "paid" && (
              <div className="flex items-center gap-1.5 text-destructive flex-wrap">
                <span className="h-2 w-2 rounded-full bg-destructive inline-block"></span>
                <span className="text-xs font-medium">{daysOverdue} dia{daysOverdue > 1 ? "s" : ""} em atraso</span>
                {lateInterestTotal > 0 && <span className="text-xs">• Juros mora: {formatCurrency(lateInterestTotal)}</span>}
                {penaltyTotal > 0 && <span className="text-xs">• Multa: {formatCurrency(penaltyTotal)}</span>}
              </div>
            )}
            {renegPenaltyPending > 0 && loan.status !== "paid" && (
              <div className="flex items-center gap-1.5 text-warning flex-wrap">
                <span className="h-2 w-2 rounded-full bg-warning inline-block"></span>
                <span className="text-xs font-medium">Multa de renegociação: {formatCurrency(renegPenaltyPending)}</span>
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
                <DropdownMenu open={payMenuOpen} onOpenChange={setPayMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" className="w-full h-10 text-sm gap-2" onClick={(e) => e.stopPropagation()}>
                      <DollarSign className="h-4 w-4" /> Pagar
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-56 p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                    {loan.installments >= 2 && (
                    <DropdownMenuItem
                      onClick={() => openPaymentDialog("installment")}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <CheckCircle className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Parcela</p>
                        <p className="text-[11px] text-muted-foreground">{formatCurrency(installmentValue)}</p>
                      </div>
                    </DropdownMenuItem>
                    )}
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
                        <p className="text-[11px] text-muted-foreground">
                          {interestCyclePartialsRow > 0 && interestPendingRow < interestOnlyRow
                            ? <>Pendente: <span className="font-semibold text-warning">{formatCurrency(interestPendingRow)}</span></>
                            : formatCurrency(interestOnlyRow)}
                        </p>
                      </div>
                    </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setShowPartial(true)}
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
                    <DropdownMenuItem
                      onClick={() => openPaymentDialog("payoff")}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-primary/10 focus:bg-primary/10"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Quitar Contrato</p>
                        <p className="text-[11px] text-muted-foreground">Definir valor de quitação</p>
                      </div>
                    </DropdownMenuItem>
                    {onAmortize && (
                    <DropdownMenuItem
                      onClick={() => openPaymentDialog("amortize")}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer hover:bg-purple/10 focus:bg-purple/10"
                    >
                      <div className="h-8 w-8 rounded-full bg-purple/15 flex items-center justify-center shrink-0">
                        <Percent className="h-4 w-4 text-purple" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Amortizar</p>
                        <p className="text-[11px] text-muted-foreground">Reduz principal e juros</p>
                      </div>
                    </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!readOnly && loan.status !== "paid" && (
                <div className="flex gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                  {onRenegotiate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-9 text-xs gap-1.5 border-warning text-warning"
                      onClick={(e) => { e.stopPropagation(); setShowRenegotiateDialog(true); }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Renegociar
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9 text-xs gap-1.5 border-primary text-primary"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await generateLoanReportPdf({
                          loan,
                          payments: allPayments,
                          installmentSchedules,
                          renegotiations,
                        });
                        toast.success("Relatório gerado");
                      } catch (err: any) {
                        toast.error(err?.message || "Falha ao gerar relatório");
                      }
                    }}
                  >
                    <FileDown className="h-3.5 w-3.5" /> Baixar PDF
                  </Button>
                </div>
              )}
              {!readOnly && loan.status !== "paid" && (
                <div className="flex gap-2 w-full" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5 border-warning text-warning" onClick={(e) => { e.stopPropagation(); setShowLateInterest((v) => !v); }}>
                    <Percent className="h-3.5 w-3.5" /> Adicionar Juros
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 h-9 text-xs gap-1.5 border-destructive text-destructive" onClick={(e) => { e.stopPropagation(); setShowPenalty((v) => !v); }}>
                    <DollarSign className="h-3.5 w-3.5" /> Adicionar Multa
                  </Button>
                </div>
              )}
              {!readOnly && showLateInterest && (
                <div className="p-3 rounded-lg bg-muted border border-border/50 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <p className="text-xs font-semibold text-foreground">Juros por Atraso</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant={lateInterestType === "percentage" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setLateInterestType("percentage")}>% por dia</Button>
                    <Button size="sm" variant={lateInterestType === "fixed" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setLateInterestType("fixed")}>R$ por dia</Button>
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
                <div className="p-3 rounded-lg bg-muted border border-border/50 space-y-2" onClick={(e) => e.stopPropagation()}>
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
              {!readOnly && loan.status === "paid" && (
                <Button variant="outline" className="w-full h-10 text-sm gap-2" onClick={(e) => { e.stopPropagation(); onUpdate({ status: "active", paidInstallments: 0 }); }}>
                  <X className="w-[25px] h-[25px]" /> Marcar como não pago
                </Button>
              )}
              <div className="flex gap-2 w-full flex-wrap">
                {loan.status !== "paid" && (loan.autoBillingEnabled ?? true) && (
                  <WhatsappBillButton
                    loan={loan}
                    clients={clients}
                    payments={allPayments}
                    installmentSchedules={installmentSchedules}
                    variant="compact"
                  />
                )}
                {!readOnly && loan.status !== "paid" && (
                  <Button
                    variant="ghost"
                    className={cn("flex-1 h-9 text-xs gap-1.5", (loan.autoBillingEnabled ?? true) ? "text-primary" : "text-muted-foreground")}
                    onClick={(e) => { e.stopPropagation(); onUpdate({ autoBillingEnabled: !(loan.autoBillingEnabled ?? true) }); }}
                    title={(loan.autoBillingEnabled ?? true) ? "Desativar cobrança automática" : "Ativar cobrança automática"}
                  >
                    {(loan.autoBillingEnabled ?? true)
                      ? <><BellRing className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Cobrança ativa</span></>
                      : <><BellOff className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Cobrança off</span></>}
                  </Button>
                )}
                <Button variant="ghost" className="flex-1 h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}>
                  <History className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Histórico</span>
                </Button>
                {!readOnly && (
                  <>
                    <Button variant="ghost" className="flex-1 h-9 text-xs gap-1.5" onClick={(e) => { e.stopPropagation(); startEdit(); }}>
                      <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Editar</span>
                    </Button>
                    <Button variant="ghost" className="flex-1 h-9 text-xs gap-1.5 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
                      <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Excluir</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
            <Dialog open={showPartial} onOpenChange={(open) => { if (!open) { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); } }}>
              <DialogContent
                onOpenAutoFocus={(e) => e.preventDefault()}
                style={{ padding: 0 }}
                className="left-1 right-1 top-1 bottom-1 h-auto w-auto max-w-none translate-x-0 translate-y-0 flex flex-col overflow-hidden p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-auto sm:max-h-[85svh] sm:w-full sm:max-w-[340px] sm:translate-x-[-50%] sm:translate-y-[-50%]"
              >
                <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
                  <DialogTitle className="text-base sm:text-lg">Pagamento Parcial</DialogTitle>
                </DialogHeader>
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 pb-3 sm:px-6 sm:pb-4 space-y-3">
                  <div>
                    <Label className="text-sm">Valor (R$)</Label>
                    <Input
                      type="number" step="0.01" placeholder="Ex: 150.00"
                      value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                      className="h-9 text-sm mt-1"
                    />
                  </div>
                  {rowActiveMethods.length > 0 && (
                    <div>
                      <Label className="text-sm">Forma de pagamento</Label>
                      <Select value={rowSelectedMethodId} onValueChange={setRowSelectedMethodId}>
                        <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {rowActiveMethods.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
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
                <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
                  <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setShowPartial(false); setPartialAmount(""); setPartialDate(new Date()); }}>Cancelar</Button>
                  <Button className="flex-[2] sm:flex-none sm:h-11 gap-2" onClick={handlePartialSubmit} disabled={!partialAmount || parseFloat(partialAmount) <= 0 || (rowActiveMethods.length > 0 && !rowSelectedMethodId)}>
                    <CheckCircle2 className="h-4 w-4" /> Confirmar pagamento
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Mais Detalhes - Installment Schedule (mesmo conteúdo da view por Cards) */}
            {(() => {
              const progress = loan.installments > 0 ? (loan.paidInstallments / loan.installments) * 100 : 0;
              const totalInterest = total - loan.amount;
              return (
                <>
                  <button
                    onClick={() => setShowRowDetails(!showRowDetails)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline w-full justify-center py-1"
                  >
                    {showRowDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {showRowDetails ? "Ocultar detalhes" : "Mais detalhes"}
                  </button>

                  {showRowDetails && (
                    <div className="space-y-2 bg-muted/30 rounded-lg p-2 sm:p-3 border border-border/50">
                      <p className="text-xs font-semibold text-foreground mb-1">Cronograma de Parcelas</p>
                      <div className="max-h-64 sm:max-h-80 overflow-y-auto -mx-1 px-1">
                        <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_auto] gap-x-2 gap-y-1 text-[11px] sm:text-xs items-center">
                          <span className="font-medium text-muted-foreground">#</span>
                          <span className="font-medium text-muted-foreground">Venc.</span>
                          <span className="font-medium text-muted-foreground">Valor</span>
                          <span className="font-medium text-muted-foreground text-right">Status</span>
                          {Array.from({ length: loan.installments }, (_, idx) => {
                            const i = idx + 1;
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
                            const instAmount = savedSchedule?.amount ?? installmentValue;
                            const isPaid = i <= loan.paidInstallments;
                            const todayNorm = new Date();
                            const todayStr = `${todayNorm.getFullYear()}-${String(todayNorm.getMonth() + 1).padStart(2, "0")}-${String(todayNorm.getDate()).padStart(2, "0")}`;
                            const instIso = instDate.toISOString().split("T")[0];
                            const isOverdue = !isPaid && instIso < todayStr;
                            const isDueToday = !isPaid && instIso === todayStr;
                            return (
                              <React.Fragment key={i}>
                                <span className="text-muted-foreground tabular-nums">{i}</span>
                                <span className="text-foreground tabular-nums truncate">{instDateStr}</span>
                                <span className="text-foreground font-medium tabular-nums truncate">{formatCurrency(instAmount)}</span>
                                <span className="justify-self-end">
                                  {isPaid ? (
                                    <Badge className="bg-success/20 text-success border-success/30 text-[9px] px-1.5 py-0 h-4">Pago</Badge>
                                  ) : isOverdue ? (
                                    <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-[9px] px-1.5 py-0 h-4">Atraso</Badge>
                                  ) : isDueToday ? (
                                    <Badge className="bg-warning/20 text-warning border-warning/30 text-[9px] px-1.5 py-0 h-4">Hoje</Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">Pend.</Badge>
                                  )}
                                </span>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-2 mt-1 border-t border-border/30 text-[11px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Valor da Parcela</p>
                          <p className="font-semibold text-foreground tabular-nums truncate">{formatCurrency(installmentValue)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Juros / Parcela</p>
                          <p className="font-semibold text-foreground tabular-nums truncate">{formatCurrency(installmentValue - (loan.amount / Math.max(1, loan.installments)))}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Total de Juros</p>
                          <p className="font-semibold text-foreground tabular-nums truncate">{formatCurrency(totalInterest)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-muted-foreground truncate">Já Recebido</p>
                          <p className="font-semibold text-success tabular-nums truncate">{formatCurrency(totalPaid)}</p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <div className="flex justify-between text-[11px] sm:text-xs mb-1">
                          <span className="text-muted-foreground">{loan.paidInstallments}/{loan.installments} parcelas</span>
                          <span className="font-medium text-foreground tabular-nums">{Math.round(progress)}%</span>
                        </div>
                        <Progress value={progress} className="h-2" />
                      </div>
                    </div>
                  )}

                  {showRowDetails && (() => {
                    const fmt = (iso?: string | null) => {
                      if (!iso) return "—";
                      const [y, m, d] = iso.split("-");
                      return `${d}/${m}/${y}`;
                    };
                    const currentDueIso = loan.dueDate;
                    const rawOriginal = loan.originalDueDate || loan.dueDate;
                    const originalDueIso = rawOriginal > currentDueIso ? currentDueIso : rawOriginal;
                    const wasRenegotiated = !!loan.originalDueDate && loan.originalDueDate !== loan.dueDate && loan.originalDueDate <= loan.dueDate;
                    const freq = loan.interestType || "Mensal";
                    const nextDue = (() => {
                      const today = new Date().toISOString().split("T")[0];
                      const advance = (d: Date) => {
                        if (freq === "Semanal") d.setDate(d.getDate() + 7);
                        else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
                        else {
                          const anchorDay = Number(originalDueIso.split("-")[2]);
                          d.setMonth(d.getMonth() + 1);
                          if (Number.isFinite(anchorDay)) {
                            const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                            d.setDate(Math.min(anchorDay, lastDay));
                          }
                        }
                      };
                      const d = new Date(originalDueIso + "T00:00:00");
                      advance(d);
                      let guard = 0;
                      while (d.toISOString().split("T")[0] <= today && guard < 600) {
                        advance(d);
                        guard += 1;
                      }
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      return `${yyyy}-${mm}-${dd}`;
                    })();
                    return (
                      <div className="space-y-2 bg-muted/20 rounded-lg p-3 border border-dashed border-border/60">
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                          🔍 Auditoria de Vencimento
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Vencimento original (âncora)</p>
                            <p className="font-semibold text-foreground">{fmt(originalDueIso)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Vencimento atual{wasRenegotiated ? " (renegociado)" : ""}</p>
                            <p className={`font-semibold ${wasRenegotiated ? "text-warning" : "text-foreground"}`}>{fmt(currentDueIso)}</p>
                          </div>
                          <div className="col-span-2 pt-1 mt-1 border-t border-border/30">
                            <p className="text-muted-foreground">Próximo vencimento se pagar apenas juros agora</p>
                            <p className="font-semibold text-primary">{fmt(nextDue)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {freq === "Mensal"
                                ? `Cálculo: próximo dia ${originalDueIso.split("-")[2]} (âncora original) após hoje. Renegociações no vencimento são ignoradas.`
                                : `Cálculo: próximo ciclo de ${freq === "Semanal" ? "7" : "15"} dias a partir da âncora, após hoje.`}
                            </p>
                          </div>
                          <div className="col-span-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full h-8 text-xs gap-1.5"
                              onClick={() => setShowRowAccountModal(true)}
                            >
                              📒 Ver conta passo a passo
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <Dialog open={showRowAccountModal} onOpenChange={setShowRowAccountModal}>
                    <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>📒 Conta passo a passo</DialogTitle>
                      </DialogHeader>
                      {(() => {
                        const fmtBR = (iso: string) => {
                          const [y, m, d] = iso.split("-");
                          return `${d}/${m}/${y}`;
                        };
                        const addPeriod = (iso: string, anchorIso: string, freq: string) => {
                          const d = new Date(iso + "T00:00:00");
                          if (freq === "Semanal") d.setDate(d.getDate() + 7);
                          else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
                          else {
                            const anchorDay = Number(anchorIso.split("-")[2]);
                            d.setMonth(d.getMonth() + 1);
                            if (Number.isFinite(anchorDay)) {
                              const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                              d.setDate(Math.min(anchorDay, lastDay));
                            }
                          }
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        };
                        const freq = loan.interestType || "Mensal";
                        const rawBase = loan.originalDueDate || loan.dueDate;
                        const baseIso = rawBase > loan.dueDate ? loan.dueDate : rawBase;
                        const interestPayments = allPayments
                          .filter((p) => p.loanId === loan.id && p.metadata?.kind !== "amortization")
                          .sort((a, b) => a.date.localeCompare(b.date));
                        const steps: { label: string; date: string; detail?: string; highlight?: boolean }[] = [];
                        steps.push({
                          label: "Data base (vencimento original — âncora fixa)",
                          date: fmtBR(baseIso),
                          detail: `Frequência: ${freq}. Esta data nunca muda, mesmo após renegociações.`,
                        });
                        let runningDue = baseIso;
                        interestPayments.forEach((p, idx) => {
                          const prev = p.previousDueDate || runningDue;
                          const next = addPeriod(prev, baseIso, freq);
                          steps.push({
                            label: `Pagamento de juros #${idx + 1} em ${fmtBR(p.date)}`,
                            date: `${fmtBR(prev)} → ${fmtBR(next)}`,
                            detail: `Valor pago: ${formatCurrency(p.amount)}. Novo vencimento = ${fmtBR(prev)} + 1 ${freq.toLowerCase()}${freq === "Mensal" ? `, ajustado para o dia ${baseIso.split("-")[2]}` : ""}.`,
                          });
                          runningDue = next;
                        });
                        steps.push({
                          label: "Vencimento atual no sistema",
                          date: fmtBR(loan.dueDate),
                          detail: loan.originalDueDate && loan.originalDueDate !== loan.dueDate
                            ? "⚠️ Renegociado — diferente da âncora."
                            : "Alinhado com a âncora original.",
                        });
                        const todayIso = new Date().toISOString().split("T")[0];
                        let nextProj = addPeriod(baseIso, baseIso, freq);
                        let g = 0;
                        while (nextProj <= todayIso && g < 600) {
                          nextProj = addPeriod(nextProj, baseIso, freq);
                          g += 1;
                        }
                        steps.push({
                          label: "Se pagar juros agora",
                          date: `${fmtBR(loan.dueDate)} → ${fmtBR(nextProj)}`,
                          detail: `Próximo vencimento sempre calculado a partir da âncora ${fmtBR(baseIso)}${freq === "Mensal" ? ` (dia ${baseIso.split("-")[2]})` : ""}, ignorando renegociações.`,
                          highlight: true,
                        });
                        return (
                          <div className="space-y-3 text-sm">
                            <p className="text-xs text-muted-foreground">
                              Linha do tempo do ciclo de vencimentos baseada nos pagamentos reais registrados.
                            </p>
                            <ol className="space-y-2">
                              {steps.map((s, i) => (
                                <li
                                  key={i}
                                  className={cn(
                                    "rounded-lg border p-3 space-y-1",
                                    s.highlight ? "border-primary/50 bg-primary/5" : "border-border/50 bg-muted/20",
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-semibold text-foreground">
                                      {i + 1}. {s.label}
                                    </span>
                                    <span className={cn("text-xs font-mono tabular-nums shrink-0", s.highlight ? "text-primary font-bold" : "text-foreground")}>
                                      {s.date}
                                    </span>
                                  </div>
                                  {s.detail && <p className="text-[11px] text-muted-foreground">{s.detail}</p>}
                                </li>
                              ))}
                            </ol>
                          </div>
                        );
                      })()}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRowAccountModal(false)}>Fechar</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
          </div>
          )}
        </td>
      </tr>
    )}
    <Dialog open={!!paymentDialog} onOpenChange={(open) => !open && setPaymentDialog(null)}>
      <DialogContent
        style={{ padding: 0 }}
        className={cn(
          "left-1 right-1 top-1 bottom-1 h-auto w-auto max-w-none translate-x-0 translate-y-0 flex flex-col overflow-hidden p-0 sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:h-auto sm:max-h-[92svh] sm:w-full sm:max-w-[440px] md:max-w-[760px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:grid sm:grid-rows-[auto_minmax(0,1fr)_auto] sm:gap-0",
          ((paymentDialog?.type === "interest" || paymentDialog?.type === "installment") && lateFees > 0) && "sm:max-w-[460px] md:max-w-[780px]"
        )}
      >
        <DialogHeader className="shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="text-base sm:text-lg">
            {paymentDialog?.type === "full" ? "Pagamento Total" :
             paymentDialog?.type === "payoff" ? "Quitar Contrato" :
             paymentDialog?.type === "amortize" ? "Amortizar Contrato" :
             paymentDialog?.type === "installment" ? "Receber Parcela" :
             paymentDialog?.type === "interest" ? "Pagar Juros" : "Pagamento Parcial"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] px-4 pb-3 sm:px-6 sm:pb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start mt-2">
            <div className="space-y-4">

          {paymentDialog?.type === "full" && (
            <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
              <p className="text-xs text-muted-foreground">Total restante a receber</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
            </div>
          )}
          {paymentDialog?.type === "payoff" && (
            <div className="w-full space-y-2">
              <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                <p className="text-xs text-muted-foreground">Total restante a receber</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(remaining)}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="payoff-amount-row" className="text-xs">Valor para quitar (R$)</Label>
                <Input
                  id="payoff-amount-row"
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
          )}
          {paymentDialog?.type === "amortize" && (() => {
            const oldPrincipal = Number(loan.amount) || 0;
            const rate = Number(loan.interestRate) || 0;
            const oldInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? Number(loan.customInterestValue)
              : oldPrincipal * (rate / 100);
            const oldTotal = oldPrincipal + oldInterest;
            const paidPrincipalAndInstallments = allPayments
              .filter((p) => p.loanId === loan.id && p.installmentNumber !== 0 && p.installmentNumber !== -2)
              .reduce((sum, p) => sum + Number(p.amount), 0);
            const oldRemaining = Math.max(0, oldTotal - paidPrincipalAndInstallments);
            const remainingInst = Math.max(1, loan.installments - loan.paidInstallments);
            const oldInstallment = oldRemaining / remainingInst;
            const amortRaw = parseFloat(amortizeAmount.replace(",", "."));
            const v = isFinite(amortRaw) && amortRaw > 0 ? amortRaw : 0;
            const validV = v > 0 && v <= oldPrincipal;
            const newPrincipal = Math.max(0, oldPrincipal - v);
            const newCustomInterest = loan.customInterestValue != null && loan.customInterestValue > 0 && oldPrincipal > 0
              ? loan.customInterestValue * (newPrincipal / oldPrincipal)
              : null;
            const newInterest = newCustomInterest != null ? newCustomInterest : newPrincipal * (rate / 100);
            const newTotal = newPrincipal + newInterest;
            const newRemaining = Math.max(0, newTotal - paidPrincipalAndInstallments);
            const newInstallment = newRemaining / remainingInst;
            const interestSaved = Math.max(0, oldInterest - newInterest);
            return (
              <div className="w-full space-y-2">
                <div className="text-center p-3 bg-muted/50 rounded-lg w-full">
                  <p className="text-xs text-muted-foreground">Saldo principal atual</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(oldPrincipal)}</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amort-amount-row" className="text-xs">Valor da amortização (R$)</Label>
                  <Input
                    id="amort-amount-row"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={amortizeAmount}
                    onChange={(e) => setAmortizeAmount(e.target.value)}
                    placeholder="Ex: 500.00"
                    autoFocus
                  />
                </div>
                {v > oldPrincipal && (
                  <p className="text-[11px] text-destructive">O valor não pode ser maior que o principal.</p>
                )}
                {validV && (
                  <div className="rounded-md bg-muted/40 p-2.5 text-[11px] space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-muted-foreground">Principal</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(oldPrincipal)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(newPrincipal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Juros total</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(oldInterest)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(newInterest)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Restante</p>
                        <p className="line-through text-muted-foreground tabular-nums">{rawFormatCurrency(oldRemaining)}</p>
                        <p className="font-semibold text-primary tabular-nums">{rawFormatCurrency(newRemaining)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/40 pt-2">
                      <span className="text-muted-foreground">Juros economizados</span>
                      <span className="font-semibold text-success tabular-nums">{rawFormatCurrency(interestSaved)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Parcela estimada</span>
                      <span className="tabular-nums">
                        <span className="line-through text-muted-foreground mr-2">{rawFormatCurrency(oldInstallment)}</span>
                        <span className="font-semibold text-primary">{rawFormatCurrency(newInstallment)}</span>
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">A amortização reduz o saldo devedor e recalcula os juros e parcelas futuras proporcionalmente.</p>
              </div>
            );
          })()}
          {paymentDialog?.type === "interest" && lateFees > 0 && (() => {
            const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? loan.customInterestValue
              : loan.amount * (loan.interestRate / 100);
            const totalWithFees = baseInterest + lateFees;
            return (
              <div className="w-full space-y-2.5">
                <p className="text-xs font-medium text-foreground">Como deseja receber?</p>
                <button
                  type="button"
                  onClick={() => setInterestSelection("normal")}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    interestSelection === "normal"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                      interestSelection === "normal" ? "border-primary" : "border-muted-foreground/40"
                    )}>
                      {interestSelection === "normal" && <div className="size-2 rounded-full bg-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">Apenas juros</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(baseInterest)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Recebe somente o juros do mês. Multa/atraso continuam pendentes.</p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setInterestSelection("withFees")}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-all",
                    interestSelection === "withFees"
                      ? "border-warning bg-warning/5 ring-1 ring-warning"
                      : "border-border bg-card hover:border-warning/40"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                      interestSelection === "withFees" ? "border-warning" : "border-muted-foreground/40"
                    )}>
                      {interestSelection === "withFees" && <div className="size-2 rounded-full bg-warning" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="text-sm font-medium text-foreground">Juros + multa/atraso</span>
                        <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Quita juros e regulariza encargos de atraso.</p>
                      <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Juros do mês</span>
                          <span className="text-foreground tabular-nums">{rawFormatCurrency(baseInterest)}</span>
                        </div>
                        {penaltyTotal > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Multa</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(penaltyTotal)}</span>
                          </div>
                        )}
                        {lateInterestTotal > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(lateInterestTotal)}</span>
                          </div>
                        )}
                        {renegPenaltyPending > 0 && (
                          <div className="flex justify-between text-[11px]">
                            <span className="text-muted-foreground">Multa de renegociação</span>
                            <span className="text-warning tabular-nums">{rawFormatCurrency(renegPenaltyPending)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })()}
          {paymentDialog?.type === "interest" && (() => {
            const baseInterest = loan.customInterestValue != null && loan.customInterestValue > 0
              ? loan.customInterestValue
              : loan.amount * (loan.interestRate / 100);
            const cyclePartialPayments = allPayments
              .filter((p) => p.loanId === loan.id && p.installmentNumber === 0
                && (p as any).metadata?.kind === "interest_partial"
                && (p.previousDueDate === loan.dueDate || (p as any).metadata?.cycle_due_date === loan.dueDate));
            const cyclePartials = cyclePartialPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
            const priorCycleFees = cyclePartialPayments.reduce(
              (m, p) => Math.max(m, Number((p as any).metadata?.cycle_fees_total || 0)),
              0,
            );
            const includeFeesNow = interestSelection === "withFees" && lateFees > 0;
            const cycleFees = Math.max(priorCycleFees, includeFeesNow ? lateFees : 0);
            const cycleTarget = Math.round((baseInterest + cycleFees) * 100) / 100;
            const pending = Math.max(0, Math.round((cycleTarget - cyclePartials) * 100) / 100);
            const partialRaw = parseFloat(interestPartialAmount.replace(",", "."));
            const partialVal = interestPartialEnabled && isFinite(partialRaw) && partialRaw > 0 ? partialRaw : 0;
            const exceeds = interestPartialEnabled && partialVal > pending && pending > 0;
            const willClose = !interestPartialEnabled || (partialVal + 0.005 >= pending);
            const rawAnchor = loan.originalDueDate || loan.dueDate;
            const anchorRef = rawAnchor > loan.dueDate ? loan.dueDate : rawAnchor;
            const freq = loan.interestType || "Mensal";
            const advance = (d: Date) => {
              if (freq === "Semanal") d.setDate(d.getDate() + 7);
              else if (freq === "Quinzenal") d.setDate(d.getDate() + 15);
              else {
                const anchorDay = Number(anchorRef.split("-")[2]);
                d.setMonth(d.getMonth() + 1);
                if (Number.isFinite(anchorDay)) {
                  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                  d.setDate(Math.min(anchorDay, lastDay));
                }
              }
            };
            const nextD = new Date(anchorRef + "T00:00:00");
            advance(nextD);
            const todayStr = formatYmdInAppTz(paymentDate);
            let g = 0;
            while (formatYmdInAppTz(nextD) <= todayStr && g < 600) { advance(nextD); g++; }
            const nextDateStr = nextD.toLocaleDateString("pt-BR");
            const dueStr = new Date(loan.dueDate + "T00:00:00").toLocaleDateString("pt-BR");
            const today = todayInAppTz();
            const isLate = loan.dueDate < today;
            const daysLate = isLate ? Math.floor((new Date(today + "T00:00:00").getTime() - new Date(loan.dueDate + "T00:00:00").getTime()) / 86400000) : 0;
            return (
              <div className="w-full space-y-2.5">
                {isLate && (
                  <Alert variant="destructive" className="py-2.5">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle className="text-xs font-semibold">Pagamento atrasado</AlertTitle>
                    <AlertDescription className="text-[11px]">
                      Vencimento em {dueStr} — {daysLate} {daysLate === 1 ? "dia" : "dias"} de atraso. Confirme antes de prosseguir.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Juros base</span><span className="tabular-nums">{rawFormatCurrency(baseInterest)}</span></div>
                  {cycleFees > 0 && (
                    <>
                      {penaltyTotal > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Multa por atraso</span><span className="tabular-nums text-warning">{rawFormatCurrency(penaltyTotal)}</span></div>
                      )}
                      {lateInterestTotal > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span><span className="tabular-nums text-warning">{rawFormatCurrency(lateInterestTotal)}</span></div>
                      )}
                      {renegPenaltyPending > 0 && includeFeesNow && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Multa de renegociação</span><span className="tabular-nums text-warning">{rawFormatCurrency(renegPenaltyPending)}</span></div>
                      )}
                      {!includeFeesNow && priorCycleFees > 0 && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Encargos do ciclo</span><span className="tabular-nums text-warning">{rawFormatCurrency(priorCycleFees)}</span></div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between border-t border-border/40 pt-1.5"><span className="text-muted-foreground">Total do ciclo</span><span className="font-semibold tabular-nums">{rawFormatCurrency(cycleTarget)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Já pago no ciclo</span><span className="tabular-nums text-success">{rawFormatCurrency(cyclePartials)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Saldo pendente</span><span className="font-semibold tabular-nums text-primary">{rawFormatCurrency(pending)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vencimento atual</span><span className="tabular-nums">{dueStr}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Próximo após quitação</span><span className="tabular-nums">{nextDateStr}</span></div>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" className="size-3.5 accent-primary" checked={interestPartialEnabled} onChange={(e) => { setInterestPartialEnabled(e.target.checked); if (!e.target.checked) setInterestPartialAmount(""); }} />
                  Receber valor parcial
                </label>
                {interestPartialEnabled && (
                  <div className="space-y-1">
                    <Label htmlFor="int-partial-row" className="text-xs">Valor recebido (R$)</Label>
                    <Input id="int-partial-row" type="number" step="0.01" min="0" inputMode="decimal" value={interestPartialAmount} onChange={(e) => setInterestPartialAmount(e.target.value)} placeholder={`Pendente: ${pending.toFixed(2)}`} />
                    {exceeds && <p className="text-[11px] text-warning">Valor excede o saldo pendente. O excedente será desconsiderado.</p>}
                    {!willClose && partialVal > 0 && <p className="text-[11px] text-muted-foreground">Vencimento permanece em {dueStr} até a quitação total do ciclo.</p>}
                    {willClose && partialVal > 0 && <p className="text-[11px] text-success">Quita o ciclo. Próximo vencimento: {nextDateStr}.</p>}
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="int-notes-row" className="text-xs">Observação (opcional)</Label>
                  <Textarea id="int-notes-row" value={interestNotes} onChange={(e) => setInterestNotes(e.target.value)} placeholder="Ex: pago via Pix" className="min-h-[60px] text-sm" />
                </div>
              </div>
            );
          })()}
          {paymentDialog?.type === "installment" && loan.installments >= 2 && (() => {
            const baseInstallment = installmentValue;
            const totalWithFees = baseInstallment + lateFees;
            const refStr = new Date(formatYmdInAppTz(paymentDate) + "T00:00:00").toLocaleDateString("pt-BR");
            return (
              <div className="w-full space-y-2.5">
                {lateFees > 0 ? (
                  <>
                    <p className="text-xs font-medium text-foreground">Como deseja receber esta parcela?</p>
                    <button
                      type="button"
                      onClick={() => setInterestSelection("normal")}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        interestSelection === "normal"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/40"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                          interestSelection === "normal" ? "border-primary" : "border-muted-foreground/40"
                        )}>
                          {interestSelection === "normal" && <div className="size-2 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">Apenas a parcela</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(baseInstallment)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Recebe somente o valor da parcela. Multa/atraso seguem pendentes.</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterestSelection("withFees")}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all",
                        interestSelection === "withFees"
                          ? "border-warning bg-warning/5 ring-1 ring-warning"
                          : "border-border bg-card hover:border-warning/40"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "shrink-0 size-4 rounded-full border-2 mt-0.5 flex items-center justify-center",
                          interestSelection === "withFees" ? "border-warning" : "border-muted-foreground/40"
                        )}>
                          {interestSelection === "withFees" && <div className="size-2 rounded-full bg-warning" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <span className="text-sm font-medium text-foreground">Parcela + juros/multa</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">Quita a parcela e regulariza encargos de atraso.</p>
                          <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Valor da parcela</span>
                              <span className="text-foreground tabular-nums">{rawFormatCurrency(baseInstallment)}</span>
                            </div>
                            {penaltyTotal > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Multa</span>
                                <span className="text-warning tabular-nums">{rawFormatCurrency(penaltyTotal)}</span>
                              </div>
                            )}
                            {lateInterestTotal > 0 && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Juros de atraso ({effectiveDaysLate}d)</span>
                                <span className="text-warning tabular-nums">{rawFormatCurrency(lateInterestTotal)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                              <span className="text-muted-foreground">Total a receber</span>
                              <span className="font-semibold text-foreground tabular-nums">{rawFormatCurrency(totalWithFees)}</span>
                            </div>
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Cálculo em</span>
                              <span className="tabular-nums">{refStr}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Valor da parcela</span><span className="font-semibold tabular-nums">{rawFormatCurrency(baseInstallment)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Referência</span><span className="tabular-nums">{refStr}</span></div>
                  </div>
                )}
              </div>
            );
          })()}
            </div>
            <div className="flex flex-col gap-4">
          {rowActiveMethods.length > 0 && (() => {
            const baseInt = loan.customInterestValue != null && loan.customInterestValue > 0 ? loan.customInterestValue : loan.amount * (loan.interestRate / 100);
            const cRaw = parseFloat(payoffAmount.replace(",", "."));
            const aRaw = parseFloat(amortizeAmount.replace(",", "."));
            const dt = paymentDialog?.type;
            let totalForSplit = 0;
            if (dt === "full") totalForSplit = remaining;
            else if (dt === "payoff") totalForSplit = isFinite(cRaw) && cRaw > 0 ? cRaw : 0;
            else if (dt === "amortize") totalForSplit = isFinite(aRaw) && aRaw > 0 ? aRaw : 0;
            else if (dt === "installment") totalForSplit = installmentValue + (interestSelection === "withFees" && lateFees > 0 && loan.installments >= 2 ? lateFees : 0);
            else if (dt === "interest") totalForSplit = interestSelection === "withFees" && lateFees > 0 ? baseInt + lateFees : baseInt;
            else if (dt === "partial") totalForSplit = paymentDialog?.amount ?? 0;
            const a1 = parseFloat(rowSplitAmount1Input.replace(",", "."));
            const validA1 = isFinite(a1) && a1 > 0 && a1 < totalForSplit;
            const a2 = validA1 ? Math.round((totalForSplit - a1) * 100) / 100 : 0;
            return (
              <div className="w-full space-y-1">
                <Label className="text-sm text-muted-foreground">Forma de pagamento</Label>
                <Select value={rowSelectedMethodId} onValueChange={setRowSelectedMethodId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {rowActiveMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {totalForSplit > 0 && rowActiveMethods.length >= 2 && (
                  <div className="pt-1.5 space-y-1.5">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                      <input type="checkbox" className="size-3.5 accent-primary" checked={rowSplitEnabled} onChange={(e) => setRowSplitEnabled(e.target.checked)} />
                      Dividir em 2 meios de pagamento
                    </label>
                    {rowSplitEnabled && (
                      <div className="rounded-md border border-border/60 bg-muted/30 p-2 space-y-1.5">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Valor no meio 1 (R$)</Label>
                          <Input type="number" step="0.01" min="0" inputMode="decimal" value={rowSplitAmount1Input} onChange={(e) => setRowSplitAmount1Input(e.target.value)} placeholder={`Total: ${rawFormatCurrency(totalForSplit)}`} className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Meio 2</Label>
                          <Select value={rowSplitMethod2Id} onValueChange={setRowSplitMethod2Id}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {rowActiveMethods.filter((m) => m.id !== rowSelectedMethodId).map((m) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {validA1 && (
                          <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
                            <span className="text-muted-foreground">Restante meio 2</span>
                            <span className="font-semibold text-primary tabular-nums">{rawFormatCurrency(a2)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex flex-col gap-3">
            <Label className="text-sm text-muted-foreground">Selecione a data do pagamento</Label>
            <div className="flex justify-center w-full">
              <CalendarUI
                mode="single"
                selected={paymentDate}
                onSelect={(d) => d && setPaymentDate(d)}
                className="rounded-md border pointer-events-auto mx-auto"
              />
            </div>
          </div>

          <div className="hidden md:block rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Resumo do empréstimo</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <p className="text-muted-foreground">Total emprestado</p>
                <p className="font-semibold text-foreground tabular-nums">{formatCurrency(loan.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Já recebido</p>
                <p className="font-semibold text-success tabular-nums">{formatCurrency(totalPaid)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Parcelas pagas</p>
                <p className="font-semibold text-foreground tabular-nums">{loan.paidInstallments} / {loan.installments}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pendentes</p>
                <p className="font-semibold text-foreground tabular-nums">{Math.max(0, loan.installments - loan.paidInstallments)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Próximo vencimento</p>
                <p className="font-semibold text-foreground tabular-nums">{nextSchedule?.dueDate ? new Date(nextSchedule.dueDate + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Taxa de juros</p>
                <p className="font-semibold text-foreground tabular-nums">{Number(loan.interestRate).toFixed(2)}% a.m.</p>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row gap-2 border-t border-border/40 bg-background/95 backdrop-blur px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 sm:pt-3 sm:border-0 sm:bg-transparent sm:backdrop-blur-0">
          <Button variant="outline" onClick={() => setPaymentDialog(null)} className="flex-1 sm:flex-none">Cancelar</Button>
          <Button size="lg" onClick={confirmPayment} disabled={(rowActiveMethods.length > 0 && !rowSelectedMethodId) || (paymentDialog?.type === "payoff" && !(parseFloat(payoffAmount.replace(",", ".")) > 0)) || (paymentDialog?.type === "amortize" && !(parseFloat(amortizeAmount.replace(",", ".")) > 0 && parseFloat(amortizeAmount.replace(",", ".")) <= (Number(loan.amount) || 0)))} className="flex-[2] sm:flex-none sm:h-11"><CheckCircle2 className="h-4 w-4" /> Confirmar pagamento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AmortizationSimulator
      loan={loan}
      payments={allPayments}
      open={showSimulator}
      onOpenChange={setShowSimulator}
      onApply={onAmortize ? (amount, date) => onAmortize(amount, date, null) : undefined}
    />
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
                  <PaymentHistoryItem
                    key={p.id}
                    payment={p}
                    formatCurrency={formatCurrency}
                    onDelete={(id) => setDeletePaymentId(id)}
                    readOnly={readOnly}
                  />
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
    {onSaveSchedule && (
      <AdjustDueDateDialog
        open={showAdjustDueDateRow}
        onOpenChange={setShowAdjustDueDateRow}
        loan={loan}
        installmentSchedules={installmentSchedules}
        onSaveSchedule={onSaveSchedule}
        onUpdate={onUpdate}
      />
    )}
    {onRenegotiate && (
      <RenegotiateLoanDialog
        open={showRenegotiateDialog}
        onOpenChange={setShowRenegotiateDialog}
        loan={loan}
        payments={allPayments}
        installmentSchedules={installmentSchedules}
        history={renegotiations}
        onConfirm={async (params) => { await onRenegotiate(params); }}
      />
    )}
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
  group, payments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, clients = [],
}: {
  group: ClientGroup;
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  onPayment: (id: string, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onPartialPayment: (id: string, amount: number, date?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onFullPayment?: (id: string, date?: string, customAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => void;
  onInterestPayment: (id: string, date?: string, customAmount?: number, feesAmount?: number, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null, options?: { partial?: boolean; notes?: string | null }) => void;
  onAmortize?: (loanId: string, amount: number, paymentDate?: string, paymentMethodId?: string | null, paymentSplit?: PaymentSplit | null) => Promise<void> | void;
  onRenegotiate?: (loanId: string, params: { type: "no_interest" | "with_penalty"; penaltyMode?: "fixed" | "percentage" | null; penaltyInput?: number | null; penaltyDistribution?: "diluted" | "first" | null; newInstallments?: number | null; notes?: string | null; selectedInstallmentNumbers?: number[] | null; firstDueDate?: string | null }) => Promise<void> | void;
  renegotiations?: LoanRenegotiation[];
  onUpdate: (id: string, data: Partial<Omit<Loan, "id">>) => void;
  onDelete: (id: string) => void;
  onDeletePayment: (paymentId: string) => void;
  onSaveSchedule: (loanId: string, rows: { installmentNumber: number; dueDate: string; amount: number }[]) => Promise<void>;
  readOnly?: boolean;
  clients?: Client[];
}) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const activeCount = group.loans.filter((l) => l.status !== "paid").length;
  const paidCount = group.loans.filter((l) => l.status === "paid").length;
  const managerCount = group.loans.filter((l) => l.hasManager).length;

  const handleShareWhatsApp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!captureRef.current || sharing) return;
    setSharing(true);
    try {
      const { toBlob } = await import("html-to-image");
      const original = captureRef.current;

      // Temporarily hide elements marked for exclusion so the layout reflows
      // (filter alone leaves a gap because layout is still computed with them).
      const hiddenNodes = Array.from(
        original.querySelectorAll<HTMLElement>('[data-whatsapp-export-hidden="true"]')
      );
      const previousDisplay = hiddenNodes.map((n) => n.style.display);
      hiddenNodes.forEach((n) => {
        n.style.display = "none";
      });

      let blob: Blob | null = null;
      try {
        blob = await toBlob(original, {
          pixelRatio: 2,
          backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
          cacheBust: true,
          width: original.scrollWidth,
          height: original.scrollHeight,
        });
      } finally {
        hiddenNodes.forEach((n, i) => {
          n.style.display = previousDisplay[i];
        });
      }

      if (!blob) throw new Error("Falha ao gerar imagem");
      const file = new File([blob], `emprestimos-${group.name.replace(/\s+/g, "-").toLowerCase()}.png`, { type: "image/png" });
      const text = `Empréstimos de ${group.name}`;
      const nav = navigator as any;
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: text, text });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }
      // Fallback: baixa imagem e abre WhatsApp Web com texto
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.open(`https://wa.me/?text=${encodeURIComponent(text + " (imagem baixada — anexe no WhatsApp)")}`, "_blank");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar imagem");
    } finally {
      setSharing(false);
    }
  };

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
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
            {group.hasOverdue && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Atrasado</Badge>}
            {managerCount > 0 && (
              <Badge variant="outline" className="bg-[#009C3B]/15 text-[#009C3B] dark:bg-emerald-500/25 dark:text-emerald-300 border-[#009C3B]/60 dark:border-emerald-500/60 text-[10px] gap-0.5">
                <UserCog className="h-2.5 w-2.5" />{managerCount === group.loans.length ? "Com gerente" : `${managerCount} c/ gerente`}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.loans.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          {open && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Enviar para WhatsApp"
              onClick={handleShareWhatsApp}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleShareWhatsApp(e as any); } }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-colors disabled:opacity-50"
              aria-disabled={sharing}
            >
              <MessageCircle className="h-4 w-4" />
            </span>
          )}
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
          <div ref={captureRef} className="space-y-3 bg-card p-3 rounded-xl">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
                {group.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-foreground text-sm">{group.name}</h3>
                <p className="text-[10px] text-muted-foreground">{group.loans.length} empréstimo(s) · {new Date().toLocaleDateString("pt-BR")}</p>
              </div>
              <button
                type="button"
                aria-label="Enviar para WhatsApp"
                data-whatsapp-export-hidden="true"
                onClick={handleShareWhatsApp}
                disabled={sharing}
                className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] transition-colors shrink-0 disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </div>
            {/* Mobile summary */}
            <div className="flex sm:hidden items-center justify-between gap-2 text-xs border-b border-border/30 pb-3">
              <div className="text-center flex-1">
                <p className="text-[9px] text-muted-foreground uppercase">Emprestado</p>
                <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
              </div>
              <div className="text-center flex-1" data-whatsapp-export-hidden="true">
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
                    <th className="hidden sm:table-cell px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Status</th>
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
                    <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={[...new Set(group.loans.flatMap(l => l.tags || []))]} clients={clients} renegotiations={renegotiations.filter((r) => r.loanId === loan.id)}
                      onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)} onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)} onFullPayment={onFullPayment ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split) : undefined}
                      onInterestPayment={(date, custom, fees, mid, split, opts) => onInterestPayment(loan.id, date, custom, fees, mid, split, opts)} onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined} onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function LoanList({ loans, payments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, initialCategory, initialView, clients = [], onOpenClientHistory, onOpenSimulator }: Props) {
  const { renegotiations: allRenegotiations } = useLoanRenegotiations();
  const renegotiationsByLoan = useMemo(() => {
    const map = new Map<string, LoanRenegotiation[]>();
    for (const r of allRenegotiations) {
      const arr = map.get(r.loanId) || [];
      arr.push(r);
      map.set(r.loanId, arr);
    }
    return map;
  }, [allRenegotiations]);
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const [view, setView] = useState<"cards" | "rows" | "folders">(initialView ?? "rows");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([initialCategory ?? "all"]);
  const lastClickRef = useRef<{ id: Category; time: number } | null>(null);
  const MULTI_SELECT_WINDOW_MS = 2000;
  const handleCategoryClick = useCallback((id: Category) => {
    const now = Date.now();
    const last = lastClickRef.current;
    setSelectedCategories((prev) => {
      // Double click on same -> isolate this one
      if (last && last.id === id && now - last.time < MULTI_SELECT_WINDOW_MS) {
        return [id];
      }
      // Within multi-select window and different id -> toggle add/remove
      if (last && last.id !== id && now - last.time < MULTI_SELECT_WINDOW_MS) {
        const filtered = prev.filter((c) => c !== "all" && c !== id);
        if (prev.includes(id)) {
          return filtered.length === 0 ? ["all"] : filtered;
        }
        return [...filtered, id];
      }
      // Outside window -> replace selection
      return [id];
    });
    lastClickRef.current = { id, time: now };
  }, []);
  const category: Category = selectedCategories.length === 1 ? selectedCategories[0] : "all";
  const isMultiSelect = selectedCategories.length > 1;
  const [showFilters, setShowFilters] = useState(false);
  const [dueDateQuick, setDueDateQuick] = useState<"yesterday" | "today" | "tomorrow" | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [notesFilter, setNotesFilter] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<"dueDate" | "startDate" | "amount" | "name">("dueDate");

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    loans.forEach((l) => l.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [loans]);

  const categorized = useMemo(() => {
    let filtered = loans.filter((l) => l.borrowerName.toLowerCase().includes(search.toLowerCase()));

    // Category filter (supports multi-select)
    if (isMultiSelect) {
      filtered = filtered.filter((l) => {
        const cat = getLoanCategory(l, payments, installmentSchedules);
        return selectedCategories.some((sel) => {
          if (sel === "all") return cat !== "paid";
          if (sel === "parcelado") return l.installments >= 2 && l.status !== "paid";
          if (sel === "venda") return !!l.isSale;
          if (sel === "on_track") return cat === "on_track" || cat === "paid_interest";
          return cat === sel;
        });
      });
    } else if (category === "all") {
      filtered = filtered.filter((l) => getLoanCategory(l, payments, installmentSchedules) !== "paid");
    } else if (category === "parcelado") {
      filtered = filtered.filter((l) => l.installments >= 2 && l.status !== "paid");
    } else if (category === "venda") {
      filtered = filtered.filter((l) => !!l.isSale);
    } else if (category === "on_track") {
      // "Em Dia" inclui também os contratos com pagamento de juros (status JUROS).
      filtered = filtered.filter((l) => {
        const cat = getLoanCategory(l, payments, installmentSchedules);
        return cat === "on_track" || cat === "paid_interest";
      });
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

    // Due date range filter (uses next pending installment date, falls back to loan.dueDate)
    if (dueDateFrom || dueDateTo) {
      filtered = filtered.filter((l) => {
        const next = getFirstPendingDate(l, installmentSchedules);
        const ymd = !isNaN(next.getTime())
          ? `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
          : (l.dueDate || "");
        if (!ymd) return false;
        if (dueDateFrom && ymd < dueDateFrom) return false;
        if (dueDateTo && ymd > dueDateTo) return false;
        return true;
      });
    }
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

    if (notesFilter === "with") {
      filtered = filtered.filter((l) => Boolean(l.notes?.trim()));
    } else if (notesFilter === "without") {
      filtered = filtered.filter((l) => !l.notes?.trim());
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
      if (sortBy === "amount") {
        const valueOf = (l: Loan) => {
          if (l.installments > 1) {
            // Parcela atual considerando pagamento parcial
            const nextSchedule = installmentSchedules.find(
              (s) => s.loanId === l.id && s.installmentNumber === l.paidInstallments + 1,
            );
            const allUnpaid = installmentSchedules.filter(
              (s) => s.loanId === l.id && s.installmentNumber > l.paidInstallments,
            );
            const allUnpaidSum = allUnpaid.reduce((sum, s) => sum + s.amount, 0);
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            const totalPaid = payments.filter((p) => p.loanId === l.id).reduce((s, p) => s + p.amount, 0);
            const remainingInstallments = Math.max(1, l.installments - l.paidInstallments);
            const fullInstallment = nextSchedule
              ? nextSchedule.amount
              : (l.customInstallmentValue && l.customInstallmentValue > 0)
                ? l.customInstallmentValue
                : total / l.installments;
            const actualRemaining = (l.remainingAmount != null && l.remainingAmount > 0)
              ? l.remainingAmount
              : Math.max(0, total - totalPaid);
            const expectedRemaining = nextSchedule ? allUnpaidSum : fullInstallment * remainingInstallments;
            const partialPaidOnCurrent = Math.max(0, expectedRemaining - actualRemaining);
            return Math.max(0, fullInstallment - partialPaidOnCurrent);
          }
          // Parcela única — saldo restante + juros de atraso + multa
          const base = (l.remainingAmount && l.remainingAmount > 0) ? l.remainingAmount : l.amount;
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = l.status !== "paid" ? Number(l.renegotiationPenaltyTotal || 0) : 0;
          return base + fees.lateFees + renegPenalty;
        };
        return valueOf(b) - valueOf(a);
      }
      return a.borrowerName.localeCompare(b.borrowerName);
    });
  }, [loans, payments, installmentSchedules, search, category, selectedCategories, isMultiSelect, dateFrom, dateTo, dueDateFrom, dueDateTo, amountMin, amountMax, tagFilter, notesFilter, sortBy, dueDateQuick, view]);

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
      on_track: cats.filter((c) => c === "on_track" || c === "paid_interest").length,
      venda: loans.filter((l) => !!l.isSale && l.status !== "paid").length,
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
         // "A Receber" do cliente = saldo restante + multas/juros de atraso + penalidades de renegociação
         //  - exclui empréstimos quitados
         //  - usa getBaseRemainingAmount (mesma fonte usada no card de cada empréstimo)
         //  - inclui lateFees (juros de atraso + multa) e renegotiationPenaltyTotal pendente
         const totalReceivable = loans.reduce((s, l) => {
           if (l.status === "paid") return s;
           const base = getBaseRemainingAmount(l, payments, installmentSchedules);
           const fees = getLoanLateFees(l, payments, installmentSchedules);
           const renegPenalty = Number(l.renegotiationPenaltyTotal || 0);
           return s + Math.max(0, base + fees.lateFees + renegPenalty);
         }, 0);
         const hasOverdue = loans.some((l) => l.status !== "paid" && getLoanCategory(l, payments, installmentSchedules) === "overdue");
          grouped.push({ name, loans, totalAmount: loans.reduce((s, l) => s + l.amount, 0), totalPaid, totalReceivable: Math.round(totalReceivable * 100) / 100, hasOverdue });
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
    }, [categorized, payments, installmentSchedules]);

  const summaryData = useMemo(() => {
    const source = categorized;
    const activeSource = source.filter((l) => l.status !== "paid");
    const totalLentRaw = activeSource.reduce((s, l) => s + l.amount, 0);

    // Quando o filtro selecionado é "Quitado", mostramos o total já pago dos contratos quitados
    if (category === "paid") {
      const totalPaidSum = source
        .filter((l) => l.status === "paid")
        .reduce((s, l) => s + getTotalPaid(l, payments), 0);
      const totalInterestPaid = source.reduce(
        (s, l) => s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount), 0
      );
      return {
        totalLent: totalLentRaw,
        totalToReceive: totalPaidSum,
        totalInterest: totalInterestPaid,
        activeCount: source.filter((l) => l.status === "active").length,
        overdueCount: 0,
      };
    }
    
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
  }, [categorized, payments, dueDateQuick, view, installmentSchedules, category]);

  // Cards de resumo (Vencidos / Vence Hoje / No Prazo / Total a Receber)
  // Baseados em TODOS os empréstimos não quitados, independentemente dos filtros.
  const statusSummary = useMemo(() => {
    const today = todayInAppTz();
    const currentMonth = today.slice(0, 7);
    let overdue = 0;
    let dueToday = 0;
    let onTrack = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let onTrackCount = 0;
    for (const l of loans) {
      if (l.status === "paid") continue;
      const cat = getLoanCategory(l, payments, installmentSchedules);
      if (cat === "overdue") {
        overdue += getOverdueAmount(l, installmentSchedules, today);
        overdueCount += 1;
        continue;
      }
      const base = getBaseRemainingAmount(l, payments, installmentSchedules);
      const fees = getLoanLateFees(l, payments, installmentSchedules);
      const renegPenalty = Number(l.renegotiationPenaltyTotal || 0);
      const receivable = Math.max(0, base + fees.lateFees + renegPenalty);
      if (cat === "due_today") {
        // Para parcelados, considera apenas o valor da parcela que vence hoje.
        const isParcelado = l.installments >= 2;
        dueToday += isParcelado ? getInstallmentAmount(l, installmentSchedules) : receivable;
        dueTodayCount += 1;
      } else if (cat === "on_track" || cat === "paid_interest") {
        // "No Prazo" considera apenas vencimentos futuros dentro do mês vigente.
        const due = l.dueDate || "";
        if (due.slice(0, 7) === currentMonth) {
          onTrack += receivable;
          onTrackCount += 1;
        }
      }
    }
    return {
      overdue, dueToday, onTrack,
      total: overdue + dueToday + onTrack,
      overdueCount, dueTodayCount, onTrackCount,
      totalCount: overdueCount + dueTodayCount + onTrackCount,
    };
  }, [loans, payments, installmentSchedules]);

  // Aplica o filtro do card escolhido (categoria + janela de datas de vencimento quando necessário).
  const applyCardFilter = useCallback((cardId: "overdue" | "due_today" | "on_track" | "all") => {
    setSelectedCategories([cardId]);
    setDueDateQuick(null);
    if (cardId === "on_track") {
      const today = todayInAppTz();
      const [y, m] = today.split("-");
      const firstOfMonth = `${y}-${m}-01`;
      // último dia do mês
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      const lastOfMonth = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
      setDueDateFrom(firstOfMonth);
      setDueDateTo(lastOfMonth);
    } else {
      setDueDateFrom("");
      setDueDateTo("");
    }
  }, []);

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
      {/* Cards de resumo dos empréstimos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {([
          { id: "overdue" as Category, label: "Vencidos", value: statusSummary.overdue, count: statusSummary.overdueCount, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/40", delay: "0ms" },
          { id: "due_today" as Category, label: "Vence Hoje", value: statusSummary.dueToday, count: statusSummary.dueTodayCount, icon: Clock, color: "text-warning", bg: "bg-warning/10", ring: "ring-warning/40", delay: "80ms" },
          { id: "on_track" as Category, label: "No Prazo", value: statusSummary.onTrack, count: statusSummary.onTrackCount, icon: CheckCircle, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/40", delay: "160ms" },
          { id: "all" as Category, label: "Total a Receber", value: statusSummary.total, count: statusSummary.totalCount, icon: DollarSign, color: "text-success", bg: "bg-success/10", ring: "ring-success/40", delay: "240ms" },
        ]).map((c) => {
          const Icon = c.icon;
          const isActive = selectedCategories.length === 1 && selectedCategories[0] === c.id;
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => applyCardFilter(c.id as "overdue" | "due_today" | "on_track" | "all")}
              className={`rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center transition-all duration-200 hover:scale-[1.02] hover:shadow-md focus:outline-none ${isActive ? `ring-2 ${c.ring}` : ""}`}
              style={{ animationDelay: c.delay, animationFillMode: "backwards" }}
            >
              <div className={`h-8 w-8 rounded-lg ${c.bg} flex items-center justify-center mb-2`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">{c.label}</p>
              <p className={`text-sm sm:text-xl font-bold ${c.color} mt-0.5`}>{formatCurrency(c.value)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{c.count} {c.count === 1 ? "contrato" : "contratos"}</p>
            </button>
          );
        })}
      </div>

      {/* Filtros rápidos: grid em mobile, linha única ocupando toda a largura em tablet/desktop */}
      <div className="grid grid-cols-4 gap-2 w-full sm:flex sm:flex-nowrap sm:items-center sm:gap-2 sm:overflow-x-auto sm:scrollbar-hide">
        {categoryConfig.map((cat) => {
          const isActive = selectedCategories.includes(cat.id);
          return (
            <button key={cat.id} onClick={() => handleCategoryClick(cat.id)}
              className={`px-2 py-1.5 sm:px-1 lg:px-2 rounded-full text-[10px] sm:text-[10px] lg:text-xs font-medium transition-all duration-200 border whitespace-nowrap sm:flex-1 sm:basis-0 sm:min-w-0 sm:text-center ${
                isActive ? `${cat.activeColor} scale-[1.03] shadow-sm ring-1 ring-offset-1 ring-offset-background ring-current/20` : `bg-card ${cat.color} hover:opacity-80`
              }`}
            >
              {cat.label} ({counts[cat.id]})
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input placeholder="Buscar por nome do cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Button variant={showFilters ? "default" : "outline"} size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />Filtros
          {(dateFrom || dateTo || dueDateFrom || dueDateTo || amountMin || amountMax || tagFilter || notesFilter !== "all") && (
            <Badge className="bg-destructive text-destructive-foreground h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">!</Badge>
          )}
        </Button>
        {/* Botões — versão PC/Tablet (entre Filtros e o seletor de visualização) */}
        {onOpenSimulator && (
          <Button variant="outline" size="sm" onClick={onOpenSimulator} className="hidden md:inline-flex gap-1.5" title="Simular Empréstimo">
            <Calculator className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Simular Empréstimo</span>
          </Button>
        )}
        {onOpenClientHistory && (
          <Button variant="outline" size="sm" onClick={onOpenClientHistory} className="hidden md:inline-flex gap-1.5" title="Histórico do Cliente">
            <User className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Histórico do Cliente</span>
          </Button>
        )}
        <div className="flex flex-col gap-1 w-full sm:w-auto sm:ml-auto">
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
          {/* Botões — versão Mobile (abaixo de Ontem/Hoje/Amanhã) */}
          {/* Botões — versão Mobile (abaixo de Ontem/Hoje/Amanhã) */}
          {(onOpenSimulator || onOpenClientHistory) && (
            <div className="grid grid-cols-2 gap-2 mt-1 md:hidden">
              {onOpenSimulator && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenSimulator}
                  className="w-full gap-1.5"
                >
                  <Calculator className="h-3.5 w-3.5" />
                  Simular Empréstimo
                </Button>
              )}
              {onOpenClientHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenClientHistory}
                  className="w-full gap-1.5"
                >
                  <User className="h-3.5 w-3.5" />
                  Histórico do Cliente
                </Button>
              )}
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
                <Label className="text-xs text-muted-foreground">Vencimento (De)</Label>
                <DatePickerField value={dueDateFrom} onChange={(v) => setDueDateFrom(v)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Vencimento (Até)</Label>
                <DatePickerField value={dueDateTo} onChange={(v) => setDueDateTo(v)} className="h-8 text-sm" />
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
              <div className="col-span-2 sm:col-span-3 lg:col-span-2 flex items-end">
                <select
                  value={notesFilter}
                  onChange={(e) => setNotesFilter(e.target.value as "all" | "with" | "without")}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">Observação: todos</option>
                  <option value="with">Apenas com observação</option>
                  <option value="without">Apenas sem observação</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setDateFrom(""); setDateTo(""); setDueDateFrom(""); setDueDateTo(""); setAmountMin(""); setAmountMax(""); setTagFilter(""); setNotesFilter("all"); setSortBy("dueDate"); }}>
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
                <LoanCardView loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={loans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i)} clients={clients} renegotiations={renegotiationsByLoan.get(loan.id) || []}
                  onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)} onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)} onFullPayment={onFullPayment ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split) : undefined}
                  onInterestPayment={(date, custom, fees, mid, split, opts) => onInterestPayment(loan.id, date, custom, fees, mid, split, opts)} onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined} onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
                </div>
              ))}
            </div>
          ) : view === "folders" ? (
            <>
            <div className="space-y-4">
              {grouped.map((g) => (
                <ClientFolder key={g.name} group={g} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} clients={clients} renegotiations={allRenegotiations}
                  onPayment={onPayment} onPartialPayment={onPartialPayment} onFullPayment={onFullPayment}
                  onInterestPayment={onInterestPayment} onAmortize={onAmortize} onRenegotiate={onRenegotiate} onUpdate={onUpdate} onDelete={onDelete} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
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
                <span className={`text-sm font-semibold ${category === "paid" ? "text-success" : "text-destructive"}`}>{mask(rawFormatCurrency(summaryData.totalToReceive))}</span>
              </div>
              {/* Legenda de cores — apenas mobile */}
              <div className="sm:hidden sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/30 px-3 py-1.5 flex items-center justify-between gap-2 text-[10px]">
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">Atrasado</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-warning" />
                  <span className="text-muted-foreground">Vence hoje</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Em dia</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" />
                  <span className="text-muted-foreground">Quitado</span>
                </div>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-1.5 sm:px-2 lg:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Cliente</th>
                    <th className="hidden lg:table-cell px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Status</th>
                    <th className="hidden sm:table-cell px-2 lg:px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Emprestado</th>
                    <th className="px-1.5 sm:px-2 lg:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">{category === "paid" ? "Pago" : "Restante"}</th>
                    <th className="hidden sm:table-cell px-2 lg:px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Parcelas</th>
                    <th className="px-1.5 sm:px-2 lg:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground">Venc.</th>
                    <th className="hidden sm:table-cell px-2 lg:px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Etiquetas</th>
                    <th className="hidden lg:table-cell px-4 py-2.5 text-right text-xs font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {categorized.map((loan) => (
                    <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={loans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i)} clients={clients} renegotiations={renegotiationsByLoan.get(loan.id) || []}
                      onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)} onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)} onFullPayment={onFullPayment ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split) : undefined}
                      onInterestPayment={(date, custom, fees, mid, split, opts) => onInterestPayment(loan.id, date, custom, fees, mid, split, opts)} onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined} onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
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
