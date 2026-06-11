import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Send, CalendarClock } from "lucide-react";
import { useTelegramReportsLink } from "@/hooks/useTelegramReportsLink";
import { supabase } from "@/integrations/supabase/userClient";
import { toast } from "sonner";

export function TelegramWeeklyVencimentosCard() {
  const { linked } = useTelegramReportsLink();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

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

  const handleSendNow = async () => {
    setSendingNow(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error("Sessão não encontrada");
      const { error } = await supabase.functions.invoke(
        `telegram-vencimentos-semana?user_id=${userId}`,
        { body: {} },
      );
      if (error) throw error;
      toast.success("Relatório enviado para o Telegram!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar relatório");
    } finally {
      setSendingNow(false);
    }
  };

  if (loading) return null;

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarClock className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Vencimentos da semana</h3>
              <p className="text-xs text-muted-foreground truncate">
                Envio automático toda segunda-feira às 08:00.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} />
        </div>

        {enabled && (
          <div className="space-y-3 pt-2 border-t border-border/40">
            <Button
              type="button"
              size="sm"
              className="w-full"
              onClick={handleSendNow}
              disabled={sendingNow || !linked}
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              <span className="truncate">{sendingNow ? "Enviando..." : "Enviar agora"}</span>
            </Button>
            {!linked && (
              <p className="text-[11px] text-muted-foreground">
                Conecte o Bot de Relatórios para habilitar os envios.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
