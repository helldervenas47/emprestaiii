## Objetivo
Reduzir egress substituindo `select("*")` por listas explícitas — sem alterar regra de negócio, layout, ou nomes públicos.

## Estratégia

Os arquivos listados têm dois perfis bem diferentes de risco. Vou tratar separado.

### Grupo 1 — Hooks com mappers (BAIXO risco)

Têm uma função `rowToX(...)` que lê exatamente quais colunas o app usa. Posso derivar a lista direto do mapper.

- **`src/hooks/useLoans.ts`** — `fetchLoans` (mapper `rowToLoan` lê ~25 colunas de `loans`), `fetchPayments` (`rowToPayment` lê 7 colunas de `payments`), `fetchSchedules` (5 colunas de `loan_installments`).
- **`src/hooks/useExpenses.ts`** — `fetchExpenses` (`rowToExpense` lê ~14 colunas de `expenses`).
- **`src/hooks/useIncomes.ts`** — `fetch()` (`rowToIncome` lê ~13 colunas de `incomes`).
- **`src/hooks/usePiggyBanks.ts`** — `cofrinhos.select("*")` em `reload` (já uso documentado: `id, ativo, nome, descricao, percentual_cdi, meta, created_at`). Manter `descricao` (JSONB) e os campos lidos.

Vou rodar `tsgo` (via processo automático do harness) e ajustar se algum campo esquecido aparecer.

### Grupo 2 — Repositórios genéricos (ALTO risco)

`expensesRepository`, `incomesRepository`, `loansRepository`, `paymentsRepository`, `salesRepository` retornam `Record<string, any>` e são consumidos por **muitos** componentes que acessam colunas livremente (snake_case). Trocar `select("*")` por lista fixa aqui quebra consumidores silenciosamente (campos viram `undefined`, sem erro de TypeScript).

**Solução:** adicionar parâmetro opcional `columns?: string` em `list`/`findById`. Default permanece `"*"` (zero breaking change). Hooks que já têm mapper passam a lista explícita quando chamarem o repo. Mantém compatibilidade e abre porta pra otimização incremental.

Nenhum dos hooks listados atualmente usa esses repositórios — eles ainda chamam `supabase.from(...)` direto. Então o ganho real está no Grupo 1.

### Grupo 3 — Componentes/páginas (MÉDIO risco)

- **`src/pages/PiggyBankDetail.tsx`** — preciso ler e checar se há `select("*")` direto.
- **`src/components/DashboardOverview.tsx`** — idem.
- **`src/components/LoanList.tsx`** — consumidor de `useLoans`; provavelmente sem queries diretas, mas vou verificar.
- **`src/components/ProductSalesView.tsx`** — verificar.

Aplico só onde houver `select("*")` direto e o uso das colunas estiver claro no próprio arquivo.

## O que NÃO vou fazer
- Não vou tocar em outros `select("*")` fora dos 13 arquivos listados.
- Não vou mexer em queries dentro de Edge Functions.
- Não vou remover campos que aparecem em metadata/notes parsing ou em fallbacks (`l.original_amount ?? l.amount`, etc.) — esses entram na lista explícita.
- Não vou estreitar `select` dentro de `repositories/*` por padrão (apenas adicionar parâmetro opcional).

## Verificação
- Build/tsgo automático após cada arquivo.
- Conferência manual rápida do mapper x lista de colunas.

## Entrega
Mudanças em ~5–8 arquivos do Grupo 1 + adições opcionais nos 5 repositórios. Componentes do Grupo 3 só se de fato tiverem `select("*")` direto.

Confirma que posso seguir assim? Se preferir uma abordagem mais agressiva nos repositórios (com risco de regressão silenciosa), me avisa.