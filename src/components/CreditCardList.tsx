import { useState, useMemo } from "react";
import { Plus, CreditCard as CreditCardIcon, Wifi, Pencil, Trash2, Receipt, CheckCircle, EyeOff, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCreditCards, CreditCard } from "@/hooks/useCreditCards";
import { useExpenses } from "@/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/hooks/useCreditCardOpenings";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/lib/creditCardBanks";
import { CreditCardForm } from "./CreditCardForm";
import { CreditCardInvoice } from "./CreditCardInvoice";
import { CreditCardOpeningDialog } from "./CreditCardOpeningDialog";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

interface Props {
  readOnly?: boolean;
  /** YYYY-MM — when provided, opens the credit card invoice anchored to the cycle whose due date falls in this month. */
  referenceMonth?: string;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Returns cycle for a reference Date (today inside the cycle window). */
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

/** Returns the current billing cycle (from, to, dueDate) for a card. */
function getCurrentCycle(closingDay: number, dueDay: number) {
  return getCycleForRef(new Date(), closingDay, dueDay);
}

/** Find the cycle whose dueDate falls in the given YYYY-MM month. */
function getCycleForDueMonth(yyyymm: string, closingDay: number, dueDay: number) {
  const [ty, tm] = yyyymm.split("-").map(Number);
  for (let off = -24; off <= 24; off++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + off);
    const c = getCycleForRef(d, closingDay, dueDay);
    if (c.dueDate.getFullYear() === ty && c.dueDate.getMonth() + 1 === tm) {
      return c;
    }
  }
  return getCycleForRef(new Date(), closingDay, dueDay);
}

interface MiniCardProps {
  card: CreditCard;
  invoiceTotal: number;
  openingAmount: number;
  hasOpening: boolean;
  hasActiveInvoice: boolean;
  hasUnpaidInvoice: boolean;
  dueDate: Date;
  onClick: (rect: DOMRect) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddOpening?: () => void;
  onPayInvoice?: () => void;
  readOnly?: boolean;
}

