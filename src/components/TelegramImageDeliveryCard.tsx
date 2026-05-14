import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Image as ImageIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "telegram_image_delivery_prefs_v1";

export type ReportKey =
  | "billing"
  | "accumulated_delinquency"
  | "daily_planning"
  | "incomes_expenses"
  | "manager_weekly"
  | "personal_insights";

export interface ImageDeliveryPrefs {
  reports: Record<ReportKey, boolean>;
  includeText: boolean;
}

const REPORTS: { key: ReportKey; label: string; hint: string }[] = [
  { key: "billing", label: "Cobranças do dia", hint: "Relatório diário de cobranças" },
  { key: "accumulated_delinquency", label: "Inadimplência acumulada", hint: "Resumo de atrasos" },
  { key: "daily_planning", label: "Planejamento do dia", hint: "Planejamento diário" },
  { key: "incomes_expenses", label: "Receitas e Despesas", hint: "Resumo financeiro" },
  { key: "manager_weekly", label: "Resumo por gerente", hint: "Resumo semanal por gerente" },
  { key: "personal_insights", label: "Insights pessoais (IA)", hint: "Análise de despesas pessoais" },
];

const DEFAULT_PREFS: ImageDeliveryPrefs = {
  reports: {
    billing: true,
    accumulated_delinquency: true,
    daily_planning: true,
    incomes_expenses: true,
    manager_weekly: true,
    personal_insights: true,
  },
  includeText: true,
};

export function loadImageDeliveryPrefs(): ImageDeliveryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      reports: { ...DEFAULT_PREFS.reports, ...(parsed.reports || {}) },
      includeText: parsed.includeText ?? true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function TelegramImageDeliveryCard() {
  const [prefs, setPrefs] = useState<ImageDeliveryPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    setPrefs(loadImageDeliveryPrefs());
  }, []);

  const update = (next: ImageDeliveryPrefs) => {
    setPrefs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const toggleReport = (key: ReportKey, value: boolean) => {
    update({ ...prefs, reports: { ...prefs.reports, [key]: value } });
  };

  return (
    <Card no3d>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ImageIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm">Envio em formato de imagem</p>
            <p className="text-xs text-muted-foreground">
              Selecione quais relatórios serão enviados como imagem no Telegram.
            </p>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          {REPORTS.map((r) => (
            <label
              key={r.key}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{r.label}</p>
                <p className="text-[11px] text-muted-foreground truncate">{r.hint}</p>
              </div>
              <Switch
                checked={prefs.reports[r.key]}
                onCheckedChange={(v) => toggleReport(r.key, v)}
              />
            </label>
          ))}
        </div>

        <div className="border-t pt-3">
          <label className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                Incluir mensagem de texto junto à imagem
              </p>
              <p className="text-[11px] text-muted-foreground">
                Quando desativado, apenas a imagem será enviada (sem legenda).
              </p>
            </div>
            <Switch
              checked={prefs.includeText}
              onCheckedChange={(v) => update({ ...prefs, includeText: v })}
            />
          </label>
        </div>

        <p className="text-[10px] text-muted-foreground">
          As preferências são salvas neste dispositivo.
        </p>
      </CardContent>
    </Card>
  );
}
