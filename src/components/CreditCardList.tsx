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

  // Cards stacked like a wallet — overlap when collapsed, fan out sideways when expanded
  const STACK_PEEK = 22; // px visible of each card when collapsed (vertical)
  const SIDE_PEEK_PCT = 22; // % of card width revealed for each next card when expanded
  const CARD_W = "14rem"; // smaller card width

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
                className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : "rotate-180"}`}
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
        <div className="w-full overflow-x-auto pb-2">
          <div
            className="relative mx-auto transition-all duration-500 ease-out"
            style={
              expanded
                ? {
                    width: `calc(${CARD_W} + (${CARD_W} * ${SIDE_PEEK_PCT / 100}) * ${cards.length - 1})`,
                    minWidth: CARD_W,
                    paddingBottom: `calc(${CARD_W} / 1.586)`,
                  }
                : {
                    width: CARD_W,
                    paddingBottom: `calc((${CARD_W} / 1.586) + ${(cards.length - 1) * STACK_PEEK}px)`,
                  }
            }
          >
            {cards.map((card, i) => {
              const positionStyle: React.CSSProperties = expanded
                ? {
                    left: `calc((${CARD_W} * ${SIDE_PEEK_PCT / 100}) * ${i})`,
                    top: 0,
                    width: CARD_W,
                    zIndex: i + 1,
                  }
                : {
                    left: 0,
                    width: CARD_W,
                    top: `${i * STACK_PEEK}px`,
                    zIndex: i + 1,
                  };
              return (
                <div
                  key={card.id}
                  className="absolute transition-all duration-500 ease-out cursor-pointer hover:-translate-y-1"
                  style={positionStyle}
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
