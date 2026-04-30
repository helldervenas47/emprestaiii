// Shared helpers to render report images and send via Telegram.
// Uses @resvg/resvg-wasm to convert SVG -> PNG inside the edge function.

import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

let _wasmReady: Promise<void> | null = null;
async function ensureWasm() {
  if (!_wasmReady) {
    _wasmReady = (async () => {
      const wasmUrl = "https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm";
      const buf = await fetch(wasmUrl).then((r) => r.arrayBuffer());
      await initWasm(buf);
    })();
  }
  return _wasmReady;
}

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function escXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface MonthlySummaryData {
  monthLabel: string;        // e.g. "Abril / 2026"
  total: number;
  prevTotal: number;
  dailyAvg: number;
  daysElapsed: number;
  topCategories: Array<{ name: string; curr: number; prev: number }>;
  budgets: Array<{ name: string; spent: number; budget: number }>;
}

export interface BrandInfo {
  name: string;
  primaryHsl?: string | null; // e.g. "221 83% 53%"
}

function hsl(primary: string | null | undefined, fallback = "221 83% 53%"): string {
  return `hsl(${primary || fallback})`;
}

function variationLabel(curr: number, prev: number): { text: string; color: string } {
  if (prev === 0) return { text: curr === 0 ? "—" : "novo", color: "#64748b" };
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? "+" : "";
  const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "■";
  const color = pct > 0 ? "#dc2626" : pct < 0 ? "#16a34a" : "#64748b";
  return { text: `${arrow} ${sign}${pct.toFixed(0)}%`, color };
}

