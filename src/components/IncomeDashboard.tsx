import { useMemo, useState } from "react";
import { Income } from "@/hooks/useIncomes";
import { Sale } from "@/types/loan";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { CategoryDetailsSheet, CategoryEntry } from "@/components/CategoryDetailsSheet";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { displayIncomeCategory, incomeCategoryKey } from "@/lib/incomeCategory";

const COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"];

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  incomes: Income[];
  allMonthIncomes?: Income[];
  monthKey: string;
  sales?: Sale[];
  onMonthChange?: (monthKey: string) => void;
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

export function IncomeDashboard({ incomes, allMonthIncomes, monthKey, sales = [], onMonthChange }: Props) {
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
    const map = new Map<string, { name: string; value: number }>();
    consolidated.forEach((i) => {
      const key = incomeCategoryKey(i.category);
      const current = map.get(key) ?? { name: displayIncomeCategory(i.category), value: 0 };
      map.set(key, { ...current, value: current.value + i.amount });
    });
    salesByCategory.forEach((v, k) => {
      const key = incomeCategoryKey(k);
      const current = map.get(key) ?? { name: displayIncomeCategory(k), value: 0 };
      map.set(key, { ...current, value: current.value + v });
    });
    return Array.from(map.values());
  }, [consolidated, salesByCategory]);

  const topCategories = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    consolidated.forEach((i) => {
      const key = incomeCategoryKey(i.category);
      const current = map.get(key) ?? { name: displayIncomeCategory(i.category), value: 0 };
      map.set(key, { ...current, value: current.value + i.amount });
    });
    salesByCategory.forEach((v, k) => {
      const key = incomeCategoryKey(k);
      const current = map.get(key) ?? { name: displayIncomeCategory(k), value: 0 };
      map.set(key, { ...current, value: current.value + v });
    });
    return Array.from(map.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map(({ name, value }) => ({ name, value }));
  }, [consolidated, salesByCategory]);

  const [y, m] = monthKey.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const selectedEntries: CategoryEntry[] = useMemo(() => {
    if (!selectedCategory) return [];
    const list: CategoryEntry[] = [];
    const selectedKey = incomeCategoryKey(selectedCategory);
    consolidated.forEach((i) => {
      if (incomeCategoryKey(i.category) !== selectedKey) return;
      list.push({
        id: `inc-${i.id}`,
        description: i.description,
        amount: Number(i.amount) || 0,
        date: i.actualReceivedDate || i.receivedDate,
        type: "receita",
        account: methodName(i.paymentMethodId),
        status: i.status === "received" ? "paid" : i.status === "overdue" ? "overdue" : "pending",
      });
    });
    sales.forEach((s) => {
      const k = (s.category && s.category.trim()) || "Vendas";
      if (incomeCategoryKey(k) !== selectedKey) return;
      if ((s.downPayment || 0) > 0 && s.date?.startsWith(monthKey)) {
        list.push({
          id: `sale-${s.id}-down`,
          description: `Venda: ${(s as any).description || (s as any).productName || "—"} (entrada)`,
          amount: Number(s.downPayment) || 0,
          date: s.date,
          type: "receita",
          account: "",
          status: "paid",
        });
      }
      (s.paymentHistory || []).forEach((p, idx) => {
        if (!p?.date?.startsWith(monthKey)) return;
        list.push({
          id: `sale-${s.id}-pay-${idx}`,
          description: `Venda: ${(s as any).description || (s as any).productName || "—"}`,
          amount: Number(p.amount) || 0,
          date: p.date,
          type: "receita",
          account: "",
          status: "paid",
        });
      });
    });
    return list;
  }, [selectedCategory, consolidated, sales, monthKey, methods]);

  const selectedTotal = topCategories.find((c) => c.name === selectedCategory)?.value || 0;

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
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-foreground">Top 5 categorias</h3>
        </div>
        <div className="space-y-2">
          {topCategories.map((s, idx) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSelectedCategory(s.name)}
              className="w-full flex items-center gap-3 rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted/50 transition-colors text-left"
            >
              <span className="w-5 text-xs text-muted-foreground">{idx + 1}.</span>
              <span className="flex-1 text-sm truncate text-foreground">{s.name}</span>
              <span className="text-sm font-semibold text-foreground">{fmtBRL(s.value)}</span>
            </button>
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
        <ResponsiveContainer width="100%" height={280}>
          <PieChart margin={{ top: 20, right: 70, bottom: 20, left: 70 }}>
            <Pie
              data={byCategory}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={0}
              minAngle={6}
              paddingAngle={1}
              labelLine={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
              label={({ name }: any) => name}
              isAnimationActive={false}
            >
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

      <CategoryDetailsSheet
        open={!!selectedCategory}
        onOpenChange={(o) => !o && setSelectedCategory(null)}
        categoryName={selectedCategory || ""}
        entries={selectedEntries}
        total={selectedTotal}
      />
    </div>
  );
}
