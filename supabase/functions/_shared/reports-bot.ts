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

/**
 * Sends a PNG photo via the raw Bot API (multipart/form-data).
 */
export async function tgDirectSendPhoto(
  token: string,
  chatId: number | string,
  pngBytes: Uint8Array,
  caption: string,
): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append("chat_id", String(chatId));
    fd.append("caption", caption);
    fd.append("parse_mode", "Markdown");
    fd.append("photo", new Blob([pngBytes], { type: "image/png" }), "report.png");

    let r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[reports-bot] sendPhoto failed ${r.status}`, body);
      // retry without parse_mode (caption may have invalid Markdown)
      const fd2 = new FormData();
      fd2.append("chat_id", String(chatId));
      fd2.append("caption", caption);
      fd2.append("photo", new Blob([pngBytes], { type: "image/png" }), "report.png");
      r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: fd2,
      });
      if (!r.ok) {
        const body2 = await r.text().catch(() => "");
        console.error(`[reports-bot] sendPhoto plain retry failed ${r.status}`, body2);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[reports-bot] sendPhoto exception", e);
    return false;
  }
}

/**
 * Combined helper: sends a PNG photo + caption via the same bot the user linked
 * with /code (resolved via chat_id). Falls back to the GLOBAL reports bot when
 * the link has no bot_id.
 */
export async function sendReportsPhoto(
  supabase: any,
  userId: string,
  chatId: number | string,
  pngBytes: Uint8Array,
  caption: string,
): Promise<{ sent: boolean; reason?: string }> {
  let bot = await getBotForChat(supabase, userId, chatId);
  if (!bot) bot = await getReportsBot(supabase);
  if (!bot) {
    return { sent: false, reason: "no_reports_bot_configured" };
  }
  const ok = await tgDirectSendPhoto(bot.token, chatId, pngBytes, caption);
  return ok ? { sent: true } : { sent: false, reason: "telegram_send_failed" };
}

/**
 * Renders the given lines into an SVG report, converts to PNG, and sends as
 * a Telegram photo via the reports bot. Falls back to a plain text message if
 * image generation or sendPhoto fails. `lines` is the full markdown-style
 * report (used both to render and as fallback text).
 */
export type ImageReportKey =
  | "billing"
  | "accumulated_delinquency"
  | "daily_planning"
  | "incomes_expenses"
  | "manager_weekly"
  | "personal_insights"
  | "daily_summary"
  | "weekly_summary"
  | "monthly_summary";

export interface ImageDeliveryPrefs {
  reports: Partial<Record<ImageReportKey, boolean>>;
  includeText: boolean;
}

/**
 * Reads the per-user image delivery prefs (table: telegram_image_delivery_prefs).
 * Defaults: every report sends as image, includeText = true.
 */
export async function getImageDeliveryPrefs(
  supabase: any,
  userId: string,
): Promise<ImageDeliveryPrefs> {
  try {
    const { data } = await supabase
      .from("telegram_image_delivery_prefs")
      .select("reports, include_text")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      reports: (data?.reports as any) ?? {},
      includeText: data?.include_text !== false,
    };
  } catch (e) {
    console.error("[getImageDeliveryPrefs] error", e);
    return { reports: {}, includeText: true };
  }
}

export async function sendReportsAsImage(
  supabase: any,
  userId: string,
  chatId: number | string,
  lines: string[],
  brand: { name: string; primaryHsl?: string | null },
  opts?: { title?: string; subtitle?: string; fallbackText?: string; reportKey?: ImageReportKey },
): Promise<{ sent: boolean; reason?: string; mode?: "image" | "text" }> {
  try {
    const prefs = await getImageDeliveryPrefs(supabase, userId);
    const key = opts?.reportKey;
    // Per-report toggle: if explicitly disabled, send as plain text.
    if (key && prefs.reports[key] === false) {
      const text = opts?.fallbackText ?? lines.join("\n");
      const r = await sendReportsMessage(supabase, userId, chatId, text);
      return { sent: r.sent, reason: r.reason, mode: "text" };
    }

    const { buildTextReportSVG, svgToPng, buildCaptionFromLines } = await import("./renderReportImage.ts");
    const svg = buildTextReportSVG(lines, brand, { title: opts?.title, subtitle: opts?.subtitle });
    const png = await svgToPng(svg);
    const caption = prefs.includeText ? buildCaptionFromLines(lines, brand) : "";
    const res = await sendReportsPhoto(supabase, userId, chatId, png, caption);
    if (res.sent) return { sent: true, mode: "image" };
    const text = opts?.fallbackText ?? lines.join("\n");
    const r2 = await sendReportsMessage(supabase, userId, chatId, text);
    return { sent: r2.sent, reason: r2.reason, mode: "text" };
  } catch (e) {
    console.error("[reports-bot] image render failed, falling back to text", e);
    const text = opts?.fallbackText ?? lines.join("\n");
    const r = await sendReportsMessage(supabase, userId, chatId, text);
    return { sent: r.sent, reason: r.reason, mode: "text" };
  }
}
