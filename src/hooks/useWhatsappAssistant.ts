import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AssistantNumber = {
  id: string;
  owner_id: string;
  phone: string;
  label: string | null;
  enabled: boolean;
  created_at: string;
};

export function useWhatsappAssistant() {
  const { user, dataOwnerId } = useAuth();
  const [numbers, setNumbers] = useState<AssistantNumber[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_assistant_authorized")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error) setNumbers((data ?? []) as AssistantNumber[]);
    setLoading(false);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  const addNumber = async (phone: string, label?: string) => {
    if (!dataOwnerId) return { error: "no owner" };
    const digits = phone.replace(/\D/g, "");
    const normalized = digits.startsWith("55") ? digits : `55${digits}`;
    const { error } = await supabase.from("whatsapp_assistant_authorized").insert({
      owner_id: dataOwnerId, phone: normalized, label: label || null, enabled: true,
    });
    if (!error) await reload();
    return { error };
  };

  const toggleNumber = async (id: string, enabled: boolean) => {
    const { error } = await supabase
      .from("whatsapp_assistant_authorized").update({ enabled }).eq("id", id);
    if (!error) await reload();
    return { error };
  };

  const removeNumber = async (id: string) => {
    const { error } = await supabase
      .from("whatsapp_assistant_authorized").delete().eq("id", id);
    if (!error) await reload();
    return { error };
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-assistant-webhook`;

  return { numbers, loading, addNumber, toggleNumber, removeNumber, reload, webhookUrl };
}
