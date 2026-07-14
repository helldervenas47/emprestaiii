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

export interface InstallmentBreakdownEntry {
  installmentNumber: number;
  amount: number;
  interest: number;
  principal: number;
}

/**
 * Constrói o cronograma de parcelas de UM contrato com o juros e o principal
 * já pré-calculados por parcela.
 *
 * Regra (spec oficial):
 *   jurosTotal        = total - principal
 *   jurosPorParcela   = round2(jurosTotal / N)          (parcelas 1..N-1)
 *   principalParcela  = round2(amount - jurosPorParcela)
 *   última parcela    = absorve o resíduo de centavos para fechar
 *                       Σ juros = jurosTotal e Σ principal = principal.
 *
 * Para cronogramas com parcelas de valores diferentes, passe `customAmounts`
 * na ordem das parcelas — o juros por parcela é distribuído proporcionalmente
 * ao valor da parcela; a última também absorve o resíduo.
 *
 * Uma vez gerado, cada entrada é a fonte oficial: pagou parcela K → some
 * `interest`/`principal` da entrada K. O(1) por pagamento.
 */
export function buildInstallmentBreakdown(
  loan: Pick<AllocLoanLike, "amount" | "interestRate" | "installments">,
  customAmounts?: number[],
): InstallmentBreakdownEntry[] {
  const principal = Math.max(0, Number(loan.amount) || 0);
  const N = Math.max(1, Math.floor(Number(loan.installments) || 1));
  const rawTotal = totalWithInterest(principal, Number(loan.interestRate) || 0);

  if (N === 1) {
    const amt = customAmounts?.[0] ?? rawTotal;
    // Se o pago acordado (amt) for maior que principal+juros contratado,
    // o excedente é multa de renegociação e também deve ser reconhecido
    // como juros/receita (aparece em "Juros Recebidos").
    const totalInterest1 = Math.max(0, Math.max(rawTotal, amt) - principal);
    return [{ installmentNumber: 1, amount: round2(amt), interest: round2(totalInterest1), principal: round2(amt - totalInterest1) }];
  }

  const hasCustom = Array.isArray(customAmounts) && customAmounts.length === N;
  const amounts: number[] = hasCustom
    ? customAmounts!.map((v) => round2(Number(v) || 0))
    : Array.from({ length: N }, () => round2(rawTotal / N));
  const amountsSum = amounts.reduce((s, v) => s + v, 0);
  // Em contratos renegociados com multa, a multa é diluída nas parcelas,
  // então a soma real das parcelas ultrapassa `principal*(1+rate)`. O
  // excedente é receita adicional e precisa entrar no juros total.
  const total = hasCustom ? Math.max(rawTotal, amountsSum) : rawTotal;
  const totalInterest = Math.max(0, total - principal);

  const entries: InstallmentBreakdownEntry[] = [];
  let interestAccum = 0;
  let principalAccum = 0;
  for (let i = 0; i < N; i++) {
    const amount = amounts[i];
    if (i < N - 1) {
      const share = amountsSum > 0 ? amount / amountsSum : 1 / N;
      const interest = round2(totalInterest * share);
      const principalPart = round2(amount - interest);
      entries.push({ installmentNumber: i + 1, amount, interest, principal: principalPart });
      interestAccum += interest;
      principalAccum += principalPart;
    } else {
      const interest = Math.max(0, round2(totalInterest - interestAccum));
      const principalPart = Math.max(0, round2(principal - principalAccum));
      const amt = round2(interest + principalPart);
      entries.push({ installmentNumber: i + 1, amount: amt || amount, interest, principal: principalPart });
    }
  }
  return entries;
}

/**
 * Retorna o juros/principal pré-calculados para a parcela `installmentNumber`
 * do contrato. Lookup O(1) sobre o cronograma — evita recalcular histórico.
 */
export function getInstallmentInterest(
  loan: Pick<AllocLoanLike, "amount" | "interestRate" | "installments">,
  installmentNumber: number,
  customAmounts?: number[],
): { interest: number; principal: number; amount: number } | null {
  if (!Number.isFinite(installmentNumber) || installmentNumber < 1) return null;
  const schedule = buildInstallmentBreakdown(loan, customAmounts);
  const entry = schedule.find((e) => e.installmentNumber === installmentNumber);
  return entry ? { interest: entry.interest, principal: entry.principal, amount: entry.amount } : null;
}

