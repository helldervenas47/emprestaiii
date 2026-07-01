// asaas-create-subscription
//
// Segurança (Prioridade 1.3):
// - JWT obrigatório no header Authorization.
// - userId oficial = auth.getUser(token).id — body.userId é IGNORADO.
// - Email oficial = user.email — body.userEmail apenas fallback informativo.
// - Service role usado só para escrita interna, nunca para decidir identidade.
// - Rate limit em memória por usuário (5 req / 60s).
// - Logs sem token nem payload cru.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ASAAS_API_URL = "https://api.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

const PLAN_TO_PRODUCT_ID: Record<string, string> = {
  "Básico": "basico_plan",
  "Profissional": "profissional_plan",
  "Empresarial": "empresarial_plan",
};

const CYCLE_TO_ASAAS: Record<string, string> = {
  monthly: "MONTHLY",
  semestral: "SEMIANNUALLY",
  annual: "YEARLY",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Rate limit simples em memória (por instância). 5 req/min por usuário.
const rateBucket = new Map<string, number[]>();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 5;
  const arr = (rateBucket.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    rateBucket.set(userId, arr);
    return true;
  }
  arr.push(now);
  rateBucket.set(userId, arr);
  return false;
}

async function getOrCreateAsaasCustomer(email: string, name: string): Promise<string> {
  const searchRes = await fetch(
    `${ASAAS_API_URL}/customers?email=${encodeURIComponent(email)}`,
    { headers: { "access_token": ASAAS_API_KEY } },
  );
  const searchData = await searchRes.json();
  if (searchData.data?.length > 0) return searchData.data[0].id;

  const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
    method: "POST",
    headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ name: name || email, email }),
  });
  const customer = await createRes.json();
  if (!customer.id) throw new Error(`Erro ao criar cliente Asaas: ${JSON.stringify(customer)}`);
  return customer.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- 1. Autenticação ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized: missing bearer token" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return json({ error: "Unauthorized: invalid token" }, 401);
    }
    const authUser = userData.user;
    const authenticatedUserId = authUser.id;
    const authenticatedEmail = authUser.email ?? "";

    // --- 2. Rate limit ---
    if (isRateLimited(authenticatedUserId)) {
      return json({ error: "Too many requests" }, 429);
    }

    // --- 3. Input ---
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const planName = typeof body.planName === "string" ? body.planName : "";
    const cycle = typeof body.cycle === "string" ? body.cycle : "";
    const bodyUserId = typeof body.userId === "string" ? body.userId : undefined;
    const bodyUserEmail = typeof body.userEmail === "string" ? body.userEmail : undefined;

    if (!planName || !cycle) {
      return json({ error: "Parâmetros inválidos: planName e cycle são obrigatórios" }, 400);
    }
    if (!CYCLE_TO_ASAAS[cycle]) {
      return json({ error: "cycle inválido" }, 400);
    }
    if (bodyUserId && bodyUserId !== authenticatedUserId) {
      console.warn(
        `[asaas-create-subscription] body.userId ignorado (deprecated). auth=${authenticatedUserId}`,
      );
    }

    // Email oficial vem do JWT. Body só é usado se JWT não tiver email (não deve acontecer).
    const finalEmail = authenticatedEmail || bodyUserEmail || "";
    if (!finalEmail) {
      return json({ error: "Usuário sem email válido" }, 400);
    }

    // --- 4. Plano ---
    const { data: plan, error: planError } = await adminClient
      .from("plans")
      .select("price, price_semestral, price_anual, name")
      .eq("name", planName)
      .eq("active", true)
      .maybeSingle();

    if (planError || !plan) {
      return json({ error: "Plano não encontrado" }, 404);
    }

    const price =
      cycle === "semestral" ? (plan.price_semestral ?? plan.price * 6) :
      cycle === "annual" ? (plan.price_anual ?? plan.price * 12) :
      plan.price;

    // --- 5. Nome do cliente (perfil do usuário autenticado) ---
    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    const customerName = profile?.display_name || finalEmail;

    // --- 6. Cliente Asaas ---
    const asaasCustomerId = await getOrCreateAsaasCustomer(finalEmail, customerName);

    // --- 7. Assinatura Asaas ---
    const subRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: "POST",
      headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "UNDEFINED",
        value: price,
        nextDueDate: new Date().toISOString().split("T")[0],
        cycle: CYCLE_TO_ASAAS[cycle],
        description: `Plano ${planName} - ${cycle}`,
        externalReference: authenticatedUserId,
        redirectLink: `${Deno.env.get("APP_URL") ?? "https://app.emprestai.com"}/?checkout=success`,
      }),
    });

    const sub = await subRes.json();
    if (!sub.id) throw new Error(`Erro ao criar assinatura: ${JSON.stringify(sub)}`);

    // --- 8. Persistência (SEMPRE scoped ao userId do JWT) ---
    const productId = PLAN_TO_PRODUCT_ID[planName] ?? "basico_plan";
    const environment = ASAAS_API_KEY.startsWith("$aact_") ? "sandbox" : "live";

    const { error: upsertErr } = await adminClient.from("subscriptions").upsert({
      user_id: authenticatedUserId,
      asaas_subscription_id: sub.id,
      asaas_customer_id: asaasCustomerId,
      product_id: productId,
      price_id: `${productId}_${cycle}`,
      status: "pending",
      environment,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,environment" });

    if (upsertErr) {
      console.error(
        `[asaas-create-subscription] upsert falhou user=${authenticatedUserId}: ${upsertErr.message}`,
      );
    } else {
      console.log(
        `[asaas-create-subscription] ok user=${authenticatedUserId} plan=${planName} cycle=${cycle}`,
      );
    }

    // --- 9. Resposta compatível ---
    const checkoutUrl = sub.invoiceUrl || sub.bankSlipUrl || sub.invoiceNumber;
    return json({ checkoutUrl });
  } catch (e) {
    console.error("[asaas-create-subscription] erro:", (e as Error)?.message ?? e);
    return json({ error: "Falha interna" }, 500);
  }
});
