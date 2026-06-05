// One-shot migration: cria a tabela public.user_dashboard_prefs com RLS por usuário.
// Pode ser chamada repetidamente (idempotente). Usa SERVICE_ROLE_KEY internamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SQL = `
CREATE TABLE IF NOT EXISTS public.user_dashboard_prefs (
  user_id uuid PRIMARY KEY,
  extra_cards jsonb NOT NULL DEFAULT '["composicao","projecao30"]'::jsonb,
  maos_visibility jsonb NOT NULL DEFAULT '{"account":true,"cash":true,"incomes":true,"piggy":true,"vehicle":true}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_dashboard_prefs TO authenticated;
GRANT ALL ON public.user_dashboard_prefs TO service_role;

ALTER TABLE public.user_dashboard_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own dashboard prefs select" ON public.user_dashboard_prefs;
CREATE POLICY "own dashboard prefs select"
  ON public.user_dashboard_prefs FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own dashboard prefs insert" ON public.user_dashboard_prefs;
CREATE POLICY "own dashboard prefs insert"
  ON public.user_dashboard_prefs FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own dashboard prefs update" ON public.user_dashboard_prefs;
CREATE POLICY "own dashboard prefs update"
  ON public.user_dashboard_prefs FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own dashboard prefs delete" ON public.user_dashboard_prefs;
CREATE POLICY "own dashboard prefs delete"
  ON public.user_dashboard_prefs FOR DELETE
  TO authenticated USING (user_id = auth.uid());
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error } = await admin.rpc("exec_sql", { sql_query: SQL });
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
