import { useEffect, useState } from "react";
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
import { Expense } from "@/types/loan";

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

export function ExpenseEditDialog({
  open,
  onOpenChange,
  expense,
  warning,
  onSave,
}: Props) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setDueDate(expense.dueDate);
      setCategory(expense.category ?? "");
      setNotes(expense.notes ?? "");
    }
  }, [expense]);

  if (!expense) return null;

  const isParcelada =
    expense.type === "recorrente" && (expense.installments ?? 0) > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar lançamento</DialogTitle>
          <DialogDescription>
            {isParcelada
              ? `Esta despesa é parcelada (${expense.installments}x). A edição altera o valor total e impacta todas as parcelas.`
              : "Altere os dados do lançamento. O total da fatura será recalculado automaticamente."}
          </DialogDescription>
        </DialogHeader>

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
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !description || !amount}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  description,
                  amount: Number(amount),
                  dueDate,
                  category,
                  notes: notes || null,
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
