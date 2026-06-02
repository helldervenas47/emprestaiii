import { useState, useCallback, useEffect } from "react";
import { Client } from "@/types/loan";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import {
  cacheRows,
  getCachedRows,
  upsertCachedRow,
  removeCachedRow,
  enqueueMutation,
  rewritePendingRecordId,
} from "@/lib/offline/sync";
import { isOnline } from "@/lib/offline/status";

async function triggerClientAnalysis(clientId: string) {
  await supabase.functions.invoke("sync-client-analysis", {
    body: { client_id: clientId, force: true },
  }).catch(() => { /* noop */ });
}

function rowToClient(c: any): Client {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    cpf: c.cpf, cnpj: c.cnpj, rg: c.rg, address: c.address,
    city: c.city, state: c.state, score: c.score, notes: c.notes,
    active: c.active, createdAt: c.created_at,
    isVehicleRental: c.is_vehicle_rental, nacionalidade: c.nacionalidade,
    estadoCivil: c.estado_civil, profissao: c.profissao, bairro: c.bairro,
    isManager: c.is_manager ?? false,
    defaultInterestRate: c.default_interest_rate ?? null,
    autoBillingEnabled: c.auto_billing_enabled ?? true,
  };
}

export function useClients() {
  const { user, dataOwnerId } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);

  const fetchClients = useCallback(async () => {
    if (!user) return;
    if (isOnline()) {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setClients(data.map(rowToClient));
        cacheRows("clients", data).catch(() => { /* noop */ });
        return;
      }
    }
    // Offline / fetch failed → load from cache
    const cached = await getCachedRows("clients");
    if (cached.length > 0) {
      setClients(cached
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .map(rowToClient));
    }
  }, [user]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`clients-realtime-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => { fetchClients(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchClients]);

  // Auto-refetch when offline queue flushes
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail?.tables?.includes("clients")) fetchClients();
    };
    window.addEventListener("offline-sync:flushed", handler);
    return () => window.removeEventListener("offline-sync:flushed", handler);
  }, [fetchClients]);

  const addClient = useCallback(async (client: Omit<Client, "id" | "createdAt">): Promise<string | null> => {
    if (!user || !dataOwnerId) return null;
    const tempId = crypto.randomUUID();
    const optimistic: Client = { ...client, id: tempId, createdAt: new Date().toISOString() };
    setClients((prev) => [optimistic, ...prev]);

    const insertPayload = {
      id: tempId,
      user_id: dataOwnerId, name: client.name, phone: client.phone, email: client.email,
      cpf: client.cpf, cnpj: client.cnpj, rg: client.rg, address: client.address,
      city: client.city, state: client.state, score: client.score, notes: client.notes,
      active: client.active, is_vehicle_rental: client.isVehicleRental || false,
      nacionalidade: client.nacionalidade || '', estado_civil: client.estadoCivil || '',
      profissao: client.profissao || '', bairro: client.bairro || '',
      is_manager: client.isManager || false,
      default_interest_rate: client.defaultInterestRate ?? null,
      auto_billing_enabled: client.autoBillingEnabled ?? true,
    };

    // Local cache write — always
    await upsertCachedRow("clients", { ...insertPayload, created_at: optimistic.createdAt });

    if (!isOnline()) {
      await enqueueMutation({ table: "clients", op: "insert", recordId: tempId, payload: insertPayload });
      return;
    }

    const { data, error } = await supabase.from("clients").insert(insertPayload as any).select().single();
    if (error) {
      // Network/RLS — queue if it looks like network, else revert
      if (!error.message.toLowerCase().includes("row-level")) {
        await enqueueMutation({ table: "clients", op: "insert", recordId: tempId, payload: insertPayload });
        return tempId;
      } else {
        setClients((prev) => prev.filter((c) => c.id !== tempId));
        await removeCachedRow("clients", tempId);
        return null;
      }
    } else if (data) {
      setClients((prev) => prev.map((c) => c.id === tempId ? { ...c, id: data.id, createdAt: data.created_at } : c));
      await removeCachedRow("clients", tempId);
      await upsertCachedRow("clients", data);
      await rewritePendingRecordId("clients", tempId, data.id);
      await triggerClientAnalysis(data.id);
      return data.id;
    }
    return tempId;
  }, [user, dataOwnerId]);

  const deleteClient = useCallback(async (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    await removeCachedRow("clients", id);
    if (!isOnline()) {
      await enqueueMutation({ table: "clients", op: "delete", recordId: id });
      return;
    }
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      await enqueueMutation({ table: "clients", op: "delete", recordId: id });
    }
  }, []);

  const updateClient = useCallback(async (id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => {
    setClients((prev) => prev.map((c) => c.id === id ? { ...c, ...data } : c));
    const updatePayload: any = {
      name: data.name, phone: data.phone, email: data.email, cpf: data.cpf,
      cnpj: data.cnpj, rg: data.rg, address: data.address, city: data.city,
      state: data.state, score: data.score, notes: data.notes, active: data.active,
      is_vehicle_rental: data.isVehicleRental, nacionalidade: data.nacionalidade,
      estado_civil: data.estadoCivil, profissao: data.profissao, bairro: data.bairro,
      is_manager: data.isManager,
      default_interest_rate: data.defaultInterestRate,
      auto_billing_enabled: data.autoBillingEnabled,
    };
    Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);

    if (!isOnline()) {
      await enqueueMutation({ table: "clients", op: "update", recordId: id, payload: updatePayload });
      return;
    }
    const { error } = await supabase.from("clients").update(updatePayload).eq("id", id);
    if (error) {
      await enqueueMutation({ table: "clients", op: "update", recordId: id, payload: updatePayload });
    } else {
      await triggerClientAnalysis(id);
    }
  }, []);

  return { clients, addClient, deleteClient, updateClient };
}
