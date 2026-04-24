import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_TZ = "America/Sao_Paulo";

function nowInTz(tz = APP_TZ): Date {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

function todayStr(tz = APP_TZ): string {
  const d = nowInTz(tz);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((da - db) / (1000 * 60 * 60 * 24));
}

function normalizePhoneBR(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBR(date: string): string {
  if (!date) return "";
  const d = date.length >= 10 ? date.substring(0, 10) : date;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function applyVariables(message: string, ctx: { name: string; amount: number; dueDate: string }) {
  return message
    .replace(/{nome}/g, ctx.name || "")
    .replace(/{valor}/g, formatBRL(ctx.amount))
    .replace(/{data_vencimento}/g, formatBR(ctx.dueDate));
}

const DEFAULT_MESSAGES = {
  a_vencer:
    "Olá {nome}, seu pagamento de {valor} vence em {data_vencimento}. Evite juros pagando antecipadamente.",
  vence_hoje:
    "Olá {nome}, seu pagamento de {valor} vence hoje ({data_vencimento}). Por favor, regularize para evitar encargos.",
  vencida:
    "Olá {nome}, identificamos um pagamento de {valor} em atraso desde {data_vencimento}. Entre em contato para regularização.",
};

type DueStatus = "vencida" | "vence_hoje" | "a_vencer";

function getDueStatus(dueDate: string, today: string): DueStatus {
  const d = diffDays(dueDate, today);
  if (d < 0) return "vencida";
  if (d === 0) return "vence_hoje";
  return "a_vencer";
}

async function sendWhatsmiau(baseUrl: string, instance: string, apiKey: string, phone: string, text: string) {
  const url = `${baseUrl.replace(/\/+$/, "")}/message/sendText/${instance}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number: phone, text, textMessage: { text } }),
  });
  const body = await resp.text();
  return { ok: resp.ok, status: resp.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const API_KEY = Deno.env.get("WHATSMIAU_API_KEY") ?? "";

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let forceOwner: string | null = null;
    let manualRun = false;
    try {
      const json = await req.json();
      if (json?.owner_id) forceOwner = json.owner_id;
      manualRun = json?.manual_run === true;
    } catch { /* no body */ }

    const today = todayStr();
    const nowHM = (() => {
      const d = nowInTz();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    })();

    let scheduleQuery = admin.from("whatsapp_billing_schedule").select("*").eq("enabled", true);
    if (forceOwner) scheduleQuery = scheduleQuery.eq("owner_id", forceOwner);
    const { data: schedules, error: schedErr } = await scheduleQuery;
    if (schedErr) throw schedErr;

    const results: any[] = [];

    for (const sched of schedules ?? []) {
      if (!forceOwner) {
        const targetHour = (sched.send_time || "09:00").slice(0, 2);
        const currentHour = nowHM.slice(0, 2);
        if (targetHour !== currentHour) continue;
      }

      if (!sched.base_url || !sched.instance_id || !API_KEY) {
        results.push({ owner_id: sched.owner_id, skipped: "missing_credentials" });
        continue;
      }

      const ownerId = sched.owner_id;

      const { data: tplRow } = await admin
        .from("whatsapp_billing_messages")
        .select("message_upcoming, message_due_today, message_overdue")
        .eq("owner_id", ownerId)
        .maybeSingle();
      const templates: Record<DueStatus, string> = {
        a_vencer: tplRow?.message_upcoming?.trim() || DEFAULT_MESSAGES.a_vencer,
        vence_hoje: tplRow?.message_due_today?.trim() || DEFAULT_MESSAGES.vence_hoje,
        vencida: tplRow?.message_overdue?.trim() || DEFAULT_MESSAGES.vencida,
      };

      const { data: loans } = await admin
        .from("loans").select("*")
        .eq("user_id", ownerId)
        .neq("status", "paid")
        .eq("auto_billing_enabled", true);

      if (!loans?.length) continue;

      const loanIds = loans.map((l: any) => l.id);
      const borrowerIds = Array.from(new Set(loans.map((l: any) => l.borrower_id).filter(Boolean)));

      const { data: clients } = borrowerIds.length
        ? await admin.from("clients").select("id, name, phone, auto_billing_enabled").in("id", borrowerIds)
        : { data: [] as any[] };
      const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));

      const { data: schedules2 } = await admin
        .from("loan_installments").select("*").in("loan_id", loanIds);
      const schedByLoan = new Map<string, any[]>();
      for (const s of schedules2 ?? []) {
        const arr = schedByLoan.get(s.loan_id) ?? [];
        arr.push(s);
        schedByLoan.set(s.loan_id, arr);
      }

      const { data: todayLogs } = await admin
        .from("whatsapp_billing_log")
        .select("loan_id, status_when_sent, success")
        .eq("owner_id", ownerId)
        .eq("sent_date", today);
      const sentTodayKey = new Set(
        (todayLogs ?? []).filter((l) => l.success).map((l) => `${l.loan_id}|${l.status_when_sent}`),
      );

      for (const loan of loans) {
        try {
          const client = loan.borrower_id ? clientById.get(loan.borrower_id) : null;
          const phoneRaw = client?.phone || "";
          if (!phoneRaw) continue;
          // Skip clients that have automatic billing disabled at client level
          if (client && client.auto_billing_enabled === false) continue;

          const paid = loan.paid_installments ?? 0;
          const total = loan.installments ?? 1;
          if (paid >= total) continue;

          const list = (schedByLoan.get(loan.id) ?? []).sort(
            (a: any, b: any) => a.installment_number - b.installment_number,
          );
          const nextInst = list.find((s: any) => s.installment_number === paid + 1);
          const dueDate: string | null =
            nextInst?.due_date ?? loan.due_date ?? null;
          const installmentNumber = (nextInst?.installment_number ?? paid + 1) as number;
          const amount = Number(nextInst?.amount ?? loan.amount ?? 0);

          if (!dueDate) continue;

          const status = getDueStatus(dueDate, today);
          const daysDiff = diffDays(dueDate, today);

          let shouldSend = false;
          if (status === "a_vencer") {
            shouldSend = daysDiff === (sched.days_before_due ?? 1);
          } else if (status === "vence_hoje") {
            shouldSend = !!sched.send_on_due_day;
          } else if (status === "vencida") {
            if (sched.send_when_overdue) {
              const overdueDays = Math.abs(daysDiff);
              const repeat = Math.max(1, sched.overdue_repeat_days ?? 3);
              shouldSend = manualRun ? overdueDays > 0 : overdueDays === 0 || overdueDays % repeat === 0;
            }
          }
          if (!shouldSend) continue;

          const key = `${loan.id}|${status}`;
          if (sentTodayKey.has(key)) continue;

          const template = templates[status] ?? "";
          if (!template.trim()) continue;

          const message = applyVariables(template, {
            name: client?.name ?? loan.borrower_name ?? "",
            amount,
            dueDate,
          });

          const phone = normalizePhoneBR(phoneRaw);
          const send = await sendWhatsmiau(sched.base_url, sched.instance_id, API_KEY, phone, message);

          await admin.from("whatsapp_billing_log").insert({
            owner_id: ownerId,
            loan_id: loan.id,
            client_id: client?.id ?? null,
            installment_number: installmentNumber,
            status_when_sent: status,
            phone,
            message,
            success: send.ok,
            error_message: send.ok ? null : `HTTP ${send.status}: ${send.body.slice(0, 500)}`,
            sent_date: today,
          });

          results.push({
            owner_id: ownerId, loan_id: loan.id, status, success: send.ok,
          });
        } catch (e) {
          results.push({ owner_id: ownerId, loan_id: loan.id, error: String(e) });
        }
      }

      await admin.from("whatsapp_billing_schedule")
        .update({ last_run_at: new Date().toISOString() })
        .eq("owner_id", ownerId);
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[send-whatsapp-billing] error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
