import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("EXTERNAL_SUPABASE_URL")!,
  Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!
);

const ASAAS_WEBHOOK_TOKEN = Deno.env.get("ASAAS_WEBHOOK_TOKEN")!;

const PRODUCT_TO_PLAN_NAME: Record<string, string> = {
  basico_plan:        "Básico",
  profissional_plan:  "Profissional",
  empresarial_plan:   "Empresarial",
};

async function syncTabPermissions(userId: string, productId: string) {
  const planName = PRODUCT_TO_PLAN_NAME[productId];
  if (!planName) return;

  const { data: plan } = await supabase
    .from("plans")
    .select("allowed_tabs")
    .eq("name", planName)
    .eq("active", true)
    .maybeSingle();

  if (!plan) return;

  await supabase.from("user_tab_permissions").upsert(
    { user_id: userId, allowed_tabs: plan.allowed_tabs, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Validar token do webhook
  const token = req.headers.get("asaas-access-token") ?? new URL(req.url).searchParams.get("token");
  if (ASAAS_WEBHOOK_TOKEN && token !== ASAAS_WEBHOOK_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const event = await req.json();
    const { event: eventType, payment, subscription } = event;

    console.log("Asaas webhook event:", eventType);

    // Eventos de pagamento confirmado
    if (["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(eventType) && payment) {
      const asaasSubId = payment.subscription;
      if (!asaasSubId) return new Response("OK", { status: 200 });

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id, product_id")
        .eq("asaas_subscription_id", asaasSubId)
        .maybeSingle();

      if (!sub) {
        // Tentar pelo externalReference
        const userId = payment.externalReference;
        if (!userId) return new Response("OK", { status: 200 });

        await supabase.from("subscriptions").upsert({
          user_id: userId,
          asaas_subscription_id: asaasSubId,
          product_id: "basico_plan",
          price_id: "basico_plan_monthly",
          status: "active",
          current_period_end: payment.dueDate
            ? new Date(new Date(payment.dueDate).getTime() + 30 * 86400_000).toISOString()
            : null,
          environment: "live",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,environment" });
        return new Response("OK", { status: 200 });
      }

      // Ativar assinatura existente
      const dueDate = payment.dueDate
        ? new Date(new Date(payment.dueDate).getTime() + 30 * 86400_000).toISOString()
        : null;

      await supabase.from("subscriptions")
        .update({ status: "active", current_period_end: dueDate, updated_at: new Date().toISOString() })
        .eq("asaas_subscription_id", asaasSubId);

      await syncTabPermissions(sub.user_id, sub.product_id);
    }

    // Assinatura cancelada ou inadimplente
    if (["PAYMENT_OVERDUE", "SUBSCRIPTION_INACTIVATED"].includes(eventType)) {
      const asaasSubId = payment?.subscription ?? subscription?.id;
      if (!asaasSubId) return new Response("OK", { status: 200 });

      const newStatus = eventType === "SUBSCRIPTION_INACTIVATED" ? "canceled" : "past_due";

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("user_id")
        .eq("asaas_subscription_id", asaasSubId)
        .maybeSingle();

      await supabase.from("subscriptions")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("asaas_subscription_id", asaasSubId);

      if (sub?.user_id && newStatus === "canceled") {
        await syncTabPermissions(sub.user_id, "free_plan");
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});