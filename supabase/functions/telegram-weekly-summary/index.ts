import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtBRL(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function todayInTZ(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDateBR(iso: string) {
  return iso.split("-").reverse().join("/");
}

async function tgSend(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  const r = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  if (!r.ok) console.error("sendMessage failed", r.status, await r.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");
  if (!forceUserId) {
    return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: corsHeaders });
  }

  // Auth check — user must be themselves
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "Auth required" }), { status: 401, headers: corsHeaders });
  }
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
  }
  if (user.id !== forceUserId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
  }

  const today = todayInTZ();
  const weekStart = addDaysISO(today, -6); // last 7 days inclusive

  // Resolve chat
  const { data: link } = await admin.from("telegram_links")
    .select("chat_id").eq("user_id", forceUserId).maybeSingle();
  if (!link) {
    return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no_link" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Last 7 days personal expenses
  const { data: expenses } = await admin.from("expenses")
    .select("amount, category, paid_date")
    .eq("user_id", forceUserId)
    .eq("scope", "personal")
    .eq("paid", true)
    .gte("paid_date", weekStart)
    .lte("paid_date", today);

  const totalWeek = (expenses ?? []).reduce((s, e: any) => s + Number(e.amount || 0), 0);

  // Per-day totals
  const byDay = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    byDay.set(addDaysISO(weekStart, i), 0);
  }
  for (const e of expenses ?? []) {
    const d = (e as any).paid_date as string;
    if (byDay.has(d)) byDay.set(d, (byDay.get(d) ?? 0) + Number((e as any).amount || 0));
  }

  // Per-category totals
  const byCategory = new Map<string, number>();
  for (const e of expenses ?? []) {
    const cat = (e as any).category || "Outros";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number((e as any).amount || 0));
  }

  const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const lines: string[] = [];
  lines.push(`📅 *Resumo semanal* — ${fmtDateBR(weekStart)} a ${fmtDateBR(today)}`);
  lines.push("");
  lines.push(`💸 Total da semana: *${fmtBRL(totalWeek)}*`);
  lines.push(`   (${(expenses ?? []).length} ${(expenses ?? []).length === 1 ? "despesa" : "despesas"})`);

  lines.push("");
  lines.push("🗓️ *Por dia:*");
  for (const [iso, amt] of byDay) {
    const d = new Date(`${iso}T12:00:00Z`);
    const dayName = dayNames[d.getUTCDay()];
    lines.push(`   ${dayName} ${iso.slice(8, 10)}/${iso.slice(5, 7)}: ${fmtBRL(amt)}`);
  }

  if (byCategory.size > 0) {
    lines.push("");
    lines.push("📂 *Por categoria:*");
    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    for (const [cat, amt] of sorted) {
      const pct = totalWeek > 0 ? Math.round((amt / totalWeek) * 100) : 0;
      lines.push(`   • ${cat}: ${fmtBRL(amt)} (${pct}%)`);
    }
  }

  await tgSend(Number(link.chat_id), lines.join("\n"), LOVABLE_API_KEY, TELEGRAM_API_KEY);

  return new Response(JSON.stringify({ ok: true, sent: 1 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
