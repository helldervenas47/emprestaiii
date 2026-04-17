import { useState, useCallback, useEffect } from "react";
import { Client } from "@/types/loan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useClients() {
  const { user, dataOwnerId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);

  const fetchClients = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setClients(data.map((c: any) => ({
        id: c.id, name: c.name, phone: c.phone, email: c.email,
        cpf: c.cpf, cnpj: c.cnpj, rg: c.rg, address: c.address,
        city: c.city, state: c.state, score: c.score, notes: c.notes,
        active: c.active, createdAt: c.created_at,
        isVehicleRental: c.is_vehicle_rental, nacionalidade: c.nacionalidade,
        estadoCivil: c.estado_civil, profissao: c.profissao, bairro: c.bairro,
        isManager: (c as any).is_manager ?? false,
      })));
    }
  }, [user]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const addClient = useCallback(async (client: Omit<Client, "id" | "createdAt">) => {
    if (!user || !dataOwnerId) return;
    const tempId = crypto.randomUUID();
    const optimistic: Client = { ...client, id: tempId, createdAt: new Date().toISOString() };
    setClients((prev) => [optimistic, ...prev]);

    const { data, error } = await supabase.from("clients").insert({
      user_id: dataOwnerId, name: client.name, phone: client.phone, email: client.email,
      cpf: client.cpf, cnpj: client.cnpj, rg: client.rg, address: client.address,
      city: client.city, state: client.state, score: client.score, notes: client.notes,
      active: client.active, is_vehicle_rental: client.isVehicleRental || false,
      nacionalidade: client.nacionalidade || '', estado_civil: client.estadoCivil || '',
      profissao: client.profissao || '', bairro: client.bairro || '',
      is_manager: client.isManager || false,
    } as any).select().single();

    if (error) {
      setClients((prev) => prev.filter((c) => c.id !== tempId));
    } else if (data) {
      setClients((prev) => prev.map((c) => c.id === tempId ? { ...c, id: data.id, createdAt: data.created_at } : c));
    }
  }, [user, dataOwnerId]);

  const deleteClient = useCallback(async (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) fetchClients();
  }, [fetchClients]);

  const updateClient = useCallback(async (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => {
    setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...data } : c));
    const { error } = await supabase.from("clients").update({
      name: data.name, phone: data.phone, email: data.email, cpf: data.cpf,
      cnpj: data.cnpj, rg: data.rg, address: data.address, city: data.city,
      state: data.state, score: data.score, notes: data.notes, active: data.active,
      is_vehicle_rental: data.isVehicleRental, nacionalidade: data.nacionalidade,
      estado_civil: data.estadoCivil, profissao: data.profissao, bairro: data.bairro,
      is_manager: data.isManager,
    } as any).eq("id", id);
    if (error) fetchClients();
  }, [fetchClients]);

  return { clients, addClient, deleteClient, updateClient };
}
