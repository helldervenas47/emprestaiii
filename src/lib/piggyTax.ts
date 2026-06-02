// Helpers de imposto e cálculo segmentado de rendimento de cofrinhos.
// IR regressivo brasileiro para renda fixa:
//   ≤ 180 dias  → 22,5%
//   181–360 d   → 20,0%
//   361–720 d   → 17,5%
//   > 720 dias  → 15,0%

export function irRate(days: number): number {
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.20;
  if (days <= 720) return 0.175;
  return 0.15;
}

export interface RatePeriod {
  /** YYYY-MM-DD inclusivo */
  effectiveFrom: string;
  /** taxa anual em % (ex.: 11.15 = 11,15% a.a.) */
  annualRate: number;
}

const MS_DAY = 86_400_000;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Calcula o valor futuro de um aporte aplicando taxas diferentes em janelas
 * sucessivas. `periods` deve estar ordenado por effectiveFrom asc; a primeira
 * vale para qualquer data anterior à sua effectiveFrom também (fallback).
 */
export function compoundWithSegments(
  amount: number,
  depositDate: Date,
  asOf: Date,
  periods: RatePeriod[],
): number {
  if (amount <= 0) return amount;
  if (!periods.length) return amount;

  const sorted = [...periods].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );

  // Lista de marcos: [depositDate, ...effectiveFrom > deposit, asOf]
  const markers: Date[] = [depositDate];
  for (const p of sorted) {
    const pd = parseYmd(p.effectiveFrom);
    if (pd > depositDate && pd < asOf) markers.push(pd);
  }
  markers.push(asOf);

  let value = amount;
  for (let i = 0; i < markers.length - 1; i++) {
    const from = markers[i];
    const to = markers[i + 1];
    const days = Math.max(0, Math.floor((to.getTime() - from.getTime()) / MS_DAY));
    if (days === 0) continue;
    // Acha a taxa vigente em `from`
    let rate = sorted[0].annualRate;
    for (const p of sorted) {
      if (parseYmd(p.effectiveFrom) <= from) rate = p.annualRate;
    }
    const factor = Math.pow(1 + rate / 100, days / 365);
    value = value * factor;
  }
  return value;
}

export interface PiggyDeposit {
  amount: number;
  depositDate: string;
}

export interface PiggyDetailed {
  principal: number;
  balance: number;
  gross: number;
  tax: number;
  net: number;
  /** Saldo líquido projetado no último dia do mês de referência */
  projectionNetEom: number;
  /** Saldo líquido hoje (= principal + net) */
  currentNet: number;
  /** Taxa CDI atualmente vigente (último período) em % a.a. */
  currentRate: number;
}

/**
 * Cálculo detalhado para a UI. `asOf` = hoje; `eom` = fim do mês.
 */
export function computePiggyDetailed(
  deposits: PiggyDeposit[],
  periods: RatePeriod[],
  asOf: Date = new Date(),
): PiggyDetailed {
  const eom = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0);
  let principal = 0;
  let balance = 0;
  let projectedBalance = 0;
  let weightedDays = 0;
  let weightedBase = 0;

  for (const d of deposits) {
    const dep = parseYmd(d.depositDate);
    principal += d.amount;
    if (d.amount >= 0) {
      const fvNow = compoundWithSegments(d.amount, dep, asOf, periods);
      const fvEom = compoundWithSegments(d.amount, dep, eom, periods);
      balance += fvNow;
      projectedBalance += fvEom;
      const days = Math.max(0, Math.floor((asOf.getTime() - dep.getTime()) / MS_DAY));
      weightedDays += d.amount * days;
      weightedBase += d.amount;
    } else {
      balance += d.amount;
      projectedBalance += d.amount;
    }
  }

  const gross = balance - principal;
  const grossEom = projectedBalance - principal;
  const avgDays = weightedBase > 0 ? weightedDays / weightedBase : 0;
  const ir = irRate(Math.round(avgDays));
  const tax = gross > 0 ? gross * ir : 0;
  const taxEom = grossEom > 0 ? grossEom * ir : 0;
  const net = gross - tax;
  const projectionNetEom = grossEom - taxEom;

  const currentRate = periods.length
    ? [...periods].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0].annualRate
    : 0;

  return {
    principal,
    balance,
    gross,
    tax,
    net,
    projectionNetEom,
    currentNet: principal + net,
    currentRate,
  };
}
