import { useState } from "react";
import { createAsaasCheckoutUrl } from "@/lib/asaas";
import { toast } from "@/hooks/use-toast";

export function useAsaasCheckout() {
  const [loading, setLoading] = useState(false);

  const openCheckout = async (options: {
    planName: string;
    cycle: "monthly" | "semestral" | "annual";
    userId: string;
    userEmail: string;
  }) => {
    setLoading(true);
    try {
      const url = await createAsaasCheckoutUrl(options);
      window.location.href = url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast({
        title: "Erro ao gerar pagamento",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return { openCheckout, loading };
}
