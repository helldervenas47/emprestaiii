import { useState, useEffect } from "react";
import { Receipt } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardName: string;
  cycleLabel: string;
  initialAmount?: number;
  initialNotes?: string | null;
  onSave: (amount: number, notes: string) => Promise<void> | void;
}

export function CreditCardOpeningDialog({
  open,
  onOpenChange,
  cardName,
  cycleLabel,
  initialAmount,
  initialNotes,
  onSave,
}: Props) {
  const [amountStr, setAmountStr] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmountStr(initialAmount && initialAmount > 0 ? String(initialAmount).replace(".", ",") : "");
      setNotes(initialNotes ?? "");
    }
  }, [open, initialAmount, initialNotes]);

  const handleSave = async () => {
    const amount = parseFloat(amountStr.replace(",", "."));
    if (isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      await onSave(amount, notes.trim());
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Adicionar fatura do mês
          </DialogTitle>
          <DialogDescription>
            {cardName} · ciclo {cycleLabel}
            <br />
            Informe o valor já existente da fatura (despesas anteriores não
            registradas). Novas transações serão somadas a este valor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="opening-amount">Valor inicial da fatura</Label>
            <Input
              id="opening-amount"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opening-notes">Observações (opcional)</Label>
            <Textarea
              id="opening-notes"
              rows={2}
              placeholder="Ex: fatura aberta antes de começar a usar o app"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !amountStr}>
            {saving ? "Salvando..." : "Salvar fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
