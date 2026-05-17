import { useMemo, useState } from "react";
import { Income } from "@/hooks/useIncomes";
import { Sale } from "@/types/loan";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";
import { CategoryDetailsSheet, CategoryEntry } from "@/components/CategoryDetailsSheet";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  incomes: Income[];
  allMonthIncomes?: Income[];
  monthKey: string;
  sales?: Sale[];
}

/**
 * Sums the amount actually received from a sale that falls inside `monthKey` (YYYY-MM).
 * Considers downPayment (anchored to sale.date) + every entry in paymentHistory by its date.
 * Excludes pending portions — pending = saldo previsto, not realizado.
 */
function salePaidInMonth(sale: Sale, monthKey: string): number {
  let total = 0;
  if ((sale.downPayment || 0) > 0 && sale.date?.startsWith(monthKey)) {
    total += Number(sale.downPayment) || 0;
  }
  (sale.paymentHistory || []).forEach((p) => {
    if (p?.date?.startsWith(monthKey)) total += Number(p.amount) || 0;
  });
  return total;
}

export function IncomeDashboard({ incomes, allMonthIncomes, monthKey, sales = [] }: Props) {
  // Considera receitas PAGAS + pendentes (consolidado por categoria)
  const consolidated = allMonthIncomes ?? incomes;
  const { methods } = usePaymentMethods();
  const methodName = (id?: string | null) => methods.find((m) => m.id === id)?.name || "";
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Sales contribution per category — only the value effectively received in the period.
  const salesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach((s) => {
      const paid = salePaidInMonth(s, monthKey);
      if (paid <= 0) return;
      const k = (s.category && s.category.trim()) || "Vendas";
      map.set(k, (map.get(k) || 0) + paid);
    });
    return map;
  }, [sales, monthKey]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    consolidated.forEach((i) => {
      const k = i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    salesByCategory.forEach((v, k) => map.set(k, (map.get(k) || 0) + v));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [consolidated, salesByCategory]);

  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    consolidated.forEach((i) => {
      const k = i.category || "Outros";
      map.set(k, (map.get(k) || 0) + i.amount);
    });
    salesByCategory.forEach((v, k) => map.set(k, (map.get(k) || 0) + v));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [consolidated, salesByCategory]);

  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  if (consolidated.length === 0 && salesByCategory.size === 0) {
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
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total a receber</span>
          <span className="text-sm font-semibold text-amber-500">
            {fmtBRL(
              consolidated.reduce((s, i) => s + (Number(i.amount) || 0), 0) +
                Array.from(salesByCategory.values()).reduce((s, v) => s + v, 0),
            )}
          </span>
        </div>
      </Card>

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
    </div>
  );
}
