import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Percent } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Loan } from "@/types/loan";
import { calculateSplitMonthlyRates } from "@/lib/monthlyInterestRateBySplit";

interface Props {
  loans: Loan[];
  /** Período atual selecionado no dashboard (define o "âncora" do gráfico). */
  range: { start: Date; end: Date };
  rangeLabel?: string;
}

const monthShort = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function InterestRateBySplitCard({ loans, range, rangeLabel }: Props) {
  const data = useMemo(() => {
    // Plota a evolução dos últimos 12 meses, ancorada no mês final do período selecionado.
    const anchor = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    const months: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: `${monthShort[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        start,
        end,
      });
    }
    return months.map((m) => {
      const split = calculateSplitMonthlyRates(loans, { start: m.start, end: m.end });
      return {
        month: m.label,
        single: split.single.weightedRate !== null ? Number(split.single.weightedRate.toFixed(2)) : null,
        installment: split.installment.weightedRate !== null ? Number(split.installment.weightedRate.toFixed(2)) : null,
        singleCount: split.single.loanCount,
        installmentCount: split.installment.loanCount,
      };
    });
  }, [loans, range]);

  const currentSplit = useMemo(
    () => calculateSplitMonthlyRates(loans, range),
    [loans, range]
  );

  const fmtRate = (v: number | null) =>
    v === null ? "—" : `${v.toFixed(2)}%`;

  return (
    <Card no3d className="animate-fade-in">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
              <Percent className="h-5 w-5 text-warning" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Taxa de Juros Mensal — Parcela Única vs Parcelados</h3>
              <p className="text-[11px] text-muted-foreground">
                Evolução nos últimos 12 meses {rangeLabel ? `(referência: ${rangeLabel})` : ""}. Inclui contratos quitados.
              </p>
            </div>
          </div>
        </div>

        {/* Resumo do período selecionado */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-border/30 bg-muted/20 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Parcela Única</p>
            <p className="text-lg font-bold text-warning mt-1">{fmtRate(currentSplit.single.weightedRate)}</p>
            <p className="text-[10px] text-muted-foreground">
              {currentSplit.single.loanCount} contrato{currentSplit.single.loanCount !== 1 ? "s" : ""} no período
            </p>
          </div>
          <div className="rounded-xl border border-border/30 bg-muted/20 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Parcelados</p>
            <p className="text-lg font-bold text-primary mt-1">{fmtRate(currentSplit.installment.weightedRate)}</p>
            <p className="text-[10px] text-muted-foreground">
              {currentSplit.installment.loanCount} contrato{currentSplit.installment.loanCount !== 1 ? "s" : ""} no período
            </p>
          </div>
        </div>

        {/* Dois gráficos lado a lado, mesma escala visual (% mensal) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Parcela Única</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} className="text-muted-foreground" />
                  <Tooltip
                    formatter={(v: number) => [`${v?.toFixed(2)}%`, "Taxa mensal"]}
                    labelFormatter={(l) => `Mês: ${l}`}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                  />
                  <Line type="monotone" dataKey="single" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Parcelados</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} className="text-muted-foreground" />
                  <Tooltip
                    formatter={(v: number) => [`${v?.toFixed(2)}%`, "Taxa mensal"]}
                    labelFormatter={(l) => `Mês: ${l}`}
                    contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))" }}
                  />
                  <Line type="monotone" dataKey="installment" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mt-3 text-center">
          Valores em <span className="font-medium">% ao mês</span>, ponderados pelo valor emprestado de cada contrato com vencimento no mês.
        </p>
      </CardContent>
    </Card>
  );
}
