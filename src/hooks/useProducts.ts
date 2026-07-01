import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/userClient";
import { Product, Sale, BusinessType, SalePaymentRecord } from "@/types/loan";
import { useAuth } from "@/hooks/useAuth";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { assertWritable } from "@/lib/readOnlyState";

const PRODUCT_COLUMNS =
  "id, name, description, price, cost, last_purchase_price, suggested_stock, stock, active, created_at";
const SALE_COLUMNS =
  "id, product_id, description, quantity, total, customer_name, sale_date, notes, business_type, payment_mode, installments, paid_installments, frequency, installment_value, installment_amounts, installment_dates, partial_paid, payment_history, locador_id, category";

function rowToProduct(p: any): Product {
  return {
    id: p.id, name: p.name, description: p.description || "",
    price: Number(p.price), cost: Number(p.cost || 0),
    lastPurchasePrice: Number(p.last_purchase_price || 0),
    suggestedStock: Number(p.suggested_stock || 0),
    stock: p.stock, active: p.active !== false, createdAt: p.created_at,
  };
}

function rowToSale(s: any, prodMap: Map<string, string>): Sale {
  return {
    id: s.id,
    productId: s.product_id || undefined,
    productName: s.product_id ? (prodMap.get(s.product_id) || "Produto removido") : (s.description || ""),
    description: s.description || "",
    quantity: s.quantity,
    unitPrice: 0,
    cost: 0,
    total: Number(s.total),
    customerName: s.customer_name || "",
    date: s.sale_date,
    notes: (s as any).notes || "",
    businessType: (s.business_type as BusinessType) || "venda",
    paymentMode: ((s as any).payment_mode || "fixa") as "fixa" | "recorrente",
    installments: (s as any).installments || 1,
    paidInstallments: (s as any).paid_installments || 0,
    downPayment: 0,
    frequency: (s as any).frequency || "Mensal",
    installmentValue: (s as any).installment_value != null ? Number((s as any).installment_value) : null,
    installmentAmounts: (s as any).installment_amounts || null,
    installmentDates: (s as any).installment_dates || null,
    partialPaid: Number((s as any).partial_paid) || 0,
    paymentHistory: (Array.isArray(s.payment_history) ? s.payment_history : []) as unknown as SalePaymentRecord[],
    locadorId: s.locador_id || null,
    category: (s as any).category || null,
  };
}

// ---------------------------------------------------------------------------
// Fase 6 — TanStack Query shared cache para products/sales.
// ---------------------------------------------------------------------------
export async function fetchProductsData(): Promise<Product[]> {
  const { data } = await supabase
    .from("products").select(PRODUCT_COLUMNS).order("created_at", { ascending: false });
  if (!data) return [];
  return (data as any[]).map(rowToProduct);
}

export async function fetchSalesData(): Promise<{ sales: Sale[]; productNameMap: Record<string, string> }> {
  const [prodRes, salesRes] = await Promise.all([
    supabase.from("products").select("id, name"),
    supabase.from("sales").select(SALE_COLUMNS).order("created_at", { ascending: false }),
  ]);
  const prodMap = new Map<string, string>(((prodRes.data as any[]) || []).map((p) => [p.id, p.name]));
  const sales = salesRes.data ? (salesRes.data as any[]).map((s) => rowToSale(s, prodMap)) : [];
  const productNameMap: Record<string, string> = {};
  prodMap.forEach((v, k) => { productNameMap[k] = v; });
  return { sales, productNameMap };
}

export function productsQueryKey(ownerKey: string | null | undefined) {
  return ["products", ownerKey ?? "anon"] as const;
}
export function salesQueryKey(ownerKey: string | null | undefined) {
  return ["sales", ownerKey ?? "anon"] as const;
}

