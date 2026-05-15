import { useMemo, useState, useCallback } from "react";
import { Loan, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateTotalWithInterest } from "@/hooks/useLoans";
import { Search, Users, BarChart3, ArrowUpDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  loans: Loan[];
  payments: Payment[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface ClientRow {
  name: string;
  borrowed: number;
  paid: number;
  pending: number;
  total: number;
  interestRate: number;
}

type SortOption =
  | "name-asc"
  | "name-desc"
  | "borrowed-desc"
  | "borrowed-asc"
  | "paid-desc"
  | "paid-asc"
  | "pending-desc"
  | "pending-asc"
  | "total-desc"
  | "total-asc"
  | "rate-desc"
  | "rate-asc";

export function ClientLoanHistory({ loans, payments }: Props) {
  const [search, setSearch] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const { hidden } = useHideValues();

  const rows = useMemo<ClientRow[]>(() => {
    const byName: Record<string, Loan[]> = {};
    loans.forEach((l) => {
      const key = l.borrowerName?.trim() || "—";
      (byName[key] ??= []).push(l);
    });

    const out: ClientRow[] = Object.entries(byName).map(([name, clientLoans]) => {
      let borrowed = 0;
      let paid = 0;
      let pending = 0;

      clientLoans.forEach((l) => {
        borrowed += l.amount || 0;
        const loanPayments = payments.filter((p) => p.loanId === l.id);
        const totalPaid = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);
        paid += totalPaid;

        if (l.status === "paid") {
          // No pending
        } else {
          const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
          const remaining = l.remainingAmount != null && l.remainingAmount > 0
            ? l.remainingAmount
            : Math.max(0, expected - totalPaid);
          pending += remaining;
        }
      });

      const total = paid + pending;
      const interestRate = borrowed > 0 ? ((total - borrowed) / borrowed) * 100 : 0;

      return {
        name,
        borrowed,
        paid,
        pending,
        total,
        interestRate,
      };
    });

    const filtered = search.trim()
      ? out.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))
      : out;

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "name-asc": return a.name.localeCompare(b.name, "pt-BR");
        case "name-desc": return b.name.localeCompare(a.name, "pt-BR");
        case "borrowed-desc": return b.borrowed - a.borrowed;
        case "borrowed-asc": return a.borrowed - b.borrowed;
        case "paid-desc": return b.paid - a.paid;
        case "paid-asc": return a.paid - b.paid;
        case "pending-desc": return b.pending - a.pending;
        case "pending-asc": return a.pending - b.pending;
        case "total-desc": return b.total - a.total;
        case "total-asc": return a.total - b.total;
        case "rate-desc": return b.interestRate - a.interestRate;
        case "rate-asc": return a.interestRate - b.interestRate;
        default: return a.name.localeCompare(b.name, "pt-BR");
      }
    });
  }, [loans, payments, search, sortBy]);

  // Cache: payments grouped by loanId — avoids re-filtering for each expanded client
  const paymentsByLoan = useMemo(() => {
    const map: Record<string, number> = {};
    payments.forEach((p) => {
      map[p.loanId] = (map[p.loanId] ?? 0) + (p.amount || 0);
    });
    return map;
  }, [payments]);

  // Cache: loans grouped by client name and pre-sorted by startDate ASC (oldest → newest)
  const loansByClient = useMemo(() => {
    const map: Record<string, Loan[]> = {};
    loans.forEach((l) => {
      const key = l.borrowerName?.trim() || "—";
      (map[key] ??= []).push(l);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const da = a.startDate ? new Date(a.startDate).getTime() : 0;
        const db = b.startDate ? new Date(b.startDate).getTime() : 0;
        return da - db;
      });
    });
    return map;
  }, [loans]);

  const totals = useMemo(() => {
    const totalPending = rows.reduce((s, r) => s + r.pending, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    const totalBorrowed = rows.reduce((s, r) => s + r.borrowed, 0);
    const grandTotal = totalPaid + totalPending;
    const clientCount = rows.length;
    const avgInterestRate = totalBorrowed > 0 ? ((grandTotal - totalBorrowed) / totalBorrowed) * 100 : 0;
    return { totalPending, totalPaid, totalBorrowed, grandTotal, clientCount, avgInterestRate };
  }, [rows]);

  const mask = (v: string) => (hidden ? "•••" : v);

  if (loans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">Nenhum cliente com empréstimos</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-full md:w-[240px] h-10 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue placeholder="Ordenar por..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Cliente (A → Z)</SelectItem>
              <SelectItem value="name-desc">Cliente (Z → A)</SelectItem>
              <SelectItem value="borrowed-desc">Maior valor emprestado</SelectItem>
              <SelectItem value="borrowed-asc">Menor valor emprestado</SelectItem>
              <SelectItem value="paid-desc">Maior valor pago</SelectItem>
              <SelectItem value="paid-asc">Menor valor pago</SelectItem>
              <SelectItem value="pending-desc">Maior valor pendente</SelectItem>
              <SelectItem value="pending-asc">Menor valor pendente</SelectItem>
              <SelectItem value="total-desc">Maior valor total</SelectItem>
              <SelectItem value="total-asc">Menor valor total</SelectItem>
              <SelectItem value="rate-desc">Maior taxa de juros</SelectItem>
              <SelectItem value="rate-asc">Menor taxa de juros</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSummary((s) => !s)}
            className="shrink-0 gap-1"
          >
            <BarChart3 className="h-4 w-4" />
            Resumo
          </Button>
        </div>
      </div>

      {showSummary && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="text-sm text-muted-foreground mb-1">Pendente</div>
              <div className="font-bold tabular-nums text-warning text-xl">
                {mask(formatCurrency(totals.totalPending))}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="text-sm text-muted-foreground mb-1">Pago</div>
              <div className="font-bold tabular-nums text-success text-xl">
                {mask(formatCurrency(totals.totalPaid))}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="text-sm text-muted-foreground mb-1">Emprestado</div>
              <div className="font-bold tabular-nums text-xl">
                {mask(formatCurrency(totals.totalBorrowed))}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="text-sm text-muted-foreground mb-1">Total</div>
              <div className="font-bold tabular-nums text-xl">
                {mask(formatCurrency(totals.grandTotal))}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="text-sm text-muted-foreground mb-1">Qtd. Clientes</div>
              <div className="font-bold tabular-nums text-primary text-xl">
                {totals.clientCount}
              </div>
            </CardContent>
          </Card>
          <Card className="h-full">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="text-sm text-muted-foreground mb-1">Taxa de Juros Média</div>
              <div className="font-bold tabular-nums text-primary text-xl">
                {hidden ? "•••" : `${totals.avgInterestRate.toFixed(2).replace(".", ",")}%`}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loans details renderer (cached lookup, no recompute on toggle) */}
      {/* Inline helper kept here for clarity */}

      {/* Desktop / Tablet — Table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Emprestado</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Taxa de Juros</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = !!expanded[r.name];
                return (
                  <>
                    <TableRow
                      key={r.name}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => toggleExpanded(r.name)}
                    >
                      <TableCell className="w-8">
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{mask(formatCurrency(r.borrowed))}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{mask(formatCurrency(r.paid))}</TableCell>
                      <TableCell className="text-right tabular-nums text-warning">{mask(formatCurrency(r.pending))}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{mask(formatCurrency(r.total))}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary font-medium">
                        {hidden ? "•••" : `${r.interestRate.toFixed(2).replace(".", ",")}%`}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${r.name}-expanded`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell colSpan={7} className="p-0">
                          <div className="px-4 py-3 animate-accordion-down">
                            <ClientLoansList
                              loans={loansByClient[r.name] ?? []}
                              paymentsByLoan={paymentsByLoan}
                              hidden={hidden}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum cliente encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile — Cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => {
          const isOpen = !!expanded[r.name];
          return (
            <Card key={r.name}>
              <CardContent className="p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => toggleExpanded(r.name)}
                  className="w-full flex items-center justify-center gap-2 focus-visible:outline-none"
                >
                  <h3 className="font-semibold text-sm truncate text-center">{r.name}</h3>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div className="grid grid-cols-2 gap-2 text-xs text-center">
                  <div>
                    <div className="text-muted-foreground">Emprestado</div>
                    <div className="tabular-nums font-medium">{mask(formatCurrency(r.borrowed))}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Pago</div>
                    <div className="tabular-nums font-medium text-success">{mask(formatCurrency(r.paid))}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Pendente</div>
                    <div className="tabular-nums font-medium text-warning">{mask(formatCurrency(r.pending))}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total</div>
                    <div className="tabular-nums font-semibold">{mask(formatCurrency(r.total))}</div>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Taxa de Juros</span>
                      <span className="tabular-nums font-semibold text-primary">
                        {hidden ? "•••" : `${r.interestRate.toFixed(2).replace(".", ",")}%`}
                      </span>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="pt-2 border-t border-border/40 animate-accordion-down">
                    <ClientLoansList
                      loans={loansByClient[r.name] ?? []}
                      paymentsByLoan={paymentsByLoan}
                      hidden={hidden}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              Nenhum cliente encontrado
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function formatDate(d?: string): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

interface ClientLoansListProps {
  loans: Loan[];
  paymentsByLoan: Record<string, number>;
  hidden: boolean;
}

function ClientLoansList({ loans, paymentsByLoan, hidden }: ClientLoansListProps) {
  const mask = (v: string) => (hidden ? "•••" : v);

  if (loans.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        Nenhum empréstimo encontrado.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {loans.map((l, idx) => {
        const totalPaid = paymentsByLoan[l.id] ?? 0;
        let remaining = 0;
        if (l.status !== "paid") {
          const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
          remaining = l.remainingAmount != null && l.remainingAmount > 0
            ? l.remainingAmount
            : Math.max(0, expected - totalPaid);
        }

        const statusLabel =
          l.status === "paid" ? "Pago" : l.status === "overdue" ? "Atrasado" : "Pendente";
        const statusClass =
          l.status === "paid"
            ? "bg-success/15 text-success border-success/30"
            : l.status === "overdue"
              ? "bg-destructive/15 text-destructive border-destructive/30"
              : "bg-warning/15 text-warning border-warning/30";

        return (
          <div
            key={l.id}
            className={`rounded-lg border border-border/50 bg-card/40 px-3 py-2 ${idx > 0 ? "" : ""}`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] text-muted-foreground">
                Empréstimo de {formatDate(l.startDate)}
              </span>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${statusClass}`}>
                {statusLabel}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div>
                <div className="text-muted-foreground">Vencimento</div>
                <div className="tabular-nums font-medium">{formatDate(l.dueDate)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Valor</div>
                <div className="tabular-nums font-medium">{mask(formatCurrency(l.amount))}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Restante</div>
                <div className="tabular-nums font-medium text-warning">
                  {mask(formatCurrency(remaining))}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Parcelas</div>
                <div className="tabular-nums font-medium">
                  {l.paidInstallments ?? 0} / {l.installments}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
