import { forwardRef, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Copy, CheckCircle2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useTelegramReportsLink } from "@/hooks/useTelegramReportsLink";
import { generateTelegramLinkCode, invokeUserFunction } from "@/lib/telegramLinkCode";


export const TelegramReportsConnectCard = forwardRef<HTMLDivElement, Record<string, never>>(function TelegramReportsConnectCard(_, ref) {
  const { linked, loading, disconnect, refresh } = useTelegramReportsLink();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const syncingTelegramRef = useRef(false);

  useEffect(() => {
    if (loading || linked) return;
    let stopped = false;
    const syncTelegram = async () => {
      if (stopped || syncingTelegramRef.current) return;
      syncingTelegramRef.current = true;
      try {
        await invokeUserFunction("telegram-reports-poll").catch(() => null);
        await refresh();
      } finally {
        syncingTelegramRef.current = false;
      }
    };
    syncTelegram();
    const interval = window.setInterval(syncTelegram, 12000);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [loading, linked, refresh]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const data = await generateTelegramLinkCode("telegram-reports-link-code");
      if ((data as any).alreadyLinked) {
        toast.success("Bot de Relatórios já conectado");
        return;
      }
      setCode((data as any).code);
    } catch (e: any) {
      toast.error("Erro ao gerar código", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const linkByBotCode = async () => {
    const trimmed = botCodeInput.trim();
    if (!trimmed) {
      toast.error("Digite o código recebido no Telegram");
      return;
    }
    const normalized = normalizeTelegramBotCode(trimmed);
    if (!/^[A-Z0-9]{6,12}$/.test(normalized)) {
      toast.error("Código inválido", { description: "Envie /code ao bot de relatórios e cole aqui o código retornado." });
      return;
    }
    setLinkingByCode(true);
    try {
      await invokeUserFunction("telegram-reports-poll").catch(() => null);
      const data = await invokeUserFunction("link-telegram-bot", { bot_code: normalized, kind: "reports" });
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("✅ Relatório conectado ao bot com sucesso");
      setBotCodeInput("");
      setCode(null);
      await refresh();
    } catch (e: any) {
      toast.error("❌ Erro ao vincular", { description: e.message });
    } finally {
      setLinkingByCode(false);
    }
  };

  const copyCommand = () => {
    if (!code) return;
    navigator.clipboard.writeText(`/start ${code}`);
    toast.success("Comando copiado!");
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setCode(null);
      toast.success("Bot de Relatórios desvinculado");
    } catch (e: any) {
      toast.error("Erro ao desconectar", { description: e?.message ?? "Tente novamente." });
    }
  };

  if (loading) return null;

  return (
    <Card ref={ref} no3d>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Bot de Relatórios (Telegram)</p>
              <p className="text-xs text-muted-foreground truncate">
                Independente do bot de despesas. Recebe os relatórios de cobrança.
              </p>
            </div>
          </div>
          {linked && (
            <span className="inline-flex items-center gap-1 text-xs text-success font-medium shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
            </span>
          )}
        </div>

        {linked ? (
          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Chat: <span className="font-mono">{linked.chat_id}</span>
            </p>
            <Button size="sm" variant="outline" onClick={handleDisconnect}>
              <Unlink className="h-3.5 w-3.5 mr-1" /> Desvincular
            </Button>
          </div>
        ) : code ? (
          <div className="space-y-2 pt-1">
            <p className="text-xs text-muted-foreground">
              1. Abra o bot de relatórios no Telegram<br />
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
          <div className="space-y-3 pt-1">
            <Button size="sm" onClick={generateCode} disabled={generating} className="w-full sm:w-auto">
              <Send className="h-3.5 w-3.5 mr-1" />
              {generating ? "Gerando…" : "Conectar bot de relatórios"}
            </Button>

            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <Label className="text-xs font-medium">Já tenho um código do bot</Label>
              <p className="text-[11px] text-muted-foreground">
                Envie <code className="font-mono">/code</code> em qualquer bot do Telegram e cole aqui o código recebido.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={botCodeInput}
                  onChange={(e) => setBotCodeInput(e.target.value.toUpperCase())}
                  placeholder="Ex.: ABC123"
                  maxLength={512}
                  className="h-9 text-sm font-mono uppercase tracking-wider"
                  onKeyDown={(e) => { if (e.key === "Enter") linkByBotCode(); }}
                />
                <Button size="sm" onClick={linkByBotCode} disabled={linkingByCode || !botCodeInput.trim()}>
                  {linkingByCode ? "Vinculando…" : "Vincular"}
                </Button>
              </div>
            </div>
          </div>
        )}




      </CardContent>
    </Card>
  );
});
