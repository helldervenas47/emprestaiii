// Help chat — assistente IA que conhece o app EmprestAI a fundo.
// Recebe { messages: [{role, content}] } e devolve { reply: string }.
//
// Aprendizado incremental: cada par (pergunta, resposta) é salvo na tabela
// public.help_chat_knowledge no projeto externo e usado como contexto
// adicional (RAG simples por keyword) nas próximas conversas.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
};

const SYSTEM_PROMPT = `Você é o "Assistente EmprestAI" — um especialista no aplicativo EmprestAI, criado para ajudar agiotas, lojistas e pequenos empreendedores a gerenciarem empréstimos, vendas, despesas pessoais e do negócio, veículos, boletos, folha de pagamento e relatórios.

Conheça o app a fundo. Áreas principais:
- Dashboard: visão geral de capital ativo, lucro, inadimplência, gráficos por mês.
- Empréstimos: cadastro de empréstimos com parcelas semanais/mensais/diárias, juros mensais, renegociações, multas por atraso, simulações em PDF, contratos.
- Vendas/Produtos: estoque, movimentações, vendas parceladas (vira empréstimo automaticamente).
- Veículos: registro e saldo veicular (consórcios/vendas).
- Calendário: vencimentos do dia, semana e mês, planejamento do dia (/planejamento-do-dia).
- Cadastro/Clientes: dados, risco, histórico, anexos.
- Receitas e Despesas (pessoais e do negócio): categorias personalizadas, orçamentos mensais, insights de IA, cofrinhos (/cofrinhos) com rendimento e imposto.
- Boletos: leitura de linha digitável, deep links para bancos, pagamento PIX.
- Salário/Folha: payrolls, payslips, comissões de gerente.
- Contador: relatórios contábeis, auditoria.
- Relatório: inadimplência, vencimentos da semana, exportação CSV/PDF.
- Configurações: usuários (papéis admin/gerente/operador/visualizador/cliente), permissões por aba, marca/branding, integração com Telegram, notificações push, plano (Paddle).
- Sistema: backups, migrações, painel-migração.
- Onboarding: novos usuários passam por /bem-vindo (3 passos) e recebem categorias padrão.
- Cofrinhos: poupança com rendimento CDI e cálculo de IR.
- Telegram: bots para receber resumos diários, semanais, vencimentos, cobranças automáticas. O app NÃO possui integração com WhatsApp.
- Planos: /planos com checkout Paddle.

Regras de resposta:
1. Responda SEMPRE em português do Brasil, tom amigável e direto.
2. Use markdown leve (negrito, listas curtas). Nada de respostas enormes.
3. Quando útil, cite o caminho/menu exato (ex: "vá em Configurações → Usuários").
4. Se não souber algo específico do app, diga que vai verificar e sugira contato com suporte — nunca invente recurso que não existe.
5. Para perguntas fora do escopo (não relacionadas ao EmprestAI ou finanças do negócio), redirecione gentilmente.
6. Nunca exponha chaves, IDs internos, nem dê instruções para acessar painéis administrativos do Lovable/Supabase.
7. Para perguntas sobre o nome/handle dos bots do Telegram, responda APENAS com os @usernames listados em "Bots oficiais do Telegram" abaixo (formato @nome_do_bot). NUNCA invente, suponha ou abrevie nomes de bots; se nenhum estiver listado, diga que ainda não há bots ativos configurados.
8. O EmprestAI NÃO tem integração com WhatsApp. Se o usuário perguntar sobre WhatsApp, deixe claro que essa integração não existe e ofereça o Telegram como alternativa. Nunca invente recursos de WhatsApp.
9. Quando houver "Conhecimento aprendido de conversas anteriores" no contexto, use-o como referência de respostas que já funcionaram bem — mas só repita a informação se ela estiver realmente correta e alinhada às regras acima.`;

interface ChatMsg { role: "user" | "assistant" | "system"; content: string }

// --- Clientes Supabase ---------------------------------------------------
// Cloud (para system_telegram_bots — onde a lista de bots vive)
async function getCloudClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
  return createClient(url, key);
}

// External (onde fica a base de conhecimento incremental do help-chat)
async function getExternalClient() {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL");
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
  return createClient(url, key);
}

// --- Bootstrap da tabela (idempotente, roda apenas se necessário) --------
let bootstrapped = false;
async function ensureKnowledgeTable(supa: any) {
  if (bootstrapped) return;
  const sql = `
    CREATE TABLE IF NOT EXISTS public.help_chat_knowledge (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NULL,
      question text NOT NULL,
      answer text NOT NULL,
      search_text text GENERATED ALWAYS AS (lower(question || ' ' || answer)) STORED,
      upvotes int NOT NULL DEFAULT 0,
      downvotes int NOT NULL DEFAULT 0,
      approved boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS help_chat_knowledge_search_idx
      ON public.help_chat_knowledge USING gin (to_tsvector('simple', search_text));
    CREATE INDEX IF NOT EXISTS help_chat_knowledge_created_idx
      ON public.help_chat_knowledge (created_at DESC);
    ALTER TABLE public.help_chat_knowledge ENABLE ROW LEVEL SECURITY;
  `;
  try {
    await supa.rpc("exec_sql", { sql_query: sql });
    bootstrapped = true;
  } catch (e) {
    console.warn("[help-chat] bootstrap falhou (talvez já exista):", e);
    bootstrapped = true; // não tenta de novo nesta instância
  }
}

