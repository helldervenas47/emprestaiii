import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, BarChart3, CalendarCheck } from "lucide-react";
import { TelegramReportsConnectCard } from "@/components/TelegramReportsConnectCard";
import { TelegramDailyPlanningScheduleCard } from "@/components/TelegramDailyPlanningScheduleCard";
import { TelegramIncomesExpensesScheduleCard } from "@/components/TelegramIncomesExpensesScheduleCard";
import { TelegramWeeklyVencimentosCard } from "@/components/TelegramWeeklyVencimentosCard";
import { ScheduledReportCard } from "@/components/ScheduledReportCard";
import { ReadOnlyOverlay } from "@/components/upgrade/ReadOnlyOverlay";


export function TelegramBotsHub() {
  return (
    <ReadOnlyOverlay message="Seu plano de teste expirou. Os bots cadastrados continuam visíveis, mas não é possível conectar ou alterar configurações sem um plano ativo.">
    <div id="telegram-bots-hub" className="space-y-4 scroll-mt-24">
      <Card no3d>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Bot de Relatórios</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure o bot e os horários de envio automático dos relatórios do negócio.
          </p>
        </CardContent>
      </Card>

      {/* Conexão do bot de relatórios */}
      <TelegramReportsConnectCard />

      {/* Planejamento do dia seguinte */}
      <TelegramDailyPlanningScheduleCard />

      {/* Receitas e Despesas (aba) */}
      <TelegramIncomesExpensesScheduleCard />

      {/* Empréstimos em atraso (até 3 horários) */}
      <ScheduledReportCard
        title="Empréstimos em atraso"
        description="Lista de contratos em atraso. Até 3 horários por dia."
        Icon={AlertTriangle}
        prefsTable="telegram_overdue_loans_prefs"
        functionName="telegram-overdue-loans-summary"
        defaultTime="09:00"
      />

      {/* Vencem hoje (até 3 horários) */}
      <ScheduledReportCard
        title="Vencem hoje"
        description="Lista dos contratos com vencimento no dia. Até 3 horários por dia."
        Icon={CalendarCheck}
        prefsTable="telegram_due_today_loans_prefs"
        functionName="telegram-due-today-loans-summary"
        defaultTime="08:00"
      />

      {/* Vencimentos da semana — sempre o último */}
      <TelegramWeeklyVencimentosCard />
    </div>
    </ReadOnlyOverlay>
  );
}
