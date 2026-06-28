# Migração do módulo Cofrinhos

## 1. Mapeamento do uso atual de `piggy_banks`

Arquivos que tocam o módulo hoje:

**Núcleo (vai migrar):**
- `src/hooks/usePiggyBanks.ts` (694 linhas) — CRUD de `piggy_banks`, depósitos manuais, cálculo de rendimento no frontend, eventos `balance:changed`.
- `src/components/PiggyBankList.tsx` (996 linhas) — tela principal, criação, edição, depósito, resgate.
- `src/pages/PiggyBankDetail.tsx` (693 linhas) — detalhes, extrato, gráfico de evolução.
- `src/components/PiggyBanksSummaryCard.tsx` — card de saldo total.
- `src/components/PiggyBanksBreakdownDialog.tsx` — drill-down do Dashboard.

**Consumidores periféricos (apenas leitura de saldo/depósitos — manter intactos por compatibilidade):**
- `src/hooks/useAccountBalance.ts`, `useExternalAccountSources.ts` — usam `piggyBanks` + `balances` + `deposits` do hook. Hook continuará expondo a mesma interface.
- `src/lib/projectedBalance.ts`, `incomeProjectedSummary.ts`, `IncomePendingCalendar.tsx`, `MonthTransactionsSheet.tsx`, `ConsolidatedBalanceCards.tsx`, `FinancialHealthDashboard.tsx`, `PersonalExpense*.tsx`, `useExpenses.ts` — apenas consomem `pb.id`, `pb.name`, `balance.balance`.

**Edge / backend (fora do escopo desta migração):**
- `supabase/functions/sync-cdi-rate`, `telegram-process`, `backup-tables` — continuam apontando para `piggy_banks` por ora.

## 2. Estratégia: adapter, não rewrite

Manter a **interface pública** do hook `usePiggyBanks` (campos `piggyBanks[]`, `balances: Map`, `deposits[]`, `cdiRate`, `createPiggyBank`, `deposit`, `withdraw`, `refresh`) — assim os 15+ consumidores periféricos não mudam. Por dentro, o hook lê da nova arquitetura e chama Edge Functions.

Mapeamento de campos:

```text
piggy_banks (antigo)            cofrinhos (novo)
─────────────────────────────────────────────────────
id                              id
name                            nome
target_amount                   meta
percentual_cdi                  percentual_cdi
tipo_rendimento                 tipo_rendimento
balances.balance                saldo_total
balances.totalDeposited         saldo_principal
balances.totalYield             saldo_rendimento_liquido
                                + saldo_rendimento_bruto (novo)
                                + ultimo_rendimento (novo)
```

`deposits[]` (consumido por `useAccountBalance` para descontar depósitos manuais do saldo em conta) → derivar de `cofrinho_aportes` (origem manual) com o mesmo shape `{ id, piggyBankId, amount, date, expenseId, note }`.

## 3. Etapas de implementação

### Etapa 1 — Hook adapter `usePiggyBanks` (núcleo)
Reescrever internamente para:
- `SELECT * FROM cofrinhos WHERE user_id = auth.uid()` → popular `piggyBanks` + `balances`.
- `SELECT * FROM cofrinho_aportes` para `deposits[]` (compat).
- `createPiggyBank` → `INSERT INTO cofrinhos`.
- `deposit(piggyBankId, amount, …)` → `supabase.functions.invoke('processar-deposito-cofrinho', { body })`.
- `withdraw(piggyBankId, amount, …)` → `supabase.functions.invoke('processar-resgate-cofrinho', { body })`.
- Remover qualquer cálculo de rendimento local (`computeYield`, etc.).
- Após invoke OK: refetch de `cofrinhos` + dispatch `balance:changed` (mantém demais cards reativos).
- Tratar `error` da function com `toast.error(error.message ?? 'Falha ao processar')`.
- Realtime: subscrever `cofrinhos` + `cofrinho_eventos` para refetch automático.

### Etapa 2 — Tela principal `PiggyBankList`
- Cards passam a exibir: `saldo_principal` (aplicado), `saldo_rendimento_bruto`, `saldo_rendimento_liquido`, `saldo_total`, `percentual_cdi`, `tipo_rendimento`, `ultimo_rendimento`, `meta`.
- Modais de depósito/resgate apenas chamam `deposit/withdraw` do hook (já encaminham para edge functions).
- Remover qualquer recálculo client-side.

### Etapa 3 — Tela de detalhes `PiggyBankDetail`
- Cabeçalho: aplicado, rendimento bruto/líquido, saldo total, %CDI, meta.
- Aba **Extrato** → `SELECT * FROM cofrinho_eventos WHERE cofrinho_id = ? ORDER BY data DESC`.
- Aba **Aportes** → `cofrinho_aportes`; **Resgates** → `cofrinho_resgates`.
- Gráfico de evolução → `cofrinho_rendimento_diario` (não calcular no front).

### Etapa 4 — Cards/breakdown
- `PiggyBanksSummaryCard` e `PiggyBanksBreakdownDialog` consomem `saldo_total` direto.

### Etapa 5 — Validação
- Smoke test via Playwright: depositar, resgatar, ver extrato e gráfico.
- Verificar que `useAccountBalance` continua conferindo (mesma interface preservada).

## 4. Garantias

- RLS já existente nas tabelas `cofrinho*` cobre o isolamento por usuário.
- `piggy_banks` permanece no banco (não dropada) — apenas deixa de ser lida/escrita pelo fluxo principal.
- Edge Functions tratam toda a regra de rendimento, saldo e CDI.
- Layout visual preservado — só muda origem dos dados.

## 5. Riscos & mitigação

- **Schemas `cofrinho*` ainda não estão em `src/integrations/supabase/types.ts`** (arquivo auto-gerado). Usar `supabase.from('cofrinhos' as any)` com tipos locais para evitar bloqueio. Documentar para regeneração futura dos tipos.
- **Edge function payloads**: vou inspecionar `processar-deposito-cofrinho` / `processar-resgate-cofrinho` se existirem no repo; se forem só remotas, assumir contrato `{ cofrinho_id, valor, data?, nota? }` e ajustar conforme erro retornado no primeiro teste.
- **Compat `deposits[]`**: o `useAccountBalance` filtra `!d.expenseId` para não dobrar débito. Mapear `cofrinho_aportes.expense_id` (se existir) ou `origem='despesa'` para esse campo.

Quer que eu prossiga com a Etapa 1 (reescrever `usePiggyBanks` mantendo a interface pública)?
