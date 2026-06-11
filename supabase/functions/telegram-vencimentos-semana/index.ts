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
      const { data: leg } = await admin.from("telegram_links").select("user_id");
      for (const r of (leg ?? []) as any[]) if (r.user_id) ids.add(r.user_id);
    }
    userIds = [...ids];
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
      if (r.sent) sent++;
      else errors.push({ userId, reason: r.reason });
    } catch (e: any) {
      console.error("[telegram-vencimentos-semana]", userId, e);
      errors.push({ userId, error: String(e?.message ?? e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, checked: userIds.length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
