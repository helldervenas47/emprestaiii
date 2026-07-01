import { describe, it, expect } from "vitest";
import { getExpensesPeriodForRange, LOOKBACK_MONTHS } from "@/components/dashboard/dashboardExpensePeriod";

describe("getExpensesPeriodForRange", () => {
  it("retorna janela ISO com startDate ampliado em LOOKBACK_MONTHS meses e endDate igual ao fim do range", () => {
    const start = new Date(2026, 5, 1); // 01/jun/2026
    const end = new Date(2026, 5, 30, 23, 59, 59, 999);
    const period = getExpensesPeriodForRange({ start, end });
    expect(period.endDate).toBe("2026-06-30");
    expect(period.startDate).toBe(`2025-06-01`);
    expect(LOOKBACK_MONTHS).toBe(12);
  });

  it("produz janelas distintas para períodos distintos (cache por período)", () => {
    const rangeA = { start: new Date(2026, 0, 1), end: new Date(2026, 0, 31, 23, 59) };
    const rangeB = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59) };
    const a = getExpensesPeriodForRange(rangeA);
    const b = getExpensesPeriodForRange(rangeB);
    expect(a.startDate).not.toBe(b.startDate);
    expect(a.endDate).not.toBe(b.endDate);
    // Query key derivada (start,end) é a mesma que useExpenses usa
    const keyA = ["expenses", "owner", a.startDate, a.endDate, undefined];
    const keyB = ["expenses", "owner", b.startDate, b.endDate, undefined];
    expect(JSON.stringify(keyA)).not.toBe(JSON.stringify(keyB));
  });

  it("mantém consistência de mês bissexto/limite (dezembro -> ano anterior)", () => {
    const range = { start: new Date(2026, 11, 15), end: new Date(2026, 11, 31) };
    const p = getExpensesPeriodForRange(range);
    expect(p.startDate).toBe("2025-12-15");
    expect(p.endDate).toBe("2026-12-31");
  });
});
