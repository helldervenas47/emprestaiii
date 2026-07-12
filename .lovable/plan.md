# Bônus por Pontuação de Metas

Objetivo: pagar automaticamente um bônus ao funcionário quando a **Pontuação Geral Mensal** das metas atingir o mínimo configurado, lançando o valor no holerite do **mês seguinte**.

---

## 1. Backend (Lovable Cloud)

### 1.1 Nova tabela `employee_goal_bonuses` (configuração por funcionário)
```
id uuid pk
user_id uuid (dataOwner)
employee_id uuid fk employees
enabled boolean default true
min_score numeric not null           -- pontuação mínima
bonus_amount numeric not null        -- R$
start_date date not null
end_date date null                   -- opcional
notes text null
created_at / updated_at
```
RLS + GRANT padrão (authenticated + service_role). Sem acesso anon.

### 1.2 Nova tabela `goal_bonus_awards` (histórico / snapshot imutável)
```
id uuid pk
user_id uuid
employee_id uuid fk employees
bonus_config_id uuid fk employee_goal_bonuses (nullable — preserva se config for apagada)
reference_month text  -- 'YYYY-MM' competência das METAS avaliadas
payroll_month text    -- 'YYYY-MM' competência da folha onde o bônus foi lançado (reference+1)
score_obtained numeric
min_score_required numeric
bonus_amount numeric
status text check in ('gerado','pago','cancelado') default 'gerado'
payroll_id uuid null fk payrolls
generated_at timestamptz default now()
```
Unique: `(user_id, employee_id, reference_month)` — evita duplicidade.
RLS + GRANT.

### 1.3 Snapshot da pontuação
Reusar `monthly_goal_snapshots` já existente. Ao gerar o award, gravar `score_obtained` calculado no **fechamento da competência** (a pontuação vem do mesmo cálculo de `computePeriodScore` em modo `month`).

Migração inclui GRANTs, RLS por `has_role`/`get_data_owner_id`, índices em `(user_id, reference_month)`.

---

## 2. Frontend — Cadastro do bônus

### Local
Aba **Salários → Funcionários** (`EmployeeManager`). Dentro do formulário do funcionário adicionar uma **seção colapsável "Bônus por Metas"** com os campos:
- Switch **Ativar bônus por metas**
- Input numérico **Pontuação mínima (0–100)**
- Input R$ **Valor do bônus**
- Date **Início da vigência**
- Date **Fim da vigência (opcional)**
- Textarea **Observações**

Novo hook: `useEmployeeGoalBonuses.ts` (CRUD + realtime).

Estilo consistente com os demais blocos do form (mesmos `Card`, `Label`, `Input` já usados).

---

## 3. Lógica de geração do bônus

Novo arquivo `src/lib/goalBonusEngine.ts`:

```ts
generateBonusAwardsForMonth(referenceMonth: 'YYYY-MM', inputs): Promise<void>
```

Passos:
1. Só executa se `referenceMonth < currentMonth` (competência fechada).
2. Calcula **Pontuação Geral Mensal** de `referenceMonth` usando **exatamente** `computePeriodScore({ mode: 'month', year, month })` com os mesmos `RealizedInputs` da aba Metas (`useMonthResultInputs` — extrair caso ainda não exista helper compartilhado). Total = soma dos pesos das metas atingidas.
3. Para cada `employee_goal_bonuses` ativo e vigente naquele mês:
   - se `score >= min_score` e não existir award para `(employee_id, referenceMonth)` → insert em `goal_bonus_awards` com `payroll_month = referenceMonth + 1`.
4. Nunca sobrescreve award existente (unique key + `on conflict do nothing`).

### Onde chamar
- **Hook `useGoalBonusAutoRun`** montado no `SalaryTab`: ao abrir a aba, roda para todos os meses fechados dos últimos 3 meses que ainda não têm award (idempotente).
- **`PayrollManager`**: ao abrir o modal de "Nova folha / competência X", antes de montar os itens, roda `generateBonusAwardsForMonth(X - 1 mês)` e injeta os awards `status='gerado'` como `earnings` da folha.

---

## 4. Integração com holerite / folha

Em `usePayrolls.ts` (função de criar/recalcular folha) e/ou `PayrollManager`:
1. Ao gerar holerite da competência `M` para funcionário E:
   - Buscar `goal_bonus_awards` where `employee_id=E and payroll_month=M and status in ('gerado','pago')`.
   - Para cada award ainda não vinculado (`payroll_id is null`), adicionar um item em `payroll.items.earnings`:
     ```
     { label: 'Bônus por Atingimento das Metas', amount, kind: 'goal_bonus', meta: { referenceMonth, scoreObtained, minScore, awardId } }
     ```
   - Atualizar `goal_bonus_awards.payroll_id = payroll.id`.
