import { useMemo, useState } from "react";
import { useIncomes, Income } from "@/hooks/useIncomes";
import { useExpenses } from "@/hooks/useExpenses";
import { useClients } from "@/hooks/useClients";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Search, ArrowUpCircle, ArrowDownCircle, FileDown, FileSpreadsheet, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Expense, Sale } from "@/types/loan";
import { useProducts } from "@/hooks/useProducts";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import {
  isCreditCardExpense,
  listPaidInvoicesInRange,
  CREDIT_CARD_INVOICE_CATEGORY,
} from "@/lib/creditCardInvoiceTotals";

type RowOrigin = "income" | "expense" | "sale-full" | "sale-partial";

type Row = {
  id: string;
  date: string; // YYYY-MM-DD
  /** Timestamp completo (ms) para ordenação cronológica precisa. */
  ts: number;
  description: string;
  category: string;
  type: "income" | "expense";
  origin: RowOrigin;
  amount: number;
  paymentMethod: string;
  account: string;
};

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Constrói um timestamp (ms) para ordenação cronológica do extrato.
 * Prioridade:
 *  1. Hora explícita HH:mm[:ss] (ex.: paymentHistory de vendas).
 *  2. ISO timestamp (created_at) quando cai no mesmo dia local do evento.
 *  3. Fallback: meio-dia local da data, evitando shift de timezone.
 */
