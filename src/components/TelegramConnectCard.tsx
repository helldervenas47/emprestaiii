import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Copy, CheckCircle2, Unlink } from "lucide-react";
import { toast } from "sonner";

const BOT_USERNAME_KEY = "telegram_bot_username";

export function TelegramConnectCard() {
  const [linked, setLinked] = useState<{ chat_id: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const botUsername = (typeof window !== "undefined" && localStorage.getItem(BOT_USERNAME_KEY)) || "";

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
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Chat vinculado: <span className="font-mono">{linked.chat_id}</span>
            </p>
            <Button size="sm" variant="outline" onClick={disconnect}>
              <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
            </Button>
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
