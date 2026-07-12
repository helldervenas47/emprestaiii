import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { useHideValues } from "@/contexts/HideValuesContext";
import { useManagerCommissions } from "@/hooks/useManagerCommissions";
import { Client, Loan, Payment, InstallmentSchedule } from "@/types/loan";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MONTH_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const BAR_COLOR = "hsl(var(--primary))";

interface Props {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

function fmtBRL(v: number, hidden: boolean): string {
  if (hidden) return "R$ ••••";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtCompactBRL(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(2).replace(".", ",")}k`;
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function resolveLoanManagerId(loan: Loan, managers: Client[]): string | null {
  if (!loan.hasManager) return null;
  if (loan.managerId) return loan.managerId;
  if (loan.borrowerId && managers.some((m) => m.id === loan.borrowerId)) return loan.borrowerId;
  const nm = loan.borrowerName?.trim().toLocaleLowerCase("pt-BR");
  if (!nm) return null;
  return managers.find((m) => m.name.trim().toLocaleLowerCase("pt-BR") === nm)?.id ?? null;
}

function getDerivedPaymentCommission(loan: Loan, payment: Payment): number {
  const rate = loan.managerCommissionRate ?? 10;
  const totalCommission = (loan.amount * rate) / 100;
  const perInstallment = totalCommission / Math.max(1, loan.installments);
  if (payment.installmentNumber > 0) return perInstallment;
  if (payment.installmentNumber === 0) return totalCommission;
  if (payment.installmentNumber === -1 && loan.installments === 1) return totalCommission;
  return 0;
}

export function ManagerCommissionsYearlyDialog({
  open, onClose, clients, loans, payments, installmentSchedules,
}: Props) {
  const { commissions } = useManagerCommissions(true);
  const { hidden } = useHideValues();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const managers = useMemo(
    () => clients.filter((c) => c.isManager && c.active !== false).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [clients]
  );

  // Comissões pagas (registradas + derivadas) por mês e gerente para o ano selecionado
  const { rows, managersInYear, totalYear, monthsWithData, topManager } = useMemo(() => {
    // matriz[monthIndex][managerId] = valor
    const matrix: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 12; i++) matrix[String(i)] = {};

    const activeIds = new Set(managers.map((m) => m.id));
    const commissionPaymentKeys = new Set<string>();
    commissions.forEach((c) => { if (c.paymentId) commissionPaymentKeys.add(`${c.loanId}::${c.paymentId}`); });

    commissions.forEach((c) => {
      if (!activeIds.has(c.managerId)) return;
      const d = new Date(c.generatedAt + (c.generatedAt.length > 10 ? "" : "T00:00:00"));
      if (d.getFullYear() !== year) return;
      const mi = d.getMonth();
      matrix[String(mi)][c.managerId] = (matrix[String(mi)][c.managerId] || 0) + c.amount;
    });

    // Derivadas via payments
    const managedLoans = loans
      .map((l) => ({ loan: l, mid: resolveLoanManagerId(l, managers) }))
      .filter(({ mid }) => !!mid);

    managedLoans.forEach(({ loan, mid }) => {
      const loanPayments = payments.filter((p) => p.loanId === loan.id);
      const processed = new Set<number>();
      loanPayments.forEach((p) => {
        const val = getDerivedPaymentCommission(loan, p);
        if (val <= 0) return;
        if (commissionPaymentKeys.has(`${loan.id}::${p.id}`)) return;
        if (processed.has(p.installmentNumber)) return;
        processed.add(p.installmentNumber);
        const d = new Date(p.date + (p.date.length > 10 ? "" : "T00:00:00"));
        if (d.getFullYear() !== year) return;
        const mi = d.getMonth();
        matrix[String(mi)][mid!] = (matrix[String(mi)][mid!] || 0) + val;
      });
    });

    // Descobrir gerentes com valores no ano
    const idsInYear = new Set<string>();
    for (let i = 0; i < 12; i++) {
      Object.entries(matrix[String(i)]).forEach(([id, v]) => { if (v > 0) idsInYear.add(id); });
    }
    const managersInYear = managers.filter((m) => idsInYear.has(m.id));

    const rows = Array.from({ length: 12 }, (_, i) => {
      const row: any = { month: MONTH_LABELS[i], monthFull: MONTH_FULL[i], total: 0 };
      managersInYear.forEach((m) => {
        const v = matrix[String(i)][m.id] || 0;
        row[m.id] = v;
        row.total += v;
      });
      return row;
    });

    const totalYear = rows.reduce((s, r) => s + r.total, 0);
    const monthsWithData = rows.filter((r) => r.total > 0).length;
    // top manager acumulado
    const perManagerYear: Record<string, number> = {};
    managersInYear.forEach((m) => {
      perManagerYear[m.id] = rows.reduce((s, r) => s + (r[m.id] || 0), 0);
    });
    let topId: string | null = null;
    let topVal = 0;
    Object.entries(perManagerYear).forEach(([id, v]) => { if (v > topVal) { topVal = v; topId = id; } });
    const topManager = topId ? { name: managersInYear.find((m) => m.id === topId)?.name ?? "—", value: topVal } : null;

    return { rows, managersInYear, totalYear, monthsWithData, topManager };
  }, [year, commissions, managers, loans, payments]);

  const monthlyAvg = monthsWithData > 0 ? totalYear / monthsWithData : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 sm:px-6 pt-5 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg truncate">Evolução Anual · Comissões por Gerente</DialogTitle>
              <DialogDescription className="text-xs">
                Valor real de comissões pagas em cada mês, agrupado por gerente.
              </DialogDescription>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y - 1)} aria-label="Ano anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[110px] text-center rounded-lg border border-border bg-card px-4 py-1.5">
              <span className="text-lg font-bold text-foreground tabular-nums">{year}</span>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setYear((y) => y + 1)} aria-label="Próximo ano">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {year !== currentYear && (
              <Button variant="ghost" size="sm" className="h-9 text-xs ml-2" onClick={() => setYear(currentYear)}>
                Hoje
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-3 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total anual</p>
              <p className="text-sm sm:text-base font-bold text-success mt-1">{fmtBRL(totalYear, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Média mensal</p>
              <p className="text-sm sm:text-base font-bold text-primary mt-1">{fmtBRL(monthlyAvg, hidden)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Meses com dados</p>
              <p className="text-sm sm:text-base font-bold text-foreground mt-1">{monthsWithData} de 12</p>
            </div>
            <div className="rounded-lg border border-border bg-card/60 p-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Maior comissão</p>
              <p className="text-xs sm:text-sm font-bold text-foreground mt-1 truncate" title={topManager?.name ?? "—"}>
                {topManager?.name ?? "—"}
              </p>
              <p className="text-[10px] sm:text-xs font-semibold text-primary">
                {topManager ? fmtBRL(topManager.value, hidden) : ""}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-2 sm:p-4">
            <div className="w-full h-[340px] sm:h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} minTickGap={0} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={(v: number) => fmtCompactBRL(v)} width={70} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d: any = payload[0].payload;
                      return (
                        <div className="rounded-md border border-border bg-popover shadow-lg p-3 text-xs min-w-[180px]">
                          <div className="font-semibold text-foreground mb-1.5">{d.monthFull}</div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Comissões pagas</span>
                            <span className="font-bold text-primary">{fmtBRL(d.total, hidden)}</span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="total"
                    name="Comissões pagas"
                    fill={BAR_COLOR}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    animationDuration={600}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {managersInYear.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">Sem comissões registradas em {year}.</p>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground text-center italic">
            Passe o mouse (ou toque) sobre um mês para ver a participação de cada gerente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
