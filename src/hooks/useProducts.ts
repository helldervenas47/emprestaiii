import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Product, Sale, BusinessType } from "@/types/loan";
import { useAuth } from "@/hooks/useAuth";
import { adjustBalance } from "@/lib/balance";

export function useProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      const [prodRes, salesRes] = await Promise.all([
        supabase.from("products").select("*").order("created_at", { ascending: false }),
        supabase.from("sales").select("*").order("created_at", { ascending: false }),
      ]);

      if (prodRes.data) {
        setProducts(prodRes.data.map((p) => ({
          id: p.id, name: p.name, description: p.description || "",
          price: Number(p.price), stock: p.stock, active: true, createdAt: p.created_at,
        })));
      }

      if (salesRes.data) {
        const prodMap = new Map((prodRes.data || []).map((p) => [p.id, p.name]));
        setSales(salesRes.data.map((s) => ({
          id: s.id,
          productId: s.product_id || undefined,
          productName: s.product_id ? (prodMap.get(s.product_id) || "Produto removido") : (s.description || ""),
          description: s.description || "",
          quantity: s.quantity,
          unitPrice: 0,
          total: Number(s.total),
          customerName: "",
          date: s.sale_date,
          businessType: (s.business_type as BusinessType) || "venda",
          paymentMode: ((s as any).payment_mode || "fixa") as "fixa" | "recorrente",
          installments: (s as any).installments || 1,
          paidInstallments: (s as any).paid_installments || 0,
        })));
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const addProduct = useCallback(async (p: Omit<Product, "id" | "createdAt">) => {
    if (!user) return;
    const tempId = crypto.randomUUID();
    setProducts((prev) => [{ ...p, id: tempId, createdAt: new Date().toISOString() }, ...prev]);

    const { data, error } = await supabase.from("products").insert({
      user_id: user.id, name: p.name, description: p.description, price: p.price, cost: 0, stock: p.stock,
    }).select().single();

    if (error) {
      setProducts((prev) => prev.filter((x) => x.id !== tempId));
    } else if (data) {
      setProducts((prev) => prev.map((x) => x.id === tempId ? { ...x, id: data.id, createdAt: data.created_at } : x));
    }
  }, [user]);

  const updateProduct = useCallback(async (id: string, data: Partial<Omit<Product, "id" | "createdAt">>) => {
    if (!user) return;
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
    const updateData: { name?: string; description?: string; price?: number; stock?: number } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.stock !== undefined) updateData.stock = data.stock;
    await supabase.from("products").update(updateData).eq("id", id);
  }, [user]);

  const deleteProduct = useCallback(async (id: string) => {
    if (!user) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setSales((prev) => prev.filter((s) => s.productId !== id));
    await supabase.from("products").delete().eq("id", id);
  }, [user]);

  const addSale = useCallback(async (s: Omit<Sale, "id">) => {
    if (!user) return;
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
      user_id: user.id,
      product_id: s.productId || null,
      quantity: s.quantity,
      total: s.total,
      sale_date: s.date,
      description: s.description,
      business_type: s.businessType,
    }).select().single();

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
          const newStock = Math.max(0, product.stock - s.quantity);
          await supabase.from("products").update({ stock: newStock }).eq("id", s.productId);
        }
      }
      await adjustBalance(s.total);
    }
  }, [user, products]);

  const deleteSale = useCallback(async (id: string) => {
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
      await adjustBalance(-sale.total);
    }
    await supabase.from("sales").delete().eq("id", id);
  }, [user, sales, products]);

  return { products, sales, loading, addProduct, updateProduct, deleteProduct, addSale, deleteSale };
}
