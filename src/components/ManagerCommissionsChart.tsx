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
        <div className="flex flex-col items-center text-center mb-4 gap-3">
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
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Pendente</p>
              <p className="text-xs sm:text-sm font-bold text-primary leading-tight">{mask(rawFormatCurrency(totalProjected))}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center">
              <p className="text-[9px] sm:text-[10px] text-muted-foreground uppercase leading-tight">Recebido</p>
              <p className="text-xs sm:text-sm font-bold text-success leading-tight">{mask(rawFormatCurrency(totalPaid))}</p>
            </div>
            <div className="rounded-md bg-muted/40 sm:bg-transparent px-2 py-1 sm:p-0 text-center">
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
              <div
                key={m.id}
                className="rounded-lg border border-border bg-card/50 hover:bg-card transition-colors p-2.5 sm:p-4 flex flex-col items-center text-center gap-2 sm:gap-3"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-md bg-accent/15 flex items-center justify-center">
                    <UserCog className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-foreground leading-tight break-words" title={m.name}>
                      {m.name}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {m.loanCount} {m.loanCount === 1 ? "contrato" : "contratos"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1.5 sm:gap-2 w-full">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Pendente</span>
                    <span className="text-xs sm:text-sm font-semibold text-primary break-all">
                      {mask(rawFormatCurrency(m.projected))}
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">Recebido</span>
                    <span className="text-xs sm:text-sm font-semibold text-success break-all">
                      {mask(rawFormatCurrency(m.paid))}
                    </span>
                  </div>
                  <div className="border-t border-border w-full my-0.5 sm:my-1" />
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] sm:text-xs font-medium text-foreground leading-tight">Total geral</span>
                    <span className="text-sm sm:text-base font-bold text-foreground break-all">
                      {mask(rawFormatCurrency(m.total))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic text-center">
          Recebido = comissões geradas dentro do período (data de recebimento). Pendente = parcelas com vencimento no período ainda não pagas.
        </p>
      </CardContent>
    </Card>
  );
}
