import { PeriodMode, PeriodSelection, labelForPeriod } from "@/lib/metasPeriod";
import { Calendar, CalendarDays, CalendarRange, CalendarClock } from "lucide-react";

interface Props {
  value: PeriodSelection;
  onChange: (sel: PeriodSelection) => void;
}

const MODES: { id: PeriodMode; label: string; Icon: any }[] = [
  { id: "month",    label: "Mensal",     Icon: Calendar },
  { id: "quarter",  label: "Trimestral", Icon: CalendarDays },
  { id: "semester", label: "Semestral",  Icon: CalendarRange },
  { id: "year",     label: "Anual",      Icon: CalendarClock },
];

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export function PeriodFilterCard({ value, onChange }: Props) {
  const setMode = (mode: PeriodMode) => {
    const now = new Date();
    const y = value.year;
    if (mode === "month") onChange({ mode, year: y, month: value.month ?? now.getMonth() + 1 });
    else if (mode === "quarter") onChange({ mode, year: y, quarter: value.quarter ?? (Math.floor(now.getMonth() / 3) + 1) as 1|2|3|4 });
    else if (mode === "semester") onChange({ mode, year: y, semester: value.semester ?? (now.getMonth() < 6 ? 1 : 2) });
    else onChange({ mode: "year", year: y });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2 h-full">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Filtro de Período</p>
        <span className="text-[10px] text-muted-foreground truncate max-w-[60%] text-right">{labelForPeriod(value)}</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {MODES.map(({ id, label, Icon }) => {
          const active = value.mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                active
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-seletor */}
      <div className="mt-1 flex flex-nowrap items-center justify-between gap-1">
        <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange({ ...value, year: value.year - 1 })}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
          aria-label="Ano anterior"
        >‹</button>
        <button
          type="button"
          onClick={() => onChange({ ...value, year: new Date().getFullYear() })}
          title="Voltar para o ano atual"
          className="text-xs font-bold tabular-nums min-w-[42px] text-center hover:text-primary transition-colors"
        >{value.year}</button>
        <button
          type="button"
          onClick={() => onChange({ ...value, year: value.year + 1 })}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
          aria-label="Próximo ano"
        >›</button>

        {value.mode === "month" && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const m = value.month ?? 1;
                if (m === 1) onChange({ ...value, year: value.year - 1, month: 12 });
                else onChange({ ...value, month: m - 1 });
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
              aria-label="Mês anterior"
            >‹</button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                onChange({ ...value, year: now.getFullYear(), month: now.getMonth() + 1 });
              }}
              title="Voltar para o mês atual"
              className="text-xs font-semibold tabular-nums min-w-[32px] text-center hover:text-primary transition-colors"
            >
              {MONTHS[(value.month ?? 1) - 1]}
            </button>
            <button
              type="button"
              onClick={() => {
                const m = value.month ?? 1;
                if (m === 12) onChange({ ...value, year: value.year + 1, month: 1 });
                else onChange({ ...value, month: m + 1 });
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
              aria-label="Próximo mês"
            >›</button>
          </div>
        )}
        {value.mode === "quarter" && (
          <div className="ml-auto flex gap-1">
            {[1,2,3,4].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onChange({ ...value, quarter: q as 1|2|3|4 })}
                className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${
                  value.quarter === q ? "bg-primary/10 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground"
                }`}
              >{q}º</button>
            ))}
          </div>
        )}
        {value.mode === "semester" && (
          <div className="ml-auto flex gap-1">
            {[1,2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...value, semester: s as 1|2 })}
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                  value.semester === s ? "bg-primary/10 border-primary/40 text-primary" : "bg-background border-border text-muted-foreground"
                }`}
              >{s}º Sem</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
