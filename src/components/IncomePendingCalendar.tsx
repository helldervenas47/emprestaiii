import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CalendarDays, TrendingUp, ArrowUpCircle, ArrowDownCircle, Wallet, Pencil, RotateCcw, CreditCard as CreditCardIcon, Lock, PiggyBank as PiggyBankIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Income } from "@/hooks/useIncomes";
import type { Expense, Sale } from "@/types/loan";
import { useProducts } from "@/hooks/useProducts";
import { usePiggyBanks } from "@/hooks/usePiggyBanks";
import { useCreditCards } from "@/hooks/useCreditCards";
import { useCreditCardOpenings } from "@/hooks/useCreditCardOpenings";
import { getCardInvoiceTotalsForMonth, isCreditCardExpense } from "@/lib/creditCardInvoiceTotals";
import { useMonthlyOpeningBalances } from "@/hooks/useMonthlyOpeningBalances";
import { todayDateInAppTz } from "@/lib/timezone";

const ALLOW_DAY1_OVERRIDE_KEY = "calendar:incomeAllowDay1BalanceOverride";

function loadAllowDay1Override(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(ALLOW_DAY1_OVERRIDE_KEY);
    if (raw === null) return false;
    return raw === "true";
  } catch {
    return false;
  }
}

function saveAllowDay1Override(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ALLOW_DAY1_OVERRIDE_KEY, String(v));
  } catch {
    // ignore
  }
}

interface Props {
  incomes: Income[];
  expenses?: Expense[];
  /** Override the auto-computed account balance baseline. */
  accountBalance?: number;
  /** All incomes (incl. ajustes) used to compute the account balance baseline. */
  allIncomes?: Income[];
  /** All expenses (incl. business) used to compute the account balance baseline. */
  allExpenses?: Expense[];
  /** Mês selecionado externamente (YYYY-MM). Mantém calendário sincronizado com o filtro geral. */
  monthKey?: string;
  /** Notifica mudança de mês ao navegar pelo calendário. */
  onMonthChange?: (monthKey: string) => void;
}

