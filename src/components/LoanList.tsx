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
import { getLoanLateFees, getBaseRemainingAmount, getLoanReceivable } from "@/lib/loanLateFees";
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
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { generateLoanReportPdf } from "@/lib/loanReportPdf";
import type { LoanRenegotiation } from "@/types/loan";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useWhatsappBillingMessages } from "@/hooks/useWhatsappBillingMessages";
import { buildBillingWhatsappLink } from "@/lib/whatsappBilling";
import { WhatsappPreviewDialog } from "@/components/WhatsappPreviewDialog";
import { PartialPaymentDialog } from "@/components/loans/PartialPaymentDialog";
import { InterestResultCard } from "@/components/loans/InterestResultCard";
import { FullPaymentSummary } from "@/components/loans/FullPaymentSummary";
import { PayoffCompositionCard, PayoffSimulationCard } from "@/components/loans/PayoffCards";
import { AmortizationResultCard } from "@/components/loans/AmortizationResultCard";

import { WhatsappBillButton } from "@/components/loans/list/WhatsappBillButton";
import { LoanListSummaryCards } from "@/components/loans/list/LoanListSummaryCards";
import { LoanCategoryChips, LoanSearchBar, LoanQuickDateFilters, LoanAdvancedFilters } from "@/components/loans/list/LoanListFilters";
import { LoanRowView } from "@/components/loans/list/LoanListRow";
import { LoanListTable } from "@/components/loans/list/LoanListTable";


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

import type { Category, EditForm } from "@/components/loans/list/types";
import { categoryConfig, statusMap } from "@/components/loans/list/constants";
import { rawFormatCurrency } from "@/components/loans/list/formatting";
import {
  getNextDate,
  getFirstPendingDate,
  getDaysOverdue,
  getLoanCategory,
  getInstallmentDueDate,
  loanToForm,
  getTotalPaid,
} from "@/components/loans/list/calculations";

