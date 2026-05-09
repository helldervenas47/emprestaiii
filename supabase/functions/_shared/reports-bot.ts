// Shared helpers for the GLOBAL "reports" Telegram bot.
// Bots are now system-wide (table: system_telegram_bots) and the same bot is
// reused by every account. Per-account routing is done via telegram_reports_links
// (chat_id linked through the /code flow).

export interface ReportsBot {
  id: string;
  token: string;
  name: string;
  bot_username: string | null;
}

/**
 * Returns the active GLOBAL "reports" bot.
 * The same bot is shared by every account in the system.
 */
export async function getReportsBot(supabase: any): Promise<ReportsBot | null> {
  const { data, error } = await supabase
    .from("system_telegram_bots")
    .select("id, token, name, bot_username, purpose")
    .eq("active", true)
    .eq("purpose", "reports");

  if (error) {
    console.error("[getReportsBot] query error", error);
    return null;
  }
  if (!data?.length) return null;

  const chosen = (data as any[])[0];
  if (!chosen?.token) return null;
  return {
    id: chosen.id,
    token: chosen.token,
    name: chosen.name,
    bot_username: chosen.bot_username,
  };
}

/**
 * Backwards-compatible alias. The userId argument is ignored — the bot is global.
 */
export async function getReportsBotForUser(
  supabase: any,
  _userId: string,
): Promise<ReportsBot | null> {
  return getReportsBot(supabase);
}

/**
 * Sends a Telegram message via the raw Bot API, with a Markdown-fallback retry
 * on parse errors and clear logging.
 */
export async function tgDirectSend(
  token: string,
  chatId: number | string,
  text: string,
  opts?: { parse_mode?: "Markdown" | "HTML" },
): Promise<boolean> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const parse_mode = opts?.parse_mode ?? "Markdown";

  const send = async (payload: Record<string, unknown>) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

  try {
    let r = await send({ chat_id: chatId, text, parse_mode });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[reports-bot] sendMessage failed ${r.status}`, body);
      if (r.status === 400) {
        r = await send({ chat_id: chatId, text });
        if (!r.ok) {
          const body2 = await r.text().catch(() => "");
          console.error(`[reports-bot] plain retry failed ${r.status}`, body2);
          return false;
        }
        return true;
      }
      return false;
    }
    return true;
  } catch (e) {
    console.error("[reports-bot] sendMessage exception", e);
    return false;
  }
}

/**
 * Resolves the reports bot that the given chat was linked through (via /code).
 * Only telegram_reports_links is considered here; reports must never fall back
 * to the expenses link, even if both links share the same chat_id.
 */
export async function getBotForChat(
  supabase: any,
  userId: string,
  chatId: number | string,
): Promise<ReportsBot | null> {
  const numericChat = Number(chatId);

  // Prefer the reports link for this user+chat
  const { data: rLink } = await supabase
    .from("telegram_reports_links")
    .select("bot_id")
    .eq("user_id", userId)
    .eq("chat_id", numericChat)
    .maybeSingle();

  const botId: string | null = (rLink as any)?.bot_id ?? null;

  if (botId) {
    const { data: bot } = await supabase
      .from("system_telegram_bots")
      .select("id, token, name, bot_username, active, purpose")
      .eq("id", botId)
      .maybeSingle();
    if (bot && (bot as any).active && (bot as any).purpose === "reports" && (bot as any).token) {
      return {
        id: (bot as any).id,
        token: (bot as any).token,
        name: (bot as any).name,
        bot_username: (bot as any).bot_username,
      };
    }
  }
  return null;
}

/**
 * Combined helper: routes the message through the SAME bot the user linked
 * with /code (resolved via chat_id). Falls back to the default global reports
 * bot only if the link has no bot_id (legacy rows).
 */
export async function sendReportsMessage(
  supabase: any,
  userId: string,
  chatId: number | string,
  text: string,
  opts?: { parse_mode?: "Markdown" | "HTML" },
): Promise<{ sent: boolean; reason?: string }> {
  let bot = await getBotForChat(supabase, userId, chatId);
  if (!bot) {
    bot = await getReportsBot(supabase);
    if (bot) {
      console.warn(
        `[reports-bot] No bot_id on link for user=${userId} chat=${chatId}; ` +
          `falling back to default global reports bot=${bot.id}`,
      );
    }
  }
  if (!bot) {
    console.warn(
      "[reports-bot] No bot resolved for chat and no GLOBAL reports bot configured. " +
        "Ask the user to /code again, or an admin to register a bot.",
    );
    return { sent: false, reason: "no_reports_bot_configured" };
  }
  const ok = await tgDirectSend(bot.token, chatId, text, opts);
  return ok ? { sent: true } : { sent: false, reason: "telegram_send_failed" };
}
