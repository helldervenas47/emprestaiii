import { getExternalAdmin } from "../_shared/external-supabase.ts";
import { runReportCommand } from "../_shared/reports-commands.ts";
import { sendReportsMessage } from "../_shared/reports-bot.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = getExternalAdmin();
  const url = new URL(req.url);
  const forceUserId = url.searchParams.get("user_id");

  // Collect distinct user_ids with an active reports link
  let userIds: string[] = [];
  if (forceUserId) {
    userIds = [forceUserId];
  } else {
    const { data: rep } = await admin.from("telegram_reports_links").select("user_id");
    const ids = new Set<string>();
    for (const r of (rep ?? []) as any[]) if (r.user_id) ids.add(r.user_id);
    if (ids.size === 0) {
      // Fallback to legacy telegram_links, but ONLY for users linked to the
      // active reports bot. Otherwise we would spam users that only connected
      // the expenses bot.
      const { data: reportsBot } = await admin
        .from("system_telegram_bots")
        .select("id")
        .eq("purpose", "reports")
        .eq("active", true)
        .order("bot_id", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const reportsBotId = (reportsBot as any)?.id ?? null;
      if (reportsBotId) {
        const { data: leg } = await admin
          .from("telegram_links")
          .select("user_id")
          .eq("bot_id", reportsBotId);
        for (const r of (leg ?? []) as any[]) if (r.user_id) ids.add(r.user_id);
      }
    }
    userIds = [...ids];

    // Filter by per-user schedule (weekday + send_time + enabled).
    // Default schedule = Monday 08:00 when no row exists.
    if (userIds.length > 0) {
      const { data: prefs } = await admin
        .from("telegram_weekly_vencimentos_prefs")
        .select("user_id, enabled, weekday, send_time, last_sent_date")
        .in("user_id", userIds);
      const prefMap = new Map<string, any>();
      for (const p of (prefs ?? []) as any[]) prefMap.set(p.user_id, p);

      const eligible: string[] = [];
      for (const uid of userIds) {
        const p = prefMap.get(uid) ?? {};
        if (p.enabled === false) continue;
        const wd = typeof p.weekday === "number" ? p.weekday : 1;
        const st = String(p.send_time ?? "08:00").slice(0, 5);

        // Resolve user timezone via account_settings (fallback America/Sao_Paulo)
        const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: uid });
        const ownerKey = (ownerId as string) || uid;
        const { data: settings } = await admin
          .from("account_settings").select("timezone").eq("owner_id", ownerKey).maybeSingle();
        const tz = (settings as any)?.timezone || "America/Sao_Paulo";

        const fmt = new Intl.DateTimeFormat("en-CA", {
          timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", hour12: false,
        });
        const parts = fmt.formatToParts(new Date());
        const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
        const map: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
        const nowWd = map[get("weekday")] ?? -1;
        const today = `${get("year")}-${get("month")}-${get("day")}`;
        const hhmm = `${get("hour")}:${get("minute")}`;

        if (nowWd !== wd) continue;
        if (hhmm < st) continue;            // ainda não chegou o horário
        if (p.last_sent_date === today) continue; // já enviou hoje
        eligible.push(uid);
      }
      userIds = eligible;
    }
  }

  let sent = 0;
  const errors: any[] = [];
  for (const userId of userIds) {
    try {
      const { data: ownerId } = await admin.rpc("get_data_owner_id", { _user_id: userId });
      const targetUser = (ownerId as string) || userId;
      const link = await admin
        .from("telegram_reports_links")
        .select("chat_id")
        .eq("user_id", userId)
        .maybeSingle()
        .then((r: any) => r.data)
        .catch(() => null);
      const legacy = !link
        ? await admin
            .from("telegram_links")
            .select("chat_id")
            .eq("user_id", userId)
            .maybeSingle()
            .then((r: any) => r.data)
            .catch(() => null)
        : null;
      const chatId = Number((link ?? legacy)?.chat_id);
      if (!chatId) continue;
      const message = await runReportCommand(admin, targetUser, "vencimentos_semana");
      const r = await sendReportsMessage(admin, userId, chatId, message);
      if (r.sent) {
        sent++;
        if (!forceUserId) {
          const today = new Date().toISOString().slice(0, 10);
          await admin.from("telegram_weekly_vencimentos_prefs")
            .update({ last_sent_date: today }).eq("user_id", userId);
        }
      } else errors.push({ userId, reason: r.reason });
    } catch (e: any) {
      console.error("[telegram-vencimentos-semana]", userId, e);
      errors.push({ userId, error: String(e?.message ?? e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: userIds.length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
