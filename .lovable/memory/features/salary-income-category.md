---
name: Salary income category reuse
description: When addToIncomes is true, payPayroll reuses an existing user income category matching "salario"/"salarios" (accent/case-insensitive) instead of forcing "Salários"
type: feature
---
In `usePayrolls.payPayroll`, the optional Receitas entry resolves the category by querying `income_categories` for the owner and picking any existing name whose normalized form is `salario` or `salarios`. Falls back to literal "Salários" only if none exists. This prevents duplicate "Salário" vs "Salários" categories in the income tab.
