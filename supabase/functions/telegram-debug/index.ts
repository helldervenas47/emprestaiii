const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const LOVABLE = Deno.env.get("LOVABLE_API_KEY")!;
  const TG = Deno.env.get("TELEGRAM_API_KEY_2")!;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "info";

  const path = action === "delete" ? "deleteWebhook" : action === "updates" ? "getUpdates" : "getWebhookInfo";
  const body = action === "updates" ? { offset: 0, timeout: 0, allowed_updates: ["message"] }
    : action === "delete" ? { drop_pending_updates: false }
    : {};

  const r = await fetch(`https://connector-gateway.lovable.dev/telegram/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": TG,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return new Response(JSON.stringify({ status: r.status, data }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
