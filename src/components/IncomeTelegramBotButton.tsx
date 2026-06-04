import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Copy, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M21.944 4.667a1.5 1.5 0 0 0-1.62-.22L3.36 11.32c-.94.39-.93 1.72.02 2.09l4.27 1.66 1.66 5.32c.21.67 1.04.88 1.55.4l2.43-2.27 4.4 3.24c.62.46 1.51.13 1.69-.62l3.1-14.39a1.5 1.5 0 0 0-.54-1.58zM9.9 15.06l-.6 4.04-1.3-4.18 9.62-7.04-7.72 7.18z" />
  </svg>
);

export function IncomeTelegramBotButton() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConnected(false); return false; }
    const { data } = await supabase
      .from("telegram_links" as any)
      .select("chat_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const isConnected = !!data;
    setConnected(isConnected);
    return isConnected;
  };

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("telegram_links_income_btn")
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_links" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Enquanto o dialog está aberto com um código pendente, força processamento
  // das mensagens do bot a cada 4s para detectar o /start o quanto antes.
  useEffect(() => {
    if (!open || !code || connected) return;
    const tick = async () => {
      // Busca mensagens novas direto do Telegram (não espera o cron de 60s)
      await supabase.functions.invoke("telegram-poll").catch(() => null);
      await supabase.functions.invoke("telegram-process").catch(() => null);
      const ok = await refresh();
      if (ok) {
        toast.success("Bot vinculado com sucesso");
        setCode(null);
        setOpen(false);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 4000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open, code, connected]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-link-code");
      if (error) throw error;
      if ((data as any)?.alreadyLinked) {
        toast.success("Bot já está vinculado");
        await refresh();
        return;
      }
      setCode((data as any).code);
    } catch (e: any) {
      toast.error("Erro ao gerar código", { description: e?.message ?? "Tente novamente" });
    } finally {
      setGenerating(false);
    }
  };

  const copyCommand = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`/start ${code}`);
      toast.success("Comando copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("telegram_links" as any).delete().eq("user_id", user.id);
    if (error) {
      toast.error("Erro ao desconectar", { description: error.message });
      return;
    }
    toast.success("Bot desconectado");
    setOpen(false);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCode(null); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 transition-colors ${connected ? "text-emerald-500 hover:text-emerald-600" : "text-muted-foreground hover:text-foreground"}`}
          title={connected ? "Bot do Telegram conectado" : "Vincular bot do Telegram"}
          aria-label={connected ? "Bot do Telegram conectado" : "Vincular bot do Telegram"}
        >
          <TelegramIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TelegramIcon className={`h-4 w-4 ${connected ? "text-emerald-500" : "text-primary"}`} />
            {connected ? "Bot do Telegram conectado" : "Vincular bot do Telegram"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {connected
              ? "Seus lançamentos do Telegram estão chegando neste app. Para usar outro bot, desconecte primeiro."
              : "Gere um código e envie ao bot para vincular sua conta."}
          </DialogDescription>
        </DialogHeader>

        {connected ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Conexão ativa</span>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={handleDisconnect}>
              <Unlink className="h-4 w-4" />
              Desconectar bot
            </Button>
          </div>
        ) : !code ? (
          <div className="space-y-3 pt-1">
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
              <li>Clique em <strong>Gerar código</strong> abaixo.</li>
              <li>Abra o bot no Telegram e envie <code className="font-mono px-1 py-0.5 rounded bg-muted">/start CÓDIGO</code>.</li>
              <li>A conexão será detectada automaticamente.</li>
            </ol>
            <Button size="sm" className="w-full gap-2" onClick={generateCode} disabled={generating}>
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Gerando…" : "Gerar código"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            <div className="rounded-md border bg-muted/40 px-3 py-3 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Envie ao bot</div>
              <div className="font-mono text-lg font-bold tracking-wider">/start {code}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={copyCommand}>
                <Copy className="h-4 w-4" />
                Copiar
              </Button>
              <Button size="sm" variant="ghost" className="flex-1 gap-2" onClick={generateCode} disabled={generating}>
                <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
                Novo
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Aguardando confirmação do Telegram…
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
