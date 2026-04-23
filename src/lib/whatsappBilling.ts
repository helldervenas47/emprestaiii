import type { Client, Loan, InstallmentSchedule, Payment } from "@/types/loan";
import { getDueStatus, type DueStatus } from "@/lib/dueStatus";

export type BillingMessageStatus = "upcoming" | "due_today" | "overdue";

export interface WhatsappBillingMessages {
  message_upcoming: string;
  message_due_today: string;
  message_overdue: string;
}

export const DEFAULT_WHATSAPP_MESSAGES: WhatsappBillingMessages = {
  message_upcoming:
    "Olá {nome}, seu pagamento de {valor} vence em {data_vencimento}. Evite juros pagando antecipadamente.",
  message_due_today:
    "Olá {nome}, seu pagamento de {valor} vence hoje ({data_vencimento}). Por favor, regularize para evitar encargos.",
  message_overdue:
    "Olá {nome}, identificamos um pagamento de {valor} em atraso desde {data_vencimento}. Entre em contato para regularização.",
};

/** Pick the next relevant installment due date for a loan. */
export function getNextLoanDueDate(
  loan: Loan,
  schedules: InstallmentSchedule[] = [],
  payments: Payment[] = [],
): { dueDate: string; amount: number; status: DueStatus } {
  const loanSchedules = schedules
    .filter((s) => s.loanId === loan.id)
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  const paidNumbers = new Set(
    payments.filter((p) => p.loanId === loan.id && p.installmentNumber > 0).map((p) => p.installmentNumber),
  );

  // first unpaid scheduled installment
  const next = loanSchedules.find((s) => !paidNumbers.has(s.installmentNumber));
  if (next) {
    return {
      dueDate: next.dueDate,
      amount: Number(next.amount) || 0,
      status: getDueStatus(next.dueDate, false),
    };
  }
  return {
    dueDate: loan.dueDate,
    amount: Number(loan.remainingAmount ?? loan.amount) || 0,
    status: getDueStatus(loan.dueDate, loan.status === "paid"),
  };
}

export function dueStatusToBilling(s: DueStatus): BillingMessageStatus | null {
  if (s === "overdue") return "overdue";
  if (s === "due_today") return "due_today";
  if (s === "upcoming") return "upcoming";
  return null;
}

function formatBR(date: string | undefined | null): string {
  if (!date) return "";
  // expected format YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function applyMessageVariables(
  message: string,
  ctx: { name: string; amount: number; dueDate: string },
): string {
  return message
    .replace(/\{nome\}/g, ctx.name || "")
    .replace(/\{valor\}/g, formatBRL(ctx.amount))
    .replace(/\{data_vencimento\}/g, formatBR(ctx.dueDate));
}

export function pickMessage(messages: WhatsappBillingMessages, status: BillingMessageStatus): string {
  if (status === "overdue") return messages.message_overdue;
  if (status === "due_today") return messages.message_due_today;
  return messages.message_upcoming;
}

/** Normalize a phone number to digits, prefixing 55 (Brazil) when missing. */
export function normalizePhoneBR(raw: string | undefined | null): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

export function buildWhatsappLink(phone: string, message: string): string {
  const normalized = normalizePhoneBR(phone);
  const text = encodeURIComponent(message);
  if (!normalized) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${normalized}?text=${text}`;
}

export function buildBillingWhatsappLink(params: {
  client?: Client | null;
  loan: Loan;
  schedules?: InstallmentSchedule[];
  payments?: Payment[];
  messages: WhatsappBillingMessages;
}): { url: string; status: BillingMessageStatus | null; phone: string; message: string } {
  const { client, loan, schedules = [], payments = [], messages } = params;
  const next = getNextLoanDueDate(loan, schedules, payments);
  const billingStatus = dueStatusToBilling(next.status);
  const status: BillingMessageStatus = billingStatus ?? "upcoming";
  const template = pickMessage(messages, status);
  const message = applyMessageVariables(template, {
    name: client?.name || loan.borrowerName,
    amount: next.amount,
    dueDate: next.dueDate,
  });
  const phone = client?.phone || "";
  return { url: buildWhatsappLink(phone, message), status: billingStatus, phone, message };
}