export function buildMonthlySummarySVG(data: MonthlySummaryData, brand: BrandInfo): string {
  const W = 1080;
  const PAD = 56;
  const primary = hsl(brand.primaryHsl);
  const primarySoft = `hsl(${brand.primaryHsl || "221 83% 53%"} / 0.10)`;

  const totalVar = variationLabel(data.total, data.prevTotal);

  // ===== Top categories block =====
  const cats = (data.topCategories || []).slice(0, 6);
  const maxCat = cats.reduce((m, c) => Math.max(m, c.curr), 0) || 1;
  const catRowH = 56;
  const catsHeight = cats.length > 0 ? 56 + cats.length * catRowH : 0;

  // ===== Budgets block =====
  const budgets = data.budgets || [];
  const budgetRowH = 52;
  const budgetsHeight = budgets.length > 0 ? 56 + budgets.length * budgetRowH : 0;

  // Header (180) + Total card (190) + section gap + cats + budgets + bottom pad
  const HEADER_H = 170;
  const TOTAL_H = 200;
  const GAP = 28;
  const H =
    HEADER_H + TOTAL_H + GAP +
    (catsHeight ? catsHeight + GAP : 0) +
    (budgetsHeight ? budgetsHeight + GAP : 0) +
    40;

  let y = 0;

  // ---- Header ----
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${primary}" stop-opacity="0.75"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="url(#brand)"/>
`;

  y = 60;
  svg += `<text x="${PAD}" y="${y}" font-size="22" font-weight="600" fill="${primary}" letter-spacing="2">${escXml(brand.name.toUpperCase())} · RESUMO MENSAL</text>`;
  y += 60;
  svg += `<text x="${PAD}" y="${y}" font-size="56" font-weight="700" fill="#0f172a">${escXml(data.monthLabel)}</text>`;

  // ---- Total card ----
  y = HEADER_H + 20;
  svg += `<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${TOTAL_H - 20}" rx="20" fill="${primarySoft}"/>`;
  svg += `<text x="${PAD + 32}" y="${y + 44}" font-size="20" fill="#475569" font-weight="500">Total do mês</text>`;
  svg += `<text x="${PAD + 32}" y="${y + 110}" font-size="64" font-weight="700" fill="#0f172a">${escXml(fmtBRL(data.total))}</text>`;
  // variation bubble
  const varX = PAD + 32;
  svg += `<text x="${varX}" y="${y + 154}" font-size="22" font-weight="600" fill="${totalVar.color}">${escXml(totalVar.text)} vs ${escXml(fmtBRL(data.prevTotal))} no mês anterior</text>`;
  // daily avg right side
  const rightX = W - PAD - 32;
  svg += `<text x="${rightX}" y="${y + 44}" font-size="18" fill="#475569" text-anchor="end">Média diária</text>`;
  svg += `<text x="${rightX}" y="${y + 90}" font-size="36" font-weight="700" fill="#0f172a" text-anchor="end">${escXml(fmtBRL(data.dailyAvg))}</text>`;
  svg += `<text x="${rightX}" y="${y + 118}" font-size="16" fill="#64748b" text-anchor="end">${data.daysElapsed} ${data.daysElapsed === 1 ? "dia" : "dias"}</text>`;

  y += TOTAL_H;

  // ---- Top categories ----
  if (cats.length > 0) {
    svg += `<text x="${PAD}" y="${y + 28}" font-size="22" font-weight="700" fill="#0f172a">Top categorias</text>`;
    let ry = y + 56;
    const barX = PAD + 280;
    const barMaxW = W - PAD - 220 - barX;
    for (const c of cats) {
      const w = Math.max(4, (c.curr / maxCat) * barMaxW);
      const v = variationLabel(c.curr, c.prev);
      svg += `<text x="${PAD}" y="${ry + 24}" font-size="20" font-weight="600" fill="#0f172a">${escXml(c.name)}</text>`;
      svg += `<rect x="${barX}" y="${ry + 12}" width="${barMaxW}" height="18" rx="9" fill="#e2e8f0"/>`;
      svg += `<rect x="${barX}" y="${ry + 12}" width="${w}" height="18" rx="9" fill="${primary}"/>`;
      svg += `<text x="${W - PAD}" y="${ry + 24}" font-size="20" font-weight="600" fill="#0f172a" text-anchor="end">${escXml(fmtBRL(c.curr))}</text>`;
      svg += `<text x="${W - PAD}" y="${ry + 46}" font-size="14" font-weight="500" fill="${v.color}" text-anchor="end">${escXml(v.text)}</text>`;
      ry += catRowH;
    }
    y += catsHeight + GAP;
  }

  // ---- Budgets ----
  if (budgets.length > 0) {
    svg += `<text x="${PAD}" y="${y + 28}" font-size="22" font-weight="700" fill="#0f172a">Orçamentos</text>`;
    let ry = y + 56;
    const barX = PAD + 280;
    const barMaxW = W - PAD - 260 - barX;
    for (const b of budgets) {
      const pct = b.budget > 0 ? (b.spent / b.budget) * 100 : 0;
      const w = Math.min(barMaxW, (Math.min(pct, 100) / 100) * barMaxW);
      const color = pct > 100 ? "#dc2626" : pct >= 80 ? "#eab308" : "#16a34a";
      const left = b.budget - b.spent;
      const leftLabel = left < 0 ? `${escXml(fmtBRL(Math.abs(left)))} acima` : `${escXml(fmtBRL(left))} restante`;
      svg += `<text x="${PAD}" y="${ry + 22}" font-size="20" font-weight="600" fill="#0f172a">${escXml(b.name)}</text>`;
      svg += `<rect x="${barX}" y="${ry + 10}" width="${barMaxW}" height="16" rx="8" fill="#e2e8f0"/>`;
      svg += `<rect x="${barX}" y="${ry + 10}" width="${w}" height="16" rx="8" fill="${color}"/>`;
      svg += `<text x="${W - PAD}" y="${ry + 22}" font-size="18" font-weight="600" fill="${color}" text-anchor="end">${Math.round(pct)}%</text>`;
      svg += `<text x="${W - PAD}" y="${ry + 42}" font-size="13" fill="#64748b" text-anchor="end">${leftLabel}</text>`;
      ry += budgetRowH;
    }
    y += budgetsHeight + GAP;
  }

  svg += `</svg>`;
  return svg;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    background: "#ffffff",
  });
  const rendered = resvg.render();
  return rendered.asPng();
}

export async function tgSendPhoto(
  chatId: number,
  pngBytes: Uint8Array,
  caption: string,
  lovableKey: string,
  telegramKey: string,
): Promise<void> {
  const fd = new FormData();
  fd.append("chat_id", String(chatId));
  fd.append("caption", caption);
  fd.append("parse_mode", "Markdown");
  fd.append("photo", new Blob([pngBytes], { type: "image/png" }), "report.png");

  const r = await fetch(`${GATEWAY_URL}/sendPhoto`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
    },
    body: fd,
  });
  if (!r.ok) {
    const text = await r.text();
    console.error("sendPhoto failed", r.status, text);
    throw new Error(`sendPhoto failed: ${r.status} ${text}`);
  }
}
