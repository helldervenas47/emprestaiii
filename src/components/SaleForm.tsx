import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Sale, BusinessType, PaymentMode } from "@/types/loan";

const businessTypeLabels: Record<BusinessType, string> = {
  venda: "Venda",
  streaming: "Streaming",
  aluguel_veiculo: "Aluguel de Veículo",
};

interface Props {
  onAdd: (sale: Omit<Sale, "id">) => void;
  onClose: () => void;
  defaultBusinessType?: BusinessType;
}

export function SaleForm({ onAdd, onClose, defaultBusinessType = "venda" }: Props) {
  const [form, setForm] = useState({
    description: "",
    quantity: "1",
    total: "",
    customerName: "",
    notes: "",
    businessType: defaultBusinessType,
    paymentMode: "fixa" as PaymentMode,
    installments: "1",
    frequency: "Mensal",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(form.total) || 0;
    if (!form.description || total <= 0) return;
    onAdd({
      productName: form.description,
      description: form.description,
      quantity: parseInt(form.quantity) || 1,
      unitPrice: total,
      cost: 0,
      total,
      customerName: form.customerName,
      date: new Date().toISOString().split("T")[0],
      notes: form.notes || undefined,
      businessType: form.businessType as BusinessType,
      paymentMode: form.paymentMode,
      installments: form.paymentMode === "recorrente" ? (parseInt(form.installments) || 1) : 1,
      paidInstallments: 0,
      downPayment: 0,
    });
    onClose();
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Novo Lançamento</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Tipo de Negócio</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.businessType}
                onChange={(e) => update("businessType", e.target.value)}
              >
                {Object.entries(businessTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Descreva o produto ou serviço" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantidade</Label>
                <Input type="number" min="1" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} required />
              </div>
              <div>
                <Label>Valor Total (R$)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => update("total", e.target.value)} placeholder="0,00" required />
              </div>
            </div>

            <div>
              <Label>Tipo de Pagamento</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.paymentMode}
                onChange={(e) => update("paymentMode", e.target.value)}
              >
                <option value="fixa">Fixa (pagamento único)</option>
                <option value="recorrente">Recorrente (parcelado)</option>
              </select>
            </div>

            {form.paymentMode === "recorrente" && (
              <>
                <div>
                  <Label>Frequência</Label>
                  <Select value={form.frequency} onValueChange={(v) => update("frequency", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Semanal">Semanal</SelectItem>
                      <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="Mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantidade de Parcelas</Label>
                  <Input type="number" min="2" value={form.installments} onChange={(e) => update("installments", e.target.value)} required />
                </div>
              </>
            )}

            <div>
              <Label>Cliente</Label>
              <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} placeholder="Nome do cliente (opcional)" />
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas..." />
            </div>

            <Button type="submit" className="w-full">
              <Plus className="h-4 w-4 mr-2" /> Registrar Lançamento
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
