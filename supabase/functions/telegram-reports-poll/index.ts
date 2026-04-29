import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;
const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000; // 10 min between auto-recoveries

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

async function deleteWebhook(lovableKey: string, telegramKey: string) {
  try {
    const r = await fetch(`${GATEWAY_URL}/deleteWebhook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    return { error: String(e) };
  }
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
    .select("update_offset, last_webhook_recovery_at, webhook_recovery_count")
    .eq("id", 1)
    .single();
  let currentOffset = (state as any)?.update_offset ?? 0;
  let lastRecoveryAt = (state as any)?.last_webhook_recovery_at
    ? new Date((state as any).last_webhook_recovery_at).getTime()
    : 0;
  let recoveriesThisRun = 0;
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

    const data = await r.json().catch(() => ({}));

    // Auto-recover from 409 Conflict by clearing any active webhook (once per run, with cooldown).
    const is409 =
      r.status === 409 ||
      data?.error_code === 409 ||
      (typeof data?.description === "string" && data.description.includes("terminated by other getUpdates"));

    if (!r.ok || data?.ok === false) {
      if (is409 && recoveriesThisRun < 1 && Date.now() - lastRecoveryAt > RECOVERY_COOLDOWN_MS) {
        console.warn("[reports] getUpdates 409 — running deleteWebhook recovery");
        const rec = await deleteWebhook(LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        recoveriesThisRun++;
        lastRecoveryAt = Date.now();
        await supabase
          .from("telegram_reports_bot_state")
          .update({
            last_webhook_recovery_at: new Date(lastRecoveryAt).toISOString(),
            webhook_recovery_count: ((state as any)?.webhook_recovery_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", 1);
        console.warn("[reports] auto-recovery result", rec);
        continue;
      }
      console.error("[reports] getUpdates failed", data);
      break;
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      const msg = u.message;
      if (!msg) continue;
      const chatId = msg.chat.id;
      const text = (msg.text ?? "").trim();

      // Handle /start CODE (fluxo legado: app gera código → user envia no bot)
      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/);
      // Handle /code (novo fluxo: bot gera bot_code → user digita no app)
      const codeMatch = text.match(/^\/c(?:ode|odigo|ódigo)?(?:@\w+)?\s*$/i);
      if (startMatch) {
        const code = startMatch[1];
        const { data: codeRow } = await supabase.from("telegram_reports_link_codes")
          .select("user_id, expires_at").eq("code", code).maybeSingle();

        if (!codeRow) {
          await tgSend(chatId, "❌ Código inválido ou expirado. Gere um novo na aba *Cobranças* do app.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        } else if (new Date((codeRow as any).expires_at).getTime() < Date.now()) {
          await tgSend(chatId, "⌛ Código expirado. Gere um novo na aba *Cobranças* do app.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
          await supabase.from("telegram_reports_link_codes").delete().eq("code", code);
        } else {
          await supabase.from("telegram_reports_links").upsert(
            { user_id: (codeRow as any).user_id, chat_id: chatId },
            { onConflict: "user_id" }
          );
          await supabase.from("telegram_reports_link_codes").delete().eq("user_id", (codeRow as any).user_id);
          await tgSend(chatId, "✅ *Bot de Relatórios conectado!*\n\nVocê receberá os relatórios diários de cobrança nos horários configurados.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        }
      } else if (codeMatch) {
        // Gera um bot_code curto e responde no chat. O usuário digita esse
        // código no app para vincular qualquer relatório a este bot.
        // Limpa códigos antigos deste mesmo chat para evitar acúmulo.
        await supabase.from("telegram_bots")
          .delete().eq("kind", "reports").eq("chat_id", chatId);
        let botCode = "";
        for (let i = 0; i < 6; i++) {
          botCode = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (botCode.length === 6) {
            const { data: clash } = await supabase.from("telegram_bots")
              .select("id").eq("bot_code", botCode).maybeSingle();
            if (!clash) break;
          }
        }
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const { error: insErr } = await supabase.from("telegram_bots").insert({
          bot_code: botCode, kind: "reports", chat_id: chatId, expires_at: expiresAt,
        });
        if (insErr) {
          await tgSend(chatId, "⚠️ Não consegui gerar o código agora. Tente novamente em instantes.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        } else {
          await tgSend(chatId,
            `🔑 *Seu código de vínculo:*\n\n\`${botCode}\`\n\n` +
            `1. Abra o app\n2. Vá em *Configurações → Bot de Relatórios*\n` +
            `3. Cole este código no campo *"Tenho um código"*\n\n` +
            `_Válido por 15 min._`,
            LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
        }
      } else if (text === "/start" || text === "/help") {
        await tgSend(chatId, "👋 Este é o *Bot de Relatórios* do EmprestAI.\n\nPara conectar, abra a aba *Relatórios → Cobranças* no app e gere um código de vínculo, ou envie /code aqui e cole o código no app.", LOVABLE_API_KEY, TELEGRAM_REPORTS_KEY);
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
