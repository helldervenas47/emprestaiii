import { getServiceRoleKey as getProjectServiceRoleKey } from "../_shared/supabase.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = getProjectServiceRoleKey()!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const cofrinho_id = body.cofrinho_id;
    const valor = Number(body.valor);
    const data_aporte = body.data_aporte ?? new Date().toISOString().slice(0, 10);
    const percentual_cdi = Number(body.percentual_cdi ?? 100);

    if (!cofrinho_id) throw new Error("cofrinho_id é obrigatório.");
    if (!valor || valor <= 0) throw new Error("valor deve ser maior que zero.");

    const { data: cofrinho, error: cofrinhoError } = await supabase
      .from("cofrinhos")
      .select("id, ativo, percentual_cdi")
      .eq("id", cofrinho_id)
      .single();

    if (cofrinhoError || !cofrinho) {
      throw new Error("Cofrinho não encontrado.");
    }

    if (!cofrinho.ativo) {
      throw new Error("Este cofrinho está inativo.");
    }

    const percentualFinal = percentual_cdi || Number(cofrinho.percentual_cdi ?? 100);

    const { data: aporte, error: aporteError } = await supabase
      .from("cofrinho_aportes")
      .insert({
        cofrinho_id,
        valor_original: valor,
        saldo_restante: valor,
        rendimento_bruto: 0,
        rendimento_liquido: 0,
        dias_aplicados: 0,
        percentual_cdi: percentualFinal,
        data_aporte,
      })
      .select()
      .single();

    if (aporteError) throw aporteError;

    const { error: saldoError } = await supabase.rpc("fn_atualizar_saldos_cofrinho", {
      p_cofrinho_id: cofrinho_id,
    });

    if (saldoError) throw saldoError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Depósito processado com sucesso.",
        aporte,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});