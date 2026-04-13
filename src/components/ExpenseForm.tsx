import { useState } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Expense } from "@/types/loan";

const categories = [
  "Aluguel", "Energia", "Água", "Internet", "Telefone",
  "Alimentação", "Transporte", "Salários", "Impostos", "Outros",
];

interface Props {
  onAdd: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onClose: () => void;
}

export function ExpenseForm({ onAdd, onClose }: Props) {
  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "fixa" as "fixa" | "recorrente",
    category: "",
    installments: "1",
    dueDate: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.category) return;
    onAdd({
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      type: form.type,
      category: form.category,
      installments: form.type === "recorrente" ? parseInt(form.installments) || 1 : undefined,
      paidInstallments: form.type === "recorrente" ? 0 : undefined,
      dueDate: form.dueDate,
      notes: form.notes,
    });
    onClose();
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
                <Label htmlFor="amount">Valor (R$)</Label>
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
                <Select value={form.type} onValueChange={(v) => update("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixa">Fixa</SelectItem>
                    <SelectItem value="recorrente">Recorrente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "recorrente" && (
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
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm text-muted-foreground">
                  Ao pagar, <span className="font-semibold text-destructive">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.amount))}
                  </span> será debitado do saldo em conta.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar Despesa
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
