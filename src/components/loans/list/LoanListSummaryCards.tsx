import { AlertTriangle, Clock, CheckCircle, DollarSign } from "lucide-react";
import type { Category } from "./types";

export interface LoanStatusSummary {
  overdue: number;
  dueToday: number;
  onTrack: number;
  total: number;
  overdueCount: number;
  dueTodayCount: number;
  onTrackCount: number;
  totalCount: number;
}

interface Props {
  statusSummary: LoanStatusSummary;
  selectedCategories: Category[];
  applyCardFilter: (cardId: "overdue" | "due_today" | "on_track" | "all") => void;
  formatCurrency: (value: number) => string;
}

export function LoanListSummaryCards({
  statusSummary,
  selectedCategories,
  applyCardFilter,
  formatCurrency,
}: Props) {
  const cards = [
    { id: "overdue" as Category, label: "Vencidos", value: statusSummary.overdue, count: statusSummary.overdueCount, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/40", delay: "0ms" },
    { id: "due_today" as Category, label: "Vence Hoje", value: statusSummary.dueToday, count: statusSummary.dueTodayCount, icon: Clock, color: "text-warning", bg: "bg-warning/10", ring: "ring-warning/40", delay: "80ms" },
    { id: "on_track" as Category, label: "No Prazo", value: statusSummary.onTrack, count: statusSummary.onTrackCount, icon: CheckCircle, color: "text-primary", bg: "bg-primary/10", ring: "ring-primary/40", delay: "160ms" },
    { id: "all" as Category, label: "Total a Receber", value: statusSummary.total, count: statusSummary.totalCount, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-500/10", ring: "ring-blue-500/40", delay: "240ms" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {cards.map((c) => {
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
  );
}
