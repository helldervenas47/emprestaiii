import { useState, useCallback, useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import * as LucideIcons from "lucide-react";
import { usePaymentCelebration } from "@/hooks/usePaymentCelebration";
import { todayInAppTz } from "@/lib/timezone";
import { getDueStatusBadge } from "@/lib/dueStatus";
import { SalePaymentRecord } from "@/types/loan";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Sale, BusinessType, Client, Expense, Product } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Search, ShoppingCart, Tv, Car, Calendar as CalendarIcon, User, Pencil, ChevronDown, ChevronUp, CheckCircle, CheckCircle2, HandCoins, Check, X as XIcon, DollarSign, AlertTriangle, Clock, CircleCheck, Receipt, Plus, Wallet, ChevronLeft, ChevronRight, LayoutGrid, Folder, List, FileText, BookOpen, Boxes, ShieldCheck, Loader2 } from "lucide-react";
import { StockManager } from "@/components/StockManager";
import { SalesLedger } from "@/components/SalesLedger";
import { generateContract } from "@/lib/generateContract";
import { addMonths, addWeeks, addDays, format, startOfMonth, endOfMonth, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIncomeCategories, CustomIncomeCategory } from "@/hooks/useIncomeCategories";
import { personalIconMap } from "@/lib/personalExpenseCategories";
import { Tag } from "lucide-react";
import { PaymentMethodPicker } from "@/components/PaymentMethodPicker";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { validateSalePayment } from "@/lib/paymentValidation";
import { toast } from "sonner";

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (["Diário", "Diária", "Diario", "Diaria", "daily"].includes(frequency)) return addDays(date, n);
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}
import { useHideValues } from "@/contexts/HideValuesContext";
import { SaleEditForm } from "@/components/SaleEditForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { parseNotesWithMerchandise } from "@/lib/saleMerchandise";

import { VehicleExpenseForm, isVehicleExpenseForVehicles, vehicleExpenseCategories } from "@/components/VehicleExpenseForm";
import { VehicleLocadorManager } from "@/components/VehicleLocadorManager";
import { useLocadorInfo, LocadorInfo } from "@/hooks/useLocadorInfo";
import { useVehicleRegistry, VehicleInfo } from "@/hooks/useVehicleRegistry";
import { ExpenseBoletoLinkSection } from "@/components/ExpenseBoletoLinkSection";
import { ExpenseBoletoLinkButton } from "@/components/ExpenseBoletoLinkButton";


