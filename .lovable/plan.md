# Plano: Cofrinhos na aba Receitas + Telegram

## 1. Mover Cofrinhos da aba Despesas Pessoais → Receitas

- `src/pages/Index.tsx`: remover `<PiggyBankList />` do bloco `afterEvolution` em Despesas Pessoais (linha ~912). Manter o `CreditCardList` no lugar.
- `src/components/IncomeList.tsx`: adicionar uma nova seção `<PiggyBankList readOnly={isReadOnly} />` logo abaixo do balanço/extrato, dentro de um `<section>` no mesmo padrão visual atual.

## 2. Detalhes expandidos por cofrinho

Em `src/components/PiggyBankList.tsx`, no card de cada cofrinho, exibir:

- **Saldo atual** (já existe)
- **Rendimento bruto acumulado** = saldo − principal aportado (já calculado em `computePiggyBalance().yield`)
- **Imposto pago/descontado** = `bruto × aliquotaIR(diasMédios)` — IR regressivo brasileiro:
  - até 180d: 22,5%
  - 181–360d: 20%
  - 361–720d: 17,5%
  - >720d: 15%
- **Rendimento líquido acumulado** = bruto − imposto
- **Projeção líquida até fim do mês** = simular `computePiggyBalance` com `asOf = último dia do mês corrente`, subtrair imposto projetado, mostrar diferença vs. hoje
- **Taxa CDI atual** (já temos `annualRate`); rotular como "% CDI a.a."

Layout: grid 2 colunas em desktop, stack em mobile, sem quebrar o card existente. Ícones lucide leves (`TrendingUp`, `Percent`, `Receipt`, `CalendarClock`).

Helper novo em `src/lib/piggyTax.ts`: `irRate(days)`, `computePiggyDetailed(deposits, annualRate, asOf)` retornando `{ principal, gross, tax, net, balance, projectionNetEom }`.

## 3. Editar taxa CDI individual com 2 opções

Hoje editar a taxa altera o `annual_rate` da caixinha e como o cálculo é client-side baseado em `(1+rate/100)^(days/365)`, qualquer mudança automaticamente recalcula tudo. Para suportar "manter rendimentos já calculados", precisamos:

### Migração

Nova tabela `piggy_bank_rate_history`:
```
id uuid pk
piggy_bank_id uuid fk → piggy_banks
user_id uuid (data owner)
annual_rate numeric
effective_from date
created_at timestamptz
```
RLS: select/insert/update/delete por `user_id = get_data_owner_id(auth.uid())`.

Trigger/função opcional para popular registro inicial com `annual_rate` corrente quando o cofrinho é criado (ou backfill via migration: para cada cofrinho existente inserir 1 linha com `effective_from = created_at`).

### Cálculo

`computePiggyBalance` passa a aceitar uma função `rateAt(date) → annualRate` ou um array de períodos `[{from, rate}]`. Para cada depósito, calcula juros segmentando o período em janelas de taxa.

### UI no editar

No diálogo de edição (`PiggyBankList.tsx`, ~linha 275), quando o usuário muda a taxa e clica Salvar:
- Se a taxa mudou, abrir um `AlertDialog` secundário com 2 opções:
  1. **"Aplicar apenas aos próximos rendimentos"** → adiciona linha em `piggy_bank_rate_history` com `effective_from = hoje`. `annual_rate` da caixinha vira a nova (representa "atual").
  2. **"Recalcular tudo com a nova taxa"** → apaga o histórico e insere uma única linha com `effective_from = createdAt` da caixinha. Atualiza `annual_rate`.

`usePiggyBanks` carrega `rate_history` por caixinha e expõe via `balances`. `computePiggyBalance` é trocado pela versão segmentada.

## 4. Telegram: transferência caixinha → conta

Adicionar comando ao bot de despesas (`TELEGRAM_API_KEY_2`).

### Edge function

Em `supabase/functions/telegram-webhook` (ou equivalente bot de despesas — verificar qual function processa mensagens livres), adicionar handler de NLP simples:

- Regex/heurística (case-insensitive, sem acento): `(transfer|resgat|sacar|mandar|enviar).*(caixinha|cofrinho).*(conta)` ou `(caixinha|cofrinho).*(para|pra|→).*conta`.
- Extrair valor: `R?\$?\s*([\d\.]+(?:,\d{1,2})?)` → normalizar para number. Se ausente, perguntar.
- Extrair nome/numero da caixinha opcional: `caixinha (\d+)` ou `caixinha "Nome"`. Se múltiplas e não especificada, listar opções.

### Ação

1. Localizar `piggy_bank` do owner (1 → ok; >1 → pedir escolha).
2. Validar saldo ≥ valor.
3. Inserir `piggy_bank_deposits` com `amount = -valor`, `source = 'telegram_withdraw'`, `expense_id = null`.
4. Ajustar saldo da carteira `account` via tabela `balance` (RPC ou update direto): `account_amount += valor`.
5. Registrar uma `incomes` com `category = 'Resgate Cofrinho'`, `status = 'received'`, `received_at = hoje`, `amount = valor`, `notes = '[cofrinho:<id>]'` para que apareça automaticamente no Extrato Financeiro.
6. Responder no chat com saldo novo e confirmação.

Atualizar `telegram-set-commands` para incluir `/resgatar` como atalho documentado, mantendo o NLP livre.

## 5. Critérios de aceitação

- Cofrinhos não aparecem mais em Despesas Pessoais; aparecem em Receitas com layout responsivo.
- Cada card mostra os 6 campos descritos; números atualizam ao depositar/resgatar.
- Editar taxa abre o diálogo de escolha; cada escolha tem efeito visível imediato.
- Mensagem "transferir saldo da caixinha 1 para a conta R$50" no Telegram debita cofrinho, credita saldo em conta, registra entrada no Extrato.

## Arquivos a tocar

- `src/pages/Index.tsx` (remover PiggyBank do bloco)
- `src/components/IncomeList.tsx` (adicionar PiggyBank)
- `src/components/PiggyBankList.tsx` (detalhes + diálogo de taxa)
- `src/hooks/usePiggyBanks.ts` (cálculo segmentado por taxa, CRUD rate history)
- `src/lib/piggyTax.ts` (novo)
- migração SQL: tabela `piggy_bank_rate_history` + RLS + backfill
- Edge function do bot de despesas (handler NLP + ação de transferência)
- `supabase/functions/telegram-set-commands/index.ts` (opcional novo comando)

Posso começar pela parte 1+2 (mover + detalhes) e seguir para 3 e 4 em ordem? Ou prefere outra prioridade?
