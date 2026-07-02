import { useEffect, useState } from "react";
import { getBalance, setBalance } from "@/lib/balance";

// @deprecated P0-01 — este hook lê a tabela `balance` (Dashboard).
// A fonte oficial de saldo é `useOfficialAccountBalance` em
// `src/lib/accountLedgerBalance.ts`. Este arquivo continua ativo apenas
// para manter o comportamento atual do Dashboard até P0-01c.
// Subscribe to balance changes via offline-sync events + light polling
export function useAccountBalance(): [number, (v: number) => void] {
  const [bal, setBal] = useState(0);
  useEffect(() => {
    const load = () => { getBalance().then(setBal); };
    load();
    const interval = setInterval(load, 10000);
    const onSync = () => load();
    window.addEventListener("offline-sync:flushed", onSync);
    window.addEventListener("offline-sync:pending-changed", onSync);
    window.addEventListener("focus", onSync);
    window.addEventListener("balance:changed", onSync);
    return () => {
      clearInterval(interval);
      window.removeEventListener("offline-sync:flushed", onSync);
      window.removeEventListener("offline-sync:pending-changed", onSync);
      window.removeEventListener("focus", onSync);
      window.removeEventListener("balance:changed", onSync);
    };
  }, []);
  const update = (v: number) => { setBalance(v); setBal(v); };
  return [bal, update];
}