function buildSortTs(
  date: string,
  isoTimestamp?: string | null,
  explicitTime?: string | null,
): number {
  if (explicitTime && /^\d{2}:\d{2}/.test(explicitTime)) {
    const hhmmss = explicitTime.length >= 8 ? explicitTime.slice(0, 8) : `${explicitTime.slice(0, 5)}:00`;
    const t = new Date(`${date}T${hhmmss}`).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (isoTimestamp) {
    const d = new Date(isoTimestamp);
    if (!Number.isNaN(d.getTime())) {
      const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (localDate === date) return d.getTime();
    }
  }
  return new Date(`${date}T12:00:00`).getTime();
}

const PAGE_SIZE = 30;

export function FinancialStatement() {
  const { incomes } = useIncomes();
  const { expenses } = useExpenses();
  const { sales } = useProducts(true);
  const { clients } = useClients();
  const { activeMethods } = usePaymentMethods();
  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString().slice(0, 10);
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString().slice(0, 10);

  const [from, setFrom] = useState<string>(firstOfMonth);
  const [to, setTo] = useState<string>(lastOfMonth);
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const methodName = (id: string | null | undefined) =>
    id ? activeMethods.find((m) => m.id === id)?.name || "—" : "—";
  const clientName = (id: string | null | undefined) =>
    id ? clients.find((c) => c.id === id)?.name || "" : "";

  const rows = useMemo<Row[]>(() => {
    const incomeRows: Row[] = incomes
      .filter((i) => i.status === "received" && i.source !== "Ajuste manual")
      .map((i: Income) => {
        const date = i.actualReceivedDate || i.receivedDate;
        return {
          id: `i-${i.id}`,
          date,
          ts: buildSortTs(date, i.createdAt),
          description: i.description,
          category: i.category || "Outros",
          type: "income",
          origin: "income",
          amount: i.amount,
          paymentMethod: methodName(i.paymentMethodId),
          account: clientName(i.clientId) || i.source || "—",
        };
      });
    const expenseRows: Row[] = expenses
      .filter(
        (e) =>
          e.paid &&
          !!e.paidDate &&
          e.scope === "personal" &&
          // Despesas individuais de cartão de crédito NÃO entram no extrato —
          // são agregadas em um único lançamento por fatura paga (ver creditCardRows).
          !isCreditCardExpense(e),
      )
      .map((e: Expense) => ({
        id: `e-${e.id}`,
        date: e.paidDate!,
        ts: buildSortTs(e.paidDate!, e.createdAt),
        description: e.description,
        category: e.category || "Outros",
        type: "expense",
        origin: "expense",
        amount: e.amount,
        paymentMethod: methodName(e.paymentMethodId),
        account: "Pessoal",
      }));

    // Faturas de cartão pagas no período → 1 lançamento por (cartão, ciclo).
    const creditCardRows: Row[] = listPaidInvoicesInRange(
      expenses,
      cards,
      openings,
      from,
      to,
    ).map((inv) => {
      const label =
        inv.card.nickname?.trim() ||
        [inv.card.bank, inv.card.lastFour].filter(Boolean).join(" •••• ") ||
        "Cartão";
      return {
        id: `cc-${inv.card.id}-${inv.cycleKey}`,
        date: inv.paidDate,
        description: `Fatura ${label}`,
        category: CREDIT_CARD_INVOICE_CATEGORY,
        type: "expense",
        origin: "expense",
        amount: inv.paidTotal,
        paymentMethod: "—",
        account: "Pessoal",
      };
    });

    // Vendas: cada pagamento (paymentHistory) vira um lançamento individual no extrato.
    // Para vendas antigas com paid_installments/partial_paid sem entrada no histórico,
    // adiciona uma linha agregada com a diferença para que o extrato bata com o saldo.
    const saleRows: Row[] = [];
    sales.forEach((s: Sale) => {
      const desc = s.description || s.productName || "Venda";
      const account = s.customerName || "—";
      const history = s.paymentHistory || [];
      const iv = s.installmentValue ?? (s.installments > 0 ? s.total / s.installments : s.total);
      const legacyTotal = (s.downPayment || 0) + (s.paidInstallments || 0) * iv + (s.partialPaid || 0);
      const historyTotal = history.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      history.forEach((p, idx) => {
        const amt = Number(p.amount) || 0;
        if (amt <= 0) return;
        const isFull = p.type !== "partial";
        saleRows.push({
          id: `s-${s.id}-p${idx}`,
          date: p.date || s.date,
          description: desc,
          category: "Vendas",
          type: "income",
          origin: isFull ? "sale-full" : "sale-partial",
          amount: amt,
          paymentMethod: "—",
          account,
        });
      });

      // Diferença entre o que foi efetivamente pago (paid_installments/partial_paid)
      // e o que está no histórico — comum em vendas antigas anteriores ao paymentHistory.
      const missing = legacyTotal - historyTotal;
      if (missing > 0.005) {
        const isFullyPaid = s.paidInstallments >= s.installments && (s.partialPaid || 0) === 0;
        saleRows.push({
          id: `s-${s.id}-legacy`,
          date: s.date,
          description: desc,
          category: "Vendas",
          type: "income",
          origin: isFullyPaid ? "sale-full" : "sale-partial",
          amount: missing,
          paymentMethod: "—",
          account,
        });
      }
    });

    return [...incomeRows, ...expenseRows, ...saleRows, ...creditCardRows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomes, expenses, sales, activeMethods, clients, cards, openings, from, to]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
        if (typeFilter !== "all" && r.type !== typeFilter) return false;
        if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
        if (q && !`${r.description} ${r.category} ${r.account}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [rows, from, to, typeFilter, categoryFilter, search]);

  const totals = useMemo(() => {
    let inc = 0, exp = 0;
    for (const r of filtered) {
      if (r.type === "income") inc += r.amount;
      else exp += r.amount;
    }
    return { inc, exp, balance: inc - exp };
  }, [filtered]);

  const visible = filtered.slice(0, visibleCount);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Extrato Financeiro", 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${from || "—"} a ${to || "—"}`, 14, 22);
    doc.text(
      `Receitas: ${fmtBRL(totals.inc)}  |  Despesas: ${fmtBRL(totals.exp)}  |  Saldo: ${fmtBRL(totals.balance)}`,
      14, 28,
    );
    autoTable(doc, {
      startY: 34,
      head: [["Data", "Descrição", "Categoria", "Tipo", "Valor", "Pagamento", "Conta"]],
      body: filtered.map((r) => [
        format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy"),
        r.description,
        r.category,
        r.type === "income" ? "Receita" : "Despesa",
        (r.type === "income" ? "+" : "-") + fmtBRL(r.amount),
        r.paymentMethod,
        r.account,
      ]),
      styles: { fontSize: 8 },
    });
    doc.save(`extrato-${from}_a_${to}.pdf`);
  };

  const exportXLSX = () => {
    const data = filtered.map((r) => ({
      Data: r.date,
      Descrição: r.description,
      Categoria: r.category,
      Tipo: r.type === "income" ? "Receita" : "Despesa",
      Valor: r.type === "income" ? r.amount : -r.amount,
      Pagamento: r.paymentMethod,
      Conta: r.account,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extrato");
    XLSX.writeFile(wb, `extrato-${from}_a_${to}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card no3d className="p-4">
          <div className="text-xs text-muted-foreground">Total de receitas</div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {fmtBRL(totals.inc)}
          </div>
        </Card>
        <Card no3d className="p-4">
          <div className="text-xs text-muted-foreground">Total de despesas</div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {fmtBRL(totals.exp)}
          </div>
        </Card>
        <Card no3d className="p-4">
          <div className="text-xs text-muted-foreground">Saldo do período</div>
          <div className={`text-xl font-bold mt-1 ${totals.balance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {fmtBRL(totals.balance)}
          </div>
        </Card>
      </div>

      <Card no3d className="p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 flex-1 w-full">
            <div>
              <label className="text-xs text-muted-foreground">De</label>
              <DatePickerField value={from} onChange={setFrom} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Até</label>
              <DatePickerField value={to} onChange={setTo} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="income">Receitas</SelectItem>
                  <SelectItem value="expense">Despesas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Categoria</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Descrição..."
                  className="pl-9 h-10"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 w-full lg:w-auto sm:justify-end">
            <Button variant="outline" onClick={exportPDF} className="gap-1 h-10 flex-1 sm:flex-none" disabled={filtered.length === 0}>
              <FileDown className="h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" onClick={exportXLSX} className="gap-1 h-10 flex-1 sm:flex-none" disabled={filtered.length === 0}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </div>
        </div>
      </Card>

      <Card no3d className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhuma movimentação encontrada para o período.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[110px]" />
                  <col />
                  <col className="w-[180px]" />
                  <col className="w-[120px]" />
                  <col className="w-[140px]" />
                  <col className="w-[130px]" />
                </colgroup>
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Data</th>
                    <th className="text-left px-4 py-2">Descrição</th>
                    <th className="text-left px-4 py-2">Categoria</th>
                    <th className="text-left px-4 py-2">Tipo</th>
                    <th className="text-left px-4 py-2">Conta</th>
                    <th className="text-right px-4 py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-t border-border/40 hover:bg-muted/30 h-12">
                      <td className="px-4 py-2 whitespace-nowrap align-middle">
                        {format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                      <td className="px-4 py-2 align-middle truncate pr-6" title={r.description}>{r.description}</td>
                      <td className="px-4 py-2 align-middle">
                        <Badge
                          variant="secondary"
                          className="text-xs max-w-full inline-block truncate align-middle"
                          title={r.category}
                        >
                          {r.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-1 flex-wrap">
                          {r.type === "income" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 gap-1 whitespace-nowrap">
                              <ArrowUpCircle className="h-3 w-3" /> Receita
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 gap-1 whitespace-nowrap">
                              <ArrowDownCircle className="h-3 w-3" /> Despesa
                            </Badge>
                          )}
                          {r.origin === "sale-full" && (
                            <Badge className="bg-primary/15 text-primary border border-primary/30 gap-1 whitespace-nowrap">
                              <ShoppingCart className="h-3 w-3" /> Venda
                            </Badge>
                          )}
                          {r.origin === "sale-partial" && (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 gap-1 whitespace-nowrap">
                              <ShoppingCart className="h-3 w-3" /> Parcial
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-muted-foreground truncate" title={r.account}>{r.account}</td>
                      <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap align-middle ${
                        r.type === "income"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}>
                        {r.type === "income" ? "+" : "−"} {fmtBRL(r.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border/40">
              {visible.map((r) => (
                <div key={r.id} className="p-3 flex items-start gap-3">
                  <div className="mt-0.5">
                    {r.type === "income" ? (
                      <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-rose-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium truncate">{r.description}</span>
                      {r.origin === "sale-full" && (
                        <Badge className="bg-primary/15 text-primary border border-primary/30 gap-1 whitespace-nowrap text-[10px] px-1.5 py-0">
                          <ShoppingCart className="h-2.5 w-2.5" /> Venda
                        </Badge>
                      )}
                      {r.origin === "sale-partial" && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 gap-1 whitespace-nowrap text-[10px] px-1.5 py-0">
                          <ShoppingCart className="h-2.5 w-2.5" /> Parcial
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                      <span>{format(new Date(r.date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}</span>
                      <span>· {r.category}</span>
                      <span>· {r.paymentMethod}</span>
                    </div>
                    {r.account && r.account !== "—" && (
                      <div className="text-xs text-muted-foreground/80 truncate">{r.account}</div>
                    )}
                  </div>
                  <div className={`text-right font-semibold whitespace-nowrap ${
                    r.type === "income"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}>
                    {r.type === "income" ? "+" : "−"} {fmtBRL(r.amount)}
                  </div>
                </div>
              ))}
            </div>

            {visible.length < filtered.length && (
              <div className="p-3 text-center border-t border-border/40">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Carregar mais ({filtered.length - visible.length} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
