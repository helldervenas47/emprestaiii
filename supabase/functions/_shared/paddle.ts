// supabase/functions/_shared/paddle.ts
// Shared helper utilities for interacting with the Paddle Billing API
// from Supabase Edge Functions (Deno runtime).
//
// This module centralizes:
//  - Reading Paddle secrets from environment variables (never hardcoded)
//  - Building the correct base URL for sandbox vs production
//  - A small fetch wrapper with consistent error handling
//  - Helpers to fetch a price by id and to list prices for a product
//
// IMPORTANT: This file must never expose secret keys to the client.
// It runs only inside Supabase Edge Functions (server-side).

export type PaddleEnvironment = "sandbox" | "production";

export interface PaddlePriceUnitPrice {
  amount: string;
  currency_code: string;
}

export interface PaddlePrice {
  id: string;
  product_id: string;
  description?: string;
  name?: string | null;
  billing_cycle?: {
    interval: "day" | "week" | "month" | "year";
    frequency: number;
  } | null;
  trial_period?: {
    interval: "day" | "week" | "month" | "year";
    frequency: number;
  } | null;
  tax_mode?: string;
  unit_price: PaddlePriceUnitPrice;
  status?: string;
  quantity?: {
    minimum: number;
    maximum: number;
  };
  custom_data?: Record<string, unknown> | null;
}

export interface PaddleApiListResponse<T> {
  data: T[];
  meta?: {
    request_id?: string;
    pagination?: {
      per_page: number;
      next?: string | null;
      has_more: boolean;
      estimated_total?: number;
    };
  };
}

export interface PaddleApiItemResponse<T> {
  data: T;
  meta?: {
    request_id?: string;
  };
}

export class PaddleApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "PaddleApiError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Resolves the Paddle environment based on the PADDLE_ENVIRONMENT secret.
 * Defaults to "sandbox" when not explicitly set to "production" — this is
 * the safer default while the integration is being tested.
 */
export function getPaddleEnvironment(): PaddleEnvironment {
  const raw = (Deno.env.get("PADDLE_ENVIRONMENT") || "sandbox").toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

/**
 * Returns the correct Paddle API base URL for the current environment.
 */
export function getPaddleBaseUrl(): string {
  const env = getPaddleEnvironment();
  return env === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

/**
 * Reads the Paddle API key from Supabase Function Secrets.
 * NEVER expose this value to the frontend — it must only be used
 * inside Edge Functions (server-side).
 */
export function getPaddleApiKey(): string {
  const key = Deno.env.get("PADDLE_API_KEY");
  if (!key) {
    throw new PaddleApiError(
      "PADDLE_API_KEY não está configurada nos segredos da função. Configure o segredo no painel do Supabase antes de usar a integração com Paddle.",
      500,
    );
  }
  return key;
}

interface PaddleFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  searchParams?: Record<string, string | number | undefined>;
}

/**
 * Low-level fetch wrapper for the Paddle Billing API.
 * Adds auth headers, JSON handling and normalized error reporting.
 */
export async function paddleFetch<T>(
  path: string,
  options: PaddleFetchOptions = {},
): Promise<T> {
  const apiKey = getPaddleApiKey();
  const baseUrl = getPaddleBaseUrl();

  const url = new URL(`${baseUrl}${path}`);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const errorMessage =
      (json && typeof json === "object" && json !== null && "error" in json
        ? (json as { error?: { detail?: string; code?: string } }).error?.detail
        : null) || `Falha ao comunicar com a API do Paddle (HTTP ${response.status})`;

    throw new PaddleApiError(errorMessage, response.status, json);
  }

  return json as T;
}

/**
 * Fetches a single price by its Paddle price id (e.g. "pri_01h...").
 */
export async function getPaddlePrice(priceId: string): Promise<PaddlePrice> {
  if (!priceId || typeof priceId !== "string") {
    throw new PaddleApiError("O parâmetro priceId é obrigatório.", 400);
  }

  const result = await paddleFetch<PaddleApiItemResponse<PaddlePrice>>(
    `/prices/${encodeURIComponent(priceId)}`,
    { method: "GET" },
  );

  return result.data;
}

/**
 * Lists prices, optionally filtered by product id(s).
 * Useful to render pricing tables dynamically from Paddle instead of
 * hardcoding values in the frontend.
 */
export async function listPaddlePrices(options: {
  productIds?: string[];
  status?: "active" | "archived";
  perPage?: number;
} = {}): Promise<PaddlePrice[]> {
  const result = await paddleFetch<PaddleApiListResponse<PaddlePrice>>(
    "/prices",
    {
      method: "GET",
      searchParams: {
        product_id: options.productIds?.join(","),
        status: options.status,
        per_page: options.perPage ?? 50,
      },
    },
  );

  return result.data;
}

/**
 * Formats a Paddle unit price (which comes as a string in the smallest
 * currency unit, e.g. cents) into a human-readable BRL/major-unit value.
 * Paddle amounts are integers representing the smallest denomination
 * (e.g. "4990" for R$ 49,90 when currency has 2 decimal places).
 */
export function formatPaddleUnitPrice(unitPrice: PaddlePriceUnitPrice): string {
  const amountNumber = Number(unitPrice.amount);
  if (Number.isNaN(amountNumber)) return unitPrice.amount;

  const majorValue = amountNumber / 100;

  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: unitPrice.currency_code || "BRL",
    }).format(majorValue);
  } catch {
    // Fallback for currency codes Intl might not support in this runtime
    return `${unitPrice.currency_code} ${majorValue.toFixed(2)}`;
  }
}