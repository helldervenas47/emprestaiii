import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("EXTERNAL_SUPABASE_URL")!,
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
);

const ASAAS_API_URL = "https://api.asaas.com/v3";
const ASAAS_API_KEY = Deno.env.get("ASAAS_API_KEY")!;

const PLAN_TO_PRODUCT_ID: Record<string, string> = {
  "Básico":        "basico_plan",
  "Profissional":  "profissional_plan",
  "Empresarial":   "empresarial_plan",
};

const CYCLE_TO_ASAAS: Record<string, string> = {
  monthly:   "MONTHLY",
  semestral: "SEMIANNUALLY",
  annual:    "YEARLY",
};

async function getOrCreateAsaasCustomer(email: string, name: string): Promise<string> {
  // Buscar cliente existente
  const searchRes = await fetch(
    `${ASAAS_API_URL}/customers?email=${encodeURIComponent(email)}`,
    { headers: { "access_token": ASAAS_API_KEY } }
  );
  const searchData = await searchRes.json();
  if (searchData.data?.length > 0) return searchData.data[0].id;

  // Criar novo cliente
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
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { planName, cycle, userId, userEmail } = await req.json();

    if (!planName || !cycle || !userId || !userEmail) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), { status: 400 });
    }

    // Buscar preço do plano no banco
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("price, price_semestral, price_anual, name")
      .eq("name", planName)
      .eq("active", true)
      .maybeSingle();

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: "Plano não encontrado" }), { status: 404 });
    }

    const price =
      cycle === "semestral" ? (plan.price_semestral ?? plan.price * 6) :
      cycle === "annual"    ? (plan.price_anual    ?? plan.price * 12) :
      plan.price;

    // Buscar nome do usuário
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const customerName = profile?.display_name || userEmail;

    // Criar/buscar cliente no Asaas
    const asaasCustomerId = await getOrCreateAsaasCustomer(userEmail, customerName);

    // Criar link de pagamento (assinatura)
    const subRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: "POST",
      headers: { "access_token": ASAAS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: "UNDEFINED", // permite cartão, PIX ou boleto
        value: price,
        nextDueDate: new Date().toISOString().split("T")[0],
        cycle: CYCLE_TO_ASAAS[cycle],
        description: `Plano ${planName} - ${cycle}`,
        externalReference: userId,
        redirectLink: `${Deno.env.get("APP_URL") ?? "https://app.emprestai.com"}/?checkout=success`,
      }),
    });

    const sub = await subRes.json();
    if (!sub.id) throw new Error(`Erro ao criar assinatura: ${JSON.stringify(sub)}`);

    // Salvar assinatura pendente no banco para rastrear
    const productId = PLAN_TO_PRODUCT_ID[planName] ?? "basico_plan";
    const environment = ASAAS_API_KEY.startsWith("$aact_") ? "sandbox" : "live";

    await supabase.from("subscriptions").upsert({
      user_id: userId,
      asaas_subscription_id: sub.id,
      asaas_customer_id: asaasCustomerId,
      product_id: productId,
      price_id: `${productId}_${cycle}`,
      status: "pending",
      environment,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,environment" });

    // Retornar link de pagamento
    const checkoutUrl = sub.invoiceUrl || sub.bankSlipUrl || sub.invoiceNumber;
    return new Response(JSON.stringify({ checkoutUrl }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (e) {
    console.error("asaas-create-subscription error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});