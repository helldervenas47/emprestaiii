import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, Wallet, BarChart3, ArrowLeftRight } from "lucide-react";
import { TelegramConnectCard } from "@/components/TelegramConnectCard";
import { TelegramReportsConnectCard } from "@/components/TelegramReportsConnectCard";
import { TelegramBillingScheduleCard } from "@/components/TelegramBillingScheduleCard";
import { toast } from "@/lib/appToast";

type BotTab = "despesas" | "relatorios";

// IDs estáveis para cada relatório/bloco que pode ser movido entre bots
type ReportId =
  | "ia-pessoal"
  | "cobrancas"
  | "resumo-diario"
  | "resumo-semanal"
  | "resumo-mensal"
  | "conexao-despesas";

const DEFAULT_ASSIGNMENT: Record<ReportId, BotTab> = {
  "ia-pessoal": "relatorios",
  "cobrancas": "relatorios",
  "resumo-diario": "despesas",
  "resumo-semanal": "despesas",
  "resumo-mensal": "despesas",
  "conexao-despesas": "despesas",
};

const STORAGE_KEY = "telegram-bots-report-assignment-v1";

function loadAssignment(): Record<ReportId, BotTab> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ASSIGNMENT };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_ASSIGNMENT, ...parsed };
  } catch {
    return { ...DEFAULT_ASSIGNMENT };
  }
}

