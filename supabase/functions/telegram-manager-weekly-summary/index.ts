// Sends a WEEKLY per-manager summary to the user's Telegram REPORTS bot.
// For each owner with prefs enabled at the configured weekday/time:
//   - identifies all active managers (clients.is_manager = true, active = true)
//   - for each manager, builds a list of loans assigned to them that are
//     OVERDUE and/or DUE THIS WEEK (Mon..Sun in America/Sao_Paulo)
//   - renders the user's editable template and sends ONE message per manager
//     to the owner's reports bot chat.
// Manual modes:
//   - { owner_id, manual_run: true }       → ignore schedule gating
//   - { owner_id, preview_only: true }     → render previews per manager
//   - { owner_id, manager_client_id }      → restrict to one manager
//   - { owner_id, list_managers: true }    → list managers + their state
//
// Triggered by pg_cron every 5 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const APP_TZ = "America/Sao_Paulo";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nowInTz(tz = APP_TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    hhmm: `${get("hour")}:${get("minute")}`,
    weekday: wkMap[get("weekday")] ?? 0,
  };
}

function startOfWeekISO(today: string): { start: string; end: string } {
  // ISO week Mon..Sun, anchored to provided "today" (YYYY-MM-DD)
  const d = new Date(`${today}T12:00:00Z`);
  const dow = d.getUTCDay() || 7; // Sun=0 → 7
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (dow - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x: Date) => x.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function fmtBRL(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBR(date: string) {
  if (!date) return "";
  const [y, m, d] = date.substring(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

async function tgSend(chatId: number, text: string, lovableKey: string, telegramKey: string) {
  const r = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await r.text();
  return { ok: r.ok, status: r.status, body };
}

const DEFAULT_TEMPLATE =
  `Olá {nome_gerente}! 👋
Resumo semanal dos seus empréstimos:

⚠️ Atrasados: {total_emprestimos_atrasados}
📅 Vencendo nesta semana: {total_emprestimos_semana}
💰 Valor total: {valores_totais}

Clientes:
{lista_clientes}`;

type Item = {
  borrower_name: string;
  amount: number;
  due: string;
  status: "overdue" | "this_week";
};

async function processOwner(
  admin: any,
  ownerId: string,
  opts: {
    preview_only?: boolean;
    list_managers?: boolean;
    target_manager_client_id?: string | null;
    skip_chat_check?: boolean;
  },
  lovableKey: string,
  telegramKey: string,
  today: string,
) {
  // Load preferences (template / enabled). For manual/preview, we don't require enabled.
  const { data: pref } = await admin
    .from("telegram_manager_weekly_prefs")
    .select("message_template")
    .eq("user_id", ownerId)
    .maybeSingle();
  const template = (pref as any)?.message_template?.trim() || DEFAULT_TEMPLATE;

  // Load reports bot link (chat_id) for this owner
  const { data: link } = await admin
    .from("telegram_reports_links")
    .select("chat_id")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!opts.skip_chat_check && !opts.preview_only && !opts.list_managers && !link) {
    return { owner_id: ownerId, skipped: "no_reports_bot_linked" };
  }

  // Load active managers
  const { data: managerClients } = await admin
    .from("clients")
    .select("id, name, phone, active, is_manager")
    .eq("user_id", ownerId)
    .eq("is_manager", true)
    .eq("active", true);

  const managers: { client_id: string; name: string }[] =
    (managerClients ?? []).map((c: any) => ({
      client_id: String(c.id),
      name: String(c.name || ""),
    }));

  if (opts.list_managers) {
    return { owner_id: ownerId, managers };
  }

  let working = managers;
  if (opts.target_manager_client_id) {
    working = managers.filter((m) => m.client_id === opts.target_manager_client_id);
  }

  // Load loans + installments only once for the owner
  const { data: loans } = await admin
    .from("loans")
    .select("id, borrower_name, due_date, amount, paid_installments, installments, has_manager, manager_id, status")
    .eq("user_id", ownerId)
    .neq("status", "paid");

  const loanIds = (loans ?? []).map((l: any) => l.id);
  const { data: insts } = loanIds.length
    ? await admin.from("loan_installments").select("loan_id, installment_number, due_date, amount, paid").in("loan_id", loanIds)
    : { data: [] as any[] };

  const week = startOfWeekISO(today);

  const buildItems = (managerClientId: string): Item[] => {
    const out: Item[] = [];
    for (const loan of loans ?? []) {
      if (!loan.has_manager) continue;
      if (String(loan.manager_id || "") !== managerClientId) continue;

      const list = (insts ?? [])
        .filter((s: any) => s.loan_id === loan.id)
        .sort((a: any, b: any) => a.installment_number - b.installment_number);

      const unpaid = list.filter((s: any) => !s.paid);
      if (unpaid.length > 0) {
        for (const s of unpaid) {
          const due = String(s.due_date || "").substring(0, 10);
          if (!due) continue;
          if (due < today) {
            out.push({ borrower_name: loan.borrower_name ?? "", amount: Number(s.amount || 0), due, status: "overdue" });
          } else if (due >= week.start && due <= week.end) {
            out.push({ borrower_name: loan.borrower_name ?? "", amount: Number(s.amount || 0), due, status: "this_week" });
          }
        }
      } else {
        // No installments table → fall back to loan.due_date
        const due = String(loan.due_date || "").substring(0, 10);
        if (!due) continue;
        const amount = Number(loan.amount || 0);
        if (due < today) {
          out.push({ borrower_name: loan.borrower_name ?? "", amount, due, status: "overdue" });
        } else if (due >= week.start && due <= week.end) {
          out.push({ borrower_name: loan.borrower_name ?? "", amount, due, status: "this_week" });
        }
      }
    }
    return out.sort((a, b) => a.due.localeCompare(b.due));
  };

  const renderMessage = (managerName: string, items: Item[]) => {
    const overdue = items.filter((i) => i.status === "overdue");
    const week = items.filter((i) => i.status === "this_week");
    const total = items.reduce((s, i) => s + i.amount, 0);
    const lista = items.length
      ? items.map((i) => {
          const tag = i.status === "overdue" ? "⚠️ ATRASADO" : "📅 esta semana";
          return `• ${i.borrower_name} — ${fmtBRL(i.amount)} (vence ${fmtBR(i.due)}) ${tag}`;
        }).join("\n")
      : "Nenhum empréstimo atrasado ou vencendo nesta semana.";
    return template
      .replace(/\{nome_gerente\}/g, managerName)
      .replace(/\{total_emprestimos_atrasados\}/g, String(overdue.length))
      .replace(/\{total_emprestimos_semana\}/g, String(week.length))
      .replace(/\{valores_totais\}/g, fmtBRL(total))
      .replace(/\{lista_clientes\}/g, lista);
  };

  // PREVIEW MODE
  if (opts.preview_only) {
    const previews = working.map((m) => {
      const items = buildItems(m.client_id);
      return {
        client_id: m.client_id,
        name: m.name,
        loans_count: items.length,
        overdue_count: items.filter((i) => i.status === "overdue").length,
        week_count: items.filter((i) => i.status === "this_week").length,
        total_amount: items.reduce((s, i) => s + i.amount, 0),
        message: renderMessage(m.name, items),
      };
    });
    return { owner_id: ownerId, preview: true, managers: previews };
  }

  // SEND MODE
  if (!link) return { owner_id: ownerId, skipped: "no_reports_bot_linked" };
  const chatId = Number((link as any).chat_id);

  const results: any[] = [];
  for (const m of working) {
    try {
      const items = buildItems(m.client_id);
      const message = renderMessage(m.name, items);
      const send = await tgSend(chatId, message, lovableKey, telegramKey);
      results.push({
        client_id: m.client_id,
        name: m.name,
        loans_count: items.length,
        success: send.ok,
        error: send.ok ? null : `HTTP ${send.status}: ${send.body.slice(0, 300)}`,
      });
    } catch (e) {
      results.push({ client_id: m.client_id, name: m.name, success: false, error: String(e) });
    }
  }
  return { owner_id: ownerId, sent: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY_1")!; // reports bot
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }

    const ownerId: string | null = body?.owner_id ?? null;
    const manualRun: boolean = body?.manual_run === true;
    const previewOnly: boolean = body?.preview_only === true;
    const listManagers: boolean = body?.list_managers === true;
    const targetManagerClientId: string | null = body?.manager_client_id ? String(body.manager_client_id) : null;

    // Manual / preview / list path — single owner
    if (ownerId && (manualRun || previewOnly || listManagers || targetManagerClientId)) {
      const { date: today } = nowInTz();
      const result = await processOwner(
        admin, ownerId,
        {
          preview_only: previewOnly,
          list_managers: listManagers,
          target_manager_client_id: targetManagerClientId,
          skip_chat_check: previewOnly || listManagers,
        },
        LOVABLE_API_KEY, TELEGRAM_API_KEY, today,
      );

      // For real send (manualRun) update last_sent_date
      if (manualRun && !previewOnly && !listManagers && !targetManagerClientId) {
        await admin.from("telegram_manager_weekly_prefs")
          .update({ last_sent_date: today })
          .eq("user_id", ownerId);
      }
      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRON path — iterate enabled prefs and check weekday + time window
    const { date: today, hhmm, weekday } = nowInTz();
    const [hh, mm] = hhmm.split(":").map(Number);
    const nowMin = hh * 60 + mm;

    const { data: prefs, error } = await admin
      .from("telegram_manager_weekly_prefs")
      .select("user_id, enabled, send_weekday, send_time, last_sent_date")
      .eq("enabled", true);
    if (error) throw error;

    const out: any[] = [];
    for (const p of prefs ?? []) {
      try {
        if (Number((p as any).send_weekday) !== weekday) continue;
        const [ph, pm] = String((p as any).send_time || "09:00").split(":").map(Number);
        const target = ph * 60 + pm;
        // 5-minute window so a 5-min cron does not miss
        if (nowMin < target || nowMin >= target + 5) continue;
        if ((p as any).last_sent_date === today) continue; // anti-duplicate

        const result = await processOwner(
          admin, (p as any).user_id,
          { skip_chat_check: false },
          LOVABLE_API_KEY, TELEGRAM_API_KEY, today,
        );

        // Mark as sent only if we actually attempted sending (not skipped)
        if (!(result as any).skipped) {
          await admin.from("telegram_manager_weekly_prefs")
            .update({ last_sent_date: today })
            .eq("user_id", (p as any).user_id);
        }
        out.push(result);
      } catch (e) {
        console.error("manager weekly error", (p as any).user_id, e);
        out.push({ owner_id: (p as any).user_id, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: out.length, hhmm, weekday, results: out }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[telegram-manager-weekly-summary] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
