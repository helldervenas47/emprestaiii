# Auditoria de Refatoração — EmprestAI

**Data:** 2026-07-13
**Escopo:** análise estática de toda a base (467 arquivos .ts/.tsx, 84 hooks, 153 componentes top-level, 15 páginas).

> **Nenhum arquivo funcional foi alterado nesta auditoria.** Este documento é a base para execução incremental. Fluxos financeiros (empréstimos, boletos, comissões, folha, metas) são críticos — refatorar sem testes automatizados exige passos pequenos e validação manual entre eles.

---

## 1. Sinais gerais

| Métrica | Valor | Observação |
|---|---|---|
| Arquivos ts/tsx | 467 | Alto |
| Componentes em `src/components/*` (raiz) | 153 | **Falta agrupamento por domínio** |
| Hooks em `src/hooks/*` | 84 | Sem categorização |
| Arquivos > 800 linhas | 20+ | Vários responsibility overload |
| Maior arquivo (fora de types.ts) | `LoanMobileCard.tsx` — 2437 linhas | Precisa quebra urgente |
| Uso de `any` | 76 ocorrências em `useLoans.ts` sozinho | Tipagem frágil |
| `console.log/warn/error` remanescentes | 52 arquivos | Ruído em produção |
| Cliente Supabase | 149 arquivos importam `userClient` | Alias já centralizado ✅ |
| Repositories | Só 6 (loans, payments, expenses, incomes, sales, loan_installments) | Padrão iniciado mas incompleto |

---

## 2. Estrutura de pastas — problemas

### 2.1 `src/components/` é um "flat dump"
133 dos 153 componentes estão soltos na raiz de `components/`. Só 8 subpastas de domínio existem (`admin`, `boletos`, `dashboard`, `loans`, `metas`, `product-sales`, `salary`, `upgrade`, `warranty`). Componentes de domínios inteiros estão na raiz:

- `ClientList.tsx`, `ClientLoanHistory.tsx`, `ClientForm*` → **falta pasta `clients/`**
- `ExpenseList.tsx`, `ExpensePendingCalendar.tsx`, `PersonalExpenseList.tsx` → **falta `expenses/`**
- `IncomeList.tsx`, `IncomePendingCalendar.tsx`, `IncomeForm*` → **falta `incomes/`**
- `PiggyBankList.tsx`, `PiggyBankDetail` → **falta `piggy-banks/`**
- `CreditCard*`, `CreditLimit*` → **falta `credit-cards/`**
- `Sale*`, `Stock*`, `Product*` → **falta `products/`**
- `Payroll*`, `Employee*` → já tem `salary/` mas nem tudo está lá
- `Consolidated*`, `FinancialHealth*`, `Ledger*` → **falta `finance/` ou `reports/`**

### 2.2 `src/hooks/` sem categorização
84 hooks planos. Sugerir subpastas por domínio espelhando `components/`:

```
hooks/
  auth/        useAuth, useDataOwner, useInviteCodes
  loans/       useLoans, useLoanRenegotiations, useLoanSimulations, useDashboardLoanTotals
  clients/     useClients, useClientDocuments
  finance/     useAccountBalance, useAccountSettings, useBalanceAdjustments, useAccountLedger
  billing/     useBoletoHistory, useMyBoletos, useAsaasCheckout
  credit/      useCreditCards, useCreditCardOpenings, useCreditLimits, useAutoAdjustCreditLimits
  personal/    usePersonalExpenses, useExpenses, useIncomes, useIncomeCategories
  goals/       useMonthlyGoals, useGoalSnapshots, useGoalScoreWeights, useEmployeeGoalBonuses
  piggy-banks/ usePiggyBanks, usePiggyMovements
  payroll/     usePayrolls, usePayrollPayments, useEmployees
  telegram/    use*Telegram* (5+ arquivos)
  system/      useAppBranding, useAppTheme, useDashboardPrefs, useUserSessions
  ui/          use-mobile, use-toast
```

### 2.3 `src/lib/` mistura utilitários e regras de negócio
`lib/` deveria ser utilities puras. Hoje mistura:

