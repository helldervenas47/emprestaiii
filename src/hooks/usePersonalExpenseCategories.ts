import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { notifyRemoteUpdate } from "@/lib/realtimeToast";
import { assertWritable } from "@/lib/readOnlyState";

export interface CustomPersonalCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export function usePersonalExpenseCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<CustomPersonalCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setCategories([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("personal_expense_categories")
      .select("id, name, icon, color")
      .order("name", { ascending: true });
    if (error) {
      console.error("[personal-categories] load", error);
      setLoading(false);
      return;
    }
    setCategories(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Realtime: sincroniza categorias entre dispositivos
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`personal-categories-realtime-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_expense_categories' }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const create = useCallback(
    async (input: { name: string; icon: string; color: string }) => {
      assertWritable();
      if (!user) return null;
      const name = input.name.trim();
      if (!name) return null;
      const { data, error } = await supabase
        .from("personal_expense_categories")
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
      setCategories((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      toast({ title: "Categoria criada", description: name });
      return data;
    },
    [user],
  );

  const update = useCallback(
    async (id: string, input: { name: string; icon: string; color: string }) => {
      assertWritable();
      const name = input.name.trim();
      if (!name) return null;

      // Lê o nome anterior para propagar a renomeação às despesas existentes.
      const previous = categories.find((c) => c.id === id);
      const previousName = previous?.name ?? null;

      const { data, error } = await supabase
        .from("personal_expense_categories")
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

      // Se o nome mudou, atualiza todas as despesas pessoais que ainda
      // referenciam o nome antigo — assim gráfico, cards e listagens
      // refletem a nova categoria automaticamente.
      if (previousName && previousName !== name && user) {
        const { error: expErr } = await supabase
          .from("expenses")
          .update({ category: name })
          .eq("user_id", user.id)
          .eq("scope", "personal")
          .eq("category", previousName);
        if (expErr) {
          console.error("[personal-categories] propagate rename to expenses", expErr);
        }
        // Propaga também aos orçamentos pessoais por categoria.
        const { error: budErr } = await supabase
          .from("personal_budgets")
          .update({ category: name })
          .eq("user_id", user.id)
          .eq("category", previousName);
        if (budErr) {
          console.error("[personal-categories] propagate rename to budgets", budErr);
        }
      }

      setCategories((prev) =>
        prev.map((c) => (c.id === id ? data : c)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
      toast({ title: "Categoria atualizada", description: name });
      return data;
    },
    [categories, user],
  );

  const remove = useCallback(async (id: string) => {
    assertWritable();
    const { error } = await supabase.from("personal_expense_categories").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { categories, loading, create, update, remove, reload: load };
}
