import { useState } from "react";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, X, PiggyBank } from "lucide-react";
import { Expense } from "@/types/loan";
import { personalCategories } from "@/lib/personalExpenseCategories";
import { usePiggyBanks, buildPiggyTag } from "@/hooks/usePiggyBanks";

interface Props {
  onAdd: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onClose: () => void;
}

const paymentMethods = ["Dinheiro", "Pix", "Débito", "Crédito", "Boleto"];

export function PersonalExpenseForm({ onAdd, onClose }: Props) {
  const { piggyBanks, addDeposit } = usePiggyBanks();

  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "fixa" as "fixa" | "recorrente",
    category: "",
    paymentMethod: "Pix",
    installments: "1",
    dueDate: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [toPiggy, setToPiggy] = useState(false);
  const [piggyId, setPiggyId] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    const amount = parseFloat(form.amount) || 0;

    if (toPiggy) {
      if (!piggyId) return;
      const baseNotes = form.notes ? `[${form.paymentMethod}] ${form.notes}` : `[${form.paymentMethod}]`;
      onAdd({
        description: form.description,
        amount,
        type: "fixa",
        category: "Cofrinho",
        installments: undefined,
        paidInstallments: undefined,
        dueDate: form.dueDate,
        notes: buildPiggyTag(piggyId, baseNotes),
        scope: "personal",
      });
      await addDeposit({ piggyBankId: piggyId, amount, depositDate: form.dueDate });
      onClose();
      return;
    }

    if (!form.category) return;
    const notesWithMethod = form.notes
      ? `[${form.paymentMethod}] ${form.notes}`
      : `[${form.paymentMethod}]`;
    onAdd({
      description: form.description,
      amount,
      type: form.type,
      category: form.category,
      installments: form.type === "recorrente" ? parseInt(form.installments) || 1 : undefined,
      paidInstallments: form.type === "recorrente" ? 0 : undefined,
      dueDate: form.dueDate,
      notes: notesWithMethod,
      scope: "personal",
    });
    onClose();
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card no3d className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Nova Despesa Pessoal</CardTitle>
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
                placeholder={toPiggy ? "Ex: Aporte mensal" : "Ex: Supermercado do mês"}
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
                  placeholder="250.00"
                  required
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => update("type", v)} disabled={toPiggy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixa">Única</SelectItem>
                    <SelectItem value="recorrente">Parcelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.type === "recorrente" && !toPiggy && (
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

            {piggyBanks.length > 0 && (
              <div className="rounded-lg border border-border/50 p-3 space-y-3 bg-primary/[0.03]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <PiggyBank className="h-4 w-4 text-primary shrink-0" />
                    <Label htmlFor="to-piggy" className="text-sm cursor-pointer">
                      Destinar a um cofrinho
                    </Label>
                  </div>
                  <Switch
                    id="to-piggy"
                    checked={toPiggy}
                    onCheckedChange={(v) => {
                      setToPiggy(v);
                      if (v && !piggyId) setPiggyId(piggyBanks[0].id);
                      if (v) update("type", "fixa");
                    }}
                  />
                </div>
                {toPiggy && (
                  <div>
                    <Label className="text-xs">Cofrinho</Label>
                    <Select value={piggyId} onValueChange={setPiggyId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {piggyBanks.map((pb) => (
                          <SelectItem key={pb.id} value={pb.id}>
                            <span className="inline-flex items-center gap-2">
                              <PiggyBank className="h-3.5 w-3.5" style={{ color: `hsl(${pb.color})` }} />
                              {pb.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Aportes não entram no "Gasto do mês" e rendem ~100% CDI ao dia.
                    </p>
                  </div>
                )}
              </div>
            )}

            {!toPiggy && (
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {personalCategories.map((c) => {
                      const Icon = c.icon;
                      return (
                        <SelectItem key={c.name} value={c.name}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" style={{ color: `hsl(${c.color})` }} />
                            {c.name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Forma de pagamento</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => update("paymentMethod", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dueDate">Data {toPiggy ? "do aporte" : "de Pagamento"}</Label>
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
                placeholder="Notas opcionais..."
                rows={2}
              />
            </div>

            <Button type="submit" className="w-full" disabled={toPiggy && !piggyId}>
              <Plus className="h-4 w-4 mr-2" />
              {toPiggy ? "Aportar no cofrinho" : "Cadastrar Despesa"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
