import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwner } from "@/hooks/useDataOwner";
import {
  DEFAULT_WHATSAPP_MESSAGES,
  type WhatsappBillingMessages,
} from "@/lib/whatsappBilling";

export function useWhatsappBillingMessages() {
  const { user } = useAuth();
  const ownerId = useDataOwner();
  const [messages, setMessages] = useState<WhatsappBillingMessages>(DEFAULT_WHATSAPP_MESSAGES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !ownerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("whatsapp_billing_messages" as any)
        .select("message_upcoming, message_due_today, message_overdue")
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setMessages({
          message_upcoming: (data as any).message_upcoming ?? DEFAULT_WHATSAPP_MESSAGES.message_upcoming,
          message_due_today: (data as any).message_due_today ?? DEFAULT_WHATSAPP_MESSAGES.message_due_today,
          message_overdue: (data as any).message_overdue ?? DEFAULT_WHATSAPP_MESSAGES.message_overdue,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, ownerId]);

  const save = useCallback(
    async (updates: Partial<WhatsappBillingMessages>) => {
      if (!ownerId) return { error: new Error("Sem dono de dados") } as const;
      const next = { ...messages, ...updates };
      setMessages(next);
      const { error } = await supabase
        .from("whatsapp_billing_messages" as any)
        .upsert(
          {
            owner_id: ownerId,
            message_upcoming: next.message_upcoming,
            message_due_today: next.message_due_today,
            message_overdue: next.message_overdue,
          },
          { onConflict: "owner_id" },
        );
      return { error } as const;
    },
    [ownerId, messages],
  );

  return { messages, loading, save };
}