function saleReceivedTotal(sale: Sale): number {
  if (sale.paymentHistory && sale.paymentHistory.length > 0) {
    return sale.paymentHistory.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  const iv = sale.installmentValue ?? (sale.installments > 0 ? sale.total / sale.installments : sale.total);
  return (sale.downPayment || 0) + (sale.paidInstallments || 0) * iv + (sale.partialPaid || 0);
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const compactCurrency = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}R$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${sign}R$${Math.round(abs)}`;
};

const formatLocalDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

type CardInvoiceEntry = {
  cardId: string;
  cardLabel: string;
  total: number;
  paidTotal: number;
  remaining: number;
  paid: boolean;
};

type PiggyMovementEntry = {
  id: string;
  piggyBankId: string;
  piggyName?: string;
  amount: number; // positive = guardar (saída), negative = resgatar (entrada)
};

type DayInfo = {
  incomes: Income[];
  expenses: Expense[];
  cardInvoices: CardInvoiceEntry[];
  piggyMovements: PiggyMovementEntry[];
  totalIncome: number;
  totalExpense: number;
};

/**
 * Calendário diário: exibe receitas e despesas pessoais por dia,
 * com totais por categoria e saldo final do dia.
 */
export function IncomePendingCalendar({
  incomes,
  expenses = [],
  accountBalance,
  allIncomes,
  allExpenses,
  monthKey,
  onMonthChange,
}: Props) {
  const today = todayDateInAppTz();
  const todayStr = formatLocalDate(today);

  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const initialY = monthKey ? Number(monthKey.split("-")[0]) : today.getFullYear();
  const initialM = monthKey ? Number(monthKey.split("-")[1]) - 1 : today.getMonth();
  const [year, setYear] = useState(initialY);
  const [month, setMonth] = useState(initialM);

  // Sincroniza com o filtro externo (monthKey controlado).
  useEffect(() => {
    if (!monthKey) return;
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return;
    if (y !== year) setYear(y);
    if (m - 1 !== month) setMonth(m - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  // Notifica o pai quando o mês muda pelo calendário.
  useEffect(() => {
    if (!onMonthChange) return;
    const mk = `${year}-${String(month + 1).padStart(2, "0")}`;
    if (mk !== monthKey) onMonthChange(mk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { overrides, setBalance: setOverrideBalance, clearBalance: clearOverrideBalance } = useMonthlyOpeningBalances();
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [allowDay1Override, setAllowDay1Override] = useState<boolean>(() => loadAllowDay1Override());
  const toggleAllowDay1Override = (v: boolean) => {
    setAllowDay1Override(v);
    saveAllowDay1Override(v);
  };

  const { sales } = useProducts(true);
  const { deposits: piggyDeposits, piggyBanks } = usePiggyBanks();

  // Saldo em conta (mesma fórmula do IncomeBalanceCard)
  const computedBalance = useMemo(() => {
    const incSrc = allIncomes ?? incomes;
    const expSrc = allExpenses ?? expenses;
    const totalIncomeReceived = incSrc
      .filter((i) => i.status === "received")
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalSalesReceived = (sales || []).reduce((s, sale) => s + saleReceivedTotal(sale), 0);
    const totalExpensePaid = expSrc
      .filter((e) => e.paid)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalPiggyManualDeposits = (piggyDeposits || [])
      .filter((d) => !d.expenseId)
      .reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return totalIncomeReceived + totalSalesReceived - totalExpensePaid - totalPiggyManualDeposits;
  }, [allIncomes, allExpenses, incomes, expenses, sales, piggyDeposits]);

  const baseBalance = accountBalance ?? computedBalance;

  // Status do dia para colorir o calendário:
  // - "paid": todos os lançamentos do dia (receitas, despesas e faturas) estão pagos/recebidos
  // - "pending": existe ao menos 1 lançamento pendente no dia
  // - "none": nenhum lançamento
  const getDayStatus = (info?: DayInfo): "paid" | "pending" | "none" => {
    if (!info) return "none";
    const total =
      info.incomes.length + info.expenses.length + info.cardInvoices.length;
    if (total === 0) return "none";
    const hasPending =
      info.incomes.some((i) => i.status !== "received") ||
      info.expenses.some((e) => !e.paid) ||
      info.cardInvoices.some((c) => !c.paid);
    return hasPending ? "pending" : "paid";
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < startWeekday; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [year, month]);

  const weekDays = useMemo(() => {
    const base = todayDateInAppTz();
    const dow = base.getDay();
    const start = new Date(base);
    start.setDate(base.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, []);


  const personalExpenses = useMemo(
    () => expenses.filter(
      (e) => (e.scope ?? "business") === "personal" && !isCreditCardExpense(e),
    ),
    [expenses]
  );

  const { cards } = useCreditCards();
  const { openings } = useCreditCardOpenings();

  const dayMap = useMemo(() => {
    const map: Record<string, DayInfo> = {};
    const ensure = (d: string) => {
      if (!map[d]) map[d] = { incomes: [], expenses: [], cardInvoices: [], piggyMovements: [], totalIncome: 0, totalExpense: 0 };
      return map[d];
    };
    for (const i of incomes) {
      // Posiciona pela data real do recebimento quando recebida; senão pela data prevista.
      const d = i.status === "received" ? (i.actualReceivedDate || i.receivedDate) : i.receivedDate;
      if (!d) continue;
      const e = ensure(d);
      e.incomes.push(i);
      // Soma tanto recebidas quanto pendentes para o total previsto do dia
      // (mesma lógica das despesas, que contam mesmo quando ainda não pagas).
      e.totalIncome += Number(i.amount) || 0;
    }

    // Vendas recebidas: cada pagamento (paymentHistory) aparece no calendário no dia
    // do recebimento como uma receita sintética. Para vendas antigas sem histórico,
    // usa a diferença legacy (downPayment + paidInstallments + partialPaid) na data da venda.
    for (const s of (sales || [])) {
      const desc = s.description || s.productName || "Venda";
      const account = s.customerName || "";
      const history = s.paymentHistory || [];
      const iv = s.installmentValue ?? (s.installments > 0 ? s.total / s.installments : s.total);
      const legacyTotal = (s.downPayment || 0) + (s.paidInstallments || 0) * iv + (s.partialPaid || 0);
      const historyTotal = history.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

      history.forEach((p, idx) => {
        const amt = Number(p.amount) || 0;
        if (amt <= 0) return;
        const date = p.date || s.date;
        if (!date) return;
        const isPartial = p.type === "partial";
        const e = ensure(date);
        const synth: Income = {
          id: `sale-${s.id}-p${idx}`,
          description: `Venda${account ? ` · ${account}` : ""} — ${desc}${isPartial ? " (Parcial)" : ""}`,
          amount: amt,
          category: "Venda",
          clientId: null,
          source: "Venda",
          paymentMethodId: null,
          receivedDate: date,
          actualReceivedDate: date,
          status: "received",
          notes: null,
          recurrence: "once",
          parentId: null,
          createdAt: date,
        };
        e.incomes.push(synth);
        e.totalIncome += amt;
      });

      const missing = legacyTotal - historyTotal;
      if (missing > 0.005 && s.date) {
        const e = ensure(s.date);
        const synth: Income = {
          id: `sale-${s.id}-legacy`,
          description: `Venda${account ? ` · ${account}` : ""} — ${desc}`,
          amount: missing,
          category: "Venda",
          clientId: null,
          source: "Venda",
          paymentMethodId: null,
          receivedDate: s.date,
          actualReceivedDate: s.date,
          status: "received",
          notes: null,
          recurrence: "once",
          parentId: null,
          createdAt: s.date,
        };
        e.incomes.push(synth);
        e.totalIncome += missing;
      }
    }
    // Determina o intervalo (em meses) que precisa ser projetado, considerando o mês
    // visível, a semana atual e o mês corrente — assim despesas fixas/parceladas
    // aparecem antecipadamente nos próximos meses, espelhando a aba "Despesas pessoais".
    const todayRefForExp = todayDateInAppTz();
    const visibleMonthIdxs = [
      todayRefForExp.getFullYear() * 12 + todayRefForExp.getMonth(),
      year * 12 + month,
    ];
    if (weekDays.length) {
      visibleMonthIdxs.push(
        weekDays[0].getFullYear() * 12 + weekDays[0].getMonth(),
        weekDays[weekDays.length - 1].getFullYear() * 12 +
          weekDays[weekDays.length - 1].getMonth(),
      );
    }
    const projHiIdx = Math.max(...visibleMonthIdxs);
    const projEnd = new Date(
      Math.floor(projHiIdx / 12),
      (projHiIdx % 12) + 1,
      0,
    );

    for (const ex of personalExpenses) {
      const isRecurringParent =
        ex.type === "recorrente" && (ex.installments ?? 0) > 1;

      if (ex.paid && ex.paidDate) {
        const e = ensure(ex.paidDate);
        e.expenses.push(ex);
        e.totalExpense += Number(ex.amount) || 0;
        continue;
      }

      if (isRecurringParent) {
        const installmentAmount =
          (Number(ex.amount) || 0) / (ex.installments as number);
        const remaining =
          (ex.installments as number) - (ex.paidInstallments ?? 0);
        if (remaining <= 0 || !ex.dueDate) continue;
        const start = new Date(ex.dueDate + "T00:00:00");
        for (let i = 0; i < remaining; i++) {
          const occ = new Date(start);
          occ.setMonth(start.getMonth() + i);
          if (occ > projEnd) break;
          const lastDay = new Date(
            occ.getFullYear(),
            occ.getMonth() + 1,
            0,
          ).getDate();
          const day = Math.min(start.getDate(), lastDay);
          const ds = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const e = ensure(ds);
          e.expenses.push({ ...ex, amount: installmentAmount, dueDate: ds });
          e.totalExpense += installmentAmount;
        }
        continue;
      }

      if (!ex.dueDate) continue;
      const e = ensure(ex.dueDate);
      e.expenses.push(ex);
      e.totalExpense += Number(ex.amount) || 0;
    }

    // Faturas de cartão de crédito — uma entrada por cartão por mês,
    // lançada no dia exato do vencimento da fatura.
    // Cobrimos meses prev/atual/próximo para suportar tanto o mês visível
    // (modo expandido) quanto a semana atual (que pode cruzar meses).
    const monthsToCover = new Set<string>();
    const addMonth = (y: number, m: number) => {
      monthsToCover.add(`${y}-${String(m + 1).padStart(2, "0")}`);
    };
    addMonth(year, month);
    const prev = new Date(year, month - 1, 1);
    const next = new Date(year, month + 1, 1);
    addMonth(prev.getFullYear(), prev.getMonth());
    addMonth(next.getFullYear(), next.getMonth());
    // Cobre semana atual também
    if (weekDays.length) {
      addMonth(weekDays[0].getFullYear(), weekDays[0].getMonth());
      const last = weekDays[weekDays.length - 1];
      addMonth(last.getFullYear(), last.getMonth());
    }
    // Encadeamento entre meses: para projetar corretamente o saldo de meses futuros,
    // cobrimos todos os meses entre o mês corrente e o mês navegado (em ambos os sentidos).
    {
      const todayRef = todayDateInAppTz();
      const fromIdx = todayRef.getFullYear() * 12 + todayRef.getMonth();
      const toIdx = year * 12 + month;
      const lo = Math.min(fromIdx, toIdx);
      const hi = Math.max(fromIdx, toIdx);
      for (let idx = lo; idx <= hi; idx++) {
        addMonth(Math.floor(idx / 12), idx % 12);
      }
    }

    for (const ym of monthsToCover) {
      const totals = getCardInvoiceTotalsForMonth(expenses, cards, openings, ym);
      const [y, mm] = ym.split("-").map(Number);
      for (const t of totals) {
        if (t.total <= 0) continue;
        const remaining = Math.max(0, t.total - t.paidTotal);
        const lastDay = new Date(y, mm, 0).getDate();
        const day = Math.min(t.card.dueDay, lastDay);
        const ds = `${y}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const e = ensure(ds);
        const label =
          t.card.nickname?.trim() ||
          (t.card.lastFour ? `Final ${t.card.lastFour}` : t.card.bank || "Cartão");
        e.cardInvoices.push({
          cardId: t.card.id,
          cardLabel: label,
          total: t.total,
          paidTotal: t.paidTotal,
          remaining,
          paid: t.paid,
        });
        // Para o saldo previsto do dia, considera apenas a parcela ainda em aberto.
        // Faturas já pagas não devem ser subtraídas novamente (o pagamento real já
        // está refletido no saldo em conta atual via baseBalance).
        if (!t.paid && remaining > 0) {
          e.totalExpense += remaining;
        }
      }
    }
    // Movimentações de cofrinhos (guardar/resgatar) — apenas movimentos manuais
    // (sem expenseId), pois aportes vinculados a despesa já são contabilizados
    // pela própria despesa. Guardar (amount > 0) reduz o saldo do dia; resgatar
    // (amount < 0) aumenta o saldo do dia.
    const piggyNameById = new Map(piggyBanks.map((pb) => [pb.id, pb.name]));
    for (const d of piggyDeposits) {
      if (d.expenseId) continue;
      if (!d.depositDate) continue;
      const e = ensure(d.depositDate);
      const amt = Number(d.amount) || 0;
      e.piggyMovements.push({
        id: d.id,
        piggyBankId: d.piggyBankId,
        piggyName: piggyNameById.get(d.piggyBankId),
        amount: amt,
      });
      if (amt >= 0) {
        e.totalExpense += amt;
      } else {
        e.totalIncome += -amt;
      }
    }
    return map;
  }, [incomes, personalExpenses, expenses, cards, openings, year, month, weekDays, piggyDeposits, piggyBanks, sales]);


  const monthTotals = useMemo(() => {
    let inc = 0, exp = 0;
    Object.entries(dayMap).forEach(([date, info]) => {
      const [y, m] = date.split("-").map(Number);
      if (y === year && m === month + 1) {
        inc += info.totalIncome;
        exp += info.totalExpense;
      }
    });
    return { inc, exp, balance: inc - exp };
  }, [dayMap, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  };
  const goToToday = () => {
    const n = todayDateInAppTz();
    setMonth(n.getMonth());
    setYear(n.getFullYear());
    setSelectedDate(formatLocalDate(n));
  };

  const handleDayClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  };

  const handleWeekDayClick = (d: Date) => {
    const dateStr = formatLocalDate(d);
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const emptyDay: DayInfo = { incomes: [], expenses: [], cardInvoices: [], piggyMovements: [], totalIncome: 0, totalExpense: 0 };
  const selectedInfo: DayInfo = selectedDate ? (dayMap[selectedDate] ?? emptyDay) : emptyDay;
  // Saldo previsto acumulado dia a dia.
  // Cobre tanto o mês expandido quanto a semana atual.
  const runningBalanceMap = useMemo(() => {
    const map: Record<string, number> = {};
    // Determinar período: união do mês visível, da semana atual e do mês corrente.
    // Anchorar em "hoje" (onde baseBalance é válido) garante que meses futuros
    // herdem o saldo do último dia do mês anterior em vez de reiniciar em baseBalance.
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const weekStart = weekDays[0];
    const weekEnd = weekDays[weekDays.length - 1];
    const todayRef = todayDateInAppTz();
    const todayMonthStart = new Date(todayRef.getFullYear(), todayRef.getMonth(), 1);
    let start = monthStart < weekStart ? monthStart : weekStart;
    if (todayMonthStart < start) start = todayMonthStart;
    const end = monthEnd > weekEnd ? monthEnd : weekEnd;

    let running = baseBalance;
    const cursor = new Date(start);
    while (cursor <= end) {
      const ds = formatLocalDate(cursor);
      // Override do saldo no dia 1 de cada mês (definido pelo usuário).
      // O override representa o saldo final previsto do dia 1 e ancora a projeção a partir dele.
      // Override do dia 1 sempre é aplicado quando existe — o flag controla apenas
      // se o usuário pode editar/criar novos overrides, nunca remove valores já salvos.
      if (cursor.getDate() === 1) {
        const monthKey = ds.slice(0, 7); // YYYY-MM
        if (overrides[monthKey] !== undefined) {
          running = overrides[monthKey];
          map[ds] = running;
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
      }
      const info = dayMap[ds];
      running += (info?.totalIncome ?? 0) - (info?.totalExpense ?? 0);
      map[ds] = running;
      cursor.setDate(cursor.getDate() + 1);
    }
    return map;
  }, [dayMap, baseBalance, year, month, weekDays, overrides]);

  // Saldo Previsto do último dia do mês selecionado — espelhado em "Saldo mês".
  const monthEndProjectedBalance = useMemo(() => {
    const lastDay = new Date(year, month + 1, 0);
    const ds = formatLocalDate(lastDay);
    return runningBalanceMap[ds] ?? baseBalance;
  }, [runningBalanceMap, year, month, baseBalance]);

  const selectedHasMovement = selectedInfo.totalIncome > 0 || selectedInfo.totalExpense > 0;
  const selectedBalance = selectedDate
    ? (runningBalanceMap[selectedDate] ?? baseBalance)
    : baseBalance;
  // Saldo do dia anterior (base do cálculo do dia)
  const selectedPrevBalance = (() => {
    if (!selectedDate) return baseBalance;
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const prevDs = formatLocalDate(d);
    return runningBalanceMap[prevDs] ?? baseBalance;
  })();

  // Itens individuais do dia (por descrição), ordenados pelo valor.
  const dayIncomeItems = useMemo(
    () => [...selectedInfo.incomes].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)),
    [selectedInfo],
  );
  const dayExpenseItems = useMemo(
    () => [...selectedInfo.expenses].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)),
    [selectedInfo],
  );

  const renderDayDetails = () => {
    if (!selectedDate) return null;
    const isFirstOfMonth = selectedDate.endsWith("-01");
    const monthKeyDay = selectedDate.slice(0, 7);
    const hasOverride = isFirstOfMonth && overrides[monthKeyDay] !== undefined;
    return (
      <>
        <div className="flex items-start justify-between gap-2 mb-3">
          <h4 className="text-sm font-semibold text-foreground capitalize">
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </h4>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground uppercase">Saldo do dia</p>
            <p className={`text-sm font-bold tabular-nums ${selectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
              {formatCurrency(selectedBalance)}
            </p>
          </div>
        </div>

        <div className="space-y-3 md:max-h-[360px] md:overflow-y-auto pr-1">
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <ArrowUpCircle className="h-3.5 w-3.5" /> Receitas
              </div>
              <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(selectedInfo.totalIncome)}
              </span>
            </div>
            {dayIncomeItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1">Sem receitas neste dia.</p>
            ) : (
              <ul className="space-y-1">
                {dayIncomeItems.map((inc) => {
                  const isReceived = inc.status === "received";
                  return (
                    <li key={`inc-${inc.id}`} className="flex items-center justify-between gap-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 px-2.5 py-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span aria-label={isReceived ? "Recebida" : "Pendente"} title={isReceived ? "Recebida" : "Pendente"} className={`h-2 w-2 rounded-full shrink-0 ${isReceived ? "bg-emerald-500" : "bg-rose-500"}`} />
                        <span className="text-xs text-foreground truncate">{inc.description}</span>
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                        {formatCurrency(Number(inc.amount) || 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                <ArrowDownCircle className="h-3.5 w-3.5" /> Despesas
              </div>
              <span className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                {formatCurrency(selectedInfo.totalExpense)}
              </span>
            </div>
            {dayExpenseItems.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1">Sem despesas neste dia.</p>
            ) : (
              <ul className="space-y-1">
                {dayExpenseItems.map((ex) => {
                  const isPaid = !!ex.paid;
                  return (
                    <li key={`exp-${ex.id}`} className="flex items-center justify-between gap-2 rounded-md bg-rose-500/5 border border-rose-500/20 px-2.5 py-1.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span aria-label={isPaid ? "Paga" : "Pendente"} title={isPaid ? "Paga" : "Pendente"} className={`h-2 w-2 rounded-full shrink-0 ${isPaid ? "bg-emerald-500" : "bg-rose-500"}`} />
                        <span className="text-xs text-foreground truncate">{ex.description}</span>
                      </span>
                      <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 tabular-nums shrink-0">
                        {formatCurrency(Number(ex.amount) || 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selectedInfo.cardInvoices.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-400">
                  <CreditCardIcon className="h-3.5 w-3.5" /> Faturas de cartão
                </div>
                <span className="text-xs font-semibold tabular-nums text-violet-700 dark:text-violet-400">
                  {formatCurrency(selectedInfo.cardInvoices.reduce((s, c) => s + c.total, 0))}
                </span>
              </div>
              <ul className="space-y-1">
                {selectedInfo.cardInvoices.map((c) => (
                  <li key={`inv-${c.cardId}`} className="flex items-center justify-between gap-2 rounded-md bg-violet-500/5 border border-violet-500/20 px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-xs text-foreground truncate min-w-0">
                      <CreditCardIcon className="h-3 w-3 text-violet-600 dark:text-violet-400 shrink-0" />
                      <span className="truncate">{c.cardLabel}</span>
                      {c.paid && <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">paga</span>}
                    </span>
                    <span className="text-xs font-semibold text-violet-700 dark:text-violet-400 tabular-nums shrink-0">
                      {formatCurrency(c.total)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-muted-foreground italic mt-1 px-1">
                Faturas em aberto entram no cálculo do saldo previsto do dia.
              </p>
            </section>
          )}

          {selectedInfo.piggyMovements.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  <PiggyBankIcon className="h-3.5 w-3.5" /> Cofrinhos
                </div>
                <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {formatCurrency(selectedInfo.piggyMovements.reduce((s, p) => s - p.amount, 0))}
                </span>
              </div>
              <ul className="space-y-1">
                {selectedInfo.piggyMovements.map((p) => {
                  const isStore = p.amount >= 0;
                  return (
                    <li key={`piggy-${p.id}`} className="flex items-center justify-between gap-2 rounded-md bg-amber-500/5 border border-amber-500/20 px-2.5 py-1.5">
                      <span className="flex items-center gap-1.5 text-xs text-foreground truncate min-w-0">
                        {isStore ? <ArrowDownCircle className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0" /> : <ArrowUpCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                        <span className="truncate">
                          {isStore ? "Guardar" : "Resgatar"}
                          {p.piggyName ? ` · ${p.piggyName}` : ""}
                        </span>
                      </span>
                      <span className={`text-xs font-semibold tabular-nums shrink-0 ${isStore ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                        {isStore ? "-" : "+"}{formatCurrency(Math.abs(p.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[10px] text-muted-foreground italic mt-1 px-1">
                Movimentações dos cofrinhos afetam apenas o saldo previsto, não receitas/despesas.
              </p>
            </section>
          )}

          <div className="rounded-md border border-border bg-card px-3 py-2 space-y-1">
            {isFirstOfMonth ? (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> Saldo de abertura do mês</span>
                <span className="tabular-nums">{hasOverride ? "definido manualmente" : "automático"}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> Saldo previsto do dia anterior</span>
                  <span className="tabular-nums">{formatCurrency(selectedPrevBalance)}</span>
                </div>
                {selectedHasMovement && (
                  <>
                    <div className="flex items-center justify-between text-[11px] text-emerald-700 dark:text-emerald-400">
                      <span>+ Recebimentos do dia</span>
                      <span className="tabular-nums">{formatCurrency(selectedInfo.totalIncome)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-rose-700 dark:text-rose-400">
                      <span>− Despesas do dia</span>
                      <span className="tabular-nums">{formatCurrency(selectedInfo.totalExpense)}</span>
                    </div>
                  </>
                )}
              </>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-border/60">
              <span className="text-xs font-semibold text-foreground">Saldo previsto do dia</span>
              <span className={`text-sm font-bold tabular-nums ${selectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                {formatCurrency(selectedBalance)}
              </span>
            </div>
            {isFirstOfMonth && (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 flex-1"
                  disabled={!allowDay1Override}
                  onClick={() => {
                    setEditValue((overrides[monthKeyDay] ?? selectedBalance).toFixed(2));
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="h-3 w-3" /> Alterar saldo do dia
                </Button>
                {hasOverride && allowDay1Override && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { void clearOverrideBalance(monthKeyDay); }}>
                    <RotateCcw className="h-3 w-3" /> Resetar
                  </Button>
                )}
              </div>
            )}
            {isFirstOfMonth && !allowDay1Override && (
              <p className="text-[10px] text-muted-foreground italic pt-1">
                Edição do saldo do dia 01 está desativada. Ative o botão no topo do calendário para liberar.
              </p>
            )}
            {isFirstOfMonth && allowDay1Override && !hasOverride && (
              <p className="text-[10px] text-muted-foreground italic pt-1">
                Apenas o dia 1 de cada mês pode ter o saldo ajustado manualmente.
              </p>
            )}
          </div>
        </div>
      </>
    );
  };

  return (
    <Card no3d className="animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">
              Calendário diário
            </h3>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              · {monthNames[month]} {year}: <span className={`font-semibold ${monthEndProjectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{formatCurrency(monthEndProjectedBalance)}</span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 gap-1 text-xs"
          >
            {expanded ? (
              <><ChevronUp className="h-3.5 w-3.5" /> Recolher</>
            ) : (
              <><ChevronDown className="h-3.5 w-3.5" /> Expandir</>
            )}
          </Button>
        </div>

        {/* Flag: permitir alterar o saldo do dia 01 */}
        <div className="flex items-center justify-between gap-2 mb-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">Permitir alterar saldo do dia 01</p>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {allowDay1Override
                  ? "Você pode editar o saldo de abertura do mês."
                  : "Edição bloqueada — valores já salvos permanecem aplicados na projeção."}
              </p>
            </div>
          </div>
          <Switch
            checked={allowDay1Override}
            onCheckedChange={toggleAllowDay1Override}
            aria-label="Permitir alterar saldo do dia 01"
          />
        </div>

        {/* Legenda de status dos lançamentos */}
        <div className="flex items-center gap-3 mb-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pago&nbsp;
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-500" /> Pendente&nbsp;
          </span>
        </div>

        <div className={`grid gap-4 ${selectedDate ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"}`}>
          <div className={selectedDate ? "hidden" : ""}>
            {expanded ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <Button variant="ghost" size="icon" onClick={prevMonth}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <button
                    className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
                    onClick={goToToday}
                  >
                    {monthNames[month]} {year}
                  </button>
                  <Button variant="ghost" size="icon" onClick={nextMonth}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-7 gap-1 mb-1">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />;
                    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const info = dayMap[dateStr];
                    const status = getDayStatus(info);
                    const hasMovement = status !== "none";
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;

                    return (
                      <button
                        key={day}
                        onClick={() => handleDayClick(day)}
                        className={`relative flex flex-col items-center justify-center rounded-lg p-1 min-h-[44px] sm:min-h-[44px] text-xs transition-colors
                          ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary" : ""}
                          ${isToday && !isSelected ? "bg-accent font-bold" : ""}
                          ${!isSelected && !isToday && status === "paid" ? "bg-emerald-500/10" : ""}
                          ${!isSelected && !isToday && status === "pending" ? "bg-rose-500/10" : ""}
                          ${!isSelected && !isToday && status === "none" ? "bg-background hover:bg-muted" : ""}
                        `}
                      >
                        <span className={isSelected ? "text-primary-foreground" : "text-foreground"}>
                          {day}
                        </span>
                        {hasMovement && (
                          <span
                            className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                              isSelected
                                ? "bg-primary-foreground"
                                : status === "paid"
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pago
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Pendente
                  </div>
                  <div className="ml-auto">
                    Saldo mês: <span className={`font-semibold ${monthEndProjectedBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{formatCurrency(monthEndProjectedBalance)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground">Semana atual</p>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={goToToday}>Hoje</Button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((d) => {
                    const dateStr = formatLocalDate(d);
                    const info = dayMap[dateStr];
                    const status = getDayStatus(info);
                    const hasMovement = status !== "none";
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={dateStr}
                        onClick={() => handleWeekDayClick(d)}
                        className={`flex flex-col items-center justify-center rounded-lg p-2 min-h-[60px] text-xs transition-colors
                          ${isSelected ? "bg-primary text-primary-foreground ring-2 ring-primary" : ""}
                          ${isToday && !isSelected ? "bg-accent font-bold" : ""}
                          ${!isSelected && !isToday && status === "paid" ? "bg-emerald-500/10" : ""}
                          ${!isSelected && !isToday && status === "pending" ? "bg-rose-500/10" : ""}
                          ${!isSelected && !isToday && status === "none" ? "bg-background hover:bg-muted" : ""}
                        `}
                      >
                        <span className={`text-[10px] uppercase ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {dayNames[d.getDay()]}
                        </span>
                        <span className={`text-base font-semibold ${isSelected ? "text-primary-foreground" : "text-foreground"}`}>
                          {d.getDate()}
                        </span>
                        {hasMovement && (
                          <span
                            className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                              isSelected
                                ? "bg-primary-foreground"
                                : status === "paid"
                                  ? "bg-emerald-500"
                                  : "bg-rose-500"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Toque em <span className="font-medium text-foreground">Expandir</span> para ver o mês inteiro.
                </p>
              </>
            )}
          </div>

          <div className={`rounded-lg border border-border/50 bg-muted/20 p-3 min-h-[200px] animate-fade-in ${selectedDate ? "" : "hidden md:block"}`}>
            {!selectedDate ? (
              <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
                <TrendingUp className="h-7 w-7 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">Selecione um dia para ver os lançamentos.</p>
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between md:hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 -ml-2 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedDate(null)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Voltar ao calendário
                  </Button>
                </div>
                {renderDayDetails()}
              </>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar saldo do dia 1</DialogTitle>
            <DialogDescription>
              Defina o saldo previsto do dia 1 de{" "}
              {selectedDate
                ? new Date(selectedDate + "T00:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
                : ""}
              . A projeção dos próximos dias passa a ser calculada a partir desse valor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="day1-balance">Saldo do dia (R$)</Label>
            <Input
              id="day1-balance"
              type="number"
              step="0.01"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const v = Number(editValue);
                if (!selectedDate || isNaN(v)) return;
                const monthKey = selectedDate.slice(0, 7);
                void setOverrideBalance(monthKey, v);
                setEditOpen(false);
              }}
              disabled={editValue === "" || isNaN(Number(editValue))}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
