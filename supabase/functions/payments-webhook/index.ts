import { createClient } from 'npm:@supabase/supabase-js@2';
import { PaddleApiError, getPaddleEnvironment, type PaddleEnvironment } from '../_shared/paddle.ts';

const supabase = createClient(
  Deno.env.get('EXTERNAL_SUPABASE_URL')!,
  Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')!
);

// Paddle webhook event names (kept local since the shared paddle helper
// only exposes API client utilities — PaddleApiError, getPaddleEnvironment,
// getPaddleBaseUrl, getPaddleApiKey, paddleFetch, getPaddlePrice,
// listPaddlePrices, formatPaddleUnitPrice — and does NOT export an
// `EventName` enum/type. We define the event name constants locally.
const EventName = {
  SubscriptionCreated: 'subscription.created',
  SubscriptionUpdated: 'subscription.updated',
  SubscriptionCanceled: 'subscription.canceled',
  TransactionCompleted: 'transaction.completed',
  TransactionPaymentFailed: 'transaction.payment_failed',
} as const;

type PaddleEnv = PaddleEnvironment;

interface PaddleWebhookEvent {
  eventType: string;
  data: any;
}

// Minimal, dependency-free webhook signature verification + payload parsing.
// Paddle sends a "Paddle-Signature" header in the format: ts=<timestamp>;h1=<hmac>
// The HMAC is computed as SHA-256 of `${ts}:${rawBody}` using the webhook secret.
async function verifyWebhook(req: Request, env: PaddleEnv): Promise<PaddleWebhookEvent> {
  const rawBody = await req.text();

  const secret = env === 'production'
    ? Deno.env.get('PADDLE_WEBHOOK_SECRET_PRODUCTION')
    : Deno.env.get('PADDLE_WEBHOOK_SECRET_SANDBOX') ?? Deno.env.get('PADDLE_WEBHOOK_SECRET');

  const signatureHeader = req.headers.get('paddle-signature') || req.headers.get('Paddle-Signature');

  if (secret && signatureHeader) {
    const parts = Object.fromEntries(
      signatureHeader.split(';').map((p) => {
        const [k, v] = p.split('=');
        return [k?.trim(), v?.trim()];
      })
    );
    const ts = parts['ts'];
    const h1 = parts['h1'];

    if (!ts || !h1) {
      throw new PaddleApiError('Invalid Paddle-Signature header', 400);
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(`${ts}:${rawBody}`)
    );
    const computedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (computedHex !== h1) {
      throw new PaddleApiError('Webhook signature mismatch', 401);
    }
  } else {
    console.warn('Paddle webhook secret or signature header missing — skipping signature verification.');
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new PaddleApiError('Invalid JSON payload', 400);
  }

  return {
    eventType: payload.event_type ?? payload.eventType,
    data: payload.data,
  };
}

// Map product_id from subscription to plan name
const PRODUCT_TO_PLAN_NAME: Record<string, string> = {
  free_plan: 'Free',
  basico_plan: 'Básico',
  profissional_plan: 'Profissional',
  empresarial_plan: 'Empresarial',
};

async function syncTabPermissions(userId: string, productId: string) {
  const planName = PRODUCT_TO_PLAN_NAME[productId];
  if (!planName) {
    console.log('Unknown product_id for tab sync:', productId);
    return;
  }

  const { data: plan } = await supabase
    .from('plans')
    .select('allowed_tabs')
    .eq('name', planName)
    .eq('active', true)
    .maybeSingle();

  if (!plan) {
    console.log('Plan not found for name:', planName);
    return;
  }

  const allowedTabs = plan.allowed_tabs;

  // Upsert user_tab_permissions
  const { data: existing } = await supabase
    .from('user_tab_permissions')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('user_tab_permissions')
      .update({ allowed_tabs: allowedTabs, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } else {
    await supabase
      .from('user_tab_permissions')
      .insert({ user_id: userId, allowed_tabs: allowedTabs });
  }

  console.log('Tab permissions synced for user', userId, 'plan', planName, 'tabs', allowedTabs);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const envParam = url.searchParams.get('env');
  const env: PaddleEnv = envParam === 'production' || envParam === 'sandbox'
    ? envParam
    : getPaddleEnvironment();

  try {
    const event = await verifyWebhook(req, env);
    console.log('Received event:', event.eventType, 'env:', env);

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await handleSubscriptionCreated(event.data, env);
        break;
      case EventName.SubscriptionUpdated:
        await handleSubscriptionUpdated(event.data, env);
        break;
      case EventName.SubscriptionCanceled:
        await handleSubscriptionCanceled(event.data, env);
        break;
      case EventName.TransactionCompleted:
        console.log('Transaction completed:', event.data.id, 'env:', env);
        break;
      case EventName.TransactionPaymentFailed:
        console.log('Payment failed:', event.data.id, 'env:', env);
        break;
      default:
        console.log('Unhandled event:', event.eventType);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Webhook error:', e);
    const status = e instanceof PaddleApiError ? e.status : 400;
    return new Response('Webhook error', { status });
  }
});

async function handleSubscriptionCreated(data: any, env: PaddleEnv) {
  const { id, customerId, items, status, currentBillingPeriod, customData } = data;

  const userId = customData?.userId;
  if (!userId) {
    console.error('No userId in customData');
    return;
  }

  const item = items[0];
  const priceId = item.price.importMeta?.externalId || item.price.id;
  const productId = item.product.importMeta?.externalId || item.product.id;

  await supabase.from('subscriptions').upsert({
    user_id: userId,
    paddle_subscription_id: id,
    paddle_customer_id: customerId,
    product_id: productId,
    price_id: priceId,
    status: status,
    current_period_start: currentBillingPeriod?.startsAt,
    current_period_end: currentBillingPeriod?.endsAt,
    environment: env,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'user_id,environment',
  });

  // Sync tab permissions based on plan
  await syncTabPermissions(userId, productId);
}

async function handleSubscriptionUpdated(data: any, env: PaddleEnv) {
  const { id, status, currentBillingPeriod, scheduledChange, items } = data;

  await supabase.from('subscriptions')
    .update({
      status: status,
      current_period_start: currentBillingPeriod?.startsAt,
      current_period_end: currentBillingPeriod?.endsAt,
      cancel_at_period_end: scheduledChange?.action === 'cancel',
      updated_at: new Date().toISOString(),
    })
    .eq('paddle_subscription_id', id)
    .eq('environment', env);

  // If plan changed, sync tab permissions
  if (items?.length > 0) {
    const productId = items[0].product.importMeta?.externalId || items[0].product.id;
    // Get user_id from subscription
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('paddle_subscription_id', id)
      .eq('environment', env)
      .maybeSingle();

    if (sub?.user_id) {
      await syncTabPermissions(sub.user_id, productId);
    }
  }
}

async function handleSubscriptionCanceled(data: any, env: PaddleEnv) {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env)
    .maybeSingle();

  await supabase.from('subscriptions')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('paddle_subscription_id', data.id)
    .eq('environment', env);

  // Revert to free plan tabs
  if (sub?.user_id) {
    await syncTabPermissions(sub.user_id, 'free_plan');
  }
}