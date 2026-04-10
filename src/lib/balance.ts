const BALANCE_KEY = "hvcred_account_balance";

export function getBalance(): number {
  try {
    const v = localStorage.getItem(BALANCE_KEY);
    return v ? JSON.parse(v) : 0;
  } catch {
    return 0;
  }
}

export function setBalance(value: number) {
  localStorage.setItem(BALANCE_KEY, JSON.stringify(value));
}

/**
 * Adjust the account balance by a delta.
 * Positive = money in, Negative = money out.
 */
export function adjustBalance(delta: number) {
  const current = getBalance();
  setBalance(current + delta);
}
