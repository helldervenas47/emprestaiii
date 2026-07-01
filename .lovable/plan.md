## Contexto

O Dashboard (`DashboardOverview`) hoje recebe `expenses` como prop vinda de `Index.tsx`, que chama `useExpenses(needsExpenses)` (full fetch) porque a mesma lista é reutilizada em várias abas (Despesas, Contador, Overdue, etc.). O hook `useDashboardMetrics` filtra despesas por **`paidDate`** dentro do range:

```ts
expenses.filter(e => e.paid && e.paidDate && isInRange(e.paidDate, range.start, range.end))
```

Já o suporte de período em `useExpenses({ startDate, endDate })` filtra por **`due_date`**. Isso cria três problemas para uma troca direta:

1. Despesas com `due_date` fora do período mas `paid_date` dentro (ex.: fatura vencida em jun paga em jul) seriam excluídas — perda de valor no Dashboard.
2. Despesas com `due_date` dentro mas ainda não pagas entrariam no fetch sem impacto útil (o filtro subsequente exige `paid`).
3. `Index.tsx` continua precisando de full fetch, então uma segunda instância period-scoped **não reduz** payload global — apenas adiciona uma segunda query.

Além disso, o Dashboard **não consome `useIncomes`** em lugar nenhum (nem em `DashboardOverview`, nem nos subcomponentes de `src/components/dashboard/`). A projeção de receitas usada no Dashboard vem de `payments` (empréstimos) + `sales` + `ledgerEntries`. Chamar `useIncomes` seria código morto.

## Proposta

Aplicar período no Dashboard de forma **conservadora**, sem alterar regra de negócio nem tocar em `Index.tsx`:

### 1. `DashboardOverview.tsx`
- Adicionar `useExpenses({ startDate, endDate })` internamente, usando um range **ampliado** para cobrir o gap due_date × paid_date:
  - `startDate = range.start - 12 meses` (formatado `YYYY-MM-DD`)
  - `endDate = range.end` (fim do período)
  - Rationale: cobre despesas vencidas antes mas pagas dentro do período (janela típica ≤ 12 meses; documentado como limite).
- Fazer **merge** com a prop `expenses` recebida:
  - Preservar a prop como fallback histórico (indicadores que possam vir a precisar).
  - Para o cálculo do Dashboard, priorizar a lista period-scoped filtrada pelo escopo `business` e sem `isVehicleExpenseForVehicles` (mesma regra que `Index.tsx` aplica).
- Passar o resultado adiante para `useDashboardMetrics` sem alterar sua assinatura.

### 2. `useDashboardOverviewController.ts`
- Expor `range.start` e `range.end` já normalizados como `YYYY-MM-DD` (helpers `formatIsoDate(...)`). Sem mudança de regra de negócio — apenas conveniência para consumir period-scoped hooks.

### 3. `useDashboardMetrics.ts`
- **Sem alteração de lógica.** Mantém `filteredExpenses` por `paidDate`. Apenas passa a receber a lista já reduzida.

### 4. Indicadores que continuam com full fetch (documentado)
- `payments`, `loans`, `sales`, `installmentSchedules`, `ledgerEntries` — todos vêm do `Index.tsx` / hooks próprios e são usados em janelas históricas (12 meses em `monthlyChartBase`, `interestChartBase`, `yearlyAverages`). **Não** aplicar período neles.
- `expenses` full fetch da prop permanece disponível como fallback para futuras necessidades históricas (ex.: relatório IA que compare meses passados).

### 5. Testes
Adicionar em `src/components/dashboard/__tests__/`:
1. `DashboardExpensesPeriod.test.tsx` — monta o `DashboardOverview` mockando `useExpenses` e verifica que ele é chamado com `{ startDate, endDate }` derivados do range corrente.
2. Ao alternar `period`/`offset`, o hook é chamado com novas datas → query key distinta / cache separado (verifica isolamento via `queryKey` capturada).

Manter os 102 testes existentes verdes.

## Arquivos alterados

```
src/components/DashboardOverview.tsx                          (usa useExpenses period-scoped)
src/components/dashboard/useDashboardOverviewController.ts    (expõe rangeIso)
src/components/dashboard/__tests__/DashboardExpensesPeriod.test.tsx  (novo)
```

## Riscos residuais

- Janela ampliada de 12 meses é heurística; despesas com paid_date muito distante do due_date (>12 meses) seriam perdidas. Mitigação: comentário no código explicando a janela e ponto único para ajuste.
- Como `Index.tsx` continua carregando todas as despesas, o **payload global do app não diminui**. O ganho é isolamento de re-renders no Dashboard e cache dedicado por período. Redução real de payload exigiria mudar `Index.tsx` — fora de escopo desta fase.
- `useIncomes` não é adotado no Dashboard porque nenhum indicador o consome. Fica registrado para futura fase caso um novo card de receitas seja adicionado.

## Não incluído

- Alterar `Index.tsx` (fora do escopo).
- Alterar `useExpenses`/`useIncomes` (foram entregues na fase anterior).
- Aplicar período globalmente.
- Trocar filtro `paidDate` por `dueDate` no `useDashboardMetrics` (mudaria regra de negócio).
