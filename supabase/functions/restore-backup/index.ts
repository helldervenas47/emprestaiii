// Restaura backup JSON (do Drive ou upload) para o owner autenticado
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";

// Mesma lista do daily-backup. Ordem: pais antes de filhos (para insert).
// Para delete em modo replace, percorre na ordem inversa.
const TABLES: Array<{ name: string; ownerCol: string; replaceSafe?: boolean }> = [
  { name: "account_settings", ownerCol: "owner_id" },
  { name: "profiles", ownerCol: "user_id" },
  { name: "payment_methods", ownerCol: "user_id" },
  { name: "income_categories", ownerCol: "user_id" },
  { name: "personal_expense_categories", ownerCol: "user_id" },
  { name: "clients", ownerCol: "user_id", replaceSafe: true },
  { name: "client_financial_profiles", ownerCol: "owner_id", replaceSafe: true },
  { name: "client_credit_reports", ownerCol: "owner_id", replaceSafe: true },
  { name: "client_analysis_events", ownerCol: "owner_id", replaceSafe: true },
  { name: "credit_limits", ownerCol: "user_id", replaceSafe: true },
  { name: "credit_limit_history", ownerCol: "user_id", replaceSafe: true },
  { name: "credit_cards", ownerCol: "user_id", replaceSafe: true },
  { name: "credit_card_invoice_openings", ownerCol: "user_id", replaceSafe: true },
  { name: "loans", ownerCol: "user_id", replaceSafe: true },
  { name: "loan_installments", ownerCol: "user_id", replaceSafe: true },
  { name: "loan_renegotiations", ownerCol: "user_id", replaceSafe: true },
  { name: "payments", ownerCol: "user_id", replaceSafe: true },
  { name: "products", ownerCol: "user_id", replaceSafe: true },
  { name: "sales", ownerCol: "user_id", replaceSafe: true },
  { name: "vehicle_registry", ownerCol: "user_id", replaceSafe: true },
  { name: "vehicle_balance", ownerCol: "user_id", replaceSafe: true },
  { name: "expenses", ownerCol: "user_id", replaceSafe: true },
  { name: "expense_category_hints", ownerCol: "user_id" },
  { name: "incomes", ownerCol: "user_id", replaceSafe: true },
  { name: "income_category_hints", ownerCol: "user_id" },
  { name: "monthly_goals", ownerCol: "user_id", replaceSafe: true },
  { name: "monthly_goal_snapshots", ownerCol: "owner_id", replaceSafe: true },
  { name: "monthly_opening_balances", ownerCol: "owner_id", replaceSafe: true },
  { name: "active_capital_snapshots", ownerCol: "owner_id", replaceSafe: true },
  { name: "personal_budgets", ownerCol: "user_id", replaceSafe: true },
  { name: "piggy_banks", ownerCol: "user_id", replaceSafe: true },
  { name: "piggy_bank_recurrences", ownerCol: "user_id", replaceSafe: true },
  { name: "piggy_bank_rate_history", ownerCol: "user_id", replaceSafe: true },
  { name: "piggy_bank_deposits", ownerCol: "user_id", replaceSafe: true },
  { name: "manager_commissions", ownerCol: "user_id", replaceSafe: true },
  { name: "tracking_providers", ownerCol: "owner_id", replaceSafe: true },
  { name: "tracking_positions", ownerCol: "owner_id", replaceSafe: true },
  { name: "balance", ownerCol: "user_id", replaceSafe: true },
  { name: "chart_overrides", ownerCol: "user_id", replaceSafe: true },
  { name: "locador_info", ownerCol: "user_id", replaceSafe: true },
  { name: "simulation_settings", ownerCol: "owner_id", replaceSafe: true },
  { name: "user_goal_prefs", ownerCol: "user_id", replaceSafe: true },
  { name: "webhook_settings", ownerCol: "user_id", replaceSafe: true },
];

function driveHeaders() {
  const lov = Deno.env.get("LOVABLE_API_KEY");
  const key = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lov || !key) throw new Error("Google Drive não está configurado");
  return { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key };
}

async function downloadFromDrive(fileId: string): Promise<any> {
  const r = await fetch(`${GATEWAY}/drive/v3/files/${fileId}?alt=media`, { headers: driveHeaders() });
  if (!r.ok) throw new Error(`Falha ao baixar do Drive [${r.status}]`);
  return await r.json();
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userRes, error: uErr } = await userClient.auth.getUser();
  if (uErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "Não autenticado" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: ownerIdData } = await admin.rpc("get_data_owner_id", { _user_id: userRes.user.id });
  const ownerId: string = ownerIdData || userRes.user.id;

  // Só o próprio owner pode restaurar (não sub-conta operadora)
  if (ownerId !== userRes.user.id) {
    return new Response(JSON.stringify({ error: "Apenas o dono da conta pode restaurar backups" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const mode: "merge" | "replace" = body.mode === "replace" ? "replace" : "merge";
  const source: "drive" | "upload" = body.source === "upload" ? "upload" : "drive";

  let snapshot: Record<string, any>;
  try {
    if (source === "drive") {
      if (!body.driveFileId) throw new Error("driveFileId obrigatório");
      // Verifica que o backup pertence ao usuário (existe no histórico dele)
      const { data: hist } = await admin
        .from("backup_history")
        .select("id, owner_id")
        .eq("drive_file_id", body.driveFileId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (!hist) throw new Error("Backup não encontrado no seu histórico");
      snapshot = await downloadFromDrive(body.driveFileId);
    } else {
      if (!body.jsonContent) throw new Error("jsonContent obrigatório");
      snapshot = typeof body.jsonContent === "string" ? JSON.parse(body.jsonContent) : body.jsonContent;
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Falha ao ler backup" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!snapshot?.__meta?.owner_id) {
    return new Response(JSON.stringify({ error: "Arquivo de backup inválido (sem metadados)" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (snapshot.__meta.owner_id !== ownerId) {
    return new Response(JSON.stringify({ error: "Este backup pertence a outro usuário" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const summary: Record<string, { inserted: number; skipped: number; deleted?: number; errors: string[] }> = {};

  // Modo replace: deleta na ordem inversa (filhos primeiro)
  if (mode === "replace") {
    for (let i = TABLES.length - 1; i >= 0; i--) {
      const t = TABLES[i];
      if (!t.replaceSafe) continue;
      const { error, count } = await admin.from(t.name).delete({ count: "exact" }).eq(t.ownerCol, ownerId);
      summary[t.name] = summary[t.name] || { inserted: 0, skipped: 0, errors: [] };
      summary[t.name].deleted = count || 0;
      if (error) summary[t.name].errors.push(`delete: ${error.message}`);
    }
  }

  // Insert/upsert na ordem normal
  for (const t of TABLES) {
    const rows: any[] | undefined = snapshot[t.name];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    summary[t.name] = summary[t.name] || { inserted: 0, skipped: 0, errors: [] };

    // Sanitiza: força ownerCol para o ownerId atual (segurança)
    const sanitized = rows.map((r) => ({ ...r, [t.ownerCol]: ownerId }));

    for (const part of chunk(sanitized, 500)) {
      const q = mode === "replace"
        ? admin.from(t.name).insert(part)
        : admin.from(t.name).upsert(part, { onConflict: "id", ignoreDuplicates: true });
      const { error, count } = await q.select("id", { count: "exact", head: true });
      if (error) {
        summary[t.name].errors.push(error.message);
        summary[t.name].skipped += part.length;
      } else {
        summary[t.name].inserted += count ?? part.length;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, mode, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
