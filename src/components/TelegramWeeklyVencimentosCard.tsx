import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { CalendarClock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/userClient";

export function TelegramWeeklyVencimentosCard() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return;
        const { data } = await (supabase as any)
          .from("telegram_weekly_vencimentos_prefs")
          .select("enabled")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (data) setEnabled(data.enabled !== false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async (value: boolean) => {
    setEnabled(value);
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      await (supabase as any).from("telegram_weekly_vencimentos_prefs").upsert({
        user_id: auth.user.id,
        enabled: value,
        updated_at: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card no3d>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <CalendarClock className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm">Vencimentos da semana (segundas-feiras)</p>
          <p className="text-xs text-muted-foreground">
            Receba automaticamente o relatório /vencimentos_semana no bot de relatórios toda segunda às 08:00.
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
        )}
      </CardContent>
    </Card>
  );
}
