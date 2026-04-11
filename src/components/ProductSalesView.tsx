import { useState } from "react";
import { Sale, BusinessType } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Search, ShoppingCart, Tv, Car } from "lucide-react";

interface Props {
  sales: Sale[];
  onDeleteSale: (id: string) => void;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

const businessTabs: { type: BusinessType; label: string; icon: React.ElementType }[] = [
  { type: "venda", label: "Vendas", icon: ShoppingCart },
  { type: "streaming", label: "Streaming", icon: Tv },
  { type: "aluguel_veiculo", label: "Aluguel de Veículos", icon: Car },
];

function SalesList({ sales, onDeleteSale }: { sales: Sale[]; onDeleteSale: (id: string) => void }) {
  const [search, setSearch] = useState("");

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
        <div className="space-y-2">
          {filtered.map((sale) => {
            const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
            const isRecorrente = sale.paymentMode === "recorrente" && sale.installments > 1;
            return (
              <div key={sale.id} className="flex items-center gap-4 px-4 py-3 bg-card rounded-lg border hover:shadow-sm transition-shadow">
                <div className="h-8 w-8 rounded-full gradient-success flex items-center justify-center shrink-0">
                  <TabIcon className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="min-w-[120px] flex-1">
                  <p className="font-medium text-sm">{sale.description || sale.productName}</p>
                  <p className="text-xs text-muted-foreground">{new Date(sale.date).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="hidden sm:block min-w-[80px]">
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-sm">{sale.customerName || "—"}</p>
                </div>
                {isRecorrente && (
                  <div className="min-w-[70px]">
                    <p className="text-xs text-muted-foreground">Parcelas</p>
                    <p className="text-sm font-semibold">{sale.paidInstallments}/{sale.installments}</p>
                  </div>
                )}
                <div className="min-w-[50px]">
                  <p className="text-xs text-muted-foreground">Qtd</p>
                  <p className="text-sm font-semibold">{sale.quantity}</p>
                </div>
                <div className="min-w-[80px]">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-sm font-semibold">{formatCurrency(sale.total)}</p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 ml-auto text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDeleteSale(sale.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProductSalesView({ sales, onDeleteSale }: Props) {
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
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
