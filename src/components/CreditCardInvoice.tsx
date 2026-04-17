import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, ChevronLeft, ChevronRight, Receipt, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard } from "@/hooks/useCreditCards";
import { useExpenses } from "@/hooks/useExpenses";
import { useCreditCardOpenings, cycleKeyFromDate } from "@/hooks/useCreditCardOpenings";
import { useHideValues } from "@/contexts/HideValuesContext";
import { getBank, brandLabel } from "@/lib/creditCardBanks";
import { CreditCardOpeningDialog } from "./CreditCardOpeningDialog";

interface Props {
  card: CreditCard;
  onClose: () => void;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Calculates the closing/due dates of the billing cycle that contains `ref`.
 * - Cycle: (prevClosing, currClosing] → due on `dueDay` of currClosing's month (or next).
 */
function getCycle(ref: Date, closingDay: number, dueDay: number) {
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
  // Due date is in the month of closingNext (or same month if dueDay > closingDay)
  const dueMonth = dueDay > closingDay ? closingNext.getMonth() : closingNext.getMonth() + 1;
  const dueYear = closingNext.getFullYear();
  const dueDate = new Date(
    dueYear,
    dueMonth,
    Math.min(dueDay, new Date(dueYear, dueMonth + 1, 0).getDate())
  );
  return { from: closingPrev, to: closingNext, dueDate };
}

export function CreditCardInvoice({ card, onClose }: Props) {
  const { expenses } = useExpenses();
  const { getOpening, upsertOpening } = useCreditCardOpenings();
  const { mask } = useHideValues();
  const bank = getBank(card.bank);
  const [cycleOffset, setCycleOffset] = useState(0); // 0 = current, -1 = previous
  const [editingOpening, setEditingOpening] = useState(false);

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

  const cardTag = (card.nickname || card.lastFour || "").toLowerCase();

  const items = useMemo(() => {
    return expenses
      .filter((e) => e.scope === "personal")
      .filter((e) => /\[\s*cr[eé]dito\s*\]/i.test(e.notes ?? ""))
      .filter((e) => {
        // Optional card-specific filter: if notes mention nickname or last4
        if (!cardTag) return true;
        const n = (e.notes ?? "").toLowerCase();
        if (n.includes(cardTag)) return true;
        // Also accept generic [Crédito] when no card hint exists in notes
        return !/cart[aã]o[:\s]/i.test(n);
      })
      .filter((e) => {
        const d = new Date(e.dueDate + "T00:00:00");
        return d > cycle.from && d <= cycle.to;
      })
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [expenses, cycle, cardTag]);

  const transactionsTotal = items.reduce((s, e) => {
    const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
    return s + (isRec ? e.amount / e.installments! : e.amount);
  }, 0);
  const total = transactionsTotal + openingAmount;

  const utilization = card.creditLimit > 0 ? (total / card.creditLimit) * 100 : 0;

  return (
    <div
      className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <Card
        no3d
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="flex flex-row items-center justify-between sticky top-0 bg-card z-10 border-b">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Fatura — {bank.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {card.nickname && <span>{card.nickname} · </span>}
              •••• {card.lastFour || "0000"} · {brandLabel(card.brand)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Cycle nav */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCycleOffset((o) => o - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Período</p>
              <p className="text-sm font-medium">
                {format(cycle.from, "dd/MM", { locale: ptBR })} —{" "}
                {format(cycle.to, "dd/MM/yy", { locale: ptBR })}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Vence em {format(cycle.dueDate, "dd 'de' MMM", { locale: ptBR })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCycleOffset((o) => o + 1)}
              disabled={cycleOffset >= 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Total */}
          <div className="rounded-xl bg-muted/40 p-4 text-center">
            <p className="text-xs text-muted-foreground">Total da fatura</p>
            <p className="text-2xl font-bold text-foreground mt-1">{mask(fmt(total))}</p>
            {card.creditLimit > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {utilization.toFixed(0)}% do limite ({mask(fmt(card.creditLimit))})
              </p>
            )}
            {openingAmount > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Saldo inicial {mask(fmt(openingAmount))} + lançamentos {mask(fmt(transactionsTotal))}
              </p>
            )}
          </div>

          {/* Opening (saldo inicial) — destacado no topo */}
          <div className="space-y-2">
            {opening ? (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5">
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
                  <p className="text-sm font-semibold text-foreground">
                    {mask(fmt(openingAmount))}
                  </p>
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

            {/* Items */}
            {items.length === 0 && !opening ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                Nenhum lançamento neste período.
                <p className="text-xs mt-2 max-w-sm mx-auto">
                  Para vincular despesas a este cartão, marque a forma de pagamento como
                  "Crédito" e mencione "{card.nickname || card.lastFour}" nas observações.
                </p>
              </div>
            ) : (
              items.map((e) => {
                const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
                const value = isRec ? e.amount / e.installments! : e.amount;
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {e.description}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] py-0 h-4">
                          {e.category}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(e.dueDate + "T00:00:00"), "dd/MM", { locale: ptBR })}
                        </span>
                        {isRec && (
                          <span className="text-[11px] text-muted-foreground">
                            {e.installments}x
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0">
                      {mask(fmt(value))}
                    </p>
                  </div>
                );
              })
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
          onSave={async (amount, notes) => {
            await upsertOpening(card.id, cycleKey, amount, notes);
          }}
        />
      )}
    </div>
  );
}
