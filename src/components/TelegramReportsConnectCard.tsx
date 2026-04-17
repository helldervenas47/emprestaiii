import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Send, Copy, CheckCircle2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTelegramReportsLink } from "@/hooks/useTelegramReportsLink";

export function TelegramReportsConnectCard() {
  const { linked, loading, disconnect } = useTelegramReportsLink();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-reports-link-code");
      if (error) throw error;
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

  const copyCommand = () => {
    if (!code) return;
    navigator.clipboard.writeText(`/start ${code}`);
    toast.success("Comando copiado!");
  };

  const handleDisconnect = async () => {
    await disconnect();
    setCode(null);
    toast.success("Bot de Relatórios desvinculado");
  };

  if (loading) return null;

  return (
    <Card no3d>
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
          <Button size="sm" onClick={generateCode} disabled={generating} className="w-full sm:w-auto">
            <Send className="h-3.5 w-3.5 mr-1" />
            {generating ? "Gerando…" : "Conectar bot de relatórios"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