- **Puras (OK):** `utils.ts`, `timezone.ts`, `csv.ts`
- **Regras de negócio (mover para `src/domain/<feature>/`):**
  `loanLateFees`, `loanSimulation`, `interestAllocation`, `creditCardInstallments`,
  `goalBonusEngine`, `metasScore`, `metasMonthResult`, `metasPeriod`,
  `paymentValidation`, `periodProfitExpected`, `piggyTax`, `clientRisk`,
  `monthlyInterestRate`, `projectedBalance`, `accountLedgerBalance`, `balance`,
  `ledger`, `creditLimit`, `whatsappBilling`, `vehicleBalance`
- **Geração de artefatos (mover para `src/lib/pdf/`):**
  `loanReportPdf`, `payslipPdf`, `simulationPdf`, `pdfBranding`, `generateContract`
- **Infra ok mas rebatizar:** `offline/*`, `boleto/*`, `asaas.ts`, `telegramReportsBot.ts`

### 2.4 Estado global
Só existe `HideValuesContext`. `useAuth` é hook global mas não context — tudo bem, porém profile/plan/entitlements estão espalhados. Considerar um `AppSessionContext` que exponha `{ user, profile, plan, dataOwnerId, entitlements }` calculado uma vez.

---

## 3. Componentes gigantes — priorização

Cada um destes deve ser quebrado. **Não fazer todos ao mesmo tempo.** Ordem sugerida (menor risco → maior):

| # | Arquivo | Linhas | Sugestão de quebra |
|---|---|---|---|
| 1 | `AccountantReport.tsx` | 2114 | Extrair seções (Header, Filters, LoansTable, PaymentsTable, Summary) — página de leitura, risco baixo |
| 2 | `PersonalExpenseList.tsx` | 1681 | Filtros → hook `usePersonalExpenseFilters`; tabela → componente |
| 3 | `CreditCardInvoice.tsx` | 1390 | InvoiceHeader, InvoiceItems, InvoiceActions, InvoicePayment |
| 4 | `BillingCalendar.tsx` | 1363 | CalendarGrid, DayCell, DayDetailsSheet |
| 5 | `GoalsCard.tsx` | 1870 | Já em `components/metas/`? Não. Mover, quebrar em Header/Progress/Detail/Actions |
| 6 | `RenegotiateLoanDialog.tsx` | 1179 | Step1Terms, Step2Preview, Step3Confirm + hook `useRenegotiation` |
| 7 | `IncomePendingCalendar.tsx` | 1152 | Espelhar quebra do BillingCalendar |
| 8 | `ConsolidatedBalanceCards.tsx` | 1047 | Cards individuais + hook de agregação |
| 9 | `SaleForm.tsx` | 1045 | Sections + `useSaleForm` |
| 10 | `StockManager.tsx` | 1022 | Header/Filter/Table/MovementDialog |
| 11 | `LoanMobileCard.tsx` | 2437 | ⚠️ Cuidado — muitos cálculos inline; extrair `useLoanCardMetrics` primeiro |
| 12 | `pages/Index.tsx` | 2246 | ⚠️ Provavelmente é o dashboard; extrair sections por tab |

### 3.1 Hooks gigantes
| Arquivo | Linhas | Ação |
|---|---|---|
| `useLoans.ts` | 2253 | Dividir por operação: `useLoansList`, `useLoanMutations`, `useLoanPayments`, `useLoanRealtime` |
| `usePiggyBanks.ts` | 835 | Separar movements e config |
| `useExpenses.ts` | 792 | Separar leitura, mutação, categorias |
| `useDashboardMetrics.ts` | 810 | Extrair cada métrica em selector puro |

---

## 4. Camada de dados (Supabase)

### 4.1 Repositories parcialmente adotados
Já existe `src/repositories/` com 6 entidades. Só que a maioria dos hooks ainda chama `supabase.from(...)` direto:

- `useLoans.ts` importa `supabase` e usa `.from("loans")` diretamente em vários pontos → deveria usar `loansRepository`
- `useClients`, `useCreditCards`, `usePiggyBanks`, `usePayrolls`, `useWarranty` etc. — **sem repository**

