import { useState } from "react";
import { Sale, BusinessType } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function ProductSalesView({ sales, onDeleteSale }: Props) {
  const [activeType, setActiveType] = useState<BusinessType>("venda");
  const [search, setSearch] = useState("");

  const filteredSales = sales.filter((s) => {
    const matchType = s.businessType === activeType;
    const matchSearch = s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.customerName.toLowerCase().includes(search.toLowerCase()) ||
      s.productName.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const totalByType = (type: BusinessType) => sales.filter((s) => s.businessType === type).reduce((acc, s) => acc + s.total, 0);
  const countByType = (type: BusinessType) => sales.filter((s) => s.businessType === type).length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {businessTabs.map((tab) => (
          <div
            key={tab.type}
            onClick={() => setActiveType(tab.type)}
            className={`rounded-xl p-4 cursor-pointer transition-all border-2 ${
              activeType === tab.type
                ? "gradient-primary text-primary-foreground border-transparent"
                : "bg-card text-foreground border-border hover:border-primary/30"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <tab.icon className="h-4 w-4" />
              <p className="text-xs font-medium opacity-80">{tab.label}</p>
            </div>
            <p className="text-2xl font-bold">{formatCurrency(totalByType(tab.type))}</p>
            <p className="text-xs opacity-70">{countByType(tab.type)} lançamento(s)</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {/* Sales list */}
      {filteredSales.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum lançamento de {businessTabs.find((t) => t.type === activeType)?.label.toLowerCase()}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filteredSales.map((sale) => {
            const TabIcon = businessTabs.find((t) => t.type === sale.businessType)?.icon || ShoppingCart;
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
