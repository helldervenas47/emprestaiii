import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Calendar as CalendarIcon } from "lucide-react";
import { Sale, BusinessType, PaymentMode } from "@/types/loan";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { cn } from "@/lib/utils";

const businessTypeLabels: Record<BusinessType, string> = {
  venda: "Venda",
  streaming: "Streaming",
  aluguel_veiculo: "Aluguel de Veículo",
};

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}

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
    installmentValue: "",
    customerName: "",
    notes: "",
    businessType: defaultBusinessType,
    paymentMode: "fixa" as PaymentMode,
    installments: "1",
    frequency: "Mensal",
    firstInstallmentDate: new Date().toISOString().split("T")[0],
  });

  const [installmentRows, setInstallmentRows] = useState<{ date: string; value: string }[]>([]);

  const installmentsNum = parseInt(form.installments) || 1;
  const firstDate = new Date(form.firstInstallmentDate + "T00:00:00");
  const totalNum = parseFloat(form.total) || 0;

  // Rebuild rows when installments/date/frequency/total changes
  const rebuildRows = (count: number, baseDate: Date, freq: string, total: number) => {
    const val = count > 0 ? (total / count).toFixed(2) : "0";
    setInstallmentRows(
      Array.from({ length: count }, (_, i) => ({
        date: addByFrequency(baseDate, freq, i).toISOString().split("T")[0],
        value: val,
      }))
    );
    if (count > 0) {
      setForm((p) => ({ ...p, installmentValue: val }));
    }
  };

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
      date: form.firstInstallmentDate,
      notes: form.notes || undefined,
      businessType: form.businessType as BusinessType,
      paymentMode: form.paymentMode,
      installments: form.paymentMode === "recorrente" ? installmentsNum : 1,
      paidInstallments: 0,
      downPayment: 0,
      frequency: form.paymentMode === "recorrente" ? form.frequency : "Mensal",
    });
    onClose();
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
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
                <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => {
                  update("total", e.target.value);
                  const totalVal = parseFloat(e.target.value) || 0;
                  const count = parseInt(form.installments) || 1;
                  if (form.paymentMode === "recorrente" && totalVal > 0 && count > 0) {
                    const newInstVal = (totalVal / count).toFixed(2);
                    update("installmentValue", newInstVal);
                    setInstallmentRows((prev) => prev.map((r) => ({ ...r, value: newInstVal })));
                  }
                }} placeholder="0,00" required />
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
                   <Select value={form.frequency} onValueChange={(v) => {
                    update("frequency", v);
                    rebuildRows(installmentsNum, firstDate, v, totalNum);
                  }}>
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
                  <Label>Data da 1ª Parcela</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(firstDate, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarUI
                        mode="single"
                        selected={firstDate}
                        onSelect={(d) => {
                          if (d) {
                            update("firstInstallmentDate", d.toISOString().split("T")[0]);
                            rebuildRows(installmentsNum, d, form.frequency, totalNum);
                          }
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Quantidade de Parcelas</Label>
                    <Input type="number" min="2" value={form.installments} onChange={(e) => {
                      const newCount = parseInt(e.target.value) || 1;
                      update("installments", e.target.value);
                      rebuildRows(newCount, firstDate, form.frequency, totalNum);
                    }} required />
                  </div>
                  <div>
                    <Label>Valor da Parcela (R$)</Label>
                    <Input type="number" step="0.01" min="0.01" value={form.installmentValue} onChange={(e) => {
                      const parcVal = parseFloat(e.target.value) || 0;
                      const count = parseInt(form.installments) || 1;
                      update("installmentValue", e.target.value);
                      if (parcVal > 0) {
                        update("total", (parcVal * count).toFixed(2));
                        setInstallmentRows((prev) => prev.map((r) => ({ ...r, value: parcVal.toFixed(2) })));
                      }
                    }} placeholder="0,00" />
                  </div>
                </div>

                {/* Editable installment rows */}
                {installmentsNum >= 2 && installmentRows.length > 0 && (
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-muted/20">
                      <span className="text-sm font-medium text-foreground">Parcelas ({installmentRows.length})</span>
                    </div>
                    <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
                      {installmentRows.map((row, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2">
                          <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-muted/40 text-muted-foreground shrink-0">
                            {idx + 1}ª
                          </span>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" size="sm" className="h-8 text-xs flex-1 justify-start">
                                <CalendarIcon className="h-3.5 w-3.5 mr-1.5 text-primary" />
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
                                // Auto-adjust: first installment redistributes across others
                                if (idx === 0 && rows.length > 1) {
                                  const firstVal = parseFloat(newVal) || 0;
                                  const remaining = Math.max(0, totalNum - firstVal);
                                  const otherVal = (remaining / (rows.length - 1)).toFixed(2);
                                  for (let i = 1; i < rows.length; i++) {
                                    rows[i] = { ...rows[i], value: otherVal };
                                  }
                                }
                                return rows;
                              });
                            }}
                            className="h-8 w-24 text-xs text-right"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 bg-muted/20">
                      <p className="text-xs text-muted-foreground">
                        Total: <span className="font-bold text-foreground">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                            installmentRows.reduce((s, r) => s + (parseFloat(r.value) || 0), 0)
                          )}
                        </span>
                      </p>
                    </div>
                  </div>
                )}
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
