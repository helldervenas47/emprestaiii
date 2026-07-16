import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Sparkles } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DashboardChartEditor } from "@/components/dashboard/DashboardChartEditor";

interface MonthlyRow { month: string; emprestado: number; recebido: number }
interface InterestRow { month: string; juros: number }

interface Props {
  readOnly: boolean;
  formatCurrency: (v: number) => string;
  riskReturn: { axisPosition: number };
  yearlyAverages: { interestRate: { rate: number | null }; interestReceived: number };
  onRiskAiClick: () => void;
  monthlyChart: MonthlyRow[];
  monthlyChartBase: MonthlyRow[];
  interestChart: InterestRow[];
  interestChartBase: InterestRow[];
  setChartOverrides: (o: Record<string, { emprestado?: number; recebido?: number }>) => void;
  setInterestOverrides: (o: Record<string, number>) => void;
}

export function DashboardChartsSection({
  readOnly, formatCurrency, riskReturn, yearlyAverages, onRiskAiClick,
  monthlyChart, monthlyChartBase, interestChart, interestChartBase,
  setChartOverrides, setInterestOverrides,
}: Props) {
  const [editingChart, setEditingChart] = useState(false);
  const [tempOverrides, setTempOverrides] = useState<Record<string, { emprestado: string; recebido: string }>>({});
  const [editingInterest, setEditingInterest] = useState(false);
  const [tempInterestOverrides, setTempInterestOverrides] = useState<Record<string, string>>({});

  const startEditChart = () => {
    const temp: Record<string, { emprestado: string; recebido: string }> = {};
    monthlyChart.forEach((m) => {
      temp[m.month] = { emprestado: String(m.emprestado), recebido: String(m.recebido) };
    });
    setTempOverrides(temp);
    setEditingChart(true);
  };

  const saveChartOverrides = () => {
    const newOverrides: Record<string, { emprestado?: number; recebido?: number }> = {};
    monthlyChartBase.forEach((m) => {
      const temp = tempOverrides[m.month];
      if (!temp) return;
      const totalEmprestado = parseFloat(temp.emprestado) || 0;
      const totalRecebido = parseFloat(temp.recebido) || 0;
      const diffEmprestado = totalEmprestado - m.emprestado;
      const diffRecebido = totalRecebido - m.recebido;
      if (diffEmprestado !== 0 || diffRecebido !== 0) {
        newOverrides[m.month] = {
          ...(diffEmprestado !== 0 ? { emprestado: diffEmprestado } : {}),
          ...(diffRecebido !== 0 ? { recebido: diffRecebido } : {}),
        };
      }
    });
    setChartOverrides(newOverrides);
    setEditingChart(false);
  };

  const resetChartOverrides = () => { setChartOverrides({}); setEditingChart(false); };

  const startEditInterest = () => {
    const temp: Record<string, string> = {};
    interestChart.forEach((m) => { temp[m.month] = String(m.juros); });
    setTempInterestOverrides(temp);
    setEditingInterest(true);
  };

  const saveInterestOverrides = () => {
    const newOverrides: Record<string, number> = {};
    interestChartBase.forEach((m) => {
      const raw = tempInterestOverrides[m.month];
      if (raw === undefined || raw === "") return;
      const totalVal = parseFloat(raw);
      if (!Number.isFinite(totalVal)) return;
      newOverrides[m.month] = totalVal;
    });
    setInterestOverrides(newOverrides);
    setEditingInterest(false);
  };

  const resetInterestOverrides = () => { setInterestOverrides({}); setEditingInterest(false); };

  return (
    <>
      <Card no3d>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Indicador risco vs retorno</h3>
            <p className="text-xs text-muted-foreground">Score simples, classificação e alerta visual da operação atual.</p>
          </div>

          <div className="space-y-4">
            <button type="button" onClick={onRiskAiClick} className="w-full rounded-xl border border-primary/20 bg-card/70 p-5 text-left shadow-[0_16px_40px_-20px_hsl(var(--primary)/0.35)] backdrop-blur-xl backdrop-saturate-150 transition-all hover:bg-card/80 hover:border-primary/30">
              <div className="mb-3 flex justify-end">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-card/75 shadow-[0_8px_24px_-14px_hsl(var(--primary)/0.4)] backdrop-blur-xl backdrop-saturate-150">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                <span>Baixo risco / baixo retorno</span>
                <span>Alto risco / alto retorno</span>
              </div>
              <div className="relative h-6 rounded-full bg-gradient-to-r from-success/40 via-warning/35 to-destructive/45">
                <div className="absolute top-1/2 h-8 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-background bg-card shadow" style={{ left: `${riskReturn.axisPosition}%` }} />
              </div>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Taxa de juros média (ano)</p>
                <p className="text-lg font-bold text-foreground mt-1">{yearlyAverages.interestRate.rate !== null ? `${yearlyAverages.interestRate.rate.toFixed(2)}%` : "Sem dados"}</p>
              </div>
              <div className="rounded-xl border border-border/30 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Média juros recebidos (ano)</p>
                <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(yearlyAverages.interestReceived)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card no3d>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Histórico Mensal (Últimos 12 Meses)</h3>
            <div className="flex items-center gap-1">
              {editingChart ? (
                <>
                  <Button variant="ghost" size="sm" onClick={resetChartOverrides} className="text-xs text-muted-foreground">Resetar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingChart(false)}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveChartOverrides}>
                    <Check className="h-3.5 w-3.5 text-success" />
                  </Button>
                </>
              ) : !readOnly ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditChart} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          {editingChart && (
            <DashboardChartEditor
              rows={monthlyChart}
              columns={[
                {
                  key: "emprestado", label: "Emprestado", labelClass: "text-warning",
                  getValue: (m) => tempOverrides[m]?.emprestado ?? "",
                  onChange: (m, v) => setTempOverrides((prev) => ({ ...prev, [m]: { ...prev[m], emprestado: v } })),
                },
                {
                  key: "recebido", label: "Recebido", labelClass: "text-success",
                  getValue: (m) => tempOverrides[m]?.recebido ?? "",
                  onChange: (m, v) => setTempOverrides((prev) => ({ ...prev, [m]: { ...prev[m], recebido: v } })),
                },
              ]}
            />
          )}

          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name === "emprestado" ? "Emprestado" : "Recebido"]}
                  labelFormatter={(label) => label}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                />
                <Legend formatter={(value) => value === "emprestado" ? "Emprestado" : "Recebido"} />
                <Bar dataKey="emprestado" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="recebido" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card no3d>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Juros Recebidos por Mês (Últimos 12 Meses)</h3>
            <div className="flex items-center gap-1">
              {editingInterest ? (
                <>
                  <Button variant="ghost" size="sm" onClick={resetInterestOverrides} className="text-xs text-muted-foreground">Resetar</Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingInterest(false)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveInterestOverrides}><Check className="h-3.5 w-3.5 text-success" /></Button>
                </>
              ) : !readOnly ? (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startEditInterest} title="Ajustar valores manualmente">
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : null}
            </div>
          </div>

          {editingInterest && (
            <DashboardChartEditor
              rows={interestChart}
              columns={[{
                key: "juros", label: "Juros Recebidos", labelClass: "text-primary",
                getValue: (m) => tempInterestOverrides[m] ?? "",
                onChange: (m, v) => setTempInterestOverrides((prev) => ({ ...prev, [m]: v })),
              }]}
            />
          )}

          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={interestChart} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Juros Recebidos"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                />
                <Legend formatter={() => "Juros Recebidos"} />
                <Bar dataKey="juros" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
