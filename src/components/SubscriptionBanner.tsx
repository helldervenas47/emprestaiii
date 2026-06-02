import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

export function SubscriptionBanner() {
  const { isActive, loading } = useSubscription();
  const navigate = useNavigate();

  if (loading || isActive) return null;

  return (
    <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-2.5 flex items-center justify-center gap-3 text-sm">
      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
      <span className="text-foreground">
        Você não possui um plano ativo. Algumas funcionalidades estão bloqueadas.
      </span>
      <Button variant="outline" size="sm" onClick={() => navigate("/planos")} className="shrink-0 h-7 text-xs">
        Ver planos <ArrowRight className="h-3 w-3" />
      </Button>
    </div>
  );
}
