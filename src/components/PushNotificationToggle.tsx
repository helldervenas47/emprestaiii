import { Bell, BellOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

export function PushNotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

  if (!isSupported) return null;

  const handleToggle = async (checked: boolean) => {
    if (checked) {
      const ok = await subscribe();
      if (ok) {
        toast.success("Notificações ativadas!");
      } else if (permission === "denied") {
        toast.error("Permissão negada. Habilite nas configurações do navegador.");
      }
    } else {
      await unsubscribe();
      toast.info("Notificações desativadas.");
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isSubscribed ? (
        <Bell className="h-4 w-4 text-primary" />
      ) : (
        <BellOff className="h-4 w-4 text-muted-foreground" />
      )}
      <Switch
        checked={isSubscribed}
        onCheckedChange={handleToggle}
        disabled={isLoading}
        aria-label="Notificações push"
      />
    </div>
  );
}
