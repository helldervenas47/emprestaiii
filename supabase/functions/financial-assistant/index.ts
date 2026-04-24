import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Msg = { role: "user" | "assistant" | "system"; content: string };

function fmtBRL(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

async function buildContext(admin: ReturnType<typeof createClient>, ownerId: string): Promise<string> {
  const today = todayISO();
  const monthStart = startOfMonthISO();
  const in7 = new Date();
  in7.setDate(in7.getDate() + 7);
  const in7ISO = in7.toISOString().slice(0, 10);

  const [loansRes, clientsRes, expensesRes, goalsRes] = await Promise.all([
    admin.from("loans").select("id,client_id,amount,remaining_amount,due_date,status,installments,paid_installments,auto_billing_enabled").eq("user_id", ownerId),
    admin.from("clients").select("id,name").eq("user_id", ownerId),
    admin.from("expenses").select("amount,date,category").eq("user_id", ownerId).gte("date", monthStart),
    admin.from("monthly_goals").select("month,target_revenue,target_profit").eq("user_id", ownerId).eq("month", monthStart.slice(0, 7)).maybeSingle(),
  ]);

  const loans = (loansRes.data ?? []) as any[];
  const clients = (clientsRes.data ?? []) as any[];
  const expenses = (expensesRes.data ?? []) as any[];
  const goal = goalsRes.data as any;

  const clientMap = new Map<string, string>(clients.map((c) => [c.id, c.name]));

  const active = loans.filter((l) => l.status !== "quitado" && l.status !== "perdido");
  const overdue = active.filter((l) => l.due_date && l.due_date < today);
  const dueSoon = active.filter((l) => l.due_date && l.due_date >= today && l.due_date <= in7ISO);

  const totalReceivable = active.reduce((s, l) => s + Number(l.remaining_amount ?? l.amount ?? 0), 0);
  const totalOverdue = overdue.reduce((s, l) => s + Number(l.remaining_amount ?? l.amount ?? 0), 0);
  const totalDueSoon = dueSoon.reduce((s, l) => s + Number(l.remaining_amount ?? l.amount ?? 0), 0);
  const totalExpensesMonth = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const topOverdue = [...overdue]
    .sort((a, b) => Number(b.remaining_amount ?? 0) - Number(a.remaining_amount ?? 0))
    .slice(0, 5)
    .map((l) => ({
      cliente: clientMap.get(l.client_id) ?? "Desconhecido",
      valor: fmtBRL(l.remaining_amount ?? l.amount),
      vencimento: l.due_date,
      cobranca_auto: l.auto_billing_enabled !== false,
    }));

  const ctx = {
    data_hoje: today,
    contratos: {
      total: loans.length,
      ativos: active.length,
      vencidos: overdue.length,
      vencendo_em_7_dias: dueSoon.length,
      total_a_receber: fmtBRL(totalReceivable),
      total_vencido: fmtBRL(totalOverdue),
      total_a_vencer_7d: fmtBRL(totalDueSoon),
      top_5_inadimplentes: topOverdue,
    },
    clientes: { total: clients.length },
    despesas_mes: {
      total: fmtBRL(totalExpensesMonth),
      quantidade: expenses.length,
    },
    meta_mes: goal
      ? { receita_alvo: fmtBRL(goal.target_revenue), lucro_alvo: fmtBRL(goal.target_profit) }
      : "Nenhuma meta definida para o mês",
  };

  return JSON.stringify(ctx, null, 2);
}

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
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (claimsErr || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve data owner
    const { data: ownerRow } = await admin.rpc("get_data_owner_id", { _user_id: userId });
    const ownerId = (ownerRow as string) ?? userId;

    const body = await req.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];

    const context = await buildContext(admin, ownerId);

    const systemPrompt = [
      "Você é um assistente financeiro especialista em crédito, cobrança e gestão de empréstimos pessoais.",
      "Responda em português, de forma direta, executiva e acionável.",
      "Use markdown (listas, negrito) para clareza. Cite valores e nomes específicos do contexto.",
      "NUNCA invente dados. Se a resposta não estiver no contexto, diga que não tem essa informação.",
      "Quando recomendar ações, seja específico: o que fazer, com quem e quando.",
      "",
      "=== CONTEXTO FINANCEIRO ATUAL DO USUÁRIO ===",
      context,
      "=== FIM DO CONTEXTO ===",
    ].join("\n");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.filter((m) => m.role === "user" || m.role === "assistant"),
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Configurações do Workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("financial-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
