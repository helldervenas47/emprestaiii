import { useEffect, useRef } from "react";
import { useCreditLimits } from "./useCreditLimits";
import {
  computeAutoLimitAdjustment,
  computeClientCreditMetrics,
  DEFAULT_INITIAL_LIMIT,
} from "@/lib/creditLimit";
import type { Client, Loan, Payment } from "@/types/loan";

/**
 * Cooldown in milliseconds between automatic recalculations for the same client.
 * Prevents excessive history entries when many payments are registered in sequence.
 */
const AUTO_ADJUST_COOLDOWN_MS = 1000 * 60 * 60 * 6; // 6h

/**
 * Watches loans/payments/clients and automatically adjusts each client's credit
 * limit (up or down) when their payment behavior justifies it.
 *
 * Only acts on limits in `auto` mode. Manual limits are never touched.
 * A short in-memory cooldown avoids re-running for the same client multiple
 * times within the same session.
 */
export function useAutoAdjustCreditLimits(
  clients: Client[],
  loans: Loan[],
  payments: Payment[],
) {
  const { limits, ensureLimit, updateLimit } = useCreditLimits();
  const lastRunRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!clients.length) return;

    const run = async () => {
      const now = Date.now();
      for (const client of clients) {
        if (!client.active) continue;
        if (inFlightRef.current.has(client.id)) continue;

        const metrics = computeClientCreditMetrics(client.id, loans, payments);
        // Need actual paid installments to justify any change
        if (metrics.totalInstallmentsPaid === 0) continue;

        const last = lastRunRef.current.get(client.id) ?? 0;
        if (now - last < AUTO_ADJUST_COOLDOWN_MS) continue;

        const limit = limits.find((l) => l.clientId === client.id);
        // Skip manual limits — respect operator override
        if (limit && limit.mode !== "auto") continue;

        const currentLimit = limit?.currentLimit ?? DEFAULT_INITIAL_LIMIT;
        const proposal = computeAutoLimitAdjustment(currentLimit, metrics);

        // No change → nothing to do
        if (proposal.newLimit === currentLimit) {
          lastRunRef.current.set(client.id, now);
          continue;
        }

        inFlightRef.current.add(client.id);
        try {
          if (!limit) {
            await ensureLimit(client.id);
          }
          await updateLimit(client.id, proposal.newLimit, {
            mode: "auto",
            changeType: "automatic",
            reason: `Ajuste automático: ${proposal.reason}`,
            metadata: {
              onTimePct: proposal.metrics.onTimePct,
              avgLateDays: proposal.metrics.avgLateDays,
              totalInstallmentsPaid: proposal.metrics.totalInstallmentsPaid,
              delta: proposal.delta,
            },
          });
          lastRunRef.current.set(client.id, now);
        } catch (err) {
          console.error("[auto-adjust-limit] failed for client", client.id, err);
        } finally {
          inFlightRef.current.delete(client.id);
        }
      }
    };

    run();
  }, [clients, loans, payments, limits, ensureLimit, updateLimit]);
}