/**
 * Calcula parte de juros e principal para UM pagamento de parcela regular
 * (`installmentNumber >= 1`) de contrato parcelado. Lê do cronograma
 * pré-calculado (fonte oficial). `priorInterestAllocated` é usado apenas
 * como salvaguarda na última parcela.
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

  if (installments <= 1) {
    const interestPart = Math.max(0, round2(Math.min(installmentAmount, totalInterest)));
    return { interestPart, principalPart: round2(installmentAmount - interestPart) };
  }

  // Fonte oficial: sempre lê o juros pré-calculado do cronograma da parcela K.
  // O `installmentAmount` afeta APENAS o principal reconhecido — descontos/
  // bônus/multas de atraso NÃO alteram o juros contratado da parcela.
  const schedule = buildInstallmentBreakdown({ amount: principal, interestRate: rate, installments });
  const scheduled = schedule.find((e) => e.installmentNumber === installmentNumber)
    ?? schedule[schedule.length - 1];
  if (scheduled) {
    const interestPart = Math.max(0, round2(scheduled.interest));
    const cappedInterest = Math.min(interestPart, Math.max(0, installmentAmount));
    return { interestPart: cappedInterest, principalPart: round2(installmentAmount - cappedInterest) };
  }
  // Fallback (contrato sem shape válido): usa razão global.
  const ratio = total > 0 ? Math.max(0, 1 - principal / total) : 0;
  const interestPart = round2(installmentAmount * ratio);
  return { interestPart, principalPart: round2(installmentAmount - interestPart) };
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
  // Principal já reconhecido por contrato — usado em contratos de parcela
  // única (installments === 1) para calcular quanto do payoff é juros.
  const priorPrincipalByLoan = new Map<string, number>();
  // Saldo de juros restante por contrato (para casos parciais -1 "juros primeiro").
  const interestRemainingByLoan = new Map<string, number>();
  loans.forEach((l) => {
    const total = totalWithInterest(l.amount, l.interestRate);
    interestRemainingByLoan.set(l.id, Math.max(0, total - l.amount));
  });

  // Pré-cronograma por contrato com os valores REAIS pagos por parcela
  // (para suportar contratos com parcelas de valores diferentes, ex.: 300+270).
  // Parcelas ainda não pagas ficam com o valor uniforme como placeholder.
  const scheduleByLoan = new Map<string, ReturnType<typeof buildInstallmentBreakdown>>();
  for (const loan of loans) {
    if (loan.installments <= 1) continue;
    const totalDue = totalWithInterest(loan.amount, loan.interestRate);
    const N = loan.installments;
    const amounts = Array.from({ length: N }, () => round2(totalDue / N));
    for (const p of sorted) {
      if (p.loanId !== loan.id) continue;
      const k = p.installmentNumber;
      if (k >= 1 && k <= N) amounts[k - 1] = round2(Number(p.amount) || amounts[k - 1]);
    }
    const schedule = buildInstallmentBreakdown(loan, amounts);
    scheduleByLoan.set(loan.id, schedule);
    // Sincroniza o saldo de juros com o cronograma real (que já inclui
    // eventual multa de renegociação diluída nas parcelas).
    const scheduledInterest = schedule.reduce((s, e) => s + e.interest, 0);
    interestRemainingByLoan.set(loan.id, Math.max(interestRemainingByLoan.get(loan.id) ?? 0, scheduledInterest));
  }

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

    // Parcela regular — lê juros do cronograma real, mas SEMPRE limitado ao
    // saldo remanescente de juros do contrato. Sem esse cap, pagamentos
    // parciais anteriores (-1) que já consumiram juros seriam contados de
    // novo quando a parcela final fosse quitada.
    const schedule = scheduleByLoan.get(p.loanId);
    let interestPart = 0;
    const remBefore = interestRemainingByLoan.get(p.loanId) ?? 0;
    if (schedule) {
      const entry = schedule.find((e) => e.installmentNumber === inst) ?? schedule[schedule.length - 1];
      interestPart = Math.max(0, Math.min(round2(entry.interest), amt, remBefore));
    } else {
      // Contrato de parcela única (installments === 1). Aqui `remBefore` NÃO
      // pode ser usado como cap: pagamentos de juros avulsos (inst=0) de
      // ciclos anteriores já zeraram o saldo de juros "de um ciclo", mas o
      // contrato pode ter rodado vários ciclos. Regra: o excedente sobre o
      // principal do contrato é juros do ciclo final; o restante é principal.
      const principalRemaining = Math.max(
        0,
        round2((loan.amount || 0) - (priorPrincipalByLoan.get(p.loanId) ?? 0)),
      );
      const principalPart = Math.min(amt, principalRemaining);
      interestPart = Math.max(0, round2(amt - principalPart));
    }
    byId.set(p.id, interestPart);
    priorInterestByLoan.set(p.loanId, (priorInterestByLoan.get(p.loanId) ?? 0) + interestPart);
    interestRemainingByLoan.set(p.loanId, Math.max(0, remBefore - interestPart));
    priorPrincipalByLoan.set(
      p.loanId,
      (priorPrincipalByLoan.get(p.loanId) ?? 0) + Math.max(0, round2(amt - interestPart)),
    );
  }

  // Reconciliação para contratos quitados (`paid`):
  // 1) Resíduos ≤ R$ 0,02 → fecha na última parcela (arredondamentos).
  // 2) Quando um único pagamento quita várias parcelas restantes (ex.: payoff),
  //    o alocador regular só reconhece o juros de UMA entrada do cronograma;
  //    o restante do juros contratado deve ser atribuído a esse pagamento
  //    final, respeitando o valor pago (não pode exceder o próprio pagamento
  //    menos o que ele já reconheceu como juros).
  // Descontos/bônus reais permanecem como principal (o `diff` positivo só
  // aparece quando faltou juros — se o cliente pagou menos que o esperado,
  // `diff` será negativo e não fazemos nada).
  const lastPaymentByLoan = new Map<string, { id: string; amount: number }>();
  sorted.forEach((p) => { lastPaymentByLoan.set(p.loanId, { id: p.id, amount: Number(p.amount) || 0 }); });

  const paymentAmountById = new Map<string, number>();
  payments.forEach((p) => paymentAmountById.set(p.id, Number(p.amount) || 0));

  for (const loan of loans) {
    if (loan.status !== "paid") continue;
    const last = lastPaymentByLoan.get(loan.id);
    if (!last) continue;
    const total = totalWithInterest(loan.amount, loan.interestRate);
    const expectedInterest = Math.max(0, total - loan.amount);
    const allocated = payments
      .filter((p) => p.loanId === loan.id)
      .reduce((s, p) => s + (byId.get(p.id) ?? 0), 0);
    const diff = round2(expectedInterest - allocated);
    if (diff <= 0) continue;
    const cur = byId.get(last.id) ?? 0;
    const cap = Math.max(0, round2(last.amount - cur));
    const add = Math.min(diff, cap);
    if (add > 0) byId.set(last.id, round2(cur + add));
  }

  return byId;
}
