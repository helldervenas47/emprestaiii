---
name: Loan renegotiation penalty
description: How the renegotiation penalty (multa de renegociação) is charged across loan types
type: feature
---

When a loan is renegotiated with `type: "with_penalty"`, the penalty is added to `remaining_amount` and tracked in `renegotiation_penalty_total`.

User can choose `penaltyDistribution`:
- **`"diluted"`** (default): penalty divided equally across all new installments. `custom_installment_value` set to the uniform value.
- **`"first"`**: full penalty added to the 1st new installment; remaining installments use the base value (remaining/n). Forces `custom_installment_value = null` since amounts differ.

Charging rules:
- **Multi-installment loans** (`installments >= 2`): handled via the schedule — each installment carries its share of the penalty per the chosen distribution.
- **Single-installment loans / interest-only flow**: pending `renegotiationPenaltyTotal` is added to `lateFees` in the LoanList interest-payment modal (line "Multa de renegociação"). When user picks "Juros + multa/atraso" and confirms, `addInterestOnlyPayment` clears `renegotiation_penalty_total` and subtracts from `remaining_amount`.

Files: `src/hooks/useLoans.ts` (renegotiateLoan + addInterestOnlyPayment), `src/components/LoanList.tsx` (lateFees + modal breakdown), `src/components/RenegotiateLoanDialog.tsx` (UI da escolha).
