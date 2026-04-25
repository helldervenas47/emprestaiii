import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Expense } from "@/types/loan";
import { personalCategories, resolvePersonalIcon } from "@/lib/personalExpenseCategories";
import { usePersonalExpenseCategories } from "@/hooks/usePersonalExpenseCategories";
import { useCreditCards } from "@/hooks/useCreditCards";
import { Package } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expense: Expense | null;
  warning?: string | null;
  onSave: (patch: {
    description: string;
    amount: number;
    dueDate: string;
    category: string;
    notes: string | null;
  }) => Promise<void> | void;
}

const PAYMENT_METHODS = ["Dinheiro", "Pix", "Débito", "Crédito", "Boleto", "Débito automático"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const PAYMENT_TAG_RE = /\[\s*(Dinheiro|Pix|D[ée]bito autom[áa]tico|D[ée]bito|Cr[eé]dito|Boleto)\s*\]/i;
const CARD_LINE_RE = /\[\s*Cr[eé]dito\s*\][^\n]*Cart[ãa]o:\s*([^\n(]+?)(?:\s*\(vence[^)]*\))?\s*(?:\n|$)/i;
// Rastreabilidade: marcador de edição
const EDITED_RE = /\n?\[\s*Editado em [^\]]+\]\s*$/i;

/** Detect current payment method from notes; defaults to Pix. */
function detectPaymentMethod(notes: string | null | undefined): PaymentMethod {
  if (!notes) return "Pix";
  const m = notes.match(PAYMENT_TAG_RE);
  if (!m) return "Pix";
  const v = m[1].toLowerCase();
  if (v.startsWith("din")) return "Dinheiro";
  if (v === "pix") return "Pix";
  if (v.startsWith("déb autom") || v.startsWith("deb autom") || v.includes("automá") || v.includes("automa")) return "Débito automático";
  if (v.startsWith("déb") || v.startsWith("deb")) return "Débito";
  if (v.startsWith("cré") || v.startsWith("cre")) return "Crédito";
  if (v.startsWith("bol")) return "Boleto";
  return "Pix";
}

/** Detect linked credit card tag (nickname or lastFour) from notes. */
function detectCardTag(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(CARD_LINE_RE);
  return m ? m[1].trim() : null;
}

/** Strip payment tag, card line, and edited marker from notes — leaving only the user's free-text. */
function extractFreeNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  let n = notes;
  // Remove the [Crédito] Cartão: ... line entirely
  n = n.replace(CARD_LINE_RE, "").trim();
  // Remove any [Method] tag
  n = n.replace(PAYMENT_TAG_RE, "").trim();
  // Remove edited marker
  n = n.replace(EDITED_RE, "").trim();
  return n;
}

/**
 * Rebuild the notes payload preserving the same conventions used by
 * the Telegram bot and the manual form, then append an "Editado em" marker
 * for traceability.
 */
function buildNotes(opts: {
  paymentMethod: PaymentMethod;
  cardTag: string | null;
  freeNotes: string;
}): string {
  const lines: string[] = [];
  if (opts.paymentMethod === "Crédito" && opts.cardTag) {
    lines.push(`[Crédito] Cartão: ${opts.cardTag}`);
  } else {
    lines.push(`[${opts.paymentMethod}]`);
  }
  if (opts.freeNotes.trim()) lines.push(opts.freeNotes.trim());
  lines.push(`[Editado em ${format(new Date(), "dd/MM/yy HH:mm")}]`);
  return lines.join("\n");
}

