import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, Wallet, BarChart3 } from "lucide-react";
import { TelegramConnectCard } from "@/components/TelegramConnectCard";
import { TelegramReportsConnectCard } from "@/components/TelegramReportsConnectCard";
import { TelegramBillingScheduleCard } from "@/components/TelegramBillingScheduleCard";

type BotTab = "despesas" | "relatorios";

function ObjectiveBox({ title, objective, icon }: { title: string; objective: string; icon?: React.ReactNode }) {
  return (
    <Card no3d className="border-primary/20 bg-primary/5">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {icon && <div className="text-primary mt-0.5">{icon}</div>}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
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
            Configure os dois bots e os envios automáticos. Cada bot tem uma finalidade diferente —
            escolha a aba abaixo para gerenciar.
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

          {/* Connection + AI insights schedule (já contém envios da IA pessoal) */}
          <div className="space-y-2">
            <ObjectiveBox
              title="Conexão e Relatório Inteligente (IA Pessoal)"
              objective="Vincular o bot e configurar o envio automático da análise de IA sobre suas despesas pessoais — incluindo alertas quando uma categoria estourar ou quando a IA detectar tendência de alta nos gastos."
              icon={<MessageSquare className="h-4 w-4" />}
            />
            <TelegramReportsConnectCard />
          </div>

          {/* Billing schedule */}
          <div className="space-y-2">
            <ObjectiveBox
              title="Relatório de Cobranças"
              objective="Enviar diariamente o resumo das cobranças do dia (parcelas vencidas e a vencer) para acompanhar inadimplentes e priorizar contatos. Em até 3 horários por dia."
              icon={<Send className="h-4 w-4" />}
            />
            <TelegramBillingScheduleCard />
          </div>

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
            <ObjectiveBox
              title="Resumo Diário"
              objective="Mostra o total gasto no dia e o saldo restante de cada orçamento por categoria — para você saber, ao fim do dia, se ainda pode gastar ou já estourou."
              icon={<Send className="h-4 w-4" />}
            />
            <ObjectiveBox
              title="Resumo Semanal"
              objective="Total dos últimos 7 dias por dia e por categoria — útil para identificar padrões semanais (fim de semana, dias de mais consumo)."
              icon={<Send className="h-4 w-4" />}
            />
            <ObjectiveBox
              title="Resumo Mensal"
              objective="Total do mês com comparação ao mês anterior, top categorias, média diária e situação dos orçamentos — visão fechada do mês para tomar decisões financeiras."
              icon={<Send className="h-4 w-4" />}
            />
            <TelegramConnectCard />
          </div>
        </div>
      )}
    </div>
  );
}
