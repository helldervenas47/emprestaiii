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

function diffDias(dataInicial: string, dataFinal: string) {
  const inicio = new Date(`${dataInicial}T00:00:00`);
  const fim = new Date(`${dataFinal}T00:00:00`);
  return Math.floor((fim.getTime() - inicio.getTime()) / 86400000);
}

function calcularAliquotaIR(dias: number) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

function calcularAliquotaIOF(dias: number) {
  const tabela = [96, 96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
  if (dias >= 30) return 0;
  return (tabela[Math.max(0, dias)] ?? 0) / 100;
}

function round(valor: number, casas = 2) {
  return Number(valor.toFixed(casas));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const cofrinho_id = body.cofrinho_id;
    const valor = Number(body.valor);
    const dataResgate = body.data_resgate ?? new Date().toISOString().slice(0, 10);
    const dataEvento = `${dataResgate}T00:00:00.000Z`;

    if (!cofrinho_id) throw new Error("cofrinho_id é obrigatório.");
    if (!valor || valor <= 0) throw new Error("valor deve ser maior que zero.");

    const { data: cofrinho, error: cofrinhoError } = await supabase
      .from("cofrinhos")
      .select("id, saldo_disponivel, saldo_total, ativo")
      .eq("id", cofrinho_id)
      .single();

    if (cofrinhoError || !cofrinho) throw new Error("Cofrinho não encontrado.");
    if (!cofrinho.ativo) throw new Error("Este cofrinho está inativo.");
    if (Number(cofrinho.saldo_disponivel) < valor) throw new Error("Saldo disponível insuficiente.");

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select("*")
      .eq("cofrinho_id", cofrinho_id)
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true })
      .order("created_at", { ascending: true });

    if (aportesError) throw aportesError;

    let restante = valor;
    let totalPrincipal = 0;
    let totalRendimentoBruto = 0;
    let totalIR = 0;
    let totalIOF = 0;
    let totalRendimentoLiquido = 0;
    const detalhes: any[] = [];

    const { data: resgate, error: resgateError } = await supabase
      .from("cofrinho_resgates")
      .insert({
        cofrinho_id,
        valor_solicitado: valor,
        status: "PROCESSANDO",
      })
      .select()
      .single();

    if (resgateError) throw resgateError;

    for (const aporte of aportes ?? []) {
      if (restante <= 0) break;

      const saldoRestante = Number(aporte.saldo_restante);
      const principalResgatado = Math.min(restante, saldoRestante);
      const proporcao = principalResgatado / saldoRestante;

      const rendimentoBruto = round(Number(aporte.rendimento_bruto ?? 0) * proporcao, 8);
      const dias = diffDias(aporte.data_aporte, dataResgate);

      const iof = round(rendimentoBruto * calcularAliquotaIOF(dias), 8);
      const irBase = Math.max(rendimentoBruto - iof, 0);
      const impostoRenda = round(irBase * calcularAliquotaIR(dias), 8);
      const rendimentoLiquido = round(rendimentoBruto - iof - impostoRenda, 8);

      const novoSaldoRestante = round(saldoRestante - principalResgatado, 2);
      const novoRendimentoBruto = round(Number(aporte.rendimento_bruto ?? 0) - rendimentoBruto, 2);
      const novoRendimentoLiquido = round(Number(aporte.rendimento_liquido ?? 0) - rendimentoLiquido, 2);

      const { error: resgateAporteError } = await supabase
        .from("cofrinho_resgate_aportes")
        .insert({
          resgate_id: resgate.id,
          aporte_id: aporte.id,
          principal_resgatado: round(principalResgatado, 2),
          rendimento_bruto: round(rendimentoBruto, 2),
          imposto_renda: round(impostoRenda, 2),
          iof: round(iof, 2),
          rendimento_liquido: round(rendimentoLiquido, 2),
        });

      if (resgateAporteError) throw resgateAporteError;

      const { error: updateAporteError } = await supabase
        .from("cofrinho_aportes")
        .update({
          saldo_restante: novoSaldoRestante,
          rendimento_bruto: novoRendimentoBruto,
          rendimento_liquido: novoRendimentoLiquido,
        })
        .eq("id", aporte.id);

      if (updateAporteError) throw updateAporteError;

      totalPrincipal += principalResgatado;
      totalRendimentoBruto += rendimentoBruto;
      totalIR += impostoRenda;
      totalIOF += iof;
      totalRendimentoLiquido += rendimentoLiquido;

      detalhes.push({
        aporte_id: aporte.id,
        principal_resgatado: round(principalResgatado, 2),
        rendimento_bruto: round(rendimentoBruto, 2),
        ir: round(impostoRenda, 2),
        iof: round(iof, 2),
        rendimento_liquido: round(rendimentoLiquido, 2),
      });

      restante = round(restante - principalResgatado, 2);
    }

    if (restante > 0) throw new Error("Não foi possível completar o resgate.");

    const valorPago = round(totalPrincipal + totalRendimentoLiquido, 2);

    const { error: updateResgateError } = await supabase
      .from("cofrinho_resgates")
      .update({
        valor_principal: round(totalPrincipal, 2),
        rendimento_bruto: round(totalRendimentoBruto, 2),
        imposto_renda: round(totalIR, 2),
        iof: round(totalIOF, 2),
        rendimento_liquido: round(totalRendimentoLiquido, 2),
        valor_pago: valorPago,
        status: "PROCESSADO",
      })
      .eq("id", resgate.id);

    if (updateResgateError) throw updateResgateError;

    const { error: saldoError } = await supabase.rpc("fn_atualizar_saldos_cofrinho", {
      p_cofrinho_id: cofrinho_id,
    });

    if (saldoError) throw saldoError;

    const saldoAnterior = Number(cofrinho.saldo_total);
    const saldoPosterior = round(saldoAnterior - valorPago, 2);

    const { error: eventoError } = await supabase.rpc("fn_registrar_evento_cofrinho", {
      p_cofrinho_id: cofrinho_id,
      p_aporte_id: null,
      p_tipo: "RESGATE",
      p_valor: valorPago,
      p_saldo_anterior: saldoAnterior,
      p_saldo_posterior: saldoPosterior,
      p_descricao: "Resgate realizado no cofrinho",
      p_referencia: "resgate",
      p_dados: {
        resgate_id: resgate.id,
        valor_solicitado: valor,
        valor_pago: valorPago,
        data_resgate: dataResgate,
        detalhes,
      },
      p_data_evento: dataEvento,
    });

    if (eventoError) throw eventoError;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Resgate processado com sucesso.",
        resgate_id: resgate.id,
        valor_solicitado: valor,
        valor_pago: valorPago,
        data_resgate: dataResgate,
        detalhes,
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