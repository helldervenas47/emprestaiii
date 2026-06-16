# Permissões e Limites por Plano

Adicionar controle granular por plano: limites numéricos, abas liberadas/bloqueadas, ações internas por módulo, banner de teste e bloqueios efetivos.

## 1. Schema (SQL no editor — não automatizado)

`ALTER TABLE public.plans` adicionar:
- `trial_days int NOT NULL DEFAULT 0` — duração do teste (0 = plano pago normal)
- `limits jsonb NOT NULL DEFAULT '{}'::jsonb` — limites numéricos
- `permissions jsonb NOT NULL DEFAULT '{}'::jsonb` — flags por ação
- (já existe `allowed_tabs text[]`) — reutilizar

Formato:
```json
limits:       { "loans": 10, "clients": 20, "billings": 10, "users": 1, "notifications": 100 }
permissions:  { "loans.delete": false, "clients.import": false, "clients.export": false, "reports.advanced": false }
```
`null` ou ausente = ilimitado/permitido.

Em `subscriptions` já existe vínculo plano↔usuário; expor `trial_ends_at` via campo já existente ou derivado de `created_at + plan.trial_days`.

## 2. Cadastro do plano (`src/components/admin/PlanManagement.tsx`)

Nova aba/seção **"Permissões e Limites"** dentro do dialog:
- Campo "Dias de teste gratuito" (number).
- Grid de limites numéricos (empréstimos, clientes, cobranças, contratos, registros financeiros, usuários, notificações). Vazio = ilimitado.
- Lista de ações com toggle (loans.create/edit/delete, clients.create/import/export, reports.basic/advanced, etc.).
- Reutiliza `allowed_tabs` para abas liberadas (já existe configurador).

Persistir em `limits` e `permissions` JSON.

## 3. Hook central `usePlanEntitlements`

`src/hooks/usePlanEntitlements.ts`:
- Carrega plano atual via `useSubscription`.
- Expõe `{ limits, permissions, allowedTabs, trial: { active, daysLeft, endsAt }, can(action), withinLimit(key, currentCount), isExpired }`.
- Conta uso atual com `select count('*', { head: true })` por tabela (loans, clients, etc.) — memoizado.

## 4. Bloqueios no app

- **Tabs**: `appTabs.ts` + render do menu — exibir todas, mas marcar bloqueadas (cadeado). Roteamento da aba bloqueada renderiza `<UpgradeGate feature="..." />` em vez do componente real.
- **Ações**: nos botões "Novo empréstimo", "Importar", "Exportar", etc., chamar `can(action)` e `withinLimit(...)`. Quando falso → abrir `UpgradeDialog` com texto explicando o benefício.
- **Trial expirado**: `isExpired === true` → todas as ações de criação/edição bloqueadas; visualização permitida; CTA persistente para upgrade.

## 5. Componentes novos

- `UpgradeGate.tsx` — tela cheia para abas bloqueadas (cadeado, benefícios, botão).
- `UpgradeDialog.tsx` — modal reutilizável para ações.
- `TrialBanner.tsx` — banner fixo no topo (quando trial ativo) com "Restam X dias", barras de uso (`empréstimos 7/10`), botão "Assinar agora".

## 6. Seed do plano Teste Gratuito

Atualizar via UI admin:
```
trial_days: 7
limits: { loans:10, clients:20, billings:10, users:1 }
permissions: { loans.delete:false, clients.import:false, clients.export:false, reports.advanced:false }
allowed_tabs: ["dashboard","clients","loans","profile"]
```

## Detalhes técnicos

- Contagem de uso usa `head:true count:'exact'` para evitar baixar dados.
- `can()`/`withinLimit()` retornam `{ allowed, reason }` para o `UpgradeDialog` exibir texto contextual.
- `permissions` segue convenção `modulo.acao` (string flat) para extensão sem migração.
- Server-side: criar trigger opcional em fase 2 para impor limites no banco; nesta fase apenas client-side.

## Entregáveis

SQL para o usuário rodar + edição de `PlanManagement.tsx`, novo `usePlanEntitlements`, `UpgradeGate`, `UpgradeDialog`, `TrialBanner`, e integração nos pontos de criação principais (loans, clients, billings) e no roteador de abas.
