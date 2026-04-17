import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

async function tgSend(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

Deno.serve(async () => {
  const startTime = Date.now();
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
  const TELEGRAM_REPORTS_KEY = Deno.env.get("TELEGRAM_API_KEY_1")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!LOVABLE_API_KEY || !TELEGRAM_REPORTS_KEY) {
    return new Response(JSON.stringify({ error: "Missing keys" }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: state } = await supabase
    .from("telegram_reports_bot_state")
    .select("update_offset").eq("id", 1).single();
  let currentOffset = state?.update_offset ?? 0;
  let totalProcessed = 0;

  while (true) {
    const remainingMs = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const r = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_REPORTS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message"] }),
    });

    const data = await r.json();
    if (!r.ok) {
      console.error("getUpdates failed", data);
      break;
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      const msg = u.message;
      if (!msg) continue;
      const chatId = msg.chat.id;
      const text = (msg.text ?? "").trim();

      // Handle /start CODE
      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/);
      if (startMatch) {
        const code = startMatch[1];
        const { data: codeRow } = await supabase.from("telegram_reports_link_codes")
          .select("user_id, expires_at").eq("code", code).maybeSingle();

        if (!codeRow) {
          await tgSend(chatId, "❌ Código inválido ou expirado. Gere um novo na aba *Cobranças* do app.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        } else if (new Date(codeRow.expires_at).getTime() < Date.now()) {
          await tgSend(chatId, "⌛ Código expirado. Gere um novo na aba *Cobranças* do app.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
          await supabase.from("telegram_reports_link_codes").delete().eq("code", code);
        } else {
          await supabase.from("telegram_reports_links").upsert(
            { user_id: codeRow.user_id, chat_id: chatId },
            { onConflict: "user_id" }
          );
          await supabase.from("telegram_reports_link_codes").delete().eq("user_id", codeRow.user_id);
          await tgSend(chatId, "✅ *Bot de Relatórios conectado!*\n\nVocê receberá os relatórios diários de cobrança nos horários configurados.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        }
      } else if (text === "/start" || text === "/help") {
        await tgSend(chatId, "👋 Este é o *Bot de Relatórios* do EmprestAI.\n\nPara conectar, abra a aba *Relatórios → Cobranças* no app e gere um código de vínculo.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
      }

      totalProcessed++;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase.from("telegram_reports_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() }).eq("id", 1);
    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed }), {
    headers: { "Content-Type": "application/json" },
  });
});
