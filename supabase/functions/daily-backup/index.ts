// Backup automático diário no Google Drive
// - Modo cron: chamada com Authorization: Bearer <SERVICE_ROLE_KEY> → processa TODOS os owners com auto_backup_enabled
// - Modo manual: chamada com JWT do usuário → processa apenas esse owner
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_FOLDER_NAME = "Empresta.aí Backups";

// Tabelas para backup (nome, coluna do dono)
const TABLES: Array<{ name: string; ownerCol: string }> = [
  { name: "account_settings", ownerCol: "owner_id" },
  { name: "active_capital_snapshots", ownerCol: "owner_id" },
  { name: "balance", ownerCol: "user_id" },
  { name: "chart_overrides", ownerCol: "user_id" },
  { name: "client_analysis_events", ownerCol: "owner_id" },
  { name: "client_credit_reports", ownerCol: "owner_id" },
  { name: "client_financial_profiles", ownerCol: "owner_id" },
  { name: "clients", ownerCol: "user_id" },
  { name: "credit_card_invoice_openings", ownerCol: "user_id" },
  { name: "credit_cards", ownerCol: "user_id" },
  { name: "credit_limit_history", ownerCol: "user_id" },
  { name: "credit_limits", ownerCol: "user_id" },
  { name: "expense_category_hints", ownerCol: "user_id" },
  { name: "expenses", ownerCol: "user_id" },
  { name: "income_categories", ownerCol: "user_id" },
  { name: "income_category_hints", ownerCol: "user_id" },
  { name: "incomes", ownerCol: "user_id" },
  { name: "loan_installments", ownerCol: "user_id" },
  { name: "loan_renegotiations", ownerCol: "user_id" },
  { name: "loans", ownerCol: "user_id" },
  { name: "locador_info", ownerCol: "user_id" },
  { name: "manager_commissions", ownerCol: "user_id" },
  { name: "monthly_goal_snapshots", ownerCol: "owner_id" },
  { name: "monthly_goals", ownerCol: "user_id" },
  { name: "monthly_opening_balances", ownerCol: "owner_id" },
  { name: "payment_methods", ownerCol: "user_id" },
  { name: "payments", ownerCol: "user_id" },
  { name: "personal_budgets", ownerCol: "user_id" },
  { name: "personal_expense_categories", ownerCol: "user_id" },
  { name: "piggy_bank_deposits", ownerCol: "user_id" },
  { name: "piggy_bank_rate_history", ownerCol: "user_id" },
  { name: "piggy_bank_recurrences", ownerCol: "user_id" },
  { name: "piggy_banks", ownerCol: "user_id" },
  { name: "products", ownerCol: "user_id" },
  { name: "profiles", ownerCol: "user_id" },
  { name: "sales", ownerCol: "user_id" },
  { name: "simulation_settings", ownerCol: "owner_id" },
  { name: "tracking_positions", ownerCol: "owner_id" },
  { name: "tracking_providers", ownerCol: "owner_id" },
  { name: "user_goal_prefs", ownerCol: "user_id" },
  { name: "vehicle_balance", ownerCol: "user_id" },
  { name: "vehicle_registry", ownerCol: "user_id" },
  { name: "webhook_settings", ownerCol: "user_id" },
];

function driveHeaders() {
  const lov = Deno.env.get("LOVABLE_API_KEY");
  const key = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lov) throw new Error("LOVABLE_API_KEY não configurado");
  if (!key) throw new Error("GOOGLE_DRIVE_API_KEY não configurado (Google Drive não está conectado)");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": key,
  };
}

