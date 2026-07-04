import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function diffDias(dataInicial: string, dataFinal: string) {
  const inicio = new Date(`${dataInicial}T00:00:00Z`).getTime();
  const fim = new Date(`${dataFinal}T00:00:00Z`).getTime();
  return Math.floor((fim - inicio) / 86400000);
}

function addDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function calcularAliquotaIR(dias: number) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

function arredondar(valor: number, casas = 8) {
  return Number(valor.toFixed(casas));
}

serve(async () => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);

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
        ultimo_calculo,
        cofrinhos ( id, ativo, rendimento_automatico )
      `)
      .gt("saldo_restante", 0);

    if (aportesError) throw aportesError;

    let processados = 0;
    let ignorados = 0;
    let diasCriados = 0;

    for (const aporte of aportes ?? []) {
      const cofrinho = Array.isArray(aporte.cofrinhos) ? aporte.cofrinhos[0] : aporte.cofrinhos;
      if (!cofrinho?.ativo || !cofrinho?.rendimento_automatico) {
        ignorados++;
        continue;
      }

      // Data inicial do catch-up: dia seguinte ao último cálculo, ou o próprio dia do aporte
      const inicioIter = aporte.ultimo_calculo
        ? addDias(aporte.ultimo_calculo, 1)
        : aporte.data_aporte;

      if (diffDias(inicioIter, hoje) < 0) {
        ignorados++;
        continue;
      }

      // Busca todas as taxas do intervalo de uma vez
      const { data: taxas, error: taxasErr } = await supabase
        .from("taxa_referencia")
        .select("data, cdi_diario")
        .gte("data", inicioIter)
        .lte("data", hoje)
        .order("data", { ascending: true });

      if (taxasErr) throw taxasErr;
      if (!taxas || taxas.length === 0) {
        ignorados++;
        continue;
      }

      const percentualCdi = Number(aporte.percentual_cdi ?? 100);
      const saldoPrincipal = Number(aporte.saldo_restante ?? 0);
      let acumBruto = Number(aporte.rendimento_bruto ?? 0);
      let acumLiquido = Number(aporte.rendimento_liquido ?? 0);
      let ultimaData = aporte.ultimo_calculo ?? aporte.data_aporte;

      for (const taxa of taxas) {
        // Idempotência: pula se já existe registro para esse dia
        const existe = await supabase
          .from("cofrinho_rendimento_diario")
          .select("id")
          .eq("aporte_id", aporte.id)
          .eq("data", taxa.data)
          .maybeSingle();
        if (existe.data) continue;

        const diasCorridos = diffDias(aporte.data_aporte, taxa.data);
        if (diasCorridos < 0) continue;

        const taxaDiaria = Number(taxa.cdi_diario);
        const rendimentoBruto = arredondar(saldoPrincipal * taxaDiaria * (percentualCdi / 100));
        const aliquotaIR = calcularAliquotaIR(diasCorridos);
        const impostoRenda = arredondar(rendimentoBruto * aliquotaIR);
        const rendimentoLiquido = arredondar(rendimentoBruto - impostoRenda);

        acumBruto = arredondar(acumBruto + rendimentoBruto, 2);
        acumLiquido = arredondar(acumLiquido + rendimentoLiquido, 2);

        const { error: insErr } = await supabase.from("cofrinho_rendimento_diario").insert({
          cofrinho_id: aporte.cofrinho_id,
          aporte_id: aporte.id,
          data: taxa.data,
          saldo_principal: saldoPrincipal,
          percentual_cdi: percentualCdi,
          taxa_cdi: taxaDiaria,
          rendimento_bruto: rendimentoBruto,
          imposto_renda: impostoRenda,
          iof: 0,
          rendimento_liquido: rendimentoLiquido,
          saldo_total: arredondar(saldoPrincipal + acumLiquido, 2),
        });
        if (insErr) throw insErr;

        ultimaData = taxa.data;
        diasCriados++;
      }

      const { error: updErr } = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: acumBruto,
          rendimento_liquido: acumLiquido,
          dias_aplicados: diffDias(aporte.data_aporte, ultimaData),
          ultimo_calculo: ultimaData,
        })
        .eq("id", aporte.id);
      if (updErr) throw updErr;

      await supabase.rpc("fn_atualizar_saldos_cofrinho", { p_cofrinho_id: aporte.cofrinho_id });
      processados++;
    }

    return new Response(
      JSON.stringify({ success: true, data_calculo: hoje, processados, ignorados, dias_criados: diasCriados }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
