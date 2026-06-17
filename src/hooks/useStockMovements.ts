import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { assertWritable } from "@/lib/readOnlyState";

export type StockMovementType = "entrada_manual" | "compra" | "venda" | "ajuste";

export interface StockMovement {
  id: string;
  productId: string | null;
  productName: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number | null;
  totalValue: number | null;
  expenseId: string | null;
  saleId: string | null;
  notes: string | null;
  createdAt: string;
}

const mapRow = (r: any): StockMovement => ({
  id: r.id,
  productId: r.product_id,
  productName: r.product_name,
  type: r.movement_type,
  quantity: r.quantity,
  unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
  totalValue: r.total_value != null ? Number(r.total_value) : null,
  expenseId: r.expense_id,
  saleId: r.sale_id,
  notes: r.notes,
  createdAt: r.created_at,
});

export function useStockMovements(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from("stock_movements" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setMovements((data as any[]).map(mapRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user || !enabled) return;
    setLoading(true);
    fetchData();
  }, [user, enabled, fetchData]);

  useEffect(() => {
    if (!user || !enabled) return;
    const channel = supabase
      .channel(`stock-movements-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, enabled, fetchData]);

  const recordMovement = useCallback(async (input: {
    productId: string | null;
    productName: string;
    type: StockMovementType;
    quantity: number;
    unitCost?: number | null;
    totalValue?: number | null;
    expenseId?: string | null;
    saleId?: string | null;
    notes?: string | null;
  }) => {
    if (!user || !dataOwnerId) return null;
    const { data, error } = await supabase.from("stock_movements" as any).insert({
      owner_id: dataOwnerId,
      user_id: user.id,
      product_id: input.productId,
      product_name: input.productName,
      movement_type: input.type,
      quantity: input.quantity,
      unit_cost: input.unitCost ?? null,
      total_value: input.totalValue ?? null,
      expense_id: input.expenseId ?? null,
      sale_id: input.saleId ?? null,
      notes: input.notes ?? null,
    } as any).select().single();
    if (error || !data) return null;
    return mapRow(data);
  }, [user, dataOwnerId]);

  const deleteMovement = useCallback(async (id: string) => {
    const { error } = await supabase.from("stock_movements" as any).delete().eq("id", id);
    if (!error) setMovements((prev) => prev.filter((m) => m.id !== id));
    return !error;
  }, []);

  return { movements, loading, recordMovement, deleteMovement };
}
