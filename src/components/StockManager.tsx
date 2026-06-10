import { useEffect, useMemo, useState } from "react";
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
import { Boxes, PackagePlus, ShoppingBag, History, ShoppingCart, ArrowDown, ArrowUp, Wrench, AlertTriangle, Pencil, Plus, Trash2, MoreVertical, Eye, EyeOff, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProductForm } from "@/components/ProductForm";
import type { Product } from "@/types/loan";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { todayInAppTz } from "@/lib/timezone";
import { useDataOwner } from "@/hooks/useDataOwner";
import { supabase } from "@/integrations/supabase/userClient";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

const movementMeta: Record<StockMovementType, { label: string; icon: any; cls: string; sign: "+" | "-" }> = {
  entrada_manual: { label: "Entrada manual", icon: PackagePlus, cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", sign: "+" },
  compra: { label: "Compra", icon: ShoppingBag, cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", sign: "+" },
  venda: { label: "Venda", icon: ShoppingCart, cls: "bg-rose-500/10 text-rose-600 border-rose-500/20", sign: "-" },
  ajuste: { label: "Ajuste de Estoque", icon: Wrench, cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", sign: "-" },
};

const fmtBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface Props { readOnly?: boolean; }

export function StockManager({ readOnly = false }: Props) {
  const { products, updateProduct, deleteProduct } = useProducts(true);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const { addExpense, payExpense } = useExpenses(true);
  const { movements, recordMovement, deleteMovement } = useStockMovements(true);
  const ownerId = useDataOwner();


  const [entryOpen, setEntryOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  useEffect(() => {
    const handler = () => setAdjustOpen(true);
    window.addEventListener("open-stock-adjust", handler);
    return () => window.removeEventListener("open-stock-adjust", handler);
  }, []);

  const [filterReason, setFilterReason] = useState<string>("all");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProduct, setFilterProduct] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name-asc");
  const [statusFilter, setStatusFilter] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sortedProducts = useMemo(() => {
    const arr = products.filter((p) => {
      if (statusFilter === "ativos") return p.active !== false;
      if (statusFilter === "inativos") return p.active === false;
      return true;
    });
    switch (sortBy) {
      case "name-asc": arr.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")); break;
      case "name-desc": arr.sort((a, b) => b.name.localeCompare(a.name, "pt-BR")); break;
      case "stock-asc": arr.sort((a, b) => (a.stock || 0) - (b.stock || 0)); break;
      case "stock-desc": arr.sort((a, b) => (b.stock || 0) - (a.stock || 0)); break;
      case "price-asc": arr.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
      case "price-desc": arr.sort((a, b) => (b.price || 0) - (a.price || 0)); break;
      case "cost-asc": arr.sort((a, b) => (a.cost || 0) - (b.cost || 0)); break;
      case "cost-desc": arr.sort((a, b) => (b.cost || 0) - (a.cost || 0)); break;
    }
    return arr;
  }, [products, sortBy, statusFilter]);

  const lastMovementByProduct = useMemo(() => {
    const map = new Map<string, StockMovement>();
    // movements vem ordenado desc por created_at
    for (const m of movements) {
      if (!m.productId) continue;
      if (!map.has(m.productId)) map.set(m.productId, m);
    }
    return map;
  }, [movements]);

  const activeProducts = useMemo(() => products.filter((p) => p.active !== false), [products]);
  const inactiveCount = products.length - activeProducts.length;

  const extractReason = (notes: string | null): string => {
    if (!notes) return "";
    const m = notes.match(/Motivo:\s*([^|]+?)(?:\s*\||$)/i);
    return m ? m[1].trim() : "";
  };

  const adjustmentReasons = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      if (m.type !== "ajuste") return;
      const r = extractReason(m.notes);
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [movements]);

  const filteredMovements = useMemo(() => movements.filter(m =>
    (filterType === "all" || m.type === filterType) &&
    (filterProduct === "all" || m.productId === filterProduct) &&
    (filterReason === "all" || (m.type === "ajuste" && extractReason(m.notes) === filterReason))
  ), [movements, filterType, filterProduct, filterReason]);

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

      <TabsContent value="estoque" className="space-y-3 pb-24 sm:pb-4">
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
          <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Valor total em estoque (venda)</div>
                <div className="text-lg font-bold tabular-nums text-emerald-600">
                  {fmtBRL(activeProducts.reduce((s, p) => s + (p.price || 0) * Math.max(0, p.stock || 0), 0))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Valor total em estoque (custo)</div>
                <div className="text-lg font-bold tabular-nums">
                  {fmtBRL(activeProducts.reduce((s, p) => s + (p.cost || 0) * Math.max(0, p.stock || 0), 0))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Unidades em estoque</div>
                <div className="text-lg font-bold tabular-nums">
                  {activeProducts.reduce((s, p) => s + Math.max(0, p.stock || 0), 0)}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-row gap-2 sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Label className="text-xs text-muted-foreground hidden sm:block">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativos">Ativos ({activeProducts.length})</SelectItem>
                  <SelectItem value="inativos">Inativos ({inactiveCount})</SelectItem>
                  <SelectItem value="todos">Todos ({products.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1 sm:flex-initial">
              <Label className="text-xs text-muted-foreground hidden sm:block">Classificar por</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-9 w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Descrição (A-Z)</SelectItem>
                  <SelectItem value="name-desc">Descrição (Z-A)</SelectItem>
                  <SelectItem value="stock-desc">Estoque (maior)</SelectItem>
                  <SelectItem value="stock-asc">Estoque (menor)</SelectItem>
                  <SelectItem value="price-desc">Preço venda (maior)</SelectItem>
                  <SelectItem value="price-asc">Preço venda (menor)</SelectItem>
                  <SelectItem value="cost-desc">Preço compra (maior)</SelectItem>
                  <SelectItem value="cost-asc">Preço compra (menor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>


          <div className="hidden sm:block rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr className="[&>th]:px-2 sm:[&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                  <th className="text-left">Produto</th>
                  <th className="hidden sm:table-cell text-right">Preço venda</th>
                  <th className="hidden md:table-cell text-right">Preço compra</th>
                  <th className="hidden lg:table-cell text-right">Últ. compra</th>
                  <th className="hidden md:table-cell text-right">Sugerido</th>
                  <th className="hidden sm:table-cell text-right">Margem</th>
                  <th className="text-right">Est.</th>
                  <th className="text-left hidden xs:table-cell">Status</th>
                  {!readOnly && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedProducts.map(p => {
                  const threshold = p.suggestedStock && p.suggestedStock > 0 ? p.suggestedStock : 5;
                  const low = p.stock > 0 && p.stock <= threshold;
                  const out = p.stock <= 0;
                  const hasMargin = p.cost > 0 && p.price > 0;
                  const marginPct = hasMargin ? ((p.price - p.cost) / p.cost) * 100 : null;
                  return (
                    <tr key={p.id} className="hover:bg-muted/40 transition-colors [&>td]:px-2 sm:[&>td]:px-3 [&>td]:py-2.5">
                      <td className="font-medium">
                        <div className="truncate max-w-[140px] sm:max-w-[200px]">{p.name}</div>
                        <div className="sm:hidden mt-0.5">
                          {out ? (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Sem estoque</Badge>
                          ) : low ? (
                            <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">Estoque baixo</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Em estoque</Badge>
                          )}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell text-right tabular-nums">{fmtBRL(p.price)}</td>
                      <td className="hidden md:table-cell text-right tabular-nums text-muted-foreground">{p.cost > 0 ? fmtBRL(p.cost) : "—"}</td>
                      <td className="hidden lg:table-cell text-right tabular-nums text-muted-foreground">{p.lastPurchasePrice && p.lastPurchasePrice > 0 ? fmtBRL(p.lastPurchasePrice) : "—"}</td>
                      <td className="hidden md:table-cell text-right tabular-nums text-muted-foreground">{p.suggestedStock > 0 ? p.suggestedStock : "—"}</td>
                      <td className={`hidden sm:table-cell text-right tabular-nums font-medium ${marginPct == null ? "text-muted-foreground" : marginPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {marginPct == null ? "—" : `${marginPct.toFixed(1)}%`}
                      </td>
                      <td className="text-right font-bold tabular-nums">{p.stock}</td>
                      <td className="hidden xs:table-cell">
                        {out ? (
                          <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Sem estoque</Badge>
                        ) : low ? (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Estoque baixo</Badge>
                        ) : (
                          <Badge variant="secondary">Em estoque</Badge>
                        )}
                      </td>
                      {!readOnly && (
                        <td>
                          <div className="flex items-center justify-end">
                            {/* Mobile: kebab menu */}
                            <div className="sm:hidden">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Ações">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditingProduct(p)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateProduct(p.id, { active: !(p.active !== false) })}>
                                    {p.active !== false ? "Inativar" : "Ativar"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => setDeletingProduct(p)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            {/* Desktop: inline buttons */}
                            <div className="hidden sm:flex items-center gap-1 justify-end">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingProduct(p)} aria-label="Editar produto">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateProduct(p.id, { active: !(p.active !== false) })}
                                aria-label={p.active !== false ? "Inativar produto" : "Ativar produto"}
                                title={p.active !== false ? "Inativar produto" : "Ativar produto"}
                              >
                                {p.active !== false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>

                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeletingProduct(p)} aria-label="Excluir produto">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>

                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: lista expansível com descrição completa e detalhes */}
          <div className="sm:hidden space-y-2">
            <div className="flex items-center justify-between px-3 text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              <span>Descrição</span>
              <span>Quantidade</span>
            </div>
            {sortedProducts.map((p) => {
              const threshold = p.suggestedStock && p.suggestedStock > 0 ? p.suggestedStock : 5;
              const out = p.stock <= 0;
              const low = p.stock > 0 && p.stock <= threshold;
              const hasMargin = p.cost > 0 && p.price > 0;
              const marginPct = hasMargin ? ((p.price - p.cost) / p.cost) * 100 : null;
              const expanded = expandedIds.has(p.id);
              const lastMov = lastMovementByProduct.get(p.id);
              const meta = lastMov ? movementMeta[lastMov.type] : null;
              return (
                <div key={p.id} className="rounded-xl border border-border/40 bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(p.id)}
                    className="w-full text-left p-3 flex items-start gap-2 active:bg-muted/40 transition-colors"
                    aria-expanded={expanded}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3">
                        <span className="font-semibold text-sm break-words flex-1 min-w-0">{p.name}</span>
                        <span className="font-bold tabular-nums text-sm shrink-0">{p.stock} un.</span>
                      </div>
                      {p.description && (
                        <p className={`text-xs text-muted-foreground mt-1 break-words ${expanded ? "" : "line-clamp-2"}`}>
                          {p.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="text-emerald-600 tabular-nums font-medium">{fmtBRL(p.price)}</span>
                        {marginPct != null && (
                          <span className={`tabular-nums font-medium ${marginPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {marginPct.toFixed(1)}%
                          </span>
                        )}
                        {out ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Sem estoque
                          </Badge>
                        ) : low ? (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] px-1.5 py-0">Estoque baixo</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Em estoque</Badge>
                        )}
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`} />
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 pt-0 border-t border-border/40 bg-muted/20 animate-fade-in">
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs mt-3">
                        <div>
                          <dt className="text-muted-foreground">Estoque atual</dt>
                          <dd className="font-semibold tabular-nums">{p.stock}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Estoque mínimo</dt>
                          <dd className="font-semibold tabular-nums">{p.suggestedStock > 0 ? p.suggestedStock : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Preço de venda</dt>
                          <dd className="font-semibold tabular-nums text-emerald-600">{fmtBRL(p.price)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Custo médio</dt>
                          <dd className="font-semibold tabular-nums">{p.cost > 0 ? fmtBRL(p.cost) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Última compra</dt>
                          <dd className="font-semibold tabular-nums">{p.lastPurchasePrice > 0 ? fmtBRL(p.lastPurchasePrice) : "—"}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Margem</dt>
                          <dd className={`font-semibold tabular-nums ${marginPct == null ? "" : marginPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                            {marginPct == null ? "—" : `${marginPct.toFixed(1)}%`}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Última movimentação</dt>
                          <dd className="font-medium">
                            {lastMov && meta
                              ? `${meta.label} ${meta.sign}${Math.abs(lastMov.quantity)} · ${format(new Date(lastMov.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                              : "—"}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Data de cadastro</dt>
                          <dd className="font-medium">
                            {p.createdAt ? format(new Date(p.createdAt), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-muted-foreground">Status</dt>
                          <dd className="font-medium">{p.active !== false ? "Ativo" : "Inativo"}</dd>
                        </div>
                      </dl>
                      {!readOnly && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setEditingProduct(p); }}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                          </Button>
                          <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); updateProduct(p.id, { active: !(p.active !== false) }); }}>
                            {p.active !== false ? <><EyeOff className="h-3.5 w-3.5 mr-1.5" /> Inativar</> : <><Eye className="h-3.5 w-3.5 mr-1.5" /> Ativar</>}
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingProduct(p); }}>
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="historico" className="space-y-3 pb-24 sm:pb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="entrada_manual">Entrada manual</SelectItem>
              <SelectItem value="compra">Compra</SelectItem>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="ajuste">Ajuste de Estoque</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Produto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os produtos</SelectItem>
              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {adjustmentReasons.length > 0 && (
            <Select value={filterReason} onValueChange={setFilterReason}>
              <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Motivo do ajuste" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motivos</SelectItem>
                {adjustmentReasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
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
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                        onClick={async () => {
                          if (!confirm(`Excluir esta movimentação de ${m.productName}? O estoque será ajustado e esta ação não pode ser desfeita.`)) return;
                          const ok = await deleteMovement(m.id);
                          if (!ok) { toast.error("Erro ao excluir movimentação"); return; }
                          const prod = products.find(p => p.id === m.productId);
                          if (prod) {
                            const qty = Math.abs(m.quantity);
                            const delta = meta.sign === "+" ? -qty : qty;
                            const newStock = Math.max(0, (prod.stock ?? 0) + delta);
                            await updateProduct(prod.id, { stock: newStock });
                          }
                          toast.success("Movimentação excluída e estoque ajustado");
                        }}
                        aria-label="Excluir movimentação"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
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
        onSubmit={async ({ items, notes }) => {
          for (const it of items) {
            const product = products.find(p => p.id === it.productId);
            if (!product) continue;
            await updateProduct(it.productId, { stock: product.stock + it.quantity });
            await recordMovement({
              productId: it.productId, productName: product.name, type: "entrada_manual",
              quantity: it.quantity, notes: notes || null,
            });
          }
          toast.success(`Entrada de ${items.length} item(ns) registrada`);
        }}
      />

      <PurchaseDialog
        open={purchaseOpen} onOpenChange={setPurchaseOpen}
        products={products}
        onSubmit={async ({ items, notes }) => {
          const validItems = items.filter(it => it.productId && it.quantity > 0 && it.unitCost > 0);
          if (validItems.length === 0) return;
          const totalAll = validItems.reduce((s, it) => s + it.quantity * it.unitCost, 0);
          const descParts = validItems.map(it => {
            const prod = products.find(p => p.id === it.productId);
            return `${prod?.name || "?"} x${it.quantity}`;
          });
          // 1) Cria UMA despesa já paga com o total geral (impacta o saldo da aba Receitas e Despesas)
          const today = todayInAppTz();
          try {
            if (ownerId) {
              const { data: inserted, error: insErr } = await supabase
                .from("expenses")
                .insert({
                  user_id: ownerId,
                  description: `Compra: ${descParts.join(", ")}`,
                  amount: totalAll,
                  type: "fixa",
                  category: "Compra de mercadoria",
                  due_date: today,
                  paid: true,
                  paid_date: today,
                  notes: notes || null,
                  scope: "personal",
                })
                .select("id, paid, scope")
                .single();
              // Garantia: caso algum default sobrescreva, força paid=true e scope=personal
              if (!insErr && inserted && (!inserted.paid || inserted.scope !== "personal")) {
                await supabase
                  .from("expenses")
                  .update({ paid: true, paid_date: today, scope: "personal" })
                  .eq("id", inserted.id);
              }
            }
          } catch (e) { /* segue mesmo se falhar a despesa */ }

          // 2) Para cada item: atualiza estoque + último custo + registra movimento
          for (const it of validItems) {
            const product = products.find(p => p.id === it.productId);
            if (!product) continue;
            const total = it.quantity * it.unitCost;
            await updateProduct(it.productId, {
              stock: product.stock + it.quantity,
              lastPurchasePrice: it.unitCost,
            });
            await recordMovement({
              productId: it.productId, productName: product.name, type: "compra",
              quantity: it.quantity, unitCost: it.unitCost, totalValue: total,
              expenseId: null, notes: notes || null,
            });
          }
          toast.success(`Compra de ${validItems.length} item(ns) registrada (${fmtBRL(totalAll)})`);
        }}
      />

      <AdjustStockDialog
        open={adjustOpen} onOpenChange={setAdjustOpen}
        products={activeProducts.map((p) => ({ id: p.id, name: p.name, stock: p.stock || 0 }))}
        onSubmit={async ({ items, date, reason, notes }) => {
          let ok = 0;
          for (const it of items) {
            const product = products.find((p) => p.id === it.productId);
            if (!product) continue;
            const current = product.stock || 0;
            if (it.quantity <= 0 || it.quantity > current) continue;
            const composedNotes = [
              `Motivo: ${reason}`,
              `Data: ${date}`,
              `Estoque antes: ${current}`,
              `Estoque após: ${current - it.quantity}`,
              notes ? `Obs: ${notes}` : null,
            ].filter(Boolean).join(" | ");
            await updateProduct(it.productId, { stock: current - it.quantity });
            await recordMovement({
              productId: it.productId, productName: product.name, type: "ajuste",
              quantity: -it.quantity, notes: composedNotes,
            });
            ok++;
          }
          if (ok > 0) toast.success(`Ajuste registrado em ${ok} item(ns)`);
          else toast.error("Nenhum ajuste válido");
        }}
      />



      {editingProduct && (
        <ProductForm
          product={editingProduct}
          onUpdate={async (id, data) => { await updateProduct(id, data); }}
          onClose={() => setEditingProduct(null)}
        />
      )}
      <ConfirmDeleteDialog
        open={!!deletingProduct}
        onOpenChange={(o) => { if (!o) setDeletingProduct(null); }}
        title="Excluir produto"
        description={deletingProduct ? `Tem certeza que deseja excluir "${deletingProduct.name}"? As vendas associadas também serão removidas. Esta ação não pode ser desfeita.` : ""}
        onConfirm={async () => {
          if (!deletingProduct) return;
          const id = deletingProduct.id;
          setDeletingProduct(null);
          await deleteProduct(id);
          toast.success("Produto excluído");
        }}
      />
    </Tabs>
  );
}

/* ---------- Dialogs ---------- */

function ManualEntryDialog({ open, onOpenChange, products, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  products: { id: string; name: string }[];
  onSubmit: (v: { items: { productId: string; quantity: number }[]; notes: string }) => Promise<void>;
}) {
  const [items, setItems] = useState<{ productId: string; quantity: string }[]>([{ productId: "", quantity: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const updateItem = (idx: number, patch: Partial<{ productId: string; quantity: string }>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, { productId: "", quantity: "" }]);
  const removeItem = (idx: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = items
      .map(it => ({ productId: it.productId, quantity: parseInt(it.quantity) }))
      .filter(it => it.productId && it.quantity > 0);
    if (parsed.length === 0) { toast.error("Adicione ao menos um produto com quantidade"); return; }
    setBusy(true);
    try {
      await onSubmit({ items: parsed, notes });
      setItems([{ productId: "", quantity: "" }]); setNotes("");
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Entrada manual de estoque</DialogTitle>
          <DialogDescription>Adicione um ou mais produtos. Não afeta o financeiro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-3">
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1">
                  {idx === 0 && <Label className="text-xs">Produto</Label>}
                  <Select value={it.productId} onValueChange={v => updateItem(idx, { productId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28">
                  {idx === 0 && <Label className="text-xs">Qtd</Label>}
                  <Input type="number" min="1" value={it.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={items.length === 1} aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar produto
            </Button>
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
  onSubmit: (v: { items: { productId: string; quantity: number; unitCost: number }[]; notes: string }) => Promise<void>;
}) {
  const [items, setItems] = useState<{ productId: string; quantity: string; unitCost: string }[]>([{ productId: "", quantity: "", unitCost: "" }]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const updateItem = (idx: number, patch: Partial<{ productId: string; quantity: string; unitCost: string }>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const addItem = () => setItems(prev => [...prev, { productId: "", quantity: "", unitCost: "" }]);
  const removeItem = (idx: number) => setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));

  const total = items.reduce((s, it) => s + (parseFloat(it.unitCost) || 0) * (parseInt(it.quantity) || 0), 0);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = items
      .map(it => ({ productId: it.productId, quantity: parseInt(it.quantity), unitCost: parseFloat(it.unitCost) }))
      .filter(it => it.productId && it.quantity > 0 && it.unitCost > 0);
    if (parsed.length === 0) { toast.error("Preencha produto, quantidade e custo em ao menos um item"); return; }
    setBusy(true);
    try {
      await onSubmit({ items: parsed, notes });
      setItems([{ productId: "", quantity: "", unitCost: "" }]); setNotes("");
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
          <DialogDescription>
            Adicione um ou mais produtos. Será criada uma única despesa paga com o total.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-3">
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <div className="flex-1">
                  {idx === 0 && <Label className="text-xs">Produto</Label>}
                  <Select value={it.productId} onValueChange={v => updateItem(idx, { productId: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-20">
                  {idx === 0 && <Label className="text-xs">Qtd</Label>}
                  <Input type="number" min="1" value={it.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} />
                </div>
                <div className="w-32">
                  {idx === 0 && <Label className="text-xs">Custo unit.</Label>}
                  <MoneyInput value={it.unitCost} onChange={v => updateItem(idx, { unitCost: v })} />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={items.length === 1} aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar produto
            </Button>
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

const DEFAULT_ADJUST_REASONS = [
  "Perda",
  "Avaria",
  "Vencimento",
  "Extravio",
  "Consumo interno",
  "Outro",
];

function AdjustStockDialog({ open, onOpenChange, products, onSubmit }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  products: { id: string; name: string; stock: number }[];
  onSubmit: (v: { items: { productId: string; quantity: number }[]; date: string; reason: string; notes: string }) => Promise<void>;
}) {
  const [items, setItems] = useState<{ productId: string; quantity: string }[]>([{ productId: "", quantity: "" }]);
  const [date, setDate] = useState(todayInAppTz());
  const [reasonPreset, setReasonPreset] = useState("Perda");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const finalReason = reasonPreset === "Outro" ? customReason.trim() : reasonPreset;

  const updateItem = (idx: number, patch: Partial<{ productId: string; quantity: string }>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { productId: "", quantity: "" }]);
  const removeItem = (idx: number) =>
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));

  const parsedItems = items
    .map((it) => ({ productId: it.productId, quantity: parseInt(it.quantity) || 0 }))
    .filter((it) => it.productId && it.quantity > 0);

  const reset = () => {
    setItems([{ productId: "", quantity: "" }]);
    setDate(todayInAppTz());
    setReasonPreset("Perda"); setCustomReason(""); setNotes(""); setConfirming(false);
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedItems.length === 0) { toast.error("Adicione ao menos um item válido"); return; }
    for (const it of parsedItems) {
      const p = products.find((x) => x.id === it.productId);
      if (!p) { toast.error("Produto inválido"); return; }
      if (it.quantity > p.stock) { toast.error(`Quantidade maior que o saldo de "${p.name}" (${p.stock})`); return; }
    }
    if (!finalReason) { toast.error("Informe o motivo do ajuste"); return; }
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onSubmit({ items: parsedItems, date, reason: finalReason, notes });
      reset();
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajuste de Estoque</DialogTitle>
          <DialogDescription>
            Baixa manual de estoque (perdas, avarias, etc.). Não afeta o financeiro.
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <form onSubmit={handleNext} className="space-y-3">
            <div className="space-y-2">
              {items.map((it, idx) => {
                const prod = products.find((p) => p.id === it.productId);
                return (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1">
                      {idx === 0 && <Label className="text-xs">Produto</Label>}
                      <Select value={it.productId} onValueChange={(v) => updateItem(idx, { productId: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} (estoque: {p.stock})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28">
                      {idx === 0 && <Label className="text-xs">Qtd a baixar</Label>}
                      <Input
                        type="number"
                        min="1"
                        max={prod?.stock ?? undefined}
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)} disabled={items.length === 1} aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar produto
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Motivo do ajuste</Label>
                <Select value={reasonPreset} onValueChange={setReasonPreset}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEFAULT_ADJUST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {reasonPreset === "Outro" && (
              <div>
                <Label className="text-xs">Motivo personalizado</Label>
                <Input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Descreva o motivo" />
              </div>
            )}
            <div>
              <Label className="text-xs">Observação</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit">Revisar ajuste</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Confirmar baixa de estoque ({parsedItems.length} item{parsedItems.length === 1 ? "" : "ns"})
              </div>
              <div className="space-y-1">
                {parsedItems.map((it, idx) => {
                  const p = products.find((x) => x.id === it.productId);
                  const before = p?.stock ?? 0;
                  return (
                    <div key={idx} className="flex items-center justify-between gap-2 border-t border-amber-500/20 pt-1 first:border-t-0 first:pt-0">
                      <span className="truncate"><b>{p?.name}</b></span>
                      <span className="tabular-nums text-rose-600 dark:text-rose-400 font-semibold">-{it.quantity}</span>
                      <span className="text-xs text-muted-foreground">{before} → {before - it.quantity}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pt-1 border-t border-amber-500/20">
                <div><span className="text-muted-foreground">Data:</span> {date}</div>
                <div><span className="text-muted-foreground">Motivo:</span> {finalReason}</div>
                {notes && <div><span className="text-muted-foreground">Obs:</span> {notes}</div>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>Voltar</Button>
              <Button type="button" onClick={handleConfirm} disabled={busy}>
                {busy ? "Registrando..." : "Confirmar ajuste"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

