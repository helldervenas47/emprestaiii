import { useEffect, useState, useCallback } from "react";

/** Converte "H S% L%" → "#rrggbb". */
export function hslVarToHex(hsl: string): string {
  const m = hsl.trim().match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/);
  if (!m) return "#000000";
  const h = ((parseFloat(m[1]) % 360) + 360) % 360 / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface ThemePalette {
  /** Slot colors para séries em gráficos. */
  chart: string[];
  primary: string;
  accent: string;
  positive: string;
  warning: string;
  negative: string;
  grid: string;
  foreground: string;
  mutedForeground: string;
  card: string;
  border: string;
}

function readPalette(): ThemePalette {
  if (typeof window === "undefined") {
    return {
      chart: ["#4f46e5", "#22d3ee", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"],
      primary: "#4f46e5", accent: "#22d3ee",
      positive: "#10b981", warning: "#f59e0b", negative: "#ef4444",
      grid: "#e5e7eb", foreground: "#0f172a", mutedForeground: "#64748b",
      card: "#ffffff", border: "#e5e7eb",
    };
  }
  const cs = getComputedStyle(document.documentElement);
  const get = (v: string) => cs.getPropertyValue(v).trim();
  const hex = (v: string, fb: string) => {
    const raw = get(v);
    return raw ? hslVarToHex(raw) : fb;
  };
  return {
    chart: [
      hex("--chart-1", "#4f46e5"),
      hex("--chart-2", "#22d3ee"),
      hex("--chart-3", "#f59e0b"),
      hex("--chart-4", "#ef4444"),
      hex("--chart-5", "#8b5cf6"),
      hex("--chart-6", "#06b6d4"),
    ],
    primary: hex("--primary", "#4f46e5"),
    accent: hex("--accent", "#22d3ee"),
    positive: hex("--chart-positive", "#10b981"),
    warning: hex("--chart-warning", "#f59e0b"),
    negative: hex("--chart-negative", "#ef4444"),
    grid: hex("--chart-grid", "#e5e7eb"),
    foreground: hex("--foreground", "#0f172a"),
    mutedForeground: hex("--muted-foreground", "#64748b"),
    card: hex("--card", "#ffffff"),
    border: hex("--border", "#e5e7eb"),
  };
}

export function useThemePalette(): ThemePalette {
  const [palette, setPalette] = useState<ThemePalette>(() => readPalette());

  const refresh = useCallback(() => setPalette(readPalette()), []);

  useEffect(() => {
    refresh();
    // Observa mudanças no <html> (data-theme + classe dark) e estilos inline (cores customizadas)
    const obs = new MutationObserver(() => refresh());
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    // Evento custom emitido pelo useAppTheme + mudanças do sistema
    window.addEventListener("app-theme-change", refresh);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", refresh);
    return () => {
      obs.disconnect();
      window.removeEventListener("app-theme-change", refresh);
      mq.removeEventListener("change", refresh);
    };
  }, [refresh]);

  return palette;
}
