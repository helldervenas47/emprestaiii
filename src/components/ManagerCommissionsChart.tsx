import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { Client, Loan, InstallmentSchedule, Payment } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Briefcase, UserCog } from "lucide-react";

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
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Comissões por Gerente</h3>
              {rangeLabel && (
                <p className="text-[10px] text-muted-foreground">{rangeLabel}</p>
              )}
            </div>
          </div>
          <div className="flex gap-3 text-right">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Pendente</p>
              <p className="text-sm font-bold text-primary">{mask(rawFormatCurrency(totalProjected))}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Recebido</p>
              <p className="text-sm font-bold text-success">{mask(rawFormatCurrency(totalPaid))}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total</p>
              <p className="text-sm font-bold text-foreground">{mask(rawFormatCurrency(totalGeneral))}</p>
            </div>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum gerente cadastrado. Marque um cliente como "Gerente" para acompanhar as comissões aqui.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-border bg-card/50 hover:bg-card transition-colors p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-2">
                  <div className="h-8 w-8 rounded-md bg-accent/15 flex items-center justify-center shrink-0">
                    <UserCog className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate" title={m.name}>
                      {m.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {m.loanCount} {m.loanCount === 1 ? "contrato no período" : "contratos no período"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Pendente de recebimento</span>
                    <span className="text-sm font-semibold text-primary">
                      {mask(rawFormatCurrency(m.projected))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Total recebido</span>
                    <span className="text-sm font-semibold text-success">
                      {mask(rawFormatCurrency(m.paid))}
                    </span>
                  </div>
                  <div className="border-t border-border my-1" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">Total geral</span>
                    <span className="text-base font-bold text-foreground">
                      {mask(rawFormatCurrency(m.total))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Recebido = comissões geradas dentro do período (data de recebimento). Pendente = parcelas com vencimento no período ainda não pagas. Valores isolados — não impactam saldo, lucro ou despesas.
        </p>
      </CardContent>
    </Card>
  );
}
