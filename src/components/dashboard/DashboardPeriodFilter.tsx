import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Period, periodLabels } from "@/components/dashboard/dashboardHelpers";

interface Props {
  rangeLabel: string;
  period: Period;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onChangePeriod: (p: Period) => void;
}

export function DashboardPeriodFilter({ rangeLabel, period, onPrev, onNext, onReset, onChangePeriod }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">Visão Geral</h2>
      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span
            className="text-xs sm:text-sm font-medium text-foreground min-w-[120px] sm:min-w-[160px] text-center cursor-pointer hover:text-primary transition-colors"
            onClick={onReset}
          >
            {rangeLabel}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex bg-muted/60 rounded-xl p-0.5 ml-auto backdrop-blur-sm border border-border/30">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => onChangePeriod(p)}
              className={`px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-200 ${
                period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
