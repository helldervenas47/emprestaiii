import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loan, LoanRenegotiation, Payment, InstallmentSchedule } from "@/types/loan";
import { getLoanRemainingAmount } from "@/hooks/useLoans";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { toast } from "sonner";
import { History, AlertTriangle, ListChecks, CalendarDays, Pencil, Trash2, Save, X } from "lucide-react";

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateBR = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: Loan;
  payments: Payment[];
  installmentSchedules?: InstallmentSchedule[];
  history: LoanRenegotiation[];
  onConfirm: (params: {
    type: "no_interest" | "with_penalty";
    penaltyMode?: "fixed" | "percentage" | null;
    penaltyInput?: number | null;
    newInstallments?: number | null;
    notes?: string | null;
    selectedInstallmentNumbers?: number[] | null;
    firstDueDate?: string | null;
  }) => Promise<void>;
}

export function RenegotiateLoanDialog({
  open,
  onOpenChange,
  loan,
  payments,
  installmentSchedules = [],
  history,
  onConfirm,
}: Props) {
  const [type, setType] = useState<"no_interest" | "with_penalty">("no_interest");
  const [penaltyMode, setPenaltyMode] = useState<"fixed" | "percentage">("fixed");
  const [penaltyInput, setPenaltyInput] = useState("");
  const [newInstallments, setNewInstallments] = useState("");
  const [notes, setNotes] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isInstallmentLoan = loan.paymentType === "Parcelado" && loan.installments > 1;

  // Parcelas pendentes do contrato
  const pendingInstallments = useMemo(() => {
    return installmentSchedules
      .filter((s) => s.loanId === loan.id && s.installmentNumber > loan.paidInstallments)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
  }, [installmentSchedules, loan.id, loan.paidInstallments]);

  const [selectedNumbers, setSelectedNumbers] = useState<Set<number>>(new Set());

  // Inicializa seleção: todas as parcelas pendentes selecionadas por padrão
  useEffect(() => {
    if (open) {
      setSelectedNumbers(new Set(pendingInstallments.map((p) => p.installmentNumber)));
      // Default: primeira data pendente ou dueDate do contrato
      const defaultDate = pendingInstallments[0]?.dueDate || loan.dueDate || "";
      setFirstDueDate(defaultDate ? defaultDate.slice(0, 10) : "");
    }
  }, [open, pendingInstallments, loan.dueDate]);

  const totalRemaining = useMemo(
    () => getLoanRemainingAmount(loan, payments),
    [loan, payments]
  );

  // Saldo a renegociar = soma das parcelas selecionadas (para parcelado),
  // ou saldo total (para outros tipos / sem cronograma)
  const remaining = useMemo(() => {
    if (isInstallmentLoan && pendingInstallments.length > 0) {
      const sum = pendingInstallments
        .filter((p) => selectedNumbers.has(p.installmentNumber))
        .reduce((acc, p) => acc + Number(p.amount || 0), 0);
      return Math.round(sum * 100) / 100;
    }
    return totalRemaining;
  }, [isInstallmentLoan, pendingInstallments, selectedNumbers, totalRemaining]);

  const selectedCount = isInstallmentLoan
    ? Array.from(selectedNumbers).length
    : Math.max(1, loan.installments - loan.paidInstallments);

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
    if (n > 0) return n;
    return isInstallmentLoan ? Math.max(1, selectedCount) : remainingPending;
  }, [newInstallments, remainingPending, isInstallmentLoan, selectedCount]);

  const newInstallmentValue = installmentsCount > 0
    ? Math.round((newTotal / installmentsCount) * 100) / 100
    : 0;

  // Simula o novo cronograma de parcelas pendentes (não selecionadas + novas geradas)
  const simulatedSchedule = useMemo(() => {
    const overrideDate = firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) ? firstDueDate : null;

    if (!isInstallmentLoan || pendingInstallments.length === 0) {
      const result: { number: number; dueDate: string; amount: number; isNew: boolean }[] = [];
      const baseDate = overrideDate || loan.dueDate;
      let acc = 0;
      for (let i = 0; i < installmentsCount; i++) {
        const d = new Date(baseDate + "T00:00:00");
        if (!isNaN(d.getTime())) d.setMonth(d.getMonth() + i);
        const dueStr = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : baseDate;
        const isLast = i === installmentsCount - 1;
        const amt = isLast
          ? Math.round((newTotal - acc) * 100) / 100
          : newInstallmentValue;
        acc += amt;
        result.push({
          number: loan.paidInstallments + i + 1,
          dueDate: dueStr,
          amount: amt,
          isNew: true,
        });
      }
      return result;
    }

    const remainingPendingScheds = pendingInstallments.filter(
      (s) => !selectedNumbers.has(s.installmentNumber)
    );
    const isPartial = selectedNumbers.size < pendingInstallments.length;

    const lastDate = remainingPendingScheds.length > 0
      ? remainingPendingScheds[remainingPendingScheds.length - 1].dueDate
      : (pendingInstallments[pendingInstallments.length - 1]?.dueDate || loan.dueDate);

    const firstSelectedDate = !isPartial
      ? (pendingInstallments.find((s) => selectedNumbers.has(s.installmentNumber))?.dueDate || loan.dueDate)
      : null;

    // Gera novas parcelas
    const newScheds: { dueDate: string; amount: number }[] = [];
    let acc = 0;
    for (let i = 0; i < installmentsCount; i++) {
      let dueStr: string;
      if (overrideDate) {
        const d = new Date(overrideDate + "T00:00:00");
        if (!isNaN(d.getTime())) d.setMonth(d.getMonth() + i);
        dueStr = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : overrideDate;
      } else if (!isPartial && i === 0 && firstSelectedDate) {
        dueStr = firstSelectedDate;
      } else {
        const baseDate = !isPartial && firstSelectedDate ? firstSelectedDate : lastDate;
        const offsetMonths = !isPartial && firstSelectedDate ? i : (i + 1);
        const d = new Date(baseDate + "T00:00:00");
        if (!isNaN(d.getTime())) d.setMonth(d.getMonth() + offsetMonths);
        dueStr = !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : baseDate;
      }
      const isLast = i === installmentsCount - 1;
      const amt = isLast
        ? Math.round((newTotal - acc) * 100) / 100
        : newInstallmentValue;
      acc += amt;
      newScheds.push({ dueDate: dueStr, amount: amt });
    }

    const combined = [
      ...remainingPendingScheds.map((s) => ({
        dueDate: s.dueDate,
        amount: Number(s.amount || 0),
        isNew: false,
      })),
      ...newScheds.map((s) => ({ dueDate: s.dueDate, amount: s.amount, isNew: true })),
    ].sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return combined.map((item, i) => ({
      number: loan.paidInstallments + i + 1,
      dueDate: item.dueDate,
      amount: item.amount,
      isNew: item.isNew,
    }));
  }, [
    isInstallmentLoan,
    pendingInstallments,
    selectedNumbers,
    installmentsCount,
    newInstallmentValue,
    newTotal,
    loan.dueDate,
    loan.paidInstallments,
    firstDueDate,
  ]);

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

  const toggleAll = () => {
    if (selectedNumbers.size === pendingInstallments.length) {
      setSelectedNumbers(new Set());
    } else {
      setSelectedNumbers(new Set(pendingInstallments.map((p) => p.installmentNumber)));
    }
    setConfirming(false);
  };

  const toggleOne = (n: number) => {
    const next = new Set(selectedNumbers);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setSelectedNumbers(next);
    setConfirming(false);
  };

  const handleSubmit = async () => {
    if (isInstallmentLoan && pendingInstallments.length > 0 && selectedNumbers.size === 0) {
      toast.error("Selecione ao menos uma parcela para renegociar");
      return;
    }
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
        selectedInstallmentNumbers:
          isInstallmentLoan && pendingInstallments.length > 0
            ? Array.from(selectedNumbers).sort((a, b) => a - b)
            : null,
        firstDueDate: firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDueDate) ? firstDueDate : null,
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

  const allSelected =
    pendingInstallments.length > 0 && selectedNumbers.size === pendingInstallments.length;

  // Tabs: "renegociar" | "history"
  const [activeTab, setActiveTab] = useState<"renegotiate" | "history">("renegotiate");
  useEffect(() => { if (open) setActiveTab("renegotiate"); }, [open]);

  // Edit/Delete renegotiation history
  const { updateRenegotiation, deleteRenegotiation } = useLoanRenegotiations();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editType, setEditType] = useState<"no_interest" | "with_penalty">("no_interest");
  const [editPenaltyMode, setEditPenaltyMode] = useState<"fixed" | "percentage">("fixed");
  const [editPenaltyInput, setEditPenaltyInput] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const startEdit = (r: LoanRenegotiation) => {
    setEditingId(r.id);
    setEditNotes(r.notes ?? "");
    setEditType(r.type);
    setEditPenaltyMode((r.penaltyMode as any) ?? "fixed");
    setEditPenaltyInput(r.penaltyInput != null ? String(r.penaltyInput) : "");
  };
  const cancelEdit = () => {
    setEditingId(null);
  };
  const saveEdit = async () => {
    if (!editingId) return;
    try {
      setSavingEdit(true);
      const penaltyVal = editType === "with_penalty"
        ? (parseFloat(editPenaltyInput.replace(",", ".")) || 0) || null
        : null;
      await updateRenegotiation(editingId, {
        notes: editNotes.trim() || null,
        type: editType,
        penaltyMode: editType === "with_penalty" ? editPenaltyMode : null,
        penaltyInput: penaltyVal,
      });
      toast.success("Renegociação atualizada");
      setEditingId(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    } finally {
      setSavingEdit(false);
    }
  };
  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      setDeleting(true);
      await deleteRenegotiation(pendingDeleteId);
      toast.success("Renegociação excluída do histórico");
      setPendingDeleteId(null);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Renegociar contrato</DialogTitle>
          <DialogDescription>
            {loan.borrowerName} · saldo total {formatCurrency(totalRemaining)}
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
              <span className="text-muted-foreground">
                {isInstallmentLoan ? "Parcelas selecionadas" : "Parcelas pendentes"}
              </span>
              <span className="font-medium">
                {isInstallmentLoan
                  ? `${selectedNumbers.size} de ${pendingInstallments.length}`
                  : remainingPending}
              </span>
            </div>
          </div>

          {isInstallmentLoan && pendingInstallments.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Parcelas a renegociar
                </Label>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                </button>
              </div>
              <div className="rounded-lg border border-border/60 max-h-44 overflow-y-auto divide-y divide-border/40">
                {pendingInstallments.map((inst) => {
                  const checked = selectedNumbers.has(inst.installmentNumber);
                  return (
                    <label
                      key={inst.installmentNumber}
                      className="flex items-center gap-2.5 px-2.5 py-2 text-xs cursor-pointer hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleOne(inst.installmentNumber)}
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="font-medium">
                          Parcela {inst.installmentNumber}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDateBR(inst.dueDate)}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(Number(inst.amount || 0))}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

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
            <Label className="text-xs">
              {isInstallmentLoan
                ? "Em quantas parcelas dividir o saldo renegociado (opcional)"
                : "Novo nº de parcelas pendentes (opcional)"}
            </Label>
            <Input
              type="number"
              min="1"
              inputMode="numeric"
              placeholder={`Manter: ${isInstallmentLoan ? Math.max(1, selectedCount) : remainingPending}`}
              value={newInstallments}
              onChange={(e) => { setNewInstallments(e.target.value); setConfirming(false); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" /> Nova data de vencimento
              {installmentsCount > 1 && (
                <span className="text-[10px] text-muted-foreground font-normal">
                  (1ª parcela — demais seguem mensalmente)
                </span>
              )}
            </Label>
            <Input
              type="date"
              value={firstDueDate}
              onChange={(e) => { setFirstDueDate(e.target.value); setConfirming(false); }}
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
              <span className="text-muted-foreground">Saldo das parcelas selecionadas</span>
              <span>{formatCurrency(remaining)}</span>
            </div>
            {type === "with_penalty" && (
              <div className="flex justify-between text-warning">
                <span>+ Multa de renegociação</span>
                <span>{formatCurrency(penaltyAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-foreground border-t border-border/50 pt-1.5">
              <span>Novo total renegociado</span>
              <span>{formatCurrency(newTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Parcelas</span>
              <span>
                {installmentsCount}× de {formatCurrency(newInstallmentValue)}
              </span>
            </div>
          </div>

          {simulatedSchedule.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                  <CalendarDays className="h-3.5 w-3.5" /> Novo cronograma de parcelas pendentes
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {simulatedSchedule.length} parcela{simulatedSchedule.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="rounded-lg border border-border/60 max-h-48 overflow-y-auto divide-y divide-border/40">
                {simulatedSchedule.map((row) => (
                  <div
                    key={`${row.number}-${row.dueDate}-${row.isNew}`}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${
                      row.isNew ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium tabular-nums">#{row.number}</span>
                      {row.isNew && (
                        <span className="text-[9px] uppercase tracking-wide bg-primary/15 text-primary rounded px-1 py-0.5 font-semibold">
                          Nova
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {formatDateBR(row.dueDate)}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(row.amount)}
                    </span>
                  </div>
                ))}
              </div>
              {isInstallmentLoan && pendingInstallments.length > 0 && (
                <p className="text-[10px] text-muted-foreground italic">
                  Parcelas marcadas como "Nova" substituirão as selecionadas. As demais permanecem inalteradas.
                </p>
              )}
            </div>
          )}

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
