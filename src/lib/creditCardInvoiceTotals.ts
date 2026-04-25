import type { Expense } from "@/types/loan";
import type { CreditCard } from "@/hooks/useCreditCards";
import type { InvoiceOpening } from "@/hooks/useCreditCardOpenings";

/** Detecta se a despesa foi feita no cartão de crédito (tag inserida pelo form/edição). */
export function isCreditCardExpense(e: Pick<Expense, "notes">): boolean {
  return /\[\s*cr[eé]dito\s*\]/i.test(e?.notes ?? "");
}

/** Reconstrói o ciclo (from, to, dueDate) ancorado em uma data de referência. */
function getCycleForRef(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const closingThis = new Date(y, m, Math.min(closingDay, new Date(y, m + 1, 0).getDate()));
  const closingNext =
    day > closingDay
      ? new Date(y, m + 1, Math.min(closingDay, new Date(y, m + 2, 0).getDate()))
      : closingThis;
  const closingPrev =
    day > closingDay
      ? closingThis
      : new Date(y, m - 1, Math.min(closingDay, new Date(y, m, 0).getDate()));
  const dueMonth = dueDay > closingDay ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(
    dueYear,
    dueMonth,
    Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate())
  );
  return { from: closingPrev, to: closingNext, dueDate };
}

/** Localiza o ciclo cujo vencimento cai no mês YYYY-MM informado (ou null se não houver). */
function getCycleForDueMonth(yyyymm: string, closingDay: number, dueDay: number) {
  const [ty, tm] = yyyymm.split("-").map(Number);
  for (let off = -36; off <= 36; off++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + off);
    const c = getCycleForRef(d, closingDay, dueDay);
    if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) {
      return c;
    }
  }
  return null;
}

function cycleKeyFromDate(closingTo: Date): string {
  return `${closingTo.getFullYear()}-${String(closingTo.getMonth() + 1).padStart(2, "0")}`;
}

export interface CardInvoiceMonthTotal {
  card: CreditCard;
  total: number;
}

/**
 * Para um mês YYYY-MM, calcula o total de cada fatura (uma por cartão) cujo
 * vencimento cai dentro desse mês. Total = compras do ciclo + saldo inicial do ciclo.
 */
export function getCardInvoiceTotalsForMonth(
  expenses: Expense[],
  cards: CreditCard[],
  openings: InvoiceOpening[],
  yyyymm: string,
): CardInvoiceMonthTotal[] {
  const result: CardInvoiceMonthTotal[] = [];
  for (const card of cards) {
    if (card.active === false) continue;
    const cycle = getCycleForDueMonth(yyyymm, card.closingDay, card.dueDay);
    if (!cycle) continue;

    const cardTag = (card.nickname || card.lastFour || "").toLowerCase();
    const items = expenses.filter((e) => {
      if (!isCreditCardExpense(e)) return false;
      // Só compras desse cartão (ou sem cartão identificável quando o card é único).
      if (cardTag) {
        const n = (e.notes ?? "").toLowerCase();
        if (n.includes(cardTag)) {
          // continue
        } else if (/cart[aã]o[:\s]/i.test(n)) {
          return false; // pertence a outro cartão
        }
      }
      // Pertence ao ciclo se a data de vencimento (dueDate) está entre from..to.
      const due = new Date(e.dueDate + "T00:00:00");
      return due >= cycle.from && due <= cycle.to;
    });

    const itemsTotal = items.reduce((s, e) => {
      const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
      return s + (isRec ? e.amount / e.installments! : e.amount);
    }, 0);

    const cycleKey = cycleKeyFromDate(cycle.to);
    const opening = openings.find((o) => o.cardId === card.id && o.cycleKey === cycleKey);
    const openingAmount = opening?.openingAmount ?? 0;

    const total = itemsTotal + openingAmount;
    if (total > 0) result.push({ card, total });
  }
  return result;
}

/** Categoria virtual usada para agregar faturas de cartão no resumo. */
export const CREDIT_CARD_INVOICE_CATEGORY = "Cartão de crédito";
