import { useState } from "react";
import { Product, Sale } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Package, Search, ShoppingCart, Pencil, ToggleLeft, ToggleRight, X, Check } from "lucide-react";
import { Label } from "@/components/ui/label";

interface Props {
  products: Product[];
  sales: Sale[];
  onDeleteProduct: (id: string) => void;
  onUpdateProduct: (id: string, data: Partial<Omit<Product, "id" | "createdAt">>) => void;
  onDeleteSale: (id: string) => void;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function ProductSalesView({ products, sales, onDeleteProduct, onUpdateProduct, onDeleteSale }: Props) {
  const [view, setView] = useState<"products" | "sales">("products");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", price: "", stock: "" });

  const totalSales = sales.reduce((s, sale) => s + sale.total, 0);
  const totalProducts = products.length;

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredSales = sales.filter((s) =>
    s.productName.toLowerCase().includes(search.toLowerCase()) ||
    s.customerName.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (p: Product) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, description: p.description, price: p.price.toString(), stock: p.stock.toString() });
  };

  const saveEdit = (id: string) => {
    onUpdateProduct(id, { name: editForm.name, description: editForm.description, price: parseFloat(editForm.price) || 0, stock: parseInt(editForm.stock) || 0 });
    setEditingId(null);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="gradient-primary rounded-xl p-4 text-primary-foreground">
          <p className="text-xs opacity-80">Produtos</p>
          <p className="text-2xl font-bold">{totalProducts}</p>
        </div>
        <div className="gradient-success rounded-xl p-4 text-primary-foreground">
          <p className="text-xs opacity-80">Vendas</p>
          <p className="text-2xl font-bold">{sales.length}</p>
        </div>
        <div className="gradient-warning rounded-xl p-4 text-primary-foreground sm:col-span-1 col-span-2">
          <p className="text-xs opacity-80">Faturamento</p>
          <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-4">
        <div className="flex bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setView("products")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "products" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Package className="h-3.5 w-3.5" /> Produtos
          </button>
          <button
            onClick={() => setView("sales")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "sales" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Vendas
          </button>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
      </div>

      {view === "products" ? (
        filteredProducts.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhum produto cadastrado</p>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.map((product) => (
              <Card key={product.id} className={`hover:shadow-md transition-shadow ${!product.active ? "opacity-60" : ""}`}>
                <CardContent className="p-5">
                  {editingId === product.id ? (
                    <div className="space-y-3">
                      <div><Label className="text-xs">Nome</Label><Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><Label className="text-xs">Preço</Label><Input type="number" step="0.01" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} /></div>
                        <div><Label className="text-xs">Estoque</Label><Input type="number" value={editForm.stock} onChange={(e) => setEditForm((p) => ({ ...p, stock: e.target.value }))} /></div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4 mr-1" />Cancelar</Button>
                        <Button size="sm" onClick={() => saveEdit(product.id)}><Check className="h-4 w-4 mr-1" />Salvar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-foreground">{product.name}</h3>
                            <Badge variant="outline" className={product.active ? "bg-success/10 text-success border-success/20 text-xs" : "bg-muted text-muted-foreground border-border text-xs"}>
                              {product.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                          {product.description && <p className="text-xs text-muted-foreground mt-1">{product.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <div className="flex gap-4 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Preço</p>
                            <p className="font-semibold">{formatCurrency(product.price)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Estoque</p>
                            <p className={`font-semibold ${product.stock <= 3 ? "text-destructive" : ""}`}>{product.stock}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onUpdateProduct(product.id, { active: !product.active })} title={product.active ? "Desativar" : "Ativar"}>
                            {product.active ? <ToggleRight className="h-4 w-4 text-success" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(product)}><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => onDeleteProduct(product.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        filteredSales.length === 0 ? (
          <Card><CardContent className="py-12 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">Nenhuma venda registrada</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filteredSales.map((sale) => (
              <div key={sale.id} className="flex items-center gap-4 px-4 py-3 bg-card rounded-lg border hover:shadow-sm transition-shadow">
                <div className="h-8 w-8 rounded-full gradient-success flex items-center justify-center shrink-0">
                  <ShoppingCart className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="min-w-[120px]">
                  <p className="font-medium text-sm">{sale.productName}</p>
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
            ))}
          </div>
        )
      )}
    </div>
  );
}
