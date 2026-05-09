import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, Unlink } from "lucide-react";
import { toast } from "sonner";

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M21.944 4.667a1.5 1.5 0 0 0-1.62-.22L3.36 11.32c-.94.39-.93 1.72.02 2.09l4.27 1.66 1.66 5.32c.21.67 1.04.88 1.55.4l2.43-2.27 4.4 3.24c.62.46 1.51.13 1.69-.62l3.1-14.39a1.5 1.5 0 0 0-.54-1.58zM9.9 15.06l-.6 4.04-1.3-4.18 9.62-7.04-7.72 7.18z" />
  </svg>
);

export function IncomeTelegramBotButton() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [linking, setLinking] = useState(false);
  const [connected, setConnected] = useState(false);

  const refresh = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setConnected(false); return; }
    const { data } = await supabase
      .from("telegram_links" as any)
      .select("chat_id")
      .eq("user_id", user.id)
      .maybeSingle();
    setConnected(!!data);
  };

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("telegram_links_income_btn")
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_links" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleLink = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("Informe o código recebido no Telegram");
      return;
    }
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("link-telegram-bot", {
        body: { bot_code: trimmed },
      });
      if (error) {
        let msg = (error as any)?.message || "Não foi possível vincular";
        try {
          const ctx = (error as any)?.context;
          if (ctx?.body) {
            const parsed = typeof ctx.body === "string" ? JSON.parse(ctx.body) : ctx.body;
            if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Bot vinculado com sucesso");
      setCode("");
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error("Código inválido", { description: e.message });
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <TelegramIcon className="h-4 w-4 text-primary" />
            Vincular bot do Telegram
          </DialogTitle>
          <DialogDescription className="text-xs">
            Use bots diferentes para registrar lançamentos em contas distintas.
          </DialogDescription>
        </DialogHeader>

        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
          <li>Abra o bot desejado no Telegram.</li>
          <li>Envie o comando <code className="font-mono px-1 py-0.5 rounded bg-muted">/code</code>.</li>
          <li>Cole abaixo o código recebido.</li>
        </ol>

        <div className="flex gap-2 pt-1">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código de conexão"
            className="font-mono"
            onKeyDown={(e) => { if (e.key === "Enter") handleLink(); }}
            autoFocus
          />
          <Button size="sm" onClick={handleLink} disabled={linking || !code.trim()}>
            {linking ? "Vinculando…" : "Vincular"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
