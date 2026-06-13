// Help chat — assistente IA que conhece o app EmprestAI a fundo.
// Recebe { messages: [{role, content}] } e devolve { reply: string }.

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
7. Para perguntas sobre o nome/handle dos bots do Telegram, responda APENAS com os @usernames listados em "Bots oficiais do Telegram" abaixo (formato @nome_do_bot). NUNCA invente, suponha ou abrevie nomes de bots; se nenhum estiver listado, diga que ainda não há bots ativos configurados.`;

interface ChatMsg { role: "user" | "assistant" | "system"; content: string }

async function fetchBotsContext(): Promise<string> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return "";
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.4");
    const supa = createClient(url, key);
    const { data } = await supa
      .from("system_telegram_bots")
      .select("bot_username, purpose, label, is_active")
      .eq("is_active", true);
    if (!data || data.length === 0) return "";
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

    // Limita histórico para 12 últimas mensagens
    const trimmed = messages.slice(-12);
    const botsContext = await fetchBotsContext();
    const systemContent = SYSTEM_PROMPT + botsContext;


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