export function ExpenseEditDialog({
  open,
  onOpenChange,
  expense,
  warning,
  onSave,
}: Props) {
  const { cards } = useCreditCards();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Pix");
  const [cardId, setCardId] = useState<string>("");
  const [freeNotes, setFreeNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Hydrate from expense
  useEffect(() => {
    if (!expense) return;
    setDescription(expense.description);
    setAmount(String(expense.amount));
    setDueDate(expense.dueDate);
    setCategory(expense.category ?? "");
    const pm = detectPaymentMethod(expense.notes);
    setPaymentMethod(pm);
    setFreeNotes(extractFreeNotes(expense.notes));
    // Try to map the card tag to a known card; default to Nubank when Crédito and no tag
    const tag = detectCardTag(expense.notes);
    if (tag && cards.length) {
      const lower = tag.toLowerCase();
      const found = cards.find(
        (c) =>
          c.nickname.toLowerCase() === lower ||
          c.lastFour === tag ||
          c.bank.toLowerCase() === lower,
      );
      setCardId(found?.id ?? "");
    } else if (pm === "Crédito" && cards.length) {
      const nubank = cards.find(
        (c) =>
          c.bank?.toLowerCase().includes("nubank") ||
          c.nickname?.toLowerCase().includes("nubank"),
      );
      setCardId((nubank ?? cards[0]).id);
    } else {
      setCardId("");
    }
  }, [expense, cards]);

  const wasEdited = useMemo(
    () => !!expense?.notes && EDITED_RE.test(expense.notes),
    [expense],
  );

  if (!expense) return null;

  const isParcelada =
    expense.type === "recorrente" && (expense.installments ?? 0) > 1;

  const selectedCard = cards.find((c) => c.id === cardId) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
          <DialogDescription>
            {isParcelada
              ? `Esta despesa é parcelada (${expense.installments}x). A edição altera o valor total e impacta todas as parcelas.`
              : "Altere os dados do lançamento. As alterações refletem em todos os relatórios."}
          </DialogDescription>
        </DialogHeader>

        {wasEdited && (
          <div className="text-[11px] rounded-md bg-muted text-muted-foreground border px-3 py-1.5">
            ✎ Esta despesa já foi editada anteriormente.
          </div>
        )}

        {warning && (
          <div className="text-xs rounded-md bg-warning/10 text-warning-foreground border border-warning/30 px-3 py-2">
            ⚠ {warning}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">
                Valor {isParcelada ? "(total)" : ""}
              </Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Data de vencimento</Label>
              <DatePickerField
                value={dueDate}
                onChange={setDueDate}
                placeholder="Selecione a data"
              />
            </div>
          </div>

          {isParcelada && Number(amount) > 0 && (expense.installments ?? 0) > 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Valor por parcela:{" "}
              <span className="font-semibold text-foreground">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                  Number(amount) / (expense.installments as number),
                )}
              </span>{" "}
              ({expense.installments}x)
            </div>
          )}

          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a categoria" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {personalCategories.map((c) => {
                  const Icon = c.icon;
                  return (
                    <SelectItem key={c.name} value={c.name}>
                      <span className="inline-flex items-center gap-2">
                        <Icon
                          className="h-3.5 w-3.5"
                          style={{ color: `hsl(${c.color})` }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v as PaymentMethod);
                  if (v !== "Crédito") setCardId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {paymentMethod === "Crédito" && (
              <div>
                <Label className="text-xs">Cartão</Label>
                <Select value={cardId} onValueChange={setCardId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        Nenhum cartão cadastrado
                      </div>
                    )}
                    {cards.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nickname || c.bank}
                        {c.lastFour ? ` ····${c.lastFour}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={freeNotes}
              onChange={(e) => setFreeNotes(e.target.value)}
              rows={2}
              placeholder="Detalhes adicionais (opcional)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={
              saving ||
              !description ||
              !amount ||
              !category ||
              (paymentMethod === "Crédito" && !cardId)
            }
            onClick={async () => {
              setSaving(true);
              try {
                const cardTag = selectedCard
                  ? selectedCard.nickname || selectedCard.lastFour || selectedCard.bank
                  : null;
                const notes = buildNotes({
                  paymentMethod,
                  cardTag: paymentMethod === "Crédito" ? cardTag : null,
                  freeNotes,
                });
                await onSave({
                  description,
                  amount: Number(amount),
                  dueDate,
                  category,
                  notes,
                });
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
