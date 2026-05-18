---
name: Salary income category normalization
description: Treat "Salário" and "Salários" as the same income category; display, save, and aggregate salary income as "Salário"
type: feature
---
All income flows must treat `Salário` and `Salários` as the same category (accent/case-insensitive). Store and display salary income as `Salário`, dedupe custom income categories by normalized key, and aggregate dashboards/details using that key so the Receita tab never shows separate salary buckets.
