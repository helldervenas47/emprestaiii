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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;

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
          toneGuide.balanced,
          "Analise o risco da operação e gere um relatório em markdown.",
          "Objetivo: dizer o que fazer para diminuir o risco sem destruir o retorno.",
          "Estruture a resposta com apenas estes blocos: Resumo executivo e Ações imediatas.",
          "O relatório deve ser ultra resumido, com informações claras, diretas e acionáveis.",
          "Limite cada bloco a no máximo 2 bullets curtos e priorize somente o que mais impacta a decisão imediata.",
          "Seja específico com base nos números recebidos. Não invente dados. Evite explicações longas e linguagem genérica.",
        ],
        userIntro: "Dados atuais da operação:",
      },
      "priority-insight": {
        system: [
          "Você é um consultor financeiro especialista em performance, risco e cobrança.",
          toneGuide.balanced,
          "Analise o insight prioritário recebido e gere um relatório executivo em markdown.",
          "Objetivo: resumir o problema ou oportunidade e dizer o que fazer agora.",
          "Estruture a resposta com apenas estes blocos: Resumo executivo e Ação imediata.",
          "Cada bloco deve ter no máximo 2 bullets bem curtos, claros e diretos.",
          "Seja específico com base nos números recebidos. Não invente dados. Corte contexto desnecessário.",
        ],
        userIntro: "Contexto do insight prioritário:",
      },
    };

    const promptConfig = promptByType[reportType] ?? promptByType["risk-reduction"];
    const systemPrompt = promptConfig.system.join(" ");
    const userPrompt = `${promptConfig.userIntro}\n${JSON.stringify(metrics, null, 2)}\n\nGere um relatório prático e acionável.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const callGateway = async () => LOVABLE_API_KEY
      ? fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": LOVABLE_API_KEY,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        })
      : fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GEMINI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

    // Retry com backoff em erros transitórios (502/503/504) e quando upstream cai
    let response: Response | null = null;
    let lastErrText = "";
    const transient = new Set([500, 502, 503, 504]);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await callGateway();
        if (response.ok) break;
        if (!transient.has(response.status)) break;
        lastErrText = await response.text().catch(() => "");
      } catch (err) {
        lastErrText = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)));
    }

    if (!response || !response.ok) {
      const status = response?.status ?? 502;
      if (status === 429 || status === 402) {
        return new Response(JSON.stringify({ error: lastErrText || "AI error" }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Erros transitórios/upstream: retorna 200 com fallback para não quebrar a UI.
      return new Response(JSON.stringify({
        fallback: true,
        error: "AI_SERVICE_UNAVAILABLE",
        message: "Serviço de IA temporariamente indisponível. Tente novamente em alguns instantes.",
        details: lastErrText?.slice(0, 500),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const report = result?.choices?.[0]?.message?.content ?? "Não foi possível gerar o relatório.";

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    // Erro inesperado: também sinaliza fallback para o client em vez de 500.
    return new Response(JSON.stringify({
      fallback: true,
      error: "EDGE_FUNCTION_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});