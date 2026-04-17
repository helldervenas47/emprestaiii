import { useState, useMemo } from "react";
import { Plus, CreditCard as CreditCardIcon, Wifi, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCreditCards, CreditCard } from "@/hooks/useCreditCards";
import { useExpenses } from "@/hooks/useExpenses";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/lib/creditCardBanks";
import { CreditCardForm } from "./CreditCardForm";
import { CreditCardInvoice } from "./CreditCardInvoice";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

interface Props {
  readOnly?: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Returns the current billing cycle (from, to, dueDate) for a card. */
function getCurrentCycle(closingDay: number, dueDay: number) {
  const ref = new Date();
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

interface MiniCardProps {
  card: CreditCard;
  invoiceTotal: number;
  dueDate: Date;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  readOnly?: boolean;
}

function MiniCreditCard({
  card,
  invoiceTotal,
  dueDate,
  onClick,
  onEdit,
  onDelete,
  readOnly,
}: MiniCardProps) {
  const bank = getBank(card.bank);
  const { mask } = useHideValues();
  const utilization =
    card.creditLimit > 0 ? Math.min(100, (invoiceTotal / card.creditLimit) * 100) : 0;

  return (
    <Card
      no3d
      className="group relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
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
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
        </div>
      </CardContent>
    </Card>
  );
}

export function CreditCardList({ readOnly = false }: Props) {
  const { cards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const { expenses } = useExpenses();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState<CreditCard | null>(null);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);

  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (card: CreditCard) => {
    setEditing(card);
    setShowForm(true);
  };

  // Compute current invoice total per card
  const invoiceByCard = useMemo(() => {
    const map = new Map<string, { total: number; dueDate: Date }>();
    cards.forEach((card) => {
      const cycle = getCurrentCycle(card.closingDay, card.dueDay);
      const cardTag = (card.nickname || card.lastFour || "").toLowerCase();
      const total = expenses
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
        })
        .reduce((s, e) => {
          const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
          return s + (isRec ? e.amount / e.installments! : e.amount);
        }, 0);
      map.set(card.id, { total, dueDate: cycle.dueDate });
    });
    return map;
  }, [cards, expenses]);

  // Due-day filter options
  const dueDayOptions = useMemo(() => {
    const set = new Set<number>();
    cards.forEach((c) => set.add(c.dueDay));
    return Array.from(set).sort((a, b) => a - b);
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (dueFilter === "all") return cards;
    return cards.filter((c) => String(c.dueDay) === dueFilter);
  }, [cards, dueFilter]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-foreground truncate">
          Cartões ({cards.length})
        </h2>
        {!readOnly && (
          <Button onClick={handleNew} size="sm" className="shrink-0">
            <Plus className="h-4 w-4 mr-1" /> Novo Cartão
          </Button>
        )}
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
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => {
            const inv = invoiceByCard.get(card.id) ?? {
              total: 0,
              dueDate: getCurrentCycle(card.closingDay, card.dueDay).dueDate,
            };
            return (
              <MiniCreditCard
                key={card.id}
                card={card}
                invoiceTotal={inv.total}
                dueDate={inv.dueDate}
                onClick={() => setInvoiceCard(card)}
                onEdit={readOnly ? undefined : () => handleEdit(card)}
                onDelete={readOnly ? undefined : () => setDeleting(card)}
                readOnly={readOnly}
              />
            );
          })}
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
          onClose={() => setInvoiceCard(null)}
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
    </div>
  );
}
