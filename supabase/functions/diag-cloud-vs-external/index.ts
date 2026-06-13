// Diagnóstico: conta linhas em cada tabela do public na Lovable Cloud e no Supabase externo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TABLES = [
  "profiles","user_roles","user_owner","user_sessions","user_dashboard_prefs","user_goal_prefs",
  "plans","subscriptions",
  "incomes","income_categories",
  "expenses","personal_expense_categories","personal_categories","personal_budgets",
  "account_ledger","balance","balance_adjustments","monthly_opening_balances",
  "monthly_goals","monthly_goal_snapshots","chart_overrides",
  "credit_cards","credit_card_invoices","credit_card_invoice_openings",
  "credit_limits","credit_limit_history",
  "my_boletos","my_boleto_payments","boleto_lookups",
  "products","sales","stock_movements","payments",
  "loans","loan_installments","clients","manager_commissions",
  "payrolls","payroll_payments",
  "vehicle_registry","vehicle_balance","locador_info",
  "telegram_links","telegram_link_codes","telegram_messages","telegram_image_delivery_prefs",
  "system_telegram_bots","user_telegram_bots",
  "whatsapp_assistant_authorized","whatsapp_billing_log","whatsapp_billing_schedule",
  "webhook_settings","backup_history","account_settings",
];

async function countAll(client: ReturnType<typeof createClient>) {
  const out: Record<string, number | string> = {};
  for (const t of TABLES) {
    try {
      const { count, error } = await client.from(t).select("*", { count: "exact", head: true });
      out[t] = error ? `ERR: ${error.message}` : (count ?? 0);
    } catch (e: any) {
      out[t] = `ERR: ${e?.message ?? e}`;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cloud = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const external = createClient(
      Deno.env.get("EXTERNAL_SUPABASE_URL")!,
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const [cloudCounts, externalCounts] = await Promise.all([countAll(cloud), countAll(external)]);
    const diff: Array<{ table: string; cloud: number | string; external: number | string; delta: string }> = [];
    for (const t of TABLES) {
      const c = cloudCounts[t]; const e = externalCounts[t];
      const cn = typeof c === "number" ? c : -1;
      const en = typeof e === "number" ? e : -1;
      let delta = "ok";
      if (typeof c !== "number" || typeof e !== "number") delta = "error";
      else if (cn > 0 && en === 0) delta = "ONLY_IN_CLOUD";
      else if (cn > en) delta = `cloud>+${cn - en}`;
      else if (en > cn) delta = `external>+${en - cn}`;
      diff.push({ table: t, cloud: c, external: e, delta });
    }
    return new Response(JSON.stringify({ diff }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
