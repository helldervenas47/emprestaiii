import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type InsightTone = "balanced" | "strict" | "motivational" | "technical" | "friendly";
type ReportType = "risk-reduction" | "priority-insight";

const toneGuide: Record<InsightTone, string> = {
  balanced: "Tom equilibrado, claro, executivo e prático.",
  strict: "Tom direto, firme e objetivo, sem suavizar riscos.",
  motivational: "Tom encorajador, positivo e orientado à ação.",
  technical: "Tom analítico, preciso, com linguagem mais técnica e orientada a indicadores.",
  friendly: "Tom próximo, leve e fácil de entender, sem perder utilidade.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const tone = ((body?.tone as InsightTone) ?? "balanced");
    const reportType = ((body?.type as ReportType) ?? "risk-reduction");
    const metrics = body?.metrics;

    if (!metrics) {
      return new Response(JSON.stringify({ error: "Missing metrics" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promptByType: Record<ReportType, { system: string[]; userIntro: string }> = {
      "risk-reduction": {
        system: [
          "Você é um consultor financeiro especialista em crédito e cobrança.",
          toneGuide[tone] ?? toneGuide.balanced,
          "Analise o risco da operação e gere um relatório em markdown.",
          "Objetivo: dizer o que fazer para diminuir o risco sem destruir o retorno.",
          "Estruture a resposta com estes blocos: Resumo executivo, Principais riscos, Plano de ação prioritário (curto prazo, médio prazo), Ajustes de política de crédito, Alertas finais.",
          "Seja específico com base nos números recebidos. Não invente dados. Use bullets curtos.",
        ],
        userIntro: "Dados atuais da operação:",
      },
      "priority-insight": {
        system: [
          "Você é um consultor financeiro especialista em performance, risco e cobrança.",
          toneGuide[tone] ?? toneGuide.balanced,
          "Analise o insight prioritário recebido e gere um relatório executivo em markdown.",
          "Objetivo: explicar o problema ou oportunidade, apontar prováveis causas e orientar o que fazer agora.",
          "Estruture a resposta com estes blocos: Leitura do insight, Diagnóstico, O que fazer imediatamente, Plano de 7 a 30 dias, Indicadores para acompanhar.",
          "Seja específico com base nos números recebidos. Não invente dados. Use bullets curtos e acionáveis.",
        ],
        userIntro: "Contexto do insight prioritário:",
      },
    };

    const promptConfig = promptByType[reportType] ?? promptByType["risk-reduction"];
    const systemPrompt = promptConfig.system.join(" ");
    const userPrompt = `${promptConfig.userIntro}\n${JSON.stringify(metrics, null, 2)}\n\nGere um relatório prático e acionável.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 429 || response.status === 402) {
        return new Response(JSON.stringify({ error: text || "AI error" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI gateway error", details: text }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const report = result?.choices?.[0]?.message?.content ?? "Não foi possível gerar o relatório.";

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});