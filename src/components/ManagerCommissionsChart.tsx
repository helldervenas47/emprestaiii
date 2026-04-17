import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { Client, Loan } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Briefcase } from "lucide-react";

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

  const data = useMemo(() => {
    const byManager: Record<string, { paid: number; projected: number; loanCount: number }> = {};

    // Actual commissions already generated
    commissions.forEach((c) => {
      if (!byManager[c.managerId]) byManager[c.managerId] = { paid: 0, projected: 0, loanCount: 0 };
      byManager[c.managerId].paid += c.amount;
    });

    // Projected commissions from active loans with manager
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
        return { name: client?.name || "Gerente removido", paid: v.paid, projected: v.projected, loanCount: v.loanCount, total: v.paid + v.projected };
      })
      .sort((a, b) => b.total - a.total);
  }, [commissions, clients, loans]);

  const totalPaid = data.reduce((s, d) => s + d.paid, 0);
  const totalProjected = data.reduce((s, d) => s + d.projected, 0);

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
              <p className="text-[10px] text-muted-foreground uppercase">Pago</p>
              <p className="text-sm font-bold text-success">{mask(rawFormatCurrency(totalPaid))}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Previsto</p>
              <p className="text-sm font-bold text-primary">{mask(rawFormatCurrency(totalProjected))}</p>
            </div>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhum empréstimo com gerente vinculado. Marque "Com gerente" em um contrato para ver as comissões aqui.
          </div>
        ) : (
          <div className="w-full" style={{ height: Math.max(200, data.length * 52) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => mask(rawFormatCurrency(v))}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [mask(rawFormatCurrency(v)), name === "paid" ? "Pago" : "Previsto"]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "paid" ? "Pago" : "Previsto"} />
                <Bar dataKey="paid" stackId="a" fill="hsl(var(--success))" />
                <Bar dataKey="projected" stackId="a" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Pago = comissões já geradas em pagamentos. Previsto = comissão estimada de empréstimos ativos com gerente. Valores isolados — não impactam saldo, lucro ou despesas.
        </p>
      </CardContent>
    </Card>
  );
}