function MiniCreditCard({
  card,
  invoiceTotal,
  openingAmount,
  hasOpening,
  hasActiveInvoice,
  hasUnpaidInvoice,
  dueDate,
  onClick,
  onEdit,
  onDelete,
  onAddOpening,
  onPayInvoice,
  readOnly,
}: MiniCardProps) {
  const bank = getBank(card.bank);
  const { mask } = useHideValues();
  const utilization =
    card.creditLimit > 0 ? Math.min(100, (invoiceTotal / card.creditLimit) * 100) : 0;
  const rootRef = (window as any).__cardRefMap || ((window as any).__cardRefMap = new Map());

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onClick(rect);
  };

  return (
    <Card
      no3d
      className={`group relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
        hasActiveInvoice
          ? "border-2 border-warning shadow-[0_0_0_3px_hsl(var(--warning)/0.15)]"
          : ""
      }`}
      onClick={handleClick}
    >
      {hasActiveInvoice && (
        <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-warning text-warning-foreground text-[9px] font-bold uppercase tracking-wide shadow-sm">
          Fatura do mês
        </div>
      )}
      <CardContent className="p-3 space-y-2.5">
        {/* Mini visual card thumbnail */}
        <div
          className={`${bank.gradient} ${bank.textClass} relative aspect-[1.586/1] w-full rounded-lg p-2.5 shadow-sm overflow-hidden`}
        >
          <div className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-1">
              <div className="h-4 w-5 rounded-sm bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] border border-[hsl(45,90%,80%)]/40" />
              <Wifi className="h-2.5 w-2.5 rotate-90 opacity-80" />
            </div>
            <span className="text-[9px] font-bold tracking-wide truncate max-w-[60%] text-right">
              {bank.name}
            </span>
          </div>
          <div className="absolute left-2.5 right-2.5 bottom-2 flex items-end justify-between">
            <span className="font-mono text-[10px] tracking-[0.15em] opacity-95">
              •••• {card.lastFour || "0000"}
            </span>
            <span className="text-[9px] font-bold italic opacity-95">
              {brandLabel(card.brand)}
            </span>
          </div>
        </div>

        {/* Summary info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground truncate">
              {card.nickname || bank.name}
            </p>
            {!readOnly && (
              <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.();
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">Fatura atual</span>
            <span className="text-sm font-bold text-foreground">
              {mask(fmt(invoiceTotal))}
            </span>
          </div>

          {hasOpening && openingAmount > 0 && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">Saldo inicial</span>
              <span className="text-[11px] font-medium text-muted-foreground">
                {mask(fmt(openingAmount))}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>Vence {format(dueDate, "dd 'de' MMM", { locale: ptBR })}</span>
            <span>Limite {mask(fmt(card.creditLimit))}</span>
          </div>

          {/* Utilization bar */}
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${
                utilization >= 90
                  ? "bg-destructive"
                  : utilization >= 70
                  ? "bg-warning"
                  : "bg-primary"
              }`}
              style={{ width: `${utilization}%` }}
            />
          </div>

          {!readOnly && (
            <div className="space-y-1 mt-1">
              <Button
                variant="default"
                size="sm"
                className="w-full h-7 text-[11px]"
                disabled={!hasUnpaidInvoice || invoiceTotal <= 0}
                onClick={(e) => {
                  e.stopPropagation();
                  onPayInvoice?.();
                }}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Pagar fatura
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddOpening?.();
                }}
              >
                <Receipt className="h-3 w-3 mr-1" />
                {hasOpening ? "Editar fatura inicial" : "Adicionar fatura do mês"}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CreditCardList({ readOnly = false, referenceMonth }: Props) {
  const { cards: allCards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const cards = useMemo(() => allCards.filter((c) => c.active !== false), [allCards]);
  const inactiveCards = useMemo(() => allCards.filter((c) => c.active === false), [allCards]);
  const { expenses, payExpense } = useExpenses();
  const { getOpening, upsertOpening } = useCreditCardOpenings();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState<CreditCard | null>(null);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);
  const [invoiceOriginRect, setInvoiceOriginRect] = useState<DOMRect | null>(null);
  const [openingCard, setOpeningCard] = useState<CreditCard | null>(null);
  const [payingCard, setPayingCard] = useState<CreditCard | null>(null);
  const [paying, setPaying] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [showAllMobile, setShowAllMobile] = useState(false);

  const openInvoice = (card: CreditCard, rect: DOMRect) => {
    setInvoiceOriginRect(rect);
    setInvoiceCard(card);
  };

  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (card: CreditCard) => {
    setEditing(card);
    setShowForm(true);
  };

  // Compute current invoice total per card (transactions + opening)
  const invoiceByCard = useMemo(() => {
    const map = new Map<
      string,
      {
        transactions: number;
        opening: number;
        total: number;
        dueDate: Date;
        cycleKey: string;
        openingNotes: string | null;
        hasOpening: boolean;
        unpaidExpenseIds: string[];
      }
    >();
    cards.forEach((card) => {
      const cycle = referenceMonth
        ? getCycleForDueMonth(referenceMonth, card.closingDay, card.dueDay)
        : getCurrentCycle(card.closingDay, card.dueDay);
      const cardTag = (card.nickname || card.lastFour || "").toLowerCase();
      const inCycle = expenses
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
          return d > cycle.from && d <= cycle.to;
        });
      const transactions = inCycle.reduce((s, e) => {
        const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
        return s + (isRec ? e.amount / e.installments! : e.amount);
      }, 0);
      const unpaidExpenseIds = inCycle.filter((e) => !e.paid).map((e) => e.id);
      const cycleKey = cycleKeyFromDate(cycle.to);
      const op = getOpening(card.id, cycleKey);
      const opening = op?.openingAmount ?? 0;
      map.set(card.id, {
        transactions,
        opening,
        total: transactions + opening,
        dueDate: cycle.dueDate,
        cycleKey,
        openingNotes: op?.notes ?? null,
        hasOpening: !!op,
        unpaidExpenseIds,
      });
    });
    return map;
  }, [cards, expenses, getOpening, referenceMonth]);

  // Month key used to decide which cards should be highlighted as "Fatura do mês".
  const refMonthKey = referenceMonth
    ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const openingDialogData = useMemo(() => {
    if (!openingCard) return null;
    const inv = invoiceByCard.get(openingCard.id);
    if (!inv) return null;
    return {
      cycleKey: inv.cycleKey,
      cycleLabel: format(inv.dueDate, "MMMM/yy", { locale: ptBR }),
      initialAmount: inv.opening,
      initialNotes: inv.openingNotes,
    };
  }, [openingCard, invoiceByCard]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground truncate">
          Cartões ({cards.length})
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          {inactiveCards.length > 0 && (
            <Button
              onClick={() => setShowInactive((v) => !v)}
              size="sm"
              variant="outline"
            >
              <EyeOff className="h-4 w-4 mr-1" />
              {showInactive ? "Ocultar inativos" : `Inativos (${inactiveCards.length})`}
            </Button>
          )}
          {!readOnly && (
            <Button onClick={handleNew} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Novo Cartão
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Carregando...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 px-4">
          <CreditCardIcon className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-4">Nenhum cartão cadastrado</p>
          {!readOnly && (
            <Button onClick={handleNew} variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Cadastrar primeiro cartão
            </Button>
          )}
        </div>
      ) : (
        <>
        {(() => {
          // Sort by nearest due date (soonest first) for mobile prioritization
          const sortedCards = [...cards].sort((a, b) => {
            const da = invoiceByCard.get(a.id)?.dueDate?.getTime() ?? 0;
            const db = invoiceByCard.get(b.id)?.dueDate?.getTime() ?? 0;
            return da - db;
          });
          const isMobileLimited = !showAllMobile && sortedCards.length > 2;
          const mobileVisible = isMobileLimited ? sortedCards.slice(0, 2) : sortedCards;
          const hiddenCount = sortedCards.length - 2;
          return (
            <>
              {/* Mobile: limited list (max 2) */}
              <div className="grid gap-3 grid-cols-2 sm:hidden">
                {mobileVisible.map((card) => {
                  const inv = invoiceByCard.get(card.id) ?? {
                    transactions: 0, opening: 0, total: 0,
                    dueDate: getCurrentCycle(card.closingDay, card.dueDay).dueDate,
                    cycleKey: "", openingNotes: null, hasOpening: false,
                    unpaidExpenseIds: [] as string[],
                  };
                  return (
                    <MiniCreditCard
                      key={card.id}
                      card={card}
                      invoiceTotal={inv.total}
                      openingAmount={inv.opening}
                      hasOpening={inv.hasOpening}
                      hasActiveInvoice={
                        inv.total > 0 &&
                        `${inv.dueDate.getFullYear()}-${String(inv.dueDate.getMonth() + 1).padStart(2, "0")}` === refMonthKey
                      }
                      hasUnpaidInvoice={inv.unpaidExpenseIds.length > 0}
                      dueDate={inv.dueDate}
                      onClick={(rect) => openInvoice(card, rect)}
                      onEdit={readOnly ? undefined : () => handleEdit(card)}
                      onDelete={readOnly ? undefined : () => setDeleting(card)}
                      onAddOpening={readOnly ? undefined : () => setOpeningCard(card)}
                      onPayInvoice={readOnly ? undefined : () => setPayingCard(card)}
                      readOnly={readOnly}
                    />
                  );
                })}
              </div>
              {sortedCards.length > 2 && (
                <div className="sm:hidden mt-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllMobile((v) => !v)}
                  >
                    {showAllMobile ? "Mostrar menos" : `Ver todos (${hiddenCount} a mais)`}
                  </Button>
                </div>
              )}
            </>
          );
        })()}

        {/* Tablet/Desktop: full grid */}
        <div className="hidden sm:grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => {
            const inv = invoiceByCard.get(card.id) ?? {
              transactions: 0,
              opening: 0,
              total: 0,
              dueDate: getCurrentCycle(card.closingDay, card.dueDay).dueDate,
              cycleKey: "",
              openingNotes: null,
              hasOpening: false,
              unpaidExpenseIds: [] as string[],
            };
            return (
              <MiniCreditCard
                key={card.id}
                card={card}
                invoiceTotal={inv.total}
                openingAmount={inv.opening}
                hasOpening={inv.hasOpening}
                hasActiveInvoice={
                  inv.total > 0 &&
                  `${inv.dueDate.getFullYear()}-${String(inv.dueDate.getMonth() + 1).padStart(2, "0")}` === refMonthKey
                }
                hasUnpaidInvoice={inv.unpaidExpenseIds.length > 0}
                dueDate={inv.dueDate}
                onClick={(rect) => openInvoice(card, rect)}
                onEdit={readOnly ? undefined : () => handleEdit(card)}
                onDelete={readOnly ? undefined : () => setDeleting(card)}
                onAddOpening={readOnly ? undefined : () => setOpeningCard(card)}
                onPayInvoice={readOnly ? undefined : () => setPayingCard(card)}
                readOnly={readOnly}
              />
            );
          })}
        </div>
        </>
      )}

      {showInactive && inactiveCards.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <EyeOff className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground">
              Cartões inativos ({inactiveCards.length})
            </h3>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {inactiveCards.map((card) => {
              const bank = getBank(card.bank);
              return (
                <Card key={card.id} no3d className="opacity-60 hover:opacity-100 transition-opacity">
                  <CardContent className="p-3 space-y-2.5">
                    <div className={`${bank.gradient} ${bank.textClass} relative aspect-[1.586/1] w-full rounded-lg p-2.5 shadow-sm overflow-hidden grayscale`}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1">
                          <div className="h-4 w-5 rounded-sm bg-gradient-to-br from-[hsl(45,90%,75%)] to-[hsl(40,80%,50%)] border border-[hsl(45,90%,80%)]/40" />
                          <Wifi className="h-2.5 w-2.5 rotate-90 opacity-80" />
                        </div>
                        <span className="text-[9px] font-bold tracking-wide truncate max-w-[60%] text-right">
                          {bank.name}
                        </span>
                      </div>
                      <div className="absolute left-2.5 right-2.5 bottom-2 flex items-end justify-between">
                        <span className="font-mono text-[10px] tracking-[0.15em] opacity-95">
                          •••• {card.lastFour || "0000"}
                        </span>
                        <span className="text-[9px] font-bold italic opacity-95">
                          {brandLabel(card.brand)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {card.nickname || bank.name}
                      </p>
                      <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold uppercase tracking-wide">
                        Inativo
                      </span>
                      {!readOnly && (
                        <div className="flex gap-1 pt-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1 h-7 text-[11px]"
                            onClick={() => updateCard(card.id, {
                              nickname: card.nickname,
                              bank: card.bank,
                              brand: card.brand,
                              lastFour: card.lastFour,
                              creditLimit: card.creditLimit,
                              closingDay: card.closingDay,
                              dueDay: card.dueDay,
                              active: true,
                            })}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reativar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleting(card)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {showForm && (
        <CreditCardForm
          initial={editing ?? undefined}
          onSave={(input) =>
            editing ? updateCard(editing.id, input) : addCard(input)
          }
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {invoiceCard && (
        <CreditCardInvoice
          card={invoiceCard}
          originRect={invoiceOriginRect}
          onClose={() => {
            setInvoiceCard(null);
            setInvoiceOriginRect(null);
          }}
          referenceMonth={referenceMonth}
        />
      )}

      {openingCard && openingDialogData && (
        <CreditCardOpeningDialog
          open={!!openingCard}
          onOpenChange={(o) => !o && setOpeningCard(null)}
          cardName={openingCard.nickname || getBank(openingCard.bank).name}
          cycleLabel={openingDialogData.cycleLabel}
          initialAmount={openingDialogData.initialAmount}
          initialNotes={openingDialogData.initialNotes}
          creditLimit={openingCard.creditLimit}
          transactionsTotal={invoiceByCard.get(openingCard.id)?.transactions ?? 0}
          onSave={async (amount, notes) => {
            await upsertOpening(openingCard.id, openingDialogData.cycleKey, amount, notes);
          }}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          open={!!deleting}
          onOpenChange={(o) => !o && setDeleting(null)}
          onConfirm={async () => {
            await deleteCard(deleting.id);
            setDeleting(null);
          }}
          title="Excluir cartão?"
          description={`Tem certeza que deseja excluir o cartão ${deleting.nickname || deleting.bank}?`}
        />
      )}

      {payingCard && (() => {
        const inv = invoiceByCard.get(payingCard.id);
        const ids = inv?.unpaidExpenseIds ?? [];
        const total = inv?.total ?? 0;
        return (
          <AlertDialog open={!!payingCard} onOpenChange={(o) => !o && !paying && setPayingCard(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Pagar fatura do cartão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Confirmar o pagamento de {ids.length} {ids.length === 1 ? "lançamento pendente" : "lançamentos pendentes"} ({fmt(total)}) do cartão {payingCard.nickname || getBank(payingCard.bank).name}? Cada despesa será marcada como paga e o saldo será debitado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={paying}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={paying || ids.length === 0}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (paying) return;
                    setPaying(true);
                    try {
                      const today = new Date().toISOString().split("T")[0];
                      for (const id of ids) {
                        await payExpense(id, false, today);
                      }
                      toast.success(`Fatura paga (${ids.length} ${ids.length === 1 ? "lançamento" : "lançamentos"})`);
                      setPayingCard(null);
                    } finally {
                      setPaying(false);
                    }
                  }}
                >
                  {paying ? "Pagando..." : "Pagar fatura"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
}
