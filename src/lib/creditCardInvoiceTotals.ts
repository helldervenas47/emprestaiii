import type { Expense } from "@/types/loan";
import type { CreditCard } from "@/hooks/useCreditCards";
import type { InvoiceOpening } from "@/hooks/useCreditCardOpenings";
import { expandCreditCardExpenses } from "@/lib/creditCardInstallments";

/** Detecta se a despesa foi feita no cartão de crédito (tag inserida pelo form/edição). */
export function isCreditCardExpense(e: Pick<Expense, "notes">): boolean {
  return /\[\s*cr[eé]dito\s*\]/i.test(e?.notes ?? "");
}

/** Lê uma override manual do "Valor pago da fatura" gravada em opening.notes como [PAID:1234.56]. */
export function readPaidOverride(notes: string | null | undefined): number | null {
  const m = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(notes ?? "");
  return m ? Number(m[1]) : null;
}

/** Atualiza o trecho [PAID:xxx] dentro de um notes existente. Passe null para remover. */
export function writePaidOverride(notes: string | null | undefined, value: number | null): string {
  const base = (notes ?? "").replace(/\s*\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "").trim();
  if (value === null || !Number.isFinite(value)) return base;
  return base ? `${base} [PAID:${value.toFixed(2)}]` : `[PAID:${value.toFixed(2)}]`;
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
  /** Total atual da fatura (compras do ciclo + saldo inicial). */
  total: number;
  /** True se a fatura do ciclo está totalmente paga. */
  paid: boolean;
  /** Valor efetivamente pago (soma dos amounts pagos do ciclo, ou override). */
  paidTotal: number;
  /** True quando o usuário definiu manualmente o valor pago via [PAID:xxx]. */
  hasPaidOverride: boolean;
}

/**
 * Para um mês YYYY-MM, calcula o total de cada fatura (uma por cartão) cujo
 * vencimento cai dentro desse mês. Inclui status de pagamento e valor pago.
 */
export function getCardInvoiceTotalsForMonth(
  expenses: Expense[],
  cards: CreditCard[],
  openings: InvoiceOpening[],
  yyyymm: string,
): CardInvoiceMonthTotal[] {
  // Lazy import substituído por import estático no topo do arquivo.
  const expanded = expandCreditCardExpenses(expenses);
  const result: CardInvoiceMonthTotal[] = [];
  for (const card of cards) {
    if (card.active === false) continue;
    const cycle = getCycleForDueMonth(yyyymm, card.closingDay, card.dueDay);
    if (!cycle) continue;

    const cardTag = (card.nickname || card.lastFour || "").toLowerCase();
    const items = expanded.filter((e) => {
      if (!isCreditCardExpense(e)) return false;
      if (cardTag) {
        const n = (e.notes ?? "").toLowerCase();
        if (n.includes(cardTag)) {
          // continue
        } else if (/cart[aã]o[:\s]/i.test(n)) {
          return false;
        }
      }
      const due = new Date(e.dueDate + "T00:00:00");
      return due >= cycle.from && due <= cycle.to;
    });

    const installmentValue = (e: Expense) => {
      const isRec = e.type === "recorrente" && !!e.installments && e.installments > 1;
      return isRec ? e.amount / e.installments! : e.amount;
    };
    const itemsTotal = items.reduce((s, e) => s + installmentValue(e), 0);

    const cycleKey = cycleKeyFromDate(cycle.to);
    const opening = openings.find((o) => o.cardId === card.id && o.cycleKey === cycleKey);
    const openingAmount = opening?.openingAmount ?? 0;
    const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");

    const total = itemsTotal + openingAmount;

    // Mesmo critério usado no CreditCardInvoice.tsx para "fatura paga":
    // - houve algum lançamento ou saldo inicial em algum momento
    // - e nada está pendente (nenhum item sem pagar e nenhum opening com saldo).
    const cycleHasPending = items.some((e) => !e.paid) || openingAmount > 0;
    const cycleEverHadValue = items.length > 0 || openingAmount > 0 || openingPaidFlag;
    const paid = cycleEverHadValue && !cycleHasPending;

    // Valor efetivamente pago = soma dos lançamentos pagos do ciclo
    // (reflete ajustes/edições). O opening, quando pago, foi zerado e marcado [PAGA],
    // por isso não somamos seu valor original (que se perdeu) — o que importa é
    // o fluxo real de saída registrado nos itens.
    // Override manual em opening.notes ([PAID:xxx]) tem precedência.
    const itemsPaidTotal = items.filter((e) => e.paid).reduce((s, e) => s + installmentValue(e), 0);
    const override = readPaidOverride(opening?.notes);
    const paidTotal = override ?? itemsPaidTotal;

    if (total > 0 || (paid && paidTotal > 0) || override !== null) {
      result.push({ card, total, paid, paidTotal, hasPaidOverride: override !== null });
    }
  }
  return result;
}

/** Categoria virtual usada para agregar faturas de cartão no resumo. */
export const CREDIT_CARD_INVOICE_CATEGORY = "Cartão de Crédito";
