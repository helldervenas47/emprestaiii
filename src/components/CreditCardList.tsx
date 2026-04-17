import { useState } from "react";
import { Plus, CreditCard as CreditCardIcon, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreditCards, CreditCard } from "@/hooks/useCreditCards";
import { CreditCardItem } from "./CreditCardItem";
import { CreditCardForm } from "./CreditCardForm";
import { CreditCardInvoice } from "./CreditCardInvoice";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

interface Props {
  readOnly?: boolean;
}

export function CreditCardList({ readOnly = false }: Props) {
  const { cards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState<CreditCard | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);

  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (card: CreditCard) => {
    setEditing(card);
    setShowForm(true);
  };

  // Cards stacked like a wallet — overlap when collapsed, fan out when expanded
  const STACK_PEEK = 28; // px visible of each card when collapsed
  const EXPANDED_GAP = 16; // px gap between cards when expanded

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Cartões ({cards.length})
        </h2>
        <div className="flex items-center gap-2">
          {cards.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="gap-1"
            >
              <ChevronUp
                className={`h-4 w-4 transition-transform ${expanded ? "" : "rotate-180"}`}
              />
              {expanded ? "Recolher" : "Expandir"}
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
        <div
          className="relative mx-auto max-w-md"
          style={{
            // Wallet container height adapts to expanded state
            // Card aspect 1.586:1 → for max-w-md (~28rem ≈ 448px) height ≈ 282px
            // Use CSS aspect via the first card; container needs to grow when expanded
            height: expanded
              ? `calc((100% / 1.586) + ${(cards.length - 1) * EXPANDED_GAP}px + ${
                  (cards.length - 1) * 100
                }%)`
              : `calc((100% / 1.586) + ${(cards.length - 1) * STACK_PEEK}px)`,
            // The above height-as-percent doesn't work; fall back to JS-friendly aspect via padding hack below
          }}
        >
          {/* Use a sizing wrapper to compute heights from width via aspect-ratio */}
          <div
            className="relative w-full"
            style={{
              // Total stack height: first card fully + extra peek/gap per remaining
              paddingBottom: expanded
                ? `calc((100% / 1.586) * ${cards.length} + ${
                    (cards.length - 1) * EXPANDED_GAP
                  }px)`
                : `calc((100% / 1.586) + ${(cards.length - 1) * STACK_PEEK}px)`,
            }}
          >
            {cards.map((card, i) => {
              const top = expanded
                ? `calc((100% / 1.586) * ${i} + ${i * EXPANDED_GAP}px)`
                : `${i * STACK_PEEK}px`;
              return (
                <div
                  key={card.id}
                  className="absolute left-0 right-0 transition-all duration-500 ease-out cursor-pointer hover:-translate-y-1"
                  style={{
                    top,
                    zIndex: i + 1,
                  }}
                  onClick={() => {
                    if (!expanded && cards.length > 1) {
                      setExpanded(true);
                    } else {
                      setInvoiceCard(card);
                    }
                  }}
                >
                  <CreditCardItem
                    card={card}
                    onEdit={expanded ? () => handleEdit(card) : undefined}
                    onDelete={expanded ? () => setDeleting(card) : undefined}
                    readOnly={readOnly || !expanded}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <p className="text-center text-xs text-muted-foreground mt-4">
          {expanded
            ? "Clique em um cartão para ver a fatura"
            : cards.length > 1
            ? "Clique na pilha para expandir"
            : "Clique no cartão para ver a fatura"}
        </p>
      )}

      {/* Single-card click also opens invoice */}
      {cards.length === 1 && !expanded && (
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          // The single-card case is handled inside the map above (always opens invoice when length===1)
        />
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
