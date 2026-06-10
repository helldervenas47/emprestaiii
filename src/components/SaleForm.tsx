import { useState } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Calendar as CalendarIcon } from "lucide-react";
import { Sale, BusinessType, PaymentMode, Client, Product } from "@/types/loan";
import { format, addMonths, addWeeks, addDays } from "date-fns";
import { VehicleInfo } from "@/hooks/useVehicleRegistry";
import { LocadorInfo } from "@/hooks/useLocadorInfo";
import { cn } from "@/lib/utils";
import { encodeNotesWithMerchandise } from "@/lib/saleMerchandise";
import { ClientCombobox } from "@/components/ui/client-combobox";
import { SaleCategoryPicker } from "@/components/SaleCategoryPicker";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";


const businessTypeLabels: Record<BusinessType, string> = {
  venda: "Venda",
  streaming: "Streaming",
  aluguel_veiculo: "Aluguel de Veículo",
};

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  if (frequency === "Diário") return addDays(date, n);
  return addMonths(date, n);
}

interface Props {
  onAdd: (sale: Omit<Sale, "id">) => void;
  onClose: () => void;
  defaultBusinessType?: BusinessType;
  clients?: Client[];
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
  products?: Product[];
}

export function SaleForm({ onAdd, onClose, defaultBusinessType = "venda", clients = [], registeredVehicles = [], locadores = [], products = [] }: Props) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const defaultLocadorId = locadores.length === 1 ? (locadores[0].id || "") : "";
  const [form, setForm] = useState({
    description: "",
    productId: "",
    quantity: "1",
    total: "",
    discount: "",
    installmentValue: "",
    customerName: "",
    notes: "",
    businessType: defaultBusinessType,
    paymentMode: (defaultBusinessType === "aluguel_veiculo" ? "recorrente" : "fixa") as PaymentMode,
    installments: defaultBusinessType === "aluguel_veiculo" ? "1" : "1",
    frequency: defaultBusinessType === "aluguel_veiculo" ? "Diário" : "Mensal",
    firstInstallmentDate: todayInAppTz(),
    locadorId: defaultLocadorId,
    category: defaultBusinessType === "venda" ? "Venda" : "",
    paymentDate: todayInAppTz(),
    paymentStatus: "pago" as "pago" | "pendente",
  });
  const [merchEnabled, setMerchEnabled] = useState(false);
  const [merchDescricao, setMerchDescricao] = useState("");
  const [merchValor, setMerchValor] = useState("");
  const [merchError, setMerchError] = useState<string | null>(null);

  type ExtraItem = {
    productId: string;
    isAvulsa: boolean;
    description: string;
    quantity: number;
    total: number;
  };
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const canAddExtra = form.businessType === "venda" && form.paymentMode === "fixa";

  const handleAddExtraItem = async () => {
    const qty = parseInt(form.quantity) || 1;
    const totalVal = parseFloat(form.total) || 0;
    if (!form.productId) {
      const { toast } = await import("sonner");
      toast.error('Selecione um produto ou marque como "Venda avulsa" para adicionar.');
      return;
    }
    if (!form.description) {
      const { toast } = await import("sonner");
      toast.error("Descrição do item é obrigatória.");
      return;
    }
    if (totalVal <= 0) {
      const { toast } = await import("sonner");
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!isAvulsa) {
      const prod = products.find((p) => p.id === form.productId);
      if (!prod) return;
      const alreadyQty = extraItems
        .filter((it) => it.productId === form.productId)
        .reduce((s, it) => s + it.quantity, 0);
      if (qty + alreadyQty > prod.stock) {
        const { toast } = await import("sonner");
        toast.error(`Estoque insuficiente de "${prod.name}" (disponível: ${prod.stock - alreadyQty}).`);
        return;
      }
    }
    setExtraItems((prev) => [
      ...prev,
      {
        productId: form.productId,
        isAvulsa,
        description: form.description,
        quantity: qty,
        total: totalVal,
      },
    ]);
    setForm((p) => ({
      ...p,
      productId: "",
      description: "",
      quantity: "1",
      discount: "",
      total: "",
    }));
  };

  const removeExtraItem = (idx: number) => {
    setExtraItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const [installmentRows, setInstallmentRows] = useState<{ date: string; value: string; manualDate?: boolean; manualValue?: boolean }[]>([]);

  const isVehicleRental = form.businessType === "aluguel_veiculo";
  const installmentsNum = parseInt(form.installments) || 1;
  const firstDate = new Date(form.firstInstallmentDate + "T00:00:00");
  const totalNum = parseFloat(form.total) || 0;

  const rebuildRows = (count: number, baseDate: Date, freq: string, total: number) => {
    const defaultVal = count > 0 ? (total / count).toFixed(2) : "0";
    setInstallmentRows((prev) => {
      return Array.from({ length: count }, (_, i) => {
        const existing = prev[i];
        const autoDate = addByFrequency(baseDate, freq, i).toISOString().split("T")[0];
        return {
          date: existing?.manualDate ? existing.date : autoDate,
          value: existing?.manualValue ? existing.value : defaultVal,
          manualDate: existing?.manualDate || false,
          manualValue: existing?.manualValue || false,
        };
      });
    });
    if (count > 0) {
      setForm((p) => ({ ...p, installmentValue: defaultVal }));
    }
  };

  const isAvulsa = form.productId === "__avulsa__";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valorRecebido = parseFloat(form.total) || 0;
    if (!form.description || valorRecebido <= 0 || !form.customerName) return;

    // Para vendas de produto cadastrado: valida estoque. Vendas avulsas não exigem produto.
    if (form.businessType === "venda" && !isAvulsa && form.productId) {
      const selectedProduct = products.find((p) => p.id === form.productId);
      if (!selectedProduct) {
        const { toast } = await import("sonner");
        toast.error("Selecione um produto ou use Venda avulsa.");
        return;
      }
      const qty = parseInt(form.quantity) || 1;
      if (selectedProduct.stock <= 0) {
        const { toast } = await import("sonner");
        toast.error(`"${selectedProduct.name}" está sem estoque.`);
        return;
      }
      if (qty > selectedProduct.stock) {
        const { toast } = await import("sonner");
        toast.error(`Estoque insuficiente (disponível: ${selectedProduct.stock}).`);
        return;
      }
    }
    if (form.businessType === "venda" && !form.productId) {
      const { toast } = await import("sonner");
      toast.error('Selecione um produto ou marque como "Venda avulsa".');
      return;
    }


    // Validate merchandise (only available for "venda")
    const allowMerch = form.businessType === "venda";
    let merchandise: { descricao: string; valor: number } | null = null;
    if (allowMerch && merchEnabled) {
      const valor = parseFloat(merchValor) || 0;
      const descricao = merchDescricao.trim();
      if (valor < 0) {
        setMerchError("Valor da mercadoria deve ser maior ou igual a zero.");
        return;
      }
      if (valor > 0 && !descricao) {
        setMerchError("Descrição da mercadoria é obrigatória quando há valor.");
        return;
      }
      if (valor > 0 && descricao) {
        merchandise = { descricao, valor };
      }
    }
    setMerchError(null);

    const merchValorNum = merchandise?.valor || 0;
    const total = valorRecebido + merchValorNum;

    setSubmitting(true);
    const isRecorrente = form.paymentMode === "recorrente";
    const amounts = isRecorrente && installmentRows.length > 0
      ? installmentRows.map(r => parseFloat(r.value) || 0)
      : null;
    const dates = isRecorrente && installmentRows.length > 0
      ? installmentRows.map(r => r.date)
      : null;
    const encodedNotes = encodeNotesWithMerchandise(form.notes, merchandise);

    // Status pago/pendente aplica-se a vendas à vista (fixa) que não sejam aluguel
    const useStatus = !isVehicleRental && !isRecorrente;
    const isPaid = useStatus ? form.paymentStatus === "pago" : false;
    const saleDate = useStatus ? form.paymentDate : form.firstInstallmentDate;
    const paymentHistory = isPaid
      ? [{
          amount: total,
          date: form.paymentDate,
          type: "full" as const,
          installmentNumber: 1,
        }]
      : undefined;

    onAdd({
      productId: form.businessType === "venda" && !isAvulsa ? (form.productId || undefined) : undefined,
      productName: form.description,
      description: form.description,
      quantity: parseInt(form.quantity) || 1,
      unitPrice: total,
      cost: 0,
      total,
      customerName: form.customerName,
      date: saleDate,
      notes: encodedNotes,
      businessType: form.businessType as BusinessType,
      paymentMode: form.paymentMode,
      installments: isRecorrente ? installmentsNum : 1,
      paidInstallments: isPaid ? 1 : 0,
      downPayment: 0,
      frequency: isRecorrente ? form.frequency : "Mensal",
      installmentValue: null,
      installmentAmounts: amounts,
      installmentDates: dates,
      partialPaid: 0,
      paymentHistory,
      locadorId: form.businessType === "aluguel_veiculo" ? (form.locadorId || null) : null,
      category: form.category || null,
    });

    // Itens extras (somente venda à vista). Cada um gera uma venda separada.
    if (canAddExtra && extraItems.length > 0) {
      for (const item of extraItems) {
        const itemPaymentHistory = isPaid
          ? [{
              amount: item.total,
              date: form.paymentDate,
              type: "full" as const,
              installmentNumber: 1,
            }]
          : undefined;
        onAdd({
          productId: !item.isAvulsa ? (item.productId || undefined) : undefined,
          productName: item.description,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.total,
          cost: 0,
          total: item.total,
          customerName: form.customerName,
          date: saleDate,
          notes: "",
          businessType: "venda",
          paymentMode: "fixa",
          installments: 1,
          paidInstallments: isPaid ? 1 : 0,
          downPayment: 0,
          frequency: "Mensal",
          installmentValue: null,
          installmentAmounts: null,
          installmentDates: null,
          partialPaid: 0,
          paymentHistory: itemPaymentHistory,
          locadorId: null,
          category: form.category || null,
        });
      }
    }
    setShowSuccess(true);
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const handleBusinessTypeChange = (value: string) => {
    update("businessType", value);
    if (value === "aluguel_veiculo") {
      setForm((p) => ({ ...p, businessType: value, paymentMode: "recorrente" as PaymentMode, frequency: "Diário", category: p.category === "Venda" ? "" : p.category }));
      rebuildRows(installmentsNum, firstDate, "Diário", totalNum);
    } else {
      const nextCategory = value === "venda" ? (form.category || "Venda") : (form.category === "Venda" ? "" : form.category);
      // Volta para Mensal ao sair de aluguel para outros tipos
      if (form.frequency === "Diário") {
        setForm((p) => ({ ...p, businessType: value as BusinessType, frequency: "Mensal", category: nextCategory }));
        rebuildRows(installmentsNum, firstDate, "Mensal", totalNum);
      } else {
        setForm((p) => ({ ...p, businessType: value as BusinessType, category: nextCategory }));
      }
    }
  };

  // Auto status (pago/pendente) ao mudar a data de pagamento
  const handlePaymentDateChange = (newDate: string) => {
    const today = todayInAppTz();
    setForm((p) => ({
      ...p,
      paymentDate: newDate,
      paymentStatus: newDate > today ? "pendente" : p.paymentStatus,
    }));
  };

  // Labels adaptados por tipo
  const descriptionLabel = isVehicleRental ? "Veículo / Descrição" : "Descrição";
  const descriptionPlaceholder = isVehicleRental ? "Ex: Fiat Uno 2020 - Placa ABC1234" : "Descreva o produto ou serviço";
  const isVenda = form.businessType === "venda";
  const totalLabel = isVehicleRental
    ? "Valor Total do Contrato (R$)"
    : (isVenda && merchEnabled ? "Valor Recebido em Dinheiro (R$)" : "Valor Total (R$)");
  const formTitle = isVehicleRental ? "Novo Aluguel de Veículo" : "Novo Lançamento";

  const frequencyOptions = isVehicleRental
    ? [
        { value: "Diário", label: "Diária" },
        { value: "Semanal", label: "Semanal" },
      ]
    : [
        { value: "Semanal", label: "Semanal" },
        { value: "Quinzenal", label: "Quinzenal" },
        { value: "Mensal", label: "Mensal" },
      ];

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <SuccessAnimation show={showSuccess} onComplete={onClose} message={isVehicleRental ? "Aluguel registrado!" : "Lançamento registrado!"} />
      <Card className="!bg-card !backdrop-blur-none supports-[backdrop-filter]:!bg-card dark:!bg-card w-full h-[100dvh] max-h-[100dvh] rounded-none border-0 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[90vh] sm:max-w-md sm:rounded-2xl sm:border sm:pt-0 sm:pb-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">{formTitle}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Tipo de Negócio</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.businessType}
                onChange={(e) => handleBusinessTypeChange(e.target.value)}
              >
                {Object.entries(businessTypeLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {isVehicleRental ? (
              <>
              <div>
                <Label>Veículo</Label>
                <Select value={form.description} onValueChange={(v) => update("description", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um veículo cadastrado" />
                  </SelectTrigger>
                  <SelectContent>
                    {registeredVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.marcaModelo}>
                        {v.marcaModelo}{v.placa ? ` - ${v.placa}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {locadores.length > 0 && (
                <div>
                  <Label>Locador</Label>
                  <Select value={form.locadorId} onValueChange={(v) => update("locadorId", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o locador" />
                    </SelectTrigger>
                    <SelectContent>
                      {locadores.map((l) => (
                        <SelectItem key={l.id} value={l.id!}>
                          {l.nome}{l.cpf ? ` - ${l.cpf}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              </>
            ) : form.businessType === "venda" ? (
              <div className="space-y-3">
                <div>
                  <Label>Produto</Label>
                  {(() => {
                    const available = products
                      .filter((p) => p.stock > 0)
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
                    return (
                      <Select
                        value={form.productId}
                        onValueChange={(v) => {
                          if (v === "__avulsa__") {
                            setForm((p) => ({
                              ...p,
                              productId: "__avulsa__",
                              description: "",
                              discount: "",
                            }));
                            return;
                          }
                          const prod = products.find((p) => p.id === v);
                          const qty = parseInt(form.quantity) || 1;
                          const disc = parseFloat(form.discount) || 0;
                          const base = (prod?.price || 0) * qty;
                          const newTotal = Math.max(0, base - disc).toFixed(2);
                          setForm((p) => ({
                            ...p,
                            productId: v,
                            description: prod?.name || "",
                            total: prod ? newTotal : p.total,
                          }));
                          if (prod && form.paymentMode === "recorrente") {
                            const count = parseInt(form.installments) || 1;
                            const totalVal = parseFloat(newTotal);
                            if (totalVal > 0 && count > 0) {
                              const newInstVal = (totalVal / count).toFixed(2);
                              setForm((pp) => ({ ...pp, installmentValue: newInstVal }));
                              setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                            }
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um produto ou venda avulsa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__avulsa__">📝 Venda avulsa (sem cadastro)</SelectItem>
                          {available.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-muted-foreground">
                              Nenhum produto com estoque. Use Venda avulsa acima.
                            </div>
                          ) : (
                            available.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.price)} (estoque: {p.stock})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    );
                  })()}
                </div>
                {isAvulsa && (
                  <div>
                    <Label>Descrição do item</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => update("description", e.target.value)}
                      placeholder="Ex: Serviço de instalação, item sem cadastro..."
                      required
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Venda avulsa não consome estoque nem exige cadastro de produto.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Label>{descriptionLabel}</Label>
                <Input value={form.description} onChange={(e) => update("description", e.target.value)} placeholder={descriptionPlaceholder} required />
              </div>
            )}

            {!isVehicleRental && (
              <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantidade</Label>
                  <Input type="number" min="1" value={form.quantity} onChange={(e) => {
                    const qStr = e.target.value;
                    const qty = parseInt(qStr) || 1;
                    const prod = products.find((p) => p.id === form.productId);
                    if (prod && isVenda) {
                      const disc = parseFloat(form.discount) || 0;
                      const newTotal = Math.max(0, prod.price * qty - disc).toFixed(2);
                      setForm((p) => ({ ...p, quantity: qStr, total: newTotal }));
                      const count = parseInt(form.installments) || 1;
                      if (form.paymentMode === "recorrente" && count > 0) {
                        const newInstVal = (parseFloat(newTotal) / count).toFixed(2);
                        setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                        setForm((p) => ({ ...p, installmentValue: newInstVal }));
                      }
                    } else {
                      update("quantity", qStr);
                    }
                  }} required />
                </div>
                <div>
                  <Label>{totalLabel}</Label>
                  <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => {
                    update("total", e.target.value);
                    const totalVal = parseFloat(e.target.value) || 0;
                    const count = parseInt(form.installments) || 1;
                    if (form.paymentMode === "recorrente" && totalVal > 0 && count > 0) {
                      const newInstVal = (totalVal / count).toFixed(2);
                      update("installmentValue", newInstVal);
                      setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                    }
                  }} placeholder="0,00" required />
                </div>
              </div>
              {isVenda && form.productId && !isAvulsa && (
                <div>
                  <Label>Desconto (R$)</Label>
                  <Input type="number" step="0.01" min="0" value={form.discount} onChange={(e) => {
                    const dStr = e.target.value;
                    const disc = parseFloat(dStr) || 0;
                    const prod = products.find((p) => p.id === form.productId);
                    const qty = parseInt(form.quantity) || 1;
                    if (prod) {
                      const newTotal = Math.max(0, prod.price * qty - disc).toFixed(2);
                      setForm((p) => ({ ...p, discount: dStr, total: newTotal }));
                      const count = parseInt(form.installments) || 1;
                      if (form.paymentMode === "recorrente" && count > 0) {
                        const newInstVal = (parseFloat(newTotal) / count).toFixed(2);
                        setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                        setForm((p) => ({ ...p, installmentValue: newInstVal }));
                      }
                    } else {
                      update("discount", dStr);
                    }
                  }} placeholder="0,00" />
                  {(() => {
                    const prod = products.find((p) => p.id === form.productId);
                    const qty = parseInt(form.quantity) || 1;
                    if (!prod) return null;
                    const base = prod.price * qty;
                    const disc = parseFloat(form.discount) || 0;
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        Subtotal: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(base)}
                        {disc > 0 ? ` − ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(disc)} desconto` : ""}
                      </p>
                    );
                  })()}
                </div>
              )}
              {canAddExtra && (
                <div className="space-y-2">
                  {extraItems.length > 0 && (
                    <div className="border border-border/50 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-muted/20 text-sm font-medium">
                        Itens adicionais ({extraItems.length})
                      </div>
                      <div className="divide-y divide-border/30">
                        {extraItems.map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                            <div className="flex-1 min-w-0">
                              <p className="truncate font-medium">{it.description}</p>
                              <p className="text-xs text-muted-foreground">
                                {it.quantity}x · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(it.total)}
                                {it.isAvulsa ? " · avulsa" : ""}
                              </p>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeExtraItem(idx)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground flex justify-between">
                        <span>Total geral da venda:</span>
                        <span className="font-bold text-foreground">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                            extraItems.reduce((s, it) => s + it.total, 0) + (parseFloat(form.total) || 0)
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleAddExtraItem}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar outro produto à venda
                  </Button>
                </div>
              )}
              </>
            )}


            {isVehicleRental && (
              <div>
                <Label>{totalLabel}</Label>
                <Input type="number" step="0.01" min="0.01" value={form.total} onChange={(e) => {
                  update("total", e.target.value);
                  const totalVal = parseFloat(e.target.value) || 0;
                  const count = parseInt(form.installments) || 1;
                  if (totalVal > 0 && count > 0) {
                    const newInstVal = (totalVal / count).toFixed(2);
                    update("installmentValue", newInstVal);
                    setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: newInstVal }));
                  }
                }} placeholder="0,00" required />
              </div>
            )}

            {/* Tipo de pagamento - para venda e streaming */}
            {!isVehicleRental && (
              <div>
                <Label>Tipo de Pagamento</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.paymentMode}
                  onChange={(e) => update("paymentMode", e.target.value)}
                >
                  <option value="fixa">À vista (pagamento único)</option>
                  <option value="recorrente">Parcelado</option>
                </select>
              </div>
            )}

            {/* Status de pagamento (somente para vendas/streaming à vista) */}
            {!isVehicleRental && form.paymentMode === "fixa" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Data de Pagamento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(new Date(form.paymentDate + "T00:00:00"), "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarUI
                        mode="single"
                        selected={new Date(form.paymentDate + "T00:00:00")}
                        onSelect={(d) => {
                          if (d) handlePaymentDateChange(d.toISOString().split("T")[0]);
                        }}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.paymentStatus}
                    onValueChange={(v) => update("paymentStatus", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pago">Pago</SelectItem>
                      <SelectItem value="pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.paymentDate > todayInAppTz() && form.paymentStatus === "pendente" && (
                  <p className="col-span-2 text-[11px] text-muted-foreground">
                    Data futura: a venda será registrada como valor a receber.
                  </p>
                )}
              </div>
            )}

            {/* Campos de parcelamento/recorrência */}
            {(form.paymentMode === "recorrente" || isVehicleRental) && (
              <>
                <div>
                  <Label>{isVehicleRental ? "Período de Cobrança" : "Frequência"}</Label>
                  <Select value={form.frequency} onValueChange={(v) => {
                    update("frequency", v);
                    rebuildRows(installmentsNum, firstDate, v, totalNum);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencyOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{isVehicleRental ? "Data de Início" : "Data da 1ª Parcela"}</Label>
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
                    <Label>{isVehicleRental ? "Quantidade de Períodos" : "Quantidade de Parcelas"}</Label>
                    <Input type="number" min="1" value={form.installments} onChange={(e) => {
                      const newCount = parseInt(e.target.value) || 1;
                      update("installments", e.target.value);
                      rebuildRows(newCount, firstDate, form.frequency, totalNum);
                    }} required />
                  </div>
                  <div>
                    <Label>{isVehicleRental ? "Valor por Período (R$)" : "Valor da Parcela (R$)"}</Label>
                    <Input type="number" step="0.01" min="0.01" value={form.installmentValue} onChange={(e) => {
                      const parcVal = parseFloat(e.target.value) || 0;
                      const count = parseInt(form.installments) || 1;
                      update("installmentValue", e.target.value);
                      if (parcVal > 0) {
                        update("total", (parcVal * count).toFixed(2));
                        setInstallmentRows((prev) => prev.map((r) => r.manualValue ? r : { ...r, value: parcVal.toFixed(2) }));
                      }
                    }} placeholder="0,00" />
                  </div>
                </div>

                {isVehicleRental && installmentsNum > 0 && (
                  <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarIcon className="h-4 w-4 text-primary" />
                      <span className="text-muted-foreground">Data fim do contrato:</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {format(addByFrequency(firstDate, form.frequency, installmentsNum), "dd/MM/yyyy")}
                    </span>
                  </div>
                )}

                {/* Editable installment rows */}
                {installmentsNum >= 2 && installmentRows.length > 0 && (
                  <div className="border border-border/50 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-muted/20">
                      <span className="text-sm font-medium text-foreground">
                        {isVehicleRental ? `Cobranças (${installmentRows.length})` : `Parcelas (${installmentRows.length})`}
                      </span>
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
                                      rows[idx] = { ...rows[idx], date: d.toISOString().split("T")[0], manualDate: true };
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
                                rows[idx] = { ...rows[idx], value: newVal, manualValue: true };
                                const nonManualIndexes = rows.map((r, i) => i).filter(i => i !== idx && !rows[i].manualValue);
                                if (nonManualIndexes.length > 0) {
                                  const manualSum = rows.reduce((s, r, i) => (i === idx || r.manualValue) ? s + (parseFloat(r.value) || 0) : s, 0);
                                  const remaining = Math.max(0, totalNum - manualSum);
                                  const otherVal = (remaining / nonManualIndexes.length).toFixed(2);
                                  for (const i of nonManualIndexes) {
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
              <Label>{isVehicleRental ? "Locatário" : "Cliente"}</Label>
              <ClientCombobox
                value={form.customerName}
                onChange={(v) => update("customerName", v)}
                options={clients
                  .filter((c) => c.active)
                  .map((c) => ({ id: c.id, name: c.name }))}
                placeholder={isVehicleRental ? "Digite ou selecione o locatário" : "Digite ou selecione um cliente"}
                emptyHint="Nenhum cliente cadastrado. Digite um nome para adicionar."
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Busque, selecione um existente ou digite um novo nome.
              </p>
            </div>
            {isVenda && (
              <div className="border border-border/50 rounded-lg p-3 space-y-3 bg-muted/10">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Mercadoria como pagamento</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setMerchEnabled((v) => !v);
                      setMerchError(null);
                    }}
                    className={cn(
                      "text-xs px-2 py-1 rounded-md border transition-colors",
                      merchEnabled
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted/40"
                    )}
                  >
                    {merchEnabled ? "Ativado" : "Adicionar"}
                  </button>
                </div>
                {merchEnabled && (
                  <>
                    <div>
                      <Label className="text-xs">Descrição do produto</Label>
                      <Input
                        value={merchDescricao}
                        onChange={(e) => setMerchDescricao(e.target.value)}
                        placeholder="Ex: Celular usado, bicicleta..."
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Valor da mercadoria (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={merchValor}
                        onChange={(e) => setMerchValor(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    {merchError && (
                      <p className="text-xs text-destructive">{merchError}</p>
                    )}
                    {(parseFloat(merchValor) || 0) > 0 && (
                      <div className="text-xs text-muted-foreground border-t border-border/40 pt-2 space-y-0.5">
                        <p>Recebido em dinheiro: <span className="font-medium text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(form.total) || 0)}</span></p>
                        <p>Mercadoria: <span className="font-medium text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(parseFloat(merchValor) || 0)}</span></p>
                        <p>Total da venda: <span className="font-bold text-primary">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((parseFloat(form.total) || 0) + (parseFloat(merchValor) || 0))}</span></p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div>
              <Label>Categoria</Label>
              <SaleCategoryPicker value={form.category} onChange={(v) => update("category", v)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas..." />
            </div>

            <div className="relative w-full h-11">
              {submitting ? (
                <div className="flex items-center justify-center h-11">
                  <div className="h-8 w-8 rounded-full border-[3px] border-primary border-t-transparent animate-spin" />
                </div>
              ) : (
                <Button type="submit" className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> {isVehicleRental ? "Registrar Aluguel" : "Registrar Lançamento"}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
