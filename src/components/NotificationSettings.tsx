import { Bell, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useNotificationPreferences, NOTIFICATION_TYPES } from "@/hooks/useNotificationPreferences";
import { Skeleton } from "@/components/ui/skeleton";

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  return `${h}:00`;
});

export function NotificationSettings() {
  const { preferences, loading, upsert } = useNotificationPreferences();

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
              <div className="mt-3 flex items-center gap-2 pl-8">
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
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
