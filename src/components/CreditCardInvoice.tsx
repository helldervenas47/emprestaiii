import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { format, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Pencil,
  Trash2,
  AlertTriangle,
  Wifi,
  CalendarDays,
  CalendarClock,
  Sparkles,
  CheckCircle2,
  Clock,
  CreditCard as CreditCardIcon,
  Wallet,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CreditCard } from "@/hooks/useCreditCards";
import { useExpenses } from "@/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/hooks/useCreditCardOpenings";
import { readPaidOverride, writePaidOverride, listPaidInvoicesInRange, isCreditCardExpense, type PaidInvoiceEntry } from "@/lib/creditCardInvoiceTotals";
import { expandCreditCardExpenses, type ExpandedExpense } from "@/lib/creditCardInstallments";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/lib/creditCardBanks";
import { CreditCardOpeningDialog } from "./CreditCardOpeningDialog";
import { ExpenseEditDialog } from "./ExpenseEditDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { Expense } from "@/types/loan";
import { toast } from "sonner";

interface Props {
  card: CreditCard;
  onClose: () => void;
  /** YYYY-MM — when provided, the initial cycle is the one whose due date falls in this month. */
  referenceMonth?: string;
  /** Bounding rect of the source mini-card; used to animate from that position into fullscreen. */
  originRect?: DOMRect | null;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Calculates the closing/due dates of the billing cycle that contains `ref`.
 */
function getCycle(ref: Date, closingDay: number, dueDay: number) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  const closingThis = new Date(y, m, Math.min(closingDay, new Date(y, m + 1, 0).getDate()));
  const closingNext =
    day >= closingDay
      ? new Date(y, m + 1, Math.min(closingDay, new Date(y, m + 2, 0).getDate()))
      : closingThis;
  const closingPrev =
    day >= closingDay
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

export function CreditCardInvoice({ card, onClose, referenceMonth, originRect }: Props) {
  const { expenses, updateExpense, deleteExpense } = useExpenses();
  const { openings, getOpening, upsertOpening } = useCreditCardOpenings();
  const { mask } = useHideValues();
  const bank = getBank(card.bank);

  const initialOffset = useMemo(() => {
    if (!referenceMonth) return 0;
    const [ty, tm] = referenceMonth.split("-").map(Number);
    if (!ty || !tm) return 0;
    for (let off = -24; off <= 24; off++) {
      const d = new Date();
      d.setMonth(d.getMonth() + off);
      const c = getCycle(d, card.closingDay, card.dueDay);
      if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) {
        return off;
      }
    }
    return 0;
  }, [referenceMonth, card.closingDay, card.dueDay]);

