## Escopo

Auditoria e ajuste **puramente visual** da rota `/` (Dashboard) na largura de Tablet (768–1279 px). Sem alterar lógica, cálculos, hooks, dados ou navegação — apenas classes Tailwind, tokens de espaçamento e estrutura de grid.

Alvo principal:
- `src/pages/Index.tsx` (header, "Visão Geral", grid dos 4 cards principais + 6 cards de indicadores, "Saúde da Operação").
- `src/components/dashboard/DashboardPeriodFilter.tsx` (setas + mês + Dia/Semana/Mês).
- `src/components/ConsolidatedBalanceCards.tsx` e cards de indicadores usados no grid (Capital na Rua, Pendente de Recebimento, Lucro Estimado, Juros a Receber/Recebidos/Pendentes).

Não estão no escopo agora: card "Saúde da Operação", gráficos anuais, mobile, desktop (apenas garantir que não regridam).

## Correções

### 1. Grade única (base 8 px) na Tablet
- Container do Dashboard: `max-w-screen-xl mx-auto px-6 md:px-8` para eliminar sobras laterais.
- Grid superior de 4 cards: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6`.
- Grid de indicadores (6 cards): `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 md:gap-5` — em tablet ficam 3+3, mesma altura por linha, evita a fileira única esticada que corta valores.
- Espaçamento vertical entre seções unificado em `space-y-6 md:space-y-8`.

### 2. Header e filtros
- Header: alinhar logo, texto secundário e ícones ao mesmo baseline (`items-center gap-3`, ícones `h-9 w-9`, sem `text-lg` diferentes por breakpoint).
- "Visão Geral" acima da linha de filtros: título `text-lg md:text-xl font-semibold` (era grande demais em tablet).
- Linha de filtro: setas + mês centralizados verticalmente com o toggle Dia/Semana/Mês (`flex items-center justify-between gap-4`, todos os controles `h-9`, mesma `rounded-lg`). Toggle segmentado com larguras iguais (`grid grid-cols-3 w-[180px]`).

### 3. Cards — normalização
- Estrutura padrão de card: `flex h-full flex-col justify-between rounded-2xl border bg-card p-4 md:p-5`.
- Ícone de topo e ícones de ação (olho, info) na mesma linha superior: `flex items-start justify-between` — todos ficam na mesma posição vertical em cada card.
- Título do card: `text-sm font-medium text-muted-foreground leading-tight`, sempre 1 linha (truncate).
- Valor principal: `text-xl md:text-2xl font-bold tabular-nums leading-tight` (era `text-3xl` que forçava quebra em tablet).
- Subvalor (Domingo/Fim do mês/Pix/Dinheiro): grid interno `grid grid-cols-2 gap-2` com `rounded-lg bg-muted/40 p-3`, título e valor alinhados à esquerda, mesma altura.
- Cards da linha inferior: mesma altura via `h-full` no filho + `items-stretch` no grid.

### 4. Tipografia consistente
Escala aplicada em toda a tela:

```text
Página (Dashboard)   text-2xl md:text-3xl font-bold
Seção (Visão Geral)  text-lg md:text-xl font-semibold
Card title           text-sm font-medium text-muted-foreground
Valor principal      text-xl md:text-2xl font-bold tabular-nums
Valor secundário     text-base font-semibold tabular-nums
Meta/label pequena   text-xs text-muted-foreground
```

Aplicar `tabular-nums` em todo valor monetário para alinhar dígitos entre cards.

### 5. Botões e ícones de ação
- Todos os botões ghost do header e ícones dos cards: `h-9 w-9 rounded-lg` (era misto entre 8 e 10).
- Toggle Dia/Semana/Mês: mesmo `h-9`, `text-sm`, larguras iguais, item ativo `bg-background shadow-sm`.
- Setas do seletor de mês: mesma `h-9 w-9` das demais.

### 6. Espaçamento (múltiplos de 8/4)
- Gap entre cards de uma linha: `gap-4` (tablet), `gap-6` (desktop).
- Padding interno de card: `p-4` (tablet), `p-5` (desktop).
- Distância ícone ↔ texto: `gap-2`.
- Espaço entre seções: `space-y-6`.

### 7. Responsividade tablet (validação)
- Rodar Playwright em 768×1024 e 1024×1366 e conferir screenshots:
  - todos os 6 cards de indicadores mesma altura;
  - nenhum valor monetário quebrando linha;
  - filtros e setas alinhados na mesma faixa horizontal;
  - sem overflow horizontal.

## Não faremos

- Nenhuma alteração em hooks, cálculos, formatação numérica, RLS, dados.
- Sem novos componentes ou reestruturação de rotas.
- Sem alterar mobile ou desktop além do necessário para não regredir.

## Entregáveis

Edições em `src/pages/Index.tsx`, `src/components/dashboard/DashboardPeriodFilter.tsx`, `src/components/ConsolidatedBalanceCards.tsx` e nos 6 cards de indicadores (identificar exato após aprovar plano). Screenshot antes/depois em 1024×1366 anexado ao final.

Confirmação: posso seguir com essa auditoria só na Tablet, ou você prefere que eu inclua também Desktop e Mobile na mesma passada?