interface Props {
  sales: Sale[];
  products: Product[];
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  clients?: Client[];
  expenses?: Expense[];
  onAddExpense?: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onPayExpense?: (id: string, skipBalanceAdjust?: boolean, payDate?: string, paidAmount?: number) => void;
  onDeleteExpense?: (id: string, skipBalanceAdjust?: boolean) => void;
  onUpdateExpense?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  readOnly?: boolean;
  isVehicleView?: boolean;
  locadores?: LocadorInfo[];
  onSaveLocador?: (info: LocadorInfo) => void;
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const businessTabs: { type: BusinessType; label: string; icon: React.ElementType }[] = [
  { type: "venda", label: "Vendas", icon: ShoppingCart },
  { type: "streaming", label: "Streaming", icon: Tv },
  { type: "aluguel_veiculo", label: "Aluguel de Veículos", icon: Car },
];

// Tabs shown inside ProductSalesView (vehicles removed - now separate page)
const salesSubTabs: { type: BusinessType; label: string; icon: React.ElementType }[] = [
  { type: "venda", label: "Vendas", icon: ShoppingCart },
  { type: "streaming", label: "Streaming", icon: Tv },
];

function getSaleCategory(sale: Sale): "paid" | "overdue" | "due_today" | "on_track" {
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : sale.paidInstallments >= 1;
  if (isPaid) return "paid";

  // Find next unpaid installment due date
  const baseDate = new Date(sale.date + "T00:00:00");
  const nextInstIdx = sale.paidInstallments;
  const customDate = sale.installmentDates && sale.installmentDates[nextInstIdx];
  const dueDate = customDate ? new Date(customDate + "T00:00:00") : (isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", nextInstIdx) : baseDate);
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diff = Math.floor((todayNorm.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));

  if (diff > 0) return "overdue";
  if (diff === 0) return "due_today";
  return "on_track";
}

const saleCategoryConfig = {
  paid: { label: "Pago", badge: "bg-success/20 text-success border-success/30", border: "border-success/50", bg: "bg-success/[0.22]", header: "bg-success/[0.45] border-success/30" },
  overdue: { label: "Vencida", badge: "bg-destructive/20 text-destructive border-destructive/30", border: "border-destructive/50", bg: "bg-destructive/[0.22]", header: "bg-destructive/[0.45] border-destructive/30" },
  due_today: { label: "Vence Hoje", badge: "bg-warning/20 text-warning border-warning/30", border: "border-warning/50", bg: "bg-warning/[0.22]", header: "bg-warning/[0.45] border-warning/30" },
  on_track: { label: "Em Dia", badge: "bg-primary/20 text-primary border-primary/30", border: "border-primary/50", bg: "bg-card", header: "bg-primary/8 border-border/50" },
};

function SalePaymentHistoryDialog({
  open,
  onOpenChange,
  sale,
  onUpdate,
  formatCurrency,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
}) {
  const { activeMethods } = usePaymentMethods();
  const methodById = useMemo(() => {
    const m = new Map<string, { name: string; icon: string | null; kind: string }>();
    activeMethods.forEach((pm) => m.set(pm.id, { name: pm.name, icon: pm.icon, kind: pm.kind }));
    return m;
  }, [activeMethods]);
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const amounts = sale.installmentAmounts;
  const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
  const getParcelaValue = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultVal;

  const rawHistory = sale.paymentHistory || [];
  const synthetic: (SalePaymentRecord & { __synthetic?: boolean })[] = [];
  if (rawHistory.length === 0) {
    if ((sale.downPayment || 0) > 0) {
      synthetic.push({ amount: sale.downPayment, date: sale.date, type: "full", notes: "Entrada", __synthetic: true } as any);
    }
    for (let i = 0; i < (sale.paidInstallments || 0); i++) {
      const customDate = sale.installmentDates && sale.installmentDates[i];
      const baseDate = new Date(sale.date + "T00:00:00");
      const dueDate = customDate ? customDate : format(isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", i) : baseDate, "yyyy-MM-dd");
      synthetic.push({ amount: getParcelaValue(i), date: dueDate, type: "full", installmentNumber: i + 1, notes: `Parcela ${i + 1} (registro anterior)`, __synthetic: true } as any);
    }
    if ((sale.partialPaid || 0) > 0) {
      synthetic.push({ amount: sale.partialPaid, date: todayInAppTz(), type: "partial", notes: "Pagamento parcial (registro anterior)", __synthetic: true } as any);
    }
  }
  const sorted = [...(rawHistory.length > 0 ? rawHistory : synthetic)].sort((a, b) => {
    const ka = `${a.date}T${(a as any).time || "00:00"}`;
    const kb = `${b.date}T${(b as any).time || "00:00"}`;
    return ka.localeCompare(kb);
  });
  const totalPago = sorted.reduce((s, r) => s + r.amount, 0);
  const totalContrato = sale.total || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col bg-card/90 backdrop-blur-2xl border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-success" />
            Histórico de Pagamentos
          </DialogTitle>
          <DialogDescription>
            {sorted.length > 0
              ? `${sorted.length} movimentação(ões) — do mais antigo ao mais recente.`
              : "Nenhum pagamento registrado ainda."}
          </DialogDescription>
        </DialogHeader>
        {sorted.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-success/20 bg-success/5 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Pago</p>
              <p className="text-sm font-bold text-success tabular-nums">{formatCurrency(totalPago)}</p>
            </div>
            <div className="rounded-xl border border-warning/20 bg-warning/5 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Restante</p>
              <p className="text-sm font-bold text-warning tabular-nums">{formatCurrency(Math.max(0, totalContrato - totalPago))}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Contrato</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(totalContrato)}</p>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
          {sorted.length > 0 ? (() => {
            let running = 0;
            return sorted.map((record, i) => {
              const method = record.paymentMethodId ? methodById.get(record.paymentMethodId) : null;
              const MethodIcon = method?.icon ? (LucideIcons as any)[method.icon] : Wallet;
              const isFull = record.type === "full";
              const isSynthetic = (record as any).__synthetic === true;
              const origIdx = isSynthetic ? -1 : (sale.paymentHistory || []).indexOf(record);
              running += record.amount;
              const saldoApos = Math.max(0, totalContrato - running);
              const time = (record as any).time as string | undefined;
              const userName = (record as any).userName as string | undefined;
              const instNum = (record as any).installmentNumber as number | undefined;
              return (
                <div key={`${record.date}-${i}`} className={`rounded-xl border p-3 ${isFull ? "border-success/20 bg-success/5" : "border-warning/20 bg-warning/5"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isFull ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(record.amount)}</p>
                          {instNum ? (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/60">
                              Parcela {instNum}
                            </Badge>
                          ) : null}
                        </div>
                        <Badge className={`text-[10px] uppercase tracking-wide ${isFull ? "bg-success/20 text-success border-success/30" : "bg-warning/20 text-warning border-warning/30"}`}>
                          {isFull ? "Pago" : "Parcial"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                          <span>{format(new Date(record.date + "T00:00:00"), "dd/MM/yyyy")}{time ? ` • ${time}` : ""}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                          <MethodIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {method?.name || "Não informado"}
                            {method ? ` • ${method.kind === "cash" ? "Caixa" : "Conta"}` : ""}
                          </span>
                        </div>
                        {userName && (
                          <div className="flex items-center gap-1.5 text-muted-foreground col-span-2 min-w-0">
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{userName}</span>
                          </div>
                        )}
                      </div>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-1.5">
                          {record.notes}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-border/30">
                        <span className="text-muted-foreground">Saldo após pagamento</span>
                        <span className="font-semibold text-foreground tabular-nums">{formatCurrency(saldoApos)}</span>
                      </div>
                    </div>
                    {!readOnly && !isSynthetic && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => {
                          const newHistory = (sale.paymentHistory || []).filter((_, idx) => idx !== origIdx);
                          let recalcPaid = 0;
                          let recalcPartial = 0;
                          const getVal = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultVal;
                          let accumulated = 0;
                          let instIdx = 0;
                          for (const r of newHistory) {
                            accumulated += r.amount;
                            while (instIdx < sale.installments && accumulated >= getVal(instIdx) - 0.01) {
                              accumulated -= getVal(instIdx);
                              instIdx++;
                            }
                          }
                          recalcPaid = instIdx;
                          recalcPartial = accumulated > 0.01 ? accumulated : 0;
                          onUpdate({ paymentHistory: newHistory, paidInstallments: recalcPaid, partialPaid: recalcPartial });
                          if (newHistory.length === 0) onOpenChange(false);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            });
          })() : (
            <div className="text-center py-8">
              <Receipt className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum pagamento registrado</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WarrantyDialog({
  open,
  onOpenChange,
  sale,
  onUpdate,
  products,
  formatCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  products: Product[];
  formatCurrency: (v: number) => string;
}) {
  const [selectedProductId, setSelectedProductId] = useState<string>(sale.warrantyProductId || "");
  const [quantity, setQuantity] = useState<string>(sale.warrantyQuantity?.toString() || "1");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedProductId) {
      toast.error("Selecione um produto para a garantia.");
      return;
    }

    const qty = parseInt(quantity) || 0;
    if (qty <= 0) {
      toast.error("A quantidade deve ser maior que zero.");
      return;
    }

    setSubmitting(true);
    try {
      const product = (products || []).find((p: Product) => p.id === selectedProductId);
      if (!product) throw new Error("Produto não encontrado");

      // Se já tinha uma garantia, devolve ao estoque antes de registrar a nova
      if (sale.warrantyProductId) {
        const oldProduct = (products || []).find(p => p.id === sale.warrantyProductId);
        if (oldProduct) {
          const restoredStock = oldProduct.stock + (sale.warrantyQuantity || 0);
          await supabase.from("products").update({ stock: restoredStock }).eq("id", sale.warrantyProductId);
        }
      }

      // Valida estoque do novo produto
      if (product.stock < qty) {
        toast.error(`Estoque insuficiente de "${product.name}" (disponível: ${product.stock}).`);
        setSubmitting(false);
        return;
      }

      // Atualiza estoque do novo produto
      const newStock = product.stock - qty;
      await supabase.from("products").update({ stock: newStock }).eq("id", selectedProductId);

      // Registra movimento de estoque
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("stock_movements" as any).insert({
        owner_id: user?.id,
        user_id: user?.id,
        product_id: selectedProductId,
        product_name: product.name,
        movement_type: "venda",
        quantity: -qty,
        notes: `Garantia vinculada ao contrato de ${sale.customerName}`,
        sale_id: sale.id,
      } as any);

      await onUpdate({
        warrantyProductId: selectedProductId,
        warrantyQuantity: qty,
      });

      toast.success("Garantia registrada com sucesso e estoque atualizado!");
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao registrar garantia.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!sale.warrantyProductId) return;
    
    setSubmitting(true);
    try {
      const product = (products || []).find((p: Product) => p.id === sale.warrantyProductId);
      if (product) {
        const restoredStock = product.stock + (sale.warrantyQuantity || 0);
        await supabase.from("products").update({ stock: restoredStock }).eq("id", sale.warrantyProductId);
        
        // Registra movimento de estorno
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("stock_movements" as any).insert({
          owner_id: user?.id,
          user_id: user?.id,
          product_id: sale.warrantyProductId,
          product_name: product.name,
          movement_type: "entrada_manual",
          quantity: sale.warrantyQuantity || 0,
          notes: `Estorno de garantia (cancelamento) - contrato ${sale.customerName}`,
          sale_id: sale.id,
        } as any);
      }

      await onUpdate({
        warrantyProductId: null,
        warrantyQuantity: null,
      });

      toast.success("Garantia removida e estoque estornado.");
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao remover garantia.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/90 backdrop-blur-2xl border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Configurar Garantia
          </DialogTitle>
          <DialogDescription>
            Vincule um produto deste contrato como garantia. O estoque será atualizado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Produto em Garantia</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} (Estoque: {p.stock})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {selectedProduct && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Impacto no Estoque</p>
              <p className="text-sm font-semibold">
                Serão removidas <span className="text-primary">{quantity}</span> unidades de <span className="text-primary">{selectedProduct.name}</span>.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          {sale.warrantyProductId && (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10"
              onClick={handleRemove}
              disabled={submitting}
            >
              Remover Garantia
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedProductId}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
            {sale.warrantyProductId ? "Atualizar" : "Registrar"} Garantia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Diálogo unificado para registrar pagamento de uma parcela (parcial ou total).
 * Mostra: total da parcela, já pago acumulado nela, restante, status, e captura
 * valor, data, hora, forma de pagamento, observação e usuário responsável.
 * Detecta automaticamente parcial vs total com base no valor informado.
 */
function RegisterSalePaymentDialog({
  open,
  onOpenChange,
  sale,
  onUpdate,
  formatCurrency,
  initialMode = "full",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  initialMode?: "full" | "partial";
}) {
  const { celebrate } = usePaymentCelebration();
  const { activeMethods } = usePaymentMethods();
  const methodById = useMemo(() => {
    const m = new Map<string, { name: string; kind: string }>();
    activeMethods.forEach((pm) => m.set(pm.id, { name: pm.name, kind: pm.kind }));
    return m;
  }, [activeMethods]);

  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const amounts = sale.installmentAmounts;
  const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
  const getParcelaValue = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultVal;

  const nextIdx = sale.paidInstallments;
  const parcelaTotal = getParcelaValue(nextIdx);
  const jaPagoParcela = sale.partialPaid || 0;
  const restanteParcela = Math.max(0, parcelaTotal - jaPagoParcela);

  // Status atual da parcela
  const baseDate = new Date(sale.date + "T00:00:00");
  const customDate = sale.installmentDates && sale.installmentDates[nextIdx];
  const dueDate = customDate
    ? new Date(customDate + "T00:00:00")
    : (isRecorrente ? addByFrequency(baseDate, sale.frequency || "Mensal", nextIdx) : baseDate);
  const today = new Date();
  const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const dayDiff = Math.floor((todayNorm.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));
  let parcelaStatus: { label: string; cls: string };
  if (jaPagoParcela > 0) parcelaStatus = { label: "Parcial", cls: "bg-warning/20 text-warning border-warning/30" };
  else if (dayDiff > 0) parcelaStatus = { label: "Atrasada", cls: "bg-destructive/20 text-destructive border-destructive/30" };
  else if (dayDiff === 0) parcelaStatus = { label: "Vence hoje", cls: "bg-warning/20 text-warning border-warning/30" };
  else parcelaStatus = { label: "Pendente", cls: "bg-primary/20 text-primary border-primary/30" };

  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string>("");
  const [methodId, setMethodId] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [showMethodError, setShowMethodError] = useState(false);

  // Reset & preset on open
  useEffect(() => {
    if (open) {
      const now = new Date();
      setDate(now);
      setTime(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      setAmount(initialMode === "full" ? restanteParcela.toFixed(2) : "");
      setMethodId(null);
      setNotes("");
      setShowMethodError(false);
    }
  }, [open, initialMode, restanteParcela]);

  const valNum = parseFloat(amount) || 0;
  const willComplete = valNum + jaPagoParcela >= parcelaTotal - 0.01;
  const detectedType: "full" | "partial" = willComplete ? "full" : "partial";
  const novoSaldoParcela = Math.max(0, parcelaTotal - jaPagoParcela - valNum);
  const canSubmit = valNum > 0 && !!date && !!methodId;

  const handleSubmit = async () => {
    if (!date) return;
    if (!methodId) { setShowMethodError(true); return; }
    if (valNum <= 0) return;

    // Resolve usuário responsável
    let userName: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userName = user?.email || (user?.user_metadata as any)?.display_name || null;
    } catch { /* ignore */ }

    const newRecord: SalePaymentRecord = {
      amount: valNum,
      date: format(date, "yyyy-MM-dd"),
      time: time || null,
      type: detectedType,
      paymentMethodId: methodId,
      notes: notes.trim() || null,
      installmentNumber: nextIdx + 1,
      userName,
    };
    const check = validateSalePayment(sale.paymentHistory || [], newRecord);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    const history = [...(sale.paymentHistory || []), newRecord];
    if (willComplete) {
      const remainder = valNum + jaPagoParcela - parcelaTotal;
      onUpdate({
        paidInstallments: Math.min(sale.installments, sale.paidInstallments + 1),
        partialPaid: remainder > 0.01 ? remainder : 0,
        paymentHistory: history,
      });
      celebrate({ kind: "sale", message: "Parcela paga!", amount: valNum });
    } else {
      onUpdate({ partialPaid: jaPagoParcela + valNum, paymentHistory: history });
      celebrate({ kind: "sale", message: "Pagamento recebido!", amount: valNum });
    }
    onOpenChange(false);
  };

  const methodInfo = methodId ? methodById.get(methodId) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="sm:max-w-md max-h-[92vh] overflow-y-auto bg-card/95 backdrop-blur-2xl border-white/10 shadow-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-primary" />
            Registrar Pagamento
          </DialogTitle>
          <DialogDescription>
            Parcela {nextIdx + 1}{isRecorrente ? ` de ${sale.installments}` : ""} — vencimento {format(dueDate, "dd/MM/yyyy")}
          </DialogDescription>
        </DialogHeader>

        {/* Painel de status da parcela */}
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Status</span>
            <Badge className={`text-[10px] uppercase tracking-wide ${parcelaStatus.cls}`}>{parcelaStatus.label}</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(parcelaTotal)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Já pago</p>
              <p className="text-sm font-bold text-success tabular-nums">{formatCurrency(jaPagoParcela)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Restante</p>
              <p className="text-sm font-bold text-warning tabular-nums">{formatCurrency(restanteParcela)}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-sm">Valor pago (R$) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1"
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                Detectado: <span className={`font-semibold ${detectedType === "full" ? "text-success" : "text-warning"}`}>
                  {detectedType === "full" ? "Pagamento total da parcela" : "Pagamento parcial"}
                </span>
              </span>
              <button
                type="button"
                className="text-primary underline-offset-2 hover:underline"
                onClick={() => setAmount(restanteParcela.toFixed(2))}
              >
                Usar restante
              </button>
            </div>
            {valNum > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Novo saldo da parcela: <span className="font-semibold text-foreground tabular-nums">{formatCurrency(novoSaldoParcela)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-sm">Data <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal mt-1", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "dd/MM/yy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-sm flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
            </div>
          </div>

          <PaymentMethodPicker
            value={methodId}
            onChange={(id) => { setMethodId(id); setShowMethodError(false); }}
            required
            showError={showMethodError}
            label="Forma de pagamento / Conta de destino"
          />
          {methodInfo && (
            <p className="text-[11px] text-muted-foreground -mt-1">
              Conta de destino: <span className="font-semibold text-foreground">{methodInfo.name}</span> ({methodInfo.kind === "cash" ? "Caixa / Dinheiro" : "Conta bancária"})
            </p>
          )}

          <div>
            <Label className="text-sm">Observações (opcional)</Label>
            <Textarea
              rows={2}
              placeholder="Detalhes do pagamento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="bg-primary hover:bg-primary/90">
            <CheckCircle className="h-4 w-4 mr-1.5" />
            Confirmar {detectedType === "full" ? "pagamento total" : "parcial"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaleCard({ sale, onDelete, onEdit, onUpdate, formatCurrency, readOnly = false, clients = [], locadorInfo, registeredVehicles = [], locadores = [], products = [] }: { sale: Sale; onDelete: () => void; onEdit: () => void; onUpdate: (data: Partial<Omit<Sale, "id">>) => void; formatCurrency: (v: number) => string; readOnly?: boolean; clients?: Client[]; locadorInfo?: LocadorInfo; registeredVehicles?: VehicleInfo[]; locadores?: LocadorInfo[]; products: Product[] }) {
  const { celebrate } = usePaymentCelebration();
  const { activeMethods } = usePaymentMethods();
  const methodById = useMemo(() => {
    const m = new Map<string, { name: string; icon: string | null }>();
    activeMethods.forEach((pm) => m.set(pm.id, { name: pm.name, icon: pm.icon }));
    return m;
  }, [activeMethods]);
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date | undefined>(undefined);
  const [partialMethodId, setPartialMethodId] = useState<string | null>(null);
  const [partialNotes, setPartialNotes] = useState("");
  const [fullMethodId, setFullMethodId] = useState<string | null>(null);
  const [fullNotes, setFullNotes] = useState("");
  const [fullDate, setFullDate] = useState<Date | undefined>(undefined);
  const [showParcelas, setShowParcelas] = useState(false);
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(false);
  const [showWarranty, setShowWarranty] = useState(false);
  const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const amounts = sale.installmentAmounts;
  const defaultValorParcela = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;
  const getParcelaValue = (idx: number) => amounts && amounts[idx] != null ? amounts[idx] : defaultValorParcela;
  const valorParcela = defaultValorParcela; // used for summary fallback
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : sale.paidInstallments >= 1;
  const pendentes = isRecorrente ? sale.installments - sale.paidInstallments : (sale.paidInstallments >= 1 ? 0 : 1);
  const category = getSaleCategory(sale);
  const catStyle = saleCategoryConfig[category];
  const normalizeClientName = (value?: string) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  const saleClientName = normalizeClientName(sale.customerName);
  const matchedClients = saleClientName
    ? clients.filter((client) => normalizeClientName(client.name) === saleClientName)
    : [];
  const matchedClient =
    matchedClients.find((client) => client.isVehicleRental || client.rg || client.city) ?? matchedClients[0];

  // Generate installment rows with estimated dates
  const totalParcelas = isRecorrente ? sale.installments : 1;
  const parcelas = Array.from({ length: totalParcelas }, (_, i) => {
    const instBaseDate = new Date(sale.date + "T00:00:00");
    const customDate = sale.installmentDates && sale.installmentDates[i];
    const dueDate = customDate ? new Date(customDate + "T00:00:00") : (isRecorrente ? addByFrequency(instBaseDate, sale.frequency || "Mensal", i) : instBaseDate);
    const baseValue = getParcelaValue(i);
    const isNextPending = i === sale.paidInstallments;
    const displayValue = isNextPending && (sale.partialPaid || 0) > 0 ? Math.max(0, baseValue - (sale.partialPaid || 0)) : baseValue;
    return {
      number: i + 1,
      date: format(dueDate, "dd/MM/yyyy"),
      rawDate: dueDate,
      value: displayValue,
      fullValue: baseValue,
      paid: i < sale.paidInstallments,
    };
  });

  return (
    <>
    <Card no3d className={`overflow-hidden hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out border ${catStyle.border} ${catStyle.bg} h-full flex flex-col`}>
      {/* Customer header - fixed */}
      <div className={`border-b px-4 py-2.5 text-center ${catStyle.header}`}>
        <h3 className="font-bold text-foreground text-sm truncate">{sale.customerName || sale.description || sale.productName}</h3>
      </div>

      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        {/* Row 1: Icon + Description + Badge - fixed height */}
        <div className="flex items-center gap-3 h-10">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 ${
            isPaid ? "bg-success" : "gradient-primary"
          }`}>
            <TabIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{sale.description || sale.productName}</p>
            {sale.customerName ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <User className="h-3 w-3 shrink-0" />{sale.customerName}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">&nbsp;</p>
            )}
          </div>
          <Badge className={`${catStyle.badge} text-xs shrink-0`}>{catStyle.label}</Badge>
        </div>

        {/* Due date highlight */}
        {!isPaid && (() => {
          const nextIdx = sale.paidInstallments;
          const nextParcela = parcelas[nextIdx];
          if (!nextParcela) return null;
          const dueDate = nextParcela.rawDate;
          const today = new Date();
          const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          const diff = Math.floor((todayNorm.getTime() - dueNorm.getTime()) / (1000 * 60 * 60 * 24));
          const isOverdue = diff > 0;
          const isToday = diff === 0;
          return (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border ${
              isOverdue ? "bg-destructive/10 border-destructive/30" : isToday ? "bg-warning/10 border-warning/30" : "bg-primary/10 border-primary/30"
            }`}>
              <Clock className={`h-4 w-4 shrink-0 ${isOverdue ? "text-destructive" : isToday ? "text-warning" : "text-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Vencimento ({nextIdx + 1}ª parcela)</p>
                <p className={`text-sm font-bold ${isOverdue ? "text-destructive" : isToday ? "text-warning" : "text-primary"}`}>
                  {format(dueDate, "dd/MM/yyyy")}
                  {isOverdue && <span className="text-xs font-normal ml-1">({diff} dias atrás)</span>}
                  {isToday && <span className="text-xs font-normal ml-1">(hoje)</span>}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Row 2: Info grid */}
        <div className="grid grid-cols-2 gap-3 border border-border/30 rounded-xl p-3">
          <div>
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <p className="text-sm font-bold text-foreground">{formatCurrency(sale.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{isRecorrente ? "Valor Parcela" : "Quantidade"}</p>
            <p className="text-sm font-bold text-foreground">{isRecorrente ? (amounts ? "Variável" : formatCurrency(valorParcela)) : sale.quantity}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Valor Pago</p>
            <p className="text-sm font-bold text-success">{formatCurrency(parcelas.filter(p => p.paid).reduce((s, p) => s + p.fullValue, 0) + (sale.downPayment || 0) + (sale.partialPaid || 0))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Restante</p>
            <p className="text-sm font-bold text-warning">{formatCurrency(Math.max(0, parcelas.filter(p => !p.paid).reduce((s, p) => s + p.fullValue, 0) - (sale.partialPaid || 0)))}</p>
          </div>
        </div>

        {/* Row 3: Parcelas / Status info - fixed height */}
        <div className="grid grid-cols-2 gap-3 h-[52px]">
          <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground">Pagas</p>
            <p className="text-sm font-bold text-success">{sale.paidInstallments}/{sale.installments}</p>
          </div>
          <div className="bg-muted/30 border border-border/50 rounded-lg px-3 py-2">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-sm font-bold text-foreground">{pendentes}</p>
          </div>
        </div>

        {/* Row 4: Parcelas expandable - conditional but fixed position */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowParcelas(!showParcelas)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Parcelas ({totalParcelas})</span>
              </div>
              <div className="flex items-center gap-2">
                {showParcelas ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>
            {showParcelas && (
              <div className="divide-y divide-border/30 max-h-48 overflow-y-auto">
                {parcelas.map((p) => (
                  <div key={p.number} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      p.paid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                    }`}>
                      {p.number}ª
                    </span>
                    <span className="text-sm text-foreground flex-1">{p.date}</span>
                    <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
                    {(() => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const isOverdue = !p.paid && p.rawDate < today;
                      const hasPartial = !p.paid && p.number === sale.paidInstallments + 1 && (sale.partialPaid || 0) > 0;
                      const label = p.paid ? "Paga" : hasPartial ? `${formatCurrency(sale.partialPaid)} pago` : isOverdue ? "Vencida" : "Pendente";
                      const cls = p.paid ? "text-success" : isOverdue ? "text-destructive" : "text-muted-foreground";
                      return <span className={`text-xs font-medium w-16 text-right ${cls}`}>{label}</span>;
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Histórico de pagamentos (modal) — ordem cronológica */}
        <SalePaymentHistoryDialog
          open={showPayments}
          onOpenChange={setShowPayments}
          sale={sale}
          onUpdate={onUpdate}
          formatCurrency={formatCurrency}
          readOnly={readOnly}
        />

        {/* Botão visível — abre histórico de pagamentos */}
        <button
          type="button"
          onClick={() => setShowPayments(true)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm">
            <Receipt className="h-4 w-4 text-success" />
            <span className="font-medium text-foreground">Histórico de Pagamentos</span>
            <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
              {(sale.paymentHistory || []).length}
            </Badge>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Garantia (modal) */}
        {!readOnly && (
          <WarrantyDialog
            open={showWarranty}
            onOpenChange={setShowWarranty}
            sale={sale}
            onUpdate={onUpdate}
            products={products || []}
            formatCurrency={formatCurrency}
          />
        )}

        {/* Botão de Garantia */}
        <button
          type="button"
          onClick={() => setShowWarranty(true)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm text-left">
            <ShieldCheck className={`h-4 w-4 ${sale.warrantyProductId ? "text-primary" : "text-muted-foreground"}`} />
            <span className="font-medium text-foreground">Garantia</span>
            {sale.warrantyProductId && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 bg-primary/10 text-primary">
                Ativa
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate max-w-[120px]">
            {sale.warrantyProductId 
              ? products.find(p => p.id === sale.warrantyProductId)?.name || "Produto"
              : "Não registrada"}
            <ChevronDown className="h-4 w-4" />
          </div>
        </button>

        {/* Row 5: Payment action panel */}
        <div className="mt-auto space-y-2">
          {(() => {
            const totalPaid = parcelas.filter(p => p.paid).reduce((s, p) => s + p.fullValue, 0)
              + (sale.downPayment || 0) + (sale.partialPaid || 0);
            const pct = sale.total > 0 ? Math.min(100, Math.round((totalPaid / sale.total) * 100)) : 0;
            const hasPartial = (sale.partialPaid || 0) > 0;
            const nextIdx = sale.paidInstallments;
            const nextParcela = parcelas[nextIdx];
            let state: "paid" | "partial" | "overdue" | "pending" = "pending";
            if (isPaid) state = "paid";
            else if (nextParcela) {
              const today = new Date(); today.setHours(0,0,0,0);
              if (nextParcela.rawDate < today) state = "overdue";
              else if (hasPartial) state = "partial";
              else state = "pending";
            } else if (hasPartial) state = "partial";

            const stateConfig = {
              paid: { label: "Quitado", icon: CheckCircle2, cls: "bg-success/15 text-success border-success/30", bar: "bg-success" },
              partial: { label: "Parcial", icon: HandCoins, cls: "bg-warning/15 text-warning border-warning/30", bar: "bg-warning" },
              overdue: { label: "Atrasado", icon: Clock, cls: "bg-destructive/15 text-destructive border-destructive/30", bar: "bg-destructive" },
              pending: { label: "Pendente", icon: Clock, cls: "bg-primary/15 text-primary border-primary/30", bar: "bg-primary" },
            }[state];
            const StIcon = stateConfig.icon;

            return (
              <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm p-2.5 space-y-2.5 transition-all duration-300">
                {/* Status + progress */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateConfig.cls} transition-colors duration-300`}>
                    <StIcon className="h-3 w-3" />
                    {stateConfig.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                      <span className="tabular-nums font-medium">{formatCurrency(totalPaid)}</span>
                      <span className="tabular-nums font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={`h-full ${stateConfig.bar} rounded-full transition-all duration-700 ease-out`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {!isPaid && (
                  <>
                    <RegisterSalePaymentDialog
                      open={showPartial}
                      onOpenChange={setShowPartial}
                      sale={sale}
                      onUpdate={onUpdate}
                      formatCurrency={formatCurrency}
                      initialMode="partial"
                    />
                    <RegisterSalePaymentDialog
                      open={showPayDatePicker}
                      onOpenChange={setShowPayDatePicker}
                      sale={sale}
                      onUpdate={onUpdate}
                      formatCurrency={formatCurrency}
                      initialMode="full"
                    />
                    {!readOnly && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="success"
                          size="sm"
                          className="flex-[2] min-w-[140px] h-10 text-xs font-semibold rounded-xl shadow-[0_6px_18px_-8px_hsl(var(--success)/0.6)] hover:shadow-[0_10px_24px_-8px_hsl(var(--success)/0.85)] hover:-translate-y-[1px] transition-all duration-200"
                          onClick={() => setShowPayDatePicker(true)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Pagar Parcela
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-w-[120px] h-10 text-xs font-semibold rounded-xl border-warning/40 text-warning hover:bg-warning hover:text-warning-foreground hover:border-warning transition-all duration-200"
                          onClick={() => setShowPartial(true)}
                        >
                          <HandCoins className="h-4 w-4" /> Parcial
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {isPaid && (
                  <div className="flex items-center justify-center gap-2 py-1.5 text-success animate-fade-in">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-semibold">Pagamento concluído</span>
                  </div>
                )}
              </div>
            );
          })()}

          {(() => {
            const parsed = parseNotesWithMerchandise(sale.notes);
            const merch = parsed.merchandise;
            const userNotes = parsed.userNotes;
            const totalVal = sale.total || 0;
            const merchValor = merch?.valor || 0;
            const dinheiroTotal = Math.max(0, totalVal - merchValor);
            const cashRatio = merchValor > 0 && totalVal > 0 ? dinheiroTotal / totalVal : 1;
            const pagoBruto = parcelas.filter(p => p.paid).reduce((s, p) => s + p.fullValue, 0)
              + (sale.downPayment || 0) + (sale.partialPaid || 0);
            const pagoDinheiro = pagoBruto * cashRatio;
            return (
              <>
                {merch && (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 space-y-0.5">
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">Pagamento misto</p>
                    <p className="text-xs text-muted-foreground">
                      Total contrato: <span className="font-bold text-primary">{rawFormatCurrency(totalVal)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Em dinheiro: <span className="font-medium text-foreground">{rawFormatCurrency(dinheiroTotal)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mercadoria: <span className="font-medium text-foreground">{merch.descricao}</span> ({rawFormatCurrency(merchValor)})
                    </p>
                    <p className="text-xs text-muted-foreground pt-1 border-t border-primary/10 mt-1">
                      PAGO em dinheiro: <span className="font-bold text-success">{rawFormatCurrency(pagoDinheiro)}</span>
                    </p>
                  </div>
                )}
                {userNotes && (
                  <div className="bg-muted/20 border border-border/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground italic truncate">{userNotes}</p>
                  </div>
                )}
              </>
            );
          })()}

          {/* Footer: date + actions - always at bottom */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {new Date(sale.date + "T00:00:00").toLocaleDateString("pt-BR")}
            </p>
            <div className="flex items-center gap-1">
              {sale.businessType === "aluguel_veiculo" && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:bg-primary/10" onClick={() => {
                  const descNorm = (sale.description || sale.productName || "").toLowerCase().trim();
                  const matchedVehicle = registeredVehicles.find(v => v.marcaModelo.toLowerCase().trim() === descNorm);
                  const saleLocador = sale.locadorId ? locadores.find(l => l.id === sale.locadorId) : undefined;
                  generateContract(sale, matchedClient, saleLocador || locadorInfo, matchedVehicle);
                }} title="Gerar Contrato">
                  <FileText className="h-4 w-4" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:bg-success/10" onClick={() => setShowPayments(true)} title="Ver Pagamentos">
                <CircleCheck className="h-4 w-4" />
              </Button>
              {!readOnly && (
                <Button size="icon" variant="ghost" className={`h-8 w-8 hover:bg-primary/10 ${sale.warrantyProductId ? "text-primary" : "text-muted-foreground"}`} onClick={() => setShowWarranty(true)} title="Garantia">
                  <ShieldCheck className="h-4 w-4" />
                </Button>
              )}
              {!readOnly && (
                <>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onEdit}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setConfirmDeleteSale(true)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    <ConfirmDeleteDialog
      open={confirmDeleteSale}
      onOpenChange={setConfirmDeleteSale}
      onConfirm={() => { onDelete(); setConfirmDeleteSale(false); }}
      title="Excluir venda"
      description="Tem certeza que deseja excluir esta venda?"
    />
    </>
  );
}

function getNextDueDateHelper(s: Sale): Date {
  const isRec = s.paymentMode === "recorrente" && s.installments > 1;
  const baseDate = new Date(s.date + "T00:00:00");
  const nextIdx = s.paidInstallments;
  const customDate = s.installmentDates && s.installmentDates[nextIdx];
  if (customDate) return new Date(customDate + "T00:00:00");
  return isRec ? addByFrequency(baseDate, s.frequency || "Mensal", nextIdx) : baseDate;
}

function getNextInstallmentValueHelper(s: Sale): number {
  const nextIdx = s.paidInstallments;
  const amounts = s.installmentAmounts;
  if (amounts && amounts[nextIdx] != null) return amounts[nextIdx];
  return s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
}

function SaleListRow({ sale, onEdit, onDelete, onUpdate, formatCurrency, readOnly = false, incomeCategoryByName, products = [] }: {
  sale: Sale;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  readOnly?: boolean;
  incomeCategoryByName?: Map<string, CustomIncomeCategory>;
  products?: Product[];
}) {
  const [confirmDeleteSale, setConfirmDeleteSale] = useState(false);
  const [showPartial, setShowPartial] = useState(false);
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const historyCount = (sale.paymentHistory || []).length;
  const [showWarranty, setShowWarranty] = useState(false);

  const category = getSaleCategory(sale);
  const catStyle = saleCategoryConfig[category];
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const paidAmount = getSalePaidAmountHelper(sale);
  const remaining = Math.max(0, sale.total - paidAmount - (sale.partialPaid || 0));
  const isPaid = category === "paid";
  const nextDue = getNextDueDateHelper(sale);
  const nextInstValue = getNextInstallmentValueHelper(sale);
  const partialOnNext = (sale.partialPaid || 0) > 0 ? Math.max(0, nextInstValue - (sale.partialPaid || 0)) : nextInstValue;
  const productsList = (sale as any)._products || []; // We'll pass products through if available

  const incomeCat = sale.category ? incomeCategoryByName?.get(sale.category) : undefined;
  const CatIcon = incomeCat ? (personalIconMap[incomeCat.icon] ?? personalIconMap.Package) : Tag;
  const catColor = incomeCat ? `hsl(${incomeCat.color})` : undefined;

  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const totalPaidIncludingPartial = paidAmount + (sale.partialPaid || 0);
  const statusInfo = isPaid
    ? { label: "Quitado", cls: "bg-success/15 text-success border-success/30" }
    : category === "overdue"
    ? { label: "Atrasado", cls: "bg-destructive/15 text-destructive border-destructive/30" }
    : category === "due_today"
    ? { label: "Vence hoje", cls: "bg-warning/15 text-warning border-warning/30" }
    : { label: "Em dia", cls: "bg-primary/15 text-primary border-primary/30" };

  return (
    <div className="flex flex-col">
      <div 
        className={cn(
          "flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer",
          expanded && "bg-muted/20"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-primary-foreground font-bold text-[10px] sm:text-xs shrink-0 ${
          category === "paid" ? "bg-success" : category === "overdue" ? "bg-destructive" : category === "due_today" ? "bg-warning" : "gradient-primary"
        }`}>
          {(sale.customerName || sale.description || "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 lg:max-w-[200px]">
          <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{sale.customerName || "—"}</p>
          <span
            className="md:hidden mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium max-w-full"
            style={incomeCat ? {
              borderColor: `hsl(${incomeCat.color} / 0.4)`,
              backgroundColor: `hsl(${incomeCat.color} / 0.12)`,
              color: catColor,
            } : undefined}
          >
            <CatIcon className="h-2.5 w-2.5 shrink-0" style={catColor ? { color: catColor } : undefined} />
            <span className="truncate">{incomeCat ? incomeCat.name : "Sem categoria"}</span>
          </span>
        </div>
        <div className="hidden md:flex w-[120px] lg:w-[200px] shrink-0 min-w-0 items-center">
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium max-w-full"
            style={incomeCat ? {
              borderColor: `hsl(${incomeCat.color} / 0.4)`,
              backgroundColor: `hsl(${incomeCat.color} / 0.12)`,
              color: catColor,
            } : undefined}
          >
            <CatIcon className="h-3 w-3 shrink-0" style={catColor ? { color: catColor } : undefined} />
            <span className="truncate">{incomeCat ? incomeCat.name : "Sem categoria"}</span>
          </span>
        </div>
        <div className="hidden md:block w-[140px] lg:flex-1 lg:min-w-[200px] shrink-0 min-w-0">
          <p className="text-xs lg:text-sm font-bold text-foreground truncate">{sale.description || sale.productName || "—"}</p>
        </div>
        <div className="w-[78px] sm:w-[88px] lg:w-[110px] shrink-0">
          <p className="text-[11px] sm:text-xs text-foreground truncate">
            {!isPaid ? format(nextDue, "dd/MM/yyyy") : "Quitado"}{isRecorrente && ` • ${sale.paidInstallments}/${sale.installments}`}
          </p>
          {!isPaid && sale.businessType === "aluguel_veiculo" && (() => {
            const days = differenceInCalendarDays(nextDue, new Date());
            if (days < 0) return <p className="text-[10px] sm:text-[11px] font-semibold text-destructive truncate">{Math.abs(days)}d em atraso</p>;
            if (days === 0) return <p className="text-[10px] sm:text-[11px] font-semibold text-warning truncate">Vence hoje</p>;
            return <p className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground truncate">Faltam {days}d</p>;
          })()}
        </div>
        <div className="w-[102px] sm:w-[108px] lg:w-[140px] shrink-0 text-right tabular-nums">
          {isPaid ? (
            <p className="text-xs sm:text-sm font-bold text-success truncate">{formatCurrency(sale.total)}</p>
          ) : (
            <>
              <p className="text-xs sm:text-sm font-bold text-foreground truncate">{formatCurrency(partialOnNext)}</p>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">Rest. {formatCurrency(remaining)}</p>
            </>
          )}
        </div>
        <div className="shrink-0 pl-1">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className={cn(
          "px-2.5 sm:px-4 pb-3 pt-1 space-y-3 animate-in fade-in duration-300",
          !isMobile && "border-t border-border/10 bg-muted/5"
        )}>
          {sale.warrantyProductId && (
            <div className="flex items-center gap-3 rounded-xl bg-primary/5 border border-primary/10 p-2.5 animate-in slide-in-from-top-1 duration-200">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] text-primary/70 uppercase tracking-widest font-bold">Garantia Vinculada</p>
                  <Badge variant="outline" className="h-4 text-[9px] px-1.5 border-primary/20 bg-primary/5 text-primary">
                    {sale.warrantyQuantity || 1} { (sale.warrantyQuantity || 1) > 1 ? "unidades" : "unidade" }
                  </Badge>
                </div>
                <p className="text-sm font-bold text-foreground truncate">
                  {products.find(p => p.id === sale.warrantyProductId)?.name || "Produto não identificado"}
                </p>
              </div>
            </div>
          )}

          {isMobile && (() => {
            const pct = sale.total > 0 ? Math.min(100, (totalPaidIncludingPartial / sale.total) * 100) : 0;
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground leading-none">Valor total</p>
                    <p className="font-bold text-foreground tabular-nums text-sm leading-tight">{formatCurrency(sale.total)}</p>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusInfo.cls}`}>
                    {statusInfo.label}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Cliente</span>
                    <span className="font-semibold text-foreground truncate">{sale.customerName || "—"}</span>
                  </div>
                  {(sale.description || sale.productName) && (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide shrink-0">Descrição</span>
                      <span className="font-medium text-foreground text-right line-clamp-2 break-words">{sale.description || sale.productName}</span>
                    </div>
                  )}
                </div>

                {!isPaid && sale.total > 0 && (
                  <div className="space-y-1">
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-success rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] tabular-nums">
                      <span className="text-success font-semibold">{formatCurrency(totalPaidIncludingPartial)} pago</span>
                      <span className="text-warning font-semibold">{formatCurrency(remaining)} restante</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-semibold text-foreground tabular-nums">
                    <Receipt className="h-3 w-3 text-muted-foreground" />
                    {sale.paidInstallments}/{sale.installments} parcelas
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-semibold text-foreground tabular-nums">
                    <CalendarIcon className="h-3 w-3 text-muted-foreground" />
                    {isPaid ? "Quitado" : format(nextDue, "dd/MM/yyyy")}
                  </span>
                  {historyCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-semibold text-foreground tabular-nums">
                      {historyCount} pgto{historyCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {sale.notes && (
                  <p className="text-[11px] text-muted-foreground italic line-clamp-2 border-l-2 border-border/60 pl-2">
                    {sale.notes}
                  </p>
                )}
              </div>
            );
          })()}

          <div className={cn(
            "pt-2 flex flex-wrap gap-1.5 items-center",
            isMobile ? "border-t border-border/40 grid grid-cols-2 xs:grid-cols-4" : "justify-end"
          )}>
            {!readOnly && (
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 text-[11px] px-2 border-primary/30 hover:bg-primary hover:text-primary-foreground flex-1 sm:flex-none",
                  sale.warrantyProductId ? "bg-primary/5 text-primary" : "text-muted-foreground"
                )}
                onClick={(e) => { e.stopPropagation(); setShowWarranty(true); }}
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Gar.
              </Button>
            )}

            {!isPaid && !readOnly && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] px-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground flex-1 sm:flex-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HandCoins className="h-3.5 w-3.5 mr-1" /> Pagar
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="end">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowPayDatePicker(true); }}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-primary/10 transition-colors"
                  >
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Pagar Parcela</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowPartial(true); }}
                    className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-warning/10 transition-colors"
                  >
                    <HandCoins className="h-4 w-4 text-warning" />
                    <span>Pagar Parcial</span>
                  </button>
                </PopoverContent>
              </Popover>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[11px] px-2 border-success/30 text-success hover:bg-success hover:text-success-foreground relative flex-1 sm:flex-none"
              onClick={(e) => { e.stopPropagation(); setShowPayments(true); }}
            >
              <Receipt className="h-3.5 w-3.5 mr-1" /> Histórico
              {historyCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0 h-4 min-w-[16px]">
                  {historyCount}
                </Badge>
              )}
            </Button>

            {!readOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px] px-2 border-secondary text-secondary-foreground hover:bg-secondary/80 flex-1 sm:flex-none"
                  onClick={(e) => { e.stopPropagation(); onEdit(); }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px] px-2 border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground flex-1 sm:flex-none"
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteSale(true); }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <SalePaymentHistoryDialog
        open={showPayments}
        onOpenChange={setShowPayments}
        sale={sale}
        onUpdate={onUpdate}
        formatCurrency={formatCurrency}
        readOnly={readOnly}
      />
      
      {!isPaid && !readOnly && (
        <>
          <RegisterSalePaymentDialog
            open={showPartial}
            onOpenChange={setShowPartial}
            sale={sale}
            onUpdate={onUpdate}
            formatCurrency={formatCurrency}
            initialMode="partial"
          />
          <RegisterSalePaymentDialog
            open={showPayDatePicker}
            onOpenChange={setShowPayDatePicker}
            sale={sale}
            onUpdate={onUpdate}
            formatCurrency={formatCurrency}
            initialMode="full"
          />
        </>
      )}

      {!readOnly && (
        <WarrantyDialog
          open={showWarranty}
          onOpenChange={setShowWarranty}
          sale={sale}
          onUpdate={onUpdate}
          products={products || []}
          formatCurrency={formatCurrency}
        />
      )}

      <ConfirmDeleteDialog
        open={confirmDeleteSale}
        onOpenChange={setConfirmDeleteSale}
        onConfirm={() => { onDelete(); setConfirmDeleteSale(false); }}
        title="Excluir venda"
        description="Tem certeza que deseja excluir esta venda?"
      />
    </div>
  );
}
type SaleCategory = "all" | "overdue" | "due_today" | "paid" | "on_track";


const saleCategoryFilters: { id: SaleCategory; label: string; color: string; activeColor: string }[] = [
  { id: "all", label: "Todos", color: "border-border text-muted-foreground", activeColor: "bg-primary text-primary-foreground border-primary" },
  { id: "overdue", label: "Atrasados", color: "border-destructive/30 text-destructive", activeColor: "bg-destructive text-destructive-foreground border-destructive" },
  { id: "paid", label: "Pagos", color: "border-success/30 text-success", activeColor: "bg-success text-success-foreground border-success" },
  { id: "due_today", label: "Vence Hoje", color: "border-warning/30 text-warning", activeColor: "bg-warning text-warning-foreground border-warning" },
  { id: "on_track", label: "Em Dia", color: "border-primary/30 text-primary", activeColor: "bg-primary text-primary-foreground border-primary" },
];

// Client folder grouping for sales
interface SaleClientGroup {
  name: string;
  sales: Sale[];
  totalAmount: number;
  totalPaid: number;
  totalReceivable: number;
  hasOverdue: boolean;
}

function getSalePaidAmountHelper(s: Sale): number {
  const amounts = s.installmentAmounts;
  if (amounts && amounts.length > 0) {
    let paid = s.downPayment || 0;
    for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
      paid += amounts[i] || 0;
    }
    return paid;
  }
  const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
  return vp * s.paidInstallments + (s.downPayment || 0);
}

function SaleClientFolder({
  group, onDeleteSale, onUpdateSale, formatCurrency, onEdit, readOnly = false, clients = [], locadorInfo, registeredVehicles = [], locadores = [], products = [],
}: {
  group: SaleClientGroup;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  formatCurrency: (v: number) => string;
  onEdit: (sale: Sale) => void;
  readOnly?: boolean;
  clients?: Client[];
  locadorInfo?: LocadorInfo;
  registeredVehicles?: VehicleInfo[];
  locadores?: LocadorInfo[];
  products: Product[];
}) {
  const [open, setOpen] = useState(false);
  const activeCount = group.sales.filter((s) => getSaleCategory(s) !== "paid").length;
  const paidCount = group.sales.filter((s) => getSaleCategory(s) === "paid").length;

  return (
    <Card no3d className={`overflow-hidden transition-shadow hover:shadow-lg ${open ? "ring-1 ring-primary/20" : ""} ${group.hasOverdue ? "border-destructive/40" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0 shadow-md ${group.hasOverdue ? "bg-destructive" : "gradient-primary"}`}>
          {group.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground text-sm truncate">{group.name}</h3>
            {group.hasOverdue && <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Atrasado</Badge>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className="text-[10px]">{group.sales.length}</Badge>
            {activeCount > 0 && <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{activeCount} ativos</Badge>}
            {paidCount > 0 && <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/20">{paidCount} pagos</Badge>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">Total</p>
            <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">PAGO</p>
            <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
            <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <CardContent className="pt-0 pb-3 px-3 space-y-3">
          {/* Mobile summary */}
          <div className="flex sm:hidden items-center justify-between text-xs border-b border-border/30 pb-3">
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">Total</p>
              <p className="font-bold text-foreground">{formatCurrency(group.totalAmount)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">PAGO</p>
              <p className="font-bold text-success">{formatCurrency(group.totalPaid)}</p>
            </div>
            <div className="text-center flex-1">
              <p className="text-[9px] text-muted-foreground uppercase">A Receber</p>
              <p className={`font-bold ${group.hasOverdue ? "text-destructive" : "text-warning"}`}>{formatCurrency(group.totalReceivable)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.sales.map((sale) => (
              <SaleCard
                key={sale.id}
                sale={sale}
                onDelete={() => onDeleteSale(sale.id)}
                onEdit={() => onEdit(sale)}
                onUpdate={(data) => onUpdateSale(sale.id, data)}
                formatCurrency={formatCurrency}
                readOnly={readOnly}
                clients={clients}
                locadorInfo={locadorInfo}
                registeredVehicles={registeredVehicles}
                locadores={locadores}
                products={products || []}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function SalesList({ sales, onDeleteSale, onUpdateSale, clients = [], hideOnTrackCard = false, renderAfterCards, readOnly = false, locadorInfo, registeredVehicles = [], locadores = [], products = [] }: { sales: Sale[]; onDeleteSale: (id: string) => void; onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void; clients?: Client[]; hideOnTrackCard?: boolean; renderAfterCards?: React.ReactNode; readOnly?: boolean; locadorInfo?: LocadorInfo; registeredVehicles?: VehicleInfo[]; locadores?: LocadorInfo[]; products: Product[] }) {
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SaleCategory>("all");
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState<string>("all");
  const [view, setView] = useState<"cards" | "list" | "folders">("list");
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);
  const { categories: incomeCategories } = useIncomeCategories();
  const incomeCategoryByName = useMemo(() => {
    const m = new Map<string, CustomIncomeCategory>();
    incomeCategories.forEach((c) => m.set(c.name, c));
    return m;
  }, [incomeCategories]);

  // Count per category
  const counts = sales.reduce((acc, s) => {
    const cat = getSaleCategory(s);
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getNextDueDate = (s: Sale): Date => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    const baseDate = new Date(s.date + "T00:00:00");
    const nextInstIdx = s.paidInstallments;
    return isRecorrente ? addByFrequency(baseDate, s.frequency || "Mensal", nextInstIdx) : baseDate;
  };

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = s.description.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.productName.toLowerCase().includes(q) ||
      (s.category || "").toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (incomeCategoryFilter !== "all") {
      if (incomeCategoryFilter === "__none__") {
        if (s.category) return false;
      } else if (s.category !== incomeCategoryFilter) {
        return false;
      }
    }
    if (categoryFilter === "all") return getSaleCategory(s) !== "paid";
    return getSaleCategory(s) === categoryFilter;
  }).sort((a, b) => {
    // Sempre ordena por data de vencimento (mais antiga primeiro)
    return getNextDueDate(a).getTime() - getNextDueDate(b).getTime();
  });

  const total = filtered.reduce((acc, s) => acc + s.total, 0);

  // Determine which customer names have 2+ contracts across ALL sales (not filtered)
  const folderEligibleNames = useMemo(() => {
    const byName: Record<string, number> = {};
    sales.forEach((s) => {
      const name = s.customerName?.trim();
      if (name) byName[name] = (byName[name] || 0) + 1;
    });
    return new Set(Object.entries(byName).filter(([, c]) => c > 1).map(([name]) => name));
  }, [sales]);

  const folderCount = folderEligibleNames.size;

  const { saleGroups, saleSingles } = useMemo(() => {
    const byName: Record<string, Sale[]> = {};
    const saleSingles: Sale[] = [];
    filtered.forEach((s) => {
      const name = s.customerName?.trim();
      if (name && folderEligibleNames.has(name)) {
        (byName[name] ??= []).push(s);
      } else {
        saleSingles.push(s);
      }
    });
    const saleGroups: SaleClientGroup[] = [];
    Object.entries(byName).forEach(([name, salesGroup]) => {
      const totalPaid = salesGroup.reduce((s, sale) => s + getSalePaidAmountHelper(sale), 0);
      const totalReceivable = salesGroup.reduce((s, sale) => s + Math.max(0, sale.total - getSalePaidAmountHelper(sale)), 0);
      const hasOverdue = salesGroup.some((s) => getSaleCategory(s) === "overdue");
      saleGroups.push({ name, sales: salesGroup, totalAmount: salesGroup.reduce((s, sale) => s + sale.total, 0), totalPaid, totalReceivable, hasOverdue });
    });
    // Ordena grupos pela venda com vencimento mais antigo
    const earliestDue = (g: SaleClientGroup) => Math.min(...g.sales.map((s) => getNextDueDateHelper(s).getTime()));
    saleGroups.sort((a, b) => earliestDue(a) - earliestDue(b));
    // Ordena vendas dentro de cada grupo por vencimento ascendente
    saleGroups.forEach((g) => g.sales.sort((a, b) => getNextDueDateHelper(a).getTime() - getNextDueDateHelper(b).getTime()));
    return { saleGroups, saleSingles };
  }, [filtered, folderEligibleNames]);

  // Sorted list for list view (by due date ascending)
  const listSorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      return getNextDueDateHelper(a).getTime() - getNextDueDateHelper(b).getTime();
    });
  }, [filtered]);

  // Calculate receivables per category
  const getSalePaidAmount = (s: Sale) => {
    const amounts = s.installmentAmounts;
    if (amounts && amounts.length > 0) {
      let paid = s.downPayment || 0;
      for (let i = 0; i < s.paidInstallments && i < amounts.length; i++) {
        paid += amounts[i] || 0;
      }
      return paid + (s.partialPaid || 0);
    }
    const vp = s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : s.total;
    return vp * s.paidInstallments + (s.downPayment || 0) + (s.partialPaid || 0);
  };

  const getRemaining = (s: Sale) => Math.max(0, s.total - getSalePaidAmount(s));

  const overdueSales = sales.filter((s) => getSaleCategory(s) === "overdue");
  const onTrackSales = sales.filter((s) => getSaleCategory(s) === "on_track");
  const dueTodaySales = sales.filter((s) => getSaleCategory(s) === "due_today");
  const paidSales = sales.filter((s) => getSaleCategory(s) === "paid");

  // Calculate only the value of overdue installments (not all remaining)
  const getOverdueInstallmentsValue = (s: Sale): number => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    if (!isRecorrente) return getRemaining(s);
    const baseDate = new Date(s.date + "T00:00:00");
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let overdueValue = 0;
    for (let i = s.paidInstallments; i < s.installments; i++) {
      const customDate = s.installmentDates && s.installmentDates[i];
      const dueDate = customDate ? new Date(customDate + "T00:00:00") : addByFrequency(baseDate, s.frequency || "Mensal", i);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (todayNorm.getTime() > dueNorm.getTime()) {
        if (s.installmentAmounts && s.installmentAmounts[i] != null) {
          overdueValue += s.installmentAmounts[i] || 0;
        } else {
          overdueValue += s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : 0;
        }
      }
    }
    return Math.max(0, overdueValue - (s.partialPaid || 0));
  };

  // Calculate future (not-yet-due) installments value for a sale
  const getFutureInstallmentsValue = (s: Sale): number => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    if (!isRecorrente) return 0;
    const baseDate = new Date(s.date + "T00:00:00");
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let futureValue = 0;
    for (let i = s.paidInstallments; i < s.installments; i++) {
      const customDate = s.installmentDates && s.installmentDates[i];
      const dueDate = customDate ? new Date(customDate + "T00:00:00") : addByFrequency(baseDate, s.frequency || "Mensal", i);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (todayNorm.getTime() < dueNorm.getTime()) {
        if (s.installmentAmounts && s.installmentAmounts[i] != null) {
          futureValue += s.installmentAmounts[i] || 0;
        } else {
          futureValue += s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : 0;
        }
      }
    }
    return futureValue;
  };

  // Due today installment value
  const getDueTodayInstallmentValue = (s: Sale): number => {
    const isRecorrente = s.paymentMode === "recorrente" && s.installments > 1;
    if (!isRecorrente) return getRemaining(s);
    const baseDate = new Date(s.date + "T00:00:00");
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let todayValue = 0;
    for (let i = s.paidInstallments; i < s.installments; i++) {
      const customDate = s.installmentDates && s.installmentDates[i];
      const dueDate = customDate ? new Date(customDate + "T00:00:00") : addByFrequency(baseDate, s.frequency || "Mensal", i);
      const dueNorm = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      if (todayNorm.getTime() === dueNorm.getTime()) {
        if (s.installmentAmounts && s.installmentAmounts[i] != null) {
          todayValue += s.installmentAmounts[i] || 0;
        } else {
          todayValue += s.installments > 0 ? Math.max(0, s.total - (s.downPayment || 0)) / s.installments : 0;
        }
      }
    }
    return todayValue;
  };

  const totalOverdue = overdueSales.reduce((acc, s) => acc + getOverdueInstallmentsValue(s), 0);
  // "No Prazo" = future installments from ALL non-paid sales (including overdue contracts that have future installments)
  const totalOnTrack = sales.filter((s) => getSaleCategory(s) !== "paid").reduce((acc, s) => acc + getFutureInstallmentsValue(s), 0)
    + onTrackSales.filter((s) => s.paymentMode !== "recorrente" || s.installments <= 1).reduce((acc, s) => acc + getRemaining(s), 0);
  const totalDueToday = dueTodaySales.reduce((acc, s) => acc + getDueTodayInstallmentValue(s), 0);
  const totalPaid = sales.reduce((acc, s) => acc + getSalePaidAmount(s), 0);
  // Quantidade de contratos = somente os quitados
  const paidContractsCount = paidSales.length;
  const totalAReceber = sales.filter((s) => getSaleCategory(s) !== "paid").reduce((acc, s) => acc + getRemaining(s), 0);

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <div className={`grid ${hideOnTrackCard ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'} gap-2 sm:gap-3`}>
        <div className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center" style={{ animationDelay: '0ms', animationFillMode: 'backwards' }}>
          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Vencidos</p>
          <p className="text-sm sm:text-xl font-bold text-destructive mt-0.5">{formatCurrency(totalOverdue)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{overdueSales.length} contratos</p>
        </div>
        {!hideOnTrackCard && (
          <div className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center" style={{ animationDelay: '80ms', animationFillMode: 'backwards' }}>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">No Prazo</p>
            <p className="text-sm sm:text-xl font-bold text-primary mt-0.5">{formatCurrency(totalOnTrack + totalDueToday)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{onTrackSales.length + dueTodaySales.length} contratos</p>
          </div>
        )}
        <div className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center" style={{ animationDelay: '160ms', animationFillMode: 'backwards' }}>
          <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center mb-2">
            <CircleCheck className="h-4 w-4 text-success" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Pagos</p>
          <p className="text-sm sm:text-xl font-bold text-success mt-0.5">{formatCurrency(totalPaid)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{paidContractsCount} contratos quitados</p>
        </div>
        <div className="rounded-2xl p-3 sm:p-4 bg-card border border-border/20 shadow-[0_1px_8px_-4px_hsl(0_0%_0%/0.05)] animate-fade-in flex flex-col items-center text-center" style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}>
          <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center mb-2">
            <DollarSign className="h-4 w-4 text-warning" />
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Total a Receber</p>
          <p className="text-sm sm:text-xl font-bold text-warning mt-0.5">{formatCurrency(totalAReceber)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{overdueSales.length + onTrackSales.length + dueTodaySales.length} contratos</p>
        </div>
      </div>

      {renderAfterCards}

      {/* View toggle + Category filter pills */}
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-3 sm:grid-cols-5 gap-2 w-full">
          {saleCategoryFilters.map((cat) => {
            const count = cat.id === "all" ? sales.length : (counts[cat.id] || 0);
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setCategoryFilter(cat.id)}
                className={`px-2 py-1.5 rounded-xl text-[10px] sm:text-xs font-semibold border transition-all duration-200 whitespace-nowrap ${
                  isActive ? cat.activeColor : cat.color
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* View toggle */}
      <div className="w-full">
        <div className="bg-muted/50 rounded-xl p-1 flex gap-0.5 w-full">
          <button onClick={() => setView("cards")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Cards
          </button>
          <button onClick={() => setView("list")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />Lista
          </button>
          <button onClick={() => setView("folders")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
              view === "folders" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Folder className="h-3.5 w-3.5" />Pastas ({folderCount})
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:gap-4">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={incomeCategoryFilter} onValueChange={setIncomeCategoryFilter}>
          <SelectTrigger className="w-[140px] sm:w-[180px] shrink-0">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            <SelectItem value="__none__">Sem categoria</SelectItem>
            {incomeCategories.map((c) => (
              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{filtered.length} lançamento(s)</p>
          <p className="text-lg font-bold">{formatCurrency(total)}</p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum lançamento encontrado</p>
        </CardContent></Card>
      ) : view === "folders" ? (
        saleGroups.length > 0 ? (
          <div className="space-y-4">
            {saleGroups.map((g) => (
              <SaleClientFolder
                key={g.name}
                group={g}
                onDeleteSale={onDeleteSale}
                onUpdateSale={onUpdateSale}
                formatCurrency={formatCurrency}
                onEdit={setEditingSale}
                readOnly={readOnly}
                clients={clients}
                locadorInfo={locadorInfo}
                registeredVehicles={registeredVehicles}
                locadores={locadores}
                products={products || []}
              />
            ))}
          </div>
        ) : (
          <Card no3d><CardContent className="py-12 text-center">
            <Folder className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma pasta encontrada</p>
          </CardContent></Card>
        )
      ) : view === "list" ? (
       <Card no3d className="overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 border-b border-border/50 bg-muted/40">
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" aria-hidden />
            <p className="flex-1 min-w-0 lg:max-w-[200px] text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Cliente</p>
            <p className="hidden md:block w-[120px] lg:w-[200px] shrink-0 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Categoria</p>
            <p className="hidden md:block w-[140px] lg:flex-1 lg:min-w-[200px] shrink-0 text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Descrição</p>
            <p className="w-[78px] sm:w-[88px] lg:w-[110px] shrink-0 text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Vencimento</p>
            <p className="w-[102px] sm:w-[108px] lg:w-[140px] shrink-0 text-right text-[9px] sm:text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Valor</p>
            <div className="w-[44px] shrink-0" aria-hidden />
          </div>
          <div className="divide-y divide-border/30">
            {listSorted.map((sale) => (
              <SaleListRow
                key={sale.id}
                sale={sale}
                onEdit={() => setEditingSale(sale)}
                onDelete={() => onDeleteSale(sale.id)}
                onUpdate={(data) => onUpdateSale(sale.id, data)}
                formatCurrency={formatCurrency}
                readOnly={readOnly}
                incomeCategoryByName={incomeCategoryByName}
                products={products || []}
              />
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((sale, i) => (
            <div key={sale.id} className="animate-fade-in" style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'backwards' }}>
            <SaleCard
              sale={sale}
              onDelete={() => onDeleteSale(sale.id)}
              onEdit={() => setEditingSale(sale)}
              onUpdate={(data) => onUpdateSale(sale.id, data)}
              formatCurrency={formatCurrency}
              readOnly={readOnly}
              clients={clients}
              locadorInfo={locadorInfo}
              registeredVehicles={registeredVehicles}
              locadores={locadores}
              products={products || []}
            />
            </div>
          ))}
        </div>
      )}
      {editingSale && (
        <SaleEditForm
          sale={editingSale}
          onSave={(id, data) => {
            onUpdateSale(id, data);
            setEditingSale(null);
          }}
          onClose={() => setEditingSale(null)}
          clients={clients}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
        />
      )}
    </div>
  );
}

function VehicleExpenseEditDialog({ expense, open, onOpenChange, onSave, formatCurrency }: {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
  formatCurrency: (v: number) => string;
}) {
  const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
  const installmentVal = isRecorrente ? expense.amount / expense.installments! : expense.amount;
  const [form, setForm] = useState({
    description: expense.description,
    amount: String(installmentVal),
    type: expense.type as "fixa" | "recorrente",
    category: expense.category,
    installments: String(expense.installments || 1),
    dueDate: expense.dueDate,
    notes: expense.notes || "",
  });

  useEffect(() => {
    if (open) {
      const isRec = expense.type === "recorrente" && expense.installments && expense.installments > 1;
      const instVal = isRec ? expense.amount / expense.installments! : expense.amount;
      setForm({
        description: expense.description,
        amount: String(instVal),
        type: expense.type as "fixa" | "recorrente",
        category: expense.category,
        installments: String(expense.installments || 1),
        dueDate: expense.dueDate,
        notes: expense.notes || "",
      });
    }
  }, [open, expense]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(form.amount) || 0;
    const installments = form.type === "recorrente" ? parseInt(form.installments) || 1 : 1;
    const totalAmount = form.type === "recorrente" ? parsedAmount * installments : parsedAmount;
    onSave({
      description: form.description,
      amount: totalAmount,
      type: form.type,
      category: form.category,
      installments: form.type === "recorrente" ? installments : undefined,
      dueDate: form.dueDate,
      notes: form.notes || undefined,
    });
  };

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar Despesa</DialogTitle>
          <DialogDescription>Altere os dados da despesa de veículo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-desc">Descrição</Label>
            <Input id="edit-desc" value={form.description} onChange={e => update("description", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-amount">{form.type === "recorrente" ? "Valor da Parcela (R$)" : "Valor (R$)"}</Label>
              <Input id="edit-amount" type="number" step="0.01" value={form.amount} onChange={e => update("amount", e.target.value)} required />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => update("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixa">Fixa</SelectItem>
                  <SelectItem value="recorrente">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.type === "recorrente" && (
            <div>
              <Label htmlFor="edit-inst">Parcelas</Label>
              <Input id="edit-inst" type="number" min="1" value={form.installments} onChange={e => update("installments", e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={v => update("category", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {vehicleExpenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-due">Data de Pagamento</Label>
              <DatePickerField id="edit-due" value={form.dueDate} onChange={(v) => update("dueDate", v)} />
            </div>
          </div>
          <div>
            <Label htmlFor="edit-notes">Observações</Label>
            <Textarea id="edit-notes" value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} />
          </div>
          <ExpenseBoletoLinkSection expenseId={expense.id} />

          {parseFloat(form.amount) > 0 && form.type === "recorrente" && parseInt(form.installments) > 1 && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">
                Valor total: <span className="font-semibold text-foreground">
                  {formatCurrency(parseFloat(form.amount) * (parseInt(form.installments) || 1))}
                </span> ({form.installments}x de {formatCurrency(parseFloat(form.amount))})
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VehiclePayExpenseDialog({ expense, open, onOpenChange, onConfirm, formatCurrency }: {
  expense: Expense;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payDate: string, paidAmount: number) => void;
  formatCurrency: (v: number) => string;
}) {
  const isRecorrente = expense.type === "recorrente" && expense.installments && expense.installments > 1;
  const defaultAmount = isRecorrente ? expense.amount / expense.installments! : expense.amount;
  const [payDate, setPayDate] = useState(todayInAppTz());
  const [amountStr, setAmountStr] = useState(String(defaultAmount.toFixed(2)));

  useEffect(() => {
    if (open) {
      setPayDate(todayInAppTz());
      setAmountStr(String(defaultAmount.toFixed(2)));
    }
  }, [open, defaultAmount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) return;
    onConfirm(payDate, parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Pagamento</DialogTitle>
          <DialogDescription>
            Informe a data e o valor efetivamente pago{isRecorrente ? " desta parcela" : ""}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pay-date">Data do pagamento</Label>
            <DatePickerField id="pay-date" value={payDate} onChange={setPayDate} />
          </div>
          <div>
            <Label htmlFor="pay-amount">Valor pago (R$)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Valor original: {formatCurrency(defaultAmount)}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirmar pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductSalesView(props: Props) {
  const { sales, products, onDeleteSale, onUpdateSale, clients = [], expenses = [], onAddExpense, onPayExpense, onDeleteExpense, onUpdateExpense, readOnly = false, isVehicleView = false, locadores: locadoresProp, onSaveLocador: onSaveLocadorProp } = props;
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);

  // Locador & Vehicle Registry hooks - use props from parent to share state
  const locadorHook = useLocadorInfo();
  const locadores = locadoresProp ?? locadorHook.locadores;
  const saveLocador = onSaveLocadorProp ?? locadorHook.save;
  const locador = locadores[0] || { nome: "", rg: "", cpf: "", nacionalidade: "Brasileiro(a)", profissao: "", endereco: "", bairro: "", cidade: "", estado: "" };
  const { vehicles: registeredVehicles, add: addVehicle, update: updateVehicle, remove: removeVehicle } = useVehicleRegistry();

  // Balance state
  const [balance, setBalanceState] = useState<number>(0);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [showDeleteAllExpenses, setShowDeleteAllExpenses] = useState(false);
  const [viewPaymentsExpenseId, setViewPaymentsExpenseId] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
      const ownerId = (ownerData as any)?.owner_id || user.id;
      const { data } = await supabase.from("vehicle_balance").select("amount").eq("user_id", ownerId).maybeSingle();
      setBalanceState(data?.amount ?? 0);
    })();
  }, []);

  const handleSaveBalance = async () => {
    const val = parseFloat(balanceInput);
    if (isNaN(val)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
    const ownerId = (ownerData as any)?.owner_id || user.id;
    const { data: existing } = await supabase.from("vehicle_balance").select("id").eq("user_id", ownerId).maybeSingle();
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: val, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: ownerId, amount: val });
    }
    setBalanceState(val);
    setEditingBalance(false);
  };

  // Month filter for expenses
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // All vehicle-related expenses (used for "Limpar Pagamentos" actions)
  const allVehicleExpenses = expenses.filter(isVehicleExpenseForVehicles);

  // Monthly vehicle expenses - consider installment due dates
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(selYear, selMonthNum - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");

  // Filter expenses that have at least one due date inside the selected month
  // (considers recurring installments). Sum monthly total in the same pass.
  let monthlyTotal = 0;
  const vehicleExpenses = allVehicleExpenses.filter(exp => {
    const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    if (isRecorrente) {
      const baseDate = new Date(exp.dueDate + "T00:00:00");
      const installmentAmount = exp.amount / exp.installments!;
      let hit = false;
      for (let i = 0; i < exp.installments!; i++) {
        const instDateStr = format(addMonths(baseDate, i), "yyyy-MM-dd");
        if (instDateStr >= monthStartStr && instDateStr <= monthEndStr) {
          monthlyTotal += installmentAmount;
          hit = true;
        }
      }
      return hit;
    }
    if (exp.dueDate >= monthStartStr && exp.dueDate <= monthEndStr) {
      monthlyTotal += exp.amount;
      return true;
    }
    return false;
  });

  // Generate month options (last 12 months + current)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = -1; i < 12; i++) {
    const d = addMonths(now, -i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMMM yyyy", { locale: ptBR });
    monthOptions.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }

  const secondaryCards = (
    <div className="space-y-3">
      {/* Month filter - full width */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
          const [y, m] = selectedMonth.split("-").map(Number);
          const prev = new Date(y, m - 2, 1);
          setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
        }}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          className="text-sm font-medium text-foreground min-w-[140px] text-center capitalize hover:text-primary transition-colors"
          onClick={() => {
            const n = new Date();
            setSelectedMonth(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
          }}
        >
          {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
          const [y, m] = selectedMonth.split("-").map(Number);
          const next = new Date(y, m, 1);
          setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
        }}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {!readOnly && (
      <div className="grid grid-cols-2 gap-3 items-stretch">
        {/* Saldo em Conta */}
        <div className="rounded-xl border p-4 bg-card flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="text-xs font-medium text-muted-foreground">Saldo em Conta</p>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          {editingBalance ? (
            <div className="flex items-center justify-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="h-8 text-sm w-28"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveBalance(); if (e.key === "Escape") setEditingBalance(false); }}
              />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleSaveBalance}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingBalance(false)}>
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p
              className={`text-xl font-bold cursor-pointer hover:opacity-70 transition-opacity ${balance < 0 ? "text-destructive" : ""}`}
              onClick={() => { setBalanceInput(String(balance)); setEditingBalance(true); }}
              title="Clique para editar"
            >
              {formatCurrency(balance)}
            </p>
          )}
        </div>

        {/* Despesas Mensais */}
        <div className="rounded-xl border p-4 bg-card flex flex-col items-center justify-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <p className="text-xs font-medium text-muted-foreground">Despesas Mensais</p>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xl font-bold text-destructive">{formatCurrency(monthlyTotal)}</p>
        </div>
      </div>
      )}
    </div>
  );

  // Check if this is the vehicles-only view
  const hasSalesOrStreaming = !isVehicleView;
  
  const updateVehicleBalance = useCallback(async (delta: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: ownerData } = await supabase.from("user_owner" as any).select("owner_id").eq("user_id", user.id).maybeSingle();
    const ownerId = (ownerData as any)?.owner_id || user.id;
    const { data: existing } = await supabase.from("vehicle_balance").select("amount").eq("user_id", ownerId).maybeSingle();
    const currentBalance = existing?.amount ?? 0;
    const newBalance = currentBalance + delta;
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: newBalance, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: ownerId, amount: newBalance });
    }
    setBalanceState(newBalance);
  }, []);

  // Wrap onUpdateSale to update vehicle balance when installments are paid or deleted
  const handleVehicleUpdateSale = useCallback((id: string, data: Partial<Omit<Sale, "id">>) => {
    const sale = sales.find(s => s.id === id);
    if (!sale) { onUpdateSale(id, data); return; }

    if (data.paidInstallments !== undefined) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - (sale.downPayment || 0)) / sale.installments : sale.total;

      if (data.paidInstallments > sale.paidInstallments) {
        // Payment: add installment value to balance
        const paidIdx = sale.paidInstallments;
        const paidValue = amounts && amounts[paidIdx] != null ? amounts[paidIdx] : defaultVal;
        const actualPaid = Math.max(0, paidValue - (data.partialPaid !== undefined ? 0 : (sale.partialPaid || 0)));
        updateVehicleBalance(actualPaid);
      } else if (data.paidInstallments < sale.paidInstallments) {
        // Undo payment: subtract deleted installments from balance
        let refundTotal = 0;
        for (let i = data.paidInstallments; i < sale.paidInstallments; i++) {
          refundTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
        }
        updateVehicleBalance(-refundTotal);
      }
    }

    // Handle partial payments
    if (data.partialPaid !== undefined && data.paidInstallments === undefined) {
      const addedPartial = (data.partialPaid || 0) - (sale.partialPaid || 0);
      if (addedPartial !== 0) {
        updateVehicleBalance(addedPartial);
      }
    }

    onUpdateSale(id, data);
  }, [sales, onUpdateSale, updateVehicleBalance]);

  // Wrap onPayExpense to debit vehicle balance using the actual paid amount.
  // Para despesas parceladas, ajusta o total da despesa (exp.amount) para refletir o
  // valor efetivamente pago nesta parcela, mantendo as parcelas restantes no valor
  // original. O valor original da parcela é guardado em notes como [OrigParcela: X].
  const handleVehiclePayExpense = useCallback((id: string, payDate: string, paidAmount: number) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp || exp.paid) { onPayExpense?.(id, true, payDate, paidAmount); return; }
    updateVehicleBalance(-paidAmount);

    const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    if (isRecorrente && onUpdateExpense) {
      const origMatch = (exp.notes ?? "").match(/\[OrigParcela:\s*([\d.]+)\]/i);
      const originalInstallment = origMatch ? parseFloat(origMatch[1]) : exp.amount / exp.installments!;
      const diff = paidAmount - originalInstallment;
      const updates: Partial<Omit<Expense, "id" | "createdAt">> = {};
      if (Math.abs(diff) > 0.005) {
        updates.amount = Math.round((exp.amount + diff) * 100) / 100;
      }
      if (!origMatch) {
        const baseNotes = (exp.notes ?? "").trimEnd();
        updates.notes = baseNotes ? `${baseNotes}\n[OrigParcela: ${originalInstallment.toFixed(2)}]` : `[OrigParcela: ${originalInstallment.toFixed(2)}]`;
      }
      if (Object.keys(updates).length > 0) onUpdateExpense(id, updates);
    }

    onPayExpense?.(id, true, payDate, paidAmount);
  }, [expenses, onPayExpense, onUpdateExpense, updateVehicleBalance]);

  // Wrap onDeleteExpense to restore vehicle balance for any amount that was already paid
  const handleVehicleDeleteExpense = useCallback((id: string) => {
    const exp = expenses.find(e => e.id === id);
    if (exp) {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      let refund = 0;
      if (isRecorrente) {
        const installmentAmount = exp.amount / exp.installments!;
        refund = installmentAmount * (exp.paidInstallments || 0);
      } else if (exp.paid) {
        refund = exp.amount;
      }
      if (refund > 0) updateVehicleBalance(refund);
    }
    onDeleteExpense?.(id, true);
  }, [expenses, onDeleteExpense, updateVehicleBalance]);

  // Wrap onUpdateExpense to restore vehicle balance when payments are removed
  const handleVehicleUpdateExpense = useCallback((id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    const exp = expenses.find(e => e.id === id);
    if (exp) {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      const installmentAmount = isRecorrente ? exp.amount / exp.installments! : exp.amount;

      if (data.paidInstallments !== undefined && isRecorrente) {
        const diff = (exp.paidInstallments || 0) - data.paidInstallments;
        if (diff > 0) {
          // Payments removed — restore balance and roll back due date
          updateVehicleBalance(installmentAmount * diff);
          const currentDue = new Date(exp.dueDate + "T00:00:00");
          currentDue.setMonth(currentDue.getMonth() - diff);
          data = { ...data, dueDate: currentDue.toISOString().split("T")[0] };
        }
      } else if (data.paid === false && exp.paid) {
        // Single expense payment removed — restore balance
        updateVehicleBalance(exp.amount);
      }
    }
    onUpdateExpense?.(id, data);
  }, [expenses, onUpdateExpense, updateVehicleBalance]);

  // Wrap onDeleteSale for vehicle sales to reverse paid amounts from vehicle balance
  const handleVehicleDeleteSale = useCallback((id: string) => {
    const sale = sales.find(s => s.id === id);
    if (sale && sale.paidInstallments > 0) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - ((sale as any).downPayment || 0)) / sale.installments : sale.total;
      let paidTotal = 0;
      for (let i = 0; i < sale.paidInstallments; i++) {
        paidTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
      }
      paidTotal += sale.partialPaid || 0;
      if (paidTotal > 0) updateVehicleBalance(-paidTotal);
    }
    onDeleteSale(id);
  }, [sales, onDeleteSale, updateVehicleBalance]);

  if (!hasSalesOrStreaming) {
    // Vehicles page - render without sub-tabs + vehicle expenses
    return (
      <div className="space-y-6">
        <SalesList
          sales={sales}
          onDeleteSale={handleVehicleDeleteSale}
          onUpdateSale={handleVehicleUpdateSale}
          clients={clients}
          hideOnTrackCard
          renderAfterCards={secondaryCards}
          readOnly={readOnly}
          locadorInfo={locador}
          registeredVehicles={registeredVehicles}
          locadores={locadores}
          products={products || []}
        />

        {/* Vehicle Expenses Section */}
        {!readOnly && onAddExpense && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Despesas de Veículos ({vehicleExpenses.length})
              </h3>
            </div>

            {/* Dialog de confirmação para limpar pagamentos */}
            <Dialog open={showDeleteAllExpenses} onOpenChange={setShowDeleteAllExpenses}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Limpar Pagamentos</DialogTitle>
                  <DialogDescription>
                    Tem certeza que deseja limpar todos os dados de pagamento das despesas de veículos? As despesas serão mantidas, mas marcadas como não pagas.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteAllExpenses(false)}>Cancelar</Button>
                  <Button variant="destructive" onClick={() => {
                    allVehicleExpenses.forEach(exp => {
                      if (exp.paid || (exp.paidInstallments && exp.paidInstallments > 0)) {
                        handleVehicleUpdateExpense(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                      }
                    });
                    setShowDeleteAllExpenses(false);
                  }}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Limpar Pagamentos
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {vehicleExpenses.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma despesa de veículo registrada.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {vehicleExpenses.map((exp, idx) => {
                  const isOverdue = !exp.paid && exp.dueDate < todayInAppTz();
                  const hasPaidSomething = exp.paid || (exp.paidInstallments && exp.paidInstallments > 0);
                  const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
                  const origMatch = (exp.notes ?? "").match(/\[OrigParcela:\s*([\d.]+)\]/i);
                  const originalInstallment = origMatch ? parseFloat(origMatch[1]) : (isRecorrente ? exp.amount / exp.installments! : exp.amount);
                  const installmentAmount = isRecorrente ? originalInstallment : exp.amount;

                  return (
                    <Card key={exp.id} className={`${exp.paid ? "opacity-60" : ""} hover:shadow-[0_4px_16px_-6px_hsl(0_0%_0%/0.08)] hover:-translate-y-[1px] transition-all duration-400 ease-out animate-fade-in`} style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'backwards' }}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm truncate">{exp.description}</p>
                              {(() => {
                                const badge = getDueStatusBadge(exp.dueDate, exp.paid, { paid: "Pago", overdue: "Vencido" });
                                return (
                                  <Badge variant={badge.variant} className={`${badge.className} text-[10px] shrink-0`}>
                                    {badge.label}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-muted-foreground">
                              <span>{exp.category}</span>
                              <span>Venc: {new Date(exp.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                              {isRecorrente && (
                                <span>{exp.paidInstallments || 0}/{exp.installments} parcelas</span>
                              )}
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2 pt-2 border-t border-border/40">
                              {isRecorrente ? (
                                <div className="flex flex-col">
                                  <p className="font-bold text-sm leading-tight">
                                    {formatCurrency(installmentAmount)}
                                    <span className="ml-1 text-xs font-normal text-muted-foreground">/parcela</span>
                                  </p>
                                  <p className="text-[11px] text-muted-foreground leading-tight">
                                    Total: {formatCurrency(exp.amount)} ({exp.installments}x)
                                  </p>
                                </div>
                              ) : (
                                <p className="font-bold text-sm">{formatCurrency(exp.amount)}</p>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap justify-end w-full sm:w-auto">
                                {hasPaidSomething && onUpdateExpense && (
                                  <Button size="sm" variant="outline" onClick={() => setViewPaymentsExpenseId(exp.id)} className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0">
                                    <Receipt className="h-3.5 w-3.5 sm:mr-1" />
                                    <span className="hidden xs:inline">Pagamentos</span>
                                  </Button>
                                )}
                                {!readOnly && !exp.paid && onPayExpense && (
                                  <Button size="sm" variant="outline" onClick={() => setPayingExpenseId(exp.id)} className="h-8 px-2.5 text-xs flex-1 sm:flex-none min-w-0 text-success border-success/30 hover:bg-success hover:text-success-foreground">
                                    <CheckCircle className="h-3.5 w-3.5 sm:mr-1" />
                                    <span className="hidden xs:inline">Pagar</span>
                                  </Button>
                                )}
                                {!readOnly && onUpdateExpense && (
                                  <Button size="sm" variant="ghost" onClick={() => setEditingExpenseId(exp.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground shrink-0">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {!readOnly && (
                                  <ExpenseBoletoLinkButton expenseId={exp.id} />
                                )}
                                {!readOnly && onDeleteExpense && (
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteExpenseId(exp.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive shrink-0">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>

                      {/* Dialog de pagamentos individuais */}
                      <Dialog open={viewPaymentsExpenseId === exp.id} onOpenChange={(open) => { if (!open) setViewPaymentsExpenseId(null); }}>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Pagamentos - {exp.description}</DialogTitle>
                            <DialogDescription>Gerencie os pagamentos desta despesa.</DialogDescription>
                          </DialogHeader>
                          <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
                            {isRecorrente ? (
                              Array.from({ length: exp.paidInstallments || 0 }, (_, i) => (
                                <div key={i} className="flex items-center gap-3 py-3">
                                  <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                                    {i + 1}ª
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{formatCurrency(installmentAmount)}</p>
                                    <p className="text-xs text-muted-foreground">Parcela {i + 1} de {exp.installments}</p>
                                  </div>
                                  <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                                  {!readOnly && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                    onClick={() => {
                                      const newPaid = i;
                                      const fullyPaid = false;
                                      handleVehicleUpdateExpense(exp.id, { paidInstallments: newPaid, paid: fullyPaid, paidDate: undefined });
                                      if (newPaid === 0) setViewPaymentsExpenseId(null);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  )}
                                </div>
                              ))
                            ) : (
                              exp.paid && (
                                <div className="flex items-center gap-3 py-3">
                                  <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                                    <Check className="h-4 w-4" />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{formatCurrency(exp.amount)}</p>
                                    {exp.paidDate && <p className="text-xs text-muted-foreground">{new Date(exp.paidDate + "T00:00:00").toLocaleDateString("pt-BR")}</p>}
                                  </div>
                                  <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                                  {!readOnly && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                    onClick={() => {
                                      handleVehicleUpdateExpense(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
                                      setViewPaymentsExpenseId(null);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  )}
                                </div>
                              )
                            )}
                            {(!isRecorrente && !exp.paid && !(exp.paidInstallments && exp.paidInstallments > 0)) && (
                              <div className="py-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Dialog de edição */}
                      <VehicleExpenseEditDialog
                        expense={exp}
                        open={editingExpenseId === exp.id}
                        onOpenChange={(open) => { if (!open) setEditingExpenseId(null); }}
                        onSave={(data) => {
                          onUpdateExpense!(exp.id, data);
                          setEditingExpenseId(null);
                        }}
                        formatCurrency={formatCurrency}
                      />

                      {/* Dialog de pagamento (data + valor pago) */}
                      <VehiclePayExpenseDialog
                        expense={exp}
                        open={payingExpenseId === exp.id}
                        onOpenChange={(open) => { if (!open) setPayingExpenseId(null); }}
                        onConfirm={(payDate, paidAmount) => {
                          handleVehiclePayExpense(exp.id, payDate, paidAmount);
                          setPayingExpenseId(null);
                        }}
                        formatCurrency={formatCurrency}
                      />
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <ConfirmDeleteDialog
          open={!!deleteExpenseId}
          onOpenChange={() => setDeleteExpenseId(null)}
          onConfirm={() => {
            if (deleteExpenseId) {
              handleVehicleDeleteExpense(deleteExpenseId);
              setDeleteExpenseId(null);
            }
          }}
          title="Excluir despesa"
          description="Tem certeza que deseja excluir esta despesa? Se ela já estava paga, o valor será devolvido ao saldo da conta."
        />
      </div>
    );
  }

  // Sales page - show sub-tabs for venda/streaming + extrato
  const activeTabs = salesSubTabs;
  const allTabValues = [...activeTabs.map((t) => t.type as string), "extrato"];
  const [currentSubTab, setCurrentSubTab] = useState<string>(allTabValues[0] || "venda");
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("products-subtab-change", { detail: currentSubTab }));
  }, [currentSubTab]);

  return (
    <>
    <Tabs value={currentSubTab} onValueChange={setCurrentSubTab} className="space-y-4">
      <TabsList className="w-full bg-muted/50 rounded-xl p-1 grid grid-cols-2 gap-1 sm:flex sm:gap-0.5 h-auto">
        {activeTabs.map((tab) => (
          <TabsTrigger
            key={tab.type}
            value={tab.type}
            className="sm:flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <tab.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </TabsTrigger>
        ))}
        <TabsTrigger
          value="extrato"
          className="sm:flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Extrato</span>
        </TabsTrigger>
        {!isVehicleView && (
          <TabsTrigger
            value="estoque"
            className="sm:flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            <Boxes className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Estoque</span>
          </TabsTrigger>
        )}
      </TabsList>

      {activeTabs.map((tab) => (
        <TabsContent key={tab.type} value={tab.type}>
          <SalesList
            sales={sales.filter((s) => s.businessType === tab.type)}
            onDeleteSale={onDeleteSale}
            onUpdateSale={onUpdateSale}
            clients={clients}
            readOnly={readOnly}
            products={products || []}
          />
        </TabsContent>
      ))}

      <TabsContent value="extrato">
        <SalesLedger sales={sales.filter((s) => s.businessType !== "aluguel_veiculo")} />
      </TabsContent>

      {!isVehicleView && (
        <TabsContent value="estoque">
          <StockManager readOnly={readOnly} />
        </TabsContent>
      )}
    </Tabs>
    <ConfirmDeleteDialog
      open={!!deleteExpenseId}
      onOpenChange={() => setDeleteExpenseId(null)}
      onConfirm={() => { if (deleteExpenseId && onDeleteExpense) { onDeleteExpense(deleteExpenseId, true); setDeleteExpenseId(null); } }}
      title="Excluir despesa"
      description="Tem certeza que deseja excluir esta despesa?"
    />
    </>
  );
}
