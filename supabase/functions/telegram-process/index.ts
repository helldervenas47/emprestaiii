import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "Alimentação", "Assinaturas", "Cartão de Crédito", "Compras", "Contas",
  "Educação", "Lazer", "Moradia", "Outros", "Pets", "Presentes", "Saúde", "Transporte",
];

const HELP_TEXT = `🤖 *Como usar*

Envie uma despesa em texto livre, ex:
• "gastei 45 no uber ontem"
• "mercado 230"
• "netflix 39,90 assinatura"

📸 Ou envie uma *foto de cupom/nota fiscal* — eu leio o comprovante e extraio o valor automaticamente.

Vou interpretar e cadastrar automaticamente.

*Comandos:*
/saldo — gastos do mês por categoria
/ultimas — últimas 5 despesas
/apagar — apaga a despesa mais recente
/help — esta mensagem
/start CODIGO — vincular conta`;

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const fmtDayMonth = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function budgetIcon(pct: number | null): string {
  if (pct === null) return "⚪";
  if (pct >= 100) return "🔴";
  if (pct >= 70) return "🟡";
  return "🟢";
}

async function handleSaldo(admin: any, userId: string): Promise<string> {
  const now = new Date();
  const monthPrefix = now.toISOString().slice(0, 7); // YYYY-MM
  const monthName = MONTH_NAMES[now.getMonth()];

  const { data: expenses } = await admin
    .from("expenses")
    .select("amount, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .eq("paid", true);

  const monthExpenses = (expenses ?? []).filter((e: any) => {
    const ref = (e.paid_date || e.due_date || "") as string;
    return ref.startsWith(monthPrefix);
  });

  const byCat = new Map<string, number>();
  let total = 0;
  for (const e of monthExpenses) {
    const amt = Number(e.amount) || 0;
    total += amt;
    byCat.set(e.category || "Outros", (byCat.get(e.category || "Outros") || 0) + amt);
  }

  const { data: budgets } = await admin
    .from("personal_budgets")
    .select("category, amount")
    .eq("user_id", userId);
  const budgetMap = new Map<string, number>();
  for (const b of budgets ?? []) budgetMap.set(b.category, Number(b.amount) || 0);

  let msg = `💰 *Gastos de ${monthName}*\nTotal: ${fmtBRL(total)}\n`;
  if (byCat.size === 0) {
    msg += `\n_Sem despesas neste mês._`;
    return msg;
  }
  msg += `\n📂 *Por categoria:*\n`;
  const sorted = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, spent] of sorted) {
    const budget = budgetMap.get(cat);
    if (budget && budget > 0) {
      const pct = (spent / budget) * 100;
      msg += `${budgetIcon(pct)} ${cat}: ${fmtBRL(spent)} / ${fmtBRL(budget)} (${pct.toFixed(0)}%)\n`;
    } else {
      msg += `${budgetIcon(null)} ${cat}: ${fmtBRL(spent)} (sem orçamento)\n`;
    }
  }
  return msg.trimEnd();
}

async function handleUltimas(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("expenses")
    .select("amount, description, category, paid_date, due_date, created_at")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("paid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (!data || data.length === 0) return "ℹ️ Nenhuma despesa registrada ainda.";

  let msg = "🧾 *Últimas despesas*\n";
  data.forEach((e: any, i: number) => {
    const date = e.paid_date || e.due_date || "";
    const dateStr = date ? fmtDayMonth(date) : "—";
    msg += `${i + 1}. ${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${e.category}) — ${dateStr}\n`;
  });
  return msg.trimEnd();
}

async function handleApagar(admin: any, userId: string): Promise<string> {
  const { data } = await admin
    .from("expenses")
    .select("id, amount, description, category, paid_date, due_date")
    .eq("user_id", userId)
    .eq("scope", "personal")
    .order("paid_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return "ℹ️ Nenhuma despesa para apagar.";

  const e = data[0];
  const { error } = await admin.from("expenses").delete().eq("id", e.id);
  if (error) return "❌ Erro ao apagar: " + error.message;

  const date = e.paid_date || e.due_date || "";
  const dateStr = date ? fmtDayMonth(date) : "—";
  return `🗑️ *Despesa removida:*\n${fmtBRL(Number(e.amount) || 0)} — ${e.description} (${e.category}) — ${dateStr}`;
}

async function tgSend(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  }).catch((e) => console.error("sendMessage err", e));
}

