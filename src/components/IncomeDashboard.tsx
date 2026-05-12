import { useMemo } from "react";
import { Income } from "@/hooks/useIncomes";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  incomes: Income[];
  allMonthIncomes?: Income[];
  monthKey: string;
}

export function IncomeDashboard({ incomes, allMonthIncomes, monthKey }: Props) {
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    incomes.forEach((i) => {
      const k = i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [incomes]);

  const statusData = useMemo(() => {
    let pending = 0, overdue = 0;
    incomes.forEach((i) => {
      if (i.status === "overdue") overdue += i.amount;
      else if (i.status === "pending") pending += i.amount;
    });
    return [
      { name: "Pendentes", value: pending },
      { name: "Atrasadas", value: overdue },
    ];
  }, [incomes]);

  const topSources = useMemo(() => {
    const source = allMonthIncomes ?? incomes;
    const map = new Map<string, number>();
    source.forEach((i) => {
      const k = i.source || i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [incomes, allMonthIncomes]);

  const totalToReceive = incomes.reduce((s, i) => s + i.amount, 0);
  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (incomes.length === 0) {
    return (
      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-1">Valores a receber — {monthLabel}</h3>
        <p className="text-xs text-muted-foreground">Nenhuma receita a receber neste mês.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3">A receber por categoria</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={75} label={(e: any) => e.name}>
              {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3">Status das receitas a receber</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statusData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtBRL} />
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              <Cell fill="#f59e0b" />
              <Cell fill="#ef4444" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card no3d className="p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold mb-3">Top 5 fontes</h3>
        <div className="space-y-2">
          {topSources.map((s, idx) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-5 text-xs text-muted-foreground">{idx + 1}.</span>
              <span className="flex-1 text-sm truncate">{s.name}</span>
              <span className="text-sm font-medium">{fmtBRL(s.value)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
