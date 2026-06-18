import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import { toast } from "sonner";
import { assertWritable } from "@/lib/readOnlyState";

export interface InvoiceOpening {
  id: string;
  cardId: string;
  cycleKey: string;
  openingAmount: number;
  notes: string | null;
}

const fromRow = (r: any): InvoiceOpening => ({
  id: r.id,
  cardId: r.card_id,
  cycleKey: r.cycle_key,
  openingAmount: Number(r.opening_amount ?? 0),
  notes: r.notes ?? null,
});

/**
 * Builds a stable cycle key from a "to" closing date (end of cycle).
 * Format: YYYY-MM (year-month of the cycle's closing date).
 */
export function cycleKeyFromDate(closingTo: Date): string {
  const y = closingTo.getFullYear();
  const m = String(closingTo.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function useCreditCardOpenings() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [openings, setOpenings] = useState<InvoiceOpening[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("credit_card_invoice_openings")
      .select("*");
    if (error) {
      toast.error("Erro ao carregar faturas iniciais");
      setLoading(false);
      return;
    }
    setOpenings((data ?? []).map(fromRow));
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (user && ownerId) load();
  }, [user, ownerId, load]);

  /** Get the opening for a specific card+cycle, or null. */
  const getOpening = useCallback(
    (cardId: string, cycleKey: string): InvoiceOpening | null => {
      return openings.find((o) => o.cardId === cardId && o.cycleKey === cycleKey) ?? null;
    },
    [openings]
  );

  /** Insert or update an opening for a given card+cycle. */
  const upsertOpening = async (
    cardId: string,
    cycleKey: string,
    amount: number,
    notes?: string
  ) => {
    assertWritable();
    if (!ownerId) return;
    const { data, error } = await supabase
      .from("credit_card_invoice_openings")
      .upsert(
        {
          user_id: user?.id || ownerId,
          card_id: cardId,
          credit_card_id: cardId,
          cycle_key: cycleKey,
          month_label: cycleKey,
          opening_amount: amount,
          opening_balance: amount,
          notes: notes ?? null,
        },
        { onConflict: "card_id,cycle_key" }
      )
      .select()
      .single();
    if (error) {
      toast.error("Erro ao salvar fatura inicial");
      return;
    }
    setOpenings((prev) => {
      const exists = prev.some((o) => o.cardId === cardId && o.cycleKey === cycleKey);
      if (exists) {
        return prev.map((o) =>
          o.cardId === cardId && o.cycleKey === cycleKey ? fromRow(data) : o
        );
      }
      return [...prev, fromRow(data)];
    });
    toast.success("Fatura inicial registrada");
  };

  const deleteOpening = async (id: string) => {
    assertWritable();
    const { error } = await supabase
      .from("credit_card_invoice_openings")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Erro ao remover fatura inicial");
      return;
    }
    setOpenings((prev) => prev.filter((o) => o.id !== id));
    toast.success("Fatura inicial removida");
  };

  return { openings, loading, getOpening, upsertOpening, deleteOpening };
}