**Ação:** completar cobertura de repositories para todas as entidades e proibir `supabase.from()` fora de `src/repositories/*` (regra de lint no futuro).

### 4.2 Type-casting `as any` em queries
`.from("payment_methods" as any)` aparece em vários hooks porque a tabela não está no `types.ts` gerado. Solução: regenerar types OU criar um `db.ts` com tipos manuais para tabelas fora do schema tipado.

### 4.3 Row → domain mapping duplicado
Cada hook implementa seu próprio `rowToLoan`, `rowToPayment`, `rowToExpense`, `rowToClient`… **Consolidar em `src/mappers/<entity>.ts`**. Isso elimina bugs silenciosos quando um campo é adicionado.

### 4.4 Tratamento de erro heterogêneo
Padrões diferentes coexistem:
- `if (error) throw error`
- `if (error) { toast.error(...); return }`
- `try/catch` engolindo `error`

**Ação:** criar util `handleDbError(error, contextMsg)` que padroniza toast + log + retorno.

---

## 5. Autenticação e rotas

### 5.1 Cliente duplicado
Existe `client.ts` (Lovable Cloud, inativo) e `userClient.ts` (Supabase externo, ativo). O alias em `vite.config.ts` redireciona `@/integrations/supabase/client` para `userClient` — **funciona mas é frágil e confuso**.

**Ação:** deletar `client.ts` (não usado), remover o alias, e importar sempre de `@/integrations/supabase/userClient` explicitamente. 0 arquivos importam `client` direto hoje, o alias só cria dívida cognitiva.

### 5.2 `useAuth` como hook, não context
149 componentes chamam `useAuth()`. Se cada chamada tem subscrição própria a `onAuthStateChange` seria vazamento — **verificar**. Preferível encapsular em `<AuthProvider>` + `useAuth()` hook que só lê o context.

### 5.3 Guards de rota
Verificar se `ProtectedRoute` cobre todos os fluxos. Rotas atuais: `/`, `/auth`, `/cadastro`, `/welcome`, `/pricing`, `/piggy-banks`, `/piggy-banks/:id`, `/daily-planning`, `/help`, `/painel-migracao`, `/reset-password`, `/terms`, `/privacy-policy`, `/refund-policy`. Confirmar que `/painel-migracao` exige role admin.

---

## 6. Padrões e higiene

### 6.1 `console.log` em 52 arquivos → criar `logger`
```ts
// src/lib/logger.ts
const isDev = import.meta.env.DEV;
export const logger = {
  debug: (...a: unknown[]) => isDev && console.log(...a),
  warn: (...a: unknown[]) => console.warn(...a),
  error: (...a: unknown[]) => console.error(...a),
};
```
E substituir `console.*` gradualmente (safe, mecânico).

### 6.2 Nomenclatura inconsistente
- `useAsaasCheckout` (camelCase) vs `use-mobile.tsx` (kebab-case) → padronizar para camelCase; renomear `use-mobile.tsx` → `useMobile.ts` e `use-toast.ts` → `useToast.ts`. **⚠️ Cuidado com o de `sonner`/`shadcn` — verificar se são convenção da lib**.
- Pastas em kebab-case (`product-sales`, `piggy-banks`) mas arquivos em PascalCase — manter kebab-case para pastas e PascalCase para componentes ✅ já é o padrão.

### 6.3 Imports desordenados
Rodar ESLint `eslint-plugin-simple-import-sort` e formatar. Zero risco funcional.

### 6.4 Barrels ausentes
0 arquivos `index.ts` de barril. Adicionar após cada domínio ser agrupado, ex.: `src/hooks/loans/index.ts` reexportando os hooks. Melhora ergonomia de import.

### 6.5 Tipos duplicados
`src/types/` contém entidades. Alguns hooks redeclaram interfaces localmente. Centralizar em `src/types/<entity>.ts` e reexportar via `src/types/index.ts`.

---

## 7. Complexidade e regras misturadas com UI

