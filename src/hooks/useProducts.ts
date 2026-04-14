import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Product, Sale, BusinessType, SalePaymentRecord } from "@/types/loan";
import { useAuth } from "@/hooks/useAuth";
import { adjustBalance } from "@/lib/balance";

export function useProducts() {
  const { user, dataOwnerId } = useAuth();
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
        })));
      }
      setLoading(false);
    };
    fetchData();
  }, [user]);

  // Realtime subscriptions for products and sales
  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
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
        })));
      }
    };
    const channel = supabase
      .channel('products-sales-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => { fetchData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const addProduct = useCallback(async (p: Omit<Product, "id" | "createdAt">) => {
    if (!user || !dataOwnerId) return;
    const tempId = crypto.randomUUID();
    setProducts((prev) => [{ ...p, id: tempId, createdAt: new Date().toISOString() }, ...prev]);

    const { data, error } = await supabase.from("products").insert({
      user_id: dataOwnerId, name: p.name, description: p.description, price: p.price, cost: 0, stock: p.stock,
    }).select().single();

    if (error) {
      setProducts((prev) => prev.filter((x) => x.id !== tempId));
    } else if (data) {
      setProducts((prev) => prev.map((x) => x.id === tempId ? { ...x, id: data.id, createdAt: data.created_at } : x));
    }
  }, [user, dataOwnerId]);

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
    if (!user || !dataOwnerId) return;
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
          const newStock = Math.max(0, product.stock - s.quantity);
          await supabase.from("products").update({ stock: newStock }).eq("id", s.productId);
        }
      }
    }
  }, [user, dataOwnerId, products]);

  const updateSale = useCallback(async (id: string, data: Partial<Omit<Sale, "id">>) => {
    if (!user) return;
    const sale = sales.find(s => s.id === id);

    // Adjust balance when payments change (non-vehicle sales only)
    if (data.paidInstallments !== undefined && data.paidInstallments !== sale.paidInstallments) {
      const amounts = sale.installmentAmounts;
      const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - ((sale as any).downPayment || 0)) / sale.installments : sale.total;

      if (data.paidInstallments !== undefined && data.paidInstallments !== sale.paidInstallments) {
        if (data.paidInstallments > sale.paidInstallments) {
          const paidIdx = sale.paidInstallments;
          const paidValue = amounts && amounts[paidIdx] != null ? amounts[paidIdx] : defaultVal;
          const actualPaid = Math.max(0, paidValue - (data.partialPaid !== undefined ? 0 : (sale.partialPaid || 0)));
          await adjustBalance(actualPaid);
        } else {
          let refundTotal = 0;
          for (let i = data.paidInstallments; i < sale.paidInstallments; i++) {
            refundTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
          }
          await adjustBalance(-refundTotal);
        }
      }

      if (data.partialPaid !== undefined && data.paidInstallments === undefined) {
        const addedPartial = (data.partialPaid || 0) - (sale.partialPaid || 0);
        if (addedPartial !== 0) {
          await adjustBalance(addedPartial);
        }
      }
    }

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
    await supabase.from("sales").update(updateData as any).eq("id", id);
  }, [user, sales]);

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
      // Only reverse the paid amount from balance (not the total)
      if (sale.businessType !== "veiculo" && sale.paidInstallments > 0) {
        const amounts = sale.installmentAmounts;
        const defaultVal = sale.installments > 0 ? Math.max(0, sale.total - ((sale as any).downPayment || 0)) / sale.installments : sale.total;
        let paidTotal = 0;
        for (let i = 0; i < sale.paidInstallments; i++) {
          paidTotal += amounts && amounts[i] != null ? amounts[i] : defaultVal;
        }
        paidTotal += sale.partialPaid || 0;
        if (paidTotal > 0) await adjustBalance(-paidTotal);
      }
    }
    await supabase.from("sales").delete().eq("id", id);
  }, [user, sales, products]);

  return { products, sales, loading, addProduct, updateProduct, deleteProduct, addSale, updateSale, deleteSale };
}
