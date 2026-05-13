import { useMemo } from "react";
import { Income } from "@/hooks/useIncomes";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";
import { useThemePalette } from "@/hooks/useThemePalette";

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  incomes: Income[];
  allMonthIncomes?: Income[];
  monthKey: string;
}

export function IncomeDashboard({ incomes, allMonthIncomes, monthKey }: Props) {
  const palette = useThemePalette();
  const COLORS = palette.chart;
  // Considera receitas pagas + pendentes (consolidado por categoria)
  const consolidated = allMonthIncomes ?? incomes;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    consolidated.forEach((i) => {
      const k = i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [consolidated]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    consolidated.forEach((i) => {
      const k = i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [consolidated]);

  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (consolidated.length === 0) {
    return (
      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-1 text-foreground">Receitas — {monthLabel}</h3>
        <p className="text-xs text-muted-foreground">Nenhuma receita registrada neste mês.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Receitas por categoria</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={75} label={(e: any) => e.name}>
              {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(v: any) => fmtBRL(Number(v))}
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Top 5 categorias</h3>
        <div className="space-y-2">
          {topCategories.map((s, idx) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-5 text-xs text-muted-foreground">{idx + 1}.</span>
              <span className="flex-1 text-sm truncate text-foreground">{s.name}</span>
              <span className="text-sm font-semibold text-foreground">{fmtBRL(s.value)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
