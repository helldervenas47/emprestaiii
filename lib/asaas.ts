export async function createAsaasCheckoutUrl(options: {
  planName: string;
  cycle: "monthly" | "semestral" | "annual";
  userId: string;
  userEmail: string;
}): Promise<string> {
  const { data, error } = await import("@/integrations/supabase/userClient").then(
    (m) => m.supabase.functions.invoke("asaas-create-subscription", {
      body: options,
    })
  );
  if (error || !data?.checkoutUrl) {
    throw new Error("Não foi possível gerar o link de pagamento. Tente novamente.");
  }
  return data.checkoutUrl;
}
