import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate the caller's token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } =
      await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;
    const currentSessionId = (claimsData.claims as any).session_id as
      | string
      | undefined;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
      db: { schema: "auth" as any },
    });

    const body = await req.json().catch(() => ({}));
    const action = body?.action as "list" | "revoke" | undefined;

    if (action === "list") {
      const { data: sessions, error } = await (admin as any)
        .from("sessions")
        .select("id, created_at, updated_at, user_agent, ip, not_after")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Geolocate IPs in parallel via ip-api.com (free, no key, pt-BR)
      const lookupGeo = async (ip: string | null) => {
        if (!ip) return null;
        // Skip private/loopback IPs
        if (
          /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)
        ) return null;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 2500);
          const res = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,regionName&lang=pt-BR`,
            { signal: ctrl.signal },
          );
          clearTimeout(t);
          if (!res.ok) return null;
          const j = await res.json();
          if (j?.status !== "success") return null;
          return { city: j.city ?? null, region: j.regionName ?? null, country: j.country ?? null };
        } catch {
          return null;
        }
      };

      const enriched = await Promise.all(
        (sessions ?? []).map(async (s: any) => ({
          ...s,
          geo: await lookupGeo(s.ip),
        })),
      );

      return new Response(
        JSON.stringify({
          sessions: enriched,
          current_session_id: currentSessionId ?? null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (action === "revoke") {
      const sessionId = body?.session_id as string | undefined;
      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "session_id is required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Verify the session belongs to the caller before deleting
      const { data: existing, error: lookupErr } = await (admin as any)
        .from("sessions")
        .select("id, user_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (lookupErr || !existing || existing.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: "Session not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { error: delErr } = await (admin as any)
        .from("sessions")
        .delete()
        .eq("id", sessionId);

      if (delErr) {
        return new Response(
          JSON.stringify({ error: delErr.message }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