async function findFolder(name: string, parentId?: string): Promise<string | null> {
  const q = parentId
    ? `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = `${GATEWAY}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`;
  const r = await fetch(url, { headers: driveHeaders() });
  if (!r.ok) throw new Error(`Drive search [${r.status}]: ${await r.text()}`);
  const j = await r.json();
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const body: any = { name, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) body.parents = [parentId];
  const r = await fetch(`${GATEWAY}/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { ...driveHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Drive createFolder [${r.status}]: ${await r.text()}`);
  const j = await r.json();
  return j.id;
}

async function ensureFolder(name: string, parentId?: string): Promise<string> {
  const found = await findFolder(name, parentId);
  if (found) return found;
  return await createFolder(name, parentId);
}

async function uploadJson(parentId: string, filename: string, content: string): Promise<{ id: string; webViewLink: string; size: number }> {
  const boundary = "----lovable-backup-" + crypto.randomUUID();
  const metadata = { name: filename, parents: [parentId], mimeType: "application/json" };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    content + `\r\n` +
    `--${boundary}--`;
  const r = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,size`, {
    method: "POST",
    headers: { ...driveHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`Drive upload [${r.status}]: ${await r.text()}`);
  const j = await r.json();
  return { id: j.id, webViewLink: j.webViewLink, size: Number(j.size || content.length) };
}

async function listOldBackups(parentId: string): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const q = `'${parentId}' in parents and mimeType='application/json' and trashed=false`;
  const r = await fetch(`${GATEWAY}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&pageSize=200&orderBy=createdTime desc`, {
    headers: driveHeaders(),
  });
  if (!r.ok) return [];
  const j = await r.json();
  return j.files || [];
}

async function deleteFile(id: string): Promise<void> {
  await fetch(`${GATEWAY}/drive/v3/files/${id}`, { method: "DELETE", headers: driveHeaders() });
}

async function backupOwner(supabase: any, ownerId: string, profile: { display_name?: string; email?: string }, triggeredBy: "cron" | "manual"): Promise<{ ok: true; url: string; size: number; filename: string } | { ok: false; error: string }> {
  try {
    // Coleta todos os user_ids que pertencem a esse owner (owner + sub-contas)
    const { data: linked } = await supabase.from("user_owner").select("user_id").eq("owner_id", ownerId);
    const userIds = Array.from(new Set([ownerId, ...((linked || []).map((r: any) => r.user_id))]));

    // Snapshot
    const snapshot: Record<string, any> = {
      __meta: {
        version: 2,
        owner_id: ownerId,
        member_user_ids: userIds,
        generated_at: new Date().toISOString(),
        triggered_by: triggeredBy,
      },
    };
    for (const t of TABLES) {
      const filterValues = t.ownerCol === "owner_id" ? [ownerId] : userIds;
      const { data, error } = await supabase.from(t.name).select("*").in(t.ownerCol, filterValues);
      if (error) {
        snapshot[t.name] = { __error: error.message };
      } else {
        snapshot[t.name] = data || [];
      }
    }
    const json = JSON.stringify(snapshot);

    // Pasta raiz e do usuário
    const root = await ensureFolder(ROOT_FOLDER_NAME);
    const subName = (profile.display_name || profile.email || ownerId).replace(/[\\/]/g, "_").slice(0, 80);
    let userFolderId: string | null = null;
    const { data: settings } = await supabase
      .from("account_settings")
      .select("backup_drive_folder_id")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (settings?.backup_drive_folder_id) {
      // valida que ainda existe
      const check = await fetch(`${GATEWAY}/drive/v3/files/${settings.backup_drive_folder_id}?fields=id,trashed`, { headers: driveHeaders() });
      if (check.ok) {
        const j = await check.json();
        if (!j.trashed) userFolderId = j.id;
      }
    }
    if (!userFolderId) {
      userFolderId = await ensureFolder(subName, root);
      await supabase.from("account_settings").update({ backup_drive_folder_id: userFolderId }).eq("owner_id", ownerId);
    }

    // Upload
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${today}_${ownerId.slice(0, 8)}.json`;
    const uploaded = await uploadJson(userFolderId, filename, json);

    // Histórico + last_auto_backup_at
    await supabase.from("backup_history").insert({
      owner_id: ownerId,
      drive_file_id: uploaded.id,
      drive_url: uploaded.webViewLink,
      filename,
      size_bytes: uploaded.size,
      status: "success",
      triggered_by: triggeredBy,
    });
    await supabase.from("account_settings").update({
      last_auto_backup_at: new Date().toISOString(),
      last_auto_backup_drive_url: uploaded.webViewLink,
    }).eq("owner_id", ownerId);

    // Retenção: manter 30 mais recentes
    const all = await listOldBackups(userFolderId);
    if (all.length > 30) {
      const toDelete = all.slice(30);
      for (const f of toDelete) {
        await deleteFile(f.id);
      }
    }

    return { ok: true, url: uploaded.webViewLink, size: uploaded.size, filename };
  } catch (e: any) {
    const msg = e?.message || String(e);
    try {
      await supabase.from("backup_history").insert({
        owner_id: ownerId,
        status: "error",
        error: msg,
        triggered_by: triggeredBy,
      });
    } catch {}
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  const cronTokenHeader = req.headers.get("X-Backup-Cron-Token") || "";

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Verifica se a chamada veio do cron interno
  let isCron = false;
  if (cronTokenHeader) {
    const { data } = await admin.from("app_internal_config").select("value").eq("key", "backup_cron_token").maybeSingle();
    if (data?.value && data.value === cronTokenHeader) isCron = true;
  }

  try {
    if (isCron) {
      // processa todos com auto_backup_enabled
      const { data: owners, error } = await admin
        .from("account_settings")
        .select("owner_id")
        .eq("auto_backup_enabled", true);
      if (error) throw error;
      const results: any[] = [];
      for (const row of owners || []) {
        const { data: prof } = await admin.from("profiles").select("display_name").eq("user_id", row.owner_id).maybeSingle();
        const { data: u } = await admin.auth.admin.getUserById(row.owner_id);
        const res = await backupOwner(admin, row.owner_id, { display_name: prof?.display_name, email: u?.user?.email }, "cron");
        results.push({ owner_id: row.owner_id, ...res });
      }
      return new Response(JSON.stringify({ mode: "cron", count: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // manual: valida JWT e processa apenas esse owner
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userRes.user.id;
    // descobre owner_id real (pode ser sub-conta)
    const { data: ownerRow } = await admin.rpc("get_data_owner_id", { _user_id: userId });
    const ownerId = ownerRow || userId;
    const { data: prof } = await admin.from("profiles").select("display_name").eq("user_id", ownerId).maybeSingle();
    const { data: u } = await admin.auth.admin.getUserById(ownerId);
    const res = await backupOwner(admin, ownerId, { display_name: prof?.display_name, email: u?.user?.email }, "manual");
    return new Response(JSON.stringify({ mode: "manual", ...res }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
