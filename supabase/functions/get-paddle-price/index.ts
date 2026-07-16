import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getPaddlePrice, PaddleApiError, type PaddleEnvironment } from "../_shared/paddle.ts";

const responseHeaders = {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Content-Type": "application/json",
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, responseHeaders);
  }

  const { priceId, environment } = await req.json();
  if (!priceId) {
    return new Response(JSON.stringify({ error: "priceId required" }), {
      status: 400,
      ...responseHeaders,
    });
  }

  try {
    const price = await getPaddlePrice(priceId, environment as PaddleEnvironment | undefined);

    if (!price) {
      return new Response(JSON.stringify({ error: "Price not found" }), {
        status: 404,
        ...responseHeaders,
      });
    }

    return new Response(JSON.stringify({ paddleId: price.id }), responseHeaders);
  } catch (err) {
    if (err instanceof PaddleApiError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status || 502,
        ...responseHeaders,
      });
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      ...responseHeaders,
    });
  }
});