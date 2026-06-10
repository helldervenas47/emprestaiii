import { calculateTotalWithInterest } from "@/hooks/useLoans";

/**
 * Calcula a "Receita de Juros" (= Juros Pagos pelos tomadores) usando exatamente
 * a mesma regra do card "Juros vs Principal — por pagamento" da aba Contador.
 *
 * Regras:
 *  - Contrato quitado no período (status === "paid" e último pagamento dentro do período):
 *    juros = total pago do contrato − principal original. Atribuído ao período da quitação.
 *  - Demais pagamentos do período:
 *      • split explícito em metadata.split.interest|interest_amount → usa esse valor
 *      • installmentNumber === 0           → 100% juros (juros puro)
 *      • installmentNumber === -3          → 0% juros (amortização)
 *      • sem empréstimo vinculado          → 100% juros
 *      • caso padrão                       → amount × (1 − principal/totalComJuros)
 *
 * Fonte única para Dashboard, Contador, gráficos e relatórios.
 */
export function calcAccountantInterestPaid(
  payments: any[],
  loans: any[],
  matchPeriod: (dateStr: string) => boolean,
): number {
  // Identifica contratos quitados no período
  const quitadoLoanIds = new Set<string>();
  loans.forEach((l: any) => {
    if ((l.status ?? "") !== "paid") return;
    const loanPays = payments.filter(
      (pp) => (pp.loanId ?? pp.loan_id) === l.id,
    );
    if (loanPays.length === 0) return;
    const lastPayDate = loanPays.reduce(
      (max, pp) => (pp.date > max ? pp.date : max),
      loanPays[0].date,
    );
    if (matchPeriod(lastPayDate)) quitadoLoanIds.add(l.id);
  });

  let interestRevenue = 0;

  // 1) Juros de contratos quitados no período
  quitadoLoanIds.forEach((loanId) => {
    const loan: any = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const allPays = payments.filter(
      (pp) => (pp.loanId ?? pp.loan_id) === loanId,
    );
    const totalPaid = allPays.reduce(
      (s, pp) => s + (Number(pp.amount) || 0),
      0,
    );
    const profit = Math.max(0, totalPaid - (Number(loan.amount) || 0));
    interestRevenue += profit;
  });

  // 2) Demais pagamentos do período
  const periodPayments = payments.filter((p) => matchPeriod(p.date));
  periodPayments.forEach((p) => {
    const loanId = p.loanId ?? p.loan_id ?? null;
    const amt = Number(p.amount) || 0;
    if (loanId && quitadoLoanIds.has(loanId)) return;

    const loan: any = loans.find((l) => l.id === loanId);
    const meta: any = p.metadata || {};
    const splitInterest = Number(meta?.split?.interest ?? meta?.interest_amount);

    let interest = 0;
    if (Number.isFinite(splitInterest) && splitInterest > 0) {
      interest = Math.min(amt, splitInterest);
    } else {
      const inst = Number(p.installmentNumber ?? p.installment_number ?? 0);
      if (inst === 0) {
        interest = amt;
      } else if (inst === -3) {
        interest = 0;
      } else if (!loan) {
        interest = amt;
      } else {
        const principal = Number(loan.amount) || 0;
        const totalWithInterest = calculateTotalWithInterest(
          principal,
          Number(loan.interestRate) || 0,
          Number(loan.installments) || 1,
        );
        const interestRatio =
          totalWithInterest > 0 ? 1 - principal / totalWithInterest : 0;
        interest = Math.max(0, amt * interestRatio);
      }
    }

    interestRevenue += interest;
  });

  return interestRevenue;
}

/** Helper conveniente: filtra por mês YYYY-MM. */
export function calcAccountantInterestPaidForMonth(
  payments: any[],
  loans: any[],
  monthKey: string,
): number {
  return calcAccountantInterestPaid(payments, loans, (d) =>
    (d || "").slice(0, 7) === monthKey,
  );
}
