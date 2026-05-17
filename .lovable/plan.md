## Objetivo

Substituir o "override do dia 1" por uma funcionalidade genérica de **Ajuste de Saldo Base**, permitindo ancorar a projeção do saldo previsto em qualquer data válida (mês atual ou futuro) com auditoria visível e propagação consistente para todos os cálculos derivados.

## 1. Backend (nova tabela)

Criar tabela `balance_adjustments` (substitui semanticamente `monthly_opening_balances`, que ficará apenas como legado migrável):

| coluna | tipo | nota |
|---|---|---|
| id | uuid PK | |
| owner_id | uuid | RLS por `get_data_owner_id` |
| adjustment_date | date | **UNIQUE (owner_id, adjustment_date)** |
| amount | numeric | saldo correto naquela data |
| previous_amount | numeric | saldo previsto automático no momento do ajuste (auditoria) |
| adjusted_by | uuid | `auth.uid()` no insert (quem ajustou) |
| notes | text nullable | |
| created_at, updated_at | timestamptz | |

- RLS: mesmas políticas de `monthly_opening_balances` (select por owner; insert/update/delete exigem `can_write_data`).
- Migração de dados: copiar registros de `monthly_opening_balances` para `balance_adjustments` como `YYYY-MM-01` (idempotente, ignora conflitos).
- Manter `monthly_opening_balances` por compatibilidade (read-only no app daqui em diante).

## 2. Hook `useBalanceAdjustments`

Substitui `useMonthlyOpeningBalances` no calendário. Expõe:

- `adjustments: Record<YYYY-MM-DD, { amount, previousAmount, adjustedAt, adjustedBy, adjustedByName? }>`
- `setAdjustment(date, amount, previousAmount)` — upsert
- `clearAdjustment(date)` — delete
- Lookup do nome via `profiles.display_name` (join leve, cacheado).

## 3. Lógica de projeção

Atualizar `src/lib/projectedBalance.ts` (`computeRunningBalance`) e o cálculo inline em `IncomePendingCalendar.tsx`:

- A cada dia do cursor, se `adjustments[YYYY-MM-DD]` existir → `running = amount` ANTES de aplicar o delta do dia (o ajuste vira a nova base do dia; receitas/despesas do mesmo dia continuam somando).
- Remove o caso especial "se dia === 1, ler de overrides[YYYY-MM]" (substituído pela nova lógica genérica). Manter fallback de leitura para `monthly_opening_balances` apenas se não houver `balance_adjustments[YYYY-MM-01]` para aquele mês (compatibilidade).
- Garante que o efeito cascata é único: ao recalcular, sempre parte da última base ajustada — sem dupla contagem (a lógica já é sequencial dia-a-dia, então isso é automático).

## 4. Regra de bloqueio retroativo

No componente, antes de abrir/salvar:

- Permitido: `data >= primeiro dia do mês atual` (em `appTz`).
- Bloqueado: data em mês anterior → `toast.error("Não é possível recalcular saldos de meses encerrados.")` e não abre/salva.

## 5. UI — Novo modal "Ajustar saldo base"

Substitui o modal atual de "Alterar saldo do dia 1". Acessível ao clicar no saldo previsto de **qualquer dia** (não só dia 1) — botão "Ajustar saldo base" no card de saldo do dia selecionado.

Conteúdo:

- **Saldo previsto atual** (read-only, calculado)
- **Saldo correto** (`MoneyInput`)
- **Data do saldo** (`DatePickerField`, default = dia selecionado, validação contra mês passado)
- **Prévia do impacto**: "Os próximos N dias serão recalculados" (N = dias entre data e fim do mês visível, ou até `today + 60d` se mês visível < data)
- Botões: `Cancelar` · `Recalcular saldo futuro` (CTA primário) · `Remover ajuste` (se já existe um ajuste nessa data)

Remove o Switch "Permitir alterar saldo do dia 01" e a flag `calendar:incomeAllowDay1BalanceOverride` (não faz mais sentido).

## 6. UI — Indicador visual de ajuste manual

No grid do calendário (mês expandido **e** semana atual):

- Dias com `adjustments[date]` recebem um pequeno ícone (lucide `Wand2` ou `Anchor`) no canto superior direito da célula, cor `primary`.
- Clique no ícone (stopPropagation) abre **popover** mostrando:
  - Saldo anterior (`previousAmount`)
  - Saldo corrigido (`amount`)
  - Data do ajuste (`adjustedAt`)
  - Usuário responsável (`adjustedByName` ou e-mail)
  - Botão "Remover ajuste"

## 7. Sincronização com outros módulos

Verificar consumidores do override antigo:
- `src/lib/projectedBalance.ts` — usado em `DailyPlanning.tsx`, `DailyPlanningReport.tsx`, `IncomeDashboard.tsx`. Trocar parâmetro `overrides: Record<YYYY-MM, number>` por `adjustments: Record<YYYY-MM-DD, number>` (a forma simplificada — só o valor — basta para projeção; o resto só interessa à UI do calendário).
- `useAccountBalance` (saldo total em mãos) **não muda** — ele reflete movimentações reais (recebidas/pagas), não projeção. Ajustes manuais não alteram o saldo "agora", só a projeção futura.
- Dashboard, Extrato, Cofrinhos, Receitas/Despesas → todos que consomem `getMonthEndProjectedBalance` passam a receber `adjustments` em vez de `overrides`.

## 8. Cleanup

- Remover `ALLOW_DAY1_OVERRIDE_KEY` e o Switch correspondente.
- Manter `useMonthlyOpeningBalances` exportado por enquanto (não quebrar imports caso existam fora do calendário) marcando como `@deprecated`.

## Detalhes técnicos

- A migração SQL será criada pela ferramenta de migration (com aprovação separada).
- O dia do ajuste vira ponto-âncora: `running = adjustment.amount` aplicado ANTES do delta do dia. Assim, receitas/despesas lançadas no próprio dia ainda alteram o saldo final exibido (correto: "saldo corrigido = R$ 2.350" representa o ponto de partida do dia).
- `previous_amount` é capturado no momento do salvamento usando `runningBalanceMap[date]` ANTES do upsert.
- `adjusted_by` preenchido no client (`auth.user.id`); display name resolvido via `profiles`.

## Pontos de confirmação antes de codar

1. **Confirmar substituição** do modal atual de "dia 1" pelo novo (em vez de coexistirem).
2. **Confirmar remoção** do Switch "Permitir alterar saldo do dia 01".
3. **Confirmar** que ajuste é por **data específica** (não por mês), conforme o exemplo "01/06/2026 = R$ 2.350".
