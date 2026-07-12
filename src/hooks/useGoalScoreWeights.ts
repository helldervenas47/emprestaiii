import { useCallback, useEffect, useState } from "react";
import { useDataOwner } from "@/hooks/useDataOwner";
import type { GoalType } from "@/hooks/useMonthlyGoals";

// Pesos padrão iniciais somando 100.
export const DEFAULT_WEIGHTS: Record<GoalType, number> = {
  interest_rate:      5,
  profit:             5,
  loan_volume:        10,
  new_loans_count:    5,
  received_total:     0,
  interest_received:  20,
  active_capital:     10,
  net_profit:         0,
  max_default_rate:   10,
  new_clients_count:  5,
  renegotiation_rate: 10,
  daily_received_avg: 10,
  monthly_variation:  10,
};

const storageKey = (ownerId: string) => `metas_score_weights_v1_${ownerId}`;

export function useGoalScoreWeights() {
  const ownerId = useDataOwner();
  const [weights, setWeights] = useState<Record<GoalType, number>>(DEFAULT_WEIGHTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const raw = localStorage.getItem(storageKey(ownerId));
      if (raw) {
        const parsed = JSON.parse(raw);
        setWeights({ ...DEFAULT_WEIGHTS, ...parsed });
      }
    } catch {}
    setLoaded(true);
  }, [ownerId]);

  const setWeight = useCallback((type: GoalType, value: number) => {
    setWeights((prev) => {
      const next = { ...prev, [type]: Math.max(0, Math.round(value || 0)) };
      if (ownerId) {
        try { localStorage.setItem(storageKey(ownerId), JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }, [ownerId]);

  const saveAll = useCallback((next: Record<GoalType, number>) => {
    setWeights(next);
    if (ownerId) {
      try { localStorage.setItem(storageKey(ownerId), JSON.stringify(next)); } catch {}
    }
  }, [ownerId]);

  const total = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);

  return { weights, setWeight, saveAll, total, loaded };
}
