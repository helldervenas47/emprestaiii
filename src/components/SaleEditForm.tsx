import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Save, X, Calendar as CalendarIcon } from "lucide-react";
import { Sale, BusinessType, PaymentMode } from "@/types/loan";
import { format, addMonths } from "date-fns";
import { cn } from "@/lib/utils";

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
  const initInstVal = () => {
    const count = sale.installments || 1;
    const down = sale.downPayment || 0;
    return count > 0 ? ((sale.total - down) / count).toFixed(2) : "0";
  };

  const [form, setForm] = useState({
    description: sale.description || sale.productName,
    customerName: sale.customerName,
    cost: String(sale.cost || 0),
    total: String(sale.total),
    quantity: String(sale.quantity),
    installments: String(sale.installments),
    paidInstallments: String(sale.paidInstallments),
    downPayment: String(sale.downPayment || 0),
    installmentValue: initInstVal(),
    paymentMode: sale.paymentMode,
    businessType: sale.businessType,
    date: sale.date,
    notes: sale.notes || "",
  });

  // Generate initial installment rows
  const initRows = () => {
    const count = sale.installments || 1;
    const baseDate = new Date(sale.date + "T00:00:00");
    const down = sale.downPayment || 0;
    const baseValue = count > 0 ? Math.max(0, sale.total - down) / count : 0;
    return Array.from({ length: count }, (_, i) => ({
      date: addMonths(baseDate, i).toISOString().split("T")[0],
      value: baseValue.toFixed(2),
    }));
  };
  const [installmentRows, setInstallmentRows] = useState(initRows);

  const totalNum = parseFloat(form.total) || 0;
  const costNum = parseFloat(form.cost) || 0;
  const downPaymentNum = parseFloat(form.downPayment) || 0;
  const installmentsNum = parseInt(form.installments) || 1;
  const remainingForInstallments = Math.max(0, totalNum - downPaymentNum);
  const installmentValue = installmentsNum > 0 ? remainingForInstallments / installmentsNum : 0;
  const lucro = totalNum - costNum;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(sale.id, {
      description: form.description,
      productName: form.description,
      customerName: form.customerName,
      cost: costNum,
      total: totalNum,
      quantity: parseInt(form.quantity) || 1,
      installments: form.paymentMode === "recorrente" ? installmentsNum : 1,
      paidInstallments: parseInt(form.paidInstallments) || 0,
      downPayment: downPaymentNum,
      paymentMode: form.paymentMode as PaymentMode,
      businessType: form.businessType as BusinessType,
      date: form.date,
      notes: form.notes || undefined,
    });
    onClose();
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

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

            <div>
              <Label>Data da Venda</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.date ? format(new Date(form.date + "T00:00:00"), "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={form.date ? new Date(form.date + "T00:00:00") : undefined}
                    onSelect={(d) => d && update("date", d.toISOString().split("T")[0])}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valor Custo (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.cost} onChange={(e) => update("cost", e.target.value)} />
              </div>
              <div>
                <Label>Valor Venda (R$)</Label>
                <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => {
                  update("total", e.target.value);
                  const totalVal = parseFloat(e.target.value) || 0;
                  const down = parseFloat(form.downPayment) || 0;
                  const count = parseInt(form.installments) || 1;
                  if (form.paymentMode === "recorrente" && count > 0) {
                    const newInstVal = ((totalVal - down) / count).toFixed(2);
                    update("installmentValue", newInstVal);
                  }
                }} required />
              </div>
            </div>

            {/* Lucro calculado */}
            <div className={`rounded-lg px-3 py-2 border ${lucro >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}>
              <p className="text-xs text-muted-foreground">Lucro estimado</p>
              <p className={`text-sm font-bold ${lucro >= 0 ? "text-success" : "text-destructive"}`}>{fmt(lucro)}</p>
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
                <div>
                  <Label>Valor da Parcela (R$)</Label>
                  <Input type="number" step="0.01" min="0.01" value={form.installmentValue} onChange={(e) => {
                    const parcVal = parseFloat(e.target.value) || 0;
                    const count = parseInt(form.installments) || 1;
                    const down = parseFloat(form.downPayment) || 0;
                    update("installmentValue", e.target.value);
                    const newTotal = parcVal * count + down;
                    update("total", newTotal.toFixed(2));
                    // Update all installment rows
                    setInstallmentRows((prev) => prev.map((r) => ({ ...r, value: parcVal.toFixed(2) })));
                  }} placeholder="0,00" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Qtd. Parcelas</Label>
                    <Input type="number" min="1" value={form.installments} onChange={(e) => {
                      const newCount = parseInt(e.target.value) || 1;
                      update("installments", e.target.value);
                      const instVal = parseFloat(form.installmentValue) || (remainingForInstallments / newCount);
                      update("installmentValue", instVal.toFixed(2));
                      // Resize installmentRows
                      setInstallmentRows((prev) => {
                        const rows = [...prev];
                        const baseDate = new Date(form.date + "T00:00:00");
                        while (rows.length < newCount) {
                          const d = addMonths(baseDate, rows.length);
                          rows.push({ date: d.toISOString().split("T")[0], value: instVal.toFixed(2) });
                        }
                        while (rows.length > newCount) rows.pop();
                        return rows.map((r) => ({ ...r, value: instVal.toFixed(2) }));
                      });
                    }} />
                  </div>
                  <div>
                    <Label>Parcelas Pagas</Label>
                    <Input type="number" min="0" max={form.installments} value={form.paidInstallments} onChange={(e) => update("paidInstallments", e.target.value)} />
                  </div>
                </div>

                {/* Individual installments */}
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/20">
                    <span className="text-sm font-medium text-foreground">Parcelas ({installmentRows.length})</span>
                    <div className="flex gap-3">
                      <span className="text-xs font-medium text-success">{parseInt(form.paidInstallments) || 0} pagas</span>
                      <span className="text-xs font-medium text-warning">{Math.max(0, installmentRows.length - (parseInt(form.paidInstallments) || 0))} pendentes</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                    {installmentRows.map((row, idx) => {
                      const isPaid = idx < (parseInt(form.paidInstallments) || 0);
                      return (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2.5">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            isPaid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                          }`}>
                            {idx + 1}ª
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1.5 text-success" />
                                {format(new Date(row.date + "T00:00:00"), "dd/MM/yyyy")}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarUI
                                mode="single"
                                selected={new Date(row.date + "T00:00:00")}
                                onSelect={(d) => {
                                  if (d) {
                                    setInstallmentRows((prev) => {
                                      const rows = [...prev];
                                      rows[idx] = { ...rows[idx], date: d.toISOString().split("T")[0] };
                                      return rows;
                                    });
                                  }
                                }}
                                initialFocus
                                className="p-3 pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.value}
                            onChange={(e) => {
                              setInstallmentRows((prev) => {
                                const rows = [...prev];
                                const newVal = e.target.value;
                                rows[idx] = { ...rows[idx], value: newVal };
                                // Auto-adjust: when changing first installment, redistribute remaining across others
                                if (idx === 0 && rows.length > 1) {
                                  const firstVal = parseFloat(newVal) || 0;
                                  const remaining = Math.max(0, remainingForInstallments - firstVal);
                                  const otherCount = rows.length - 1;
                                  const otherVal = (remaining / otherCount).toFixed(2);
                                  for (let i = 1; i < rows.length; i++) {
                                    rows[i] = { ...rows[i], value: otherVal };
                                  }
                                }
                                return rows;
                              });
                            }}
                            className="h-8 w-24 text-xs text-right"
                          />
                          <span className={`text-xs font-medium w-16 text-right shrink-0 ${isPaid ? "text-success" : "text-muted-foreground"}`}>
                            {isPaid ? "Paga" : "Pendente"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-muted/30 border border-border/50 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Total das parcelas</p>
                      <p className="text-sm font-bold text-foreground">{fmt(installmentRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0))}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total restante</p>
                      <p className="text-sm font-bold text-foreground">{fmt(
                        installmentRows.reduce((s, r, i) => i >= (parseInt(form.paidInstallments) || 0) ? s + (parseFloat(r.value) || 0) : s, 0)
                      )}</p>
                    </div>
                  </div>
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
