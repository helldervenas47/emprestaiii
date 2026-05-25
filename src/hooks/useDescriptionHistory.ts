import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "lov:desc-history:";
const TEMPLATE_PREFIX = "lov:desc-template:";
const MAX = 30;

export type DescriptionTemplate = {
  description: string;
  amount?: number | string;
  category?: string;
  notes?: string;
  paymentMethodId?: string | null;
  clientName?: string;
  // free-form extras for forms with extra fields
  [key: string]: unknown;
};

/**
 * Local-only suggestion store for "descrição" inputs.
 * Saves into localStorage scoped by `scope` (e.g. "expense", "income", "personal-expense").
 * Use with a native <datalist> for instant, zero-cost autocomplete.
 *
 * Also stores per-description templates so subsequent entries with the same
 * description can pre-fill amount, category, notes, etc.
 */
export function useDescriptionHistory(scope: string) {
  const key = KEY_PREFIX + scope;
  const tKey = TEMPLATE_PREFIX + scope;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Record<string, DescriptionTemplate>>({});

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
    try {
      const raw = localStorage.getItem(tKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setTemplates(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [key, tKey]);

  const record = useCallback(
    (value: string, template?: Omit<DescriptionTemplate, "description">) => {
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
      if (template) {
        setTemplates((prev) => {
          const next = { ...prev, [v.toLowerCase()]: { description: v, ...template } };
          try {
            localStorage.setItem(tKey, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    },
    [key, tKey],
  );

  const findTemplate = useCallback(
    (value: string): DescriptionTemplate | null => {
      const v = (value ?? "").trim().toLowerCase();
      if (!v) return null;
      return templates[v] ?? null;
    },
    [templates],
  );

  return { suggestions, record, findTemplate };
}
