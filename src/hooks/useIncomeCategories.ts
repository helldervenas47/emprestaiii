import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { displayIncomeCategory, incomeCategoryKey } from "@/lib/incomeCategory";

export interface CustomIncomeCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export function useIncomeCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<CustomIncomeCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("income_categories" as any)
      .select("id, name, icon, color")
      .order("name", { ascending: true });
    if (error) {
      console.error("[income-categories] load", error);
      setLoading(false);
      return;
    }
    const seen = new Set<string>();
    const normalized = ((data ?? []) as any[]).reduce<CustomIncomeCategory[]>((acc, row) => {
      const key = incomeCategoryKey(row.name);
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push({ ...row, name: displayIncomeCategory(row.name) });
      return acc;
    }, []);
    setCategories(normalized);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`income-categories-realtime-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "income_categories" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const create = useCallback(
    async (input: { name: string; icon: string; color: string }) => {
      if (!user) return null;
      const rawName = input.name.trim();
      if (!rawName) return null;
      const name = displayIncomeCategory(rawName);
      const { data, error } = await supabase
        .from("income_categories" as any)
        .insert({ user_id: user.id, name, icon: input.icon, color: input.color })
        .select("id, name, icon, color")
        .single();
      if (error) {
        toast({
          title: "Não foi possível criar categoria",
          description: error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message,
          variant: "destructive",
        });
        return null;
      }
      const created = data as any as CustomIncomeCategory;
      setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      toast({ title: "Categoria criada", description: name });
      return created;
    },
    [user],
  );

  const update = useCallback(
    async (id: string, input: { name: string; icon: string; color: string }) => {
      if (!user) return null;
      const rawName = input.name.trim();
      if (!rawName) return null;
      const name = displayIncomeCategory(rawName);
      const { data, error } = await supabase
        .from("income_categories" as any)
        .update({ name, icon: input.icon, color: input.color })
        .eq("id", id)
        .select("id, name, icon, color")
        .single();
      if (error) {
        toast({
          title: "Não foi possível atualizar categoria",
          description: error.message.includes("duplicate") ? "Já existe uma categoria com esse nome." : error.message,
          variant: "destructive",
        });
        return null;
      }
      const updated = data as any as CustomIncomeCategory;
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
      toast({ title: "Categoria atualizada", description: name });
      return updated;
    },
    [user],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      const { error } = await supabase.from("income_categories" as any).delete().eq("id", id);
      if (error) {
        toast({
          title: "Não foi possível excluir categoria",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast({ title: "Categoria excluída" });
    },
    [user],
  );

  return { categories, loading, create, update, remove, reload: load };
}
