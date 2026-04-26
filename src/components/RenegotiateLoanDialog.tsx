import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Loan, LoanRenegotiation, Payment } from "@/types/loan";
import { getLoanRemainingAmount } from "@/hooks/useLoans";
import { toast } from "sonner";
import { History, AlertTriangle } from "lucide-react";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  payments: Payment[];
  history: LoanRenegotiation[];
  onConfirm: (params: {
    type: "no_interest" | "with_penalty";
    penaltyMode?: "fixed" | "percentage" | null;
    penaltyInput?: number | null;
    newInstallments?: number | null;
    notes?: string | null;
  }) => Promise<void>;
}

export function RenegotiateLoanDialog({
  open,
  onOpenChange,
  loan,
  payments,
  history,
  onConfirm,
}: Props) {
  const [type, setType] = useState<"no_interest" | "with_penalty">("no_interest");
  const [penaltyMode, setPenaltyMode] = useState<"fixed" | "percentage">("fixed");
  const [penaltyInput, setPenaltyInput] = useState("");
  const [newInstallments, setNewInstallments] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const remaining = useMemo(
    () => getLoanRemainingAmount(loan, payments),
    [loan, payments]
  );

  const remainingPending = Math.max(1, loan.installments - loan.paidInstallments);

  const penaltyAmount = useMemo(() => {
    if (type !== "with_penalty") return 0;
    const v = parseFloat(penaltyInput.replace(",", ".")) || 0;
    if (v <= 0) return 0;
    if (penaltyMode === "percentage") return Math.round((remaining * v / 100) * 100) / 100;
    return Math.round(v * 100) / 100;
  }, [type, penaltyMode, penaltyInput, remaining]);

  const newTotal = Math.round((remaining + penaltyAmount) * 100) / 100;

  const installmentsCount = useMemo(() => {
    const n = parseInt(newInstallments) || 0;
    return n > 0 ? n : remainingPending;
  }, [newInstallments, remainingPending]);

  const newInstallmentValue = installmentsCount > 0
    ? Math.round((newTotal / installmentsCount) * 100) / 100
    : 0;

  const reset = () => {
    setType("no_interest");
    setPenaltyMode("fixed");
    setPenaltyInput("");
    setNewInstallments("");
    setNotes("");
    setConfirming(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (type === "with_penalty") {
      const v = parseFloat(penaltyInput.replace(",", ".")) || 0;
      if (v <= 0) {
        toast.error("Informe o valor da multa");
        return;
      }
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      setSubmitting(true);
      await onConfirm({
        type,
        penaltyMode: type === "with_penalty" ? penaltyMode : null,
        penaltyInput: type === "with_penalty"
          ? parseFloat(penaltyInput.replace(",", ".")) || 0
          : null,
        newInstallments: parseInt(newInstallments) || null,
        notes: notes.trim() || null,
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao registrar renegociação");
    } finally {
      setSubmitting(false);
    }
  };

  const sortedHistory = [...history].sort((a, b) =>
    (b.renegotiatedAt || "").localeCompare(a.renegotiatedAt || "")
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Renegociar contrato</DialogTitle>
          <DialogDescription>
            {loan.borrowerName} · saldo atual {formatCurrency(remaining)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data de saída</span>
              <span className="font-medium">{loan.startDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo a renegociar</span>
              <span className="font-medium">{formatCurrency(remaining)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas pendentes</span>
              <span className="font-medium">{remainingPending}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de renegociação</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => {
                setType(v as any);
                setConfirming(false);
              }}
              className="grid grid-cols-1 gap-2"
            >
              <label
                htmlFor="reneg-no-interest"
                className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40"
              >
                <RadioGroupItem value="no_interest" id="reneg-no-interest" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Sem juros</p>
                  <p className="text-xs text-muted-foreground">
                    Apenas ajusta prazo/parcelas. Não adiciona valor extra.
                  </p>
                </div>
              </label>
              <label
                htmlFor="reneg-with-penalty"
                className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/40"
              >
                <RadioGroupItem value="with_penalty" id="reneg-with-penalty" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Com multa (reajuste)</p>
                  <p className="text-xs text-muted-foreground">
                    Adiciona uma multa de renegociação (R$ ou %) ao total.
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>

          {type === "with_penalty" && (
            <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <Label className="text-xs">Multa de renegociação</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant={penaltyMode === "fixed" ? "default" : "outline"}
                  className="flex-1 h-8 text-xs"
                  onClick={() => { setPenaltyMode("fixed"); setConfirming(false); }}
                >
                  R$ fixo
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant={penaltyMode === "percentage" ? "default" : "outline"}
                  className="flex-1 h-8 text-xs"
                  onClick={() => { setPenaltyMode("percentage"); setConfirming(false); }}
                >
                  % do saldo
                </Button>
              </div>
              <Input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder={penaltyMode === "percentage" ? "Ex: 10 (%)" : "Ex: 100,00 (R$)"}
                value={penaltyInput}
                onChange={(e) => { setPenaltyInput(e.target.value); setConfirming(false); }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Novo nº de parcelas pendentes (opcional)</Label>
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              placeholder={`Manter: ${remainingPending}`}
              value={newInstallments}
              onChange={(e) => { setNewInstallments(e.target.value); setConfirming(false); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Anote o motivo da renegociação..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5 text-xs">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
              Pré-visualização
            </p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo anterior</span>
              <span>{formatCurrency(remaining)}</span>
            </div>
            {type === "with_penalty" && (
              <div className="flex justify-between text-warning">
                <span>+ Multa de renegociação</span>
                <span>{formatCurrency(penaltyAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground border-t border-border/50 pt-1.5">
              <span>Novo total</span>
              <span>{formatCurrency(newTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas</span>
              <span>
                {installmentsCount}× de {formatCurrency(newInstallmentValue)}
              </span>
            </div>
          </div>

          {sortedHistory.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <History className="h-3.5 w-3.5" /> Histórico ({sortedHistory.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {sortedHistory.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-md border border-border/50 bg-muted/30 p-2 text-[11px] space-y-0.5"
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">{r.renegotiatedAt}</span>
                      <span
                        className={
                          r.type === "with_penalty"
                            ? "text-warning font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {r.type === "with_penalty" ? "Com multa" : "Sem juros"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{formatCurrency(r.previousAmount)} → {formatCurrency(r.newAmount)}</span>
                      {r.penaltyAmount > 0 && (
                        <span className="text-warning">
                          +{formatCurrency(r.penaltyAmount)}
                          {r.penaltyMode === "percentage" && r.penaltyInput
                            ? ` (${r.penaltyInput}%)`
                            : ""}
                        </span>
                      )}
                    </div>
                    {r.notes && (
                      <p className="text-muted-foreground italic">{r.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {confirming && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p>
                Confirma a renegociação? Esta ação será gravada no histórico permanente do contrato.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Salvando..." : confirming ? "Confirmar renegociação" : "Renegociar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
