import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Copy, Link2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { generateTelegramLinkCode, invokeUserFunction } from "@/lib/telegramLinkCode";

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M21.944 4.667a1.5 1.5 0 0 0-1.62-.22L3.36 11.32c-.94.39-.93 1.72.02 2.09l4.27 1.66 1.66 5.32c.21.67 1.04.88 1.55.4l2.43-2.27 4.4 3.24c.62.46 1.51.13 1.69-.62l3.1-14.39a1.5 1.5 0 0 0-.54-1.58zM9.9 15.06l-.6 4.04-1.3-4.18 9.62-7.04-7.72 7.18z" />
  </svg>
);

export function IncomeTelegramBotButton() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [botCodeInput, setBotCodeInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [linkingByCode, setLinkingByCode] = useState(false);
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

  // Enquanto o dialog está aberto com um código pendente, processa as mensagens
  // já recebidas pelo webhook/cron de polling. NÃO chamamos `telegram-poll` aqui:
  // o cron já roda a cada minuto e duas chamadas concorrentes de getUpdates no
  // mesmo bot causam erro 409 no Telegram, impedindo a detecção do /start.
  useEffect(() => {
    if (!open || !code || connected) return;
    const tick = async () => {
      await supabase.functions.invoke("telegram-process").catch(() => null);
      const ok = await refresh();
      if (ok) {
        toast.success("Bot vinculado com sucesso");
        setCode(null);
        setOpen(false);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 5000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [open, code, connected]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const data = await generateTelegramLinkCode();
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

  const linkByBotCode = async () => {
    const normalized = botCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!normalized) {
      toast.error("Digite o código recebido no Telegram");
      return;
    }
    if (!/^[A-Z0-9]{6,12}$/.test(normalized)) {
      toast.error("Código inválido", { description: "Envie /code ao bot e cole aqui o código retornado." });
      return;
    }
    setLinkingByCode(true);
    try {
      await supabase.functions.invoke("telegram-process").catch(() => null);
      const data = await invokeUserFunction("link-telegram-bot", { bot_code: normalized, kind: "expenses" });
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Bot vinculado com sucesso");
      setBotCodeInput("");
      setCode(null);
      setOpen(false);
      await refresh();
    } catch (e: any) {
      toast.error("Erro ao vincular", { description: e?.message ?? "Gere um novo código com /code e tente novamente." });
    } finally {
      setLinkingByCode(false);
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
              : "Envie /code ao bot e cole aqui o código recebido para vincular sua conta."}
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
              <li>Abra o bot de despesas no Telegram.</li>
              <li>Envie <code className="font-mono px-1 py-0.5 rounded bg-muted">/code</code>.</li>
              <li>Cole abaixo o código recebido.</li>
            </ol>
            <div className="flex gap-2">
              <Input
                value={botCodeInput}
                onChange={(e) => setBotCodeInput(e.target.value.toUpperCase())}
                placeholder="Código recebido do bot"
                className="h-9 font-mono text-sm uppercase"
                maxLength={12}
              />
              <Button size="sm" className="h-9 gap-2" onClick={linkByBotCode} disabled={linkingByCode}>
                <Link2 className="h-4 w-4" />
                {linkingByCode ? "…" : "Conectar"}
              </Button>
            </div>
            <Button size="sm" variant="ghost" className="w-full gap-2" onClick={generateCode} disabled={generating}>
              <RefreshCw className={`h-4 w-4 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Gerando…" : "Alternativa: gerar código para /start"}
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
