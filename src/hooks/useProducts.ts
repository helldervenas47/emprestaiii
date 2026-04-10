import { useState, useCallback } from "react";
import { Product, Sale } from "@/types/loan";
import { adjustBalance } from "@/lib/balance";

const PRODUCTS_KEY = "products_data";
const SALES_KEY = "sales_data";

function load<T>(key: string): T[] {
  try {
    const d = localStorage.getItem(key);
    return d ? JSON.parse(d) : [];
  } catch { return []; }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>(() => load<Product>(PRODUCTS_KEY));
  const [sales, setSales] = useState<Sale[]>(() => load<Sale>(SALES_KEY));

  const addProduct = useCallback((p: Omit<Product, "id" | "createdAt">) => {
    const np: Product = { ...p, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    setProducts((prev) => { const u = [...prev, np]; save(PRODUCTS_KEY, u); return u; });
  }, []);

  const updateProduct = useCallback((id: string, data: Partial<Omit<Product, "id" | "createdAt">>) => {
    setProducts((prev) => { const u = prev.map((p) => (p.id === id ? { ...p, ...data } : p)); save(PRODUCTS_KEY, u); return u; });
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => { const u = prev.filter((p) => p.id !== id); save(PRODUCTS_KEY, u); return u; });
  }, []);

  const addSale = useCallback((s: Omit<Sale, "id">) => {
    const ns: Sale = { ...s, id: crypto.randomUUID() };
    setSales((prev) => { const u = [...prev, ns]; save(SALES_KEY, u); return u; });
    setProducts((prev) => {
      const u = prev.map((p) => (p.id === s.productId ? { ...p, stock: Math.max(0, p.stock - s.quantity) } : p));
      save(PRODUCTS_KEY, u);
      return u;
    });
    // Sale = money in
    adjustBalance(s.total);
  }, []);

  const deleteSale = useCallback((id: string) => {
    setSales((prev) => {
      const sale = prev.find((s) => s.id === id);
      if (sale) {
        // Reverse balance
        adjustBalance(-sale.total);
        // Restore stock
        setProducts((pp) => {
          const u = pp.map((p) => (p.id === sale.productId ? { ...p, stock: p.stock + sale.quantity } : p));
          save(PRODUCTS_KEY, u);
          return u;
        });
      }
      const u = prev.filter((s) => s.id !== id);
      save(SALES_KEY, u);
      return u;
    });
  }, []);

  return { products, sales, addProduct, updateProduct, deleteProduct, addSale, deleteSale };
}
