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
  cardId: r.card_id ?? r.credit_card_id,
  cycleKey: r.cycle_key ?? r.month_label,
  openingAmount: Number(r.opening_amount ?? r.opening_balance ?? 0),
  notes: r.notes ?? null,
});

const ledgerKey = (cardId: string, cycleKey: string) => `${cardId}::${cycleKey}`;

function buildLedgerNotes(base: string | null | undefined, paid: number, paidDate: string, isFull: boolean) {
  const cleaned = (base ?? "")
    .replace(/\[PAGA\]/gi, "")
    .replace(/\[LEDGER\]/gi, "")
    .replace(/\[PAID_DATE:\d{4}-\d{2}-\d{2}\]/gi, "")
    .replace(/\[PAID:[0-9]+(?:\.[0-9]+)?\]/gi, "")
    .replace(/\[TOTAL:[0-9]+(?:\.[0-9]+)?\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const markers = [
    isFull ? `[TOTAL:${paid.toFixed(2)}]` : null,
    `[PAID:${paid.toFixed(2)}]`,
    isFull ? "[PAGA]" : null,
    "[LEDGER]",
    `[PAID_DATE:${paidDate}]`,
  ].filter(Boolean).join(" ");
  return `${cleaned ? `${cleaned} ` : ""}${markers}`.trim();
}

/**
 * Builds a stable cycle key from a "to" closing date (end of cycle).
 * Format: YYYY-MM (year-month of the cycle's closing date).
 */
export function cycleKeyFromDate(closingTo: Date): string {
  const y = closingTo.getFullYear();
  const m = String(closingTo.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// BUGFIX: useCreditCardOpenings() é chamado de forma independente em ~11
// componentes (CreditCardInvoice, CreditCardList, IncomeBalanceCard, etc),
// cada um com seu próprio useState<openings>. Antes desta correção, um
// upsertOpening()/deleteOpening() feito em uma instância (ex: dentro do
// modal de pagamento) não tinha como avisar as outras instâncias (ex: a
// lista de cartões), que continuavam exibindo dados antigos até um reload
// manual da página — mesmo com o pagamento já gravado no banco.
//
// Solução: seguir o mesmo padrão de invalidação por evento global que já
// existe para o extrato (`ledger:changed` / `balance:changed`). Toda
// escrita dispara `openings:changed`; todas as instâncias do hook escutam
// esse evento e recarregam.
const OPENINGS_CHANGED_EVENT = "openings:changed";

function notifyOpeningsChanged() {
  window.dispatchEvent(new Event(OPENINGS_CHANGED_EVENT));
}

export function useCreditCardOpenings() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [openings, setOpenings] = useState<InvoiceOpening[]>([]);
  const [loading, setLoading] = useState(true);
  const [ledgerPayments, setLedgerPayments] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!ownerId) return;
    const [{ data, error }, { data: ledgerRows, error: ledgerError }] = await Promise.all([
      supabase.from("credit_card_invoice_openings").select("*"),
      supabase
        .from("account_ledger")
        .select("amount, metadata")
        .eq("user_id", ownerId)
        .eq("direction", "out")
        .eq("metadata->>kind", "credit_card_invoice_payment"),
    ]);
    if (error) {
      toast.error("Erro ao carregar faturas iniciais");
      setLoading(false);
      return;
    }
    const ledgerByCycle: Record<string, number> = {};
    if (!ledgerError) {
      for (const r of ((ledgerRows as any[]) ?? [])) {
        const meta = r.metadata ?? {};
        if (!meta.credit_card_id || !meta.cycle_key) continue;
        const key = ledgerKey(String(meta.credit_card_id), String(meta.cycle_key));
        ledgerByCycle[key] = Number(((ledgerByCycle[key] ?? 0) + (Number(r.amount) || 0)).toFixed(2));
      }
    }
    setLedgerPayments(ledgerByCycle);
    const normalized = (data ?? []).map(fromRow);
    const existingKeys = new Set(normalized.map((o) => ledgerKey(o.cardId, o.cycleKey)));
    const syntheticFromLedger = Object.entries(ledgerByCycle)
      .filter(([key, paid]) => paid > 0.005 && !existingKeys.has(key))
      .map(([key, paid]) => {
        const [cardId, cycleKey] = key.split("::");
        return {
          id: `ledger-${key}`,
          cardId,
          cycleKey,
          openingAmount: 0,
          notes: buildLedgerNotes(null, paid, new Date().toISOString().slice(0, 10), true),
        };
      });
    setOpenings([...normalized, ...syntheticFromLedger]);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (user && ownerId) load();
  }, [user, ownerId, load]);

  // Re-sincroniza esta instância sempre que QUALQUER outra instância do
  // hook (em qualquer componente) gravar uma alteração.
  useEffect(() => {
    if (!user || !ownerId) return;
    const handler = () => load();
    window.addEventListener(OPENINGS_CHANGED_EVENT, handler);
    window.addEventListener("ledger:changed", handler);
    return () => {
      window.removeEventListener(OPENINGS_CHANGED_EVENT, handler);
      window.removeEventListener("ledger:changed", handler);
    };
  }, [user, ownerId, load]);

  /** Get the opening for a specific card+cycle, or null. */
  const getOpening = useCallback(
    (cardId: string, cycleKey: string): InvoiceOpening | null => {
      const opening = openings.find((o) => o.cardId === cardId && o.cycleKey === cycleKey) ?? null;
      const ledgerPaid = ledgerPayments[ledgerKey(cardId, cycleKey)] ?? 0;
      if (ledgerPaid <= 0.005) return opening;
      const currentPaid = (() => {
        const match = /\[PAID:([0-9]+(?:\.[0-9]+)?)\]/i.exec(opening?.notes ?? "");
        return match ? Number(match[1]) : 0;
      })();
      if (opening && currentPaid >= ledgerPaid - 0.005) return opening;
      return {
        id: opening?.id ?? `ledger-${cardId}-${cycleKey}`,
        cardId,
        cycleKey,
        openingAmount: opening?.openingAmount ?? 0,
        notes: buildLedgerNotes(opening?.notes, ledgerPaid, new Date().toISOString().slice(0, 10), true),
      };
    },
    [openings, ledgerPayments],
  );

  /** Insert or update an opening for a given card+cycle. */
  const upsertOpening = async (cardId: string, cycleKey: string, amount: number, notes?: string) => {
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
        { onConflict: "card_id,cycle_key" },
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
        return prev.map((o) => (o.cardId === cardId && o.cycleKey === cycleKey ? fromRow(data) : o));
      }
      return [...prev, fromRow(data)];
    });
    toast.success("Fatura inicial registrada");
    // Avisa todas as outras instâncias do hook (outras telas/componentes)
    // para recarregarem e refletirem este pagamento/atualização.
    notifyOpeningsChanged();
  };

  const deleteOpening = async (id: string) => {
    assertWritable();
    const { error } = await supabase.from("credit_card_invoice_openings").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover fatura inicial");
      return;
    }
    setOpenings((prev) => prev.filter((o) => o.id !== id));
    toast.success("Fatura inicial removida");
    notifyOpeningsChanged();
  };

  return { openings, loading, getOpening, upsertOpening, deleteOpening };
}
