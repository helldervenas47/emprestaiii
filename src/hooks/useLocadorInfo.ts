import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface LocadorInfo {
  id?: string;
  nome: string;
  rg: string;
  cpf: string;
  nacionalidade: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const emptyLocador: LocadorInfo = {
  nome: "", rg: "", cpf: "", nacionalidade: "Brasileiro(a)",
  endereco: "", bairro: "", cidade: "", estado: "",
};

export function useLocadorInfo() {
  const { user, dataOwnerId } = useAuth();
  const [locador, setLocador] = useState<LocadorInfo>(emptyLocador);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("locador_info")
      .select("*")
      .maybeSingle();
    if (data) {
      setLocador({
        id: data.id,
        nome: data.nome,
        rg: data.rg,
        cpf: data.cpf,
        nacionalidade: data.nacionalidade,
        endereco: data.endereco,
        bairro: data.bairro,
        cidade: data.cidade,
        estado: data.estado,
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  const save = useCallback(async (info: LocadorInfo) => {
    if (!user || !dataOwnerId) return;
    setLocador(info);

    if (info.id) {
      await supabase.from("locador_info").update({
        nome: info.nome, rg: info.rg, cpf: info.cpf,
        nacionalidade: info.nacionalidade, endereco: info.endereco,
        bairro: info.bairro, cidade: info.cidade, estado: info.estado,
      }).eq("id", info.id);
    } else {
      const { data } = await supabase.from("locador_info").insert({
        user_id: dataOwnerId,
        nome: info.nome, rg: info.rg, cpf: info.cpf,
        nacionalidade: info.nacionalidade, endereco: info.endereco,
        bairro: info.bairro, cidade: info.cidade, estado: info.estado,
      }).select().single();
      if (data) setLocador(prev => ({ ...prev, id: data.id }));
    }
  }, [user, dataOwnerId]);

  return { locador, save, loading };
}
