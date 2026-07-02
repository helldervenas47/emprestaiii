import { useCallback, useMemo, useRef, useState } from "react";
import { useHideValues } from "@/contexts/HideValuesContext";
import { Loan, Payment, InstallmentSchedule } from "@/types/loan";
import { calculateTotalWithInterest } from "@/hooks/useLoans";
import { getInstallmentAmount, getOverdueAmount } from "@/lib/loanInstallmentAmount";
import {
  getLoanLateFees,
  getBaseRemainingAmount,
  getLoanReceivable,
} from "@/lib/loanLateFees";
import { todayInAppTz } from "@/lib/timezone";
import { rawFormatCurrency } from "@/components/loans/list/formatting";
import {
  getFirstPendingDate,
  getDaysOverdue,
  getLoanCategory,
  getTotalPaid,
} from "@/components/loans/list/calculations";
import type { Category } from "@/components/loans/list/types";

export type SortableCol =
  | "borrowerName"
  | "category"
  | "amount"
  | "remaining"
  | "installments"
  | "dueDate"
  | "tags";

interface ControllerInput {
  loans: Loan[];
  payments: Payment[];
  installmentSchedules: InstallmentSchedule[];
  initialCategory?: Category;
  initialView?: "cards" | "rows" | "folders";
}

const MULTI_SELECT_WINDOW_MS = 2000;

