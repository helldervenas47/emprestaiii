import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface CategoryStat {
  category: string;
  spent: number;
  budget: number;
  pct: number;
  status: "ok" | "warning" | "exceeded";
  trend?: "up" | "down" | "stable";
  prevSpent?: number;
}

async function buildContext(supabase: any, ownerId: string, month: string) {
  const monthStart = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const monthEndDate = new Date(y, m, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

  const prevD = new Date(y, m - 2, 1);
  const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
  const prevStart = `${prevMonth}-01`;
  const prevEndDate = new Date(prevD.getFullYear(), prevD.getMonth() + 1, 0);
  const prevEnd = `${prevEndDate.getFullYear()}-${String(prevEndDate.getMonth() + 1).padStart(2, "0")}-${String(prevEndDate.getDate()).padStart(2, "0")}`;

  const { data: allBudgets } = await supabase
    .from("personal_budgets")
    .select("category, amount, month")
    .eq("user_id", ownerId);

  let budgets: { category: string; amount: number }[] = [];
  if (allBudgets && allBudgets.length > 0) {
    const monthsAvailable = Array.from(new Set((allBudgets as any[]).map((b) => b.month as string))).sort();
    let sourceMonth: string | null = null;
    if (monthsAvailable.includes(month)) sourceMonth = month;
    else {
      const previous = [...monthsAvailable].reverse().find((mm: string) => mm < month);
      sourceMonth = previous ?? monthsAvailable.find((mm: string) => mm > month) ?? null;
    }
    if (sourceMonth) {
      budgets = (allBudgets as any[])
        .filter((b) => b.month === sourceMonth)
        .map((b) => ({ category: b.category, amount: Number(b.amount) }));
    }
  }

  // IMPORTANT: include all expenses for the month (paid and unpaid) so the
  // analysis reflects the total committed/forecasted amount, not only what was already paid.
  const { data: expenses } = await supabase
    .from("expenses")
    .select("category, amount, type, installments, due_date, paid")
    .eq("user_id", ownerId)
    .eq("scope", "personal")
    .gte("due_date", monthStart)
    .lte("due_date", monthEnd);

  const { data: prevExpenses } = await supabase
    .from("expenses")
    .select("category, amount, type, installments, due_date")
    .eq("user_id", ownerId)
    .eq("scope", "personal")
    .gte("due_date", prevStart)
    .lte("due_date", prevEnd);

  const sumByCategory = (rows: any[]) => {
    const map = new Map<string, number>();
    for (const e of rows || []) {
      const isRec = e.type === "recorrente" && e.installments && e.installments > 1;
      const amt = isRec ? Number(e.amount) / Number(e.installments) : Number(e.amount);
      map.set(e.category, (map.get(e.category) || 0) + amt);
    }
    return map;
  };

  const spent = sumByCategory(expenses || []);
  const prevSpent = sumByCategory(prevExpenses || []);

  const categoriesSet = new Set<string>([
    ...budgets.map((b) => b.category),
    ...spent.keys(),
  ]);

  const stats: CategoryStat[] = [];
  for (const cat of categoriesSet) {
    const budget = budgets.find((b) => b.category === cat)?.amount ?? 0;
    const sp = spent.get(cat) || 0;
    const ps = prevSpent.get(cat) || 0;
    const pct = budget > 0 ? (sp / budget) * 100 : 0;
    let status: "ok" | "warning" | "exceeded" = "ok";
    if (budget > 0) {
      if (pct > 100) status = "exceeded";
      else if (pct >= 80) status = "warning";
    }
    let trend: "up" | "down" | "stable" = "stable";
    if (ps > 0) {
      const change = (sp - ps) / ps;
      if (change > 0.15) trend = "up";
      else if (change < -0.15) trend = "down";
    } else if (sp > 0) trend = "up";

    stats.push({ category: cat, spent: sp, budget, pct, status, trend, prevSpent: ps });
  }

  stats.sort((a, b) => b.spent - a.spent);

  const totalSpent = stats.reduce((s, x) => s + x.spent, 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);

  return { stats, totalSpent, totalBudget, month, prevMonth };
}

function buildPrompt(ctx: any) {
  const lines: string[] = [];
  lines.push(`Mês de referência: ${ctx.month}`);
  lines.push(`Total previsto no mês (pagos + a pagar): ${fmt(ctx.totalSpent)} | Total orçado: ${fmt(ctx.totalBudget)}`);
  lines.push("");
  lines.push("Categorias (total previsto / orçamento / % / tendência vs mês anterior):");
  for (const s of ctx.stats) {
    const trendLabel = s.trend === "up" ? "↑ alta" : s.trend === "down" ? "↓ queda" : "→ estável";
    const budgetTxt = s.budget > 0 ? `${fmt(s.budget)} (${s.pct.toFixed(0)}%)` : "sem limite";
    lines.push(`- ${s.category}: ${fmt(s.spent)} previstos / ${budgetTxt} | ${trendLabel} (anterior: ${fmt(s.prevSpent || 0)})`);
  }
  return lines.join("\n");
}

async function callAI(systemPrompt: string, userPrompt: string) {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Prefer Lovable AI Gateway if available, otherwise use direct Gemini API
  const useGateway = !!LOVABLE_API_KEY;
  const url = useGateway 
    ? "https://api.lovable.dev/v1/chat/completions" 
    : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  
  const authKey = useGateway ? LOVABLE_API_KEY : GEMINI_API_KEY;
  
  if (!authKey) {
    throw new Error("Neither LOVABLE_API_KEY nor GEMINI_API_KEY is configured.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authKey}`,
    },
    body: JSON.stringify({
      model: useGateway ? "gpt-4o-mini" : "gemini-2.0-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (response.status === 429) {
    throw new Error("Rate limit excedido. Tente novamente em alguns instantes.");
  }
  if (response.status === 402 || response.status === 401) {
    throw new Error("Erro de autenticação ou créditos de IA esgotados. Verifique as chaves no Dashboard.");
  }
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`AI gateway error ${response.status}: ${t}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content as string;
}

const TONE_INSTRUCTIONS: Record<string, string> = {
  balanced: "Tom equilibrado, profissional e acolhedor — como Nathalia Arcuri ou Thiago Nigro: claro, direto e empático.",
  strict: "Tom RIGOROSO e direto, sem rodeios. Aponte estouros e desperdícios com firmeza, use linguagem de cobrança responsável (ex.: 'isso precisa parar', 'corte agora'). Evite elogios desnecessários.",
  motivational: "Tom MOTIVACIONAL e encorajador. Celebre conquistas (mesmo pequenas), use linguagem positiva e inspiradora ('você consegue', 'ótimo passo'), foque em progresso e potencial.",
  technical: "Tom TÉCNICO e analítico. Use percentuais, comparativos numéricos e terminologia financeira (variação MoM, share da carteira, ticket médio). Mínimo de emojis, máximo de objetividade.",
  friendly: "Tom AMIGÁVEL e conversacional, como um amigo próximo dando dicas. Use linguagem informal, descontraída, com analogias do dia a dia. Evite jargão.",
};

function buildSystemPrompt(tone: string): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.balanced;
  return `Você é um consultor financeiro pessoal especializado em análise de gastos. Recebe um resumo mensal de gastos por categoria com orçamentos definidos pelo usuário e tendência vs o mês anterior.

TOM DE VOZ DESTA RESPOSTA: ${toneInstruction}

Sua resposta DEVE ser em português do Brasil, em formato Markdown enxuto, sem títulos H1, com no máximo 280 palavras, organizada nestas seções (use exatamente esses títulos com ##):

## 📊 Visão geral
1-2 frases objetivas sobre o estado geral do mês (saudável, atenção, alerta).

## ⚠️ Pontos críticos
Liste como bullets as categorias que estouraram OU estão acima de 80%. Para cada uma: nome em **negrito**, % do orçamento e impacto. Se nenhuma, diga "Nenhum estouro detectado este mês.".

## 💡 Oportunidades de redução
2-3 bullets PRÁTICAS e específicas (não genéricas). Considere a tendência (↑/↓) e categorias com gasto alto sem orçamento.

## ✅ Próximas ações
2-3 ações concretas que o usuário pode executar essa semana. Use verbos no infinitivo (ex.: "Definir limite", "Renegociar", "Revisar assinaturas").

Mantenha o tom solicitado em TODAS as seções. Nunca invente categorias que não estão nos dados.`;
}

function buildCategorySystemPrompt(tone: string, category: string): string {
  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? TONE_INSTRUCTIONS.balanced;
  return `Você é um consultor financeiro pessoal. Vai analisar UMA ÚNICA categoria de despesas pessoais: **${category}**.

TOM DE VOZ: ${toneInstruction}

Resposta em português do Brasil, Markdown enxuto, máximo 220 palavras, sem títulos H1. Use EXATAMENTE estas seções com ##:

## 📊 Análise da categoria
Diagnóstico específico de **${category}**: total previsto no mês (somando pagos + a pagar), % comprometido do orçamento, comparação com mês anterior e share dentro do total mensal previsto. 2-3 frases.

## 🚨 Problemas identificados
Bullets curtos: estouro de orçamento, recorrência elevada, picos atípicos, ausência de limite, etc. Se nada relevante, diga "Sem problemas críticos detectados.".

## 💰 Sugestões práticas de redução
2-4 bullets ESPECÍFICOS para **${category}** (não genéricos). Inclua estimativas de economia quando possível (ex.: "renegociar plano pode poupar ~R$ 40/mês").

## 🎯 Recomendações de controle
2-3 ações concretas para manter a categoria sob controle nos próximos meses (ex.: "definir limite de R$ X", "criar alerta em 70%", "revisar assinaturas mensalmente").

Foque APENAS em **${category}**. Não comente outras categorias. Nunca invente dados.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let ownerId: string | null = null;
    let force = false;
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    
    // External Supabase logic
    const externalUrl = "https://syyxnqzxqabeuqbuptkh.supabase.co";
    const externalKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const externalSupabase = createClient(externalUrl, externalKey);

    if (token) {
      // Validate token against the EXTERNAL Supabase where users are actually authenticated
      const { data: userData } = await externalSupabase.auth.getUser(token);
      if (userData?.user) {
        const { data: ownerRow } = await supabase
          .from("user_owner")
          .select("owner_id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        ownerId = (ownerRow as any)?.owner_id || userData.user.id;
      }
    }
    if (!ownerId && body.user_id) {
      ownerId = body.user_id;
    }
    if (!ownerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    force = !!body.force;
    const month = body.month || currentMonth();
    const targetCategory: string | undefined = body.category;

    // Per-category mode: ad-hoc, not cached
    if (targetCategory) {
      const ctx = await buildContext(supabase, ownerId, month);
      const stat = ctx.stats.find((s: CategoryStat) => s.category === targetCategory);
      if (!stat || (stat.spent === 0 && stat.budget === 0)) {
        return new Response(JSON.stringify({
          content: `## 📊 Análise da categoria\n\nAinda não há dados suficientes em **${targetCategory}** neste mês para uma análise detalhada.`,
          category: targetCategory,
          empty: true,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const totalShare = ctx.totalSpent > 0 ? (stat.spent / ctx.totalSpent) * 100 : 0;
      const trendLabel = stat.trend === "up" ? "↑ alta" : stat.trend === "down" ? "↓ queda" : "→ estável";
      const userPromptCat = [
        `Categoria analisada: ${targetCategory}`,
        `Mês: ${month} (anterior: ${ctx.prevMonth})`,
        `Total previsto no mês (pagos + a pagar): ${fmt(stat.spent)}`,
        `Total previsto mês anterior: ${fmt(stat.prevSpent || 0)}`,
        `Orçamento: ${stat.budget > 0 ? `${fmt(stat.budget)} (${stat.pct.toFixed(0)}% comprometido)` : "sem limite definido"}`,
        `Tendência: ${trendLabel}`,
        `Status: ${stat.status}`,
        `Share no total mensal previsto: ${totalShare.toFixed(1)}% (${fmt(stat.spent)} de ${fmt(ctx.totalSpent)})`,
      ].join("\n");

      const { data: tonePrefCat } = await supabase
        .from("personal_insights_telegram_prefs")
        .select("tone")
        .eq("user_id", ownerId)
        .maybeSingle();
      const toneCat = (tonePrefCat as any)?.tone || body.tone || "balanced";

      const contentCat = await callAI(buildCategorySystemPrompt(toneCat, targetCategory), userPromptCat);

      return new Response(JSON.stringify({
        content: contentCat,
        category: targetCategory,
        stat: { spent: stat.spent, budget: stat.budget, pct: stat.pct, trend: stat.trend, status: stat.status },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Reuse cached if generated within last 30 minutes and not forced
    if (!force) {
      const { data: existing } = await supabase
        .from("personal_ai_insights")
        .select("id, content, summary, exceeded_categories, generated_at")
        .eq("user_id", ownerId)
        .eq("month", month)
        .maybeSingle();
      if (existing) {
        const ageMs = Date.now() - new Date((existing as any).generated_at).getTime();
        if (ageMs < 30 * 60 * 1000) {
          return new Response(JSON.stringify({ ...existing, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const ctx = await buildContext(supabase, ownerId, month);
    if (ctx.stats.length === 0) {
      return new Response(JSON.stringify({
        content: "## 📊 Visão geral\n\nAinda não há despesas pessoais registradas neste mês para gerar uma análise. Comece adicionando seus gastos para receber recomendações personalizadas.",
        exceeded_categories: [],
        empty: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userPrompt = buildPrompt(ctx);

    // Load tone preference (defaults to balanced)
    const { data: tonePref } = await supabase
      .from("personal_insights_telegram_prefs")
      .select("tone")
      .eq("user_id", ownerId)
      .maybeSingle();
    const tone = (tonePref as any)?.tone || body.tone || "balanced";

    const content = await callAI(buildSystemPrompt(tone), userPrompt);

    const exceeded = ctx.stats.filter((s: CategoryStat) => s.status === "exceeded").map((s: CategoryStat) => s.category);
    const trends = ctx.stats
      .filter((s: CategoryStat) => s.trend === "up" && s.spent > 0)
      .map((s: CategoryStat) => ({ category: s.category, prev: s.prevSpent, current: s.spent }));

    // Generate a one-line summary for telegram preview
    const summary = `${exceeded.length > 0 ? `${exceeded.length} categoria(s) estourada(s)` : "Sem estouros"} • ${fmt(ctx.totalSpent)} gastos / ${fmt(ctx.totalBudget)} orçado`;

    await supabase
      .from("personal_ai_insights")
      .upsert({
        user_id: ownerId,
        month,
        content,
        summary,
        exceeded_categories: exceeded,
        trends,
        generated_at: new Date().toISOString(),
      }, { onConflict: "user_id,month" });

    return new Response(JSON.stringify({
      content, summary, exceeded_categories: exceeded, trends,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[generate-personal-insights] error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