function ObjectiveBox({
  title,
  objective,
  icon,
  currentBot,
  onMove,
}: {
  title: string;
  objective: string;
  icon?: React.ReactNode;
  currentBot: BotTab;
  onMove: () => void;
}) {
  const targetLabel = currentBot === "relatorios" ? "Bot de Despesas" : "Bot de Relatórios";
  return (
    <Card no3d className="border-primary/20 bg-primary/5">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {icon && <div className="text-primary mt-0.5">{icon}</div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px] shrink-0"
                onClick={onMove}
                title={`Mover para ${targetLabel}`}
              >
                <ArrowLeftRight className="h-3 w-3 mr-1" />
                Mover
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              <span className="font-medium text-foreground/80">Objetivo:</span> {objective}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TelegramBotsHub() {
  const [bot, setBot] = useState<BotTab>("relatorios");
  const [assignment, setAssignment] = useState<Record<ReportId, BotTab>>(() => loadAssignment());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(assignment));
    } catch {
      /* noop */
    }
  }, [assignment]);

  const moveReport = (id: ReportId, title: string) => {
    setAssignment((prev) => {
      const next = { ...prev };
      const target: BotTab = prev[id] === "relatorios" ? "despesas" : "relatorios";
      next[id] = target;
      const targetLabel = target === "relatorios" ? "Bot de Relatórios" : "Bot de Despesas";
      toast.success(`"${title}" movido para ${targetLabel}`);
      return next;
    });
  };

  const isIn = (id: ReportId, tab: BotTab) => assignment[id] === tab;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card no3d>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Bots do Telegram</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure os dois bots e os envios automáticos. Use o botão <strong>Mover</strong> em cada
            relatório para alternar entre as abas dos bots.
          </p>
        </CardContent>
      </Card>

      {/* Bot tabs */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant={bot === "relatorios" ? "default" : "outline"}
          size="sm"
          onClick={() => setBot("relatorios")}
        >
          <BarChart3 className="h-4 w-4 mr-1" /> Bot de Relatórios
        </Button>
        <Button
          variant={bot === "despesas" ? "default" : "outline"}
          size="sm"
          onClick={() => setBot("despesas")}
        >
          <Wallet className="h-4 w-4 mr-1" /> Bot de Despesas
        </Button>
      </div>

      {bot === "relatorios" && (
        <div className="space-y-4">
          <Card no3d>
            <CardContent className="p-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Bot de Relatórios
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Recebe os relatórios do negócio: cobranças, inadimplência e análise de IA das suas despesas pessoais.
                Independente do bot de despesas — pode ser usado em outro chat (ex: grupo da equipe).
              </p>
            </CardContent>
          </Card>

          {isIn("ia-pessoal", "relatorios") && (
            <div className="space-y-2">
              <ObjectiveBox
                title="Conexão e Relatório Inteligente (IA Pessoal)"
                objective="Vincular o bot e configurar o envio automático da análise de IA sobre suas despesas pessoais — incluindo alertas quando uma categoria estourar ou quando a IA detectar tendência de alta nos gastos."
                icon={<MessageSquare className="h-4 w-4" />}
                currentBot="relatorios"
                onMove={() => moveReport("ia-pessoal", "Conexão e Relatório Inteligente (IA Pessoal)")}
              />
              <TelegramReportsConnectCard />
            </div>
          )}

          {isIn("cobrancas", "relatorios") && (
            <div className="space-y-2">
              <ObjectiveBox
                title="Relatório de Cobranças"
                objective="Enviar diariamente o resumo das cobranças do dia (parcelas vencidas e a vencer) para acompanhar inadimplentes e priorizar contatos. Em até 3 horários por dia."
                icon={<Send className="h-4 w-4" />}
                currentBot="relatorios"
                onMove={() => moveReport("cobrancas", "Relatório de Cobranças")}
              />
              <TelegramBillingScheduleCard />
            </div>
          )}

          {(["resumo-diario", "resumo-semanal", "resumo-mensal", "conexao-despesas"] as ReportId[])
            .filter((id) => isIn(id, "relatorios"))
            .map((id) => (
              <MovedReportPlaceholder
                key={id}
                id={id}
                currentBot="relatorios"
                onMove={(title) => moveReport(id, title)}
              />
            ))}

          <Card no3d className="border-dashed">
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground">
                💡 O <strong>Relatório de Inadimplência Acumulada</strong> e o <strong>Planejamento do Dia</strong> também
                enviam por este bot — configure os horários nas respectivas abas (Inadimplência Acumulada e Planejamento do Dia).
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {bot === "despesas" && (
        <div className="space-y-4">
          <Card no3d>
            <CardContent className="p-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Bot de Despesas
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre despesas pessoais por mensagem direto no Telegram e receba os resumos do que você gastou.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {isIn("resumo-diario", "despesas") && (
              <ObjectiveBox
                title="Resumo Diário"
                objective="Mostra o total gasto no dia e o saldo restante de cada orçamento por categoria — para você saber, ao fim do dia, se ainda pode gastar ou já estourou."
                icon={<Send className="h-4 w-4" />}
                currentBot="despesas"
                onMove={() => moveReport("resumo-diario", "Resumo Diário")}
              />
            )}
            {isIn("resumo-semanal", "despesas") && (
              <ObjectiveBox
                title="Resumo Semanal"
                objective="Total dos últimos 7 dias por dia e por categoria — útil para identificar padrões semanais (fim de semana, dias de mais consumo)."
                icon={<Send className="h-4 w-4" />}
                currentBot="despesas"
                onMove={() => moveReport("resumo-semanal", "Resumo Semanal")}
              />
            )}
            {isIn("resumo-mensal", "despesas") && (
              <ObjectiveBox
                title="Resumo Mensal"
                objective="Total do mês com comparação ao mês anterior, top categorias, média diária e situação dos orçamentos — visão fechada do mês para tomar decisões financeiras."
                icon={<Send className="h-4 w-4" />}
                currentBot="despesas"
                onMove={() => moveReport("resumo-mensal", "Resumo Mensal")}
              />
            )}
            {isIn("conexao-despesas", "despesas") && <TelegramConnectCard />}

            {(["ia-pessoal", "cobrancas"] as ReportId[])
              .filter((id) => isIn(id, "despesas"))
              .map((id) => (
                <MovedReportPlaceholder
                  key={id}
                  id={id}
                  currentBot="despesas"
                  onMove={(title) => moveReport(id, title)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const REPORT_META: Record<ReportId, { title: string; objective: string; icon: React.ReactNode }> = {
  "ia-pessoal": {
    title: "Conexão e Relatório Inteligente (IA Pessoal)",
    objective:
      "Vincular o bot e configurar o envio automático da análise de IA sobre suas despesas pessoais — incluindo alertas quando uma categoria estourar ou quando a IA detectar tendência de alta nos gastos.",
    icon: <MessageSquare className="h-4 w-4" />,
  },
  "cobrancas": {
    title: "Relatório de Cobranças",
    objective:
      "Enviar diariamente o resumo das cobranças do dia (parcelas vencidas e a vencer) para acompanhar inadimplentes e priorizar contatos. Em até 3 horários por dia.",
    icon: <Send className="h-4 w-4" />,
  },
  "resumo-diario": {
    title: "Resumo Diário",
    objective:
      "Mostra o total gasto no dia e o saldo restante de cada orçamento por categoria — para você saber, ao fim do dia, se ainda pode gastar ou já estourou.",
    icon: <Send className="h-4 w-4" />,
  },
  "resumo-semanal": {
    title: "Resumo Semanal",
    objective:
      "Total dos últimos 7 dias por dia e por categoria — útil para identificar padrões semanais (fim de semana, dias de mais consumo).",
    icon: <Send className="h-4 w-4" />,
  },
  "resumo-mensal": {
    title: "Resumo Mensal",
    objective:
      "Total do mês com comparação ao mês anterior, top categorias, média diária e situação dos orçamentos — visão fechada do mês para tomar decisões financeiras.",
    icon: <Send className="h-4 w-4" />,
  },
  "conexao-despesas": {
    title: "Conexão do Bot de Despesas",
    objective: "Vincular o bot pessoal de despesas para registro por mensagem.",
    icon: <Wallet className="h-4 w-4" />,
  },
};

function MovedReportPlaceholder({
  id,
  currentBot,
  onMove,
}: {
  id: ReportId;
  currentBot: BotTab;
  onMove: (title: string) => void;
}) {
  const meta = REPORT_META[id];
  return (
    <ObjectiveBox
      title={meta.title}
      objective={meta.objective}
      icon={meta.icon}
      currentBot={currentBot}
      onMove={() => onMove(meta.title)}
    />
  );
}
