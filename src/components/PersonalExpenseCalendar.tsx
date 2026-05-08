import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CalendarDays, Receipt, Wallet } from "lucide-react";
import type { Expense } from "@/types/loan";

interface Props {
  expenses: Expense[];
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const compactCurrency = (v: number) => {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `R$ ${Math.round(v)}`;
};

/**
 * Calendário de gastos pessoais.
 * Mostra o total gasto por dia e, ao clicar, lista as despesas daquele dia.
 * O total considera a data efetiva de gasto: paidDate quando pago, senão dueDate.
 */
const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export function PersonalExpenseCalendar({ expenses }: Props) {
  const today = new Date();
  const todayStr = formatLocalDate(today);

  const [expanded, setExpanded] = useState(false); // Recolhido por padrão
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr);

  // Mapa: dateStr -> { items, total }
  const dayMap = useMemo(() => {
    const map: Record<string, { items: Expense[]; total: number }> = {};
    for (const e of expenses) {
      const dateStr = e.paid && e.paidDate ? e.paidDate : e.dueDate;
      if (!dateStr) continue;
      // For recurring parcelled expenses, e.amount is the TOTAL across all installments.
      // The calendar should reflect just the upcoming installment value on the due date.
      const isRecurringParent =
        e.type === "recorrente" && (e.installments ?? 0) > 1;
      const amount = isRecurringParent
        ? (Number(e.amount) || 0) / (e.installments as number)
        : Number(e.amount) || 0;
      const item = isRecurringParent ? { ...e, amount } : e;
      if (!map[dateStr]) map[dateStr] = { items: [], total: 0 };
      map[dateStr].items.push(item);
      map[dateStr].total += amount;
    }
    return map;
  }, [expenses]);

  // Dias do mês selecionado
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [year, month]);

  // Semana atual (visão compacta quando recolhido)
  const weekDays = useMemo(() => {
    const base = new Date();
    const dow = base.getDay();
    const start = new Date(base);
    start.setDate(base.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);

  const monthTotal = useMemo(() => {
    let sum = 0;
    Object.entries(dayMap).forEach(([date, info]) => {
      const [y, m] = date.split("-").map(Number);
      if (y === year && m === month + 1) sum += info.total;
    });
    return sum;
  }, [dayMap, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };
  const goToToday = () => {
    const n = new Date();
    setMonth(n.getMonth());
    setYear(n.getFullYear());
    setSelectedDate(formatLocalDate(n));
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  };

  const handleWeekDayClick = (d: Date) => {
    const dateStr = formatLocalDate(d);
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const selectedItems = selectedDate ? (dayMap[selectedDate]?.items ?? []) : [];
  const selectedTotal = selectedDate ? (dayMap[selectedDate]?.total ?? 0) : 0;

  // Maior gasto do mês visível (para destacar)
  const maxDayTotal = useMemo(() => {
    let max = 0;
    calendarDays.forEach((day) => {
      if (day === null) return;
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const t = dayMap[ds]?.total ?? 0;
      if (t > max) max = t;
    });
    return max;
  }, [calendarDays, dayMap, year, month]);

  return (
    <Card no3d className="animate-fade-in">
      <CardContent className="p-4">
        {/* Header com toggle */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">
              Calendário de Gastos
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · {monthNames[month]} {year}: <span className="font-semibold text-foreground">{formatCurrency(monthTotal)}</span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 gap-1 text-xs"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" /> Recolher
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" /> Expandir
              </>
            )}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          {/* Lado esquerdo: calendário (mensal expandido OU semana compacta) */}
          <div>
            {expanded ? (
              <>
                {/* Navegação de mês */}
                <div className="flex items-center justify-between mb-3">
                  <Button variant="ghost" size="icon" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <button
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    onClick={goToToday}
                  >
                    {monthNames[month]} {year}
                  </button>
                  <Button variant="ghost" size="icon" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Cabeçalho dias */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>

                {/* Grid de dias */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const info = dayMap[dateStr];
                    const total = info?.total ?? 0;
                    const has = total > 0;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const isHigh = has && maxDayTotal > 0 && total >= maxDayTotal * 0.66;

                    return (
                      <button
                        key={day}
                        onClick={() => handleDayClick(day)}
                        className={`relative flex flex-col items-center justify-start rounded-lg p-1 min-h-[52px] text-xs transition-colors
                          ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary" : ""}
                          ${isToday && !isSelected ? "bg-accent font-bold" : ""}
                          ${has && !isSelected ? (isHigh ? "bg-destructive/10" : "bg-warning/10") : ""}
                          ${!isSelected && !isToday && !has ? "hover:bg-muted" : ""}
                        `}
                      >
                        <span className={isSelected ? "text-primary-foreground" : "text-foreground"}>
                          {day}
                        </span>
                        {has && (
                          <span className={`mt-0.5 text-[9px] sm:text-[10px] font-semibold leading-tight tabular-nums truncate max-w-full px-0.5 ${
                            isSelected ? "text-primary-foreground" : isHigh ? "text-destructive" : "text-warning"
                          }`}>
                            {compactCurrency(total)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legenda */}
                <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-warning" /> Com gasto
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-destructive" /> Gasto alto
                  </div>
                  <div className="ml-auto">
                    Total mês: <span className="font-semibold text-foreground">{formatCurrency(monthTotal)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Visão compacta: semana atual */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground">Semana atual</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToToday}>Hoje</Button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((d) => {
                    const dateStr = formatLocalDate(d);
                    const info = dayMap[dateStr];
                    const total = info?.total ?? 0;
                    const has = total > 0;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleWeekDayClick(d)}
                        className={`flex flex-col items-center justify-center rounded-lg p-2 min-h-[64px] text-xs transition-colors
                          ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary" : ""}
                          ${isToday && !isSelected ? "bg-accent font-bold" : ""}
                          ${has && !isSelected && !isToday ? "bg-warning/10" : ""}
                          ${!isSelected && !isToday && !has ? "hover:bg-muted" : ""}
                        `}
                      >
                        <span className={`text-[10px] uppercase ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {dayNames[d.getDay()]}
                        </span>
                        <span className={`text-base font-semibold ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                          {d.getDate()}
                        </span>
                        {has && (
                          <span className={`text-[10px] font-semibold tabular-nums truncate max-w-full ${
                            isSelected ? "text-primary-foreground" : "text-warning"
                          }`}>
                            {compactCurrency(total)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Toque em <span className="font-medium text-foreground">Expandir</span> para ver o mês inteiro.
                </p>
              </>
            )}
          </div>

          {/* Lado direito: detalhes do dia selecionado */}
          <div className={`rounded-lg border border-border/50 bg-muted/20 p-3 min-h-[200px] ${expanded ? "" : "hidden md:block"}`}>
            {!selectedDate ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                <Receipt className="h-7 w-7 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">Selecione um dia para ver os gastos.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-foreground capitalize">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                    })}
                  </h4>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(selectedTotal)}</p>
                  </div>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-6">
                    <Wallet className="h-6 w-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhum gasto neste dia.</p>
                  </div>
                ) : (
                  <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                    {selectedItems
                      .slice()
                      .sort((a, b) => Number(b.amount) - Number(a.amount))
                      .map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center justify-between gap-2 rounded-md bg-card border border-border/40 px-2.5 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{e.description}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {e.category && <span className="truncate">{e.category}</span>}
                              <span
                                className={`px-1.5 rounded-full ${e.paid ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                              >
                                {e.paid ? "Pago" : "A pagar"}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs font-semibold text-foreground tabular-nums shrink-0">
                            {formatCurrency(Number(e.amount) || 0)}
                          </p>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
