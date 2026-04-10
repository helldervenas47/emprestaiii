import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X } from "lucide-react";
import { Product } from "@/types/loan";

interface Props {
  products: Product[];
  onAdd: (sale: { productId: string; productName: string; quantity: number; unitPrice: number; total: number; customerName: string; date: string; notes?: string }) => void;
  onClose: () => void;
}

export function SaleForm({ products, onAdd, onClose }: Props) {
  const activeProducts = products.filter((p) => p.active && p.stock > 0);
  const [form, setForm] = useState({ productId: "", quantity: "1", customerName: "", notes: "" });

  const selectedProduct = activeProducts.find((p) => p.id === form.productId);
  const quantity = parseInt(form.quantity) || 0;
  const total = selectedProduct ? selectedProduct.price * quantity : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantity <= 0) return;
    onAdd({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity,
      unitPrice: selectedProduct.price,
      total,
      customerName: form.customerName,
      date: new Date().toISOString().split("T")[0],
      notes: form.notes || undefined,
    });
    onClose();
  };

  const update = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  return (
    <div className="fixed inset-0 bg-foreground/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl">Nova Venda</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Produto</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.productId}
                onChange={(e) => update("productId", e.target.value)}
                required
              >
                <option value="">Selecione um produto</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatCurrency(p.price)} (estoque: {p.stock})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min="1"
                  max={selectedProduct?.stock || 999}
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Cliente</Label>
                <Input value={form.customerName} onChange={(e) => update("customerName", e.target.value)} placeholder="Nome do cliente" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Notas..." />
            </div>

            {selectedProduct && quantity > 0 && (
              <div className="rounded-lg bg-muted p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total da venda</span>
                  <span className="font-bold text-foreground text-lg">{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!selectedProduct || quantity <= 0}>
              <Plus className="h-4 w-4 mr-2" /> Registrar Venda
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