Exemplos concretos:
- `LoanMobileCard.tsx` calcula juros, multa, status, projeção **dentro do render**. Extrair para `src/domain/loans/computeCardMetrics.ts` (função pura testável).
- `AccountantReport.tsx` monta CSV/PDF inline. Extrair `src/domain/reports/accountant.ts`.
- `GoalsCard.tsx` já tem `goalBonusEngine`/`metasScore` em `lib/`, mas o componente ainda deriva coisas manualmente.
- `ConsolidatedBalanceCards.tsx` faz agregação de saldos no componente. Deveria consumir de um hook `useConsolidatedBalance()` (que hoje já existe em partes espalhadas).

**Princípio a aplicar:** *componentes só formatam e disparam ações. Cálculo vive em `src/domain/**` (puro) ou hooks. Acesso a dados vive em `src/repositories/**`.*

---

## 8. Plano de execução recomendado (em ondas)

Cada onda é um commit isolado, validável, reversível.

### Onda 0 — Higiene (risco zero, ~1 sessão)
- [ ] Criar `src/lib/logger.ts` e substituir `console.log` (script sed)
- [ ] Rodar `simple-import-sort` em toda a base
- [ ] Deletar `src/integrations/supabase/client.ts` + remover alias em `vite.config.ts`
- [ ] Renomear `use-mobile.tsx` → `useMobile.ts`, `use-toast.ts` → `useToast.ts` (com codemod dos imports)

### Onda 1 — Reorganização de pastas (mecânico, `git mv`)
- [ ] Agrupar componentes por domínio (clients/, expenses/, incomes/, credit-cards/, piggy-banks/, products/, finance/)
- [ ] Agrupar hooks por domínio (auth/, loans/, clients/, finance/, billing/, credit/, personal/, goals/, piggy-banks/, payroll/, telegram/, system/, ui/)
- [ ] Atualizar imports via script (todos usam `@/`, então `sed` funciona)
- [ ] Não muda comportamento nenhum

### Onda 2 — Tipos e mappers centralizados
- [ ] `src/types/*.ts` — consolidar interfaces por entidade
- [ ] `src/mappers/*.ts` — extrair todos os `rowToX`
- [ ] Substituir usos locais pelos mappers

### Onda 3 — Repositories completos
- [ ] Repositories faltantes: clients, credit_cards, credit_limits, piggy_banks, payrolls, employees, warranty, sales, stock_movements, credit_card_invoices, subscriptions, telegram_*, boletos, my_boletos
- [ ] Migrar hooks para consumir repositories

### Onda 4 — Extração de domínio
- [ ] `src/domain/loans/*` (metrics, status, late fees)
- [ ] `src/domain/goals/*`
- [ ] `src/domain/credit-cards/*`
- [ ] `src/domain/reports/*`
- [ ] Componentes passam a consumir funções puras

### Onda 5 — Quebra dos componentes gigantes (um por vez)
Ordem sugerida na tabela §3. Após cada um: validação manual do fluxo específico.

### Onda 6 — Auth como context + guards revisados
- [ ] `<AuthProvider>` unificado
- [ ] `<ProtectedRoute>` + `<AdminRoute>` explícitos

### Onda 7 — Convenções + lint
- [ ] Regra ESLint: proibir `supabase.from()` fora de `src/repositories/**`
- [ ] Regra ESLint: proibir `console.log` (usar `logger`)
- [ ] Regra: máximo de linhas por arquivo (aviso, não erro)
- [ ] Barrels (`index.ts`) por domínio

---

## 9. O que **não** vou fazer sem sua confirmação

- Reescrever `useLoans.ts` ou `useDashboardMetrics.ts` de uma vez
- Modificar qualquer fluxo financeiro (juros, multa, comissões, boletos, folha) sem que você teste antes/depois
- Trocar biblioteca (react-query, sonner, radix) por outra
- Alterar schema do banco
- Rodar migrações em produção como parte de "refactor"

---

## 10. Próxima ação sugerida

Aprovar a **Onda 0** (higiene, risco zero). Estimo <10 minutos, sem risco funcional. Depois avançamos onda a onda, com você validando o preview entre cada uma.

Responda com **"executar onda 0"** (ou "onda 0 + 1", etc.) para eu começar.
