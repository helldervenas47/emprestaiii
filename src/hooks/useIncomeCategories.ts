import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

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
    setCategories((data ?? []) as any);
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
      const name = input.name.trim();
      if (!name) return null;
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

  return { categories, loading, create, reload: load };
}
