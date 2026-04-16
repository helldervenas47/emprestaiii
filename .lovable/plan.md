
## Problema

Hoje, despesas recorrentes (parceladas) usam UM ÚNICO registro na tabela `expenses` que vai mutando: a cada pagamento, `paid_installments` incrementa, `due_date` avança 1 mês, e `paid_date` só fica preenchido quando a última parcela é quitada.

Consequência:
- Não existe histórico das parcelas já pagas — só sabemos quantas foram (`paid_installments`).
- A parcela paga "some" do mês em que foi paga e o registro vira a próxima parcela pendente.
- O filtro "Pagas no mês" não consegue mostrar uma parcela paga de uma recorrente em meses anteriores, porque o `paidDate` só existe na quitação final.

## Solução

Mudar a lógica de pagamento de despesas recorrentes para gerar **dois registros distintos** a cada pagamento de parcela:

1. **Registro histórico (parcela paga)**: snapshot imutável da parcela quitada
   - `description`: "{descrição original} ({n}/{total})"
   - `amount`: valor da parcela (não o total)
   - `type`: `"fixa"` (vira despesa avulsa de histórico)
   - `installments`: null, `paid_installments`: null
   - `due_date`: data de vencimento daquela parcela
   - `paid`: true, `paid_date`: data do pagamento
   - Aparece no filtro "Pagas" do mês em que foi pago.

2. **Registro da próxima parcela pendente**: o registro recorrente original avança para o próximo mês (como já faz hoje), permanecendo `paid: false`. Quando for a última, simplesmente marca como pago sem gerar a duplicata final (ou gera e remove o original — ver decisão abaixo).

### Fluxo no `payExpense` (src/hooks/useExpenses.ts)

Para `type === "recorrente"` com `installments > 1`:

```text
ANTES: 1 registro recorrente que muta
       ┌──────────────────────────────┐
       │ Aluguel (3x) — paid: false   │
       │ paid_installments: 1 → 2     │
       │ due_date: jan → fev → mar    │
       └──────────────────────────────┘

DEPOIS: 1 histórico imutável + 1 recorrente que avança
       ┌─────────────────────────────────┐  ┌──────────────────────────────┐
       │ Aluguel (1/3) — paid: true      │  │ Aluguel (3x) — paid: false   │
       │ amount: parcela, type: fixa     │  │ paid_installments: 1         │
       │ paid_date: hoje                 │  │ due_date: próximo mês        │
       └─────────────────────────────────┘  └──────────────────────────────┘
```

Lógica:
- Calcula `installmentAmount = amount / installments`
- INSERT histórico (paid=true, type=fixa, paid_date=hoje, due_date=parcela atual)
- UPDATE recorrente: incrementa `paid_installments`, avança `due_date` 1 mês
- Se for a última parcela (`newPaid === installments`), o histórico final já cobre o registro — UPDATE recorrente marcando `paid: true` (para sumir das pendências) **ou** DELETE do recorrente. → Vou usar UPDATE marcando paid=true para preservar referência (fica oculto nas pendências; o usuário pode excluir manualmente se quiser).
- `adjustBalance(-installmentAmount)` continua igual.

### Fluxo no `unpayExpense` (estornar parcela)

Estornar = remover o último registro histórico daquela despesa + reverter o recorrente 1 mês:
- DELETE do registro histórico mais recente (mesmo `description` base e maior `paid_date`).
- UPDATE recorrente: decrementa `paid_installments`, recua `due_date` 1 mês, garante `paid: false`.
- `adjustBalance(+installmentAmount)`.

Para identificar o histórico vinculado, vou adicionar uma convenção: a descrição do histórico segue o padrão `"{base} ({n}/{total})"`. Mais robusto seria adicionar uma coluna `parent_expense_id`, mas isso exige migração — proponho fazer a **migração simples** para garantir integridade.

### Migração de schema

Adicionar coluna `parent_expense_id uuid` (nullable) na tabela `expenses` para vincular o histórico à recorrente original. Isso evita parsing de string e permite estorno seguro.

### Filtro do ExpenseList

Já está correto após a alteração anterior (mostra `paid && paidDate startsWith mês`). Os novos registros históricos aparecerão automaticamente no mês correto.

Mas precisa de um ajuste: hoje a aba "Pendentes" ainda mostra o registro recorrente avançando — isso continua certo. Apenas garantir que o registro recorrente "finalizado" (paid=true após última parcela) não duplique o último histórico no filtro "Pagas". Solução: ocultar do filtro "Pagas" registros recorrentes com `paid_installments === installments` (a última parcela já está representada pelo histórico).

## Arquivos a alterar

- **Migração SQL**: adicionar coluna `parent_expense_id uuid` em `public.expenses`.
- **`src/types/loan.ts`**: adicionar `parentExpenseId?: string` ao tipo `Expense`.
- **`src/hooks/useExpenses.ts`**:
  - `fetchExpenses`: mapear nova coluna.
  - `payExpense`: para recorrentes com >1 parcela, INSERT do histórico + UPDATE do recorrente avançando o mês.
  - `unpayExpense`: para recorrentes, DELETE do histórico mais recente vinculado + reverter recorrente.
  - `addExpense`/`updateExpense`: passar `parent_expense_id` quando aplicável.
- **`src/components/ExpenseList.tsx`**: ocultar do filtro "Pagas" o registro recorrente "mãe" quando totalmente quitado (para não duplicar a última parcela já representada pelo histórico).

## Observação

Despesas recorrentes que **já foram parcialmente pagas** antes desta mudança não terão histórico retroativo — apenas as parcelas pagas a partir de agora gerarão registros separados. Isto é aceitável e esperado.
