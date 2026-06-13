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
- Configurações: usuários (papéis admin/gerente/operador/visualizador/cliente), permissões por aba, marca/branding, integrações (Telegram, WhatsApp), notificações push, plano (Paddle).
- Sistema: backups, migrações, painel-migração.
- Onboarding: novos usuários passam por /bem-vindo (3 passos) e recebem categorias padrão.
- Cofrinhos: poupança com rendimento CDI e cálculo de IR.
- Telegram/WhatsApp: bots para receber resumos diários, semanais, vencimentos, cobranças automáticas.
- Planos: /planos com checkout Paddle.

Regras de resposta:
1. Responda SEMPRE em português do Brasil, tom amigável e direto.
2. Use markdown leve (negrito, listas curtas). Nada de respostas enormes.
3. Quando útil, cite o caminho/menu exato (ex: "vá em Configurações → Usuários").
4. Se não souber algo específico do app, diga que vai verificar e sugira contato com suporte — nunca invente recurso que não existe.
5. Para perguntas fora do escopo (não relacionadas ao EmprestAI ou finanças do negócio), redirecione gentilmente.
6. Nunca exponha chaves, IDs internos, nem dê instruções para acessar painéis administrativos do Lovable/Supabase.`;

interface ChatMsg { role: "user" | "assistant" | "system"; content: string }

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

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "X-Lovable-AIG-SDK": "edge-function-fetch",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
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
