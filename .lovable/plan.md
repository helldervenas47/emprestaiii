

## Objetivo

Adicionar, na sub-aba **Despesas Pessoais**, um gráfico de linhas mostrando a evolução mensal dos gastos por categoria pessoal nos últimos meses.

## Como vai funcionar

- Card novo "Evolução mensal por categoria" abaixo do card de Orçamento.
- Eixo X: últimos 6 meses (configurável via toggle: 3M / 6M / 12M).
- Eixo Y: valor gasto em R$.
- Uma linha por categoria pessoal que tenha pelo menos uma despesa no período.
- Cores fixas por categoria (paleta HSL do design system).
- Tooltip mostra mês + valores por categoria formatados em BRL.
- Legenda interativa: clicar oculta/mostra a linha.
- Considera todas as despesas pessoais cadastradas (não apenas pagas), agrupadas pelo mês de `due_date` — consistente com a lógica de orçamento.

## Implementação técnica

**Arquivos:**
- `src/components/PersonalExpenseList.tsx` — adicionar o card com `LineChart` (recharts via `@/components/ui/chart`).

**Lógica de dados (memoizada):**
1. Gerar lista dos últimos N meses (`YYYY-MM`).
2. Filtrar despesas pessoais cujo `due_date` cai nesses meses.
3. Agrupar: `{ mês, [categoria]: soma }`.
4. Listar categorias presentes para gerar `<Line>` dinâmicos.

**UI:**
- `ChartContainer` + `LineChart` com `CartesianGrid`, `XAxis` (label mês abreviado pt-BR), `YAxis` (formato R$ compacto), `ChartTooltip`, `ChartLegend`.
- Toggle de período usando `ToggleGroup` (3M / 6M / 12M), default 6M.
- Estado vazio: mensagem "Sem dados suficientes para exibir o histórico".

**Observação:** Não há mudanças de schema nem de backend — apenas leitura dos dados já existentes em `expenses` (scope = `personal`).

