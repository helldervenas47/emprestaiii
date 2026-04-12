import { useState, useCallback, useEffect } from "react";
import { Sale, BusinessType, Client, Expense } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Search, ShoppingCart, Tv, Car, Calendar as CalendarIcon, User, Pencil, ChevronDown, ChevronUp, CheckCircle, HandCoins, Check, X as XIcon, DollarSign, AlertTriangle, Clock, CircleCheck, Receipt, Plus, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, addWeeks, addDays, format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function addByFrequency(date: Date, frequency: string, n: number): Date {
  if (frequency === "Semanal") return addWeeks(date, n);
  if (frequency === "Quinzenal") return addDays(date, n * 15);
  return addMonths(date, n);
}
import { useHideValues } from "@/contexts/HideValuesContext";
import { SaleEditForm } from "@/components/SaleEditForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

import { VehicleExpenseForm, vehicleExpenseCategories } from "@/components/VehicleExpenseForm";

interface Props {
  sales: Sale[];
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
  clients?: Client[];
  expenses?: Expense[];
  onAddExpense?: (expense: Omit<Expense, "id" | "paid" | "paidDate" | "createdAt">) => void;
  onPayExpense?: (id: string) => void;
  onDeleteExpense?: (id: string) => void;
  onUpdateExpense?: (id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => void;
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

function SaleCard({ sale, onDelete, onEdit, onUpdate, formatCurrency }: { sale: Sale; onDelete: () => void; onEdit: () => void; onUpdate: (data: Partial<Omit<Sale, "id">>) => void; formatCurrency: (v: number) => string }) {
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [partialDate, setPartialDate] = useState<Date | undefined>(undefined);
  const [showParcelas, setShowParcelas] = useState(false);
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
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
    <Card className={`overflow-hidden hover:shadow-lg transition-all border ${catStyle.border} ${catStyle.bg} h-full flex flex-col`}>
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
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
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
        <div className="grid grid-cols-2 gap-3 border border-border/50 rounded-lg p-3">
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
                    <span className={`text-xs font-medium w-16 text-right ${p.paid ? "text-success" : "text-muted-foreground"}`}>
                      {p.paid ? "Paga" : (
                        !p.paid && p.number === sale.paidInstallments + 1 && (sale.partialPaid || 0) > 0
                          ? `${formatCurrency(sale.partialPaid)} pago`
                          : "Pendente"
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Payments dialog (triggered from footer) */}
        <Dialog open={showPayments} onOpenChange={setShowPayments}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Pagamentos Realizados</DialogTitle>
              <DialogDescription>Gerencie os pagamentos desta venda.</DialogDescription>
            </DialogHeader>
            <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
              {Array.from({ length: sale.paidInstallments }, (_, i) => {
                const instBaseDate = new Date(sale.date + "T00:00:00");
                const customDate = sale.installmentDates && sale.installmentDates[i];
                const dueDate = customDate ? new Date(customDate + "T00:00:00") : (isRecorrente ? addByFrequency(instBaseDate, sale.frequency || "Mensal", i) : instBaseDate);
                return (
                  <div key={i} className="flex items-center gap-3 py-3">
                    <span className="w-7 h-7 rounded-full bg-success/20 text-success flex items-center justify-center text-xs font-bold shrink-0">
                      {i + 1}ª
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{formatCurrency(getParcelaValue(i))}</p>
                      <p className="text-xs text-muted-foreground">{format(dueDate, "dd/MM/yyyy")}</p>
                    </div>
                    <Badge className="bg-success/20 text-success border-success/30 text-xs">Paga</Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => {
                        onUpdate({ paidInstallments: i, partialPaid: 0 });
                        if (i === 0) setShowPayments(false);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              {(sale.partialPaid || 0) > 0 && (
                <div className="flex items-center gap-3 py-3">
                  <span className="w-7 h-7 rounded-full bg-warning/20 text-warning flex items-center justify-center text-xs font-bold shrink-0">
                    {sale.paidInstallments + 1}ª
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{formatCurrency(sale.partialPaid)}</p>
                    <p className="text-xs text-muted-foreground">Pagamento parcial</p>
                  </div>
                  <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">Parcial</Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={() => {
                      onUpdate({ partialPaid: 0 });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Row 5: Payment buttons - fixed position via mt-auto */}
        <div className="mt-auto space-y-2">
          {!isPaid && (
            <>
              {/* Partial payment dialog */}
              <Dialog open={showPartial} onOpenChange={(open) => {
                setShowPartial(open);
                if (!open) { setPartialAmount(""); setPartialDate(undefined); }
              }}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Pagamento Parcial</DialogTitle>
                    <DialogDescription>
                      Informe o valor e a data do pagamento. O valor será abatido da {sale.paidInstallments + 1}ª parcela pendente ({formatCurrency(getParcelaValue(sale.paidInstallments))}).
                      {(sale.partialPaid || 0) > 0 && ` Já pago parcialmente: ${formatCurrency(sale.partialPaid)}. Falta: ${formatCurrency(getParcelaValue(sale.paidInstallments) - (sale.partialPaid || 0))}.`}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Valor do Pagamento (R$)</label>
                      <Input
                        type="number" step="0.01" placeholder="0,00"
                        value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Data do Pagamento</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !partialDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {partialDate ? format(partialDate, "dd/MM/yyyy") : "Selecione a data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={partialDate}
                            onSelect={setPartialDate}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => { setShowPartial(false); setPartialAmount(""); setPartialDate(undefined); }}>Cancelar</Button>
                    <Button onClick={() => {
                      const val = parseFloat(partialAmount);
                      if (val > 0 && partialDate) {
                        const nextIdx = sale.paidInstallments;
                        const currentValue = getParcelaValue(nextIdx);
                        const currentPartial = sale.partialPaid || 0;
                        const newPartialTotal = currentPartial + val;
                        if (newPartialTotal >= currentValue - 0.01) {
                          // Partial payments cover the full installment - mark as paid, carry remainder
                          const remainder = newPartialTotal - currentValue;
                          onUpdate({
                            paidInstallments: Math.min(sale.installments, sale.paidInstallments + 1),
                            partialPaid: remainder > 0.01 ? remainder : 0,
                          });
                        } else {
                          onUpdate({ partialPaid: newPartialTotal });
                        }
                        setPartialAmount(""); setPartialDate(undefined); setShowPartial(false);
                      }
                    }} disabled={!partialAmount || parseFloat(partialAmount) <= 0 || !partialDate}>
                      Confirmar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="flex gap-2">
                <Popover open={showPayDatePicker} onOpenChange={setShowPayDatePicker}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="flex-1 h-9 text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Pagar Parcela
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="p-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground">Selecione a data do pagamento</p>
                    </div>
                    <Calendar
                      mode="single"
                      selected={undefined}
                      onSelect={(date) => {
                        if (date) {
                          onUpdate({
                            paidInstallments: Math.min(sale.installments, sale.paidInstallments + 1),
                          });
                          setShowPayDatePicker(false);
                        }
                      }}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  className="flex-1 h-9 text-xs border-warning/30 text-warning hover:bg-warning hover:text-warning-foreground"
                  onClick={() => setShowPartial(true)}
                >
                  <HandCoins className="h-3.5 w-3.5 mr-1" /> Pagar Parcial
                </Button>
              </div>
            </>
          )}

          {/* Notes */}
          {sale.notes && (
            <div className="bg-muted/20 border border-border/30 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground italic truncate">{sale.notes}</p>
            </div>
          )}

          {/* Footer: date + actions - always at bottom */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarIcon className="h-3 w-3" />
              {new Date(sale.date + "T00:00:00").toLocaleDateString("pt-BR")}
            </p>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8 text-success hover:bg-success/10" onClick={() => setShowPayments(true)} title="Ver Pagamentos">
                <CircleCheck className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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

function SalesList({ sales, onDeleteSale, onUpdateSale, clients = [], hideOnTrackCard = false, renderAfterCards }: { sales: Sale[]; onDeleteSale: (id: string) => void; onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void; clients?: Client[]; hideOnTrackCard?: boolean; renderAfterCards?: React.ReactNode }) {
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<SaleCategory>("all");
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);

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
      s.productName.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (categoryFilter === "all") return true;
    return getSaleCategory(s) === categoryFilter;
  }).sort((a, b) => {
    const catA = getSaleCategory(a);
    const catB = getSaleCategory(b);
    const isPaidA = catA === "paid";
    const isPaidB = catB === "paid";
    // Pagos vão pro final
    if (isPaidA && !isPaidB) return 1;
    if (!isPaidA && isPaidB) return -1;
    // Entre não-pagos, ordena por data de vencimento (mais próximo primeiro)
    return getNextDueDate(a).getTime() - getNextDueDate(b).getTime();
  });

  const total = filtered.reduce((acc, s) => acc + s.total, 0);

  // Calculate receivables per category
  const getSalePaidAmount = (s: Sale) => {
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

  const totalOverdue = overdueSales.reduce((acc, s) => acc + getOverdueInstallmentsValue(s), 0);
  const totalOnTrack = onTrackSales.reduce((acc, s) => acc + getRemaining(s), 0);
  const totalDueToday = dueTodaySales.reduce((acc, s) => acc + getRemaining(s), 0);
  const totalPaid = sales.reduce((acc, s) => acc + getSalePaidAmount(s), 0);
  // Quantidade de contratos = somente os quitados
  const paidContractsCount = paidSales.length;
  const totalAReceber = overdueSales.reduce((acc, s) => acc + getRemaining(s), 0) + totalOnTrack + totalDueToday;

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <div className={`grid ${hideOnTrackCard ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'} gap-3`}>
        <div className="rounded-xl p-4 bg-gradient-to-br from-destructive/80 to-destructive text-destructive-foreground">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium opacity-90">Vencidos</p>
            <AlertTriangle className="h-4 w-4 opacity-70" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalOverdue)}</p>
          <p className="text-xs opacity-75 mt-1">{overdueSales.length} contratos</p>
        </div>
        {!hideOnTrackCard && (
          <div className="rounded-xl p-4 bg-gradient-to-br from-primary/80 to-primary text-primary-foreground">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium opacity-90">No Prazo</p>
              <Clock className="h-4 w-4 opacity-70" />
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalOnTrack + totalDueToday)}</p>
            <p className="text-xs opacity-75 mt-1">{onTrackSales.length + dueTodaySales.length} contratos</p>
          </div>
        )}
        <div className="rounded-xl p-4 bg-gradient-to-br from-success/80 to-success text-success-foreground">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium opacity-90">Pagos</p>
            <CircleCheck className="h-4 w-4 opacity-70" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalPaid)}</p>
          <p className="text-xs opacity-75 mt-1">{paidContractsCount} contratos quitados</p>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-warning/80 to-warning text-warning-foreground">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium opacity-90">Total a Receber</p>
            <DollarSign className="h-4 w-4 opacity-70" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalAReceber)}</p>
          <p className="text-xs opacity-75 mt-1">{overdueSales.length + onTrackSales.length + dueTodaySales.length} contratos</p>
        </div>
      </div>

      {renderAfterCards}

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        {saleCategoryFilters.map((cat) => {
          const count = cat.id === "all" ? sales.length : (counts[cat.id] || 0);
          const isActive = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive ? cat.activeColor : cat.color
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((sale) => (
            <SaleCard
              key={sale.id}
              sale={sale}
              onDelete={() => onDeleteSale(sale.id)}
              onEdit={() => setEditingSale(sale)}
              onUpdate={(data) => onUpdateSale(sale.id, data)}
              formatCurrency={formatCurrency}
            />
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
        />
      )}
    </div>
  );
}

export function ProductSalesView({ sales, onDeleteSale, onUpdateSale, clients = [], expenses = [], onAddExpense, onPayExpense, onDeleteExpense, onUpdateExpense }: Props) {
  const [showVehicleExpenseForm, setShowVehicleExpenseForm] = useState(false);
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);

  // Balance state
  const [balance, setBalanceState] = useState<number>(0);
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");
  const [showDeleteAllExpenses, setShowDeleteAllExpenses] = useState(false);
  const [viewPaymentsExpenseId, setViewPaymentsExpenseId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("vehicle_balance").select("amount").eq("user_id", user.id).maybeSingle();
      setBalanceState(data?.amount ?? 0);
    })();
  }, []);

  const handleSaveBalance = async () => {
    const val = parseFloat(balanceInput);
    if (isNaN(val)) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: existing } = await supabase.from("vehicle_balance").select("id").eq("user_id", user.id).maybeSingle();
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: val, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: user.id, amount: val });
    }
    setBalanceState(val);
    setEditingBalance(false);
  };

  // Month filter for expenses
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  // Filter vehicle-related expenses
  const vehicleExpenses = expenses.filter(e => vehicleExpenseCategories.includes(e.category));

  // Monthly vehicle expenses
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(selYear, selMonthNum - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");
  const monthlyVehicleExpenses = vehicleExpenses.filter(e => e.dueDate >= monthStartStr && e.dueDate <= monthEndStr);
  const monthlyTotal = monthlyVehicleExpenses.reduce((acc, e) => acc + e.amount, 0);

  // Generate month options (last 12 months + current)
  const monthOptions: { value: string; label: string }[] = [];
  for (let i = -1; i < 12; i++) {
    const d = addMonths(now, -i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = format(d, "MMMM yyyy", { locale: ptBR });
    monthOptions.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }

  const secondaryCards = (
    <div className="grid grid-cols-2 gap-3">
      {/* Saldo em Conta */}
      <div className="rounded-xl border p-4 bg-card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">Saldo em Conta</p>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </div>
        {editingBalance ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.01"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              className="h-8 text-sm"
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
            className="text-xl font-bold cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => { setBalanceInput(String(balance)); setEditingBalance(true); }}
            title="Clique para editar"
          >
            {formatCurrency(balance)}
          </p>
        )}
      </div>

      {/* Despesas Mensais */}
      <div className="rounded-xl border p-4 bg-card">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
            const [y, m] = selectedMonth.split("-").map(Number);
            const prev = new Date(y, m - 2, 1);
            setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`);
          }}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-xs font-medium text-muted-foreground capitalize">
            {format(new Date(selYear, selMonthNum - 1, 1), "MMMM yyyy", { locale: ptBR })}
          </p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
            const [y, m] = selectedMonth.split("-").map(Number);
            const next = new Date(y, m, 1);
            setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
          }}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-muted-foreground">Despesas Mensais</p>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-xl font-bold text-destructive">{formatCurrency(monthlyTotal)}</p>
      </div>
    </div>
  );

  // Check if this is the vehicles-only view
  const hasSalesOrStreaming = sales.some(s => s.businessType === "venda" || s.businessType === "streaming");
  
  const updateVehicleBalance = useCallback(async (delta: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: existing } = await supabase.from("vehicle_balance").select("amount").eq("user_id", user.id).maybeSingle();
    const currentBalance = existing?.amount ?? 0;
    const newBalance = currentBalance + delta;
    if (existing) {
      await supabase.from("vehicle_balance").update({ amount: newBalance, updated_at: new Date().toISOString() }).eq("user_id", user.id);
    } else {
      await supabase.from("vehicle_balance").insert({ user_id: user.id, amount: newBalance });
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

  // Wrap onPayExpense to debit vehicle balance
  const handleVehiclePayExpense = useCallback((id: string) => {
    const exp = expenses.find(e => e.id === id);
    if (!exp || exp.paid) { onPayExpense?.(id); return; }
    const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
    const debitAmount = isRecorrente ? exp.amount / exp.installments! : exp.amount;
    updateVehicleBalance(-debitAmount);
    onPayExpense?.(id);
  }, [expenses, onPayExpense, updateVehicleBalance]);

  // Wrap onUpdateExpense to restore vehicle balance when payments are removed
  const handleVehicleUpdateExpense = useCallback((id: string, data: Partial<Omit<Expense, "id" | "createdAt">>) => {
    const exp = expenses.find(e => e.id === id);
    if (exp) {
      const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
      const installmentAmount = isRecorrente ? exp.amount / exp.installments! : exp.amount;

      if (data.paidInstallments !== undefined && isRecorrente) {
        const diff = (exp.paidInstallments || 0) - data.paidInstallments;
        if (diff > 0) {
          // Payments removed — restore balance
          updateVehicleBalance(installmentAmount * diff);
        }
      } else if (data.paid === false && exp.paid) {
        // Single expense payment removed — restore balance
        updateVehicleBalance(exp.amount);
      }
    }
    onUpdateExpense?.(id, data);
  }, [expenses, onUpdateExpense, updateVehicleBalance]);

  if (!hasSalesOrStreaming) {
    // Vehicles page - render without sub-tabs + vehicle expenses
    return (
      <div className="space-y-6">
        <SalesList
          sales={sales}
          onDeleteSale={onDeleteSale}
          onUpdateSale={handleVehicleUpdateSale}
          clients={clients}
          hideOnTrackCard
          renderAfterCards={secondaryCards}
        />

        {/* Vehicle Expenses Section */}
        {onAddExpense && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Despesas de Veículos ({vehicleExpenses.length})
              </h3>
              {vehicleExpenses.some(e => e.paid || (e.paidInstallments && e.paidInstallments > 0)) && onUpdateExpense && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-1"
                  onClick={() => setShowDeleteAllExpenses(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar Pagamentos
                </Button>
              )}
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
                    vehicleExpenses.forEach(exp => {
                      if (exp.paid || (exp.paidInstallments && exp.paidInstallments > 0)) {
                        onUpdateExpense!(exp.id, { paid: false, paidDate: undefined, paidInstallments: 0 });
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
                {vehicleExpenses.map((exp) => {
                  const isOverdue = !exp.paid && exp.dueDate < new Date().toISOString().split("T")[0];
                  const hasPaidSomething = exp.paid || (exp.paidInstallments && exp.paidInstallments > 0);
                  const isRecorrente = exp.type === "recorrente" && exp.installments && exp.installments > 1;
                  const installmentAmount = isRecorrente ? exp.amount / exp.installments! : exp.amount;

                  return (
                    <Card key={exp.id} className={`${exp.paid ? "opacity-60" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm truncate">{exp.description}</p>
                              <Badge variant={exp.paid ? "secondary" : isOverdue ? "destructive" : "outline"} className="text-[10px] shrink-0">
                                {exp.paid ? "Pago" : isOverdue ? "Vencido" : "Pendente"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{exp.category}</span>
                              <span>Venc: {new Date(exp.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}</span>
                              {isRecorrente && (
                                <span>{exp.paidInstallments || 0}/{exp.installments} parcelas</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm whitespace-nowrap">{formatCurrency(exp.amount)}</p>
                            {hasPaidSomething && onUpdateExpense && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewPaymentsExpenseId(exp.id)}
                                className="h-8 text-xs"
                              >
                                <Receipt className="h-3.5 w-3.5 mr-1" />
                                Pagamentos
                              </Button>
                            )}
                            {!exp.paid && onPayExpense && (
                              <Button size="sm" variant="outline" onClick={() => handleVehiclePayExpense(exp.id)} className="h-8 text-xs">
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                Pagar
                              </Button>
                            )}
                            {onDeleteExpense && (
                              <Button size="sm" variant="ghost" onClick={() => onDeleteExpense(exp.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
                                </div>
                              )
                            )}
                            {(!isRecorrente && !exp.paid && !(exp.paidInstallments && exp.paidInstallments > 0)) && (
                              <div className="py-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado.</div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    );
  }

  // Sales page - show sub-tabs for venda/streaming
  const activeTabs = salesSubTabs;
  
  return (
    <Tabs defaultValue={activeTabs[0]?.type || "venda"} className="space-y-4">
      {activeTabs.length > 1 && (
        <TabsList className={`w-full grid grid-cols-${activeTabs.length}`}>
          {activeTabs.map((tab) => (
            <TabsTrigger key={tab.type} value={tab.type} className="flex items-center gap-2">
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      )}

      {activeTabs.map((tab) => (
        <TabsContent key={tab.type} value={tab.type}>
          <SalesList
            sales={sales.filter((s) => s.businessType === tab.type)}
            onDeleteSale={onDeleteSale}
            onUpdateSale={onUpdateSale}
            clients={clients}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
