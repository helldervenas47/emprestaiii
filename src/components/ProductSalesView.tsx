import { useState, useCallback } from "react";
import { Sale, BusinessType } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Search, ShoppingCart, Tv, Car, Calendar, User, Pencil, ChevronDown, ChevronUp, CheckCircle, HandCoins, Check, X as XIcon } from "lucide-react";
import { addMonths, format } from "date-fns";
import { useHideValues } from "@/contexts/HideValuesContext";
import { SaleEditForm } from "@/components/SaleEditForm";

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

function SaleCard({ sale, onDelete, onEdit, onUpdate, formatCurrency }: { sale: Sale; onDelete: () => void; onEdit: () => void; onUpdate: (data: Partial<Omit<Sale, "id">>) => void; formatCurrency: (v: number) => string }) {
  const [showPartial, setShowPartial] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [showParcelas, setShowParcelas] = useState(false);
  const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const valorParcela = sale.installments > 0 ? sale.total / sale.installments : sale.total;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : true;
  const pendentes = isRecorrente ? sale.installments - sale.paidInstallments : 0;

  // Generate installment rows with estimated dates
  const parcelas = isRecorrente
    ? Array.from({ length: sale.installments }, (_, i) => {
        const baseDate = new Date(sale.date + "T00:00:00");
        const dueDate = addMonths(baseDate, i);
        return {
          number: i + 1,
          date: format(dueDate, "dd/MM/yyyy"),
          value: valorParcela,
          paid: i < sale.paidInstallments,
        };
      })
    : [];

  return (
    <Card className="overflow-hidden border-border/50 hover:border-border transition-all">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center text-primary-foreground font-bold text-xs shrink-0 ${
            isPaid && isRecorrente ? "bg-success" : "gradient-primary"
          }`}>
            <TabIcon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{sale.description || sale.productName}</p>
            {sale.customerName && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <User className="h-3 w-3 shrink-0" />{sale.customerName}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isPaid && isRecorrente ? (
              <Badge className="bg-success/20 text-success border-success/30 text-xs">Pago</Badge>
            ) : isRecorrente ? (
              <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">Pendente</Badge>
            ) : (
              <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Fixa</Badge>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3 border border-border/50 rounded-lg p-3">
          <div>
            <p className="text-xs text-muted-foreground">Valor Total</p>
            <p className="text-sm font-bold text-foreground">{formatCurrency(sale.total)}</p>
          </div>
          {isRecorrente ? (
            <div>
              <p className="text-xs text-muted-foreground">Valor Parcela</p>
              <p className="text-sm font-bold text-foreground">{formatCurrency(valorParcela)}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted-foreground">Quantidade</p>
              <p className="text-sm font-bold text-foreground">{sale.quantity}</p>
            </div>
          )}
        </div>

        {/* Parcelas section */}
        {isRecorrente && (
          <div className="border border-border/50 rounded-lg overflow-hidden">
            {/* Parcelas header */}
            <button
              onClick={() => setShowParcelas(!showParcelas)}
              className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Parcelas ({sale.installments})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-success">{sale.paidInstallments} pagas</span>
                <span className="text-xs font-medium text-warning">{pendentes} pendentes</span>
                {showParcelas ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {/* Parcelas list */}
            {showParcelas && (
              <div className="divide-y divide-border/30">
                {parcelas.map((p) => (
                  <div key={p.number} className="flex items-center gap-3 px-3 py-2.5">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      p.paid ? "bg-success/20 text-success" : "bg-muted/40 text-muted-foreground"
                    }`}>
                      {p.number}ª
                    </span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-sm text-foreground">{p.date}</span>
                      <Calendar className="h-3.5 w-3.5 text-success shrink-0" />
                    </div>
                    <span className="text-sm font-medium text-foreground tabular-nums">{formatCurrency(p.value)}</span>
                    <span className={`text-xs font-medium w-16 text-right ${p.paid ? "text-success" : "text-muted-foreground"}`}>
                      {p.paid ? "Paga" : "Pendente"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payment buttons */}
        {isRecorrente && !isPaid && (
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
                        // partial: just increase paidInstallments proportionally
                        const parcelasAPagar = Math.floor(val / valorParcela);
                        if (parcelasAPagar > 0) {
                          onUpdate({ paidInstallments: Math.min(sale.installments, sale.paidInstallments + parcelasAPagar) });
                        }
                        setPartialAmount(""); setShowPartial(false);
                      }
                    }
                  }}
                />
                <Button size="sm" className="h-8" onClick={() => {
                  const val = parseFloat(partialAmount);
                  if (val > 0) {
                    const parcelasAPagar = Math.max(1, Math.floor(val / valorParcela));
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
            <p className="text-xs text-muted-foreground italic">{sale.notes}</p>
          </div>
        )}

        {/* Footer: date + actions */}
        <div className="flex items-center justify-between pt-1">
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
      </CardContent>
    </Card>
  );
}

function SalesList({ sales, onDeleteSale, onUpdateSale }: { sales: Sale[]; onDeleteSale: (id: string) => void; onUpdateSale: (id: string, data: Partial<Omit<Sale, "id">>) => void }) {
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [search, setSearch] = useState("");
  const { mask } = useHideValues();
  const formatCurrency = useCallback((v: number) => mask(rawFormatCurrency(v)), [mask]);

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    return s.description.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      s.productName.toLowerCase().includes(q);
  });

  const total = sales.reduce((acc, s) => acc + s.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{sales.length} lançamento(s)</p>
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
