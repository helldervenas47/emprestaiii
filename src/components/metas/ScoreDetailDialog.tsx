import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GoalType } from "@/hooks/useMonthlyGoals";
import { computeMonthResult, type RealizedInputs } from "@/lib/metasMonthResult";
import { isGoalReached, monthKey } from "@/lib/metasPeriod";
import { INVERSE_GOAL_TYPES } from "@/lib/metasScore";

const GOAL_LABELS: Record<GoalType, string> = {
  interest_rate: "Taxa de Juros Mensal",
  profit: "Faturamento do Período",
  loan_volume: "Valor Emprestado",
  new_loans_count: "Novos Empréstimos",
  received_total: "Pagamentos no Mês",
  interest_received: "Juros Recebidos",
  active_capital: "Capital Ativo",
  net_profit: "Lucro Líquido",
  max_default_rate: "Taxa de Inadimplência",
  new_clients_count: "Novos Clientes",
  renegotiation_rate: "Contratos Renegociados",
  daily_received_avg: "Receita Média Diária",
  monthly_variation: "Variação Mensal do Patrimônio",
};

const MONTH_LABELS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weights: Record<GoalType, number>;
  inputs: RealizedInputs;
}

export function ScoreDetailDialog({ open, onOpenChange, weights, inputs }: Props) {
  const year = new Date().getFullYear();

  const { rows, monthTotals, grandTotal } = useMemo(() => {
    const goalTypes = (Object.keys(weights) as GoalType[]).filter((gt) => Number(weights[gt] || 0) > 0);

    const rows = goalTypes.map((gt) => {
      const w = Number(weights[gt] || 0);
      const inverse = INVERSE_GOAL_TYPES.has(gt);
      const monthly = Array.from({ length: 12 }, (_, i) => {
        const mk = monthKey(year, i + 1);
        const r = computeMonthResult(gt, mk, inputs);
        if (!r.hasGoal || r.isFuture) return 0;
        return isGoalReached(inverse, r.target, r.realized) ? w : 0;
      });
      const total = monthly.reduce((s, v) => s + v, 0);
      return {
        goalType: gt,
        label: GOAL_LABELS[gt] ?? gt,
        weight: w,
        monthly,
        total,
      };
    }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

    const monthTotals = Array.from({ length: 12 }, (_, i) =>
      rows.reduce((s, r) => s + r.monthly[i], 0),
    );
    const grandTotal = monthTotals.reduce((s, v) => s + v, 0);

    return { rows, monthTotals, grandTotal };
  }, [weights, inputs, year, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] md:max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Pontuação das Metas — {year}</DialogTitle>
        </DialogHeader>

        <div className="overflow-auto flex-1">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b border-border">
                <th className="py-2 px-3 font-semibold text-muted-foreground text-left sticky left-0 bg-background z-20 min-w-[180px]">
                  Meta
                </th>
                {MONTH_LABELS.map((m) => (
                  <th key={m} className="py-2 px-2 font-semibold text-muted-foreground text-right tabular-nums min-w-[52px]">
                    {m}
                  </th>
                ))}
                <th className="py-2 px-3 font-semibold text-muted-foreground text-right tabular-nums min-w-[90px] bg-muted/30">
                  Total do Ano
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-6 px-3 text-center text-muted-foreground">
                    Nenhuma meta com pontuação cadastrada.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.goalType} className="border-b border-border/50">
                    <td className="py-2 px-3 sticky left-0 bg-background z-10 font-medium">
                      {r.label}
                    </td>
                    {r.monthly.map((v, i) => (
                      <td
                        key={i}
                        className={`py-2 px-2 text-right tabular-nums ${v > 0 ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {v}
                      </td>
                    ))}
                    <td className="py-2 px-3 text-right tabular-nums font-semibold bg-muted/20">
                      {r.total}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold bg-muted/40">
                  <td className="py-3 px-3 sticky left-0 bg-muted/40 z-10">Pontuação Geral</td>
                  {monthTotals.map((v, i) => (
                    <td key={i} className="py-3 px-2 text-right tabular-nums">{v}</td>
                  ))}
                  <td className="py-3 px-3 text-right tabular-nums bg-muted/60">{grandTotal}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
