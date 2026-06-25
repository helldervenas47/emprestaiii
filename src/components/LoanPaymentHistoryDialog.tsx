import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Loan, Payment } from "@/types/loan";
import {
  calculateInstallment,
  calculateTotalWithInterest,
} from "@/hooks/useLoans";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useHideValues } from "@/contexts/HideValuesContext";

interface Props {
  loan: Loan | null;
  payments: Payment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(d?: string): string {
  if (!d) return "—";
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, day] = iso;
    return `${day}/${m}/${y}`;
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR");
}

export function LoanPaymentHistoryDialog({
  loan,
  payments,
  open,
  onOpenChange,
}: Props) {
  const { methods } = usePaymentMethods(open);
  const { hidden } = useHideValues();
  const mask = (v: string) => (hidden ? "•••" : v);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    if (open) setVisibleCount(PAGE_SIZE);
  }, [open, loan?.id]);

  const methodById = useMemo(() => {
    const map: Record<string, string> = {};
    methods.forEach((m) => {
      map[m.id] = m.name;
    });
    return map;
  }, [methods]);

  const data = useMemo(() => {
    if (!loan) return null;

    const principal = loan.amount || 0;
    const expected = calculateTotalWithInterest(
      principal,
      loan.interestRate,
      loan.installments,
    );
    const totalInterest = Math.max(0, expected - principal);
    const interestRatio = expected > 0 ? totalInterest / expected : 0;
    const principalRatio = 1 - interestRatio;
    const nominalInstallment =
      loan.customInstallmentValue ||
      calculateInstallment(principal, loan.interestRate, loan.installments);

    const loanPayments = payments
      .filter((p) => p.loanId === loan.id)
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    let totalPaid = 0;
    let principalPaid = 0;
    let interestPaid = 0;

    const rows = loanPayments.map((p) => {
      const amount = p.amount || 0;
      totalPaid += amount;

      let principalPart = 0;
      let interestPart = 0;
      if (p.installmentNumber === 0) {
        // Pagamento de juros (juros-only)
        interestPart = amount;
      } else {
        principalPart = amount * principalRatio;
        interestPart = amount * interestRatio;
      }
      principalPaid += principalPart;
      interestPaid += interestPart;

      const methodName = p.paymentMethodId
        ? methodById[p.paymentMethodId] ?? "—"
        : "—";

      return {
        id: p.id,
        date: p.date,
        installmentNumber: p.installmentNumber,
        installmentValue: nominalInstallment,
        principal: principalPart,
        interest: interestPart,
        total: amount,
        method: methodName,
      };
    });

    const remaining =
      loan.remainingAmount != null && loan.remainingAmount >= 0
        ? loan.remainingAmount
        : Math.max(0, expected - totalPaid);

    const isPaid = loan.status === "paid" || remaining <= 0.01;
    const paidInstallments = loan.paidInstallments ?? 0;
    const pendingInstallments = Math.max(
      0,
      loan.installments - paidInstallments,
    );

    return {
      rows,
      summary: {
        original: principal,
        totalPaid,
        remaining,
        interestPaid: isPaid ? totalInterest : interestPaid,
        paidInstallments,
        pendingInstallments,
        isPaid,
      },
    };
  }, [loan, payments, methodById]);

  if (!loan || !data) return null;

  const statusBadge = (
    installmentNumber: number,
    rowIndex: number,
  ): { label: string; className: string } => {
    if (data.summary.isPaid && rowIndex === data.rows.length - 1) {
      return {
        label: "Quitado",
        className: "bg-primary/15 text-primary border-primary/30",
      };
    }
    if (installmentNumber === 0) {
      return {
        label: "Juros",
        className: "bg-warning/15 text-warning border-warning/30",
      };
    }
    return {
      label: "Pago",
      className: "bg-success/15 text-success border-success/30",
    };
  };

  const totalRows = data.rows.length;
  const startIdx = Math.max(0, totalRows - visibleCount);
  const visibleRows = data.rows
    .slice(startIdx)
    .map((r, i) => ({ row: r, originalIdx: startIdx + i }))
    .reverse();
  const hasMore = startIdx > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">
            Histórico de Pagamentos — {loan.borrowerName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2 -mr-2">
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5">
                  Valor Original
                </div>
                <div className="font-semibold tabular-nums text-sm">
                  {mask(formatCurrency(data.summary.original))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5">
                  Já Pago
                </div>
                <div className="font-semibold tabular-nums text-sm text-success">
                  {mask(formatCurrency(data.summary.totalPaid))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5">
                  Saldo Devedor
                </div>
                <div className="font-semibold tabular-nums text-sm text-warning">
                  {mask(formatCurrency(data.summary.remaining))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5">
                  Juros Recebidos
                </div>
                <div className="font-semibold tabular-nums text-sm text-primary">
                  {mask(formatCurrency(data.summary.interestPaid))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5">
                  Parcelas Pagas
                </div>
                <div className="font-semibold tabular-nums text-sm">
                  {data.summary.paidInstallments} / {loan.installments}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-[11px] text-muted-foreground mb-0.5">
                  Parcelas Pendentes
                </div>
                <div className="font-semibold tabular-nums text-sm text-warning">
                  {data.summary.pendingInstallments}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela desktop */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-center">Parcela</TableHead>
                  <TableHead className="text-right">Valor Parcela</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Juros</TableHead>
                  <TableHead className="text-right">Total Pago</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Forma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground py-6"
                    >
                      Nenhum pagamento registrado.
                    </TableCell>
                  </TableRow>
                )}
                {visibleRows.map(({ row: r, originalIdx: idx }) => {
                  const st = statusBadge(r.installmentNumber, idx);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatDate(r.date)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {r.installmentNumber === 0
                          ? "—"
                          : `${r.installmentNumber}/${loan.installments}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mask(formatCurrency(r.installmentValue))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mask(formatCurrency(r.principal))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {mask(formatCurrency(r.interest))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-success">
                        {mask(formatCurrency(r.total))}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 h-5 ${st.className}`}
                        >
                          {st.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {r.method}
                      </TableCell>
                    </TableRow>
                  );
                })}

              </TableBody>
            </Table>
          </div>

          {/* Cards mobile */}
          <div className="md:hidden space-y-2">
            {data.rows.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-6">
                Nenhum pagamento registrado.
              </p>
            )}
            {visibleRows.map(({ row: r, originalIdx: idx }) => {
              const st = statusBadge(r.installmentNumber, idx);
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-border/50 bg-card/40 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {formatDate(r.date)}
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-5 ${st.className}`}
                    >
                      {st.label}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Parcela</div>
                      <div className="tabular-nums font-medium">
                        {r.installmentNumber === 0
                          ? "—"
                          : `${r.installmentNumber}/${loan.installments}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Valor Parcela</div>
                      <div className="tabular-nums font-medium">
                        {mask(formatCurrency(r.installmentValue))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Principal</div>
                      <div className="tabular-nums font-medium">
                        {mask(formatCurrency(r.principal))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Juros</div>
                      <div className="tabular-nums font-medium">
                        {mask(formatCurrency(r.interest))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total Pago</div>
                      <div className="tabular-nums font-semibold text-success">
                        {mask(formatCurrency(r.total))}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Forma</div>
                      <div className="font-medium truncate">{r.method}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Carregar mais / contador */}
          {totalRows > 0 && (
            <div className="flex flex-col items-center gap-1 mt-3 mb-1">
              <div className="text-[11px] text-muted-foreground">
                Exibindo {totalRows - startIdx} de {totalRows} pagamentos
              </div>
              {hasMore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((c) => Math.min(totalRows, c + PAGE_SIZE))
                  }
                >
                  Carregar mais
                </Button>
              )}
            </div>
          )}

        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
