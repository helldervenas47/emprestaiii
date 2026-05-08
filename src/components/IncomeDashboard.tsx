import { useMemo } from "react";
import { Income } from "@/hooks/useIncomes";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function IncomeDashboard({ incomes }: { incomes: Income[] }) {
  const now = new Date();

  const monthly = useMemo(() => {
    const mk = () => {
      const m = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        m.set(k, 0);
      }
      return m;
    };
    const received = mk(), pending = mk(), overdue = mk();
    incomes.forEach((i) => {
      const k = i.receivedDate.slice(0, 7);
      const target = i.status === "received" ? received : i.status === "overdue" ? overdue : pending;
      if (target.has(k)) target.set(k, (target.get(k) || 0) + i.amount);
    });
    return Array.from(received.keys()).map((k) => ({
      month: k.slice(5) + "/" + k.slice(2, 4),
      received: received.get(k) || 0,
      pending: pending.get(k) || 0,
      overdue: overdue.get(k) || 0,
      total: (received.get(k) || 0) + (pending.get(k) || 0) + (overdue.get(k) || 0),
    }));
  }, [incomes]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    incomes.forEach((i) => {
      const k = i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [incomes]);

  const statusData = useMemo(() => {
    let received = 0, pending = 0, overdue = 0;
    incomes.forEach((i) => {
      if (i.status === "received") received += i.amount;
      else if (i.status === "overdue") overdue += i.amount;
      else pending += i.amount;
    });
    return [
      { name: "Recebidas", value: received },
      { name: "Pendentes", value: pending },
      { name: "Atrasadas", value: overdue },
    ];
  }, [incomes]);

  const topSources = useMemo(() => {
    const map = new Map<string, number>();
    incomes.filter((i) => i.status === "received").forEach((i) => {
      const k = i.source || i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [incomes]);

  const avgMonthly = monthly.reduce((s, m) => s + m.total, 0) / Math.max(1, monthly.filter(m => m.total > 0).length);
  const projection = avgMonthly * 1.05;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3">Evolução mensal (6 meses)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtBRL} />
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3">Receitas por categoria</h3>
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
        <h3 className="text-sm font-semibold mb-3">Status das receitas</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={statusData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtBRL} />
            <Tooltip formatter={(v: any) => fmtBRL(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              <Cell fill="hsl(var(--primary))" />
              <Cell fill="#f59e0b" />
              <Cell fill="#ef4444" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card no3d className="p-4">
        <h3 className="text-sm font-semibold mb-3">Top 5 fontes de receita</h3>
        <div className="space-y-2">
          {topSources.length === 0 && <p className="text-xs text-muted-foreground">Sem dados</p>}
          {topSources.map((s, idx) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="w-5 text-xs text-muted-foreground">{idx + 1}.</span>
              <span className="flex-1 text-sm truncate">{s.name}</span>
              <span className="text-sm font-medium">{fmtBRL(s.value)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Média mensal</div>
            <div className="text-sm font-semibold">{fmtBRL(avgMonthly || 0)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Projeção próximo mês</div>
            <div className="text-sm font-semibold text-primary">{fmtBRL(projection || 0)}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
