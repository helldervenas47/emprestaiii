import { useState, useCallback } from "react";
import { Sale, BusinessType } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Search, ShoppingCart, Tv, Car, Calendar as CalendarIcon, User, Pencil, ChevronDown, ChevronUp, CheckCircle, HandCoins, Check, X as XIcon, DollarSign, AlertTriangle, Clock, CircleCheck } from "lucide-react";
import { addMonths, format } from "date-fns";
import { useHideValues } from "@/contexts/HideValuesContext";
import { SaleEditForm } from "@/components/SaleEditForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface Props {
  sales: Sale[];
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void;
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const businessTabs: { type: BusinessType; label: string; icon: React.ElementType }[] = [
  { type: "venda", label: "Vendas", icon: ShoppingCart },
  { type: "streaming", label: "Streaming", icon: Tv },
  { type: "aluguel_veiculo", label: "Aluguel de Veículos", icon: Car },
];

function getSaleCategory(sale: Sale): "paid" | "overdue" | "due_today" | "on_track" {
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : sale.paidInstallments >= 1;
  if (isPaid) return "paid";

  // Find next unpaid installment due date
  const baseDate = new Date(sale.date + "T00:00:00");
  const nextInstIdx = sale.paidInstallments;
  const dueDate = isRecorrente ? addMonths(baseDate, nextInstIdx) : baseDate;
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
  const [showParcelas, setShowParcelas] = useState(false);
  const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const valorParcela = sale.installments > 0 ? sale.total / sale.installments : sale.total;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : sale.paidInstallments >= 1;
  const pendentes = isRecorrente ? sale.installments - sale.paidInstallments : (sale.paidInstallments >= 1 ? 0 : 1);
  const category = getSaleCategory(sale);
  const catStyle = saleCategoryConfig[category];

  // Generate installment rows with estimated dates
  const totalParcelas = isRecorrente ? sale.installments : 1;
  const parcelas = Array.from({ length: totalParcelas }, (_, i) => {
    const baseDate = new Date(sale.date + "T00:00:00");
    const dueDate = isRecorrente ? addMonths(baseDate, i) : baseDate;
    return {
      number: i + 1,
      date: format(dueDate, "dd/MM/yyyy"),
      value: valorParcela,
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

        {/* Row 2: Info grid - always 2 cols, fixed height */}
        <div className="grid grid-cols-2 gap-3 border border-border/50 rounded-lg p-3 h-[60px]">
          <div>
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <p className="text-sm font-bold text-foreground">{formatCurrency(sale.total)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{isRecorrente ? "Valor Parcela" : "Quantidade"}</p>
            <p className="text-sm font-bold text-foreground">{isRecorrente ? formatCurrency(valorParcela) : sale.quantity}</p>
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
                <Calendar className="h-4 w-4 text-muted-foreground" />
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
                      {p.paid ? "Paga" : "Pendente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        {/* Row 5: Payment buttons - fixed position via mt-auto */}
        <div className="mt-auto space-y-2">
          {!isPaid && (
            <>
              {showPartial ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted border border-border/50">
                  <Input
                    type="number" step="0.01" placeholder="Valor (R$)"
                    value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}
                    className="h-8 text-sm flex-1" autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const val = parseFloat(partialAmount);
                        if (val > 0) {
                          const parcelasAPagar = isRecorrente ? Math.max(1, Math.floor(val / valorParcela)) : 1;
                          onUpdate({ paidInstallments: Math.min(sale.installments, sale.paidInstallments + parcelasAPagar) });
                          setPartialAmount(""); setShowPartial(false);
                        }
                      }
                    }}
                  />
                  <Button size="sm" className="h-8" onClick={() => {
                    const val = parseFloat(partialAmount);
                    if (val > 0) {
                      const parcelasAPagar = isRecorrente ? Math.max(1, Math.floor(val / valorParcela)) : 1;
                      onUpdate({ paidInstallments: Math.min(sale.installments, sale.paidInstallments + parcelasAPagar) });
                      setPartialAmount(""); setShowPartial(false);
                    }
                  }}><Check className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setShowPartial(false)}><XIcon className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground"
                    onClick={() => onUpdate({ paidInstallments: Math.min(sale.installments, sale.paidInstallments + 1) })}
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> Pagar Parcela
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 h-9 text-xs border-warning/30 text-warning hover:bg-warning hover:text-warning-foreground"
                    onClick={() => setShowPartial(true)}
                  >
                    <HandCoins className="h-3.5 w-3.5 mr-1" /> Pagar Parcial
                  </Button>
                </div>
              )}
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
              <Calendar className="h-3 w-3" />
              {new Date(sale.date + "T00:00:00").toLocaleDateString("pt-BR")}
            </p>
            <div className="flex items-center gap-1">
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

function SalesList({ sales, onDeleteSale, onUpdateSale }: { sales: Sale[]; onDeleteSale: (id: string) => void; onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void }) {
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

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    const matchesSearch = s.description.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.productName.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (categoryFilter === "all") return true;
    return getSaleCategory(s) === categoryFilter;
  });

  const total = filtered.reduce((acc, s) => acc + s.total, 0);

  // Calculate receivables per category
  const getRemaining = (s: Sale) => {
    const valorParcela = s.installments > 0 ? s.total / s.installments : s.total;
    const paid = valorParcela * s.paidInstallments;
    return Math.max(0, s.total - paid);
  };

  const overdueSales = sales.filter((s) => getSaleCategory(s) === "overdue");
  const onTrackSales = sales.filter((s) => getSaleCategory(s) === "on_track");
  const dueTodaySales = sales.filter((s) => getSaleCategory(s) === "due_today");
  const paidSales = sales.filter((s) => getSaleCategory(s) === "paid");

  const totalOverdue = overdueSales.reduce((acc, s) => acc + getRemaining(s), 0);
  const totalOnTrack = onTrackSales.reduce((acc, s) => acc + getRemaining(s), 0);
  const totalDueToday = dueTodaySales.reduce((acc, s) => acc + getRemaining(s), 0);
  const totalPaid = paidSales.reduce((acc, s) => acc + s.total, 0);
  const totalAReceber = totalOverdue + totalOnTrack + totalDueToday;

  return (
    <div className="space-y-4">
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 bg-gradient-to-br from-destructive/80 to-destructive text-destructive-foreground">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium opacity-90">Vencidos</p>
            <AlertTriangle className="h-4 w-4 opacity-70" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalOverdue)}</p>
          <p className="text-xs opacity-75 mt-1">{overdueSales.length} contratos</p>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-primary/80 to-primary text-primary-foreground">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium opacity-90">No Prazo</p>
            <Clock className="h-4 w-4 opacity-70" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalOnTrack + totalDueToday)}</p>
          <p className="text-xs opacity-75 mt-1">{onTrackSales.length + dueTodaySales.length} contratos</p>
        </div>
        <div className="rounded-xl p-4 bg-gradient-to-br from-success/80 to-success text-success-foreground">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium opacity-90">Pagos</p>
            <CircleCheck className="h-4 w-4 opacity-70" />
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalPaid)}</p>
          <p className="text-xs opacity-75 mt-1">{paidSales.length} contratos</p>
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
        />
      )}
    </div>
  );
}

export function ProductSalesView({ sales, onDeleteSale, onUpdateSale }: Props) {
  return (
    <Tabs defaultValue="venda" className="space-y-4">
      <TabsList className="w-full grid grid-cols-3">
        {businessTabs.map((tab) => (
          <TabsTrigger key={tab.type} value={tab.type} className="flex items-center gap-2">
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {businessTabs.map((tab) => (
        <TabsContent key={tab.type} value={tab.type}>
          <SalesList
            sales={sales.filter((s) => s.businessType === tab.type)}
            onDeleteSale={onDeleteSale}
            onUpdateSale={onUpdateSale}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
