import { useMemo, useState, useCallback } from "react";
import { useMonthlyGoals, GoalType } from "@/hooks/useMonthlyGoals";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { Loan, Payment, Expense, Client, InstallmentSchedule } from "@/types/loan";
import { GoalYearlyChartCard } from "./GoalYearlyChartCard";
import { ManagerCommissionsYearlyCard } from "./ManagerCommissionsYearlyCard";
import { ActiveTooltipProvider, useActiveTooltip } from "./ActiveTooltipContext";
import { Target } from "lucide-react";

type Unit = "%" | "R$" | "qtd";

// Sincronizado com GOAL_TYPE_META em GoalsCard.tsx
const GOAL_META: Record<GoalType, { label: string; unit: Unit; inverse?: boolean }> = {
  interest_rate:      { label: "Taxa de Juros Mensal", unit: "%" },
  profit:             { label: "Faturamento do Período", unit: "%" },
  loan_volume:        { label: "Valor Emprestado", unit: "R$" },
  new_loans_count:    { label: "Novos Empréstimos", unit: "qtd" },
  received_total:     { label: "Pagamentos no Mês", unit: "R$" },
  interest_received:  { label: "Juros Recebidos", unit: "R$" },
  active_capital:     { label: "Capital Ativo", unit: "R$" },
  net_profit:         { label: "Lucro Líquido", unit: "R$" },
  max_default_rate:   { label: "Taxa de Inadimplência", unit: "%", inverse: true },
  new_clients_count:  { label: "Novos Clientes", unit: "qtd" },
  renegotiation_rate: { label: "Contratos Renegociados", unit: "qtd", inverse: true },
  daily_received_avg: { label: "Receita Média Diária", unit: "R$" },
  monthly_variation:  { label: "Variação Mensal do Patrimônio", unit: "%" },
};

const ALL_GOAL_TYPES: GoalType[] = [
  "interest_rate", "profit", "loan_volume", "new_loans_count",
  "received_total", "interest_received", "active_capital", "net_profit",
  "max_default_rate", "new_clients_count", "renegotiation_rate",
  "daily_received_avg", "monthly_variation",
];

interface Props {
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
}

export function GoalsYearlyGrid({
  loans, payments, expenses, clients, installmentSchedules,
}: Props) {
  const { goals, loading } = useMonthlyGoals();
  const { renegotiations } = useLoanRenegotiations();
  const [year, setYear] = useState<number>(new Date().getFullYear());

  // Exibir todas as metas cadastradas (qualquer goalType com pelo menos uma meta em qualquer mês).
  const goalTypes = useMemo<GoalType[]>(() => {
    const set = new Set<GoalType>();
    goals.forEach((g) => set.add(g.goalType));
    // Manter ordem consistente com ALL_GOAL_TYPES.
    return ALL_GOAL_TYPES.filter((t) => set.has(t));
  }, [goals]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Carregando metas…
      </div>
    );
  }

  if (goalTypes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center border border-dashed border-border rounded-xl bg-muted/20">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Nenhuma meta cadastrada</p>
          <p className="text-xs text-muted-foreground mt-1">
            Vá em <span className="font-medium">Configuração de Metas</span> para cadastrar sua primeira meta.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ActiveTooltipProvider>
      <GridInner
        year={year}
        setYear={setYear}
        goalTypes={goalTypes}
        loans={loans}
        payments={payments}
        expenses={expenses}
        clients={clients}
        installmentSchedules={installmentSchedules}
        renegotiations={renegotiations}
      />
    </ActiveTooltipProvider>
  );
}

function GridInner(props: {
  year: number;
  setYear: (y: number) => void;
  goalTypes: GoalType[];
  loans: Loan[];
  payments: Payment[];
  expenses: Expense[];
  clients: Client[];
  installmentSchedules: InstallmentSchedule[];
  renegotiations: ReturnType<typeof useLoanRenegotiations>["renegotiations"];
}) {
  const { year, setYear, goalTypes, loans, payments, expenses, clients, installmentSchedules, renegotiations } = props;
  const { clearAll } = useActiveTooltip("__grid__");
  const handleYearChange = useCallback((y: number) => { clearAll(); setYear(y); }, [clearAll, setYear]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 auto-rows-[440px]">
      <ManagerCommissionsYearlyCard
        year={year}
        onYearChange={handleYearChange}
        clients={clients}
        loans={loans}
        payments={payments}
      />
      {goalTypes.map((gt) => {
        const meta = GOAL_META[gt];
        return (
          <GoalYearlyChartCard
            key={gt}
            goalType={gt}
            goalLabel={meta.label}
            unit={meta.unit}
            inverse={meta.inverse}
            year={year}
            onYearChange={handleYearChange}
            loans={loans}
            payments={payments}
            expenses={expenses}
            clients={clients}
            installmentSchedules={installmentSchedules}
            renegotiations={renegotiations}
            compact
          />
        );
      })}
    </div>
  );
}
