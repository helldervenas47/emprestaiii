// Auto-extracted from LoanList.tsx — desktop table block.
// Keeps behavior and layout unchanged.
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule, Client, PaymentSplit } from "@/types/loan";
import type { LoanRenegotiation } from "@/types/loan";
import type { Category } from "@/components/loans/list/types";
import { rawFormatCurrency } from "@/components/loans/list/formatting";
import { LoanRowView } from "@/components/loans/list/LoanListRow";

type SortKey =
  | "borrowerName"
  | "category"
  | "amount"
  | "remaining"
  | "installments"
  | "dueDate"
  | "tags";

export interface LoanListTableProps {
  categorized: Loan[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  category: Category;
  totalToReceive: number;
  readOnly?: boolean;
  clients?: Client[];
  renegotiationsByLoan: Map<string, LoanRenegotiation[]>;
  commissionTotalByLoan: Map<string, number>;
  cycleColumnSort: (key: SortKey) => void;
  sortIndicator: (key: SortKey) => React.ReactNode;
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
}

export function LoanListTable({
  categorized,
  loans,
  payments,
  installmentSchedules,
  category,
  totalToReceive,
  readOnly = false,
  clients = [],
  renegotiationsByLoan,
  commissionTotalByLoan,
  cycleColumnSort,
  sortIndicator,
  onPayment,
  onPartialPayment,
  onFullPayment,
  onInterestPayment,
  onAmortize,
  onRenegotiate,
  onUpdate,
  onDelete,
  onDeletePayment,
  onSaveSchedule,
}: LoanListTableProps) {
  const { mask } = useHideValues();
  return (
    <div className="rounded-2xl border border-border/30 overflow-hidden shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)]">
      <div className="px-4 py-2 flex items-center justify-between border-b border-border/30 bg-muted/30">
        <span className="text-sm text-muted-foreground">{categorized.length} empréstimos</span>
        <span className={`text-sm font-semibold ${category === "paid" ? "text-success" : "text-destructive"}`}>{mask(rawFormatCurrency(totalToReceive))}</span>
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
            <th onClick={() => cycleColumnSort("borrowerName")} className="px-1.5 sm:px-2 lg:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">Cliente{sortIndicator("borrowerName")}</th>
            <th onClick={() => cycleColumnSort("category")} className="hidden lg:table-cell px-1.5 sm:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">Status{sortIndicator("category")}</th>
            <th onClick={() => cycleColumnSort("amount")} className="hidden sm:table-cell px-2 lg:px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">Emprestado{sortIndicator("amount")}</th>
            <th onClick={() => cycleColumnSort("remaining")} className="px-1.5 sm:px-2 lg:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">{category === "paid" ? "Pago" : "Restante"}{sortIndicator("remaining")}</th>
            <th onClick={() => cycleColumnSort("installments")} className="hidden sm:table-cell px-2 lg:px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">Parcelas{sortIndicator("installments")}</th>
            <th onClick={() => cycleColumnSort("dueDate")} className="px-1.5 sm:px-2 lg:px-4 py-2.5 text-left text-[10px] sm:text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">Venc.{sortIndicator("dueDate")}</th>
            <th onClick={() => cycleColumnSort("tags")} className="hidden sm:table-cell px-2 lg:px-4 py-2.5 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">Etiquetas{sortIndicator("tags")}</th>
            <th className="hidden lg:table-cell px-4 py-2.5 text-right text-xs font-medium text-muted-foreground"></th>
          </tr>
        </thead>
        <tbody>
          {categorized.map((loan) => (
            <LoanRowView key={loan.id} loan={loan} payments={payments} installmentSchedules={installmentSchedules} readOnly={readOnly} existingTags={loans.flatMap(l => l.tags || []).filter((v, i, a) => a.indexOf(v) === i)} clients={clients} renegotiations={renegotiationsByLoan.get(loan.id) || []} managerCommissionTotal={commissionTotalByLoan.get(loan.id) || 0}
              onPayment={(date, mid, split) => onPayment(loan.id, date, mid, split)} onPartialPayment={(amt, date, mid, split) => onPartialPayment(loan.id, amt, date, mid, split)} onFullPayment={onFullPayment ? (date, custom, mid, split) => onFullPayment(loan.id, date, custom, mid, split) : undefined}
              onInterestPayment={(date, custom, fees, mid, split, opts) => onInterestPayment(loan.id, date, custom, fees, mid, split, opts)} onAmortize={onAmortize ? (amt, date, mid, split) => onAmortize(loan.id, amt, date, mid, split) : undefined} onRenegotiate={onRenegotiate ? (params) => onRenegotiate(loan.id, params) : undefined} onUpdate={(d) => onUpdate(loan.id, d)} onDelete={() => onDelete(loan.id)} onDeletePayment={onDeletePayment} onSaveSchedule={onSaveSchedule} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
