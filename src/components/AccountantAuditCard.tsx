import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, CheckCircle2, History, Loader2 } from "lucide-react";
import { runAccountantAudit, type AuditReport, type AuditTotals } from "@/lib/accountantAudit";
import { useAccountantAuditLogs } from "@/hooks/useAccountantAuditLogs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Props {
  loans: any[];
  payments: any[];
  sales: any[];
  expenses: any[];
  period: "month" | "year";
  monthFilter: string;
  yearFilter: string;
  shown: AuditTotals;
}

const fmt = (n: number) =>
  (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AccountantAuditCard(props: Props) {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [running, setRunning] = useState(false);
  const { logs, saveAudit } = useAccountantAuditLogs();

  const handleAudit = async () => {
    setRunning(true);
    try {
      const r = runAccountantAudit(props);
      setReport(r);
      await saveAudit(r);
      if (r.issues.length === 0) {
        toast.success(`Tudo certo! Confiabilidade: ${r.confidenceScore}%`);
      } else {
        toast.warning(`${r.issues.length} divergência(s) encontrada(s) — confiabilidade ${r.confidenceScore}%`);
      }
    } catch (e) {
      console.error(e);
      toast.error("Falha ao executar auditoria");
    } finally {
      setRunning(false);
    }
  };

  const scoreColor = useMemo(() => {
    const s = report?.confidenceScore ?? 100;
    if (s >= 95) return "text-emerald-600 dark:text-emerald-400";
    if (s >= 80) return "text-yellow-600 dark:text-yellow-400";
    return "text-destructive";
  }, [report]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Auditoria de Dados
          </CardTitle>
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4 mr-1" /> Histórico ({logs.length})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Histórico de Auditorias</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-3">
                  {logs.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma auditoria executada ainda.</p>
                  )}
                  {logs.map((l) => (
                    <div key={l.id} className="border rounded-md p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {new Date(l.executed_at).toLocaleString("pt-BR")}
                        </span>
                        <Badge variant={l.confidence_score >= 95 ? "default" : l.confidence_score >= 80 ? "secondary" : "destructive"}>
                          {l.confidence_score}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Período: {l.period_start} → {l.period_end}
                      </p>
                      <p className="text-xs mt-1">
                        {l.issues.length} problema(s) · {l.corrections.length} correção(ões) sugerida(s)
                      </p>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            <Button size="sm" onClick={handleAudit} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
              Auditar Dados
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-sm text-muted-foreground">
            Clique em <strong>Auditar Dados</strong> para validar os números desta aba contra a fonte
            (empréstimos, pagamentos, despesas e renegociações). Aportes nunca são contados como receita ou despesa.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`text-3xl font-bold ${scoreColor}`}>
                {report.confidenceScore}%
              </div>
              <div className="text-sm text-muted-foreground">
                consistente · executado em {new Date(report.executedAt).toLocaleString("pt-BR")}
              </div>
            </div>

            {report.issues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Todos os totais batem com a origem.
              </div>
            ) : (
              <ScrollArea className="max-h-72 pr-3">
                <ul className="space-y-2">
                  {report.issues.map((it, i) => (
                    <li key={i} className="border rounded-md p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`h-4 w-4 mt-0.5 ${it.severity === "error" ? "text-destructive" : "text-yellow-500"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium">{it.metric}</span>
                            <Badge variant={it.severity === "error" ? "destructive" : "secondary"}>
                              {it.severity === "error" ? "Erro" : "Aviso"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Origem: {it.origin}</p>
                          <p className="text-xs mt-1">
                            Esperado <strong>{fmt(it.expected)}</strong> · Exibido <strong>{fmt(it.shown)}</strong> · Diferença <strong className={it.diff > 0 ? "text-destructive" : "text-emerald-600"}>{fmt(it.diff)}</strong>
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}

            {report.corrections.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 text-xs">
                🔧 As métricas acima já são apresentadas com o valor recalculado a partir da origem.
                Nenhum dado original foi alterado.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
