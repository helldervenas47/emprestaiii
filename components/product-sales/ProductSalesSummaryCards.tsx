import { AlertTriangle, Clock, CircleCheck, DollarSign } from "lucide-react";
import { SummaryBreakdownCard } from "./productSalesTypes";

interface Props {
  hideOnTrackCard?: boolean;
  formatCurrency: (v: number) => string;
  totalOverdue: number;
  totalOnTrack: number;
  totalDueToday: number;
  totalPaid: number;
  totalAReceber: number;
  overdueCount: number;
  onTrackCount: number;
  dueTodayCount: number;
  paidContractsCount: number;
  onSelect: (card: SummaryBreakdownCard) => void;
}

export function ProductSalesSummaryCards({
  hideOnTrackCard = false,
  formatCurrency,
  totalOverdue,
  totalOnTrack,
  totalDueToday,
  totalPaid,
  totalAReceber,
  overdueCount,
  onTrackCount,
  dueTodayCount,
  paidContractsCount,
  onSelect,
}: Props) {
  return (
    <div className={`grid ${hideOnTrackCard ? "grid-cols-3" : "grid-cols-2 lg:grid-cols-4"} gap-2 sm:gap-3`}>
      <button
        type="button"
        onClick={() => onSelect("overdue")}
        className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center hover:border-destructive/40 hover:shadow-md transition-all cursor-pointer"
        style={{ animationDelay: "0ms", animationFillMode: "backwards" }}
      >
        <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Vencidos</p>
        <p className="text-sm sm:text-xl font-bold text-destructive mt-0.5">{formatCurrency(totalOverdue)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{overdueCount} contratos</p>
      </button>
      {!hideOnTrackCard && (
        <button
          type="button"
          onClick={() => onSelect("ontrack")}
          className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
          style={{ animationDelay: "80ms", animationFillMode: "backwards" }}
        >
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <Clock className="h-4 w-4 text-primary" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">No Prazo</p>
          <p className="text-sm sm:text-xl font-bold text-primary mt-0.5">{formatCurrency(totalOnTrack + totalDueToday)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{onTrackCount + dueTodayCount} contratos</p>
        </button>
      )}
      <button
        type="button"
        onClick={() => onSelect("paid")}
        className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center hover:border-success/40 hover:shadow-md transition-all cursor-pointer"
        style={{ animationDelay: "160ms", animationFillMode: "backwards" }}
      >
        <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center mb-2">
          <CircleCheck className="h-4 w-4 text-success" />
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Pagos</p>
        <p className="text-sm sm:text-xl font-bold text-success mt-0.5">{formatCurrency(totalPaid)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{paidContractsCount} contratos quitados</p>
      </button>
      <button
        type="button"
        onClick={() => onSelect("receivable")}
        className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center hover:border-warning/40 hover:shadow-md transition-all cursor-pointer"
        style={{ animationDelay: "240ms", animationFillMode: "backwards" }}
      >
        <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center mb-2">
          <DollarSign className="h-4 w-4 text-warning" />
        </div>
        <p className="text-[10px] sm:text-xs text-muted-foreground">Total a Receber</p>
        <p className="text-sm sm:text-xl font-bold text-warning mt-0.5">{formatCurrency(totalAReceber)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">{overdueCount + onTrackCount + dueTodayCount} contratos</p>
      </button>
    </div>
  );
}
