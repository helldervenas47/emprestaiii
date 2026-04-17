import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { Client, Loan, InstallmentSchedule, Payment, ManagerCommission } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Briefcase, UserCog, CalendarDays, CheckCircle2, Clock } from "lucide-react";

interface Props {
  clients: Client[];
  loans?: Loan[];
  installmentSchedules?: InstallmentSchedule[];
  payments?: Payment[];
  range?: { start: Date; end: Date };
  rangeLabel?: string;
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function inRange(dateStr: string, start: Date, end: Date) {
  const d = new Date(dateStr + "T00:00:00");
  return d >= start && d <= end;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr.length > 10 ? dateStr : dateStr + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return dateStr;
  }
}

export function ManagerCommissionsChart({
  clients,
  loans = [],
  installmentSchedules = [],
  payments = [],
  range,
  rangeLabel,
}: Props) {
  const { commissions } = useManagerCommissions(true);
  const { mask } = useHideValues();
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);

  const managers = useMemo(
    () => clients.filter((c) => c.isManager).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

  const data = useMemo(() => {
    const byManager: Record<string, { paid: number; projected: number; loanCount: number }> = {};

    managers.forEach((m) => {
      byManager[m.id] = { paid: 0, projected: 0, loanCount: 0 };
    });

    // PAGO: comissões geradas, filtradas pela data de geração (data de recebimento)
    commissions.forEach((c) => {
      if (range && !inRange(c.generatedAt, range.start, range.end)) return;
      if (!byManager[c.managerId]) byManager[c.managerId] = { paid: 0, projected: 0, loanCount: 0 };
      byManager[c.managerId].paid += c.amount;
    });

    // PENDENTE: para cada parcela de empréstimo gerenciado com vencimento no período
    // e que ainda não foi paga, alocamos a comissão proporcional (total / nº parcelas).
    const managedLoans = loans.filter((l) => l.hasManager && l.managerId && l.status !== "paid");

    if (range) {
      managedLoans.forEach((l) => {
        const id = l.managerId!;
        if (!byManager[id]) byManager[id] = { paid: 0, projected: 0, loanCount: 0 };
        const rate = l.managerCommissionRate ?? 10;
        const totalCommission = (l.amount * rate) / 100;
        const perInstallment = totalCommission / Math.max(1, l.installments);

        const schedules = installmentSchedules.filter((s) => s.loanId === l.id);
        // determine which installmentNumbers were paid (installmentNumber > 0 only)
        const paidNums = new Set(
          payments.filter((p) => p.loanId === l.id && p.installmentNumber > 0).map((p) => p.installmentNumber)
        );

        let countedThisLoan = false;
        schedules.forEach((s) => {
          if (paidNums.has(s.installmentNumber)) return;
          if (!inRange(s.dueDate, range.start, range.end)) return;
          byManager[id].projected += perInstallment;
          countedThisLoan = true;
        });

        if (countedThisLoan) byManager[id].loanCount += 1;
      });
    } else {
      // Sem período: total previsto do empréstimo inteiro
      managedLoans.forEach((l) => {
        const id = l.managerId!;
        if (!byManager[id]) byManager[id] = { paid: 0, projected: 0, loanCount: 0 };
        const rate = l.managerCommissionRate ?? 10;
        byManager[id].projected += (l.amount * rate) / 100;
        byManager[id].loanCount += 1;
      });
    }

    return Object.entries(byManager)
      .map(([id, v]) => {
        const client = clients.find((c) => c.id === id);
        return {
          id,
          name: client?.name ?? "",
          paid: v.paid,
          projected: v.projected,
          loanCount: v.loanCount,
          total: v.paid + v.projected,
        };
      })
      .filter((m) => m.name.trim().length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  }, [commissions, clients, loans, managers, range, installmentSchedules, payments]);

  const totalPaid = data.reduce((s, d) => s + d.paid, 0);
  const totalProjected = data.reduce((s, d) => s + d.projected, 0);
  const totalGeneral = totalPaid + totalProjected;

  return (
    <Card>
      <CardContent className="p-3 sm:p-6">
        <div className="flex flex-col items-center text-center gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between sm:text-left sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Comissões por Gerente</h3>
              {rangeLabel && (
                <p className="text-[10px] text-muted-foreground">{rangeLabel}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:flex sm:gap-6">
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Pendente</p>
              <p className="text-xs sm:text-sm font-bold text-primary leading-tight">{mask(rawFormatCurrency(totalProjected))}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Recebido</p>
              <p className="text-xs sm:text-sm font-bold text-success leading-tight">{mask(rawFormatCurrency(totalPaid))}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center sm:text-right">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Total</p>
              <p className="text-xs sm:text-sm font-bold text-foreground leading-tight">{mask(rawFormatCurrency(totalGeneral))}</p>
            </div>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum gerente cadastrado. Marque um cliente como "Gerente" para acompanhar as comissões aqui.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3">
            {data.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedManagerId(m.id)}
                className="rounded-lg border border-border bg-card/50 hover:bg-card hover:border-primary/40 hover:shadow-sm transition-all p-2.5 sm:p-4 flex flex-col items-center text-center gap-2 sm:gap-3 sm:items-stretch sm:text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
                    <UserCog className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-foreground leading-tight break-words sm:truncate" title={m.name}>
                      {m.name}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {m.loanCount} {m.loanCount === 1 ? "contrato" : "contratos"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full sm:items-stretch">
                  <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Pendente</span>
                    <span className="text-xs sm:text-sm font-semibold text-primary break-all sm:break-normal">
                      {mask(rawFormatCurrency(m.projected))}
                    </span>
                  </div>
                  <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Recebido</span>
                    <span className="text-xs sm:text-sm font-semibold text-success break-all sm:break-normal">
                      {mask(rawFormatCurrency(m.paid))}
                    </span>
                  </div>
                  <div className="border-t border-border w-full my-0.5 sm:my-1" />
                  <div className="flex flex-col items-center sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">Total geral</span>
                    <span className="text-sm sm:text-base font-bold text-foreground break-all sm:break-normal">
                      {mask(rawFormatCurrency(m.total))}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
          Recebido = comissões geradas dentro do período (data de recebimento). Pendente = parcelas com vencimento no período ainda não pagas. Toque em um gerente para ver os detalhes.
        </p>
      </CardContent>

      <ManagerDetailDialog
        open={!!selectedManagerId}
        onClose={() => setSelectedManagerId(null)}
        manager={managers.find((c) => c.id === selectedManagerId) ?? null}
        loans={loans}
        installmentSchedules={installmentSchedules}
        payments={payments}
        commissions={commissions}
        range={range}
        rangeLabel={rangeLabel}
        mask={mask}
      />
    </Card>
  );
}

interface DetailDialogProps {
  open: boolean;
  onClose: () => void;
  manager: Client | null;
  loans: Loan[];
  installmentSchedules: InstallmentSchedule[];
  payments: Payment[];
  commissions: ManagerCommission[];
  range?: { start: Date; end: Date };
  rangeLabel?: string;
  mask: (s: string) => string;
}

function ManagerDetailDialog({
  open,
  onClose,
  manager,
  loans,
  installmentSchedules,
  payments,
  commissions,
  range,
  rangeLabel,
  mask,
}: DetailDialogProps) {
  const detail = useMemo(() => {
    if (!manager) return null;

    const managerLoans = loans.filter((l) => l.hasManager && l.managerId === manager.id);

    const loansBreakdown = managerLoans.map((l) => {
      const rate = l.managerCommissionRate ?? 10;
      const totalCommission = (l.amount * rate) / 100;
      const perInstallment = totalCommission / Math.max(1, l.installments);

      const schedules = installmentSchedules
        .filter((s) => s.loanId === l.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const paidNumsMap = new Map<number, Payment>();
      loanPayments
        .filter((p) => p.installmentNumber > 0)
        .forEach((p) => paidNumsMap.set(p.installmentNumber, p));

      const installments = schedules.map((s) => {
        const paidPayment = paidNumsMap.get(s.installmentNumber);
        const isPaid = !!paidPayment;
        const inPeriod = range
          ? (isPaid
              ? inRange(paidPayment!.date, range.start, range.end)
              : inRange(s.dueDate, range.start, range.end))
          : true;
        return {
          number: s.installmentNumber,
          dueDate: s.dueDate,
          paidDate: paidPayment?.date,
          commission: perInstallment,
          isPaid,
          inPeriod,
        };
      });

      const paidInPeriod = installments.filter((i) => i.isPaid && i.inPeriod);
      const pendingInPeriod = installments.filter((i) => !i.isPaid && i.inPeriod);

      const paidAmount = paidInPeriod.reduce((s, i) => s + i.commission, 0);
      const pendingAmount = pendingInPeriod.reduce((s, i) => s + i.commission, 0);

      return {
        loan: l,
        rate,
        totalCommission,
        perInstallment,
        installments,
        paidAmount,
        pendingAmount,
        relevant: paidInPeriod.length > 0 || pendingInPeriod.length > 0,
      };
    });

    const visible = loansBreakdown.filter((b) => b.relevant);
    const totalPaid = visible.reduce((s, b) => s + b.paidAmount, 0);
    const totalPending = visible.reduce((s, b) => s + b.pendingAmount, 0);

    // also include actual commissions records for transparency
    const realizedCommissions = commissions
      .filter((c) => c.managerId === manager.id)
      .filter((c) => !range || inRange(c.generatedAt, range.start, range.end))
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

    return { visible, totalPaid, totalPending, realizedCommissions };
  }, [manager, loans, installmentSchedules, payments, commissions, range]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-accent-foreground" />
            {manager?.name ?? "Gerente"}
          </DialogTitle>
          <DialogDescription>
            Detalhamento das comissões{rangeLabel ? ` — ${rangeLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        {detail && (
          <ScrollArea className="flex-1 pr-3 -mr-3">
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Pendente</p>
                  <p className="text-sm font-bold text-primary">{mask(rawFormatCurrency(detail.totalPending))}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Recebido</p>
                  <p className="text-sm font-bold text-success">{mask(rawFormatCurrency(detail.totalPaid))}</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="text-sm font-bold text-foreground">{mask(rawFormatCurrency(detail.totalPaid + detail.totalPending))}</p>
                </div>
              </div>

              {detail.visible.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum empréstimo com movimentação de comissão neste período.
                </p>
              ) : (
                <div className="space-y-3">
                  {detail.visible.map(({ loan, rate, totalCommission, perInstallment, installments, paidAmount, pendingAmount }) => (
                    <div key={loan.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{loan.borrowerName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Empréstimo: {mask(rawFormatCurrency(loan.amount))} · {loan.installments}x · Comissão: {rate}%
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Total da comissão: {mask(rawFormatCurrency(totalCommission))} · Por parcela: {mask(rawFormatCurrency(perInstallment))}
                          </p>
                        </div>
                        <div className="text-right text-[11px] space-y-0.5">
                          <div className="text-success font-semibold">+ {mask(rawFormatCurrency(paidAmount))} recebido</div>
                          <div className="text-primary font-semibold">+ {mask(rawFormatCurrency(pendingAmount))} pendente</div>
                        </div>
                      </div>

                      <div className="border-t border-border pt-2">
                        <p className="text-[10px] uppercase text-muted-foreground mb-1">Parcelas no período</p>
                        <div className="space-y-1">
                          {installments.filter((i) => i.inPeriod).map((i) => (
                            <div key={i.number} className="flex items-center justify-between text-xs gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {i.isPaid ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                ) : (
                                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                                <span className="font-medium">#{i.number}</span>
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <CalendarDays className="h-3 w-3" />
                                  {i.isPaid ? `Pago em ${formatDate(i.paidDate)}` : `Vence em ${formatDate(i.dueDate)}`}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={i.isPaid ? "border-success/40 text-success" : "border-primary/40 text-primary"}
                              >
                                {mask(rawFormatCurrency(i.commission))}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {detail.realizedCommissions.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold text-foreground mb-2">Comissões registradas no período</p>
                  <div className="space-y-1">
                    {detail.realizedCommissions.map((c) => {
                      const loan = loans.find((l) => l.id === c.loanId);
                      return (
                        <div key={c.id} className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                            <span className="text-muted-foreground truncate">
                              {loan?.borrowerName ?? "Empréstimo"} · {formatDate(c.generatedAt)}
                            </span>
                          </div>
                          <span className="font-semibold text-success">{mask(rawFormatCurrency(c.amount))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
