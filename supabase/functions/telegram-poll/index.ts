import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY_2");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: state, error: stateErr } = await supabase
    .from("telegram_bot_state").select("update_offset").eq("id", 1).single();
  if (stateErr) return new Response(JSON.stringify({ error: stateErr.message }), { status: 500, headers: corsHeaders });

  let currentOffset: number = state.update_offset;
  let totalProcessed = 0;
  let hasNew = false;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const resp = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message", "callback_query"] }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      console.error("getUpdates failed", data);
      return new Response(JSON.stringify({ error: data }), { status: 502, headers: corsHeaders });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    const rows = updates
      .map((u: any) => {
        if (u.message) {
          return {
            update_id: u.update_id,
            chat_id: u.message.chat.id,
            text: u.message.text ?? u.message.caption ?? null,
            raw_update: u,
          };
        }
        if (u.callback_query?.message?.chat?.id) {
          return {
            update_id: u.update_id,
            chat_id: u.callback_query.message.chat.id,
            text: null,
            raw_update: u,
          };
        }
        return null;
      })
      .filter((r: any) => r !== null);

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("telegram_messages").upsert(rows, { onConflict: "update_id" });
      if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: corsHeaders });
      totalProcessed += rows.length;
      hasNew = true;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase.from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);
    currentOffset = newOffset;
  }

  // Trigger processor (fire-and-forget) if we got new messages.
  // Use EdgeRuntime.waitUntil so the request isn't cancelled when the function returns.
  if (hasNew) {
    const triggerPromise = fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch((e) => console.error("trigger process failed", e));
    // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(triggerPromise);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
