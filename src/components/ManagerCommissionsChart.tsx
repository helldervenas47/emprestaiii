import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { Client, Loan } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Briefcase, UserCog } from "lucide-react";

interface Props {
  clients: Client[];
  loans?: Loan[];
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function ManagerCommissionsChart({ clients, loans = [] }: Props) {
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

    commissions.forEach((c) => {
      if (!byManager[c.managerId]) byManager[c.managerId] = { paid: 0, projected: 0, loanCount: 0 };
      byManager[c.managerId].paid += c.amount;
    });

    loans
      .filter((l) => l.hasManager && l.managerId && l.status !== "paid")
      .forEach((l) => {
        const id = l.managerId!;
        if (!byManager[id]) byManager[id] = { paid: 0, projected: 0, loanCount: 0 };
        const rate = l.managerCommissionRate ?? 10;
        byManager[id].projected += (l.amount * rate) / 100;
        byManager[id].loanCount += 1;
      });

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
  }, [commissions, clients, loans, managers]);

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
            <h3 className="text-sm font-semibold text-foreground">Comissões por Gerente</h3>
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
                      {m.loanCount} {m.loanCount === 1 ? "contrato ativo" : "contratos ativos"}
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
          Pendente = comissão estimada de empréstimos ativos com gerente. Recebido = comissões já geradas em pagamentos. Valores isolados — não impactam saldo, lucro ou despesas.
        </p>
      </CardContent>
    </Card>
  );
}
