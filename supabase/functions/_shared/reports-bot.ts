// Shared helpers for the user-registered "reports" Telegram bot.
// Each user can register their own bot in Settings → Telegram Bots.
// We use the raw Telegram Bot API (api.telegram.org) directly with the
// stored token, completely independent from the expenses bot.

export interface ReportsBot {
  id: string;
  token: string;
  name: string;
  bot_username: string | null;
  owner_id: string;
}

/**
 * Resolves the active "reports" bot for a given user (resolves through user_owner
 * so shared accounts use the owner's bot). Falls back to a "general" purpose bot
 * if no explicit reports bot is registered.
 */
export async function getReportsBotForUser(
  supabase: any,
  userId: string,
): Promise<ReportsBot | null> {
  const { data: ownerRow } = await supabase
    .from("user_owner")
    .select("owner_id")
    .eq("user_id", userId)
    .maybeSingle();
  const ownerId = (ownerRow as any)?.owner_id ?? userId;

  const { data, error } = await supabase
    .from("user_telegram_bots")
    .select("id, token, name, bot_username, owner_id, purpose, validation_status")
    .eq("owner_id", ownerId)
    .eq("active", true)
    .in("purpose", ["reports", "general"]);

  if (error) {
    console.error("[getReportsBotForUser] query error", error);
    return null;
  }
  if (!data?.length) return null;

  const reports = (data as any[]).find((b) => b.purpose === "reports");
  const chosen = reports ?? (data as any[])[0];
  if (!chosen?.token) return null;
  return {
    id: chosen.id,
    token: chosen.token,
    name: chosen.name,
    bot_username: chosen.bot_username,
    owner_id: chosen.owner_id,
  };
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
      // Retry without markdown (most common cause of 400)
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
 * Combined helper: looks up the reports bot for the user and sends a message
 * to the given chat. Returns false (with logged reason) if no bot is configured.
 */
export async function sendReportsMessage(
  supabase: any,
  userId: string,
  chatId: number | string,
  text: string,
  opts?: { parse_mode?: "Markdown" | "HTML" },
): Promise<{ sent: boolean; reason?: string }> {
  const bot = await getReportsBotForUser(supabase, userId);
  if (!bot) {
    console.warn(
      `[reports-bot] No active reports bot for user=${userId}. ` +
        "Ask the user to register one in Settings → Bots do Telegram.",
    );
    return { sent: false, reason: "no_reports_bot_configured" };
  }
  const ok = await tgDirectSend(bot.token, chatId, text, opts);
  return ok
    ? { sent: true }
    : { sent: false, reason: "telegram_send_failed" };
}
