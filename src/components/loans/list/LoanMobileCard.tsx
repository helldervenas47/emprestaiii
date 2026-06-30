// Auto-extracted from LoanList.tsx — row component (LoanRowView).
// Keeps behavior, layout, and public name unchanged.
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
import { PaymentHistoryItem } from "@/components/loans/list/PaymentHistoryItem";


export HEAD
sed -n '180,2546p' src/components/LoanList.tsx >> src/components/loans/list/LoanMobileCard.tsx
wc -l src/components/loans/list/LoanMobileCard.tsx
tail -3 src/components/loans/list/LoanMobileCard.tsx
