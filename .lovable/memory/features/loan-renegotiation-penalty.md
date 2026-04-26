---
name: Loan renegotiation penalty
description: How the renegotiation penalty (multa de renegociação) is charged across loan types
type: feature
---

When a loan is renegotiated with `type: "with_penalty"`, the penalty is added to `remaining_amount` and tracked in `renegotiation_penalty_total`.

Charging rules:
- **Multi-installment loans** (`installments >= 2`): the penalty is diluted across all new pending installments via `newAmount = remaining + penalty` divided by `desiredNewPending`. Paying installments naturally collects it.
- **Single-installment loans / interest-only flow**: the pending `renegotiationPenaltyTotal` is added to `lateFees` in the LoanList interest-payment modal (shown as "Multa de renegociação" line). When the user picks "Juros + multa/atraso" and confirms, `addInterestOnlyPayment` clears `renegotiation_penalty_total` to 0 and subtracts the penalty from `remaining_amount`.

Files: `src/hooks/useLoans.ts` (addInterestOnlyPayment + renegotiateLoan), `src/components/LoanList.tsx` (lateFees calc + modal breakdown).