export function useLoanListController({
  loans,
  payments,
  installmentSchedules,
  initialCategory,
  initialView,
}: ControllerInput) {
  const { mask } = useHideValues();
  const formatCurrency = useCallback(
    (v: number) => mask(rawFormatCurrency(v)),
    [mask],
  );

  // View / filters state
  const [view, setView] = useState<"cards" | "rows" | "folders">(initialView ?? "rows");
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([
    initialCategory ?? "all",
  ]);
  const lastClickRef = useRef<{ id: Category; time: number } | null>(null);

  const handleCategoryClick = useCallback((id: Category) => {
    const now = Date.now();
    const last = lastClickRef.current;
    setSelectedCategories((prev) => {
      if (last && last.id === id && now - last.time < MULTI_SELECT_WINDOW_MS) {
        return [id];
      }
      if (last && last.id !== id && now - last.time < MULTI_SELECT_WINDOW_MS) {
        const filtered = prev.filter((c) => c !== "all" && c !== id);
        if (prev.includes(id)) {
          return filtered.length === 0 ? ["all"] : filtered;
        }
        return [...filtered, id];
      }
      return [id];
    });
    lastClickRef.current = { id, time: now };
  }, []);

  const category: Category =
    selectedCategories.length === 1 ? selectedCategories[0] : "all";
  const isMultiSelect = selectedCategories.length > 1;

  const [showFilters, setShowFilters] = useState(false);
  const [dueDateQuick, setDueDateQuick] = useState<
    "yesterday" | "today" | "tomorrow" | null
  >(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dueDateFrom, setDueDateFrom] = useState("");
  const [dueDateTo, setDueDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [notesFilter, setNotesFilter] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<
    "dueDate" | "startDate" | "amount" | "name"
  >("dueDate");

  const [columnSort, setColumnSort] = useState<{
    col: SortableCol;
    dir: "desc" | "asc";
  } | null>(null);
  const cycleColumnSort = useCallback((col: SortableCol) => {
    setColumnSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "desc" };
      if (prev.dir === "desc") return { col, dir: "asc" };
      return null;
    });
  }, []);
  const sortIndicator = useCallback(
    (col: SortableCol) =>
      columnSort?.col === col ? (columnSort.dir === "desc" ? " ▼" : " ▲") : "",
    [columnSort],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    loans.forEach((l) => l.tags?.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [loans]);

  const categorized = useMemo(() => {
    let filtered = loans.filter((l) =>
      l.borrowerName.toLowerCase().includes(search.toLowerCase()),
    );

    if (isMultiSelect) {
      filtered = filtered.filter((l) => {
        const cat = getLoanCategory(l, payments, installmentSchedules);
        return selectedCategories.some((sel) => {
          if (sel === "all") return cat !== "paid";
          if (sel === "parcelado") return l.installments >= 2 && l.status !== "paid";
          if (sel === "venda") return !!l.isSale;
          if (sel === "on_track") return cat === "on_track" || cat === "paid_interest";
          return cat === sel;
        });
      });
    } else if (category === "all") {
      filtered = filtered.filter(
        (l) => getLoanCategory(l, payments, installmentSchedules) !== "paid",
      );
    } else if (category === "parcelado") {
      filtered = filtered.filter((l) => l.installments >= 2 && l.status !== "paid");
    } else if (category === "venda") {
      filtered = filtered.filter((l) => !!l.isSale);
    } else if (category === "on_track") {
      filtered = filtered.filter((l) => {
        const cat = getLoanCategory(l, payments, installmentSchedules);
        return cat === "on_track" || cat === "paid_interest";
      });
    } else {
      filtered = filtered.filter(
        (l) => getLoanCategory(l, payments, installmentSchedules) === category,
      );
    }

    if (dateFrom) filtered = filtered.filter((l) => l.startDate >= dateFrom);
    if (dateTo) filtered = filtered.filter((l) => l.startDate <= dateTo);

    if (dueDateFrom || dueDateTo) {
      filtered = filtered.filter((l) => {
        const next = getFirstPendingDate(l, installmentSchedules);
        const ymd = !isNaN(next.getTime())
          ? `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`
          : l.dueDate || "";
        if (!ymd) return false;
        if (dueDateFrom && ymd < dueDateFrom) return false;
        if (dueDateTo && ymd > dueDateTo) return false;
        return true;
      });
    }
    const minAmt = parseFloat(amountMin);
    const maxAmt = parseFloat(amountMax);
    if (!isNaN(minAmt) && minAmt > 0) filtered = filtered.filter((l) => l.amount >= minAmt);
    if (!isNaN(maxAmt) && maxAmt > 0) filtered = filtered.filter((l) => l.amount <= maxAmt);

    if (tagFilter) filtered = filtered.filter((l) => l.tags?.includes(tagFilter));

    if (notesFilter === "with") {
      filtered = filtered.filter((l) => Boolean(l.notes?.trim()));
    } else if (notesFilter === "without") {
      filtered = filtered.filter((l) => !l.notes?.trim());
    }

    if (dueDateQuick && view === "rows") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(today);
      if (dueDateQuick === "yesterday") target.setDate(target.getDate() - 1);
      else if (dueDateQuick === "tomorrow") target.setDate(target.getDate() + 1);
      const targetStr = target.toISOString().split("T")[0];
      filtered = filtered.filter((l) => l.dueDate === targetStr);
    }

    const defaultSorted = [...filtered].sort((a, b) => {
      if (sortBy === "dueDate") {
        const aDate = getFirstPendingDate(a, installmentSchedules).getTime();
        const bDate = getFirstPendingDate(b, installmentSchedules).getTime();
        if (aDate !== bDate) return aDate - bDate;
        return (a.borrowerName || "").localeCompare(b.borrowerName || "", "pt-BR", { sensitivity: "base" });
      }
      if (sortBy === "startDate") return b.startDate.localeCompare(a.startDate);
      if (sortBy === "amount") {
        const valueOf = (l: Loan) => {
          if (l.installments > 1) {
            const nextSchedule = installmentSchedules.find(
              (s) => s.loanId === l.id && s.installmentNumber === l.paidInstallments + 1,
            );
            const allUnpaid = installmentSchedules.filter(
              (s) => s.loanId === l.id && s.installmentNumber > l.paidInstallments,
            );
            const allUnpaidSum = allUnpaid.reduce((sum, s) => sum + s.amount, 0);
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            const totalPaid = payments
              .filter((p) => p.loanId === l.id)
              .reduce((s, p) => s + p.amount, 0);
            const remainingInstallments = Math.max(1, l.installments - l.paidInstallments);
            const fullInstallment = nextSchedule
              ? nextSchedule.amount
              : l.customInstallmentValue && l.customInstallmentValue > 0
                ? l.customInstallmentValue
                : total / l.installments;
            const actualRemaining =
              l.remainingAmount != null && l.remainingAmount > 0
                ? l.remainingAmount
                : Math.max(0, total - totalPaid);
            const expectedRemaining = nextSchedule
              ? allUnpaidSum
              : fullInstallment * remainingInstallments;
            const partialPaidOnCurrent = Math.max(0, expectedRemaining - actualRemaining);
            return Math.max(0, fullInstallment - partialPaidOnCurrent);
          }
          const base = l.remainingAmount && l.remainingAmount > 0 ? l.remainingAmount : l.amount;
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = l.status !== "paid" ? Number(l.renegotiationPenaltyTotal || 0) : 0;
          return base + fees.lateFees + renegPenalty;
        };
        return valueOf(b) - valueOf(a);
      }
      return a.borrowerName.localeCompare(b.borrowerName);
    });

    if (!columnSort) return defaultSorted;
    const { col, dir } = columnSort;
    const mul = dir === "desc" ? -1 : 1;
    const getVal = (l: Loan): { v: number | string; isNull: boolean } => {
      switch (col) {
        case "borrowerName":
          return { v: (l.borrowerName || "").toLowerCase(), isNull: !l.borrowerName };
        case "category":
          return { v: getLoanCategory(l, payments, installmentSchedules), isNull: false };
        case "amount": {
          if (l.installments > 1) {
            const loanSchedules = installmentSchedules
              .filter((s) => s.loanId === l.id)
              .sort((a, b) => a.installmentNumber - b.installmentNumber);
            let target = loanSchedules.find(
              (s) => s.installmentNumber === l.paidInstallments + 1,
            );
            if (!target)
              target = loanSchedules.find((s) => s.installmentNumber > l.paidInstallments);
            if (!target && loanSchedules.length > 0)
              target = loanSchedules[loanSchedules.length - 1];
            if (target) return { v: Number(target.amount) || 0, isNull: false };
            if (l.customInstallmentValue && l.customInstallmentValue > 0)
              return { v: l.customInstallmentValue, isNull: false };
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            return { v: total / l.installments, isNull: false };
          }
          const base = l.remainingAmount && l.remainingAmount > 0 ? l.remainingAmount : l.amount;
          return { v: Number(base) || 0, isNull: l.amount == null };
        }
        case "remaining": {
          if (l.status === "paid") return { v: getTotalPaid(l, payments), isNull: false };
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = Number(l.renegotiationPenaltyTotal || 0);
          if (l.installments > 1) {
            const loanSchedules = installmentSchedules
              .filter((s) => s.loanId === l.id)
              .sort((a, b) => a.installmentNumber - b.installmentNumber);
            const nextSchedule =
              loanSchedules.find((s) => s.installmentNumber === l.paidInstallments + 1) ||
              loanSchedules.find((s) => s.installmentNumber > l.paidInstallments);
            const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            const totalPaid = payments
              .filter((p) => p.loanId === l.id)
              .reduce((s, p) => s + p.amount, 0);
            const remainingInstallments = Math.max(1, l.installments - l.paidInstallments);
            const fullInstallment = nextSchedule
              ? nextSchedule.amount
              : l.customInstallmentValue && l.customInstallmentValue > 0
                ? l.customInstallmentValue
                : total / l.installments;
            const actualRemaining =
              l.remainingAmount != null && l.remainingAmount > 0
                ? l.remainingAmount
                : Math.max(0, total - totalPaid);
            const allUnpaidSum = loanSchedules
              .filter((s) => s.installmentNumber > l.paidInstallments)
              .reduce((sum, s) => sum + s.amount, 0);
            const expectedRemaining = nextSchedule
              ? allUnpaidSum
              : fullInstallment * remainingInstallments;
            const partialPaidOnCurrent = Math.max(0, expectedRemaining - actualRemaining);
            const currentInstallmentRemaining = Math.max(
              0,
              fullInstallment - partialPaidOnCurrent,
            );
            return { v: currentInstallmentRemaining + fees.lateFees + renegPenalty, isNull: false };
          }
          const base = getBaseRemainingAmount(l, payments, installmentSchedules);
          return { v: base + fees.lateFees + renegPenalty, isNull: false };
        }
        case "installments":
          return { v: Number(l.installments) || 0, isNull: false };
        case "dueDate": {
          const t = getFirstPendingDate(l, installmentSchedules).getTime();
          return { v: t, isNull: !isFinite(t) || isNaN(t) };
        }
        case "tags": {
          const t = (l.tags && l.tags[0]) || "";
          return { v: t.toLowerCase(), isNull: !t };
        }
      }
    };
    return [...defaultSorted].sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va.isNull && vb.isNull) return 0;
      if (va.isNull) return 1;
      if (vb.isNull) return -1;
      if (typeof va.v === "number" && typeof vb.v === "number")
        return (va.v - vb.v) * mul;
      return String(va.v).localeCompare(String(vb.v)) * mul;
    });
  }, [
    loans,
    payments,
    installmentSchedules,
    search,
    category,
    selectedCategories,
    isMultiSelect,
    dateFrom,
    dateTo,
    dueDateFrom,
    dueDateTo,
    amountMin,
    amountMax,
    tagFilter,
    notesFilter,
    sortBy,
    dueDateQuick,
    view,
    columnSort,
  ]);

  const folderCount = useMemo(() => {
    const byName: Record<string, number> = {};
    loans.forEach((l) => {
      byName[l.borrowerName] = (byName[l.borrowerName] || 0) + 1;
    });
    return Object.values(byName).filter((c) => c > 1).length;
  }, [loans]);

  const counts = useMemo(() => {
    const cats = loans.map((l) => getLoanCategory(l, payments, installmentSchedules));
    return {
      all: cats.filter((c) => c !== "paid").length,
      parcelado: loans.filter((l) => l.installments >= 2 && l.status !== "paid").length,
      overdue: cats.filter((c) => c === "overdue").length,
      paid_interest: cats.filter((c) => c === "paid_interest").length,
      paid: cats.filter((c) => c === "paid").length,
      due_today: cats.filter((c) => c === "due_today").length,
      on_track: cats.filter((c) => c === "on_track" || c === "paid_interest").length,
      venda: loans.filter((l) => !!l.isSale && l.status !== "paid").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans, payments, folderCount]);

  const summaryData = useMemo(() => {
    const source = categorized;
    const activeSource = source.filter((l) => l.status !== "paid");
    const totalLentRaw = activeSource.reduce((s, l) => s + l.amount, 0);

    if (category === "paid") {
      const totalPaidSum = source
        .filter((l) => l.status === "paid")
        .reduce((s, l) => s + getTotalPaid(l, payments), 0);
      const totalInterestPaid = source.reduce(
        (s, l) =>
          s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
        0,
      );
      return {
        totalLent: totalLentRaw,
        totalToReceive: totalPaidSum,
        totalInterest: totalInterestPaid,
        activeCount: source.filter((l) => l.status === "active").length,
        overdueCount: 0,
      };
    }

    const useDueDateValues = dueDateQuick && view === "rows";
    const totalToReceive = activeSource.reduce((s, l) => {
      if (useDueDateValues) {
        const isParcelado =
          (l.paymentType === "Parcelado" || l.installments >= 2) &&
          l.paidInstallments < l.installments;
        if (isParcelado) {
          const unpaid = installmentSchedules
            .filter((sc) => sc.loanId === l.id && sc.installmentNumber > l.paidInstallments)
            .sort((a, b) => a.installmentNumber - b.installmentNumber);
          const next = unpaid[0];
          const remainingInst = Math.max(1, l.installments - l.paidInstallments);
          const remaining =
            l.remainingAmount != null && l.remainingAmount > 0
              ? l.remainingAmount
              : Math.max(
                  0,
                  calculateTotalWithInterest(l.amount, l.interestRate, l.installments) -
                    payments
                      .filter((p) => p.loanId === l.id)
                      .reduce((ss, p) => ss + p.amount, 0),
                );
          const instValue = next
            ? next.amount
            : l.customInstallmentValue != null && l.customInstallmentValue > 0
              ? l.customInstallmentValue
              : remaining / remainingInst;
          return s + instValue;
        }
        if (l.remainingAmount != null && l.remainingAmount > 0) return s + l.remainingAmount;
        const expected = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
        const paid = payments
          .filter((p) => p.loanId === l.id)
          .reduce((ss, p) => ss + p.amount, 0);
        return s + Math.max(0, expected - paid);
      }
      // Padrão: usa getLoanReceivable (restante + multa/juros de atraso + multa de
      // renegociação em contratos de parcela única) — mesma base do card "Total a Receber".
      return s + getLoanReceivable(l, payments, installmentSchedules);
    }, 0);
    const totalLent = totalLentRaw;

    const totalInterest = source.reduce(
      (s, l) =>
        s + (calculateTotalWithInterest(l.amount, l.interestRate, l.installments) - l.amount),
      0,
    );
    const activeCount = source.filter((l) => l.status === "active").length;
    const overdueCount = source.filter(
      (l) => getDaysOverdue(l) > 0 && l.status !== "paid",
    ).length;
    return { totalLent, totalToReceive, totalInterest, activeCount, overdueCount };
  }, [categorized, payments, dueDateQuick, view, installmentSchedules, category]);

  const statusSummary = useMemo(() => {
    const today = todayInAppTz();
    const currentMonth = today.slice(0, 7);
    let overdue = 0;
    let dueToday = 0;
    let onTrack = 0;
    let totalReceivable = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let onTrackCount = 0;
    let totalReceivableCount = 0;
    for (const l of loans) {
      if (l.status === "paid") continue;
      const cat = getLoanCategory(l, payments, installmentSchedules);
      const receivable = getLoanReceivable(l, payments, installmentSchedules);
      totalReceivable += receivable;
      totalReceivableCount += 1;
      if (cat === "overdue") {
        overdue += getOverdueAmount(l, installmentSchedules, today);
        overdueCount += 1;
        continue;
      }
      if (cat === "due_today") {
        const isParcelado = l.installments >= 2;
        dueToday += isParcelado
          ? getInstallmentAmount(l, installmentSchedules)
          : receivable;
        dueTodayCount += 1;
      } else if (cat === "on_track" || cat === "paid_interest") {
        const due = l.dueDate || "";
        if (due.slice(0, 7) === currentMonth) {
          onTrack += receivable;
          onTrackCount += 1;
        }
      }
    }
    return {
      overdue,
      dueToday,
      onTrack,
      total: totalReceivable,
      overdueCount,
      dueTodayCount,
      onTrackCount,
      totalCount: totalReceivableCount,
    };
  }, [loans, payments, installmentSchedules]);

  const applyCardFilter = useCallback(
    (cardId: "overdue" | "due_today" | "on_track" | "all") => {
      setSelectedCategories([cardId]);
      setDueDateQuick(null);
      if (cardId === "on_track") {
        const today = todayInAppTz();
        const [y, m] = today.split("-");
        const firstOfMonth = `${y}-${m}-01`;
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        const lastOfMonth = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
        setDueDateFrom(firstOfMonth);
        setDueDateTo(lastOfMonth);
      } else {
        setDueDateFrom("");
        setDueDateTo("");
      }
    },
    [],
  );

  // Grouping (for "folders" view)
  const grouping = useMemo(() => {
    const byName: Record<string, Loan[]> = {};
    categorized.forEach((l) => {
      (byName[l.borrowerName] ??= []).push(l);
    });
    const grouped: Array<{
      name: string;
      loans: Loan[];
      totalAmount: number;
      totalPaid: number;
      totalReceivable: number;
      hasOverdue: boolean;
    }> = [];
    const singles: Loan[] = [];
    Object.entries(byName).forEach(([name, loansArr]) => {
      if (loansArr.length > 1) {
        const totalPaid = loansArr.reduce((s, l) => s + getTotalPaid(l, payments), 0);
        const totalReceivable = loansArr.reduce((s, l) => {
          if (l.status === "paid") return s;
          const base = getBaseRemainingAmount(l, payments, installmentSchedules);
          const fees = getLoanLateFees(l, payments, installmentSchedules);
          const renegPenalty = Number(l.renegotiationPenaltyTotal || 0);
          return s + Math.max(0, base + fees.lateFees + renegPenalty);
        }, 0);
        const hasOverdue = loansArr.some(
          (l) =>
            l.status !== "paid" &&
            getLoanCategory(l, payments, installmentSchedules) === "overdue",
        );
        grouped.push({
          name,
          loans: loansArr,
          totalAmount: loansArr.reduce((s, l) => s + l.amount, 0),
          totalPaid,
          totalReceivable: Math.round(totalReceivable * 100) / 100,
          hasOverdue,
        });
      } else {
        singles.push(loansArr[0]);
      }
    });
    grouped.sort((a, b) => {
      const getEarliestDue = (g: { loans: Loan[] }) => {
        const activeLoans = g.loans.filter((l) => l.status !== "paid");
        if (activeLoans.length === 0) return "9999-12-31";
        return activeLoans.reduce((earliest, l) => {
          const date = l.dueDate;
          return date < earliest ? date : earliest;
        }, "9999-12-31");
      };
      return getEarliestDue(a).localeCompare(getEarliestDue(b));
    });
    return { grouped, singles };
  }, [categorized, payments, installmentSchedules]);

  return {
    // formatting
    formatCurrency,
    // view + search
    view,
    setView,
    search,
    setSearch,
    // categories
    selectedCategories,
    handleCategoryClick,
    category,
    // filters
    showFilters,
    setShowFilters,
    dueDateQuick,
    setDueDateQuick,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    dueDateFrom,
    setDueDateFrom,
    dueDateTo,
    setDueDateTo,
    amountMin,
    setAmountMin,
    amountMax,
    setAmountMax,
    tagFilter,
    setTagFilter,
    notesFilter,
    setNotesFilter,
    sortBy,
    setSortBy,
    // sorting
    cycleColumnSort,
    sortIndicator,
    // derived
    allTags,
    categorized,
    counts,
    summaryData,
    statusSummary,
    grouped: grouping.grouped,
    singles: grouping.singles,
    // actions
    applyCardFilter,
  };
}
