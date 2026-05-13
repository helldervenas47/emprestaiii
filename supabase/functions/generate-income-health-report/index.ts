const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
}

interface Metrics {
  score: number;
  improvementPct: number;
  monthsCovered: number;
  expenseDelta: number;
  piggyBalance: number;
  current: { income: number; expense: number; pendingExpense: number };
  previous?: { income: number; expense: number; pendingExpense: number };
  radar: { axis: string; value: number }[];
  categories: { name: string; value: number }[];
  monthKey: string;
}

function buildPrompt(m: Metrics): string {
  const lines: string[] = [];
  lines.push(`Mês de referência: ${m.monthKey}`);
  lines.push(`Score de saúde financeira: ${m.score}/100 (variação vs mês anterior: ${m.improvementPct >= 0 ? "+" : ""}${m.improvementPct}%)`);
  lines.push("");
  lines.push("Mês atual:");
  lines.push(`- Receitas recebidas: ${fmt(m.current.income)}`);
  lines.push(`- Despesas pessoais pagas: ${fmt(m.current.expense)}`);
  lines.push(`- Despesas pessoais pendentes: ${fmt(m.current.pendingExpense)}`);
  lines.push(`- Saldo do mês: ${fmt(m.current.income - m.current.expense)}`);
  lines.push("");
  lines.push(`Reserva (cofrinhos): ${fmt(m.piggyBalance)} — cobre ${m.monthsCovered.toFixed(1)} meses de despesa média`);
  lines.push(`Variação de despesa vs mês anterior: ${m.expenseDelta >= 0 ? "+" : ""}${m.expenseDelta}%`);
  lines.push("");
  lines.push("Componentes do score (0-100):");
  for (const r of m.radar) lines.push(`- ${r.axis}: ${r.value}`);
  if (m.categories.length > 0) {
    lines.push("");
    lines.push("Top categorias de despesa pessoal no mês:");
    for (const c of m.categories) lines.push(`- ${c.name}: ${fmt(c.value)}`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Você é um consultor financeiro pessoal especializado em fluxo de receitas e saúde financeira. Recebe um diagnóstico mensal com score, receitas, despesas, reserva e componentes (controle, reserva, dívidas, investimentos, estabilidade).

Responda em português do Brasil, em Markdown enxuto, sem títulos H1, com no máximo 320 palavras, organizada nestas seções (use exatamente esses títulos com ##):

## 📊 Diagnóstico
2-3 frases objetivas sobre o estado atual: receitas vs despesas, score, tendência.

## ⚠️ Pontos de atenção
Bullets curtos com os componentes mais frágeis (score baixo) e riscos detectados (ex.: reserva insuficiente, despesas crescendo, pendências altas). Cite números concretos.

## 💡 Como melhorar a saúde da aba Receitas
3-5 bullets PRÁTICOS e específicos: aumentar entradas (diversificar fontes, antecipar recebíveis, renegociar prazos), reduzir despesas que estão pesando, fortalecer reserva, ajustar categorias com gasto alto. Personalize com os dados recebidos.

## ✅ Próximas ações desta semana
3-4 ações concretas no infinitivo (ex.: "Lançar receitas pendentes", "Definir meta de R$ X de reserva", "Cobrar clientes em atraso", "Revisar assinatura de Y").

Tom equilibrado, profissional e acolhedor. Nunca invente categorias ou valores que não estão nos dados. Se receitas = 0, oriente o usuário a cadastrar receitas primeiro.`;

async function callAI(userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (response.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
  if (response.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${t}`);
  }
  const data = await response.json();
  return (data.choices?.[0]?.message?.content as string) || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as { metrics?: Metrics };
    if (!body?.metrics) {
      return new Response(JSON.stringify({ error: "metrics ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userPrompt = buildPrompt(body.metrics);
    const content = await callAI(userPrompt);
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[generate-income-health-report]", e);
    return new Response(JSON.stringify({ error: e?.message || "erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
