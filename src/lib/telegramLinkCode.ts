import { supabase, USER_SUPABASE_PUBLISHABLE_KEY, USER_SUPABASE_URL } from "@/integrations/supabase/userClient";

type TelegramLinkCodeFunction = "telegram-link-code" | "telegram-reports-link-code";

export async function generateTelegramLinkCode(functionName: TelegramLinkCodeFunction = "telegram-link-code") {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (sessionError || !accessToken) {
    throw new Error("Sessão expirada. Saia e entre novamente para gerar o código do Telegram.");
  }

  const response = await fetch(`${USER_SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: USER_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: "{}",
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