export function useProducts(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const queryClient = useQueryClient();
  const ownerKey = dataOwnerId ?? user?.id ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const productsQuery = useQuery({
    queryKey: productsQueryKey(ownerKey),
    queryFn: fetchProductsData,
    enabled: !!user && enabled,
    staleTime: 30_000,
  });
  const salesQuery = useQuery({
    queryKey: salesQueryKey(ownerKey),
    queryFn: fetchSalesData,
    enabled: !!user && enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (productsQuery.data) setProducts(productsQuery.data);
  }, [productsQuery.data]);
  useEffect(() => {
    if (salesQuery.data) setSales(salesQuery.data.sales);
  }, [salesQuery.data]);

  const loading = productsQuery.isLoading || salesQuery.isLoading;

  const invalidateProducts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: productsQueryKey(ownerKey) });
  }, [queryClient, ownerKey]);
  const invalidateSales = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: salesQueryKey(ownerKey) });
  }, [queryClient, ownerKey]);

  // Realtime — invalida o cache correto por tabela
  useEffect(() => {
    if (!user || !enabled) return;
    const channel = supabase
      .channel(`products-sales-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: productsQueryKey(ownerKey) });
        // Sale mapping depende do nome do produto — refresca também.
        queryClient.invalidateQueries({ queryKey: salesQueryKey(ownerKey) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        queryClient.invalidateQueries({ queryKey: salesQueryKey(ownerKey) });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient, ownerKey, enabled]);

  const addProduct = useCallback(async (p: Omit<Product, "id" | "createdAt">) => {
    assertWritable();
    if (!user || !dataOwnerId) return;
    const tempId = crypto.randomUUID();
    setProducts((prev) => [{ ...p, id: tempId, createdAt: new Date().toISOString() }, ...prev]);

    const { data, error } = await supabase.from("products").insert({
      user_id: dataOwnerId,
      name: p.name,
      description: p.description,
      price: p.price,
      cost: p.cost ?? 0,
      stock: p.stock,
      last_purchase_price: p.lastPurchasePrice ?? 0,
      suggested_stock: p.suggestedStock ?? 0,
      active: p.active ?? true,
    } as any).select().single();

    if (error) {
      setProducts((prev) => prev.filter((x) => x.id !== tempId));
    } else if (data) {
      setProducts((prev) => prev.map((x) => x.id === tempId ? { ...x, id: data.id, createdAt: data.created_at } : x));
    }
    invalidateProducts();
  }, [user, dataOwnerId, invalidateProducts]);

  const updateProduct = useCallback(async (id: string, data: Partial<Omit<Product, "id" | "createdAt">>) => {
    assertWritable();
    if (!user) return;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.cost !== undefined) updateData.cost = data.cost;
    if (data.stock !== undefined) updateData.stock = data.stock;
    if (data.lastPurchasePrice !== undefined) updateData.last_purchase_price = data.lastPurchasePrice;
    if (data.suggestedStock !== undefined) updateData.suggested_stock = data.suggestedStock;
    if (data.active !== undefined) updateData.active = data.active;
    await supabase.from("products").update(updateData as any).eq("id", id);
    invalidateProducts();
  }, [user, invalidateProducts]);

  const deleteProduct = useCallback(async (id: string) => {
    assertWritable();
    if (!user) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    // Mantém as vendas associadas; o FK no banco agora é ON DELETE SET NULL,
    // então o product_id da venda fica nulo, mas o histórico de venda é preservado.
    setSales((prev) => prev.map((s) => (s.productId === id ? { ...s, productId: undefined } : s)));
    await supabase.from("products").delete().eq("id", id);
    invalidateProducts();
    invalidateSales();
  }, [user, invalidateProducts, invalidateSales]);


  const addSale = useCallback(async (s: Omit<Sale, "id">) => {
    assertWritable();
    if (!user || !dataOwnerId) return;

    // Bloqueio: produto sem estoque suficiente
    if (s.productId) {
      const product = products.find((p) => p.id === s.productId);
      if (product && product.stock <= 0) {
        const { toast } = await import("sonner");
        toast.error(`"${product.name}" está sem estoque. Registre uma entrada ou compra antes de vender.`);
        return;
      }
      if (product && s.quantity > product.stock) {
        const { toast } = await import("sonner");
        toast.error(`Estoque insuficiente de "${product.name}" (disponível: ${product.stock}).`);
        return;
      }
    }

    const tempId = crypto.randomUUID();
    setSales((prev) => [{ ...s, id: tempId }, ...prev]);

    if (s.productId) {
      const product = products.find((p) => p.id === s.productId);
      if (product) {
        const newStock = Math.max(0, product.stock - s.quantity);
        setProducts((prev) => prev.map((p) => (p.id === s.productId ? { ...p, stock: newStock } : p)));
      }
    }

    const { data, error } = await supabase.from("sales").insert({
      user_id: dataOwnerId,
      product_id: s.productId || null,
      quantity: s.quantity,
      total: s.total,
      sale_date: s.date,
      description: s.description,
      business_type: s.businessType,
      payment_mode: s.paymentMode || "fixa",
      installments: s.installments || 1,
      paid_installments: s.paidInstallments || 0,
      customer_name: s.customerName || "",
      frequency: s.frequency || "Mensal",
      installment_value: s.installmentValue || null,
      installment_amounts: s.installmentAmounts || null,
      installment_dates: s.installmentDates || null,
      locador_id: s.locadorId || null,
      notes: s.notes || "",
      category: s.category || null,
      payment_history: s.paymentHistory ?? null,
    } as any).select().single();

    if (error) {
      setSales((prev) => prev.filter((x) => x.id !== tempId));
      if (s.productId) {
        const product = products.find((p) => p.id === s.productId);
        if (product) {
          setProducts((prev) => prev.map((p) => (p.id === s.productId ? { ...p, stock: product.stock } : p)));
        }
      }
    } else if (data) {
      setSales((prev) => prev.map((x) => x.id === tempId ? { ...x, id: data.id } : x));
      if (s.productId) {
        const product = products.find((p) => p.id === s.productId);
        if (product) {
          // Decremento atômico (lock FOR UPDATE + validação server-side).
          // Fallback dual-write se a RPC ainda não estiver publicada.
          const { error: rpcErr } = await supabase.rpc("decrement_stock_atomic" as any, {
            p_product_id: s.productId,
            p_owner_id: dataOwnerId,
            p_user_id: user.id,
            p_quantity: s.quantity,
            p_sale_id: data.id,
            p_notes: null,
            p_total_value: s.total ?? null,
          });
          if (rpcErr) {
            const msg = String(rpcErr.message || "");
            const fnMissing = /decrement_stock_atomic|function .* does not exist|PGRST202/i.test(msg);
            if (fnMissing) {
              const newStock = Math.max(0, product.stock - s.quantity);
              await supabase.from("products").update({ stock: newStock }).eq("id", s.productId);
              await supabase.from("stock_movements" as any).insert({
                owner_id: dataOwnerId,
                user_id: user.id,
                product_id: s.productId,
                product_name: product.name,
                movement_type: "venda",
                quantity: -s.quantity,
                total_value: s.total ?? null,
                sale_id: data.id,
              } as any);
            } else {
              console.error("[addSale] decrement_stock_atomic failed:", rpcErr);
              const { toast } = await import("sonner");
              toast.error(msg || "Falha ao atualizar estoque");
            }
          }
        }
      }
    }
    invalidateSales();
    invalidateProducts();
  }, [user, dataOwnerId, products, invalidateSales, invalidateProducts]);


  const updateSale = useCallback(async (id: string, data: Partial<Omit<Sale, "id">>) => {
    assertWritable();
    if (!user) return;
    const sale = sales.find(s => s.id === id);


    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    const updateData: Record<string, any> = {};
    if (data.description !== undefined) updateData.description = data.description;
    if (data.customerName !== undefined) updateData.customer_name = data.customerName;
    if (data.total !== undefined) updateData.total = data.total;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.installments !== undefined) updateData.installments = data.installments;
    if (data.paidInstallments !== undefined) updateData.paid_installments = data.paidInstallments;
    if (data.paymentMode !== undefined) updateData.payment_mode = data.paymentMode;
    if (data.businessType !== undefined) updateData.business_type = data.businessType;
    if (data.notes !== undefined) updateData.notes = data.notes || "";
    if (data.date !== undefined) updateData.sale_date = data.date;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.installmentValue !== undefined) updateData.installment_value = data.installmentValue;
    if (data.installmentAmounts !== undefined) updateData.installment_amounts = data.installmentAmounts;
    if (data.installmentDates !== undefined) updateData.installment_dates = data.installmentDates;
    if (data.partialPaid !== undefined) updateData.partial_paid = data.partialPaid;
    if (data.paymentHistory !== undefined) updateData.payment_history = data.paymentHistory;
    if (data.locadorId !== undefined) updateData.locador_id = data.locadorId;
    if (data.category !== undefined) updateData.category = data.category;
    await supabase.from("sales").update(updateData as any).eq("id", id);
    invalidateSales();
  }, [user, sales, invalidateSales]);

  const deleteSale = useCallback(async (id: string) => {
    assertWritable();
    if (!user) return;
    const sale = sales.find((s) => s.id === id);
    setSales((prev) => prev.filter((s) => s.id !== id));

    if (sale) {
      if (sale.productId) {
        const product = products.find((p) => p.id === sale.productId);
        if (product) {
          const newStock = product.stock + sale.quantity;
          setProducts((prev) => prev.map((p) => (p.id === sale.productId ? { ...p, stock: newStock } : p)));
          await supabase.from("products").update({ stock: newStock }).eq("id", sale.productId);
        }
      }
    }
    await supabase.from("sales").delete().eq("id", id);
    invalidateSales();
    invalidateProducts();
  }, [user, sales, products, invalidateSales, invalidateProducts]);

  return { products, sales, loading, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale };
}