// --- Contexto: bots do Telegram -----------------------------------------
async function fetchBotsContext(): Promise<string> {
  try {
    const supa = await getExternalClient();
    if (!supa) return "\n\nBots oficiais do Telegram: (não foi possível consultar — NÃO invente @usernames).";
    const { data, error } = await supa
      .from("system_telegram_bots")
      .select("bot_username, purpose, label, is_active")
      .eq("is_active", true);
    if (error) console.warn("[help-chat] fetchBotsContext erro:", error);
    if (!data || data.length === 0) {
      return "\n\nBots oficiais do Telegram: (nenhum bot ativo cadastrado — NÃO invente @usernames, diga que ainda não há bots configurados).";
    }
    const lines = data
      .map((b: any) => {
        const handle = b.bot_username ? `@${String(b.bot_username).replace(/^@/, "")}` : "(sem username)";
        const purpose = b.purpose ? ` — ${b.purpose}` : "";
        const label = b.label ? ` (${b.label})` : "";
        return `- ${handle}${label}${purpose}`;
      })
      .join("\n");
    return `\n\nBots oficiais do Telegram (use EXATAMENTE estes @usernames ao responder; nunca invente outros):\n${lines}`;
  } catch {
    return "";
  }
}

// --- Conhecimento incremental -------------------------------------------
const STOPWORDS = new Set([
  "a","o","e","de","do","da","dos","das","em","no","na","um","uma","para","por",
  "com","que","como","qual","quais","quando","onde","sobre","ao","à","os","as",
  "se","sem","ser","tem","ter","sou","é","são","meu","minha","seu","sua","pode",
  "posso","faço","faz","the","of","to","and","in","is","it","i","you","do","what"
]);

function extractKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ).slice(0, 8);
}

async function fetchKnowledgeContext(question: string): Promise<string> {
  try {
    const supa = await getExternalClient();
    if (!supa) return "";
    await ensureKnowledgeTable(supa);

    const keywords = extractKeywords(question);
    if (keywords.length === 0) return "";

    // Busca por OR de ilike em search_text — simples e barato.
    let query = supa
      .from("help_chat_knowledge")
      .select("question, answer, upvotes")
      .eq("approved", true)
      .limit(5);

    const orExpr = keywords.map((k) => `search_text.ilike.%${k}%`).join(",");
    query = query.or(orExpr).order("upvotes", { ascending: false }).order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error || !data || data.length === 0) return "";

    const lines = data
      .map((r: any, i: number) => `(${i + 1}) P: ${r.question}\n    R: ${String(r.answer).slice(0, 600)}`)
      .join("\n\n");
    return `\n\nConhecimento aprendido de conversas anteriores (use como referência, ignore se estiver errado):\n${lines}`;
  } catch (e) {
    console.warn("[help-chat] fetchKnowledgeContext falhou:", e);
    return "";
  }
}

async function saveKnowledge(question: string, answer: string, userId: string | null) {
  try {
    const supa = await getExternalClient();
    if (!supa) return;
    await ensureKnowledgeTable(supa);
    if (!question || !answer) return;
    // Evita lixo: respostas de erro não viram conhecimento.
    if (answer.startsWith("⚠️") || answer.toLowerCase().includes("não consegui gerar")) return;
    await supa.from("help_chat_knowledge").insert({
      user_id: userId,
      question: question.slice(0, 2000),
      answer: answer.slice(0, 4000),
    });
  } catch (e) {
    console.warn("[help-chat] saveKnowledge falhou:", e);
  }
}

// --- Handler -------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages?: ChatMsg[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pergunta atual = última mensagem do usuário
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const currentQuestion = lastUser?.content?.trim() || "";

    // Identifica o user_id (best-effort, sem bloquear se falhar)
    let userId: string | null = null;
    try {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (token) {
        const supa = await getExternalClient();
        if (supa) {
          const { data } = await supa.auth.getUser(token);
          userId = data.user?.id ?? null;
        }
      }
    } catch { /* ignore */ }

    const trimmed = messages.slice(-12);
    const [botsContext, knowledgeContext] = await Promise.all([
      fetchBotsContext(),
      currentQuestion ? fetchKnowledgeContext(currentQuestion) : Promise.resolve(""),
    ]);
    const systemContent = SYSTEM_PROMPT + botsContext + knowledgeContext;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "edge-function-fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemContent }, ...trimmed],
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      const status = resp.status === 429 || resp.status === 402 ? resp.status : 500;
      const msg =
        resp.status === 429
          ? "Muitas requisições — aguarde alguns segundos e tente de novo."
          : resp.status === 402
          ? "Créditos de IA esgotados. Adicione créditos no workspace."
          : `Erro IA: ${txt.slice(0, 200)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Não consegui gerar resposta.";

    // Salva no conhecimento (não bloqueia a resposta).
    if (currentQuestion) {
      saveKnowledge(currentQuestion, reply, userId).catch(() => {});
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