2. Ao **recalcular** folha existente: não recriar; apenas re-vincular awards já existentes. Nunca duplica (garantido pela unique key + verificação de `payroll_id`).
3. Se folha for excluída: setar `payroll_id=null`, manter award (não cancela).
4. Se award for cancelado (`status='cancelado'`), remover o item da folha na próxima edição.

Extender `SalaryItem.kind` já suporta string livre — usar `'goal_bonus'`. Renderização no holerite (`payslipPdf.ts` e visualização) mostra descrição estendida quando `kind==='goal_bonus'`, incluindo:
- Referência: `MMMM/yyyy` do `referenceMonth`
- Pontuação obtida: X
- Meta mínima: Y
- Valor

Ler `meta` do item para exibir.

---

## 5. Histórico na ficha do funcionário

Novo componente `EmployeeGoalBonusHistory.tsx` renderizado dentro do detalhe do funcionário (abaixo da seção "Bônus por Metas"):

Tabela responsiva: Competência • Pontuação obtida • Mínima • Valor • Data de geração • Status (badge).

Fonte: `goal_bonus_awards` filtrado pelo `employee_id`.

Ações: apenas visualização + botão **Cancelar** (admin) que muda status para `'cancelado'`.

---

## 6. Relatórios

Em `SalaryDashboard` adicionar bloco **"Bônus por Metas"** com:
- Total pago no período (soma de awards `status in pago`)
- Nº de funcionários bonificados no mês
- Lista compacta (competência, funcionário, pontuação, valor)

Filtro por competência. Reaproveita `goal_bonus_awards`.

---

## 7. Consistência de dados

- Pontuação **sempre** vem de `computePeriodScore` (mesmo cálculo dos cards e da tabela detalhada). Extraí-lo caso ainda esteja acoplado ao componente.
- Award grava `score_obtained` no momento da geração → imutável mesmo se metas forem editadas depois.
- Alterações em `employee_goal_bonuses` **não** afetam awards já criados.
- Geração só ocorre para competência já fechada (`month < currentMonth`).

---

## 8. Responsividade

- Seção de cadastro: mesma grid do form (`grid-cols-1 sm:grid-cols-2`).
- Histórico: tabela vira card list em `< sm` (padrão do projeto).
- Dashboard bloco: `grid-cols-1 md:grid-cols-3`.

---

## Detalhes técnicos (para revisão do dev)

**Arquivos a criar**
- `supabase/migrations/…_goal_bonus.sql` (2 tabelas + RLS + GRANT + índices + unique)
- `src/hooks/useEmployeeGoalBonuses.ts`
- `src/hooks/useGoalBonusAwards.ts`
- `src/hooks/useGoalBonusAutoRun.ts`
- `src/lib/goalBonusEngine.ts`
- `src/components/salary/EmployeeGoalBonusSection.tsx` (form)
- `src/components/salary/EmployeeGoalBonusHistory.tsx`
- `src/components/salary/GoalBonusReportBlock.tsx`

**Arquivos a editar**
- `src/components/salary/EmployeeManager.tsx` — inserir seção no form + histórico no detalhe.
- `src/components/salary/PayrollManager.tsx` + `src/hooks/usePayrolls.ts` — injetar awards como earning; vincular `payroll_id`.
- `src/lib/payslipPdf.ts` e componente de visualização — renderizar bloco detalhado quando `kind==='goal_bonus'`.
- `src/components/salary/SalaryDashboard.tsx` — bloco de relatório.
- `src/components/metas/…` (opcional) — helper `getMonthlyScore(monthKey)` exportado para reuso pelo engine, garantindo fonte única.

**Não mexer**
- Cálculo/renderização dos cards de Metas.
- `computePeriodScore`, `metasPeriod.ts` (usar como está).

---

## Fluxo end-to-end (exemplo)
1. Admin ativa bônus para João: min 85, R$ 500, vigência 01/07/2026 – aberta.
2. Julho/2026 fecha. Ao abrir Salários, `useGoalBonusAutoRun` roda engine para `2026-07`.
3. Engine calcula score = 92 → cria award `reference=2026-07`, `payroll_month=2026-08`, `bonus_amount=500`, `status=gerado`.
4. Admin gera folha de agosto/2026 do João → item **Bônus por Atingimento das Metas R$ 500** é injetado; `payroll_id` vinculado.
5. Ao pagar folha, award vira `status='pago'`.
6. Aparece no histórico da ficha e no relatório do Dashboard.

Confirma para eu implementar?