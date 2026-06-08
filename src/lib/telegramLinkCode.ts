import { supabase, USER_SUPABASE_PUBLISHABLE_KEY, USER_SUPABASE_URL } from "@/integrations/supabase/userClient";

type TelegramLinkCodeFunction = "telegram-link-code" | "telegram-reports-link-code";

export function normalizeTelegramBotCode(input: string) {
  const commandMatch = input.match(/\/start(?:@\w+)?\s+(\d{6})\b/i);
  if (commandMatch) return commandMatch[1];

  for (const line of input.split(/\r?\n/)) {
    const candidate = line.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6,12}$/.test(candidate)) return candidate;
  }

  const tokens = input.toUpperCase().match(/[A-Z0-9]{6,12}/g) ?? [];
  const mixedToken = tokens.find((token) => /[A-Z]/.test(token) && /\d/.test(token));
  if (mixedToken) return mixedToken;
  const numericToken = tokens.find((token) => /^\d{6}$/.test(token));
  if (numericToken) return numericToken;
  const compact = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact;
}

export async function invokeUserFunction(functionName: string, body: unknown = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error("Sessão expirada. Saia e entre novamente para continuar.");
  }

  const response = await fetch(`${USER_SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: USER_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text };
  }

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error || `Erro ${response.status} ao gerar código do Telegram`);
  }

  return payload;
}

export async function generateTelegramLinkCode(functionName: TelegramLinkCodeFunction = "telegram-link-code") {
  return invokeUserFunction(functionName);
}