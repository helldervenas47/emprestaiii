import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

export interface CategoryEntry {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  type: "receita" | "despesa";
  account?: string | null;
  status?: "paid" | "pending" | "overdue";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  entries: CategoryEntry[];
  total: number;
}

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  return new Date(y, m - 1, day).toLocaleDateString("pt-BR");
}

export function CategoryDetailsSheet({ open, onOpenChange, categoryName, entries, total }: Props) {
  const isMobile = useIsMobile();

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [entries],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[85vh] rounded-t-2xl flex flex-col p-0"
            : "w-full sm:max-w-md flex flex-col p-0"
        }
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
          <SheetTitle className="text-base text-foreground">{categoryName}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-xs text-muted-foreground">Total acumulado</div>
                <div className="text-lg font-semibold text-foreground">{fmtBRL(total)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Lançamentos</div>
                <div className="text-lg font-semibold text-foreground">{sorted.length}</div>
              </div>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum lançamento encontrado.
            </p>
          ) : (
            sorted.map((e) => {
              const isIncome = e.type === "receita";
              const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
              return (
                <div
                  key={e.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
                >
                  <div
                    className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-foreground truncate">
                        {e.description || "Sem descrição"}
                      </div>
                      <div
                        className={`text-sm font-semibold shrink-0 ${
                          isIncome ? "text-emerald-500" : "text-rose-500"
                        }`}
                      >
                        {isIncome ? "+" : "-"} {fmtBRL(e.amount)}
                      </div>
                    </div>
                    <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{fmtDate(e.date)}</span>
                      {e.status && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                            e.status === "paid"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : e.status === "overdue"
                                ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {e.status === "paid" ? "Pago" : e.status === "overdue" ? "Atrasado" : "Pendente"}
                        </span>
                      )}
                      {e.account && <span className="truncate">{e.account}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
