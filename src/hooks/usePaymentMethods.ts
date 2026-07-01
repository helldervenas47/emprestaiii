import { useCallback, useEffect, useState } from "react";

const seedingInFlight = new Set<string>();
const seededOwners = new Set<string>();
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";

const PAYMENT_METHOD_COLUMNS = "id, name, icon, active, sort_order, kind";

export type PaymentMethodKind = "account" | "cash";

export interface PaymentMethod {
  id: string;
  name: string;
  icon: string | null;
  active: boolean;
  sortOrder: number;
  kind: PaymentMethodKind;
}

function rowToMethod(r: any): PaymentMethod {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon ?? null,
    active: !!r.active,
    sortOrder: r.sort_order ?? 0,
    kind: (r.kind as PaymentMethodKind) ?? "account",
  };
}

export function usePaymentMethods(enabled = true) {
  const { user, dataOwnerId } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMethods = useCallback(async () => {
    assertWritable();
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_methods" as any)
      .select(PAYMENT_METHOD_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (!error && data) {
      let rows = data as any[];
      // Seed defaults for new users (only when this user owns the data)
      if (
        rows.length === 0 &&
        dataOwnerId &&
        dataOwnerId === user.id &&
        !seededOwners.has(dataOwnerId) &&
        !seedingInFlight.has(dataOwnerId)
      ) {
        seedingInFlight.add(dataOwnerId);
        try {
          // Re-check inside the lock to avoid double seeding across tabs/renders
          const { data: recheck } = await supabase
            .from("payment_methods" as any)
            .select("id")
            .eq("user_id", dataOwnerId)
            .limit(1);
          if (!recheck || recheck.length === 0) {
            const defaults = [
              { name: "Pix", kind: "account", active: true, sort_order: 1 },
              { name: "Dinheiro", kind: "cash", active: true, sort_order: 2 },
              { name: "Transferência", kind: "account", active: false, sort_order: 3 },
              { name: "Cartão", kind: "account", active: false, sort_order: 4 },
              { name: "Boleto", kind: "account", active: false, sort_order: 5 },
            ].map((m) => ({ ...m, user_id: dataOwnerId, icon: null }));
            const { data: inserted, error: insErr } = await supabase
              .from("payment_methods" as any)
              .insert(defaults as any)
              .select("*");
            if (!insErr && inserted) rows = inserted as any[];
          } else {
            const { data: refetched } = await supabase
              .from("payment_methods" as any)
              .select("*")
              .order("sort_order", { ascending: true })
              .order("name", { ascending: true });
            if (refetched) rows = refetched as any[];
          }
          seededOwners.add(dataOwnerId);
        } finally {
          seedingInFlight.delete(dataOwnerId);
        }
      }
      setMethods(rows.map(rowToMethod));
    }
    setLoading(false);
  }, [user, dataOwnerId]);

  useEffect(() => {
    if (enabled) fetchMethods();
  }, [enabled, fetchMethods]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`payment-methods-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_methods" }, () => {
        fetchMethods();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMethods]);

  const add = useCallback(
    async (name: string, icon?: string, kind: PaymentMethodKind = "account") => {
      assertWritable();
      if (!user || !dataOwnerId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const nextOrder = methods.length > 0 ? Math.max(...methods.map((m) => m.sortOrder)) + 1 : 1;
      const { error } = await supabase.from("payment_methods" as any).insert({
        user_id: dataOwnerId,
        name: trimmed,
        icon: icon || null,
        sort_order: nextOrder,
        active: true,
        kind,
      } as any);
      if (error) {
        toast.error("Erro ao criar forma de pagamento");
        return;
      }
      toast.success("Forma de pagamento criada");
      fetchMethods();
    },
    [user, dataOwnerId, methods, fetchMethods],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Pick<PaymentMethod, "name" | "icon" | "active" | "sortOrder" | "kind">>) => {
      assertWritable();
      const updateData: any = {};
      if (patch.name !== undefined) updateData.name = patch.name.trim();
      if (patch.icon !== undefined) updateData.icon = patch.icon || null;
      if (patch.active !== undefined) updateData.active = patch.active;
      if (patch.sortOrder !== undefined) updateData.sort_order = patch.sortOrder;
      if (patch.kind !== undefined) updateData.kind = patch.kind;
      const { error } = await supabase.from("payment_methods" as any).update(updateData).eq("id", id);
      if (error) {
        toast.error("Erro ao atualizar forma de pagamento");
        return;
      }
      fetchMethods();
    },
    [fetchMethods],
  );

  const remove = useCallback(
    async (id: string) => {
      assertWritable();
      const { error } = await supabase.from("payment_methods" as any).delete().eq("id", id);
      if (error) {
        toast.error("Erro ao excluir forma de pagamento");
        return;
      }
      toast.success("Forma de pagamento excluída");
      fetchMethods();
    },
    [fetchMethods],
  );

  return { methods, activeMethods: methods.filter((m) => m.active), loading, add, update, remove, refetch: fetchMethods };
}
