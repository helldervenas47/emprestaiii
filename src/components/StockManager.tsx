import { useMemo, useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useExpenses } from "@/hooks/useExpenses";
import { useStockMovements, StockMovement, StockMovementType } from "@/hooks/useStockMovements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/money-input";
import { Boxes, PackagePlus, ShoppingBag, History, ShoppingCart, ArrowDown, ArrowUp, Wrench, AlertTriangle, Pencil } from "lucide-react";
import { ProductForm } from "@/components/ProductForm";
import type { Product } from "@/types/loan";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { todayInAppTz } from "@/lib/timezone";

const movementMeta: Record<StockMovementType, { label: string; icon: any; cls: string; sign: "+" | "-" }> = {
  entrada_manual: { label: "Entrada manual", icon: PackagePlus, cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", sign: "+" },
  compra: { label: "Compra", icon: ShoppingBag, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", sign: "+" },
  venda: { label: "Venda", icon: ShoppingCart, cls: "bg-rose-500/10 text-rose-600 border-rose-500/20", sign: "-" },
  ajuste: { label: "Ajuste", icon: Wrench, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", sign: "+" },
};

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props { readOnly?: boolean; }

export function StockManager({ readOnly = false }: Props) {
  const { products, updateProduct } = useProducts(true);
  const { addExpense } = useExpenses(true);
  const { movements, recordMovement } = useStockMovements(true);

  const [entryOpen, setEntryOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");

  const filteredMovements = useMemo(() => movements.filter(m =>
    (filterType === "all" || m.type === filterType) &&
    (filterProduct === "all" || m.productId === filterProduct)
  ), [movements, filterType, filterProduct]);

  return (
    <Tabs defaultValue="estoque" className="space-y-4">
      <TabsList className="w-full bg-muted/50 rounded-xl p-1 flex gap-0.5 h-auto">
        <TabsTrigger value="estoque" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
          <Boxes className="h-3.5 w-3.5" /> Estoque
        </TabsTrigger>
        <TabsTrigger value="historico" className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm">
          <History className="h-3.5 w-3.5" /> Movimentações
        </TabsTrigger>
      </TabsList>

      <TabsContent value="estoque" className="space-y-3">
        {!readOnly && (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <Button onClick={() => setEntryOpen(true)} disabled={products.length === 0} className="w-full sm:w-auto">
              <PackagePlus className="h-4 w-4 mr-2" /> Entrada manual
            </Button>
            <Button onClick={() => setPurchaseOpen(true)} disabled={products.length === 0} variant="outline" className="w-full sm:w-auto">
              <ShoppingBag className="h-4 w-4 mr-2" /> Registrar compra
            </Button>
          </div>
        )}

        {products.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
            Cadastre um produto primeiro para começar a controlar o estoque.
          </CardContent></Card>
        ) : (
          <div className="divide-y rounded-lg border bg-card overflow-hidden">
            {products.map(p => {
              const threshold = p.suggestedStock && p.suggestedStock > 0 ? p.suggestedStock : 5;
              const low = p.stock > 0 && p.stock <= threshold;
              const out = p.stock <= 0;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Venda {fmtBRL(p.price)}
                      {p.cost > 0 ? ` · Compra ${fmtBRL(p.cost)}` : ""}
                      {p.suggestedStock > 0 ? ` · Sugerido ${p.suggestedStock}` : ""}
                    </div>
                  </div>
                  {out ? (
                    <Badge variant="destructive" className="shrink-0"><AlertTriangle className="h-3 w-3 mr-1" />Sem estoque</Badge>
                  ) : low ? (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">Estoque baixo</Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">Em estoque</Badge>
                  )}
                  <div className="text-right shrink-0 w-16">
                    <div className="text-lg font-bold tabular-nums leading-none">{p.stock}</div>
                    <div className="text-[10px] text-muted-foreground">unid.</div>
                  </div>
                  {!readOnly && (
                    <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => setEditingProduct(p)} aria-label="Editar produto">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </TabsContent>

      <TabsContent value="historico" className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="entrada_manual">Entrada manual</SelectItem>
              <SelectItem value="compra">Compra</SelectItem>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="ajuste">Ajuste</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {filteredMovements.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
            Nenhuma movimentação registrada ainda.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {filteredMovements.map(m => {
              const meta = movementMeta[m.type];
              const Icon = meta.icon;
              return (
                <Card key={m.id}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center border ${meta.cls}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{m.productName}</span>
                        <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(m.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {m.notes ? ` • ${m.notes}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold tabular-nums ${meta.sign === "+" ? "text-emerald-600" : "text-rose-600"}`}>
                        {meta.sign}{Math.abs(m.quantity)}
                      </div>
                      {m.totalValue != null && (
                        <div className="text-xs text-muted-foreground">{fmtBRL(m.totalValue)}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </TabsContent>

      <ManualEntryDialog
        open={entryOpen} onOpenChange={setEntryOpen}
        products={products}
        onSubmit={async ({ productId, quantity, notes }) => {
          const product = products.find(p => p.id === productId);
          if (!product) return;
          await updateProduct(productId, { stock: product.stock + quantity });
          await recordMovement({
            productId, productName: product.name, type: "entrada_manual",
            quantity, notes: notes || null,
          });
          toast.success(`Entrada de ${quantity} unid. registrada`);
        }}
      />

      <PurchaseDialog
        open={purchaseOpen} onOpenChange={setPurchaseOpen}
        products={products}
        onSubmit={async ({ productId, quantity, unitCost, notes }) => {
          const product = products.find(p => p.id === productId);
          if (!product) return;
          const total = quantity * unitCost;
          // 1) Cria despesa paga -> debita saldo financeiro
          let expenseId: string | null = null;
          try {
            await addExpense({
              description: `Compra: ${product.name} x${quantity}`,
              amount: total,
              type: "fixa",
              category: "Compra de mercadoria",
              dueDate: todayInAppTz(),
              notes: notes || undefined,
              scope: "business",
            } as any);
            // expense id não é retornado pelo addExpense — vínculo opcional
          } catch (e) { /* segue mesmo se falhar a despesa */ }
          // 2) Atualiza estoque e último preço de compra
          await updateProduct(productId, {
            stock: product.stock + quantity,
            lastPurchasePrice: unitCost,
          });
          // 3) Registra movimento
          await recordMovement({
            productId, productName: product.name, type: "compra",
            quantity, unitCost, totalValue: total,
            expenseId, notes: notes || null,
          });
          toast.success(`Compra de ${quantity} unid. registrada (${fmtBRL(total)})`);
        }}
      />
    </Tabs>
  );
}

/* ---------- Dialogs ---------- */

function ManualEntryDialog({ open, onOpenChange, products, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  products: { id: string; name: string }[];
  onSubmit: (v: { productId: string; quantity: number; notes: string }) => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(quantity);
    if (!productId || !q || q <= 0) { toast.error("Selecione produto e quantidade"); return; }
    setBusy(true);
    try {
      await onSubmit({ productId, quantity: q, notes });
      setProductId(""); setQuantity(""); setNotes("");
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrada manual de estoque</DialogTitle>
          <DialogDescription>Aumenta a quantidade em estoque sem afetar o financeiro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-3">
          <div>
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required />
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Registrar entrada"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDialog({ open, onOpenChange, products, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  products: { id: string; name: string }[];
  onSubmit: (v: { productId: string; quantity: number; unitCost: number; notes: string }) => Promise<void>;
}) {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const total = (parseFloat(unitCost) || 0) * (parseInt(quantity) || 0);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(quantity);
    const cost = parseFloat(unitCost);
    if (!productId || !q || q <= 0 || !cost || cost <= 0) {
      toast.error("Preencha produto, quantidade e custo"); return;
    }
    setBusy(true);
    try {
      await onSubmit({ productId, quantity: q, unitCost: cost, notes });
      setProductId(""); setQuantity(""); setUnitCost(""); setNotes("");
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Adiciona ao estoque e cria uma despesa paga, debitando o saldo financeiro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-3">
          <div>
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantidade</Label>
              <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required />
            </div>
            <div>
              <Label>Custo unitário</Label>
              <MoneyInput value={unitCost} onChange={setUnitCost} />
            </div>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Total da compra</span>
            <span className="font-bold tabular-nums">{fmtBRL(total)}</span>
          </div>
          <div>
            <Label>Observação</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Registrar compra"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
