// Restaura backup JSON (do Drive ou upload) para o owner autenticado
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { BACKUP_TABLES, sha256Hex } from "../_shared/backup-tables.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const SUPPORTED_VERSIONS = [2, 3];

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
  const version = Number(snapshot.__meta.version) || 0;
  if (!SUPPORTED_VERSIONS.includes(version)) {
    return new Response(JSON.stringify({ error: `Versão de backup não suportada: ${version}. Versões aceitas: ${SUPPORTED_VERSIONS.join(", ")}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (snapshot.__meta.owner_id !== ownerId) {
    return new Response(JSON.stringify({ error: "Este backup pertence a outro usuário" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validação de integridade (v3+): recalcula checksum
  let checksumValid: boolean | null = null;
  if (version >= 3 && snapshot.__meta.checksum) {
    const provided = snapshot.__meta.checksum as string;
    const cloneMeta = { ...snapshot.__meta, checksum: "" };
    const { __meta: _omit, ...tables } = snapshot;
    const recomputed = await sha256Hex(JSON.stringify({ __meta: cloneMeta, ...tables }));
    checksumValid = recomputed === provided;
    if (!checksumValid && body.allowChecksumMismatch !== true) {
      return new Response(JSON.stringify({
        error: "Checksum inválido — o arquivo de backup pode estar corrompido. Envie novamente com allowChecksumMismatch=true para forçar.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  const summary: Record<string, { inserted: number; skipped: number; expected: number; deleted?: number; errors: string[] }> = {};

  if (mode === "replace") {
    for (let i = BACKUP_TABLES.length - 1; i >= 0; i--) {
      const t = BACKUP_TABLES[i];
      if (!t.replaceSafe) continue;
      const { error, count } = await admin.from(t.name).delete({ count: "exact" }).eq(t.ownerCol, ownerId);
      summary[t.name] = summary[t.name] || { inserted: 0, skipped: 0, expected: 0, errors: [] };
      summary[t.name].deleted = count || 0;
      if (error) summary[t.name].errors.push(`delete: ${error.message}`);
    }
  }

  for (const t of BACKUP_TABLES) {
    const rows: any[] | undefined = snapshot[t.name];
    if (!Array.isArray(rows) || rows.length === 0) {
      summary[t.name] = summary[t.name] || { inserted: 0, skipped: 0, expected: 0, errors: [] };
      continue;
    }
    summary[t.name] = summary[t.name] || { inserted: 0, skipped: 0, expected: 0, errors: [] };
    summary[t.name].expected = rows.length;

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

  // Auditoria
  try {
    await admin.from("system_audit_logs").insert({
      user_id: userRes.user.id,
      owner_id: ownerId,
      action: "restore_backup",
      details: { mode, source, version, checksum_valid: checksumValid, summary },
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
      user_agent: req.headers.get("user-agent") || null,
    });
  } catch { /* não bloqueia */ }

  return new Response(JSON.stringify({ ok: true, mode, version, checksum_valid: checksumValid, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
