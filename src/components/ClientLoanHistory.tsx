import { useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
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
import { LoanPaymentHistoryDialog } from "@/components/LoanPaymentHistoryDialog";

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
  const savedScrollRef = useRef<number | null>(null);
  const { hidden } = useHideValues();

  const openClient = useCallback((name: string) => {
    savedScrollRef.current = window.scrollY;
    setSelectedClient(name);
  }, []);

  const closeClient = useCallback(() => {
    setSelectedClient(null);
  }, []);

  useLayoutEffect(() => {
    if (selectedClient === null && savedScrollRef.current != null) {
      const y = savedScrollRef.current;
      savedScrollRef.current = null;
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [selectedClient]);

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
          const baseRemaining = l.remainingAmount != null && l.remainingAmount > 0
            ? l.remainingAmount
            : Math.max(0, expected - totalPaid);

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = l.dueDate ? new Date(`${l.dueDate}T00:00:00`) : null;
          const daysOverdue =
            due && !isNaN(due.getTime())
              ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
              : 0;

          let lateFees = 0;
          if (daysOverdue > 0) {
            if (l.lateInterestValue != null && l.lateInterestValue > 0) {
              lateFees +=
                l.lateInterestType === "fixed"
                  ? l.lateInterestValue * daysOverdue
                  : baseRemaining * (l.lateInterestValue / 100) * daysOverdue;
            }
            if (l.penaltyValue != null && l.penaltyValue > 0) {
              lateFees += l.penaltyValue;
            }
          }

          pending += baseRemaining + lateFees;
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

  // Cache: last payment date by loanId
  const lastPaymentDateByLoan = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    payments.forEach((p) => {
      const current = map[p.loanId];
      if (!current || (p.date && p.date > current)) {
        map[p.loanId] = p.date;
      }
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
        const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
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

  if (selectedClient) {
    const clientLoans = loansByClient[selectedClient] ?? [];
    const summary = rows.find((r) => r.name === selectedClient);
    const borrowed = summary?.borrowed ?? 0;
    const paidTotal = summary?.paid ?? 0;
    const pendingTotal = summary?.pending ?? 0;
    const grandTotal = summary?.total ?? 0;

    // Juros recebidos / a receber — apenas contratos da aba Empréstimos (loans)
    // Regra: juros recebidos = total pago - amortização do principal (juros vêm primeiro).
    //  - Pagamentos com installmentNumber === 0 (juros-only) são 100% juros.
    //  - Demais pagamentos quitam principal proporcionalmente ao valor pago.
    //  - Para contratos quitados, juros recebidos = juros total do contrato.
    let interestReceived = 0;
    clientLoans.forEach((l) => {
      const principal = l.amount || 0;
      const totalInterest = Math.max(
        0,
        calculateTotalWithInterest(principal, l.interestRate, l.installments) - principal,
      );

      if (l.status === "paid") {
        interestReceived += totalInterest;
        return;
      }

      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const totalPaid = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const interestOnlyPaid = loanPayments
        .filter((p) => p.installmentNumber === 0)
        .reduce((s, p) => s + (p.amount || 0), 0);

      const principalRemaining =
        l.remainingAmount != null && l.remainingAmount >= 0 ? l.remainingAmount : principal;
      const principalPaid = Math.max(0, Math.min(principal, principal - principalRemaining));

      const installmentInterestPaid = Math.max(0, totalPaid - interestOnlyPaid - principalPaid);
      interestReceived += installmentInterestPaid + interestOnlyPaid;
    });

    // Juros a receber = soma por contrato de (Pendente - Emprestado), ignorando contratos quitados.
    let interestPending = 0;
    clientLoans.forEach((l) => {
      if (l.status === "paid") return;
      const principal = l.amount || 0;
      const expected = calculateTotalWithInterest(principal, l.interestRate, l.installments);
      const loanPayments = payments.filter((p) => p.loanId === l.id);
      const totalPaid = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const baseRemaining =
        l.remainingAmount != null && l.remainingAmount > 0
          ? l.remainingAmount
          : Math.max(0, expected - totalPaid);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = l.dueDate ? new Date(`${l.dueDate}T00:00:00`) : null;
      const daysOverdue =
        due && !isNaN(due.getTime())
          ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
          : 0;

      let lateFees = 0;
      if (daysOverdue > 0) {
        if (l.lateInterestValue != null && l.lateInterestValue > 0) {
          lateFees +=
            l.lateInterestType === "fixed"
              ? l.lateInterestValue * daysOverdue
              : baseRemaining * (l.lateInterestValue / 100) * daysOverdue;
        }
        if (l.penaltyValue != null && l.penaltyValue > 0) {
          lateFees += l.penaltyValue;
        }
      }

      const interestRatio = expected > 0 ? 1 - principal / expected : 0;
      interestPending += Math.max(0, baseRemaining * interestRatio + lateFees);
    });

    return (
      <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-200">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeClient}
            className="gap-1 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <h2 className="text-base font-semibold truncate">{selectedClient}</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 sm:gap-3">
          <Card>
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">Emprestado</div>
              <div className="font-bold tabular-nums text-sm sm:text-base">
                {mask(formatCurrency(borrowed))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">Pago</div>
              <div className="font-bold tabular-nums text-success text-sm sm:text-base">
                {mask(formatCurrency(paidTotal))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">Pendente</div>
              <div className="font-bold tabular-nums text-warning text-sm sm:text-base">
                {mask(formatCurrency(pendingTotal))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">Total</div>
              <div className="font-bold tabular-nums text-primary text-sm sm:text-base">
                {mask(formatCurrency(grandTotal))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">Juros Recebidos</div>
              <div className="font-bold tabular-nums text-success text-sm sm:text-base">
                {mask(formatCurrency(interestReceived))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex flex-col items-center justify-center text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">Juros a Receber</div>
              <div className="font-bold tabular-nums text-warning text-sm sm:text-base">
                {mask(formatCurrency(interestPending))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <ClientLoansList
              loans={clientLoans}
              payments={payments}
              paymentsByLoan={paymentsByLoan}
              lastPaymentDateByLoan={lastPaymentDateByLoan}
              hidden={hidden}
            />
          </CardContent>
        </Card>
      </div>
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
              <SelectItem value="rate-desc">Maior taxa de variação</SelectItem>
              <SelectItem value="rate-asc">Menor taxa de variação</SelectItem>
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
              <div className="text-sm text-muted-foreground mb-1">Variação Média</div>
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
                <TableHead className="text-right">Taxa de Variação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow
                  key={r.name}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => openClient(r.name)}
                >
                  <TableCell className="w-8">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
              ))}
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
        {rows.map((r) => (
          <Card key={r.name}>
            <CardContent className="p-4 space-y-2">
              <button
                type="button"
                onClick={() => openClient(r.name)}
                className="w-full flex items-center justify-center gap-2 focus-visible:outline-none"
              >
                <h3 className="font-semibold text-sm truncate text-center">{r.name}</h3>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
            </CardContent>
          </Card>
        ))}
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
  // ISO date (YYYY-MM-DD) — parse manualmente para evitar deslocamento de fuso horário
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, day] = iso;
    return `${day}/${m}/${y}`;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}


interface ClientLoansListProps {
  loans: Loan[];
  payments: Payment[];
  paymentsByLoan: Record<string, number>;
  lastPaymentDateByLoan: Record<string, string | undefined>;
  hidden: boolean;
}

function ClientLoansList({ loans, payments, paymentsByLoan, lastPaymentDateByLoan, hidden }: ClientLoansListProps) {
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const mask = (v: string) => (hidden ? "•••" : v);

  if (loans.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-2">
        Nenhum empréstimo encontrado.
      </p>
    );
  }

  const renderTags = (tags?: string[]) =>
    tags && tags.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <Badge
            key={t}
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/30"
          >
            {t}
          </Badge>
        ))}
      </div>
    ) : null;

  const computeValueCell = (l: Loan) => {
    const totalPaid = paymentsByLoan[l.id] ?? 0;
    const isPaid = l.status === "paid";
    if (isPaid) return { remaining: 0, paid: totalPaid, isPaid };
    const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
    const baseRemaining =
      l.remainingAmount != null && l.remainingAmount > 0
        ? l.remainingAmount
        : Math.max(0, expected - totalPaid);

    // Acrescenta juros de mora + multa se contrato vencido
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = l.dueDate ? new Date(`${l.dueDate}T00:00:00`) : null;
    const daysOverdue =
      due && !isNaN(due.getTime())
        ? Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000))
        : 0;

    let lateFees = 0;
    if (daysOverdue > 0) {
      if (l.lateInterestValue != null && l.lateInterestValue > 0) {
        lateFees +=
          l.lateInterestType === "fixed"
            ? l.lateInterestValue * daysOverdue
            : baseRemaining * (l.lateInterestValue / 100) * daysOverdue;
      }
      if (l.penaltyValue != null && l.penaltyValue > 0) {
        lateFees += l.penaltyValue;
      }
    }

    return { remaining: baseRemaining + lateFees, paid: totalPaid, isPaid };
  };

  const statusMeta = (l: Loan) => {
    const isPaid = l.status === "paid";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = l.dueDate ? new Date(`${l.dueDate}T00:00:00`) : null;
    if (due) due.setHours(0, 0, 0, 0);
    // Só considera vencido a partir do dia seguinte ao vencimento.
    const isExpired = !isPaid && due != null && !isNaN(due.getTime()) && due.getTime() < today.getTime();

    let label: string;
    let className: string;
    if (isPaid) {
      label = "Pago";
      className = "bg-success/15 text-success border-success/30";
    } else if (isExpired) {
      label = "Vencido";
      className = "bg-destructive/15 text-destructive border-destructive/30";
    } else {
      label = "Pendente";
      className = "bg-warning/15 text-warning border-warning/30";
    }
    return { label, className };
  };

  return (
    <>
      {/* Mobile — Cards */}
      <div className="md:hidden space-y-2">
        {loans.map((l) => {
          const { remaining, paid, isPaid } = computeValueCell(l);
          const { label, className } = statusMeta(l);
          const settlementDate = lastPaymentDateByLoan[l.id];
          const isSettled = l.status === "paid" && remaining === 0 && !!settlementDate;
          return (
            <button
              type="button"
              key={l.id}
              onClick={() => setSelectedLoan(l)}
              className="w-full text-left rounded-lg border border-border/50 bg-card/40 p-3 space-y-2 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {formatDate(l.startDate)}
                </span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${className}`}>
                  {label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-center">
                <div>
                  <div className="text-muted-foreground">Vencimento</div>
                  <div className="tabular-nums font-medium">{formatDate(l.dueDate)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Parcelas</div>
                  <div className="tabular-nums font-medium">
                    {l.paidInstallments ?? 0} / {l.installments}
                  </div>
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
                  <div className="text-muted-foreground">Pago</div>
                  <div className="tabular-nums font-medium text-success">
                    {mask(formatCurrency(paid))}
                  </div>
                </div>
                {isSettled && (
                  <div>
                    <div className="text-muted-foreground">Quitação</div>
                    <div className="tabular-nums font-medium text-primary">
                      {formatDate(settlementDate)}
                    </div>
                  </div>
                )}
                {l.tags && l.tags.length > 0 && (
                  <div className={isSettled ? "" : "col-span-2"}>
                    <div className="text-muted-foreground">Etiquetas</div>
                    <div className="mt-0.5 flex justify-center">{renderTags(l.tags)}</div>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop / Tablet — Table */}
      <div className="hidden md:block w-full overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border/60 text-muted-foreground">
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Data</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Vencimento</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Quitação</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Valor</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Restante</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Pago</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Parcelas</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Status</th>
              <th className="text-center font-medium py-2 px-2 whitespace-nowrap">Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => {
              const { remaining, paid } = computeValueCell(l);
              const { label, className } = statusMeta(l);
              const settlementDate = lastPaymentDateByLoan[l.id];
              const isSettled = l.status === "paid" && remaining === 0 && !!settlementDate;
              return (
                <tr
                  key={l.id}
                  onClick={() => setSelectedLoan(l)}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap text-center">{formatDate(l.startDate)}</td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap text-center">{formatDate(l.dueDate)}</td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-primary text-center">
                    {isSettled ? formatDate(settlementDate) : "—"}
                  </td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-center">
                    {mask(formatCurrency(l.amount))}
                  </td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-warning text-center">
                    {mask(formatCurrency(remaining))}
                  </td>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap font-medium text-success text-center">
                    {mask(formatCurrency(paid))}
                  </td>
                  <td className="py-2 px-2 tabular-nums text-center whitespace-nowrap">
                    {l.paidInstallments ?? 0} / {l.installments}
                  </td>
                  <td className="py-2 px-2 text-center whitespace-nowrap">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${className}`}>
                      {label}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">
                    <div className="flex justify-center">{renderTags(l.tags)}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LoanPaymentHistoryDialog
        loan={selectedLoan}
        payments={payments}
        open={selectedLoan !== null}
        onOpenChange={(o) => !o && setSelectedLoan(null)}
      />
    </>
  );
}
