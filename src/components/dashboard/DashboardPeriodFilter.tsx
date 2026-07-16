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
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <h2 className="text-lg md:text-xl font-semibold text-foreground leading-tight">Visão Geral</h2>
      <div className="flex items-center justify-between gap-2 flex-nowrap md:justify-start md:gap-3">
        <div className="flex items-center gap-1 md:gap-2 md:order-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={onPrev}
            aria-label="Período anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={onReset}
            title="Voltar para o período atual"
            className="h-9 min-w-[110px] md:min-w-[180px] px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium text-foreground text-center hover:text-primary hover:bg-accent/40 transition-colors tabular-nums"
          >
            {rangeLabel}
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg"
            onClick={onNext}
            aria-label="Próximo período"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 h-9 w-[170px] md:w-[210px] shrink-0 rounded-lg bg-muted/60 p-0.5 border border-border/30 backdrop-blur-sm md:order-2">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => onChangePeriod(p)}
              className={`h-full rounded-md text-xs md:text-sm font-medium transition-all duration-200 ${
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
