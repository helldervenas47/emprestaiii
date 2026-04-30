# Memory: index.md
Updated: today

# Project Memory

## Core
Portuguese (pt-BR) interface. localStorage persistence. Loan startDate is immutable — never change it.

## Memories
- [Loan start date constraint](mem://constraints/loan-start-date) — Never modify the initial contract date after creation
- [Loan schedule dates](mem://features/loan-schedule-dates) — Paying an installment must not shift future due dates; schedule stays anchored to first due date by contract type
- [Loan original due date](mem://features/loan-original-due-date) — Immutable cycle anchor; interest-only payments compute next due from original day-of-month, ignoring renegotiation date shifts
- [Vehicle tracking](mem://features/vehicle-tracking) — Per-vehicle live location with provider adapter (Hapolo/Traccar/custom), 3-min cron sync, realtime card with mini-map
