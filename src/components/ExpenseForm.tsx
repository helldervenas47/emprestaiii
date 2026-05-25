import { useState } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Expense } from "@/types/loan";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { MoneyInput } from "@/components/ui/money-input";
import { useDescriptionHistory } from "@/hooks/useDescriptionHistory";

const categories = [
  "Aluguel", "Energia", "Água", "Internet", "Telefone",
  "Alimentação", "Transporte", "Salários", "Impostos", "Outros",
].sort((a, b) => a.localeCompare(b, "pt-BR"));

type ExpenseKind = "unica" | "parcelada" | "fixa";

// Sentinel for "fixa mensal sem fim" — large installment count keeps recurrence open-ended
const FIXED_RECURRING_INSTALLMENTS = 999;

interface Props {
  onAdd: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onClose: () => void;
  scope?: "business" | "personal";
  defaults?: Partial<{
    description: string;
    amount: string | number;
    category: string;
    dueDate: string;
    notes: string;
    kind: ExpenseKind;
  }>;
}

export function ExpenseForm({ onAdd, onClose, scope = "business", defaults }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFormError, setShowFormError] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [generateIncomeOnPay, setGenerateIncomeOnPay] = useState(false);
  const { suggestions, record, findTemplate } = useDescriptionHistory(`expense-${scope}`);
  const [form, setForm] = useState({
    description: defaults?.description ?? "",
    amount: defaults?.amount != null ? String(defaults.amount) : "",
    kind: (defaults?.kind ?? "unica") as ExpenseKind,
    category: defaults?.category ?? "",
    installments: "1",
    dueDate: defaults?.dueDate ?? todayInAppTz(),
    notes: defaults?.notes ?? "",
  });

  const applyTemplateFromDescription = (desc: string) => {
    const tpl = findTemplate(desc);
    if (!tpl) return;
    setForm((prev) => ({
      ...prev,
      amount: prev.amount || (tpl.amount != null ? String(tpl.amount) : ""),
      category: prev.category || ((tpl.category as string) ?? ""),
      notes: prev.notes || ((tpl.notes as string) ?? ""),
    }));
    if (!paymentMethodId && tpl.paymentMethodId) setPaymentMethodId(tpl.paymentMethodId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.category) return;
    if (!paymentMethodId) { setShowFormError(true); return; }
    if (submitting) return;
    setSubmitting(true);
    const parsedAmount = parseFloat(form.amount) || 0;

    let payload: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">;
    if (form.kind === "parcelada") {
      const installments = Math.max(1, parseInt(form.installments) || 1);
      payload = {
        description: form.description,
        amount: parsedAmount * installments,
        type: "recorrente",
        category: form.category,
        installments,
        paidInstallments: 0,
        dueDate: form.dueDate,
        notes: form.notes,
        scope,
        paymentMethodId,
        generateIncomeOnPay,
      };
    } else if (form.kind === "fixa") {
      payload = {
        description: form.description,
        amount: parsedAmount * FIXED_RECURRING_INSTALLMENTS,
        type: "recorrente",
        category: form.category,
        installments: FIXED_RECURRING_INSTALLMENTS,
        paidInstallments: 0,
        dueDate: form.dueDate,
        notes: form.notes,
        scope,
        paymentMethodId,
        generateIncomeOnPay,
      };
    } else {
      payload = {
        description: form.description,
        amount: parsedAmount,
        type: "fixa",
        category: form.category,
        dueDate: form.dueDate,
        notes: form.notes,
        scope,
        paymentMethodId,
        generateIncomeOnPay,
      };
    }

    try {
      await onAdd(payload);
      record(form.description, {
        amount: parsedAmount,
        category: form.category,
        notes: form.notes,
        paymentMethodId,
      });
      setShowSuccess(true);
    } finally {
      setSubmitting(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const amountLabel =
    form.kind === "parcelada" ? "Valor da Parcela (R$)" :
    form.kind === "fixa" ? "Valor Mensal (R$)" : "Valor (R$)";

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Despesa cadastrada!" />
      <Card no3d className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Nova Despesa</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Ex: Aluguel do escritório"
                list="expense-desc-history"
                required
              />
              <datalist id="expense-desc-history">
                {suggestions.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">{amountLabel}</Label>
                <MoneyInput
                  id="amount"
                  value={form.amount}
                  onChange={(v) => update("amount", v)}
                  placeholder="R$ 0,00"
                  required
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => update("kind", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unica">Única</SelectItem>
                    <SelectItem value="parcelada">Parcelada</SelectItem>
                    <SelectItem value="fixa">Fixa (mensal)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.kind === "parcelada" && (
              <div>
                <Label htmlFor="installments">Parcelas</Label>
                <Input
                  id="installments"
                  type="number"
                  min="1"
                  value={form.installments}
                  onChange={(e) => update("installments", e.target.value)}
                  placeholder="12"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dueDate">Data de Pagamento</Label>
                <DatePickerField
                  id="dueDate"
                  value={form.dueDate}
                  onChange={(v) => update("dueDate", v)}
                />
              </div>
            </div>
            <PaymentMethodPicker
              value={paymentMethodId}
              onChange={(id) => { setPaymentMethodId(id); setShowFormError(false); }}
              required
              showError={showFormError}
            />

            {scope === "business" && (
              <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="generate-income" className="text-sm font-medium">
                    Gerar receita ao pagar
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ao marcar como paga, cria automaticamente uma receita do mesmo valor que entra no saldo em conta.
                  </p>
                </div>
                <Switch
                  id="generate-income"
                  checked={generateIncomeOnPay}
                  onCheckedChange={setGenerateIncomeOnPay}
                />
              </div>
            )}



            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Notas sobre a despesa..."
                rows={2}
              />
            </div>

            {parseFloat(form.amount) > 0 && (
              <div className="rounded-lg bg-muted p-4 space-y-1">
                {form.kind === "parcelada" && parseInt(form.installments) > 1 && (
                  <p className="text-sm text-muted-foreground">
                    Valor total: <span className="font-semibold text-foreground">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                    </span> ({form.installments}x de {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))})
                  </p>
                )}
                {form.kind === "fixa" && (
                  <p className="text-sm text-muted-foreground">
                    Despesa mensal recorrente sem prazo final.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Ao pagar, <span className="font-semibold text-destructive">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}
                  </span> será debitado do saldo em conta.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Despesa
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
