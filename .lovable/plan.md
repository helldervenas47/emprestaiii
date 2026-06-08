## Objetivo
Sempre que o usuário editar um lançamento pertencente a uma série recorrente/parcelada (receitas ou despesas — business, pessoal e veículo), abrir uma confirmação antes de salvar perguntando o escopo: **Apenas esta parcela**, **Esta e as próximas**, **Todas (inclusive pagas)**. Cartão de crédito fica de fora (conforme decidido).

## Modelo de dados (resumo)

- **Receitas (`incomes`)**: cada ocorrência é uma linha. `parent_id` aponta para a raiz da série. Edição por escopo = filtrar `id == root || parent_id == root` aplicando filtros adicionais por data/status.
- **Despesas (`expenses`)**:
  - `type=recorrente` com `installments>1`: UMA linha "pai" representa todas as parcelas em aberto (`amount = total`); cada parcela paga vira uma linha filha com `parent_expense_id`. Não há linhas futuras separadas.
  - `type=fixa`: linha única.

Por isso o significado de cada opção difere entre os dois modelos — detalhado abaixo.

## Componente novo: `EditScopeDialog`

`src/components/EditScopeDialog.tsx`. Modal simples (radio group) com:
- Apenas esta parcela
- Esta e as próximas
- Todas as parcelas

Retorna `"single" | "forward" | "all"` via callback. Reutilizado por todos os fluxos.

## Helpers novos

`src/lib/seriesEdit.ts`:
- `isIncomeSeries(income, allIncomes)` — verifica se há mais de uma ocorrência ligada por `parentId/root`.
- `isExpenseSeries(expense)` — `type==='recorrente' && installments>1`.
- `applyIncomeScopedUpdate(target, allIncomes, patch, scope, updateFn)` — aplica `patch` a um conjunto de receitas conforme escopo (`forward` = `receivedDate >= target.receivedDate` e `status !== 'received'`; `all` = todas as da série inclusive recebidas).
- `applyExpenseScopedUpdate(target, allExpenses, patch, scope, updateFn, splitFn)`:
  - `single`: divide a parcela atual da série (insere uma `fixa` standalone com o `patch` aplicado e `dueDate = target.dueDate`; no pai, `installments -= 1`, `amount -= valorParcela`, `dueDate += 1 mês`).
  - `forward`: aplica `patch` ao próprio pai. Se `patch.amount` mudou, recalcula `amount = novoValorParcela × parcelasRestantes` e mantém parcelas já pagas (filhas) intactas.
  - `all`: aplica `patch` ao pai (com mesmo recálculo de total para `amount`) **e** a todos os filhos (parent_expense_id = pai.id), inclusive os pagos — sobrescrevendo `amount` por parcela, `category`, `description`, `paymentMethodId`, etc.

Esses helpers centralizam toda a lógica e cuidam dos efeitos colaterais óbvios (atualizar cache local + Supabase). Reutilizam `updateIncome` / `updateExpense` já existentes.

## Pontos de integração

Para cada chamada existente de `updateExpense` / `updateIncome` em fluxos de edição (não de pagamento), envolver com:

```
const isSeries = isExpenseSeries(exp) // ou income
if (!isSeries) return updateExpense(id, patch)
setScopeDialog({ target: exp, patch })   // abre EditScopeDialog
// no onConfirm: applyExpenseScopedUpdate(...)
```

Arquivos afetados:

- `src/components/ExpenseList.tsx` (edit no parent — linhas ~643, fluxo de ajustar `paidDate`).
- `src/components/ExpenseEditDialog.tsx` (form completo de edição).
- `src/components/PersonalExpenseList.tsx` (edição inline — linhas ~1288/1338).
- `src/components/IncomeList.tsx` (edit em linha 472 e ajuste de data 632; `markReceived` permanece sem escopo).
- `src/components/IncomeForm.tsx` se usado para edição de receita existente.
- Veículo: usa o mesmo `ExpenseList`/`ExpenseEditDialog`, sem mudanças extras.

Edições relativas a pagamento (`pay/unpay`, `markReceived`, `paidDate` específica de uma parcela já paga) **não** disparam o diálogo — são intrinsecamente "apenas esta parcela".

## Casos de borda

- Recorrentes de receita que ainda **não foram expandidas** (sem filhos materializados): tratar como série única (`single` é o único escopo aplicável); o diálogo não aparece. O backfill do `useIncomes` já materializa em seguida.
- Edição que mexe em `dueDate/receivedDate` com escopo "forward/all": desloca proporcionalmente as datas futuras mantendo o intervalo de recorrência? **Não** — aplica a nova data como base e mantém o passo original calculado a partir dela. Para evitar colisões, valida via `validateIncomeDate` antes de salvar (rejeita com toast se gerar duplicidade).
- Parcela atualmente em foco que está **paga** numa série de receitas: "forward" inclui apenas pendentes/atrasadas posteriores; "all" inclui todas.

## Testes

Adicionar `src/lib/__tests__/seriesEdit.test.ts` cobrindo:
- Income series: forward filtra recebidos; all inclui tudo.
- Expense series single: split correto (parent: -1 parcela, +1 mês, -valor; nova fixa criada).
- Expense series forward: amount do pai recalculado preservando pagos.
- Expense series all: filhos atualizados em batch.

## Fora do escopo

- Parcelas virtuais de cartão de crédito (mantém edição direta no parent, como hoje).
- Pagamentos em si (`payExpense`/`markReceived`).
- Receitas com `recurrence==='once'` e despesas `fixa` (sem série — fluxo atual).

## Resumo executivo (não técnico)
- Adiciono um **diálogo de escopo** que aparece sempre antes de salvar a edição de qualquer lançamento que faça parte de uma série recorrente/parcelada (receitas e despesas, inclusive pessoal e veículo).
- O usuário escolhe se a alteração vale só para a parcela atual, daqui pra frente, ou para tudo (inclusive parcelas já pagas).
- Cartão de crédito continua se comportando como hoje (não entra agora).
- Pagamentos e marcações como recebido não disparam o diálogo, porque já são naturalmente "apenas esta parcela".