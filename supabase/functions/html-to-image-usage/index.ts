const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = Deno.env.get("HTML_TO_IMAGE_USER_ID");
    const apiKey = Deno.env.get("HTML_TO_IMAGE_API_KEY");
    if (!userId || !apiKey) {
      return new Response(
        JSON.stringify({ configured: false, error: "HTML to Image não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const auth = btoa(`${userId}:${apiKey}`);
    const r = await fetch("https://hcti.io/v1/users", {
      headers: { Authorization: `Basic ${auth}` },
    });
    const text = await r.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch { /* keep empty */ }

    if (!r.ok) {
      return new Response(
        JSON.stringify({
          configured: true,
          error: data?.error || `Falha ao consultar uso (${r.status})`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // hcti.io returns fields like: monthly_request_count, monthly_request_limit
    const used = Number(
      data.monthly_request_count ??
      data.monthly_image_count ??
      data.usage ??
      0,
    );
    const limit = Number(
      data.monthly_request_limit ??
      data.monthly_image_count_limit ??
      data.limit ??
      0,
    );

    return new Response(
      JSON.stringify({
        configured: true,
        used,
        limit,
        plan: data.plan ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ configured: true, error: e.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
