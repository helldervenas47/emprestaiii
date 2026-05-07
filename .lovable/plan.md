# Saldos separados: Conta e Dinheiro

Reestruturar o controle financeiro para ter **dois saldos independentes** (Conta e Dinheiro), tornando a forma de pagamento obrigatória em toda movimentação e adicionando transferências internas entre eles.

## 1. Modelo de dados

Cada forma de pagamento (`payment_methods`) ganha um campo `kind` ('account' | 'cash') que define qual saldo ela movimenta. Padrões propostos:

- **Dinheiro** → cash
- **Pix, Transferência, Boleto, Cartão** → account
- Novas formas criadas pelo usuário podem escolher o tipo (default: account)

Tabela `balance` ganha duas colunas: `account_amount` e `cash_amount` (mantendo `amount` como total consolidado para retrocompat). Tabela `account_ledger` ganha `wallet` ('account' | 'cash') obrigatório e `payment_method_id` (referência opcional). Nova categoria `transfer`.

## 2. Forma de pagamento obrigatória

Tornar `payment_method_id` obrigatório em:

- Empréstimos (desembolso)
- Pagamentos de parcela / quitação / renegociação
- Despesas (e marcação de paga)
- Vendas
- Aportes e ajustes manuais
- Despesas pessoais

UI: seletor compacto de chips/botões com ícones já existentes, posicionado em destaque. Validação client-side (zod) e bloqueio do submit quando vazio.

## 3. Transferências internas

Nova ação "Transferir entre saldos" no extrato:

- Origem (conta/dinheiro) → Destino (oposto)
- Valor, data, observação
- Gera **dois lançamentos** no extrato (saída no origem, entrada no destino), ambos categoria `transfer`, vinculados por `transfer_group_id`
- Não altera o total consolidado
- Editável/excluível em par

## 4. UI/Cálculos a atualizar

- **Card de saldo (Dashboard)**: mostra Conta, Dinheiro e Total
- **Extrato (LedgerView)**: filtros por carteira; coluna mostrando qual saldo foi movimentado
- **Relatórios** (AccountantReport, DetailedReport, DailyPlanning, Backup): considerar separação
- **Capital ativo / saldo disponível**: soma das duas carteiras
- **Conciliação/auditoria**: comparar por carteira

## 5. Migração de dados existentes

- Lançamentos antigos sem `wallet` → assumir `account` (exceto onde a forma de pagamento for "Dinheiro" → `cash`)
- Saldo atual integral vai para `account_amount` por padrão; o usuário pode rebalancear via uma transferência inicial

## Detalhes técnicos

### Schema

```sql
ALTER TABLE payment_methods ADD COLUMN kind text NOT NULL DEFAULT 'account'
  CHECK (kind IN ('account','cash'));

ALTER TABLE balance
  ADD COLUMN account_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN cash_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE account_ledger
  ADD COLUMN wallet text NOT NULL DEFAULT 'account'
    CHECK (wallet IN ('account','cash')),
  ADD COLUMN payment_method_id uuid REFERENCES payment_methods(id),
  ADD COLUMN transfer_group_id uuid;

-- backfill: Dinheiro → cash
UPDATE payment_methods SET kind='cash' WHERE lower(name)='dinheiro';
UPDATE account_ledger al SET wallet='cash'
  FROM payment_methods pm
  WHERE al.payment_method_id=pm.id AND pm.kind='cash';

-- balance backfill: tudo vai para account
UPDATE balance SET account_amount = amount WHERE account_amount = 0;
```

### Código

- `src/lib/balance.ts`: funções `getBalances()`, `setBalance({account, cash})`, `adjustBalance(delta, wallet)`. Manter `getBalance()` retornando soma para retrocompat.
- `src/lib/ledger.ts`: `RecordLedgerInput` ganha `wallet` e `payment_method_id` obrigatórios; `recordTransfer({from, to, amount, date, note})` cria par.
- `src/hooks/usePaymentMethods.ts`: expor `kind` e helper `getMethodKind(id)`.
- Hooks de loans/payments/expenses/sales: propagar `payment_method_id` (já existem em parte) e derivar `wallet` automaticamente.
- Componentes de formulário: `PaymentMethodPicker` reutilizável (chips com ícone) — substitui selects atuais e marca como required.
- `LedgerView`: tabs "Tudo / Conta / Dinheiro", botão "Transferir", badge da carteira em cada linha.
- `DashboardCards`: três valores (Conta, Dinheiro, Total) com toggle de visibilidade.

### Fora de escopo (perguntar depois se necessário)

- Múltiplas contas bancárias separadas (ex: Banco A / Banco B). Aqui só separamos Conta vs Dinheiro físico.
- Conversão automática de cartão de crédito (continua tratado pela lógica atual de fatura).
