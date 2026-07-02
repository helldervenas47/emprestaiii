# P0-01 — Fonte única de saldo (`account_ledger`)

Esta é uma refatoração de alto risco que atravessa Receitas, Despesas, Dashboard, Cartões, Cofrinhos, Veículos e Relatórios. Antes de tocar em código, preciso alinhar o modelo, porque hoje o sistema **não** grava tudo no ledger — parte do saldo é derivada dos próprios registros (`incomes.status='received'`, `expenses.paid=true`, `sales.paymentHistory`, `piggy deposits`, `vehicle_balance`, `balance` account+cash). Trocar isso sem cuidado dobra ou zera saldos.

## Situação atual (mapeamento)

Fontes de saldo hoje:

1. `src/hooks/useAccountBalance.ts` — deriva de incomes+sales−expenses−piggy−ccExtra + `external.total`.
2. `src/hooks/useUnifiedAccountBalance.ts` — variação que usa `account_ledger` só para pagamentos de fatura de cartão + `cofrinhos.saldo_principal`.
3. `src/components/dashboard/useAccountBalance.ts` — lê `balance.account_amount + cash_amount` via `getBalance()`.
4. `src/components/IncomeBalanceCard.tsx` — recalcula localmente.
5. `src/lib/balance.ts` — tabela `balance` (conta+dinheiro), ajustada por `adjustBalance` / `adjust_balance_atomic`.
6. `src/lib/vehicleBalance.ts` — `vehicle_balance` (saldo separado de veículos, por regra).
7. `recordLedger()` grava em `account_ledger` em pontos específicos (ex.: pagamento de fatura).

Escrituras que hoje afetam saldo:
- Marcar receita como recebida (incomes.status).
- Marcar despesa como paga (expenses.paid).
- Registrar venda / parcela paga.
- Depósito/resgate em cofrinho (`cofrinhos.saldo_principal` + trigger).
- Pagamento de fatura de cartão (grava em `account_ledger`).
- Ajuste manual do saldo Dashboard (`balance`).
- Ajuste de saldo de veículos (`vehicle_balance`).

## Decisão de arquitetura proposta

Definir `account_ledger` como **fonte oficial do "Saldo em Conta"**, com estas regras:

- Saldo oficial = `SUM(amount * sign)` sobre `account_ledger` filtrado por `user_id = ownerId`, onde `sign = +1` para `direction='in'` e `-1` para `direction='out'`.
- Excluir da conta oficial:
  - `metadata->>scope = 'vehicle'` (veículos têm saldo próprio — regra mantida).
  - `metadata->>scope = 'piggy_principal'` se decidirmos manter cofrinhos fora (a definir — ver Pendências).
- Todo evento financeiro que hoje "vira dinheiro em conta" precisa ter um lançamento correspondente no ledger. Onde ainda não tem, a leitura oficial não pode migrar sem antes garantir a escrita, senão o saldo colapsa.

## Escopo desta etapa (seguro, sem quebrar)

Para atender o P0 sem riscos de dupla contagem, faremos apenas o passo **não destrutivo**:

1. **Criar `src/lib/accountLedgerBalance.ts`** — service único:
   - `getOfficialBalance(ownerId)` — soma `account_ledger` (in − out), ignorando `metadata->>scope in ('vehicle')`.
   - `useOfficialAccountBalance()` — hook React com Realtime em `account_ledger` + eventos `ledger:changed`.
2. **Adicionar um "shadow check"** (dev-only, atrás de `financeDebug`) que compara o saldo oficial vs. o derivado atual e loga divergências no console. Nenhuma UI muda.
3. **Documentar** em `docs/finance-balance-source.md` a fonte oficial, o que entra/sai, e o roteiro das próximas fases.
4. **Comentários técnicos** nos hooks existentes (`useAccountBalance`, `useUnifiedAccountBalance`, `dashboard/useAccountBalance`, `IncomeBalanceCard`) apontando para o service oficial e marcando-os como legado a serem substituídos nas próximas fases.
5. Rodar `tsgo` e `vitest run`.

**Não faremos nesta etapa** (fica para P0-01b / P0-01c, com migrações no banco):
- Trocar o consumo do saldo na UI (Dashboard/Receitas/Despesas) para o service oficial.
- Garantir gravação no ledger para todo income/expense/sale/piggy — falta backfill + triggers/edge no banco.
- Remover `balance` (conta+dinheiro) e `vehicle_balance` — dependem de decisão de UX (saldo em dinheiro separado).

Motivo: trocar a leitura antes de garantir a escrita **quebraria** o saldo em produção (é o oposto do critério "nenhum fluxo é quebrado").

## Detalhes técnicos

`getOfficialBalance` query:
```ts
supabase
  .from("account_ledger")
  .select("amount, direction, metadata")
  .eq("user_id", ownerId)
  .not("metadata->>scope", "eq", "vehicle");
// somar: direction === 'in' ? +amount : -amount
```

Hook: assina canal Realtime em `account_ledger` (filter `user_id=eq.${ownerId}`) + listeners `ledger:changed` / `balance:changed`.

Shadow check: `if (import.meta.env.DEV) financeSetState("balance-parity", { official, legacy, delta })`.

## Riscos

- Ledger hoje é **incompleto** — não cobre todas as receitas/despesas/vendas. Migrar leitura agora zeraria saldos.
- `metadata` não é uniforme (nem toda linha tem `scope`), então o filtro de veículos precisa ser validado contra dados reais.
- Cofrinhos usam saldo próprio via trigger em `cofrinhos.saldo_principal`; decidir se entram ou não na conta oficial afeta muitas telas.
- Ajustes manuais em `balance` (conta/dinheiro) não têm contrapartida em `account_ledger` hoje.

## Pendências para próximas fases

- P0-01b: backfill de `account_ledger` a partir de incomes/expenses/sales pagos + trigger no banco para novos registros.
- P0-01c: migrar leitura de UI para `useOfficialAccountBalance` e remover hooks derivados.
- P0-01d: decidir tratamento de cofrinhos (linhas no ledger com scope `piggy`) e de "dinheiro em espécie" (carteira `cash`).
- P0-01e: remover `useAccountBalance` legado e `balance`/`vehicle_balance` se aplicável.

## Aceite desta etapa

- Service oficial criado e testado.
- Shadow check reportando paridade em dev.
- Documentação da fonte oficial.
- Build/tsgo/vitest verdes.
- **Zero mudança visível** no app (UI continua consumindo os hooks atuais).

Confirma esse recorte? Se preferir avançar direto trocando a leitura da UI, precisamos antes rodar o backfill + triggers no banco — posso planejar essa fase separadamente.
