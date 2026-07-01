/**
 * Deriva a janela ISO (`YYYY-MM-DD`) usada pelo Dashboard para consumir
 * `useExpenses({ startDate, endDate })`.
 *
 * O Dashboard filtra despesas por `paidDate` dentro do range corrente,
 * mas o hook `useExpenses` filtra pelo `due_date`. Para não perder
 * despesas com `due_date` anterior ao período porém `paid_date` dentro
 * dele, ampliamos `startDate` em 12 meses. Ajustes futuros mudam apenas
 * a constante `LOOKBACK_MONTHS`.
 */
export const LOOKBACK_MONTHS = 12;

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getExpensesPeriodForRange(range: { start: Date; end: Date }): {
  startDate: string;
  endDate: string;
} {
  const lookback = new Date(range.start.getFullYear(), range.start.getMonth() - LOOKBACK_MONTHS, range.start.getDate());
  return {
    startDate: toIsoDate(lookback),
    endDate: toIsoDate(range.end),
  };
}
