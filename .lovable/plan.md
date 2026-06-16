
# Validação e ativação das regras do plano Teste Gratuito

Hoje a infraestrutura existe (`usePlanEntitlements`, `TrialBanner`, `UpgradeGate`, colunas `trial_days/limits/permissions` em `plans`), mas faltam três peças para garantir o cenário descrito: (1) associar o plano escolhido ao usuário no cadastro, (2) aplicar limites/permissões em todos os fluxos de criação, (3) bloquear o sistema quando o teste expira.

## 1. Associar o plano no cadastro

- No `Signup` (`src/pages/Cadastro.tsx` / `Auth.tsx`), ler `?plan=` da URL e gravar em `profiles.trial_plan_name` + `profiles.trial_started_at` no momento do `signUp`.
- Migration: adicionar em `public.profiles` as colunas `trial_plan_name text` e `trial_started_at timestamptz default now()`.
- `usePlanEntitlements` passa a resolver o plano por: assinatura ativa → `profiles.trial_plan_name` → primeiro plano ativo (fallback atual).

## 2. Comportamento configurável da expiração

- Adicionar à tabela `plans` a coluna `expiration_action text` com valores `block_all | readonly | force_upgrade` (default `force_upgrade`).
- Na UI de admin (`PlanManagement.tsx`), novo `Select` "Ao expirar o teste" com essas três opções.
- `usePlanEntitlements` expõe `trial.expirationAction`.

## 3. Aplicar limites continuamente

Criar um helper `useLimitGuard(key)` que retorna `{ blocked, reason, remaining }` consultando o `count` real (via `supabase.from(table).select('*', { count: 'exact', head: true })`).

Pontos de uso (envolver o botão "Novo" com `UpgradeGate` + checagem `withinLimit`):
- Empréstimos (`Loans`/`NewLoan`) → `loans`
- Clientes (`Clients`/`NewClient`) → `clients`
- Cobranças (`Billings`) → `billings`
- Usuários vinculados (gestão de equipe) → `users`
- Notificações (envio Telegram/WhatsApp) → `notifications`

Permissões aplicadas nos botões de ação (`loans.delete`, `clients.import/export`, `reports.advanced`, etc.) já via `can()`.

## 4. Restrição de abas

`allowed_tabs jsonb` em `plans` (lista de rotas). No `Layout`/sidebar, esconder itens cujo path não está em `allowedTabs` quando `allowedTabs != null`. Rota acessada manualmente cai em `UpgradeGate`.

## 5. Bloqueio global ao expirar

Criar `src/components/upgrade/TrialExpiredGate.tsx`:
- Wrapper no `App.tsx` em volta das rotas autenticadas.
- Se `trial.expired && !isPaid`:
  - `block_all` → tela cheia "Período expirado — assine para continuar" com botão para `/pricing` e `logout`. Bloqueia toda navegação.
  - `readonly` → libera navegação, mas `can()` e `withinLimit()` retornam `false` para qualquer create/update/delete; banners "somente leitura".
  - `force_upgrade` (default) → redireciona para `/pricing` em qualquer rota que não seja `/pricing`, `/auth`, `/logout`.
- Dados permanecem intactos no banco (não tocamos em delete).

## 6. Migrations necessárias

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_plan_name text,
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz DEFAULT now();

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS expiration_action text NOT NULL DEFAULT 'force_upgrade',
  ADD COLUMN IF NOT EXISTS allowed_tabs jsonb;
```

## Resumo do comportamento entregue

1. Usuário escolhe "Teste Gratuito" em `/pricing` → vai pra `/cadastro?plan=Teste Gratuito` → ao confirmar, `trial_plan_name` e `trial_started_at` são gravados.
2. `usePlanEntitlements` aplica `limits`/`permissions`/`allowed_tabs` desde o primeiro acesso.
3. `TrialBanner` mostra dias restantes; criação além do limite abre `UpgradeDialog`.
4. Após 7 dias, `TrialExpiredGate` aplica a regra configurada no admin (`block_all`/`readonly`/`force_upgrade`).
5. Dados permanecem; ao assinar um plano pago, `useSubscription` ativa e libera tudo.

Quer que eu implemente esse plano agora (todas as 6 etapas) ou começamos por um subconjunto (ex.: só associação no cadastro + bloqueio na expiração)?
