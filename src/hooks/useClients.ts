import { useState, useCallback, useEffect } from "react";
import { Client } from "@/types/loan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useClients() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);

  const fetchClients = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (data) {
      setClients(data.map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        cpf: c.cpf,
        cnpj: c.cnpj,
        rg: c.rg,
        address: c.address,
        city: c.city,
        state: c.state,
        score: c.score,
        notes: c.notes,
        active: c.active,
        createdAt: c.created_at,
      })));
    }
  }, [user]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const addClient = useCallback(async (client: Omit<Client, "id" | "createdAt">) => {
    if (!user) return;
    const { error } = await supabase.from("clients").insert({
      user_id: user.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      cpf: client.cpf,
      cnpj: client.cnpj,
      rg: client.rg,
      address: client.address,
      city: client.city,
      state: client.state,
      score: client.score,
      notes: client.notes,
      active: client.active,
    });
    if (!error) fetchClients();
  }, [user, fetchClients]);

  const deleteClient = useCallback(async (id: string) => {
    await supabase.from("clients").delete().eq("id", id);
    fetchClients();
  }, [fetchClients]);

  const updateClient = useCallback(async (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => {
    await supabase.from("clients").update({
      name: data.name,
      phone: data.phone,
      email: data.email,
      cpf: data.cpf,
      cnpj: data.cnpj,
      rg: data.rg,
      address: data.address,
      city: data.city,
      state: data.state,
      score: data.score,
      notes: data.notes,
      active: data.active,
    }).eq("id", id);
    fetchClients();
  }, [fetchClients]);

  return { clients, addClient, deleteClient, updateClient };
}
