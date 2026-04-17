import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { Client } from "@/types/loan";
import { useHideValues } from "@/contexts/HideValuesContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Briefcase } from "lucide-react";

interface Props {
  clients: Client[];
}

function rawFormatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function ManagerCommissionsChart({ clients }: Props) {
  const { commissions } = useManagerCommissions(true);
  const { mask } = useHideValues();

  const data = useMemo(() => {
    const byManager: Record<string, number> = {};
    commissions.forEach((c) => {
      byManager[c.managerId] = (byManager[c.managerId] || 0) + c.amount;
    });
    return Object.entries(byManager)
      .map(([id, total]) => {
        const client = clients.find((c) => c.id === id);
        return { name: client?.name || "Gerente removido", total };
      })
      .sort((a, b) => b.total - a.total);
  }, [commissions, clients]);

  const totalAll = data.reduce((s, d) => s + d.total, 0);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Comissões por Gerente</h3>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
            <p className="text-sm font-bold text-primary">{mask(rawFormatCurrency(totalAll))}</p>
          </div>
        </div>

        {data.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nenhuma comissão registrada ainda. Empréstimos com gerente vinculado geram comissão automaticamente ao receber juros ou quitar o contrato.
          </div>
        ) : (
          <div className="w-full" style={{ height: Math.max(180, data.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => mask(rawFormatCurrency(v))}
                  className="text-xs"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  className="text-xs"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                />
                <Tooltip
                  formatter={(v: number) => [mask(rawFormatCurrency(v)), "Comissão"]}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                />
                <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                  {data.map((_, idx) => (
                    <Cell key={idx} fill="hsl(var(--primary))" fillOpacity={1 - idx * 0.08} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 italic">
          Valores isolados — não impactam saldo, lucro ou despesas.
        </p>
      </CardContent>
    </Card>
  );
}
