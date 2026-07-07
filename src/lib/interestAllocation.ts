/**
 * Alocação de juros pró-rata por parcela.
 *
 * Fonte única para reconhecer juros em pagamentos de empréstimos:
 * - Contratos parcelados (installments > 1): cada parcela reconhece
 *   `installmentAmount * ratio` como juros, onde
 *   `ratio = 1 - principal / totalWithInterest`. Na ÚLTIMA parcela do
 *   cronograma o valor absorve o resíduo de arredondamento para fechar
 *   exatamente `totalInterest`.
 * - Contrato de parcela única (installments === 1): mantém a regra
 *   antiga (todo o excedente sobre o principal é juros).
 * - Casos avulsos (installmentNumber ∈ {0, -2}): 100% juros.
 * - Amortização (-3): 0% juros.
 * - Parcial (-1): "juros primeiro" respeitando o saldo remanescente
 *   de juros do contrato.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AllocLoanLike {
  id: string;
  amount: number;
  interestRate: number;
  installments: number;
  status?: string;
  originalAmount?: number | null;
}

export interface AllocPaymentLike {
  id: string;
  loanId: string;
  amount: number;
  date?: string;
  installmentNumber: number;
  createdAt?: string;
}

function totalWithInterest(principal: number, rate: number): number {
  return Math.round(principal * (1 + rate / 100));
}

/**
 * Calcula parte de juros e principal para UM pagamento de parcela regular
 * (`installmentNumber >= 1`) de contrato parcelado.
 *
 * `priorInterestAllocated` é a soma de juros já reconhecidos nas parcelas
 * anteriores DO MESMO contrato, usada para fechar o resíduo na última.
 */
export function computeInstallmentInterest(params: {
  principal: number;
  rate: number;
  installments: number;
  installmentAmount: number;
  installmentNumber: number;
  priorInterestAllocated: number;
}): { interestPart: number; principalPart: number } {
  const { principal, rate, installments, installmentAmount, installmentNumber, priorInterestAllocated } = params;
  const total = totalWithInterest(principal, rate);
  const totalInterest = Math.max(0, total - principal);

  // Parcela única: mantém comportamento legado (excedente = juros).
  if (installments <= 1) {
    const interestPart = Math.max(0, round2(Math.min(installmentAmount, totalInterest)));
    return { interestPart, principalPart: round2(installmentAmount - interestPart) };
  }

  // Última parcela do cronograma: fecha o resíduo para bater exatamente `totalInterest`.
  if (installmentNumber >= installments) {
    const interestPart = Math.max(0, round2(totalInterest - priorInterestAllocated));
    const cappedInterest = Math.min(interestPart, Math.max(0, installmentAmount));
    return { interestPart: cappedInterest, principalPart: round2(installmentAmount - cappedInterest) };
  }

  const ratio = total > 0 ? Math.max(0, 1 - principal / total) : 0;
  const interestPart = round2(installmentAmount * ratio);
  const principalPart = round2(installmentAmount - interestPart);
  return { interestPart, principalPart };
}

/**
 * Alocação global de juros por pagamento, seguindo a fórmula pró-rata
 * descrita acima. Retorna `Map<paymentId, interestAmount>`.
 *
 * Consumidores (Dashboard, Contador, Histórico do Cliente) devem
 * chamar esta função em vez de reimplementar a regra.
 */
export function allocateInterestByPayment(
  loans: AllocLoanLike[],
  payments: AllocPaymentLike[],
): Map<string, number> {
  const byId = new Map<string, number>();
  const loanById = new Map(loans.map((l) => [l.id, l]));

  // Índice de parcelas pagas por contrato (ordenadas por data/created_at) para
  // saber quanto de juros já foi alocado antes de cada parcela regular.
  const sorted = [...payments].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    const ca = a.createdAt ?? "";
    const cb = b.createdAt ?? "";
    return ca.localeCompare(cb);
  });

  const priorInterestByLoan = new Map<string, number>();
  // Saldo de juros restante por contrato (para casos parciais -1 "juros primeiro").
  const interestRemainingByLoan = new Map<string, number>();
  loans.forEach((l) => {
    const total = totalWithInterest(l.amount, l.interestRate);
    interestRemainingByLoan.set(l.id, Math.max(0, total - l.amount));
  });

  for (const p of sorted) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) { byId.set(p.id, 0); continue; }

    const inst = p.installmentNumber;
    const loan = loanById.get(p.loanId);

    // Casos avulsos
    if (inst === 0 || inst === -2) {
      byId.set(p.id, round2(amt));
      const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
      interestRemainingByLoan.set(p.loanId, Math.max(0, rem - amt));
      continue;
    }
    if (inst === -3) { byId.set(p.id, 0); continue; }

    if (!loan) {
      // Pagamento sem empréstimo vinculado: assume 100% juros (comportamento legado).
      byId.set(p.id, round2(amt));
      continue;
    }

    // Parcial (-1): juros-primeiro respeitando saldo remanescente de juros.
    if (inst === -1) {
      const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
      const interest = round2(Math.min(rem, amt));
      byId.set(p.id, interest);
      interestRemainingByLoan.set(p.loanId, Math.max(0, rem - interest));
      priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interest);
      continue;
    }

    // Parcela regular (>= 1) — pró-rata.
    const prior = priorInterestByLoan.get(p.loanId) ?? 0;
    const { interestPart } = computeInstallmentInterest({
      principal: loan.amount,
      rate: loan.interestRate,
      installments: loan.installments,
      installmentAmount: amt,
      installmentNumber: inst,
      priorInterestAllocated: prior,
    });
    byId.set(p.id, interestPart);
    priorInterestByLoan.set(p.loanId, prior + interestPart);
    const rem = interestRemainingByLoan.get(p.loanId) ?? 0;
    interestRemainingByLoan.set(p.loanId, Math.max(0, rem - interestPart));
  }

  // Reconciliação de centavos APENAS para contratos quitados (`paid`) com
  // resíduo ≤ R$ 0,02: fecha na última parcela para eliminar arredondamentos.
  // Diferenças maiores (acordos/descontos/bônus) NÃO são mais promovidas a
  // "juros do último mês" — permanecem como principal.
  const lastPaymentByLoan = new Map<string, string>();
  sorted.forEach((p) => { lastPaymentByLoan.set(p.loanId, p.id); });

  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const lastId = lastPaymentByLoan.get(loan.id);
    if (!lastId) continue;
    const total = totalWithInterest(loan.amount, loan.interestRate);
    const expectedInterest = Math.max(0, total - loan.amount);
    const allocated = payments
      .filter((p) => p.loanId === loan.id)
      .reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(expectedInterest - allocated);
    if (Math.abs(diff) <= 0.02 && diff !== 0) {
      const cur = byId.get(lastId) ?? 0;
      byId.set(lastId, Math.max(0, round2(cur + diff)));
    }
  }

  return byId;
}
