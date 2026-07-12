import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GoalType } from "@/hooks/useMonthlyGoals";
import { computePeriodScore } from "@/lib/metasScore";
import type { RealizedInputs } from "@/lib/metasMonthResult";
import type { PeriodSelection } from "@/lib/metasPeriod";

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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  weights: Record<GoalType, number>;
  inputs: RealizedInputs;
}

export function ScoreDetailDialog({ open, onOpenChange, weights, inputs }: Props) {
  const rows = useMemo(() => {
    const period: PeriodSelection = { mode: "year", year: new Date().getFullYear() };
    const { breakdown } = computePeriodScore(period, weights, inputs);
    return breakdown
      .filter((b) => b.weight > 0)
      .map((b) => ({
        label: GOAL_LABELS[b.goalType] ?? b.goalType,
        weight: b.weight,
        obtained: b.reached ? b.weight : 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [weights, inputs, open]);

  const totalMax = rows.reduce((s, r) => s + r.weight, 0);
  const totalObtained = rows.reduce((s, r) => s + r.obtained, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pontuação das Metas</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-3 font-semibold text-muted-foreground">Nome da Meta</th>
                <th className="py-2 px-3 font-semibold text-muted-foreground text-right whitespace-nowrap">Pontuação</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-6 px-3 text-center text-muted-foreground">
                    Nenhuma meta com pontuação cadastrada.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.label} className="border-b border-border/50">
                    <td className="py-2 px-3">{r.label}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-medium">
                      {r.obtained} / {r.weight}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold bg-muted/30">
                  <td className="py-3 px-3">
                    Subtotal — {rows.length} {rows.length === 1 ? "meta avaliada" : "metas avaliadas"}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">
                    {totalObtained} / {totalMax}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
