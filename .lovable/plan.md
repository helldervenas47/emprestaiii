## Objetivo
Promover **Metas** de subaba de "Relatório" para uma **aba principal** do sistema, contendo duas subabas: **Evolução Anual** (padrão) e **Configuração de Metas**.

## Mudanças

### 1. Nova aba principal `metas`
- `src/lib/appTabs.ts`: adicionar `{ id: "metas", label: "Metas" }` (posição após "overdue").
- `src/pages/Index.tsx`:
  - Adicionar `"metas"` ao union `Tab` e à lista `TABS` com ícone `Target`.
  - Incluir no `DEFAULT_PINNED` (opcional) e nas verificações de permissão.
  - Remover o botão "Metas" da subnav interna de `tab === "overdue"` (deixando apenas "Bot Telegram" e "Cobrança WhatsApp"; se sobrar só 2 itens, mantém a subnav).
  - Renderizar `<MetasTab ... />` quando `tab === "metas"`.

### 2. Novo container `MetasTab`
Arquivo novo: `src/components/metas/MetasTab.tsx`
- Subnav estilizada igual à de `overdue` com abas `evolucao` (padrão) | `configuracao`.
- Estado local do ano compartilhado (persistido em `useState` para preservar durante a sessão).
- `evolucao` → `<GoalsYearlyGrid />`.
- `configuracao` → `<MonthlyGoalsManager readOnly={isReadOnly} />` (componente já existente, sem alterações).

### 3. Grid anual `GoalsYearlyGrid`
Arquivo novo: `src/components/metas/GoalsYearlyGrid.tsx`
- Props: `loans, payments, expenses, clients, installmentSchedules, renegotiations` (mesmas fontes do Dashboard, passadas pelo `Index.tsx`).
- Itera sobre **todas as metas cadastradas** (`useMonthlyGoals().goals` agrupadas por `goalType` → união com `ALL_GOAL_TYPES` filtrada para os que possuem ao menos uma meta cadastrada em qualquer mês).
- Layout responsivo:
  - Mobile: `grid-cols-1`.
  - Tablet/Desktop: `grid-cols-2` (2×2, se >4 metas, quebra em novas linhas mantendo mesma altura).
  - Todos os cards com `h-[420px]` fixo para uniformidade.
- Cada célula renderiza `<GoalYearlyChartCard goalType=... />`.

### 4. Extrair gráfico do dialog para card reutilizável
Arquivo novo: `src/components/metas/GoalYearlyChartCard.tsx`
- Extrai o conteúdo do `GoalYearlyEvolutionDialog` (cálculo `data`, `totals`, `ComposedChart`, legenda e rótulos) para um card sem `Dialog`.
- Recebe também `year` + `setYear` (controlados externamente pelo card, com seletor `< [ano] >` no topo).
- Reaproveita `computeActual`, `useMonthlyGoals`, `useGoalSnapshots`, `useActiveCapitalSnapshots` — **mesma fonte de dados do Dashboard**, sem duplicar lógica.
- Contém: título da meta, seletor de ano, resumo (média realizada, média meta, meses considerados, atingimento anual), gráfico com barras+linha, tooltip e rótulos.
- `GoalYearlyEvolutionDialog` passa a envolver este card no `Dialog` full-screen (preserva o comportamento existente do botão "Ver evolução anual" do `GoalsCard`).

### 5. Preservação
- `GoalsCard` continua funcionando no Dashboard sem alterações.
- `MonthlyGoalsManager` continua idêntico.
- Nenhuma regra de cálculo é duplicada — o card extraído é a fonte única.

## Arquivos afetados
```text
src/lib/appTabs.ts                                   (+1 linha)
src/pages/Index.tsx                                  (nav + render)
src/components/metas/MetasTab.tsx                    (novo)
src/components/metas/GoalsYearlyGrid.tsx             (novo)
src/components/metas/GoalYearlyChartCard.tsx         (novo — extraído do dialog)
src/components/GoalYearlyEvolutionDialog.tsx        (refactor: passa a envolver o card)
```

Confirma para eu implementar?