import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, RefreshCw, AlertTriangle, ChevronDown, TrendingUp, Lightbulb, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { usePersonalInsights } from "@/hooks/usePersonalInsights";
import { getPersonalCategory } from "@/lib/personalExpenseCategories";
import { cn } from "@/lib/utils";

export interface CategoryStat {
  category: string;
  spent: number;
  budget: number;
}

interface Props {
  /** YYYY-MM */
  month: string;
  /** Categories that are currently exceeding their budget — used to auto-refresh on changes. */
  exceededCategories: string[];
  /** True when there's at least one expense in the month — avoids generating on empty months. */
  hasExpenses: boolean;
  /** Per-category spend vs budget — drives the "Oportunidades" cards. */
  categoryStats: CategoryStat[];
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * Parse the AI markdown to extract per-category bullet lines from the
 * "💡 Oportunidades de redução" section. We match a category name appearing
 * in bold (**Categoria**) or as the first word(s) of the bullet.
 */
function extractCategorySuggestions(content: string, categories: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const sections = content.split(/(?=^##\s)/m);
  const oppSection = sections.find((s) => /##\s.*Oportunidades/i.test(s)) || "";
  const bullets = oppSection
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, ""));

  for (const bullet of bullets) {
    for (const cat of categories) {
      const lower = bullet.toLowerCase();
      if (lower.includes(cat.toLowerCase())) {
        const arr = map.get(cat) || [];
        arr.push(bullet);
        map.set(cat, arr);
        break;
      }
    }
  }
  return map;
}

export function PersonalAIInsightsCard({
  month,
  exceededCategories,
  hasExpenses,
  categoryStats = [],
}: Props) {
  const { data, loading, error, generate } = usePersonalInsights(month);
  const lastAutoKeyRef = useRef<string | null>(null);
  const [hasAutoTried, setHasAutoTried] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Auto-generate on open (once per month) if no cached version, and on exceeded changes
  useEffect(() => {
    if (!hasExpenses) return;
    const key = `${month}|${exceededCategories.sort().join(",")}`;
    if (!hasAutoTried && !data && !loading) {
      setHasAutoTried(true);
      lastAutoKeyRef.current = key;
      generate(false).catch(() => { /* surface via toast below */ });
      return;
    }
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

  // Per-category AI suggestions
  const suggestionsByCat = useMemo(() => {
    if (!data?.content) return new Map<string, string[]>();
    return extractCategorySuggestions(
      data.content,
      categoryStats.map((s) => s.category),
    );
  }, [data?.content, categoryStats]);

  // Sort: exceeded first, then highest pct, then any with budget > 0, then with spend
  const sortedStats = useMemo(() => {
    return [...categoryStats]
      .filter((s) => s.spent > 0 || s.budget > 0)
      .map((s) => ({
        ...s,
        pct: s.budget > 0 ? (s.spent / s.budget) * 100 : 0,
        over: s.budget > 0 && s.spent > s.budget,
        hasSuggestion: suggestionsByCat.has(s.category),
      }))
      .sort((a, b) => {
        // Exceeded > has suggestion > highest pct > highest spend
        if (a.over !== b.over) return a.over ? -1 : 1;
        if (a.hasSuggestion !== b.hasSuggestion) return a.hasSuggestion ? -1 : 1;
        if (a.budget > 0 && b.budget > 0) return b.pct - a.pct;
        return b.spent - a.spent;
      });
  }, [categoryStats, suggestionsByCat]);

  if (!hasExpenses) return null;

  // Markdown content for the "Último Relatório" subcard (everything except Oportunidades)
  const restContent = data
    ? data.content
        .split(/(?=^##\s)/m)
        .filter((s) => !/##\s.*Oportunidades/i.test(s))
        .join("")
        .trim()
    : "";

  const proseClasses = `prose prose-sm dark:prose-invert max-w-none
    prose-headings:text-foreground prose-p:text-foreground
    prose-strong:text-foreground prose-li:text-foreground
    prose-h2:text-sm prose-h2:font-semibold prose-h2:mt-2 prose-h2:mb-1
    prose-p:my-1 prose-ul:my-1 prose-li:my-0.5`;

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

        {data && (
          <div className="grid gap-3 lg:grid-cols-2">
            {/* Subcard 1: Último Relatório Gerado */}
            <div className="rounded-lg border border-border bg-card/50 p-3 space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Último Relatório Gerado
                </h4>
              </div>
              <div className={proseClasses}>
                <ReactMarkdown>{restContent || data.content}</ReactMarkdown>
              </div>
              {data.generated_at && (
                <p className="text-[10px] text-muted-foreground pt-1">
                  Gerado em {new Date(data.generated_at).toLocaleString("pt-BR")}
                  {data.cached ? " (em cache)" : ""}
                </p>
              )}
            </div>

            {/* Subcard 2: Oportunidades por Categoria — card grid */}
            <div className="rounded-lg border border-primary/30 bg-gradient-to-br from-primary/5 to-accent/5 p-3 space-y-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Lightbulb className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Oportunidades por Categoria
                </h4>
              </div>

              {sortedStats.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  Nenhuma categoria com dados suficientes neste mês.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sortedStats.map((s) => {
                    const cat = getPersonalCategory(s.category);
                    const Icon = cat.icon;
                    const isOpen = expandedCat === s.category;
                    const suggestions = suggestionsByCat.get(s.category) || [];
                    const barPct = Math.min(100, s.pct);
                    const barColor = s.over
                      ? "bg-destructive"
                      : "bg-[hsl(210_85%_55%)]";

                    return (
                      <button
                        key={s.category}
                        type="button"
                        onClick={() => setExpandedCat(isOpen ? null : s.category)}
                        className={cn(
                          "group text-left rounded-lg border bg-card p-2.5 transition-all duration-300",
                          "hover:shadow-md hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                          s.over ? "border-destructive/40" : "border-border",
                          isOpen && "sm:col-span-2 ring-1 ring-primary/30",
                        )}
                        aria-expanded={isOpen}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `hsl(${cat.color} / 0.15)`,
                                color: `hsl(${cat.color})`,
                              }}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {s.category}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {fmt(s.spent)}
                                {s.budget > 0 ? ` / ${fmt(s.budget)}` : " · sem limite"}
                              </p>
                            </div>
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-300",
                              isOpen && "rotate-180",
                            )}
                          />
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2 space-y-0.5">
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-500", barColor)}
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className={cn(s.over ? "text-destructive font-medium" : "text-muted-foreground")}>
                              {s.budget > 0 ? `${s.pct.toFixed(0)}% do limite` : "—"}
                            </span>
                            {s.over && (
                              <span className="text-destructive font-medium inline-flex items-center gap-0.5">
                                <TrendingUp className="h-2.5 w-2.5" /> Estourado
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expandable details */}
                        <div
                          className={cn(
                            "grid transition-all duration-300 ease-in-out",
                            isOpen ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0",
                          )}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-border pt-2 space-y-2 text-[11px]">
                              <div>
                                <p className="font-semibold text-foreground flex items-center gap-1 mb-1">
                                  <Lightbulb className="h-3 w-3 text-primary" /> Sugestões da IA
                                </p>
                                {suggestions.length > 0 ? (
                                  <ul className="list-disc pl-4 space-y-0.5 text-foreground/90">
                                    {suggestions.map((sug, i) => (
                                      <li key={i}>
                                        <ReactMarkdown
                                          components={{ p: ({ children }) => <span>{children}</span> }}
                                        >
                                          {sug}
                                        </ReactMarkdown>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-muted-foreground">
                                    Sem recomendação específica da IA para esta categoria.
                                  </p>
                                )}
                              </div>

                              <div>
                                <p className="font-semibold text-foreground mb-0.5">Resumo</p>
                                <p className="text-muted-foreground">
                                  Você gastou <span className="text-foreground font-medium">{fmt(s.spent)}</span>
                                  {s.budget > 0 ? (
                                    <>
                                      {" "}de um limite de{" "}
                                      <span className="text-foreground font-medium">{fmt(s.budget)}</span>
                                      {s.over ? (
                                        <>
                                          , <span className="text-destructive font-medium">
                                            {fmt(s.spent - s.budget)} acima
                                          </span>.
                                        </>
                                      ) : (
                                        <>
                                          {" "}({fmt(Math.max(0, s.budget - s.spent))} disponível).
                                        </>
                                      )}
                                    </>
                                  ) : (
                                    <> neste mês. Defina um limite para acompanhar a evolução.</>
                                  )}
                                </p>
                              </div>

                              <div>
                                <p className="font-semibold text-foreground mb-0.5">Ação recomendada</p>
                                <p className="text-muted-foreground">
                                  {s.over
                                    ? `Revise os lançamentos de ${s.category} deste mês e ajuste o limite ou corte despesas não essenciais.`
                                    : s.budget === 0
                                    ? `Defina um orçamento mensal para ${s.category} para evitar surpresas.`
                                    : s.pct >= 80
                                    ? `Você está perto do limite. Evite novos gastos não essenciais até o fim do mês.`
                                    : `Categoria sob controle — continue monitorando.`}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
