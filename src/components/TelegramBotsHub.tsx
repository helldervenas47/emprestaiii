import { Card, CardContent } from "@/components/ui/card";
import { Send, BarChart3, AlertTriangle, CalendarCheck } from "lucide-react";
import { TelegramReportsConnectCard } from "@/components/TelegramReportsConnectCard";
import { TelegramBillingScheduleCard } from "@/components/TelegramBillingScheduleCard";
import { TelegramAccumulatedDelinquencyScheduleCard } from "@/components/TelegramAccumulatedDelinquencyScheduleCard";
import { TelegramDailyPlanningScheduleCard } from "@/components/TelegramDailyPlanningScheduleCard";
import { TelegramIncomesExpensesScheduleCard } from "@/components/TelegramIncomesExpensesScheduleCard";
import { TelegramManagerWeeklyCard } from "@/components/TelegramManagerWeeklyCard";
import { TelegramWeeklyVencimentosCard } from "@/components/TelegramWeeklyVencimentosCard";
import { ScheduledReportCard } from "@/components/ScheduledReportCard";


export function TelegramBotsHub() {
  return (
    <div className="space-y-4">
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

      {/* 1. Relatório diário (cobranças do dia) */}
      <TelegramBillingScheduleCard />

      {/* 2. Inadimplência acumulada */}
      <TelegramAccumulatedDelinquencyScheduleCard />

      {/* 3. Planejamento do dia seguinte */}
      <TelegramDailyPlanningScheduleCard />

      {/* 4. Receitas e Despesas (aba) */}
      <TelegramIncomesExpensesScheduleCard />

      {/* 5. Vencimentos da semana (segundas-feiras) */}
      <TelegramWeeklyVencimentosCard />

      {/* 6. Empréstimos em atraso (até 3 horários) */}
      <ScheduledReportCard
        title="Empréstimos em atraso"
        description="Lista de contratos em atraso. Até 3 horários por dia."
        Icon={AlertTriangle}
        prefsTable="telegram_overdue_loans_prefs"
        functionName="telegram-overdue-loans-summary"
        defaultTime="09:00"
      />

      {/* 7. Vencem hoje (até 3 horários) */}
      <ScheduledReportCard
        title="Vencem hoje"
        description="Lista dos contratos com vencimento no dia. Até 3 horários por dia."
        Icon={CalendarCheck}
        prefsTable="telegram_due_today_loans_prefs"
        functionName="telegram-due-today-loans-summary"
        defaultTime="08:00"
      />

      {/* 8. Resumo por gerente */}
      <Card no3d>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Resumo por gerente</h3>
          </div>
          <TelegramManagerWeeklyCard />
        </CardContent>
      </Card>
    </div>
  );
}
