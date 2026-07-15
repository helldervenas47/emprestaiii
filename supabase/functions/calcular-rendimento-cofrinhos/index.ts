import { getServiceRoleKey as getProjectServiceRoleKey } from "../_shared/supabase.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  if (dias <= 360) return 0.20;
  if (dias <= 720) return 0.175;
  return 0.15;
}

function arredondar(valor: number, casas = 8) {
  return Number(valor.toFixed(casas));
}

serve(async () => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

    const { data: taxa, error: taxaError } = await supabase
      .from("taxa_referencia")
      .select("*")
      .lte("data", hoje)
      .order("data", { ascending: false })
      .limit(1)
      .single();

    if (taxaError || !taxa) {
      throw new Error("Nenhuma taxa encontrada em taxa_referencia.");
    }

    const { data: aportes, error: aportesError } = await supabase
      .from("cofrinho_aportes")
      .select(`
        id,
        cofrinho_id,
        saldo_restante,
        rendimento_bruto,
        rendimento_liquido,
        percentual_cdi,
        data_aporte,
        cofrinhos (
          id,
          ativo,
          rendimento_automatico
        )
      `)
      .gt("saldo_restante", 0);

    if (aportesError) throw aportesError;

    let processados = 0;
    let ignorados = 0;

    for (const aporte of aportes ?? []) {
      const cofrinho = Array.isArray(aporte.cofrinhos)
        ? aporte.cofrinhos[0]
        : aporte.cofrinhos;

      if (!cofrinho?.ativo || !cofrinho?.rendimento_automatico) {
        ignorados++;
        continue;
      }

      const diasCorridos = diffDias(aporte.data_aporte, hoje);

      if (diasCorridos < 0) {
        ignorados++;
        continue;
      }

      const rendimentoJaExiste = await supabase
        .from("cofrinho_rendimento_diario")
        .select("id")
        .eq("aporte_id", aporte.id)
        .eq("data", hoje)
        .maybeSingle();

      if (rendimentoJaExiste.data) {
        ignorados++;
        continue;
      }

      const percentualCdi = Number(aporte.percentual_cdi ?? 100);
      const saldoPrincipal = Number(aporte.saldo_restante ?? 0);
      const taxaDiaria = Number(taxa.cdi_diario);

      const rendimentoBruto = arredondar(
        saldoPrincipal * taxaDiaria * (percentualCdi / 100)
      );

      const aliquotaIR = calcularAliquotaIR(diasCorridos);
      const impostoRenda = arredondar(rendimentoBruto * aliquotaIR);
      const rendimentoLiquido = arredondar(rendimentoBruto - impostoRenda);

      const novoRendimentoBruto = arredondar(
        Number(aporte.rendimento_bruto ?? 0) + rendimentoBruto,
        2
      );

      const novoRendimentoLiquido = arredondar(
        Number(aporte.rendimento_liquido ?? 0) + rendimentoLiquido,
        2
      );

      const saldoTotal = arredondar(saldoPrincipal + novoRendimentoLiquido, 2);

      const { error: insertRendimentoError } = await supabase
        .from("cofrinho_rendimento_diario")
        .insert({
          cofrinho_id: aporte.cofrinho_id,
          aporte_id: aporte.id,
          data: hoje,
          saldo_principal: saldoPrincipal,
          percentual_cdi: percentualCdi,
          taxa_cdi: taxaDiaria,
          rendimento_bruto: rendimentoBruto,
          imposto_renda: impostoRenda,
          iof: 0,
          rendimento_liquido: rendimentoLiquido,
          saldo_total: saldoTotal,
        });

      if (insertRendimentoError) throw insertRendimentoError;

      const { error: updateAporteError } = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: novoRendimentoBruto,
          rendimento_liquido: novoRendimentoLiquido,
          dias_aplicados: diasCorridos,
          ultimo_calculo: hoje,
        })
        .eq("id", aporte.id);

      if (updateAporteError) throw updateAporteError;

      await supabase.rpc("fn_atualizar_saldos_cofrinho", {
        p_cofrinho_id: aporte.cofrinho_id,
      });

      processados++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data_calculo: hoje,
        taxa_usada: taxa.data,
        cdi_anual: taxa.cdi_anual,
        cdi_diario: taxa.cdi_diario,
        processados,
        ignorados,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});