import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "lov:desc-history:";
const MAX = 30;

/**
 * Local-only suggestion store for "descrição" inputs.
 * Saves into localStorage scoped by `scope` (e.g. "expense", "income", "personal-expense").
 * Use with a native <datalist> for instant, zero-cost autocomplete.
 */
export function useDescriptionHistory(scope: string) {
  const key = KEY_PREFIX + scope;
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSuggestions(parsed.filter((x) => typeof x === "string"));
      }
    } catch {
      /* ignore corrupt history */
    }
  }, [key]);

  const record = useCallback(
    (value: string) => {
      const v = (value ?? "").trim();
      if (!v) return;
      setSuggestions((prev) => {
        const next = [v, ...prev.filter((p) => p.toLowerCase() !== v.toLowerCase())].slice(0, MAX);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* quota / disabled — ignore */
        }
        return next;
      });
    },
    [key],
  );

  return { suggestions, record };
}