import { LoanListMobileCards } from "@/components/loans/list/LoanListMobileCards";




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
  group, payments, installmentSchedules, onPayment, onPartialPayment, onFullPayment, onInterestPayment, onAmortize, onRenegotiate, renegotiations = [], onUpdate, onDelete, onDeletePayment, onSaveSchedule, readOnly = false, clients = [], commissionTotalByLoan,
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
  commissionTotalByLoan?: Map<string, number>;
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
                    <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={[...new Set(group.loans.flatMap(l => l.tags || []))]} clients={clients} renegotiations={renegotiations.filter((r) => r.loanId === loan.id)} managerCommissionTotal={commissionTotalByLoan?.get(loan.id) || 0}
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
  const { commissions: allCommissions } = useManagerCommissions();
  const commissionTotalByLoan = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of allCommissions) {
      m.set(c.loanId, (m.get(c.loanId) || 0) + Number(c.amount || 0));
    }
    return m;
  }, [allCommissions]);
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
  type SortableCol = "borrowerName" | "category" | "amount" | "remaining" | "installments" | "dueDate" | "tags";
  const [columnSort, setColumnSort] = useState<{ col: SortableCol; dir: "desc" | "asc" } | null>(null);
  const cycleColumnSort = useCallback((col: SortableCol) => {
    setColumnSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "desc" };
      if (prev.dir === "desc") return { col, dir: "asc" };
      return null;
    });
  }, []);
  const sortIndicator = (col: SortableCol) =>
    columnSort?.col === col ? (columnSort.dir === "desc" ? " ▼" : " ▲") : "";

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
    const defaultSorted = [...filtered].sort((a, b) => {
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

    // Column sort (header click) — overrides default order; nulls/empty always last
    if (!columnSort) return defaultSorted;
    const { col, dir } = columnSort;
    const mul = dir === "desc" ? -1 : 1;
    const getVal = (l: Loan): { v: number | string; isNull: boolean } => {
      switch (col) {
        case "borrowerName":
          return { v: (l.borrowerName || "").toLowerCase(), isNull: !l.borrowerName };
        case "category":
          return { v: getLoanCategory(l, payments, installmentSchedules), isNull: false };
        case "amount": {
          // Ordena pelo valor da parcela do contrato (suporta parcelamento irregular)
          if (l.installments > 1) {
            const loanSchedules = installmentSchedules
              .filter((s) => s.loanId === l.id)
              .sort((a, b) => a.installmentNumber - b.installmentNumber);
            // 1) próxima parcela pendente (paidInstallments + 1)
            let target = loanSchedules.find((s) => s.installmentNumber === l.paidInstallments + 1);
            // 2) primeira parcela ainda não paga (cobre gaps em cronogramas irregulares)
            if (!target) target = loanSchedules.find((s) => s.installmentNumber > l.paidInstallments);
            // 3) contrato quitado: usa a última parcela do cronograma
            if (!target && loanSchedules.length > 0) target = loanSchedules[loanSchedules.length - 1];
            if (target) return { v: Number(target.amount) || 0, isNull: false };
            // 4) sem cronograma: valor personalizado ou média (último recurso)
            if (l.customInstallmentValue && l.customInstallmentValue > 0)
              return { v: l.customInstallmentValue, isNull: false };
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            return { v: total / l.installments, isNull: false };
          }
          const base = (l.remainingAmount && l.remainingAmount > 0) ? l.remainingAmount : l.amount;
          return { v: Number(base) || 0, isNull: l.amount == null };
        }
        case "remaining": {
          if (l.status === "paid") return { v: getTotalPaid(l, payments), isNull: false };
          // Ordena pelo restante da parcela atual (não pelo saldo total do contrato)
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = Number(l.renegotiationPenaltyTotal || 0);
          if (l.installments > 1) {
            const loanSchedules = installmentSchedules
              .filter((s) => s.loanId === l.id)
              .sort((a, b) => a.installmentNumber - b.installmentNumber);
            const nextSchedule =
              loanSchedules.find((s) => s.installmentNumber === l.paidInstallments + 1) ||
              loanSchedules.find((s) => s.installmentNumber > l.paidInstallments);
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
            const allUnpaidSum = loanSchedules
              .filter((s) => s.installmentNumber > l.paidInstallments)
              .reduce((sum, s) => sum + s.amount, 0);
            const expectedRemaining = nextSchedule ? allUnpaidSum : fullInstallment * remainingInstallments;
            const partialPaidOnCurrent = Math.max(0, expectedRemaining - actualRemaining);
            const currentInstallmentRemaining = Math.max(0, fullInstallment - partialPaidOnCurrent);
            return { v: currentInstallmentRemaining + fees.lateFees + renegPenalty, isNull: false };
          }
          const base = getBaseRemainingAmount(l, payments, installmentSchedules);
          return { v: base + fees.lateFees + renegPenalty, isNull: false };
        }
        case "installments":
          return { v: Number(l.installments) || 0, isNull: false };
        case "dueDate": {
          const t = getFirstPendingDate(l, installmentSchedules).getTime();
          return { v: t, isNull: !isFinite(t) || isNaN(t) };
        }
        case "tags": {
          const t = (l.tags && l.tags[0]) || "";
          return { v: t.toLowerCase(), isNull: !t };
        }
      }
    };
    return [...defaultSorted].sort((a, b) => {
      const va = getVal(a); const vb = getVal(b);
      if (va.isNull && vb.isNull) return 0;
      if (va.isNull) return 1;
      if (vb.isNull) return -1;
      if (typeof va.v === "number" && typeof vb.v === "number") return (va.v - vb.v) * mul;
      return String(va.v).localeCompare(String(vb.v)) * mul;
    });
  }, [loans, payments, installmentSchedules, search, category, selectedCategories, isMultiSelect, dateFrom, dateTo, dueDateFrom, dueDateTo, amountMin, amountMax, tagFilter, notesFilter, sortBy, dueDateQuick, view, columnSort]);

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
    let totalReceivable = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let onTrackCount = 0;
    let totalReceivableCount = 0;
    for (const l of loans) {
      if (l.status === "paid") continue;
      const cat = getLoanCategory(l, payments, installmentSchedules);
      const receivable = getLoanReceivable(l, payments, installmentSchedules);
      totalReceivable += receivable;
      totalReceivableCount += 1;
      if (cat === "overdue") {
        overdue += getOverdueAmount(l, installmentSchedules, today);
        overdueCount += 1;
        continue;
      }
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
      total: totalReceivable,
      overdueCount, dueTodayCount, onTrackCount,
      totalCount: totalReceivableCount,
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
      <LoanListSummaryCards
        statusSummary={statusSummary}
        selectedCategories={selectedCategories}
        applyCardFilter={applyCardFilter}
        formatCurrency={formatCurrency}
      />


      {/* Filtros rápidos: grid em mobile, linha única ocupando toda a largura em tablet/desktop */}
      <LoanCategoryChips
        selectedCategories={selectedCategories}
        counts={counts}
        onCategoryClick={handleCategoryClick}
      />


      <div className="flex items-center gap-2 flex-wrap">
        <LoanSearchBar
          search={search}
          setSearch={setSearch}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          hasActiveFilters={Boolean(dateFrom || dateTo || dueDateFrom || dueDateTo || amountMin || amountMax || tagFilter || notesFilter !== "all")}
        />

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
            <LoanQuickDateFilters dueDateQuick={dueDateQuick} setDueDateQuick={setDueDateQuick} />
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
        <LoanAdvancedFilters
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          dueDateFrom={dueDateFrom} setDueDateFrom={setDueDateFrom}
          dueDateTo={dueDateTo} setDueDateTo={setDueDateTo}
          amountMin={amountMin} setAmountMin={setAmountMin}
          amountMax={amountMax} setAmountMax={setAmountMax}
          tagFilter={tagFilter} setTagFilter={setTagFilter}
          allTags={allTags}
          sortBy={sortBy} setSortBy={setSortBy}
          notesFilter={notesFilter} setNotesFilter={setNotesFilter}
        />
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
            <LoanListMobileCards
              loans={categorized}
              allLoans={loans}
              payments={payments}
              installmentSchedules={installmentSchedules}
              renegotiationsByLoan={renegotiationsByLoan}
              clients={clients}
              readOnly={readOnly}
              onPayment={onPayment}
              onPartialPayment={onPartialPayment}
              onFullPayment={onFullPayment}
              onInterestPayment={onInterestPayment}
              onAmortize={onAmortize}
              onRenegotiate={onRenegotiate}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDeletePayment={onDeletePayment}
              onSaveSchedule={onSaveSchedule}
            />

          ) : view === "folders" ? (
            <>
            <div className="space-y-4">
              {grouped.map((g) => (
                <ClientFolder key={g.name} group={g} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} clients={clients} renegotiations={allRenegotiations} commissionTotalByLoan={commissionTotalByLoan}
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
            <LoanListTable
              categorized={categorized}
              loans={loans}
              payments={payments}
              installmentSchedules={installmentSchedules}
              category={category}
              totalToReceive={summaryData.totalToReceive}
              readOnly={readOnly}
              clients={clients}
              renegotiationsByLoan={renegotiationsByLoan}
              commissionTotalByLoan={commissionTotalByLoan}
              cycleColumnSort={cycleColumnSort}
              sortIndicator={sortIndicator}
              onPayment={onPayment}
              onPartialPayment={onPartialPayment}
              onFullPayment={onFullPayment}
              onInterestPayment={onInterestPayment}
              onAmortize={onAmortize}
              onRenegotiate={onRenegotiate}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onDeletePayment={onDeletePayment}
              onSaveSchedule={onSaveSchedule}
            />
          )}
        </div>
      )}
    </div>
  );
}
