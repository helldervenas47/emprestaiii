## Escopo

Reduzir o tamanho dos 10 arquivos listados (23.727 linhas totais) sem alterar UI, regras de negócio ou interface pública dos componentes principais. O trabalho é grande demais para uma única rodada — proponho executar em **fases pequenas e independentes**, validando o build a cada fase. Cada fase pode ser aprovada/pausada isoladamente.

## Princípios

- Cada extração preserva os imports atuais (re-exports quando necessário).
- Funções puras saem primeiro (zero risco de regressão).
- Componentes internos saem por último, mantendo props idênticas.
- Sem renomear símbolos exportados.
- TypeScript compila limpo após cada fase.

## Fase 1 — LoanList.tsx (5.745 linhas) — começa agora

Extrações na ordem, cada uma como commit lógico:

**1.1 Tipos e constantes**
- `src/components/loans/list/types.ts` — tipos internos (filtros, estados de modal, sort, etc.)
- `src/components/loans/list/constants.ts` — labels, opções de filtro, status maps.

**1.2 Helpers de cálculo puros**
- `src/components/loans/list/calculations.ts` — agregações (total emprestado, restante, juros, ordenação por colunas).

**1.3 Helpers de formatação**
- `src/components/loans/list/formatting.ts` — formatação BRL, data, status, badges.

**1.4 Subcomponentes já isoláveis**
- `WhatsappBillButton` → `src/components/loans/list/WhatsappBillButton.tsx`
- Cards de resumo no topo → `LoanListSummaryCards.tsx`
- Barra de filtros → `LoanListFilters.tsx`

**1.5 Modal de detalhes / histórico**
- `LoanDetailsDialog.tsx` (somente JSX + handlers locais; dados continuam vindo do pai por props).

**1.6 Tabela/lista**
- `LoanListTable.tsx` (linha, expansão, ações inline). `LoanList.tsx` final fica como container/orquestrador.

Após 1.6, `LoanList.tsx` deve cair para ≈ 500–800 linhas, mantendo o mesmo default export e mesma assinatura de props.

## Fases seguintes (uma por vez, sob demanda)

2. `DashboardOverview.tsx` — extrair cards (Saúde Financeira, Top 5, Cofrinho, Estoque) e seus dialogs de drill-down.
3. `ProductSalesView.tsx` — separar formulário, lista e relatório.
4. `pages/Index.tsx` — extrair tabs/roteamento interno em subcomponentes.
5. `useLoans.ts` — separar mappers, cálculos e mutations em hooks auxiliares (`useLoanMutations`, `useLoanCalculations`).
6. `AccountantReport.tsx` — extrair cards de resumo, dialog de detalhes, navegação de mês.
7. `GoalsCard.tsx`, `PersonalExpenseList.tsx`, `CreditCardInvoice.tsx`, `PiggyBankList.tsx` — mesma abordagem.

## Validação por fase

- `tsgo` (typecheck) limpo.
- Build do Vite sem warnings novos.
- Sem mudanças nos arquivos consumidores (mesmos imports, mesmas props).

## Detalhes técnicos

- Novos arquivos vivem em `src/components/loans/list/` (já existe `src/components/loans/` no projeto).
- Funções puras movidas mantêm exports nomeados; se forem usadas só dentro de `LoanList`, não são re-exportadas para fora.
- Nada de mudanças em `@/hooks/useLoans`, `@/lib/loanLateFees`, `@/lib/loanInstallmentAmount` nesta fase.

## Próximo passo

Começar pela Fase 1.1 + 1.2 + 1.3 (tipos, cálculos e formatação de `LoanList.tsx`) em uma única rodada — são extrações puras, baixo risco, e já reduzem ≈ 400–600 linhas do arquivo.

Confirme para eu seguir, ou ajuste a ordem/escopo se preferir atacar outro arquivo primeiro.