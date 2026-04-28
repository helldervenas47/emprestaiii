import { useEffect, useRef } from "react";
import { useCreditLimits } from "./useCreditLimits";
import { useAccountSettings } from "./useAccountSettings";
import {
  computeAutoLimitAdjustment,
  computeClientCreditMetrics,
  DEFAULT_INITIAL_LIMIT,
} from "@/lib/creditLimit";
import { todayInAppTz } from "@/lib/timezone";
import type { Client, Loan, Payment } from "@/types/loan";

/**
 * Returns "YYYY-MM" for the given ISO timestamp interpreted in local time.
 */
function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Watches loans/payments/clients and automatically adjusts each client's credit
 * limit (up or down) when their payment behavior justifies it.
 *
 * Schedule: runs only on the **1st day of the month**, and at most **once per
 * month** per client (using `lastAutoCalculatedAt` as the source of truth).
 * Manual limits are never touched.
 */
export function useAutoAdjustCreditLimits(
  clients: Client[],
  loans: Loan[],
  payments: Payment[],
) {
  const { limits, ensureLimit, updateLimit } = useCreditLimits();
  const { settings } = useAccountSettings();
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!clients.length) return;

    // Only run on the 1st day of the month (app timezone).
    const today = todayInAppTz(); // "YYYY-MM-DD"
    const [yearStr, monthStr, dayStr] = today.split("-");
    if (dayStr !== "01") return;
    const currentMonthKey = `${yearStr}-${monthStr}`;

    const run = async () => {
      for (const client of clients) {
        if (!client.active) continue;
        if (inFlightRef.current.has(client.id)) continue;

        const metrics = computeClientCreditMetrics(client.id, loans, payments);
        // Need actual paid installments to justify any change
        if (metrics.totalInstallmentsPaid === 0) continue;

        const limit = limits.find((l) => l.clientId === client.id);
        // Skip manual limits — respect operator override
        if (limit && limit.mode !== "auto") continue;

        // Already adjusted this month → skip
        if (limit && monthKey(limit.lastAutoCalculatedAt) === currentMonthKey) {
          continue;
        }

        const currentLimit = limit?.currentLimit ?? DEFAULT_INITIAL_LIMIT;
        const proposal = computeAutoLimitAdjustment(currentLimit, metrics);
        // Cap proposal at the global maximum credit limit, if any
        const cap = settings.maxCreditLimit;
        const cappedNew = cap != null ? Math.min(proposal.newLimit, cap) : proposal.newLimit;

        // No change → still mark the limit as visited this month so we don't
        // recompute on every render. We do this by writing the same value,
        // which refreshes `last_auto_calculated_at`.
        if (cappedNew === currentLimit) {
          if (!limit) continue; // nothing to mark
          inFlightRef.current.add(client.id);
          try {
            await updateLimit(client.id, currentLimit, {
              mode: "auto",
              changeType: "automatic",
              reason: "Reavaliação mensal — limite mantido",
              metadata: {
                onTimePct: proposal.metrics.onTimePct,
                avgLateDays: proposal.metrics.avgLateDays,
              },
            });
          } catch (err) {
            console.error("[auto-adjust-limit] mark failed for client", client.id, err);
          } finally {
            inFlightRef.current.delete(client.id);
          }
          continue;
        }

        inFlightRef.current.add(client.id);
        try {
          if (!limit) {
            await ensureLimit(client.id);
          }
          await updateLimit(client.id, cappedNew, {
            mode: "auto",
            changeType: "automatic",
            reason: cappedNew < proposal.newLimit
              ? `Ajuste automático mensal limitado pelo teto global: ${proposal.reason}`
              : `Ajuste automático mensal: ${proposal.reason}`,
            metadata: {
              onTimePct: proposal.metrics.onTimePct,
              avgLateDays: proposal.metrics.avgLateDays,
              totalInstallmentsPaid: proposal.metrics.totalInstallmentsPaid,
              delta: cappedNew - currentLimit,
              maxCreditLimit: cap,
            },
          });
        } catch (err) {
          console.error("[auto-adjust-limit] failed for client", client.id, err);
        } finally {
          inFlightRef.current.delete(client.id);
        }
      }
    };

    run();
  }, [clients, loans, payments, limits, ensureLimit, updateLimit, settings.maxCreditLimit]);
}
