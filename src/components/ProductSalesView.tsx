import { useState, useCallback } from "react";
import { Sale, BusinessType } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Search, ShoppingCart, Tv, Car, Calendar, DollarSign, User, Pencil } from "lucide-react";
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

function SaleCard({ sale, onDelete, onEdit, formatCurrency }: { sale: Sale; onDelete: () => void; onEdit: () => void; formatCurrency: (v: number) => string }) {
  const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
  const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
  const valorParcela = sale.installments > 0 ? sale.total / sale.installments : sale.total;
  const totalPago = isRecorrente ? valorParcela * sale.paidInstallments : 0;
  const saldo = Math.max(0, sale.total - totalPago);
  const progress = isRecorrente && sale.installments > 0 ? (sale.paidInstallments / sale.installments) * 100 : 0;
  const isPaid = isRecorrente ? sale.paidInstallments >= sale.installments : true;

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

        {/* Valor central */}
        <div className="text-center py-1">
          <p className={`text-2xl font-bold ${isRecorrente && saldo > 0 ? "text-primary" : "text-success"}`}>
            {formatCurrency(isRecorrente ? saldo : sale.total)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isRecorrente ? "saldo restante" : "valor total"}
          </p>
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

        {isRecorrente && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-success/5 border border-success/20 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">💰 Pago</p>
                <p className="text-sm font-bold text-success">{formatCurrency(totalPago)}</p>
              </div>
              <div className="bg-muted/30 border border-border/50 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">📋 Parcelas</p>
                <p className="text-sm font-bold text-foreground">{sale.paidInstallments}/{sale.installments}</p>
              </div>
            </div>

            {/* Progress */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{sale.paidInstallments}/{sale.installments} parcelas</span>
                <span className="font-medium text-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2.5" />
            </div>
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
