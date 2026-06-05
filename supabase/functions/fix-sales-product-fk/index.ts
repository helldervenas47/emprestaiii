// One-shot: troca FK sales.product_id de ON DELETE CASCADE para ON DELETE SET NULL.
// Mantém vendas existentes quando o produto é excluído do estoque.
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SQL = `
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.sales'::regclass
    AND contype = 'f'
    AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.sales'::regclass AND attname = 'product_id');
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT %I', fk_name);
  END IF;
END$$;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    return new Response(JSON.stringify({ ok: false, error: "SUPABASE_DB_URL not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const client = new Client(dbUrl);
  try {
    await client.connect();
    await client.queryArray(SQL);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    try { await client.end(); } catch {}
  }
});
