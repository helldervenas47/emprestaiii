# Memory: index.md
Updated: now

# Project Memory

## Core
Portuguese (pt-BR) interface. localStorage persistence. Loan startDate is immutable — never change it.

## Memories
- [Loan start date constraint](mem://constraints/loan-start-date) — Never modify the initial contract date after creation
- [Loan schedule dates](mem://features/loan-schedule-dates) — Paying an installment must not shift future due dates; schedule stays anchored to first due date by contract type
- [Multi-user access](mem://features/multi-user-access) — Sub-users share admin data via user_owner; roles admin/operador/visualizador
- [User approval system](mem://features/user-approval-system) — Per-admin approval toggle + invite codes; pending users see waiting screen
- [Loan renegotiation penalty](mem://features/loan-renegotiation-penalty) — Penalty diluted in installments for parcelado; cobrada com pagamento de juros em parcela única
- [Salary income category](mem://features/salary-income-category) — payPayroll reuses existing user income category matching "salario"/"salarios" to avoid duplicates
