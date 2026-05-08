import { useState, useEffect, useMemo } from "react";
import { Income, IncomeRecurrence, IncomeStatus } from "@/hooks/useIncomes";
import { useClients } from "@/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useIncomeCategories } from "@/hooks/useIncomeCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientCombobox } from "@/components/ui/client-combobox";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { PersonalCategoryCreator } from "@/components/PersonalCategoryCreator";
import { personalIconMap } from "@/lib/personalExpenseCategories";
import { PlusCircle } from "lucide-react";
import { todayInAppTz } from "@/lib/timezone";

export const INCOME_CATEGORIES = [
  "Vendas",
  "Serviços",
  "Comissões",
  "Aluguel",
  "Investimentos",
  "Salário",
  "Reembolso",
  "Outros",
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Income, "id" | "createdAt">) => Promise<any>;
  initial?: Income | null;
}

export function IncomeForm({ open, onClose, onSubmit, initial }: Props) {
  const { clients } = useClients();
  const { activeMethods } = usePaymentMethods();
  const { categories: customCategories, create: createCategory } = useIncomeCategories();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("Vendas");
  const [clientName, setClientName] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState(todayInAppTz());
  const [status, setStatus] = useState<IncomeStatus>("received");
  const [recurrence, setRecurrence] = useState<IncomeRecurrence>("once");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);

  const allCategories = useMemo(() => {
    const customNames = new Set(customCategories.map((c) => c.name.trim().toLowerCase()));
    const builtIns = INCOME_CATEGORIES.filter((c) => !customNames.has(c.trim().toLowerCase()));
    return { builtIns, customs: customCategories };
  }, [customCategories]);

  useEffect(() => {
    if (open) {
      if (initial) {
        setDescription(initial.description);
        setAmount(String(initial.amount));
        setCategory(initial.category || "Outros");
        const c = clients.find((c) => c.id === initial.clientId);
        setClientName(c?.name || initial.source || "");
        setPaymentMethodId(initial.paymentMethodId || "");
        setReceivedDate(initial.receivedDate);
        setStatus(initial.status);
        setRecurrence(initial.recurrence);
        setNotes(initial.notes || "");
      } else {
        setDescription("");
        setAmount("");
        setCategory("Vendas");
        setClientName("");
        setPaymentMethodId("");
        setReceivedDate(todayInAppTz());
        setStatus("received");
        setRecurrence("once");
        setNotes("");
      }
    }
  }, [open, initial, clients]);

  const handleSave = async () => {
    if (!description.trim() || !amount) return;
    setSaving(true);
    const matched = clients.find((c) => c.name.toLowerCase() === clientName.trim().toLowerCase());
    await onSubmit({
      description: description.trim(),
      amount: Number(amount),
      category,
      clientId: matched?.id || null,
      source: !matched && clientName.trim() ? clientName.trim() : null,
      paymentMethodId: paymentMethodId || null,
      receivedDate,
      status,
      notes: notes.trim() || null,
      recurrence,
      parentId: initial?.parentId || null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar receita" : "Nova receita"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Venda do produto X" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Data</Label>
              <DatePickerField value={receivedDate} onChange={setReceivedDate} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <Label>Categoria</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setCreatorOpen(true)}
                >
                  <PlusCircle className="mr-1 h-3.5 w-3.5" />
                  Nova
                </Button>
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {allCategories.builtIns.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  {allCategories.customs.length > 0 && allCategories.builtIns.length > 0 && (
                    <div className="my-1 border-t border-border" />
                  )}
                  {allCategories.customs.map((c) => {
                    const Icon = personalIconMap[c.icon] ?? personalIconMap.Package;
                    return (
                      <SelectItem key={c.id} value={c.name}>
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
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as IncomeStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Recebido</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Cliente / Origem</Label>
            <ClientCombobox
              value={clientName}
              onChange={setClientName}
              options={clients.map((c) => ({ id: c.id, name: c.name }))}
              placeholder="Selecione um cliente ou digite uma origem"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {activeMethods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recorrência</Label>
              <Select value={recurrence} onValueChange={(v) => setRecurrence(v as IncomeRecurrence)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Única</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !description.trim() || !amount}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
