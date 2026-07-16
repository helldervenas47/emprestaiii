// Hook consolidado que reúne todos os inputs necessários para calcular a
// Pontuação Geral Mensal das metas, e expõe uma função `getMonthlyScore(monthKey)`.
// Usa a MESMA lógica dos cards e da tabela detalhada (computePeriodScore em
// modo "month") — garante fonte única de verdade.
import { useCallback, useMemo } from "react";
import { useLoans } from "@/hooks/useLoans";
import { useExpenses } from "@/hooks/useExpenses";
import { useClients } from "@/hooks/useClients";
import { useLoanRenegotiations } from "@/hooks/useLoanRenegotiations";
import { useMonthlyGoals } from "@/hooks/useMonthlyGoals";
import { useGoalSnapshots } from "@/hooks/useGoalSnapshots";
import { useActiveCapitalSnapshots } from "@/hooks/useActiveCapitalSnapshots";
import { useGoalScoreWeights } from "@/hooks/useGoalScoreWeights";
import { computePeriodScore } from "@/lib/metasScore";

export function useMonthlyScoreProvider() {
  const { loans, payments, installmentSchedules } = useLoans();
  const { expenses } = useExpenses();
  const { clients } = useClients();
  const { renegotiations } = useLoanRenegotiations();
  const { goals } = useMonthlyGoals();
  const { getSnapshot } = useGoalSnapshots();
  const { weights, loaded: weightsLoaded } = useGoalScoreWeights();

  const currentActiveCapital = useMemo(
    () => loans
      .filter((l: any) => l.status !== "completed" && l.status !== "paid")
      .reduce((s: number, l: any) => s + (Number(l.remainingAmount ?? l.remaining_amount) || 0), 0),
    [loans],
  );
  const { currentMonth: acCurrentMonth, getSnapshotAmount } = useActiveCapitalSnapshots(currentActiveCapital);

  const inputs = useMemo(() => ({
    loans, payments, expenses, clients, installmentSchedules, renegotiations,
    goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount,
  }), [loans, payments, expenses, clients, installmentSchedules, renegotiations, goals, getSnapshot, acCurrentMonth, currentActiveCapital, getSnapshotAmount]);

  const getMonthlyScore = useCallback((monthKey: string): number => {
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return 0;
    const res = computePeriodScore({ mode: "month", year: y, month: m }, weights, inputs);
    return res.total;
  }, [weights, inputs]);

  const ready = weightsLoaded && goals !== undefined;

  return { getMonthlyScore, ready };
}
