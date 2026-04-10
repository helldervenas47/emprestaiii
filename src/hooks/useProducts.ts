import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Product, Sale } from "@/types/loan";
import { useAuth } from "@/hooks/useAuth";
import { adjustBalance } from "@/lib/balance";

export function useProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Load products from Supabase
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
          id: p.id,
          name: p.name,
          description: p.description || "",
          price: Number(p.price),
          stock: p.stock,
          active: true,
          createdAt: p.created_at,
        })));
      }

      if (salesRes.data) {
        // We need product names for display
        const prodMap = new Map((prodRes.data || []).map((p) => [p.id, p.name]));
        setSales(salesRes.data.map((s) => ({
          id: s.id,
          productId: s.product_id,
          productName: prodMap.get(s.product_id) || "Produto removido",
          quantity: s.quantity,
          unitPrice: 0,
          total: Number(s.total),
          customerName: "",
          date: s.sale_date,
        })));
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const addProduct = useCallback(async (p: Omit<Product, "id" | "createdAt">) => {
    if (!user) return;
    const { data, error } = await supabase.from("products").insert({
      user_id: user.id,
      name: p.name,
      description: p.description,
      price: p.price,
      cost: 0,
      stock: p.stock,
    }).select().single();
    if (data && !error) {
      setProducts((prev) => [{
        id: data.id, name: data.name, description: data.description || "",
        price: Number(data.price), stock: data.stock, active: true, createdAt: data.created_at,
      }, ...prev]);
    }
  }, [user]);

  const updateProduct = useCallback(async (id: string, data: Partial<Omit<Product, "id" | "createdAt">>) => {
    if (!user) return;
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.price !== undefined) updateData.price = data.price;
    if (data.stock !== undefined) updateData.stock = data.stock;

    await supabase.from("products").update(updateData).eq("id", id);
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  }, [user]);

  const deleteProduct = useCallback(async (id: string) => {
    if (!user) return;
    await supabase.from("products").delete().eq("id", id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setSales((prev) => prev.filter((s) => s.productId !== id));
  }, [user]);

  const addSale = useCallback(async (s: Omit<Sale, "id">) => {
    if (!user) return;
    const { data, error } = await supabase.from("sales").insert({
      user_id: user.id,
      product_id: s.productId,
      quantity: s.quantity,
      total: s.total,
      sale_date: s.date,
    }).select().single();

    if (data && !error) {
      setSales((prev) => [{
        id: data.id, productId: data.product_id, productName: s.productName,
        quantity: data.quantity, unitPrice: s.unitPrice, total: Number(data.total),
        customerName: s.customerName, date: data.sale_date,
      }, ...prev]);

      // Update stock in DB
      const product = products.find((p) => p.id === s.productId);
      if (product) {
        const newStock = Math.max(0, product.stock - s.quantity);
        await supabase.from("products").update({ stock: newStock }).eq("id", s.productId);
        setProducts((prev) => prev.map((p) => (p.id === s.productId ? { ...p, stock: newStock } : p)));
      }
      adjustBalance(s.total);
    }
  }, [user, products]);

  const deleteSale = useCallback(async (id: string) => {
    if (!user) return;
    const sale = sales.find((s) => s.id === id);
    if (sale) {
      adjustBalance(-sale.total);
      const product = products.find((p) => p.id === sale.productId);
      if (product) {
        const newStock = product.stock + sale.quantity;
        await supabase.from("products").update({ stock: newStock }).eq("id", sale.productId);
        setProducts((prev) => prev.map((p) => (p.id === sale.productId ? { ...p, stock: newStock } : p)));
      }
    }
    await supabase.from("sales").delete().eq("id", id);
    setSales((prev) => prev.filter((s) => s.id !== id));
  }, [user, sales, products]);

  return { products, sales, loading, addProduct, updateProduct, deleteProduct, addSale, deleteSale };
}
