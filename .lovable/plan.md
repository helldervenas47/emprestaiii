
## Objetivo
Evoluir a aba **Metas → Evolução Anual** com filtros por período (Mensal/Trimestral/Semestral/Anual), um **sistema de pontuação 0–100** por meta e 4 novos cards no topo. Adicionar campo **Pontuação da Meta** na subaba Configuração com validação de soma = 100.

---

## 1. Backend / Dados

**Nova coluna em `monthly_goals`:**
- `score_weight integer not null default 0` — peso (pontuação) da meta.

Como o peso é do **tipo de meta** (não por mês), a estratégia mais simples e consistente com o schema atual é:
- Ao ler as metas, considerar como peso da meta o `score_weight` mais recente cadastrado para aquele `goal_type` do usuário.
- Ao salvar/editar o peso na Configuração, o hook atualiza o `score_weight` em **todas** as linhas daquele `goal_type` do usuário (mantém consistência histórica sem criar tabela nova).

Seed inicial (aplicado uma vez por usuário na primeira abertura da tela, se todos os pesos estiverem 0):

| Meta | Pontos |
|---|---|
| Taxa de Juros Mensal | 5 |
| Faturamento do Período | 5 |
| Valor Emprestado (loan_volume) | 10 |
| Novos Empréstimos | 5 |
| Juros Recebidos | 20 |
| Capital Ativo | 10 |
| Taxa de Inadimplência | 10 |
| Novos Clientes | 5 |
| Contratos Renegociados | 10 |
| Receita Média Diária | 10 |
| Variação Mensal do Patrimônio | 10 |
| Recebimentos no Mês / Lucro Líquido | 0 (opcional, editável) |

Migração:
```sql
ALTER TABLE public.monthly_goals
  ADD COLUMN IF NOT EXISTS score_weight integer NOT NULL DEFAULT 0;
```
(Grants/RLS já existentes cobrem o campo.)

---

## 2. Lógica central de período (novo arquivo)

`src/lib/metasPeriod.ts`
- `type PeriodMode = "month" | "quarter" | "semester" | "year"`
- `type PeriodSelection = { mode, year, month?, quarter?, semester? }`
- `getPeriodMonths(sel)` → array de `YYYY-MM` do período.
- `getPreviousPeriod(sel)` → seleção do período imediatamente anterior (mês/tri/sem/ano).
- `computePeriodValue(months, perMonthValue[])` → **média dos meses válidos** (ignora meses sem meta, meses futuros, meta herdada, sem dados válidos). Para modo `month`, retorna o próprio valor do mês.
- `isGoalReached(type, target, actual)` — respeita `inverse` (inadimplência, renegociação).

Essa mesma função vai alimentar gráficos, cards, tooltips e pontuação (fonte única).

---

## 3. Sistema de pontuação

`src/lib/metasScore.ts`
- `computeScore(goals, actualsByTypeMonth, period)`:
  - Para cada `goal_type` com peso > 0:
    - Calcula valor real do período (média dos meses válidos).
    - Calcula alvo do período (média dos targets dos meses válidos).
    - Se **atingida** (regra normal ou inversa) → soma `score_weight` completo. Se não → 0.
  - Retorna `{ total, breakdown[] }`.
- `computePreviousScore(...)` usa a mesma função com `getPreviousPeriod`.

---

## 4. UI — Evolução (`GoalsYearlyGrid.tsx`)

Substituir o seletor de ano atual por:

**Topo (4 cards em grid responsivo `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`):**
1. **Pontuação Atual** — número grande + "de 100 pts" + selo OK/Atenção (≥70 OK).
2. **Pontuação Anterior** — mesmo layout, valor do período anterior.
3. **Variação** — Δ pts + % com ícone ▲/▼ verde/vermelho.
4. **Painel de Filtros**:
   - Toggle vertical: Mensal / Trimestral / Semestral / Anual.
   - Sub-seletor dinâmico:
     - Mensal → `<input type="month">`.
     - Trimestral → botões 1º/2º/3º/4º Tri + seletor de ano.
     - Semestral → 1º/2º Sem + seletor de ano.
     - Anual → seletor de ano.
   - Atualização reativa sem reload.

**Cards de gráficos por meta**: usam os meses do período. Para modo `month`, o gráfico exibe barras do ano inteiro mas destaca visualmente o mês selecionado (ou reduz a card a um resumo). Escolha: **manter o gráfico anual sempre visível**, e usar o período apenas para os 4 cards de topo + selos + cálculo médio exibido no rodapé de cada card. Isso preserva a UX de comparação mensal já existente.

**Selo** por card: passa a usar o cálculo do período selecionado (média/valor do período), respeitando regra inversa.

---

## 5. UI — Configuração (`MonthlyGoalsManager.tsx`)

- Adicionar coluna/campo **Pontuação** no formulário de nova/editar meta (input numérico, 0–100).
- No topo da lista de metas cadastradas exibir:
  - `Total de pontos: XX / 100`
  - Se `≠ 100`: badge vermelho "Faltam N pts" ou "Excede N pts" e **bloquear** salvar novas metas com toast explicativo.
- Ao alterar a pontuação de um tipo, propagar para todas as linhas daquele `goal_type` do usuário via update em massa no `useMonthlyGoals`.

---

## 6. Hooks

`src/hooks/useMonthlyGoals.ts`:
- Adicionar `scoreWeight` no tipo `MonthlyGoal`.
- Novo método `updateScoreWeight(goalType, weight)` — update em massa.
- Novo método `getWeightsByType()` — retorna mapa `{ [goalType]: weight }`.

---

## 7. Arquivos

**Criar:**
- `src/lib/metasPeriod.ts`
- `src/lib/metasScore.ts`
- `src/components/metas/PeriodFilterCard.tsx` (card 4)
- `src/components/metas/ScoreCards.tsx` (cards 1, 2, 3)
- Migração SQL para `score_weight`.

**Editar:**
- `src/components/metas/GoalsYearlyGrid.tsx` — integrar filtro + cards no topo, propagar `period` aos filhos.
- `src/components/metas/GoalYearlyChartCard.tsx` — receber `period`, calcular selo/média com base nele.
- `src/components/MonthlyGoalsManager.tsx` — campo Pontuação + validação soma = 100.
- `src/hooks/useMonthlyGoals.ts` — expor `scoreWeight` e helpers.

**Não mexer:**
- `useLoans`, `useExpenses`, `useClients`, `GoalsCard` do Dashboard (fonte de cálculo real permanece a `computeActual` centralizada).

---

## 8. Validação final
- Somar pontos = 100 exato para permitir salvar.
- Meta atingida = peso cheio; não atingida = 0 (regra binária).
- Metas inversas (inadimplência, renegociação): `real ≤ target`.
- Mesma base de cálculo do Dashboard/gráficos (via `computeActual` compartilhado).
- Layout responsivo Mobile / Tablet / Desktop nos 4 cards do topo (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, gap consistente).

Confirma para eu implementar?
