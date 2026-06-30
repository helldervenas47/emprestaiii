import { useMemo } from "react";
import { todayInAppTz } from "@/lib/timezone";
import { calculateMonthlyInterestRate } from "@/lib/monthlyInterestRate";
import {
  calculateInstallment,
  calculateTotalWithInterest,
  getLoanRemainingAmount,
} from "@/hooks/useLoans";
import {
  getOverdueAmount,
  getOverdueInstallments,
} from "@/lib/loanInstallmentAmount";
import type {
  Loan,
  Sale,
  Payment,
  Expense,
  InstallmentSchedule,
} from "@/types/loan";
import type { LedgerEntry } from "@/lib/ledger";
import {
  isInRange,
  monthNames,
  summarizeMonthMetrics,
} from "@/components/dashboard/dashboardHelpers";

interface UseDashboardMetricsInput {
  loans: Loan[];
  sales: Sale[];
  payments: Payment[];
  expenses: Expense[];
  installmentSchedules: InstallmentSchedule[];
  ledgerEntries: LedgerEntry[];
  range: { start: Date; end: Date; label: string };
  period: "day" | "week" | "month";
  includeSales: boolean;
  comparisonWindow: 3 | 6 | 12;
  chartOverrides: Record<string, { emprestado?: number; recebido?: number }>;
  interestOverrides: Record<string, number>;
  paymentMethods: { id: string; name: string; icon: string }[];
  profitGoal: { targetValue: number } | undefined | null;
  receivedDetailMethodId: string | null;
}

function getChartLabel(start: Date) {
  return `${monthNames[start.getMonth()].slice(0, 3)}/${String(start.getFullYear()).slice(2)}`;
}

/**
 * Concentra todos os memos pesados do DashboardOverview:
 * data, receivedByMethod, receivedDetail, profitTargetAmount, portfolio,
 * monthComparison, yearlyAverages, riskReturn, monthlyChartBase/Chart,
 * interestChartBase/Chart. Não altera regra de negócio.
 */
