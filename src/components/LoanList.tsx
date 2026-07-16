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
import { useLoanListController } from "@/components/loans/list/useLoanListController";



import { ClientFolder } from "@/components/loans/list/ClientFolder";


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

  const {
    formatCurrency,
    view, setView,
    search, setSearch,
    selectedCategories, handleCategoryClick, category,
    showFilters, setShowFilters,
    dueDateQuick, setDueDateQuick,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dueDateFrom, setDueDateFrom,
    dueDateTo, setDueDateTo,
    amountMin, setAmountMin,
    amountMax, setAmountMax,
    tagFilter, setTagFilter,
    notesFilter, setNotesFilter,
    sortBy, setSortBy,
    cycleColumnSort, sortIndicator,
    allTags, categorized, counts, summaryData, statusSummary,
    grouped,
    applyCardFilter,
  } = useLoanListController({
    loans,
    payments,
    installmentSchedules,
    initialCategory,
    initialView,
  });

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
