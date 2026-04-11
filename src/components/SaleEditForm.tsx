import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, X } from "lucide-react";
import { Sale, BusinessType, PaymentMode } from "@/types/loan";

const businessTypeLabels: Record<BusinessType, string> = {
  venda: "Venda",
  streaming: "Streaming",
  aluguel_veiculo: "Aluguel de Veículo",
};

interface Props {
  sale: Sale;
  onSave: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  onClose: () => void;
}

export function SaleEditForm({ sale, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    description: sale.description || sale.productName,
    customerName: sale.customerName,
    cost: String(sale.cost || 0),
    total: String(sale.total),
    quantity: String(sale.quantity),
    installments: String(sale.installments),
    paidInstallments: String(sale.paidInstallments),
    downPayment: String(sale.downPayment || 0),
    paymentMode: sale.paymentMode,
    businessType: sale.businessType,
    notes: sale.notes || "",
  });

  const totalNum = parseFloat(form.total) || 0;
  const downPaymentNum = parseFloat(form.downPayment) || 0;
  const installmentsNum = parseInt(form.installments) || 1;
  const remainingForInstallments = Math.max(0, totalNum - downPaymentNum);
  const installmentValue = installmentsNum > 0 ? remainingForInstallments / installmentsNum : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(sale.id, {
      description: form.description,
      productName: form.description,
      customerName: form.customerName,
      cost: parseFloat(form.cost) || 0,
      total: totalNum,
      quantity: parseInt(form.quantity) || 1,
      installments: form.paymentMode === "recorrente" ? installmentsNum : 1,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      downPayment: downPaymentNum,
      paymentMode: form.paymentMode as PaymentMode,
      businessType: form.businessType as BusinessType,
      notes: form.notes || undefined,
    });
    onClose();
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Editar Venda</CardTitle>
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
              <Label>Cliente</Label>
              <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} placeholder="Nome do cliente" />
            </div>

            <div>
              <Label>Produto / Descrição</Label>
              <Input value={form.description} onChange={(e) => update("description", e.target.value)} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Custo (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => update("cost", e.target.value)} />
              </div>
              <div>
                <Label>Valor Venda (R$)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => update("total", e.target.value)} required />
              </div>
            </div>

            <div>
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} />
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
                  <Label>Entrada (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={form.downPayment} onChange={(e) => update("downPayment", e.target.value)} placeholder="0,00" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Qtd. Parcelas</Label>
                    <Input type="number" min="1" value={form.installments} onChange={(e) => update("installments", e.target.value)} />
                  </div>
                  <div>
                    <Label>Parcelas Pagas</Label>
                    <Input type="number" min="0" max={form.installments} value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} />
                  </div>
                </div>
                <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Valor por parcela</p>
                  <p className="text-lg font-bold text-foreground">
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(installmentValue)}
                  </p>
                </div>
              </>
            )}

            <div>
              <Label>Observações</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Anotações sobre esta venda..."
                rows={3}
              />
            </div>

            <Button type="submit" className="w-full">
              <Save className="h-4 w-4 mr-2" /> Salvar Alterações
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
