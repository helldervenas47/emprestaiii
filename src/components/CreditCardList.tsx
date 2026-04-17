import { useState, useMemo } from "react";
import { Plus, CreditCard as CreditCardIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreditCards, CreditCard } from "@/hooks/useCreditCards";
import { useIsMobile } from "@/hooks/use-mobile";
import { CreditCardItem } from "./CreditCardItem";
import { CreditCardForm } from "./CreditCardForm";
import { CreditCardInvoice } from "./CreditCardInvoice";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";

interface Props {
  readOnly?: boolean;
}

export function CreditCardList({ readOnly = false }: Props) {
  const { cards, loading, addCard, updateCard, deleteCard } = useCreditCards();
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CreditCard | null>(null);
  const [deleting, setDeleting] = useState<CreditCard | null>(null);
  const [invoiceCard, setInvoiceCard] = useState<CreditCard | null>(null);
  const [showMobileList, setShowMobileList] = useState(false);
  const [dueFilter, setDueFilter] = useState<string>("all");

  const handleNew = () => {
    setEditing(null);
    setShowForm(true);
  };

  const handleEdit = (card: CreditCard) => {
    setEditing(card);
    setShowForm(true);
  };

  // Build the list of due-day options actually in use
  const dueDayOptions = useMemo(() => {
    const set = new Set<number>();
    cards.forEach((c) => set.add(c.dueDay));
    return Array.from(set).sort((a, b) => a - b);
  }, [cards]);

  const filteredCards = useMemo(() => {
    if (dueFilter === "all") return cards;
    return cards.filter((c) => String(c.dueDay) === dueFilter);
  }, [cards, dueFilter]);

  const handleCardClick = (card: CreditCard) => {
    if (isMobile && !showMobileList) {
      setShowMobileList(true);
    } else {
      setInvoiceCard(card);
    }
  };

  const renderCardGrid = (list: CreditCard[]) => (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((card) => (
        <div
          key={card.id}
          className="cursor-pointer transition-transform hover:-translate-y-1"
          onClick={() => handleCardClick(card)}
        >
          <CreditCardItem
            card={card}
            onEdit={readOnly ? undefined : () => handleEdit(card)}
            onDelete={readOnly ? undefined : () => setDeleting(card)}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Cartões ({filteredCards.length}
          {filteredCards.length !== cards.length ? `/${cards.length}` : ""})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {dueDayOptions.length > 0 && (
            <Select value={dueFilter} onValueChange={setDueFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Vencimento" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">Todos vencimentos</SelectItem>
                {dueDayOptions.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    Vence dia {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
      ) : filteredCards.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          Nenhum cartão com esse vencimento
        </div>
      ) : isMobile ? (
        // Mobile: stacked vertically (one column), tapping any card opens full-screen list
        <div className="flex flex-col gap-3">
          {filteredCards.map((card) => (
            <div
              key={card.id}
              className="cursor-pointer"
              onClick={() => handleCardClick(card)}
            >
              <CreditCardItem card={card} readOnly />
            </div>
          ))}
        </div>
      ) : (
        // Desktop / tablet: grid layout side by side
        renderCardGrid(filteredCards)
      )}

      {/* Mobile full-screen list of all cards */}
      {showMobileList && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="sticky top-0 bg-background border-b border-border flex items-center justify-between px-4 py-3 z-10">
            <h2 className="text-lg font-semibold text-foreground">
              Meus cartões
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMobileList(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-4 space-y-3">
            {filteredCards.map((card) => (
              <div
                key={card.id}
                className="cursor-pointer"
                onClick={() => {
                  setShowMobileList(false);
                  setInvoiceCard(card);
                }}
              >
                <CreditCardItem
                  card={card}
                  onEdit={readOnly ? undefined : () => {
                    setShowMobileList(false);
                    handleEdit(card);
                  }}
                  onDelete={readOnly ? undefined : () => {
                    setDeleting(card);
                  }}
                  readOnly={readOnly}
                />
              </div>
            ))}
            {!readOnly && (
              <Button
                onClick={() => {
                  setShowMobileList(false);
                  handleNew();
                }}
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-1" /> Novo Cartão
              </Button>
            )}
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
