import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Copy, CheckCircle2, Unlink, Sparkles, Clock, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTelegramReportsLink } from "@/hooks/useTelegramReportsLink";
import { usePersonalInsightsTelegramPrefs, type InsightTone } from "@/hooks/usePersonalInsightsTelegramPrefs";

const TONE_OPTIONS: { value: InsightTone; label: string; hint: string }[] = [
  { value: "balanced", label: "⚖️ Equilibrado", hint: "Profissional e acolhedor" },
  { value: "strict", label: "🎯 Rigoroso", hint: "Direto, sem rodeios" },
  { value: "motivational", label: "🚀 Motivacional", hint: "Encorajador e positivo" },
  { value: "technical", label: "📊 Técnico", hint: "Analítico, numérico" },
  { value: "friendly", label: "😊 Amigável", hint: "Informal, como um amigo" },
];

export function TelegramReportsConnectCard() {
  const { linked, loading, disconnect } = useTelegramReportsLink();
  const { prefs, loading: prefsLoading, save } = usePersonalInsightsTelegramPrefs();
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

        {/* AI Insights schedule — only when bot linked */}
        {linked && !prefsLoading && (
          <div className="border-t pt-3 mt-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Relatório Inteligente (Despesas Pessoais)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Receba a análise de IA nos horários definidos.
                  </p>
                </div>
              </div>
              <Switch
                checked={prefs.enabled}
                onCheckedChange={(v) => save({ enabled: v })}
              />
            </div>

            {prefs.enabled && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((slot) => {
                    const key = `send_time_${slot}` as "send_time_1" | "send_time_2" | "send_time_3";
                    return (
                      <div key={slot} className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Horário {slot}
                        </Label>
                        <Input
                          type="time"
                          value={prefs[key] || ""}
                          onChange={(e) => save({ [key]: e.target.value || null } as any)}
                          className="h-8 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground">Enviar quando uma categoria estourar</span>
                    <Switch
                      checked={prefs.alert_on_exceed}
                      onCheckedChange={(v) => save({ alert_on_exceed: v })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-foreground">Enviar quando IA detectar tendência de alta</span>
                    <Switch
                      checked={prefs.alert_on_trend}
                      onCheckedChange={(v) => save({ alert_on_trend: v })}
                    />
                  </label>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Horários no fuso de Brasília. Deixe em branco para desativar um slot.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
