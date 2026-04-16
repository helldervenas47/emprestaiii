import { useState } from "react";
import { Bell, Clock, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNotificationPreferences, NOTIFICATION_TYPES } from "@/hooks/useNotificationPreferences";
import { Skeleton } from "@/components/ui/skeleton";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  return `${h}:00`;
});

const TEST_URLS: Record<string, string> = {
  parcelas_hoje: "/?tab=dashboard&filter=due_today&view=rows",
  parcelas_atrasadas: "/?tab=dashboard&filter=overdue&view=rows",
  resumo_diario: "/?tab=overdue",
};

export function NotificationSettings() {
  const { preferences, loading, upsert } = useNotificationPreferences();
  const { isSubscribed } = usePushNotifications();
  const [sendingTest, setSendingTest] = useState<string | null>(null);

  const handleSendTest = async (type: string, label: string) => {
    try {
      setSendingTest(type);
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (!reg) {
        toast.error("Ative as notificações push primeiro.");
        return;
      }
      await reg.showNotification("📊 Empréstai — Teste", {
        body: TEST_BODIES[type] || `Teste: ${label}`,
        icon: "/logo-icon.png",
        badge: "/logo-icon.png",
        data: { url: "/?tab=overdue" },
      } as NotificationOptions);
      toast.success("Notificação de teste enviada!");
    } catch {
      toast.error("Erro ao enviar notificação de teste.");
    } finally {
      setSendingTest(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Configure quais notificações você deseja receber e em qual horário.
      </p>
      {NOTIFICATION_TYPES.map((nt) => {
        const pref = preferences.find(p => p.notification_type === nt.type);
        const enabled = pref?.enabled ?? false;
        const sendTime = pref?.send_time ?? "08:00";

        return (
          <Card key={nt.type} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <Bell className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground">{nt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{nt.description}</p>
                </div>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={(val) => upsert(nt.type, { enabled: val })}
              />
            </div>
            {enabled && (
              <div className="mt-3 flex items-center gap-2 pl-8 flex-wrap">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Horário:</span>
                <Select value={sendTime} onValueChange={(val) => upsert(nt.type, { send_time: val })}>
                  <SelectTrigger className="w-24 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => (
                      <SelectItem key={h} value={h}>{h}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-9 text-xs gap-1.5"
                  disabled={!isSubscribed || sendingTest === nt.type}
                  onClick={() => handleSendTest(nt.type, nt.label)}
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingTest === nt.type ? "Enviando..." : "Enviar teste"}
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}