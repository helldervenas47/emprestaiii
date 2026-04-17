import { useState } from "react";
import { Plus, CreditCard as CreditCardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreditCards, CreditCard } from "@/hooks/useCreditCards";
import { CreditCardItem } from "./CreditCardItem";
import { CreditCardForm } from "./CreditCardForm";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

interface Props {
  readOnly?: boolean;
}

export function CreditCardList({ readOnly = false }: Props) {
  const { cards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState<CreditCard | null>(null);

  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (card: CreditCard) => {
    setEditing(card);
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Cartões ({cards.length})
        </h2>
        {!readOnly && (
          <Button onClick={handleNew} size="sm">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((card) => (
            <CreditCardItem
              key={card.id}
              card={card}
              onEdit={() => handleEdit(card)}
              onDelete={() => setDeleting(card)}
              readOnly={readOnly}
            />
          ))}
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
