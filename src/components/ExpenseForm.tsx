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
import { Expense } from "@/types/loan";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";

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
}

export function ExpenseForm({ onAdd, onClose, scope = "business" }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFormError, setShowFormError] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    kind: "unica" as ExpenseKind,
    category: "",
    installments: "1",
    dueDate: todayInAppTz(),
    notes: "",
  });

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
      };
    }

    try {
      await onAdd(payload);
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
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message="Despesa cadastrada!" />
      <Card no3d className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">{amountLabel}</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  placeholder="500.00"
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
