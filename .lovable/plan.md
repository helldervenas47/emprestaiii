## Por que o card está grande

O card "Saldos consolidados" em `src/components/LedgerView.tsx` (linhas ~155–188) tem três blocos verticais empilhados que somam altura mesmo sem mais conteúdo abaixo:

1. **Ícone circular + label "Saldo Total" + valor** (com `mb-2` no ícone e `mt-1` no valor)
2. **Espaço `mt-4`** entre o total e o grid
3. **Grid Conta/Dinheiro**, onde cada caixa tem ícone + label em uma linha e valor numa segunda linha (`p-3 sm:p-4`)

Somado ao padding do `CardContent` (`p-3 sm:p-5`), isso ocupa bastante altura vertical, especialmente no mobile (440px), dando a sensação de "card vazio e gigante".

## O que vou ajustar

Manter o mesmo layout (Total em cima, Conta + Dinheiro lado a lado embaixo) mas reduzir as alturas no mobile:

- **CardContent**: `p-3 sm:p-5` → `p-2.5 sm:p-4`
- **Bloco do Total**:
  - Remover o ícone circular grande no mobile (manter só no `sm:`) — ou trocar por um ícone inline pequeno ao lado do label
  - Reduzir `mb-1 sm:mb-2` do ícone e `mt-0.5 sm:mt-1` do valor
- **Espaço entre Total e grid**: `mt-3 sm:mt-4` → `mt-2 sm:mt-3`
- **Caixas Conta/Dinheiro**:
  - Padding interno: `p-2.5 sm:p-4` → `p-2 sm:p-3`
  - Colocar ícone + label + valor em layout mais compacto (label menor, sem `mb` extra)

Resultado esperado no mobile: card com cerca de 40–50% menos altura, sem espaço vazio sobrando, mantendo a hierarquia visual (Total destacado em cima, Conta/Dinheiro menores abaixo).

## Arquivos afetados

- `src/components/LedgerView.tsx` — apenas o bloco do card "Saldos consolidados" (~linhas 156–189). Nenhuma mudança em lógica, dados ou outros cards.
