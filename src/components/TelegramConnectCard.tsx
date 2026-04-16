import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Send, Copy, CheckCircle2, Unlink, Clock, Zap, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { useTelegramSummaryPref } from "@/hooks/useTelegramSummaryPref";

const BOT_USERNAME_KEY = "telegram_bot_username";

export function TelegramConnectCard() {
  const [linked, setLinked] = useState<{ chat_id: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [sendingWeekly, setSendingWeekly] = useState(false);
  const botUsername = (typeof window !== "undefined" && localStorage.getItem(BOT_USERNAME_KEY)) || "";
  const { pref: summaryPref, update: updateSummary } = useTelegramSummaryPref();

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("telegram_links" as any)
      .select("chat_id")
      .eq("user_id", user.id)
      .maybeSingle();
    setLinked(data ? { chat_id: (data as any).chat_id } : null);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("telegram_links_self")
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_links" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-link-code");
      if (error) throw error;
      if ((data as any).alreadyLinked) {
        toast.success("Telegram já vinculado");
        await refresh();
        return;
      }
      setCode((data as any).code);
      setExpiresAt((data as any).expiresAt);
    } catch (e: any) {
      toast.error("Erro ao gerar código", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const copyCommand = () => {
    if (!code) return;
    const cmd = `/start ${code}`;
    navigator.clipboard.writeText(cmd);
    toast.success("Comando copiado!");
  };

  const disconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("telegram_links" as any).delete().eq("user_id", user.id);
    setLinked(null);
    toast.success("Telegram desvinculado");
  };

  const sendSummaryNow = async () => {
    setSendingNow(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke(
        `telegram-daily-summary?user_id=${user.id}`,
        { method: "POST" },
      );
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) {
        toast.success("Resumo enviado!", { description: "Confira seu Telegram." });
      } else {
        toast.warning("Nada enviado", {
          description: "Verifique se o resumo diário está habilitado e o Telegram vinculado.",
        });
      }
    } catch (e: any) {
      toast.error("Erro ao enviar resumo", { description: e.message });
    } finally {
      setSendingNow(false);
    }
  };

  const sendWeeklySummaryNow = async () => {
    setSendingWeekly(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const { data, error } = await supabase.functions.invoke(
        `telegram-weekly-summary?user_id=${user.id}`,
        { method: "POST" },
      );
      if (error) throw error;
      const sent = (data as any)?.sent ?? 0;
      if (sent > 0) {
        toast.success("Resumo semanal enviado!", { description: "Confira seu Telegram." });
      } else {
        toast.warning("Nada enviado", {
          description: "Verifique se o Telegram está vinculado.",
        });
      }
    } catch (e: any) {
      toast.error("Erro ao enviar resumo semanal", { description: e.message });
    } finally {
      setSendingWeekly(false);
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">Bot do Telegram</p>
              <p className="text-xs text-muted-foreground">
                Cadastre despesas pessoais por mensagem
              </p>
            </div>
          </div>
          {linked && (
            <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </span>
          )}
        </div>

        {linked ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Chat vinculado: <span className="font-mono">{linked.chat_id}</span>
              </p>
              <Button size="sm" variant="outline" onClick={disconnect}>
                <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
              </Button>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <Label htmlFor="tg-summary" className="text-sm cursor-pointer">
                    Resumo diário
                  </Label>
                </div>
                <Switch
                  id="tg-summary"
                  checked={summaryPref.enabled}
                  onCheckedChange={(v) => updateSummary({ enabled: v })}
                />
              </div>
              {summaryPref.enabled && (
                <div className="flex items-center gap-2 pt-1">
                  <Label htmlFor="tg-summary-time" className="text-xs text-muted-foreground">
                    Horário:
                  </Label>
                  <Input
                    id="tg-summary-time"
                    type="time"
                    value={summaryPref.send_time}
                    onChange={(e) => updateSummary({ send_time: e.target.value })}
                    className="h-8 w-28 text-xs"
                  />
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Total gasto no dia + saldo dos orçamentos por categoria.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sendSummaryNow}
                  disabled={sendingNow}
                >
                  <Zap className="h-3.5 w-3.5 mr-1" />
                  {sendingNow ? "Enviando…" : "Resumo de hoje"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={sendWeeklySummaryNow}
                  disabled={sendingWeekly}
                >
                  <CalendarDays className="h-3.5 w-3.5 mr-1" />
                  {sendingWeekly ? "Enviando…" : "Resumo semanal"}
                </Button>
              </div>
            </div>
          </div>
        ) : code ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              1. Abra seu bot no Telegram{botUsername ? ` (@${botUsername})` : ""}<br />
              2. Envie o comando abaixo (válido por 10 min):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm">/start {code}</code>
              <Button size="sm" variant="outline" onClick={copyCommand}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Aguardando vínculo… atualiza automaticamente.
            </p>
          </div>
        ) : (
          <Button size="sm" onClick={generateCode} disabled={generating} className="w-full sm:w-auto">
            <Send className="h-3.5 w-3.5 mr-1" />
            {generating ? "Gerando…" : "Conectar Telegram"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
