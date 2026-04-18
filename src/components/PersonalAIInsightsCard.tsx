import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { usePersonalInsights } from "@/hooks/usePersonalInsights";

interface Props {
  /** YYYY-MM */
  month: string;
  /** Categories that are currently exceeding their budget — used to auto-refresh on changes. */
  exceededCategories: string[];
  /** True when there's at least one expense in the month — avoids generating on empty months. */
  hasExpenses: boolean;
}

export function PersonalAIInsightsCard({ month, exceededCategories, hasExpenses }: Props) {
  const { data, loading, error, generate } = usePersonalInsights(month);
  const lastAutoKeyRef = useRef<string | null>(null);
  const [hasAutoTried, setHasAutoTried] = useState(false);

  // Auto-generate on open (once per month) if no cached version, and on exceeded changes
  useEffect(() => {
    if (!hasExpenses) return;
    const key = `${month}|${exceededCategories.sort().join(",")}`;
    // First load: generate if no cache
    if (!hasAutoTried && !data && !loading) {
      setHasAutoTried(true);
      lastAutoKeyRef.current = key;
      generate(false).catch(() => { /* surface via toast below */ });
      return;
    }
    // Exceeded set changed → regenerate
    if (data && lastAutoKeyRef.current && lastAutoKeyRef.current !== key) {
      const prevExceeded = lastAutoKeyRef.current.split("|")[1];
      const currExceeded = exceededCategories.sort().join(",");
      if (prevExceeded !== currExceeded) {
        lastAutoKeyRef.current = key;
        generate(true).catch(() => { /* ignore */ });
      }
    }
    if (!lastAutoKeyRef.current) lastAutoKeyRef.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, exceededCategories.join(","), data, hasExpenses]);

  const handleRefresh = async () => {
    try {
      await generate(true);
      toast.success("Relatório atualizado");
    } catch (e: any) {
      toast.error("Falha ao gerar relatório", { description: e?.message });
    }
  };

  if (!hasExpenses) return null;

  return (
    <Card no3d className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground">
                Relatório Inteligente
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Análise gerada por IA com base nos seus gastos do mês
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
            className="shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline ml-1">Atualizar</span>
          </Button>
        </div>

        {exceededCategories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-muted-foreground">Categorias estouradas:</span>
            {exceededCategories.map((c) => (
              <Badge key={c} variant="destructive" className="text-[10px] py-0 px-1.5">
                {c}
              </Badge>
            ))}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground gap-2">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            Gerando análise inteligente…
          </div>
        )}

        {error && !data && (
          <div className="text-sm text-destructive p-3 rounded-md bg-destructive/10">
            {error}
          </div>
        )}

        {data && (() => {
          // Split markdown by H2 sections, isolating "Oportunidades de redução"
          const sections = data.content.split(/(?=^##\s)/m);
          const opportunities = sections.find((s) => /##\s.*Oportunidades/i.test(s)) || "";
          const rest = sections.filter((s) => !/##\s.*Oportunidades/i.test(s)).join("");
          const proseClasses = `prose prose-sm dark:prose-invert max-w-none
            prose-headings:text-foreground prose-p:text-foreground
            prose-strong:text-foreground prose-li:text-foreground
            prose-h2:text-sm prose-h2:font-semibold prose-h2:mt-2 prose-h2:mb-1
            prose-p:my-1 prose-ul:my-1 prose-li:my-0.5`;
          return (
            <div className="grid gap-3 md:grid-cols-2">
              {/* Subcard 1: Último Relatório Gerado */}
              <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Último Relatório Gerado
                  </h4>
                </div>
                <div className={proseClasses}>
                  <ReactMarkdown>{rest.trim() || data.content}</ReactMarkdown>
                </div>
                {data.generated_at && (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Gerado em {new Date(data.generated_at).toLocaleString("pt-BR")}
                    {data.cached ? " (em cache)" : ""}
                  </p>
                )}
              </div>

              {/* Subcard 2: Oportunidades por Categoria */}
              <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-3 space-y-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Oportunidades por Categoria
                  </h4>
                </div>
                {opportunities ? (
                  <div className={proseClasses}>
                    <ReactMarkdown>{opportunities.replace(/^##\s.*\n?/, "").trim()}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    Nenhuma oportunidade de redução destacada pela IA neste mês.
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