export function useDashboardMetrics(input: UseDashboardMetricsInput) {
  const {
    loans, sales, payments, expenses, installmentSchedules, ledgerEntries,
    range, period, includeSales, comparisonWindow, chartOverrides, interestOverrides,
    paymentMethods, profitGoal, receivedDetailMethodId,
  } = input;

  const data = useMemo(() => {
    const filteredPayments = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const filteredSales = sales.filter((s) => isInRange(s.date, range.start, range.end));
    let incomeFromPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);

    const salesWithReceived = sales.filter((sale) => sale.businessType !== "aluguel_veiculo").map((sale) => {
      const history = sale.paymentHistory || [];
      let received = 0;
      const receipts: { amount: number; date: string; type: "downPayment" | "full" | "partial" | "legacy" }[] = [];

      if ((sale.downPayment || 0) > 0 && isInRange(sale.date, range.start, range.end)) {
        received += sale.downPayment;
        receipts.push({ amount: sale.downPayment, date: sale.date, type: "downPayment" });
      }

      if (history.length > 0) {
        history.forEach((rec) => {
          if (isInRange(rec.date, range.start, range.end)) {
            received += rec.amount || 0;
            receipts.push({ amount: rec.amount || 0, date: rec.date, type: rec.type });
          }
        });
      } else {
        const dates = sale.installmentDates || [];
        const amounts = sale.installmentAmounts || [];
        const fallbackInstAmount = sale.installmentValue
          || (sale.installments > 0 ? sale.total / sale.installments : 0);

        if (dates.length > 0 && sale.paidInstallments > 0) {
          for (let i = 0; i < sale.paidInstallments; i++) {
            const d = dates[i];
            const amt = amounts[i] ?? fallbackInstAmount;
            if (d && isInRange(d, range.start, range.end) && amt > 0) {
              received += amt;
              receipts.push({ amount: amt, date: d, type: "legacy" });
            }
          }
          if ((sale.partialPaid || 0) > 0 && isInRange(sale.date, range.start, range.end)) {
            received += sale.partialPaid;
            receipts.push({ amount: sale.partialPaid, date: sale.date, type: "legacy" });
          }
        } else if (isInRange(sale.date, range.start, range.end)) {
          let legacy = 0;
          if (amounts.length > 0) {
            for (let i = 0; i < sale.paidInstallments; i++) legacy += amounts[i] || 0;
          } else {
            legacy = sale.paidInstallments * fallbackInstAmount;
          }
          legacy += sale.partialPaid || 0;
          if (legacy > 0) {
            received += legacy;
            receipts.push({ amount: legacy, date: sale.date, type: "legacy" });
          }
        }
      }

      return { ...sale, received, receipts };
    }).filter((s) => s.received > 0);

    const incomeFromSales = salesWithReceived.reduce((s, x) => s + x.received, 0);

    const filteredLoans = loans.filter((l) => isInRange(l.startDate, range.start, range.end));
    let totalLoanOutgoing = filteredLoans.reduce((s, l) => s + l.amount, 0);

    const filteredExpenses = expenses.filter((e) => e.paid && e.paidDate && isInRange(e.paidDate, range.start, range.end));
    const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);

    if (period === "month") {
      const label = getChartLabel(range.start);
      const override = chartOverrides[label];
      if (override) {
        if (override.emprestado !== undefined) totalLoanOutgoing += override.emprestado;
        if (override.recebido !== undefined) incomeFromPayments += override.recebido;
      }
    }

    const totalIncome = incomeFromPayments + (includeSales ? incomeFromSales : 0);
    const totalOutgoing = totalLoanOutgoing + totalExpenses;
    const balance = totalIncome - totalOutgoing;

    const transactions: { id: string; type: "in" | "out"; source: "payment" | "sale" | "loan" | "expense" | "ledger"; description: string; amount: number; date: string; createdAt?: string }[] = [];
    const visibleLoanIds = new Set(loans.map((loan) => loan.id));
    const visiblePaymentLedgerEntries = ledgerEntries.filter((entry) => (
      entry.category === "payment"
      && entry.direction === "in"
      && (!entry.loan_id || visibleLoanIds.has(entry.loan_id))
      && isInRange(entry.occurred_on, range.start, range.end)
    ));
    const paymentIdsFromLedger = new Set(
      visiblePaymentLedgerEntries
        .filter((entry) => entry.payment_id)
        .map((entry) => entry.payment_id as string),
    );

    filteredPayments.forEach((p) => {
      if (paymentIdsFromLedger.has(p.id)) return;
      const metadata = p.metadata ?? {};
      if (metadata.kind === "late_fee" && typeof metadata.consolidated_with === "string" && paymentIdsFromLedger.has(metadata.consolidated_with)) return;
      const loan = loans.find((l) => l.id === p.loanId);
      transactions.push({ id: p.id, type: "in", source: "payment", description: `Parcela ${p.installmentNumber} — ${loan?.borrowerName || "Empréstimo"}`, amount: p.amount, date: p.date, createdAt: p.createdAt });
    });
    visiblePaymentLedgerEntries.forEach((entry) => {
      transactions.push({
        id: entry.payment_id || entry.id,
        type: "in",
        source: entry.payment_id ? "payment" : "ledger",
        description: entry.description || "Pagamento recebido",
        amount: Number(entry.amount) || 0,
        date: entry.occurred_on,
        createdAt: entry.created_at,
      });
    });
    filteredLoans.forEach((l) => {
      transactions.push({ id: l.id, type: "out", source: "loan", description: `Empréstimo para ${l.borrowerName}`, amount: l.amount, date: l.startDate });
    });
    filteredExpenses.forEach((e) => {
      transactions.push({ id: e.id, type: "out", source: "expense", description: `Despesa: ${e.description}`, amount: e.amount, date: e.paidDate! });
    });
    transactions.sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    const monthlyInterestRate = calculateMonthlyInterestRate(filteredLoans);

    const interestExpectedRecords: { borrowerName: string; dueDate: string; installmentNumber: number; totalInstallments: number; installmentAmount: number; interestPortion: number; loanStatus: string; paid: boolean; tags: string[] }[] = [];
    const periodProfitExpected = loans.reduce((sum, loan) => {
      const totalWithInterest = calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments);
      const totalInterest = Math.max(0, totalWithInterest - loan.amount);
      if (totalInterest <= 0) return sum;
      const interestRatio = totalWithInterest > 0 ? 1 - (loan.amount / totalWithInterest) : 0;
      const isInstallmentPaid = (n: number) => loan.status === "paid" || n <= (loan.paidInstallments || 0);

      if (loan.installments >= 2) {
        const interestPerInstallment = totalInterest / loan.installments;
        const loanSchedules = installmentSchedules.filter((sc) => sc.loanId === loan.id);
        if (loanSchedules.length > 0) {
          let acc = 0;
          loanSchedules
            .filter((sc) => isInRange(sc.dueDate, range.start, range.end))
            .forEach((sc) => {
              const interest = sc.amount * interestRatio;
              acc += interest;
              interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: sc.dueDate, installmentNumber: sc.installmentNumber, totalInstallments: loan.installments, installmentAmount: sc.amount, interestPortion: interest, loanStatus: loan.status, paid: isInstallmentPaid(sc.installmentNumber), tags: loan.tags || [] });
            });
          return sum + acc;
        }
        if (!loan.dueDate) return sum;
        const baseDate = new Date(loan.dueDate + "T00:00:00");
        if (isNaN(baseDate.getTime())) return sum;
        const installmentAmount = totalWithInterest / loan.installments;
        let acc = 0;
        for (let i = 0; i < loan.installments; i++) {
          const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
          const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (isInRange(dStr, range.start, range.end)) {
            acc += interestPerInstallment;
            interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: dStr, installmentNumber: i + 1, totalInstallments: loan.installments, installmentAmount, interestPortion: interestPerInstallment, loanStatus: loan.status, paid: isInstallmentPaid(i + 1), tags: loan.tags || [] });
          }
        }
        return sum + acc;
      }
      if (loan.dueDate && isInRange(loan.dueDate, range.start, range.end)) {
        interestExpectedRecords.push({ borrowerName: loan.borrowerName, dueDate: loan.dueDate, installmentNumber: 1, totalInstallments: 1, installmentAmount: totalWithInterest, interestPortion: totalInterest, loanStatus: loan.status, paid: isInstallmentPaid(1), tags: loan.tags || [] });
        return sum + totalInterest;
      }
      return sum;
    }, 0);

    const interestOnlyInPeriod = payments
      .filter((p) => p.installmentNumber === 0 && isInRange(p.date, range.start, range.end))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const periodProfitExpectedWithInterestOnly = periodProfitExpected + interestOnlyInPeriod;
    void periodProfitExpectedWithInterestOnly;

    interestExpectedRecords.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const paymentsInPeriod = payments.filter((p) => isInRange(p.date, range.start, range.end));
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });

    const interestByPaymentId = new Map<string, number>();
    const loanInterestRemaining = new Map<string, number>();
    loans.forEach((l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      loanInterestRemaining.set(l.id, Math.max(0, total - l.amount));
    });

    paymentsSorted.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt <= 0) {
        interestByPaymentId.set(p.id, 0);
        return;
      }
      if (p.installmentNumber === 0 || p.installmentNumber === -2) {
        interestByPaymentId.set(p.id, amt);
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - amt));
      } else if (p.installmentNumber === -3) {
        interestByPaymentId.set(p.id, 0);
      } else if (p.installmentNumber === -1) {
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      } else {
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      }
    });

    const paidLoanIds = new Set(loans.filter((l) => l.status === "paid").map((l) => l.id));
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });

    loans.forEach((l) => {
      if (l.status !== "paid") return;
      const lastId = lastPaymentByLoanId.get(l.id);
      if (!lastId) return;
      const totalPaid = payments
        .filter((p) => p.loanId === l.id)
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const principalRef = l.originalAmount != null && l.originalAmount > 0 ? l.originalAmount : l.amount;
      const totalExpected = calculateTotalWithInterest(principalRef, l.interestRate, l.installments);
      const expectedInterest = Math.max(0, totalExpected - principalRef);
      const allocatedInterest = payments
        .filter((p) => p.loanId === l.id)
        .reduce((s, p) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
      const realProfit = totalPaid - principalRef;
      const diff = realProfit - allocatedInterest;
      if (Math.abs(diff) < 0.005) return;
      const cur = interestByPaymentId.get(lastId) ?? 0;
      interestByPaymentId.set(lastId, Math.max(0, cur + diff));
      loanInterestRemaining.set(l.id, 0);
      void expectedInterest;
    });

    const periodProfitRealized = paymentsInPeriod.reduce(
      (s, p) => s + (interestByPaymentId.get(p.id) ?? 0),
      0,
    );

    const interestDetailRecords: { borrowerName: string; date: string; totalPayment: number; interestPortion: number; type: "juros" | "quitação" | "parcial"; tags: string[] }[] = [];
    paymentsInPeriod.forEach((p) => {
      const interest = interestByPaymentId.get(p.id) ?? 0;
      if (interest <= 0.005) return;
      const loan = loans.find((l) => l.id === p.loanId);
      if (!loan) return;
      const isLastOfPaid = paidLoanIds.has(loan.id) && lastPaymentByLoanId.get(loan.id) === p.id;
      const type: "juros" | "quitação" | "parcial" = isLastOfPaid
        ? "quitação"
        : p.installmentNumber === -1
          ? "parcial"
          : "juros";
      interestDetailRecords.push({
        borrowerName: loan.borrowerName,
        date: p.date,
        totalPayment: Number(p.amount) || 0,
        interestPortion: interest,
        type,
        tags: loan.tags || [],
      });
    });
    interestDetailRecords.sort((a, b) => b.date.localeCompare(a.date));

    const totalProfitExpected = interestExpectedRecords
      .filter((r) => !r.paid)
      .reduce((s, r) => s + r.interestPortion, 0);
    const totalProfitRealized = periodProfitRealized;
    const previstoTotal = totalProfitRealized + totalProfitExpected;
    const periodProfitPct = previstoTotal > 0 ? Math.round((totalProfitRealized / previstoTotal) * 100) : 0;

    return { totalIncome, incomeFromPayments, incomeFromSales, totalOutgoing, totalLoanOutgoing, totalExpenses, balance, transactions, loanCount: filteredLoans.length, saleCount: filteredSales.length, paymentCount: filteredPayments.length, expenseCount: filteredExpenses.length, monthlyInterestRate, filteredPayments, filteredLoans, filteredExpenses, salesWithReceived, periodProfitExpected: totalProfitExpected, periodProfitRealized: totalProfitRealized, periodProfitPct, interestDetailRecords, interestExpectedRecords };
  }, [loans, sales, payments, expenses, range, includeSales, period, chartOverrides, installmentSchedules, ledgerEntries]);

  const receivedByMethod = useMemo(() => {
    const byId: Record<string, number> = {};
    let unassigned = 0;
    let total = 0;
    data.filteredPayments.forEach((p) => {
      const amount = Number(p.amount) || 0;
      if (amount <= 0) return;
      total += amount;
      const split = (p.metadata as any)?.split?.parts as Array<{ paymentMethodId: string | null; amount: number }> | undefined;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((part) => {
          const v = Number(part.amount) || 0;
          if (v <= 0) return;
          if (part.paymentMethodId) byId[part.paymentMethodId] = (byId[part.paymentMethodId] || 0) + v;
          else unassigned += v;
        });
      } else if (p.paymentMethodId) {
        byId[p.paymentMethodId] = (byId[p.paymentMethodId] || 0) + amount;
      } else {
        unassigned += amount;
      }
    });
    const items = paymentMethods
      .map((m) => ({ id: m.id, name: m.name, icon: m.icon, amount: byId[m.id] || 0 }))
      .filter((it) => it.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { total, items, unassigned };
  }, [data.filteredPayments, paymentMethods]);

  const receivedDetail = useMemo(() => {
    if (!receivedDetailMethodId) return null;
    const targetId = receivedDetailMethodId === "__unassigned__" ? null : receivedDetailMethodId;
    const method = targetId ? paymentMethods.find((m) => m.id === targetId) : null;
    const methodName = targetId ? (method?.name ?? "Forma desconhecida") : "Sem forma definida";
    type Row = { id: string; date: string; borrowerName: string; amount: number; loanId: string };
    const rows: Row[] = [];
    data.filteredPayments.forEach((p) => {
      const loan = loans.find((l) => l.id === p.loanId);
      const borrowerName = loan?.borrowerName ?? "—";
      const split = (p.metadata as any)?.split?.parts as Array<{ paymentMethodId: string | null; amount: number }> | undefined;
      if (Array.isArray(split) && split.length > 0) {
        split.forEach((part, idx) => {
          const v = Number(part.amount) || 0;
          if (v <= 0) return;
          if ((part.paymentMethodId ?? null) === targetId) {
            rows.push({ id: `${p.id}-${idx}`, date: p.date, borrowerName, amount: v, loanId: p.loanId });
          }
        });
      } else {
        const amount = Number(p.amount) || 0;
        if (amount <= 0) return;
        const pid = p.paymentMethodId ?? null;
        if (pid === targetId) {
          rows.push({ id: p.id, date: p.date, borrowerName, amount, loanId: p.loanId });
        }
      }
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { methodName, rows, total };
  }, [receivedDetailMethodId, data.filteredPayments, loans, paymentMethods]);

  const profitTargetAmount = useMemo(() => {
    if (!profitGoal) return 0;
    const previstoTotal = data.periodProfitRealized + data.periodProfitExpected;
    return previstoTotal * (profitGoal.targetValue / 100);
  }, [data.periodProfitExpected, data.periodProfitRealized, profitGoal]);

  const portfolio = useMemo(() => {
    const activeLoans = loans.filter((l) => l.status !== "paid");
    const totalLoans = loans.length;
    const allPaymentsForActive = payments.filter((p) => activeLoans.some((l) => l.id === p.loanId));

    const capitalOnStreet = activeLoans.reduce((s, l) => {
      const n = l.installments > 0 ? l.installments : 1;
      const paid = Math.min(l.paidInstallments ?? 0, n);
      const remainingRatio = Math.max(0, (n - paid) / n);
      return s + l.amount * remainingRatio;
    }, 0);

    const totalExpected = loans.reduce((s, l) => s + calculateTotalWithInterest(l.amount, l.interestRate, l.installments), 0);
    const totalPrincipal = loans.reduce((s, l) => s + l.amount, 0);
    const totalInterestExpected = totalExpected - totalPrincipal;
    void totalInterestExpected;
    const globalInterestRate = totalPrincipal > 0 ? ((totalExpected - totalPrincipal) / totalPrincipal) * 100 : 0;

    const todayNorm = new Date(); todayNorm.setHours(0, 0, 0, 0);
    const totalToReceive = activeLoans.reduce((s, l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const dueDate = new Date(l.dueDate + "T00:00:00");
      const daysLate = Math.max(0, Math.floor((todayNorm.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      let lateFees = 0;
      if (l.lateInterestValue != null && l.lateInterestValue > 0 && daysLate > 0) {
        const baseRemaining = l.remainingAmount != null && l.remainingAmount > 0 ? l.remainingAmount : Math.max(0, total - allPaymentsForActive.filter((p) => p.loanId === l.id).reduce((ss, p) => ss + p.amount, 0));
        lateFees += l.lateInterestType === "fixed"
          ? l.lateInterestValue * daysLate
          : baseRemaining * (l.lateInterestValue / 100) * daysLate;
      }
      if (l.penaltyValue != null && l.penaltyValue > 0 && daysLate > 0) {
        lateFees += l.penaltyValue;
      }
      const interestPaymentsReceived = payments
        .filter((p) => p.loanId === l.id && p.installmentNumber === 0)
        .reduce((sum, p) => sum + p.amount, 0);
      return s + Math.round((total + lateFees + interestPaymentsReceived) * 100) / 100;
    }, 0);

    const totalReceived = payments.reduce((s, p) => s + p.amount, 0);
    const estimatedProfit = activeLoans.reduce((s, l) => s + getLoanRemainingAmount(l, payments), 0) - capitalOnStreet;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    let interestDueThisMonth = 0;
    activeLoans.forEach((l) => {
      const totalWithInterest = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      const principalPerInstallment = l.installments > 0 ? l.amount / l.installments : 0;
      const installmentAmount = calculateInstallment(l.amount, l.interestRate, l.installments);
      const interestPerInstallment = installmentAmount - principalPerInstallment;

      if (l.installments >= 2) {
        const schedulesThisMonth = installmentSchedules.filter((sc) => {
          if (sc.loanId !== l.id) return false;
          const d = new Date(sc.dueDate + "T00:00:00");
          return d >= monthStart && d <= monthEnd;
        });
        if (schedulesThisMonth.length > 0) {
          schedulesThisMonth.forEach((sc) => {
            const interestRatio = totalWithInterest > 0 ? 1 - (l.amount / totalWithInterest) : 0;
            interestDueThisMonth += sc.amount * interestRatio;
          });
        } else {
          const dueD = new Date(l.dueDate + "T00:00:00");
          if (dueD >= monthStart && dueD <= monthEnd) {
            interestDueThisMonth += interestPerInstallment;
          }
        }
      } else {
        const dueD = new Date(l.dueDate + "T00:00:00");
        if (dueD >= monthStart && dueD <= monthEnd) {
          interestDueThisMonth += totalWithInterest - l.amount;
        }
      }
    });

    const todayStr = todayInAppTz();
    const overdueLoans = activeLoans.filter((l) => getOverdueInstallments(l, installmentSchedules, todayStr).length > 0);
    const overdueAmount = overdueLoans.reduce((s, l) => s + getOverdueAmount(l, installmentSchedules, todayStr), 0);
    const pendingReceivable = activeLoans.reduce((s, l) => s + getLoanRemainingAmount(l, payments), 0);

    const receivingRate = totalExpected > 0 ? (totalReceived / totalExpected) * 100 : 0;
    const defaultRate = totalLoans > 0 ? (overdueLoans.length / totalLoans) * 100 : 0;
    const profitMargin = totalPrincipal > 0 ? ((totalReceived - totalPrincipal) / totalPrincipal) * 100 : 0;

    const receivingScore = Math.min(100, receivingRate);
    const defaultScore = Math.max(0, 100 - defaultRate * 2);
    const profitScore = Math.min(100, Math.max(0, 50 + profitMargin));
    const score = Math.round(receivingScore * 0.4 + defaultScore * 0.35 + profitScore * 0.25);

    const todayForecast = new Date(); todayForecast.setHours(0, 0, 0, 0);
    const dayOfWeek = todayForecast.getDay();
    const nextSunday = new Date(todayForecast);
    if (dayOfWeek !== 0) {
      nextSunday.setDate(nextSunday.getDate() + (7 - dayOfWeek));
    }
    nextSunday.setHours(23, 59, 59, 999);

    const endOfMonth = new Date(todayForecast.getFullYear(), todayForecast.getMonth() + 1, 0, 23, 59, 59, 999);

    const calcForecast = (limitDate: Date) => {
      let sum = 0;
      activeLoans.forEach((l) => {
        if (l.installments >= 2) {
          installmentSchedules.filter((sc) => {
            if (sc.loanId !== l.id) return false;
            if (sc.installmentNumber <= l.paidInstallments) return false;
            const d = new Date(sc.dueDate + "T00:00:00");
            return d <= limitDate;
          }).forEach((sc) => { sum += sc.amount; });
        } else {
          if (l.paidInstallments < 1) {
            const d = new Date(l.dueDate + "T00:00:00");
            if (d <= limitDate) {
              sum += calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
            }
          }
        }
      });
      return sum;
    };

    const forecastSunday = calcForecast(nextSunday);
    const forecastEndMonth = calcForecast(endOfMonth);

    return {
      score: Math.max(0, Math.min(100, score)),
      receivingRate: Math.min(100, receivingRate),
      defaultRate,
      totalReceived,
      overdueAmount,
      overdueLoans,
      capitalOnStreet,
      totalToReceive,
      pendingReceivable,
      estimatedProfit,
      interestDueThisMonth,
      globalInterestRate,
      forecastSunday,
      forecastEndMonth,
    };
  }, [loans, payments, installmentSchedules]);

  const monthComparison = useMemo(() => {
    const anchor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const series = Array.from({ length: comparisonWindow }, (_, index) => {
      const monthDate = new Date(anchor.getFullYear(), anchor.getMonth() - (comparisonWindow - 1 - index), 1);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59, 999);
      const metrics = summarizeMonthMetrics(loans, sales, payments, includeSales, monthStart, monthEnd, installmentSchedules);

      return {
        key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
        label: `${monthNames[monthDate.getMonth()].slice(0, 3)}/${String(monthDate.getFullYear()).slice(2)}`,
        ...metrics,
      };
    });

    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    const revenueDelta = previous ? (previous.revenue > 0 ? ((current.revenue - previous.revenue) / previous.revenue) * 100 : null) : null;
    const profitDelta = previous ? (previous.profit > 0 ? ((current.profit - previous.profit) / previous.profit) * 100 : null) : null;
    const interestDelta = previous && current.interestRate !== null && previous.interestRate !== null
      ? current.interestRate - previous.interestRate
      : null;

    const insightCandidates = [
      {
        weight: Math.abs(revenueDelta ?? 0),
        text: revenueDelta === null
          ? "Ainda não há base suficiente para comparar o faturamento com o mês anterior."
          : revenueDelta >= 0
            ? `Seu faturamento cresceu ${Math.abs(revenueDelta).toFixed(1)}% em relação ao mês passado.`
            : `Seu faturamento caiu ${Math.abs(revenueDelta).toFixed(1)}% em relação ao mês passado.`
      },
      {
        weight: Math.abs(interestDelta ?? 0),
        text: interestDelta === null
          ? "A taxa de juros ainda não tem base suficiente para comparação mês a mês."
          : interestDelta >= 0
            ? `A taxa de juros subiu ${Math.abs(interestDelta).toFixed(1)} p.p., reforçando a rentabilidade do mês.`
            : `A taxa de juros caiu ${Math.abs(interestDelta).toFixed(1)} p.p., atenção à rentabilidade.`
      },
      {
        weight: Math.abs(profitDelta ?? 0),
        text: profitDelta === null
          ? "Ainda não há base suficiente para comparar o lucro com o mês anterior."
          : profitDelta >= 0
            ? `Seu lucro avançou ${Math.abs(profitDelta).toFixed(1)}% contra o mês anterior.`
            : `Seu lucro recuou ${Math.abs(profitDelta).toFixed(1)}% contra o mês anterior.`
      },
    ].sort((a, b) => b.weight - a.weight);

    return {
      series,
      current,
      previous,
      revenueDelta,
      profitDelta,
      interestDelta,
      insight: insightCandidates[0]?.text ?? "Sem dados suficientes para gerar insight no período.",
    };
  }, [comparisonWindow, includeSales, loans, payments, range.start, sales, installmentSchedules]);

  const yearlyAverages = useMemo(() => {
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    const interestByPaymentId = new Map<string, number>();
    const loanInterestRemaining = new Map<string, number>();
    loans.forEach((l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      loanInterestRemaining.set(l.id, Math.max(0, total - l.amount));
    });
    paymentsSorted.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt <= 0) { interestByPaymentId.set(p.id, 0); return; }
      if (p.installmentNumber === 0) {
        interestByPaymentId.set(p.id, amt);
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - amt));
      } else {
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(amt, rem);
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      }
    });
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });
    loans.forEach((l) => {
      if (l.status !== "paid") return;
      const lastId = lastPaymentByLoanId.get(l.id);
      if (!lastId) return;
      const loanPays = payments.filter((p) => p.loanId === l.id);
      const totalPaid = loanPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const allocated = loanPays.reduce((s, p) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
      const diff = (totalPaid - l.amount) - allocated;
      if (Math.abs(diff) < 0.005) return;
      const cur = interestByPaymentId.get(lastId) ?? 0;
      interestByPaymentId.set(lastId, Math.max(0, cur + diff));
    });

    const now = new Date();
    const monthlyInterests: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      let interestInMonth = 0;
      payments.forEach((p) => {
        if ((p.date || "").slice(0, 7) !== key) return;
        interestInMonth += interestByPaymentId.get(p.id) ?? 0;
      });
      const finalVal = interestOverrides[label] !== undefined ? interestOverrides[label] : interestInMonth;
      monthlyInterests.push(finalVal);
    }

    const monthsWithInterest = monthlyInterests.filter((v) => v > 0);
    const avgInterestReceived = monthsWithInterest.length > 0
      ? monthsWithInterest.reduce((s, v) => s + v, 0) / monthsWithInterest.length
      : 0;

    const rate = portfolio.globalInterestRate;
    const interestRate = {
      totalLent: 0,
      totalToReceive: 0,
      rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      hasData: Number.isFinite(rate) && rate > 0,
    };

    return { interestRate, interestReceived: avgInterestReceived };
  }, [loans, payments, interestOverrides, portfolio.globalInterestRate]);

  const riskReturn = useMemo(() => {
    const activeLoans = loans.filter((loan) => loan.status !== "paid");
    const today = new Date(`${todayInAppTz()}T00:00:00`);
    const todayStrForOverdue = todayInAppTz();
    const overdueLoans = activeLoans
      .map((loan) => ({ loan, items: getOverdueInstallments(loan, installmentSchedules, todayStrForOverdue) }))
      .filter((x) => x.items.length > 0);
    const averageDelayDays = overdueLoans.length > 0
      ? overdueLoans.reduce((sum, { items }) => {
          const oldest = items.reduce((a, b) => (a.dueDate < b.dueDate ? a : b));
          const dueDate = new Date(`${oldest.dueDate}T00:00:00`);
          const diff = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + diff;
        }, 0) / overdueLoans.length
      : 0;

    const clientExposure = activeLoans.reduce<Record<string, number>>((acc, loan) => {
      const key = loan.borrowerId || loan.borrowerName;
      acc[key] = (acc[key] ?? 0) + (loan.remainingAmount || loan.amount);
      return acc;
    }, {});
    const totalExposure = Object.values(clientExposure).reduce((sum, value) => sum + value, 0);
    const topExposure = Object.values(clientExposure).sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0);
    const concentrationShare = totalExposure > 0 ? (topExposure / totalExposure) * 100 : 0;

    const defaultScore = Math.min(100, portfolio.defaultRate * 2.2);
    const delayScore = Math.min(100, (averageDelayDays / 30) * 100);
    const concentrationScore = Math.min(100, Math.max(0, ((concentrationShare - 35) / 40) * 100));
    const riskScore = Math.round((defaultScore * 0.45) + (delayScore * 0.3) + (concentrationScore * 0.25));

    const interestScore = Math.min(100, Math.max(0, ((data.monthlyInterestRate.rate ?? 0) / 25) * 100));
    const profitMargin = data.totalIncome > 0 ? (data.periodProfitRealized / data.totalIncome) * 100 : 0;
    const profitScore = Math.min(100, Math.max(0, (profitMargin / 20) * 100));
    const returnScore = Math.round((interestScore * 0.55) + (profitScore * 0.45));
    const axisPosition = Math.round((riskScore * 0.5) + (returnScore * 0.5));

    const classification = riskScore < 35 ? "Baixo risco" : riskScore < 70 ? "Médio risco" : "Alto risco";
    const classificationColor = riskScore < 35 ? "text-success" : riskScore < 70 ? "text-warning" : "text-destructive";

    let insight = "Risco e retorno estão equilibrados; mantenha atenção na inadimplência para sustentar a margem.";
    if (riskScore >= 70 && returnScore >= 65) insight = "Você está operando com alto retorno, porém com risco elevado.";
    else if (riskScore < 35 && returnScore >= 65) insight = "Você mantém bom retorno com risco controlado.";
    else if (riskScore < 35 && returnScore < 50) insight = "Seu risco está controlado, mas o retorno pode ser melhorado.";
    else if (riskScore >= 70 && returnScore < 50) insight = "O risco está alto para o retorno atual; revise inadimplência e concentração.";

    return {
      riskScore,
      returnScore,
      axisPosition,
      classification,
      classificationColor,
      insight,
      averageDelayDays,
      concentrationShare,
    };
  }, [data.monthlyInterestRate.rate, data.periodProfitRealized, data.totalIncome, loans, portfolio.defaultRate, installmentSchedules]);

  const monthlyChartBase = useMemo(() => {
    const now = new Date();
    const months: { month: string; emprestado: number; recebido: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      const lent = loans
        .filter((l) => { const ld = new Date(l.startDate + "T00:00:00"); return ld >= d && ld <= end; })
        .reduce((s, l) => s + l.amount, 0);
      const received = payments
        .filter((p) => { const pd = new Date(p.date + "T00:00:00"); return pd >= d && pd <= end; })
        .reduce((s, p) => s + p.amount, 0);
      months.push({ month: label, emprestado: lent, recebido: received });
    }
    return months;
  }, [loans, payments]);

  const monthlyChart = useMemo(() => {
    return monthlyChartBase.map((m) => {
      const override = chartOverrides[m.month];
      return {
        month: m.month,
        emprestado: m.emprestado + (override?.emprestado ?? 0),
        recebido: m.recebido + (override?.recebido ?? 0),
      };
    });
  }, [monthlyChartBase, chartOverrides]);

  const interestChartBase = useMemo(() => {
    const paymentsSorted = [...payments].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    });
    const interestByPaymentId = new Map<string, number>();
    const loanInterestRemaining = new Map<string, number>();
    loans.forEach((l) => {
      const total = calculateTotalWithInterest(l.amount, l.interestRate, l.installments);
      loanInterestRemaining.set(l.id, Math.max(0, total - l.amount));
    });
    paymentsSorted.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt <= 0) {
        interestByPaymentId.set(p.id, 0);
        return;
      }
      if (p.installmentNumber === 0 || p.installmentNumber === -2) {
        interestByPaymentId.set(p.id, amt);
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - amt));
      } else if (p.installmentNumber === -3) {
        interestByPaymentId.set(p.id, 0);
      } else if (p.installmentNumber === -1) {
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      } else {
        const loan = loans.find((l) => l.id === p.loanId);
        const totalWithInterest = loan
          ? calculateTotalWithInterest(loan.amount, loan.interestRate, loan.installments)
          : 0;
        const ratio = totalWithInterest > 0 && loan
          ? Math.max(0, 1 - loan.amount / totalWithInterest)
          : 0;
        const rem = loanInterestRemaining.get(p.loanId) ?? 0;
        const interest = Math.min(rem, Math.max(0, amt * ratio));
        interestByPaymentId.set(p.id, interest);
        loanInterestRemaining.set(p.loanId, Math.max(0, rem - interest));
      }
    });
    const lastPaymentByLoanId = new Map<string, string>();
    paymentsSorted.forEach((p) => { lastPaymentByLoanId.set(p.loanId, p.id); });
    loans.forEach((l) => {
      if (l.status !== "paid") return;
      const lastId = lastPaymentByLoanId.get(l.id);
      if (!lastId) return;
      const loanPays = payments.filter((p) => p.loanId === l.id);
      const totalPaid = loanPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const allocated = loanPays.reduce((s, p) => s + (interestByPaymentId.get(p.id) ?? 0), 0);
      const principalRef = l.originalAmount != null && l.originalAmount > 0 ? l.originalAmount : l.amount;
      const realProfit = totalPaid - principalRef;
      const diff = realProfit - allocated;
      if (Math.abs(diff) < 0.005) return;
      const cur = interestByPaymentId.get(lastId) ?? 0;
      interestByPaymentId.set(lastId, Math.max(0, cur + diff));
    });

    const now = new Date();
    const months: { month: string; juros: number; key: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = `${monthNames[d.getMonth()].slice(0, 3)}/${String(d.getFullYear()).slice(2)}`;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: label, juros: 0, key });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    payments.forEach((p) => {
      const k = (p.date || "").slice(0, 7);
      const row = byKey.get(k);
      if (!row) return;
      row.juros += interestByPaymentId.get(p.id) ?? 0;
    });
    return months.map(({ month, juros }) => ({ month, juros }));
  }, [loans, payments]);

  const interestChart = useMemo(() => {
    return interestChartBase.map((m) => ({
      month: m.month,
      juros: interestOverrides[m.month] !== undefined ? interestOverrides[m.month] : m.juros,
    }));
  }, [interestChartBase, interestOverrides]);

  return {
    data,
    receivedByMethod,
    receivedDetail,
    profitTargetAmount,
    portfolio,
    monthComparison,
    yearlyAverages,
    riskReturn,
    monthlyChartBase,
    monthlyChart,
    interestChartBase,
    interestChart,
  };
}
