import { useEffect } from "react";
import { getBalances } from "@/lib/balance";
import type { Loan } from "@/types/loan";

/**
 * Publica no localStorage o patrimônio "ao vivo" do mês corrente e mantém o
 * snapshot do mês anterior travado, de forma global — independente de o card
 * "Extrato / Saldo Consolidado" ter sido montado.
 *
 * Consumido por GoalsCard para calcular a meta `monthly_variation`.
 */
export function usePatrimonioPublisher(loans: Loan[]) {
  useEffect(() => {
    let alive = true;
    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const publish = async () => {
      try {
        const b = await getBalances();
        if (!alive) return;
        const contaMaisDinheiro = (b.account || 0) + (b.cash || 0);
        const pendingLoans = loans
          .filter((l) => l.status !== "paid")
          .reduce((s, l) => s + (l.remainingAmount ?? 0), 0);
        const total = contaMaisDinheiro + pendingLoans;
        const now = new Date();
        const currentKey = monthKey(now);

        localStorage.setItem(
          "patrimonio.current.v1",
          JSON.stringify({ month: currentKey, account: contaMaisDinheiro, rua: pendingLoans, total }),
        );

        // Trava snapshot apenas no último dia do mês.
        const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const isLastDay = next.getMonth() !== now.getMonth();
        if (isLastDay) {
          const raw = localStorage.getItem("patrimonio.snapshots.v1");
          const snaps: Record<string, any> = raw ? JSON.parse(raw) : {};
          if (snaps[currentKey] == null) {
            snaps[currentKey] = { account: contaMaisDinheiro, rua: pendingLoans, total };
            localStorage.setItem("patrimonio.snapshots.v1", JSON.stringify(snaps));
          }
        }
      } catch { /* noop */ }
    };

    publish();
    const onChange = () => { publish(); };
    window.addEventListener("balance:changed", onChange);
    window.addEventListener("focus", onChange);
    return () => {
      alive = false;
      window.removeEventListener("balance:changed", onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [loans]);
}
