import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MyBoletoStatus = "pendente" | "pago" | "vencido";

export interface MyBoleto {
  id: string;
  description: string;
  beneficiary: string | null;
  category: string | null;
  status: MyBoletoStatus;
  amount: number;
  due_date: string | null;
  paid_at: string | null;
  digits: string | null;
  barcode: string | null;
  bank_code: string | null;
  bank_name: string | null;
  segment: string | null;
  segment_label: string | null;
  kind: string | null;
  notes: string | null;
  attachment_path: string | null;
  pix_brcode: string | null;
  created_at: string;
  updated_at: string;
}

export type MyBoletoInput = Omit<MyBoleto, "id" | "created_at" | "updated_at" | "status"> & {
  status?: MyBoletoStatus;
};

export function useMyBoletos() {
  const { user } = useAuth();
  const [items, setItems] = useState<MyBoleto[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!user) { setItems([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("my_boletos")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (!error && data) setItems(data as MyBoleto[]);
  }, [user]);

  useEffect(() => {
    fetchItems();
    if (!user) return;
    const ch = supabase
      .channel("my_boletos_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "my_boletos" }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, fetchItems]);

  const add = useCallback(async (input: MyBoletoInput) => {
    if (!user) throw new Error("not-auth");
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    const { error } = await supabase.from("my_boletos").insert({
      ...input,
      user_id: user.id,
      owner_id,
      status: input.status ?? "pendente",
    });
    if (error) throw error;
    await fetchItems();
  }, [user, fetchItems]);

  const update = useCallback(async (id: string, patch: Partial<MyBoletoInput & { status: MyBoletoStatus }>) => {
    const { error } = await supabase.from("my_boletos").update(patch).eq("id", id);
    if (error) throw error;
    await fetchItems();
  }, [fetchItems]);

  const remove = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.attachment_path) {
      await supabase.storage.from("boleto-attachments").remove([item.attachment_path]).catch(() => {});
    }
    const { error } = await supabase.from("my_boletos").delete().eq("id", id);
    if (error) throw error;
    await fetchItems();
  }, [items, fetchItems]);

  const markPaid = useCallback(async (id: string) => {
    const today = new Date().toISOString().slice(0, 10);
    await update(id, { status: "pago", paid_at: today });
  }, [update]);

  const uploadAttachment = useCallback(async (file: File): Promise<string> => {
    if (!user) throw new Error("not-auth");
    const { data: ownerRow } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
    const owner_id = (ownerRow as unknown as string) ?? user.id;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${owner_id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("boleto-attachments").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    return path;
  }, [user]);

  const getAttachmentUrl = useCallback(async (path: string) => {
    const { data } = await supabase.storage.from("boleto-attachments").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }, []);

  return { items, loading, add, update, remove, markPaid, uploadAttachment, getAttachmentUrl, refresh: fetchItems };
}