  const [cycleOffset, setCycleOffset] = useState(initialOffset);
  const [editingOpening, setEditingOpening] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [editPaidOpen, setEditPaidOpen] = useState(false);
  const [editPaidValue, setEditPaidValue] = useState("");
  const [savingPaid, setSavingPaid] = useState(false);
  const [payDate, setPayDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    setCycleOffset(initialOffset);
  }, [initialOffset]);

  const ref = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + cycleOffset);
    return d;
  }, [cycleOffset]);

  const cycle = useMemo(
    () => getCycle(ref, card.closingDay, card.dueDay),
    [ref, card.closingDay, card.dueDay]
  );

  const cycleKey = useMemo(() => cycleKeyFromDate(cycle.to), [cycle.to]);
  const opening = getOpening(card.id, cycleKey);
  const openingAmount = opening?.openingAmount ?? 0;

  // Previous cycle for comparison
  const prevCycle = useMemo(() => {
    const d = new Date(ref);
    d.setMonth(d.getMonth() - 1);
    return getCycle(d, card.closingDay, card.dueDay);
  }, [ref, card.closingDay, card.dueDay]);
  const prevCycleKey = useMemo(() => cycleKeyFromDate(prevCycle.to), [prevCycle.to]);
  const prevOpening = getOpening(card.id, prevCycleKey);

  const cardTag = (card.nickname || card.lastFour || "").toLowerCase();

  const expandedExpenses = useMemo(
    () => expandCreditCardExpenses(expenses),
    [expenses]
  );

  const filterCardExpenses = (from: Date, to: Date): ExpandedExpense[] =>
    expandedExpenses
      .filter((e) => e.scope === "personal")
      .filter((e) => /\[\s*cr[eé]dito\s*\]/i.test(e.notes ?? ""))
      .filter((e) => {
        if (!cardTag) return true;
        const n = (e.notes ?? "").toLowerCase();
        if (n.includes(cardTag)) return true;
        return !/cart[aã]o[:\s]/i.test(n);
      })
      .filter((e) => {
        const d = new Date(e.dueDate + "T00:00:00");
        return d >= from && d < to;
      });

  const items = useMemo(
    () => filterCardExpenses(cycle.from, cycle.to).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [expandedExpenses, cycle, cardTag]
  );

  const prevItems = useMemo(
    () => filterCardExpenses(prevCycle.from, prevCycle.to),
    [expandedExpenses, prevCycle, cardTag]
  );

  const sumItems = (list: ExpandedExpense[]) =>
    list.reduce((s, e) => {
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      return s + (isRec ? e.amount / e.installments! : e.amount);
    }, 0);

  const transactionsTotal = sumItems(items);
  const total = transactionsTotal + openingAmount;
  const prevTotal = sumItems(prevItems) + (prevOpening?.openingAmount ?? 0);
  const paidOverride = readPaidOverride(opening?.notes);
  const paidTotal = paidOverride ?? sumItems(items.filter((e) => e.paid));

  // Limite disponível = limite total - (despesas pendentes do cartão + saldos iniciais de
  // faturas em aberto). Reflete tudo que ainda foi gasto e não pago neste cartão.
  const pendingTotal = useMemo(() => {
    const expensesPending = expandedExpenses
      .filter((e) => e.scope === "personal")
      .filter((e) => /\[\s*cr[eé]dito\s*\]/i.test(e.notes ?? ""))
      .filter((e) => {
        if (!cardTag) return true;
        const n = (e.notes ?? "").toLowerCase();
        if (n.includes(cardTag)) return true;
        return !/cart[aã]o[:\s]/i.test(n);
      })
      .filter((e) => !e.paid)
      .reduce((s, e) => s + e.amount, 0);
    const openingsPending = openings
      .filter((o) => o.cardId === card.id)
      .reduce((s, o) => s + (o.openingAmount ?? 0), 0);
    return expensesPending + openingsPending;
  }, [expandedExpenses, openings, cardTag, card.id]);

  const utilization = card.creditLimit > 0 ? Math.min(100, (pendingTotal / card.creditLimit) * 100) : 0;
  const available = Math.max(0, card.creditLimit - pendingTotal);

  // "Melhor dia de compra" = dia seguinte ao fechamento
  const bestPurchaseDay = ((card.closingDay % 31) + 1);

  // Status da fatura
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isClosed = today > cycle.to;
  const isOverdue = isClosed && today > cycle.dueDate && total > 0;
  const daysToDue = Math.ceil((cycle.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Fatura quitada: existe ao menos um item ou saldo inicial registrado, todos pagos.
  // Usamos uma marca "[PAGA]" no campo notes do opening para preservar a informação
  // de "fatura quitada" mesmo após zerar o saldo inicial.
  const openingPaidFlag = /\[PAGA\]/i.test(opening?.notes ?? "");
  const cycleHasPending = items.some((e) => !e.paid) || openingAmount > 0;
  const cycleEverHadValue = items.length > 0 || openingAmount > 0 || openingPaidFlag;
  const isPaid = cycleEverHadValue && !cycleHasPending;

  // Histórico de pagamentos: faturas pagas deste cartão nos últimos 24 meses,
  // incluindo a fatura aberta quando ela já possui pagamento registrado.
  const paymentHistory = useMemo(() => {
    const today = new Date();
    const fromD = new Date(today.getFullYear(), today.getMonth() - 24, 1);
    const toD = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const fromISO = `${fromD.getFullYear()}-${String(fromD.getMonth() + 1).padStart(2, "0")}-${String(fromD.getDate()).padStart(2, "0")}`;
    const toISO = `${toD.getFullYear()}-${String(toD.getMonth() + 1).padStart(2, "0")}-${String(toD.getDate()).padStart(2, "0")}`;
    return listPaidInvoicesInRange(expenses, [card], openings, fromISO, toISO)
      .sort((a, b) => (a.paidDate < b.paidDate ? 1 : -1));
  }, [expenses, openings, card]);

  const status: { label: string; tone: string; icon: typeof Clock } = isPaid
    ? { label: isClosed ? "Fechada — Paga" : "Paga", tone: "bg-success/15 text-success border-success/30", icon: CheckCircle2 }
    : isOverdue
    ? { label: "Em atraso", tone: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertTriangle }
    : isClosed
    ? { label: "Fechada — aguardando pagamento", tone: "bg-warning/15 text-warning border-warning/30", icon: Clock }
    : !cycleEverHadValue
    ? { label: "Sem lançamentos", tone: "bg-muted text-muted-foreground border-border", icon: CheckCircle2 }
    : { label: "Em aberto", tone: "bg-primary/15 text-primary border-primary/30", icon: Sparkles };

  const StatusIcon = status.icon;

  // Swipe-down to close (mobile only)
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // FLIP transition state: "enter" → "open" → "exit"
  const [phase, setPhase] = useState<"enter" | "open" | "exit">(originRect ? "enter" : "open");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  // Compute origin transform that places the panel exactly on top of the source mini-card.
  const originTransform = useMemo(() => {
    if (!originRect || typeof window === "undefined") return undefined;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scaleX = originRect.width / vw;
    const scaleY = originRect.height / vh;
    // Translate to the card's top-left, then scale down from the top-left origin.
    return `translate(${originRect.left}px, ${originRect.top}px) scale(${scaleX}, ${scaleY})`;
  }, [originRect]);

  // Border radius transitions from the mini-card (12px) to fullscreen (0) for smoothness.
  const panelRadius = phase === "open" ? 0 : 16;

  // Run the entrance animation on mount.
  // useLayoutEffect ensures the initial transform paints before we transition to "open".
  useLayoutEffect(() => {
    if (phase !== "enter") return;
    // Force a synchronous reflow so the initial transform commits before transitioning.
    if (cardRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      cardRef.current.getBoundingClientRect();
    }
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setPhase("open"));
      (window as any).__cardR2 = r2;
    });
    return () => cancelAnimationFrame(r1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle close: if mobile and we have an origin rect, animate back; else close immediately.
  const handleClose = () => {
    if (!originRect || !isMobile) {
      onClose();
      return;
    }
    setDragY(0);
    setPhase("exit");
    window.setTimeout(onClose, 300);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    if ((cardRef.current?.scrollTop ?? 0) > 0) return;
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    setDragY(delta > 0 ? delta : 0);
  };

  const onTouchEnd = () => {
    if (touchStartY.current == null) return;
    if (dragY > 120) {
      handleClose();
    } else {
      setDragY(0);
    }
    touchStartY.current = null;
    setDragging(false);
  };

  // Build the panel transform based on phase + drag.
  const panelTransform = (() => {
    if (phase === "enter" && originTransform) return originTransform;
    if (phase === "exit" && originTransform) return originTransform;
    if (dragY > 0) return `translateY(${dragY}px)`;
    return "translate(0,0) scale(1,1)";
  })();

  // Backdrop opacity follows phase + drag.
  const backdropOpacity = (() => {
    if (phase === "enter" || phase === "exit") return 0;
    if (dragY > 0) return Math.max(0.3, 1 - dragY / 500);
    return 1;
  })();

  // Lock body scroll while the panel is mounted (prevents background scrolling on mobile).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const content = (
    <div
      className="fixed inset-0 z-[2147483647] flex items-stretch sm:items-center justify-center p-0 sm:p-4 overscroll-contain"
      style={{ height: "100dvh" }}
      onClick={(e) => {
        if (!isMobile && e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Backdrop — fully opaque on mobile so nothing behind leaks through. */}
      <div
        className="absolute inset-0 bg-background sm:bg-foreground/50 sm:backdrop-blur-md pointer-events-none"
        style={{
          opacity: isMobile ? 1 : backdropOpacity,
          transition: dragging ? "none" : "opacity 300ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <Card
        ref={cardRef}
        no3d
        className={`relative w-full max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl border-0 sm:border p-0 will-change-transform bg-background ${
          phase === "open" ? "overflow-y-auto rounded-none" : "overflow-hidden"
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: panelTransform,
          transformOrigin: "top left",
          borderRadius: isMobile && phase !== "open" ? `${panelRadius}px` : undefined,
          transition: dragging
            ? "none"
            : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {/* Drag handle (mobile only) */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 sticky top-0 z-20 bg-transparent pointer-events-none">
          <div className="h-1.5 w-10 rounded-full bg-white/40" />
        </div>
        {/* HERO — Cartão visual estilo app real */}
        <div className={`${bank.gradient} ${bank.textClass} relative overflow-hidden`}>
          {/* glows */}
          <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-black/25 blur-3xl" />

          {/* Top bar: bank + close */}
          <div className="relative flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="h-5 w-5 opacity-95" />
              <div>
                <p className="text-[11px] opacity-80 leading-none">Fatura</p>
                <p className="font-bold text-base leading-tight">{bank.name}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className={`${bank.textClass} hover:bg-white/15`}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Card meta */}
          <div className="relative px-5 mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-9 rounded-md bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] shadow-inner border border-[hsl(45,90%,80%)]/40" />
              <Wifi className="h-3.5 w-3.5 rotate-90 opacity-80" />
            </div>
            <div className="text-right">
              <p className="font-mono text-xs opacity-95 tracking-[0.2em]">
                •••• {card.lastFour || "0000"}
              </p>
              <p className="text-[10px] italic font-bold tracking-wider opacity-90">
                {brandLabel(card.brand)}
              </p>
            </div>
          </div>

          {/* Cycle nav */}
          <div className="relative flex items-center justify-between gap-2 px-3 mt-4">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${bank.textClass} hover:bg-white/15`}
              onClick={() => setCycleOffset((o) => o - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider opacity-75">Vencimento</p>
              <p className="text-sm font-semibold capitalize">
                {format(cycle.dueDate, "MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${bank.textClass} hover:bg-white/15`}
              onClick={() => setCycleOffset((o) => o + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Total */}
          <div className="relative px-5 pt-4 pb-5 text-center">
            <p className="text-[11px] uppercase tracking-wider opacity-75">Valor total da fatura</p>
            <p className="text-4xl font-bold mt-1 tracking-tight">{mask(fmt(total))}</p>

            {/* Status pill */}
            <div className="mt-3 flex justify-center">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${status.tone}`}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
                {!isOverdue && !isClosed && daysToDue >= 0 && total > 0 && (
                  <span className="opacity-80">· vence em {daysToDue}d</span>
                )}
              </span>
            </div>

            {/* Valor pago da fatura */}
            <div className="mt-2 flex justify-center">
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-white/15 border border-white/25">
                <span className="opacity-80">Valor pago da fatura</span>
                <span className="font-semibold tabular-nums">{mask(fmt(paidTotal))}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditPaidValue(paidTotal > 0 ? paidTotal.toFixed(2) : "");
                    setEditPaidOpen(true);
                  }}
                  className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-white/20 transition-colors"
                  aria-label="Editar valor pago da fatura"
                  title="Editar valor pago"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </span>
            </div>


            {card.creditLimit > 0 && (
              <div className="mt-4 mx-auto max-w-sm">
                <div className="flex items-center justify-between text-[11px] opacity-90 mb-1.5">
                  <span>Limite disponível</span>
                  <span className="font-semibold">{mask(fmt(available))}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-white/90 rounded-full transition-all"
                    style={{ width: `${Math.min(100, utilization)}%` }}
                  />
                </div>
                <p className="text-[10px] opacity-75 mt-1">
                  {utilization.toFixed(0)}% de {mask(fmt(card.creditLimit))} utilizado
                </p>
              </div>
            )}
          </div>
        </div>

        <CardContent
          className="space-y-4 pt-5 px-4 sm:px-6 pb-6"
          style={{
            opacity: phase === "open" ? 1 : 0,
            transform: phase === "open" ? "translateY(0)" : "translateY(12px)",
            transition: "opacity 240ms ease-out 160ms, transform 280ms cubic-bezier(0.22,1,0.36,1) 160ms",
          }}
        >
          {/* Quick stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-card p-3 text-center">
              <CalendarDays className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fechamento</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {format(cycle.to, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <CalendarClock className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vencimento</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                {format(cycle.dueDate, "dd/MM", { locale: ptBR })}
              </p>
            </div>
            <div className="rounded-xl border bg-card p-3 text-center">
              <Sparkles className="h-4 w-4 mx-auto text-success mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Melhor compra</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">dia {bestPurchaseDay}</p>
            </div>
          </div>

          {/* Pagar fatura */}
          {(items.some((e) => !e.paid) || (opening && openingAmount > 0)) && (
            <Button
              onClick={() => setPayDialogOpen(true)}
              className="w-full h-11 text-sm font-semibold shadow-md"
              size="lg"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Pagar fatura · {mask(fmt(total))}
            </Button>
          )}
          {prevTotal > 0 && (
            <div className="rounded-xl border bg-muted/30 px-3 py-2.5 flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Fatura anterior</p>
                <p className="text-sm font-medium text-foreground">{mask(fmt(prevTotal))}</p>
              </div>
              {(() => {
                const diff = total - prevTotal;
                const pct = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
                const up = diff > 0;
                return (
                  <Badge
                    variant="secondary"
                    className={up ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}
                  >
                    {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
                  </Badge>
                );
              })()}
            </div>
          )}

          {cycleOffset !== 0 && (
            <div className="flex items-center gap-2 text-[11px] rounded-md bg-warning/10 border border-warning/30 text-warning-foreground px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {cycleOffset < 0
                ? "Você está vendo uma fatura passada. Edições afetam o histórico."
                : "Você está vendo uma fatura futura. Confira os valores antes de salvar."}
            </div>
          )}

          {/* Opening (saldo inicial) */}
          {opening ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-medium text-foreground truncate">
                    Saldo inicial da fatura
                  </p>
                </div>
                {opening.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {opening.notes}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <p className="text-sm font-semibold text-foreground">{mask(fmt(openingAmount))}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setEditingOpening(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setEditingOpening(true)}
            >
              <Receipt className="h-4 w-4 mr-1.5" />
              Adicionar fatura do mês (saldo inicial)
            </Button>
          )}

          {/* Histórico recente / Lançamentos */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transações ({items.length})
              </p>
              <p className="text-[11px] text-muted-foreground">
                {format(cycle.from, "dd/MM", { locale: ptBR })} —{" "}
                {format(cycle.to, "dd/MM", { locale: ptBR })}
              </p>
            </div>

            <div className="space-y-1.5">
              {items.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-xl">
                  Nenhum lançamento neste período.
                  <p className="text-xs mt-2 max-w-sm mx-auto px-4">
                    Marque a forma de pagamento como "Crédito" e mencione "
                    {card.nickname || card.lastFour}" nas observações.
                  </p>
                </div>
              ) : (
                items.map((e) => {
                  const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
                  const value = isRec ? e.amount / e.installments! : e.amount;
                  const realId = e.isVirtualInstallment ? String(e.id).split("::virt::")[0] : e.id;
                  const realExpense = expenses.find((x) => x.id === realId) ?? e;
                  const installmentLabel = e.isVirtualInstallment && realExpense.installments
                    ? `${e.virtualInstallmentNumber}/${realExpense.installments}`
                    : isRec
                    ? `${e.installments}x`
                    : null;
                  return (
                    <div
                      key={e.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingExpense(realExpense)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setEditingExpense(realExpense);
                        }
                      }}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-card hover:bg-muted/40 active:bg-muted/60 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Editar despesa ${e.description}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] py-0 h-4">
                            {e.category}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(e.dueDate + "T00:00:00"), "dd/MM", { locale: ptBR })}
                          </span>
                          {installmentLabel && (
                            <span className="text-[11px] text-muted-foreground">
                              {installmentLabel}
                            </span>
                          )}
                          {e.isVirtualInstallment && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4">
                              Prevista
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <p className="text-sm font-semibold text-foreground">{mask(fmt(value))}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditingExpense(realExpense);
                          }}
                          aria-label="Editar lançamento"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDeletingExpense(realExpense);
                          }}
                          aria-label="Excluir lançamento"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Histórico de pagamentos de faturas */}
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Histórico de pagamentos ({paymentHistory.length})
              </p>
              <p className="text-[11px] text-muted-foreground">Últimos 24 meses</p>
            </div>

            {paymentHistory.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-xl">
                Nenhuma fatura paga registrada ainda.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {paymentHistory.map((p) => {
                  const [cy, cm] = p.cycleKey.split("-").map(Number);
                  const cycleLabel = format(new Date(cy, (cm ?? 1) - 1, 1), "MMM/yy", { locale: ptBR });
                  const paid = new Date(p.paidDate + "T00:00:00");
                  const due = new Date(p.dueDate + "T00:00:00");
                  const partial = p.paidTotal + 0.01 < p.total;
                  return (
                    <div
                      key={`${p.cycleKey}-${p.paidDate}`}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl border bg-card"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-foreground capitalize">
                            Fatura {cycleLabel}
                          </p>
                          <Badge
                            variant="outline"
                            className={
                              partial
                                ? "text-[10px] py-0 h-4 bg-warning/15 text-warning border-warning/30"
                                : "text-[10px] py-0 h-4 bg-success/15 text-success border-success/30"
                            }
                          >
                            {partial ? "Pago parcial" : "Pago"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground">
                            Pago em {format(paid, "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            · Venc. {format(due, "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground tabular-nums">
                          {mask(fmt(p.paidTotal))}
                        </p>
                        {partial && (
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            de {mask(fmt(p.total))}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {editingOpening && (
        <CreditCardOpeningDialog
          open={editingOpening}
          onOpenChange={setEditingOpening}
          cardName={card.nickname || bank.name}
          cycleLabel={format(cycle.dueDate, "MMMM/yy", { locale: ptBR })}
          initialAmount={openingAmount}
          initialNotes={opening?.notes ?? null}
          creditLimit={card.creditLimit}
          transactionsTotal={transactionsTotal}
          onSave={async (amount, notes) => {
            await upsertOpening(card.id, cycleKey, amount, notes);
          }}
        />
      )}

      <ExpenseEditDialog
        open={!!editingExpense}
        onOpenChange={(v) => !v && setEditingExpense(null)}
        expense={editingExpense}
        warning={
          cycleOffset !== 0
            ? cycleOffset < 0
              ? "Esta despesa pertence a uma fatura passada."
              : "Esta despesa pertence a uma fatura futura."
            : null
        }
        onSave={async (patch) => {
          if (!editingExpense) return;
          await updateExpense(editingExpense.id, {
            description: patch.description,
            amount: patch.amount,
            dueDate: patch.dueDate,
            category: patch.category,
            notes: patch.notes ?? undefined,
          });
          toast.success("Lançamento atualizado");
        }}
      />

      <ConfirmDeleteDialog
        open={!!deletingExpense}
        onOpenChange={(v) => !v && setDeletingExpense(null)}
        title="Excluir lançamento da fatura?"
        description={
          deletingExpense?.type === "recorrente" &&
          (deletingExpense?.installments ?? 0) > 1
            ? `Este lançamento é parcelado (${deletingExpense.installments}x). A exclusão removerá a despesa inteira de todas as faturas.`
            : "Esta ação não pode ser desfeita."
        }
        onConfirm={async () => {
          if (!deletingExpense) return;
          await deleteExpense(deletingExpense.id);
          toast.success("Lançamento excluído");
          setDeletingExpense(null);
        }}
      />

      {/* Editar valor pago da fatura */}
      <Dialog open={editPaidOpen} onOpenChange={setEditPaidOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              Editar valor pago da fatura
            </DialogTitle>
            <DialogDescription>
              Ajuste o valor efetivamente pago desta fatura. Útil para registrar juros, descontos ou pagamentos parciais.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="paid-value">Valor pago (R$)</Label>
              <Input
                id="paid-value"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={editPaidValue}
                onChange={(e) => setEditPaidValue(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Deixe vazio para voltar ao cálculo automático (soma dos lançamentos pagos).
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditPaidOpen(false)} disabled={savingPaid}>
              Cancelar
            </Button>
            <Button
              disabled={savingPaid}
              onClick={async () => {
                setSavingPaid(true);
                try {
                  const raw = editPaidValue.replace(",", ".").trim();
                  const parsed = raw === "" ? null : Number(raw);
                  if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
                    toast.error("Valor inválido");
                    setSavingPaid(false);
                    return;
                  }
                  const newNotes = writePaidOverride(opening?.notes, parsed);
                  const baseAmount = opening?.openingAmount ?? 0;
                  await upsertOpening(card.id, cycleKey, baseAmount, newNotes);
                  toast.success(parsed === null ? "Valor pago restaurado" : "Valor pago atualizado");
                  setEditPaidOpen(false);
                } catch {
                  toast.error("Erro ao salvar valor pago");
                } finally {
                  setSavingPaid(false);
                }
              }}
            >
              {savingPaid ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              Pagar fatura
            </DialogTitle>
            <DialogDescription>
              Marca todos os lançamentos em aberto deste ciclo como pagos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-xl bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground">Valor total</p>
              <p className="text-2xl font-bold text-foreground mt-1">{mask(fmt(total))}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {items.filter((e) => !e.paid).length} lançamento(s) em aberto
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Data do pagamento</Label>
              <Input
                id="pay-date"
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={paying}>
              Cancelar
            </Button>
            <Button
              disabled={paying || !payDate}
              onClick={async () => {
                setPaying(true);
                try {
                  const unpaid = items.filter((e) => !e.paid);
                  for (const e of unpaid) {
                    await updateExpense(e.id, { paid: true, paidDate: payDate });
                  }
                  // Marca o saldo inicial como quitado: adiciona "[PAGA]" e grava
                  // [PAID:total] no notes para preservar o valor efetivamente pago
                  // (necessário para o débito no saldo em conta via
                  // creditCardInvoiceExtraPaid e para aparecer no extrato/histórico).
                  if (opening || openingAmount > 0 || total > 0) {
                    const baseNotes = writePaidOverride(
                      (opening?.notes ?? "").replace(/\[PAGA\]/gi, "").trim(),
                      Number(total.toFixed(2)),
                    );
                    const newNotes = baseNotes ? `${baseNotes} [PAGA]` : "[PAGA]";
                    await upsertOpening(card.id, cycleKey, 0, newNotes);
                  }
                  toast.success(
                    unpaid.length > 0 || openingAmount > 0
                      ? `Fatura paga · ${unpaid.length} lançamento(s) quitado(s)`
                      : "Fatura registrada como paga"
                  );
                  setPayDialogOpen(false);
                } catch {
                  toast.error("Erro ao pagar fatura");
                } finally {
                  setPaying(false);
                }
              }}
            >
              {paying ? "Pagando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : content;
}
