import { useState, useCallback } from "react";
import { Client } from "@/types/loan";

const CLIENTS_KEY = "clients_data";

function loadFromStorage<T>(key: string, fallback: T[]): T[] {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function useClients() {
  const [clients, setClients] = useState<Client[]>(() => loadFromStorage<Client>(CLIENTS_KEY, []));

  const addClient = useCallback((client: Omit<Client, "id" | "createdAt">) => {
    const newClient: Client = {
      ...client,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setClients((prev) => {
      const updated = [...prev, newClient];
      saveToStorage(CLIENTS_KEY, updated);
      return updated;
    });
  }, []);

  const deleteClient = useCallback((id: string) => {
    setClients((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveToStorage(CLIENTS_KEY, updated);
      return updated;
    });
  }, []);

  const updateClient = useCallback((id: string, data: Partial<Omit<Client, "id" | "createdAt">>) => {
    setClients((prev) => {
      const updated = prev.map((c) => (c.id === id ? { ...c, ...data } : c));
      saveToStorage(CLIENTS_KEY, updated);
      return updated;
    });
  }, []);

  return { clients, addClient, deleteClient, updateClient };
}
