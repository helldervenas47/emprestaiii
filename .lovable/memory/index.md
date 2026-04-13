# Project Memory

## Core
Portuguese (pt-BR) interface. localStorage persistence. Loan startDate is immutable — never change it.

## Memories
- [Loan start date constraint](mem://constraints/loan-start-date) — Never modify the initial contract date after creation
- [Loan schedule dates](mem://features/loan-schedule-dates) — Paying an installment must not shift future due dates; schedule stays anchored to first due date by contract type
- [Multi-user data access](mem://features/multi-user-access) — Sub-users share admin's data via user_owner table; role-based permissions
- [User-client linking](mem://features/user-client-linking) — Sub-users can be linked to specific clients to restrict data visibility
- [Loan remaining amount source](mem://features/loan-remaining-amount-source) — Use current 'restante a receber' as credited amount source of truth
- [Monthly chart values](mem://constraints/monthly-chart-values) — Current monthly history chart values are correct and must not change
