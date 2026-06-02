---
name: Loan renegotiation penalty
description: How the renegotiation penalty (multa de renegociação) is charged across loan types
type: feature
---

When a loan is renegotiated with `type: "with_penalty"`, the penalty is **embedded into `newAmount`** (`newAmount = remaining + penaltyAmount`) and therefore into `remaining_amount` and the new installments. **Do NOT also accumulate it into `renegotiation_penalty_total`** — that causes double charging (bug fixed: previously the field was incremented by `penaltyAmount` on every renegotiation).

User can choose `penaltyDistribution`:
- **`"diluted"`** (default): penalty divided equally across all new installments. `custom_installment_value` set to the uniform value.
- **`"first"`**: full penalty added to the 1st new installment; remaining installments use the base value (remaining/n). Forces `custom_installment_value = null` since amounts differ.

Charging rules:
- Multi-installment AND single-installment loans: penalty is included in the schedule/`remaining_amount`. Nothing extra is added to `renegotiation_penalty_total` during renegotiation.
- `renegotiation_penalty_total` remains in the schema for legacy data and is still surfaced in the LoanList card ("Multa de renegociação") and in the interest-payment modal ("Juros + multa/atraso") for any pending balance, but new renegotiations should leave it at 0.

Files: `src/hooks/useLoans.ts` (renegotiateLoan + addInterestOnlyPayment), `src/components/LoanList.tsx` (lateFees + modal breakdown + card display), `src/components/RenegotiateLoanDialog.tsx` (UI da escolha).
