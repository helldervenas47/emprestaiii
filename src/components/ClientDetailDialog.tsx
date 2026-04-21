import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Client, InstallmentSchedule, Loan, Payment } from "@/types/loan";
import { buildClientRiskHistory, buildConsolidatedRiskProfile, formatRiskCurrency, getClientRiskMetrics } from "@/lib/clientRisk";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ClientRiskSummaryCard } from "@/components/client-detail/ClientRiskSummaryCard";
import { useClientFinancialAnalysis } from "@/hooks/useClientFinancialAnalysis";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client | null;
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
}

export function ClientDetailDialog({ open, onOpenChange, client, loans, payments, installmentSchedules }: Props) {
  const { profile: financialProfile, events } = useClientFinancialAnalysis(client?.id);
  const riskProfile = useMemo(() => (client ? buildConsolidatedRiskProfile(client, loans, payments, installmentSchedules, financialProfile) : null), [client, loans, payments, installmentSchedules, financialProfile]);
  const metrics = useMemo(() => (client ? getClientRiskMetrics(client, loans, payments, installmentSchedules) : null), [client, loans, payments, installmentSchedules]);
  const history = useMemo(() => (client ? buildClientRiskHistory(client, loans, payments, installmentSchedules) : []), [client, loans, payments, installmentSchedules]);
  const analysisTimeline = useMemo(() => {
    const items = events.map((event) => {
      const metadata = event.metadata ?? {};
      const details = [
        typeof metadata.consolidated_score === "number" ? `Score: ${metadata.consolidated_score}` : null,
        typeof metadata.expires_at === "string" ? `Validade: ${formatDateTime(metadata.expires_at)}` : null,
      ].filter(Boolean) as string[];

      return {
        id: `event-${event.id}`,
        date: event.createdAt,
        title: formatAnalysisEventTitle(event.eventType),
        status: formatAnalysisStatus(event.status),
        tone: getAnalysisTone(event.status),
        description: event.message || "Evento registrado na análise financeira.",
        details,
      };
    });

    if (financialProfile?.fetchedAt) {
      items.push({
        id: "snapshot-fetched",
        date: financialProfile.fetchedAt,
        title: "Snapshot consolidado atualizado",
        status: formatAnalysisStatus(financialProfile.analysisStatus),
        tone: getAnalysisTone(financialProfile.analysisStatus),
        description: "Os dados financeiros consolidados foram sincronizados e estão disponíveis para consulta.",
        details: [financialProfile.consolidatedScore != null ? `Score consolidado: ${financialProfile.consolidatedScore}` : null].filter(Boolean) as string[],
      });
    }

    if (financialProfile?.expiresAt) {
      const isExpired = new Date(financialProfile.expiresAt).getTime() <= Date.now();
      items.push({
        id: "snapshot-expiration",
        date: financialProfile.expiresAt,
        title: isExpired ? "Análise expirada" : "Expiração programada",
        status: isExpired ? "Expirada" : "Vigente",
        tone: isExpired ? "error" : "info",
        description: isExpired
          ? "A validade da análise financeira expirou e uma nova consulta pode ser necessária."
          : "A análise atual permanece válida até a data indicada.",
        details: financialProfile.fetchedAt ? [`Última consulta: ${formatDateTime(financialProfile.fetchedAt)}`] : [],
      });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [events, financialProfile]);

  if (!client || !riskProfile || !metrics) return null;

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
              <CardContent className="p-0">
                <ClientRiskSummaryCard metrics={metrics} riskProfile={riskProfile} />
              </CardContent>
            </Card>

            <Card no3d>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Evolução do score</h3>
                     <p className="text-sm text-muted-foreground">Trajetória mensal do Score Atual com base histórica acumulada.</p>
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
                  <LineChart data={history} margin={{ left: 8, right: 8, top: 16, bottom: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} width={34} domain={[0, 100]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4">
            <Card no3d>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">Timeline da análise financeira</h3>
                    <p className="text-sm text-muted-foreground">Consultas, falhas e validade da análise deste cliente.</p>
                  </div>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">{analysisTimeline.length} eventos</Badge>
                </div>
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {analysisTimeline.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border/30 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{item.title}</span>
                        <Badge variant="outline" className={item.tone === "error" ? "bg-destructive/10 text-destructive border-destructive/20" : item.tone === "success" ? "bg-success/10 text-success border-success/20" : "bg-primary/10 text-primary border-primary/20"}>{item.status}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{formatDateTime(item.date)}</p>
                      <p className="text-xs leading-relaxed text-muted-foreground mt-2">{item.description}</p>
                      {item.details.length > 0 ? (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {item.details.map((detail) => (
                            <span key={detail} className="rounded-md border border-border/40 bg-background px-2 py-1 text-[11px] text-muted-foreground">
                              {detail}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {analysisTimeline.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/40 p-4 text-sm text-muted-foreground">
                      Nenhum evento de análise financeira registrado para este cliente até o momento.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card no3d>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-base font-semibold text-foreground">Resumo mensal do relacionamento</h3>
                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {history.slice(-6).reverse().map((point) => (
                    <div key={point.month} className="rounded-xl border border-border/30 p-3 bg-muted/20">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground uppercase">{point.label}</span>
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Atual {point.score}/100</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-muted-foreground">
                        <div>Histórico: <span className="text-foreground font-medium">{point.historicalScore}/150</span></div>
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

function formatAnalysisEventTitle(eventType: string) {
  const titles: Record<string, string> = {
    manual_refresh: "Consulta manual solicitada",
    auto_sync: "Consulta automática iniciada",
    sync_completed: "Consulta concluída",
    sync_failed: "Falha na consulta",
    analysis_expiration_scheduled: "Validade da análise definida",
  };

  return titles[eventType] ?? eventType.replace(/_/g, " ");
}

function formatAnalysisStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendente",
    success: "Sucesso",
    error: "Falha",
    info: "Info",
    verified: "Verificada",
    stale: "Expirada",
    unavailable: "Indisponível",
  };

  return labels[status] ?? status;
}

function getAnalysisTone(status: string) {
  if (["error", "unavailable", "stale"].includes(status)) return "error" as const;
  if (["success", "verified"].includes(status)) return "success" as const;
  return "info" as const;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}