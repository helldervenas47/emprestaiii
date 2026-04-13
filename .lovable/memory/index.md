# Memory: index.md
Updated: just now

# Project Memory

## Core
Portuguese (pt-BR) interface. localStorage persistence. Loan startDate is immutable — never change it.

## Memories
- [Loan start date constraint](mem://constraints/loan-start-date) — Never modify the initial contract date after creation
- [Loan schedule dates](mem://features/loan-schedule-dates) — Paying an installment must not shift future due dates; schedule stays anchored to first due date by contract type
- [Loan remaining amount source of truth](mem://features/loan-remaining-amount-source) — Use the current `remainingAmount` value as the source of truth when paying off a loan