async function extractExpense(text: string, lovableKey: string) {
  const today = new Date().toISOString().slice(0, 10);
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `Você extrai despesas pessoais de mensagens em português brasileiro. Hoje é ${today}. Categorias permitidas: ${CATEGORIES.join(", ")}. Se faltar valor numérico, retorne confidence baixo.`,
        },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "register_expense",
          description: "Registra uma despesa pessoal extraída da mensagem",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string", description: "Descrição curta (sem o valor)" },
              amount: { type: "number", description: "Valor em reais" },
              category: { type: "string", enum: CATEGORIES },
              date: { type: "string", description: "Data YYYY-MM-DD; default hoje" },
              confidence: { type: "number", description: "0 a 1" },
            },
            required: ["description", "amount", "category", "date", "confidence"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "register_expense" } },
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("AI err", resp.status, t);
    return null;
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return null;
  try { return JSON.parse(call.function.arguments); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: messages, error } = await admin
    .from("telegram_messages")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  let processed = 0;

  for (const msg of messages ?? []) {
    const chatId = msg.chat_id as number;
    const text = (msg.text as string | null)?.trim() ?? "";

    try {
      // /start CODE → link account
      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})/i);
      if (startMatch) {
        const code = startMatch[1];
        const { data: codeRow } = await admin.from("telegram_link_codes")
          .select("*").eq("code", code).maybeSingle();
        if (!codeRow) {
          await tgSend(chatId, "❌ Código inválido ou expirado. Gere um novo no app.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (new Date(codeRow.expires_at).getTime() < Date.now()) {
          await admin.from("telegram_link_codes").delete().eq("id", codeRow.id);
          await tgSend(chatId, "⏰ Código expirado. Gere um novo no app.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else {
          // Remove any prior link for this chat or user
          await admin.from("telegram_links").delete().or(`chat_id.eq.${chatId},user_id.eq.${codeRow.user_id}`);
          const { error: linkErr } = await admin.from("telegram_links")
            .insert({ user_id: codeRow.user_id, chat_id: chatId });
          if (linkErr) {
            await tgSend(chatId, "❌ Erro ao vincular: " + linkErr.message, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            await admin.from("telegram_link_codes").delete().eq("id", codeRow.id);
            await tgSend(chatId, "✅ *Conta vinculada!*\n\n" + HELP_TEXT, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          }
        }
      } else if (/^\/start\b/i.test(text)) {
        await tgSend(chatId, "👋 Para vincular sua conta, gere um código de 6 dígitos no app e envie:\n`/start 123456`", LOVABLE_API_KEY, TELEGRAM_API_KEY);
      } else if (/^\/help\b/i.test(text)) {
        await tgSend(chatId, HELP_TEXT, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      } else if (text) {
        // Resolve user
        const { data: link } = await admin.from("telegram_links")
          .select("user_id").eq("chat_id", chatId).maybeSingle();
        if (!link) {
          await tgSend(chatId, "🔒 Conta não vinculada. Use o app para gerar um código e envie `/start CODIGO`.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (/^\/saldo(?:@\w+)?\b/i.test(text)) {
          const reply = await handleSaldo(admin, link.user_id);
          await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (/^\/ultimas(?:@\w+)?\b/i.test(text)) {
          const reply = await handleUltimas(admin, link.user_id);
          await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else if (/^\/apagar(?:@\w+)?\b/i.test(text)) {
          const reply = await handleApagar(admin, link.user_id);
          await tgSend(chatId, reply, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        } else {
          const extracted = await extractExpense(text, LOVABLE_API_KEY);
          if (!extracted || !extracted.amount || extracted.confidence < 0.6) {
            await tgSend(chatId, "🤔 Não consegui entender. Tente algo como:\n_\"mercado 80 alimentação\"_ ou _\"uber 25 ontem\"_", LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            const { error: insErr } = await admin.from("expenses").insert({
              user_id: link.user_id,
              description: extracted.description || text.slice(0, 80),
              amount: extracted.amount,
              category: CATEGORIES.includes(extracted.category) ? extracted.category : "Outros",
              due_date: extracted.date || new Date().toISOString().slice(0, 10),
              type: "fixa",
              scope: "personal",
              paid: true,
              paid_date: extracted.date || new Date().toISOString().slice(0, 10),
            });
            if (insErr) {
              await tgSend(chatId, "❌ Erro ao salvar: " + insErr.message, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            } else {
              const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(extracted.amount);
              await tgSend(chatId,
                `✅ *Despesa registrada*\n\n💰 ${fmt}\n📂 ${extracted.category}\n📝 ${extracted.description}\n📅 ${extracted.date}`,
                LOVABLE_API_KEY, TELEGRAM_API_KEY);
            }
          }
        }
      }
    } catch (e) {
      console.error("processing error", e);
    }

    await admin.from("telegram_messages")
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq("update_id", msg.update_id);
    processed++;
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
