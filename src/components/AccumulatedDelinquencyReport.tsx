import { forwardRef, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Client, InstallmentSchedule } from "@/types/loan";
import { Search, Send, AlertTriangle, Users, DollarSign, Clock, Phone, Calendar, Plus, X } from "lucide-react";
import { useTelegramReportsLink } from "@/hooks/useTelegramReportsLink";
import { useTelegramAccumulatedDelinquencyPrefs } from "@/hooks/useTelegramAccumulatedDelinquencyPrefs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { todayInAppTz } from "@/lib/timezone";
import { TelegramReportsConnectCard } from "@/components/TelegramReportsConnectCard";

interface Props {
  loans: Loan[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
}

type SlotKey = "send_time_1" | "send_time_2" | "send_time_3";

interface ReportItem {
  clientKey: string;
  clientName: string;
  phone: string;
  baseAmount: number;
  lateInterest: number;
  penalty: number;
  amount: number;
  dueDate: string;
  daysOverdue: number;
}

function calcLateFeesFor(loan: Loan, baseAmount: number, daysOverdue: number) {
  if (daysOverdue <= 0) return { lateInterest: 0, penalty: 0 };
  const lateInterest = loan.lateInterestValue != null && loan.lateInterestValue > 0
    ? loan.lateInterestType === "fixed"
      ? loan.lateInterestValue * daysOverdue
      : baseAmount * (loan.lateInterestValue / 100) * daysOverdue
    : 0;
  const penalty = loan.penaltyValue != null && loan.penaltyValue > 0 ? loan.penaltyValue : 0;
  return { lateInterest, penalty };
}

function rawFormatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function normalizeName(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getDaysOverdue(dueDate: string, today: string) {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const current = new Date(`${today}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((current - due) / 86400000));
}

function getLoanFallbackAmount(loan: Loan) {
  if (loan.customInstallmentValue && loan.customInstallmentValue > 0) return loan.customInstallmentValue;
  if (loan.remainingAmount && loan.remainingAmount > 0) return loan.remainingAmount;
  const total = loan.amount + (loan.amount * loan.interestRate / 100 * Math.max(1, loan.installments));
  return total / Math.max(1, loan.installments);
}

export const AccumulatedDelinquencyReport = forwardRef<HTMLDivElement, Props>(function AccumulatedDelinquencyReport({ loans, clients, installmentSchedules }, ref) {
  const { mask } = useHideValues();
  const { linked } = useTelegramReportsLink();
  const { prefs, loading: prefsLoading, save } = useTelegramAccumulatedDelinquencyPrefs();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [sendingNow, setSendingNow] = useState(false);
  const formatCurrency = (value: number) => mask(rawFormatCurrency(value));
  const today = todayInAppTz();
  const currentMonthStart = `${today.slice(0, 7)}-01`;

  const items = useMemo<ReportItem[]>(() => {
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const schedulesByLoan = new Map<string, InstallmentSchedule[]>();

    installmentSchedules.forEach((schedule) => {
      const list = schedulesByLoan.get(schedule.loanId) ?? [];
      list.push(schedule);
      schedulesByLoan.set(schedule.loanId, list);
    });

    const rows: ReportItem[] = [];

    loans.forEach((loan) => {
      if (loan.status === "paid") return;

      const client = loan.borrowerId ? clientById.get(loan.borrowerId) : undefined;
      const clientName = client?.name || loan.borrowerName;
      if (!clientName.toLowerCase().includes(search.toLowerCase())) return;

      const clientKey = loan.borrowerId || normalizeName(clientName);
      const phone = client?.phone || "";
      const schedules = (schedulesByLoan.get(loan.id) ?? []).sort((a, b) => a.installmentNumber - b.installmentNumber);
      const unpaidSchedules = schedules.filter((schedule) => schedule.installmentNumber > loan.paidInstallments && schedule.dueDate < currentMonthStart);

      // "Restante a pagar" do contrato — limita o total exibido para refletir
      // pagamentos parciais, amortizações e quaisquer abatimentos já feitos.
      const loanRemaining = Math.max(0, Number(loan.remainingAmount ?? 0));
      let remainingForLoan = loanRemaining;

      if (unpaidSchedules.length > 0) {
        for (const schedule of unpaidSchedules) {
          if (remainingForLoan <= 0) break;
          const scheduleAmount = Number(schedule.amount || 0);
          // Cada parcela vencida só conta até o que ainda falta receber do contrato.
          const base = Math.min(scheduleAmount, remainingForLoan);
          if (base <= 0) continue;
          remainingForLoan -= base;
          const days = getDaysOverdue(schedule.dueDate, today);
          const fees = calcLateFeesFor(loan, base, days);
          rows.push({
            clientKey,
            clientName,
            phone,
            baseAmount: base,
            lateInterest: fees.lateInterest,
            penalty: fees.penalty,
            amount: base + fees.lateInterest + fees.penalty,
            dueDate: schedule.dueDate,
            daysOverdue: days,
          });
        }
        return;
      }

      if (loan.dueDate >= currentMonthStart) return;
      if (remainingForLoan <= 0) return;

      {
        const fallbackBase = getLoanFallbackAmount(loan);
        const base = Math.min(fallbackBase, remainingForLoan);
        if (base <= 0) return;
        const days = getDaysOverdue(loan.dueDate, today);
        const fees = calcLateFeesFor(loan, base, days);
        rows.push({
          clientKey,
          clientName,
          phone,
          baseAmount: base,
          lateInterest: fees.lateInterest,
          penalty: fees.penalty,
          amount: base + fees.lateInterest + fees.penalty,
          dueDate: loan.dueDate,
          daysOverdue: days,
        });
      }
    });

    return rows.sort((a, b) => b.daysOverdue - a.daysOverdue || a.clientName.localeCompare(b.clientName, "pt-BR"));
  }, [clients, currentMonthStart, installmentSchedules, loans, search, today]);

  const grouped = useMemo(() => {
    const map = new Map<string, { clientName: string; phone: string; items: ReportItem[]; totalOpen: number; maxDaysOverdue: number }>();
    items.forEach((item) => {
      const current = map.get(item.clientKey) ?? {
        clientName: item.clientName,
        phone: item.phone,
        items: [],
        totalOpen: 0,
        maxDaysOverdue: 0,
      };

      current.items.push(item);
      current.totalOpen += item.amount;
      current.maxDaysOverdue = Math.max(current.maxDaysOverdue, item.daysOverdue);
      map.set(item.clientKey, current);
    });

    return Array.from(map.values()).sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || a.clientName.localeCompare(b.clientName, "pt-BR"));
  }, [items]);

  const totals = useMemo(() => {
    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const averageDays = items.length > 0 ? Math.round(items.reduce((sum, item) => sum + item.daysOverdue, 0) / items.length) : 0;
    return {
      totalClients: grouped.length,
      totalAmount,
      averageDays,
    };
  }, [grouped, items]);

  const slots: SlotKey[] = ["send_time_1", "send_time_2", "send_time_3"];
  const activeSlots = slots.filter((slot) => !!prefs[slot]);

  const handleSendNow = async () => {
    if (!user) return;
    if (!linked) {
      toast.error("Conecte o Bot de Relatórios primeiro.");
      return;
    }

    setSendingNow(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-accumulated-delinquency-summary", {
        body: { user_id: user.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Relatório enviado para o Telegram!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar relatório");
    } finally {
      setSendingNow(false);
    }
  };

  if (prefsLoading) return null;

  return (
    <div ref={ref} className="space-y-6">
      <TelegramReportsConnectCard />

      <div className="grid gap-3 md:grid-cols-3">
        <Card no3d className="border-destructive/30">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4 text-destructive" /> Clientes inadimplentes
            </div>
            <p className="text-2xl font-bold text-foreground">{totals.totalClients}</p>
          </CardContent>
        </Card>
        <Card no3d className="border-warning/30">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-4 w-4 text-warning" /> Total em atraso
            </div>
            <p className="text-2xl font-bold text-foreground">{formatCurrency(totals.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card no3d className="border-primary/30">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4 text-primary" /> Média de atraso
            </div>
            <p className="text-2xl font-bold text-foreground">{totals.averageDays} dias</p>
          </CardContent>
        </Card>
      </div>

      <Card no3d>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold text-foreground">Inadimplência Acumulada</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Exibe apenas empréstimos vencidos antes do mês atual, sem misturar cobranças do mês vigente.
              </p>
            </div>
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" className="pl-9" />
            </div>
          </div>

          <div className="border-t border-border/40 pt-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Enviar automaticamente no Telegram</p>
                <p className="text-xs text-muted-foreground">Até 3 horários por dia, no fuso horário configurado no sistema.</p>
              </div>
              <Switch checked={prefs.enabled} onCheckedChange={(value) => save({ enabled: value })} />
            </div>

            {prefs.enabled && (
              <div className="space-y-3">
                {activeSlots.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum horário configurado.</p>
                )}

                {activeSlots.map((slot, index) => (
                  <div key={slot} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Horário {index + 1}</Label>
                      <Input type="time" value={prefs[slot] ?? ""} onChange={(e) => save({ [slot]: e.target.value || null } as any)} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => save({ [slot]: null } as any)} title="Remover horário">
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  {activeSlots.length < 3 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => save({ [slots.find((slot) => !prefs[slot])!]: "08:00" } as any)}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar horário
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={handleSendNow} disabled={sendingNow || !linked}>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {sendingNow ? "Enviando..." : "Enviar agora"}
                  </Button>
                </div>

                {!linked && (
                  <p className="text-xs text-muted-foreground">Conecte o Bot de Relatórios para habilitar os envios.</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {grouped.length === 0 ? (
          <Card no3d>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Nenhum empréstimo vencido de meses anteriores.
            </CardContent>
          </Card>
        ) : (
          grouped.map((group) => (
            <Card no3d key={`${group.clientName}-${group.phone}`} className="border-border/60">
              <CardContent className="p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-foreground">{group.clientName}</h4>
                      <Badge variant="destructive" className="text-xs">{group.items.length} parcela(s)</Badge>
                    </div>
                    {group.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> {group.phone}
                      </p>
                    )}
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-semibold text-foreground">{formatCurrency(group.totalOpen)}</p>
                    <p className="text-xs text-muted-foreground">Pior atraso: {group.maxDaysOverdue} dias</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {group.items.map((item, index) => {
                    const fees = item.lateInterest + item.penalty;
                    return (
                      <div key={`${item.dueDate}-${index}`} className="grid gap-2 rounded-md border border-border/50 bg-muted/20 p-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">Parcela em aberto</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" /> Vencimento: {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString("pt-BR")}
                          </p>
                          {fees > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Base: {formatCurrency(item.baseAmount)}
                              {item.lateInterest > 0 && <> • Juros: {formatCurrency(item.lateInterest)}</>}
                              {item.penalty > 0 && <> • Multa: {formatCurrency(item.penalty)}</>}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground md:text-right">{formatCurrency(item.amount)}</p>
                        <p className="text-xs text-destructive md:text-right">{item.daysOverdue} dias em atraso</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
});