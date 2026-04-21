import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { buildClientRiskHistory, buildRiskProfile, formatRiskCurrency, getClientLoans, getClientRiskMetrics } from "@/lib/clientRisk";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

export function ClientDetailDialog({ open, onOpenChange, client, loans, payments, installmentSchedules }: Props) {
  const clientLoans = useMemo(() => (client ? getClientLoans(client, loans) : []), [client, loans]);
  const riskProfile = useMemo(() => (client ? buildRiskProfile(client, loans, payments, installmentSchedules) : null), [client, loans, payments, installmentSchedules]);
  const metrics = useMemo(() => (client ? getClientRiskMetrics(client, loans, payments, installmentSchedules) : null), [client, loans, payments, installmentSchedules]);
  const history = useMemo(() => (client ? buildClientRiskHistory(client, loans, payments, installmentSchedules) : []), [client, loans, payments, installmentSchedules]);

  if (!client || !riskProfile || !metrics) return null;

  const totalReceived = clientLoans.reduce((sum, loan) => sum + payments.filter((payment) => payment.loanId === loan.id).reduce((acc, payment) => acc + payment.amount, 0), 0);
  const scoreProgress = riskProfile.score;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{client.name}</DialogTitle>
            <Badge variant="outline" className={riskProfile.badgeClassName}>{riskProfile.label}</Badge>
            {client.active !== false ? <Badge variant="outline" className="bg-success/10 text-success border-success/20">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
          </div>
          <DialogDescription>
            Histórico completo de risco, atrasos, pagamentos em dia e evolução mensal do score.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4">
          <section className="space-y-4">
            <Card no3d>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm text-muted-foreground">Score de risco atual</p>
                    <div className="flex items-end gap-3 mt-1">
                      <span className="text-4xl font-bold text-foreground">{riskProfile.score}</span>
                      <span className="text-sm text-muted-foreground mb-1">/ 100</span>
                    </div>
                  </div>
                  <div className="min-w-[220px] flex-1 max-w-sm">
                    <Progress value={scoreProgress} className="h-2.5" />
                    <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
                      <span>baixo</span>
                      <span>moderado</span>
                      <span>crítico</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MetricCard icon={Wallet} label="Total emprestado" value={formatRiskCurrency(metrics.totalLent)} />
                  <MetricCard icon={CheckCircle2} label="Pagamentos em dia" value={String(metrics.onTimePayments)} helper={`${Math.round(metrics.onTimeRatio * 100)}% de pontualidade`} />
                  <MetricCard icon={AlertTriangle} label="Pagamentos em atraso" value={String(metrics.latePayments)} helper={`${Math.round(metrics.lateRatio * 100)}% do histórico`} tone="alert" />
                  <MetricCard icon={CalendarClock} label="Contratos em atraso" value={String(metrics.overdueLoans)} helper={metrics.severeOverdueLoans > 0 ? `${metrics.severeOverdueLoans} com 30+ dias` : "Sem atrasos longos"} tone={metrics.overdueLoans > 0 ? "alert" : "default"} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/30 p-4 bg-muted/20">
                    <p className="text-sm font-medium text-foreground mb-2">Motivos do score</p>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {riskProfile.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-border/30 p-4 bg-muted/20">
                    <p className="text-sm font-medium text-foreground mb-2">Resumo operacional</p>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between"><span>Contratos ativos</span><span className="font-medium text-foreground">{metrics.activeLoans}</span></div>
                      <div className="flex items-center justify-between"><span>Contratos quitados</span><span className="font-medium text-foreground">{metrics.paidLoans}</span></div>
                      <div className="flex items-center justify-between"><span>Pagamentos parciais</span><span className="font-medium text-foreground">{metrics.partialPayments}</span></div>
                      <div className="flex items-center justify-between"><span>Total recebido</span><span className="font-medium text-foreground">{formatRiskCurrency(totalReceived)}</span></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card no3d>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Evolução do score</h3>
                    <p className="text-sm text-muted-foreground">Trajetória mensal do risco considerando o histórico acumulado.</p>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{history.length} meses</Badge>
                </div>
                <ChartContainer
                  className="h-[280px] w-full"
                  config={{
                    score: { label: "Score", color: "hsl(var(--primary))" },
                    atraso: { label: "Atrasos", color: "hsl(var(--destructive))" },
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis tickLine={false} axisLine={false} width={34} domain={[0, 100]} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <Card no3d>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-base font-semibold text-foreground">Linha do tempo recente</h3>
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {history.slice(-6).reverse().map((point) => (
                    <div key={point.month} className="rounded-xl border border-border/30 p-3 bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground uppercase">{point.label}</span>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{point.score}/100</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                        <div>Em dia: <span className="text-foreground font-medium">{point.onTimePayments}</span></div>
                        <div>Atrasos: <span className="text-foreground font-medium">{point.latePayments}</span></div>
                        <div>Contratos em atraso: <span className="text-foreground font-medium">{point.overdueLoans}</span></div>
                        <div>Total emprestado: <span className="text-foreground font-medium">{formatRiskCurrency(point.totalLent)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card no3d>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-base font-semibold text-foreground">Cadastro</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {client.phone && <div className="flex items-center justify-between gap-3"><span>Telefone</span><span className="text-foreground">{client.phone}</span></div>}
                  {client.email && <div className="flex items-center justify-between gap-3"><span>E-mail</span><span className="text-foreground">{client.email}</span></div>}
                  {client.cpf && <div className="flex items-center justify-between gap-3"><span>CPF</span><span className="text-foreground">{client.cpf}</span></div>}
                  {client.address && <div className="flex items-center justify-between gap-3"><span>Endereço</span><span className="text-foreground text-right">{client.address}</span></div>}
                  {client.score && <div className="flex items-center justify-between gap-3"><span>Score cadastral</span><span className="text-foreground">{client.score}</span></div>}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone = "default" }: { icon: typeof ShieldCheck; label: string; value: string; helper?: string; tone?: "default" | "alert" }) {
  return (
    <div className="rounded-xl border border-border/30 p-3 bg-muted/20">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        <Icon className={tone === "alert" ? "h-4 w-4 text-destructive" : "h-4 w-4 text-primary"} />
        <span>{label}</span>
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
      {helper ? <p className="text-[11px] text-muted-foreground mt-1">{helper}</p> : null}
    </div>
  );
}