import { useMemo, useState } from "react";
import { Loan, Payment } from "@/types/loan";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateTotalWithInterest } from "@/hooks/useLoans";
import { Search, Users } from "lucide-react";
import { useHideValues } from "@/contexts/HideValuesContext";

interface Props {
  loans: Loan[];
  payments: Payment[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface ClientRow {
  name: string;
  contracts: number;
  borrowed: number;
  paid: number;
  pending: number;
  total: number;
  interestRate: number;
}

export function ClientLoanHistory({ loans, payments }: Props) {
  const [search, setSearch] = useState("");
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
        contracts: clientLoans.length,
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

    return filtered.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [loans, payments, search]);

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
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Desktop / Tablet — Table */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Emprestado</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Taxa de Juros</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">
                    {r.name}
                    {r.contracts > 1 && (
                      <span className="ml-2 text-xs text-muted-foreground">({r.contracts} contratos)</span>
                    )}
                  </TableCell>
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm truncate">{r.name}</h3>
                {r.contracts > 1 && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{r.contracts} contratos</span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
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
