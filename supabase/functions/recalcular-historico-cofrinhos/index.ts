import { getServiceRoleKey as getProjectServiceRoleKey } from "../_shared/supabase.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getProjectServiceRoleKey();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function round(value: number, places = 8) {
  return Number(value.toFixed(places));
}

function brDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function diffDias(inicio: string, fim: string) {
  const start = new Date(`${inicio}T00:00:00Z`).getTime();
  const end = new Date(`${fim}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

function aliquotaIR(dias: number) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

async function syncTaxas(dataInicio: string, dataFim: string) {
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados?formato=json&dataInicial=${brDate(dataInicio)}&dataFinal=${brDate(dataFim)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro ao buscar taxas no BACEN: ${response.status}`);
  }

  const dados = await response.json();

  if (!Array.isArray(dados)) {
    throw new Error("Resposta inválida do BACEN.");
  }

  let inseridas = 0;

  for (const item of dados) {
    const [d, m, y] = item.data.split("/");
    const data = `${y}-${m}-${d}`;

    const taxaDiariaPercentual = Number(String(item.valor).replace(",", "."));
    const taxaDiaria = taxaDiariaPercentual / 100;
    const taxaAnual = (Math.pow(1 + taxaDiaria, 252) - 1) * 100;

    const taxaRef = await supabase.from("taxa_referencia").upsert(
      {
        data,
        cdi_anual: round(taxaAnual, 4),
        cdi_diario: round(taxaDiaria, 12),
        selic_anual: round(taxaAnual, 4),
        selic_diaria: round(taxaDiaria, 12),
        fonte: "BACEN_SGS_11_HISTORICO",
      },
      { onConflict: "data" },
    );

    if (taxaRef.error) throw taxaRef.error;

    const cdi = await supabase.from("cdi_diario").upsert(
      {
        data,
        taxa_anual: round(taxaAnual, 4),
        taxa_diaria: round(taxaDiaria, 12),
        fator: round(1 + taxaDiaria, 12),
      },
      { onConflict: "data" },
    );

    if (cdi.error) throw cdi.error;

    inseridas++;
  }

  return inseridas;
}

serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));

    const cofrinhoId = body.cofrinho_id ?? null;
    const dataFim = body.data_fim ?? new Date().toISOString().slice(0, 10);

    let aportesQuery = supabase
      .from("cofrinho_aportes")
      .select("*")
      .gt("saldo_restante", 0)
      .order("data_aporte", { ascending: true });

    if (cofrinhoId) {
      aportesQuery = aportesQuery.eq("cofrinho_id", cofrinhoId);
    }

    const aportesResult = await aportesQuery;

    if (!aportesResult) {
      throw new Error("Erro ao buscar aportes: resposta indefinida.");
    }

    if (aportesResult.error) {
      throw new Error(`Erro ao buscar aportes: ${aportesResult.error.message}`);
    }

    const aportes = aportesResult.data ?? [];

    if (!aportes.length) {
      throw new Error("Nenhum aporte ativo encontrado.");
    }

    const dataInicio = aportes[0].data_aporte;

    const taxasSincronizadas = await syncTaxas(dataInicio, dataFim);

    const cofrinhosUnicos = [...new Set(aportes.map((a) => a.cofrinho_id))];

    for (const id of cofrinhosUnicos) {
      const delRend = await supabase
        .from("cofrinho_rendimento_diario")
        .delete()
        .eq("cofrinho_id", id);

      if (delRend.error) throw delRend.error;

      const delEventos = await supabase
        .from("cofrinho_eventos")
        .delete()
        .eq("cofrinho_id", id)
        .eq("tipo", "RENDIMENTO");

      if (delEventos.error) throw delEventos.error;

      const resetAportes = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: 0,
          rendimento_liquido: 0,
          ultimo_calculo: null,
        })
        .eq("cofrinho_id", id);

      if (resetAportes.error) throw resetAportes.error;
    }

    let registrosCriados = 0;
    let aportesProcessados = 0;

    for (const aporte of aportes) {
      const taxasResult = await supabase
        .from("taxa_referencia")
        .select("*")
        .gte("data", aporte.data_aporte)
        .lte("data", dataFim)
        .order("data", { ascending: true });

      if (taxasResult.error) throw taxasResult.error;

      const taxas = taxasResult.data ?? [];

      let brutoAcumulado = 0;
      let liquidoAcumulado = 0;

      for (const taxa of taxas) {
        const dias = diffDias(aporte.data_aporte, taxa.data);
        const saldo = Number(aporte.saldo_restante);
        const percentual = Number(aporte.percentual_cdi ?? 100);
        const taxaDiaria = Number(taxa.cdi_diario);

        if (!saldo || saldo <= 0 || !taxaDiaria || taxaDiaria <= 0) {
          continue;
        }

        const bruto = round(saldo * taxaDiaria * (percentual / 100));
        const ir = round(bruto * aliquotaIR(dias));
        const liquido = round(bruto - ir);

        brutoAcumulado += bruto;
        liquidoAcumulado += liquido;

        const insertRend = await supabase
          .from("cofrinho_rendimento_diario")
          .insert({
            cofrinho_id: aporte.cofrinho_id,
            aporte_id: aporte.id,
            data: taxa.data,
            saldo_principal: saldo,
            percentual_cdi: percentual,
            taxa_cdi: taxaDiaria,
            rendimento_bruto: bruto,
            imposto_renda: ir,
            iof: 0,
            rendimento_liquido: liquido,
            saldo_total: round(saldo + liquidoAcumulado, 2),
          });

        if (insertRend.error) throw insertRend.error;

        registrosCriados++;
      }

      const updateAporte = await supabase
        .from("cofrinho_aportes")
        .update({
          rendimento_bruto: round(brutoAcumulado, 2),
          rendimento_liquido: round(liquidoAcumulado, 2),
          ultimo_calculo: dataFim,
        })
        .eq("id", aporte.id);

      if (updateAporte.error) throw updateAporte.error;

      aportesProcessados++;
    }

    for (const id of cofrinhosUnicos) {
      const saldo = await supabase.rpc("fn_atualizar_saldos_cofrinho", {
        p_cofrinho_id: id,
      });

      if (saldo.error) throw saldo.error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data_inicio: dataInicio,
        data_fim: dataFim,
        taxas_sincronizadas: taxasSincronizadas,
        aportes_processados: aportesProcessados,
        registros_criados: registrosCriados,
        cofrinhos_recalculados: cofrinhosUnicos.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message ?? String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});