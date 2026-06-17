# Bloqueio de funcionalidades — plano de teste expirado

## Estratégia

Centralizar o estado "expirado e somente leitura" no hook `usePlanEntitlements` (já existe `lockdown`) e aplicar de forma consistente em três camadas:

1. **UI global** — um helper compartilhado para desabilitar/ocultar ações de escrita.
2. **Mutações no cliente** — interceptar criar/editar/excluir antes da chamada ao backend.
3. **Backend** — validação no Postgres (RLS) e nas edge functions, sem confiar na UI.

Também adicionar a regra de unicidade do teste grátis por usuário.

---

## 1. Camada de UI

### 1.1 Novo hook `useReadOnlyMode`
Arquivo: `src/hooks/useReadOnlyMode.ts`
- Consome `usePlanEntitlements` e expõe:
  - `readOnly: boolean` (true quando `trial.expired && !isPaid`, independente da `expiration_action` — qualquer expiração sem assinatura paga = somente leitura)
  - `reason: "trial_expired" | null`
  - `loading: boolean`

### 1.2 Componente `<WriteGuard>`
Arquivo: `src/components/upgrade/WriteGuard.tsx`
- Wrapper que recebe `children` (botão/ação) e:
  - Se `loading` → renderiza skeleton/desabilitado.
  - Se `readOnly` → clona o filho injetando `disabled` + tooltip "Plano de teste expirado. Faça upgrade para continuar."
  - Caso contrário → renderiza normal.
- Variante `<WriteGuard mode="hide">` para esconder em vez de desabilitar.

### 1.3 Aplicação nas abas
Envolver os botões de **Novo/Editar/Excluir** (e similares) com `<WriteGuard>` nas telas principais:
- Empréstimos, Clientes, Receitas, Despesas, Cobranças, Cartões, Mealheiros, Funcionários/Folha, Metas, Veículos, Garantias, Produtos/Estoque.
- `TelegramBotsHub` e telas de Telegram: bloquear "Conectar/Vincular/Configurar bot".
- Formulários: desabilitar o submit final via `WriteGuard` (defesa em profundidade).

---

## 2. Camada de mutações

### 2.1 Guard nos repositórios
Em `src/repositories/*Repository.ts`, adicionar um util `assertWritable()` no início das funções de mutação que lança erro amigável se o usuário estiver em modo read-only. O estado é lido de um pequeno store leve (`src/lib/readOnlyState.ts`) atualizado pelo `useReadOnlyMode` em um `useEffect` global em `App.tsx`.

Isto cobre chamadas feitas fora de botões diretos (atalhos, automações locais, sync offline).

---

## 3. Camada de backend

### 3.1 Função SQL `public.is_trial_expired(_user_id uuid)`
- `SECURITY DEFINER`, retorna `boolean`.
- Lê `plans` (via `profiles.trial_plan_name` ou primeiro plano ativo), `profiles.trial_started_at`/`created_at` e `subscriptions` (assinatura ativa).
- Retorna `true` quando `trial_days` esgotaram **e** não há assinatura ativa.

### 3.2 RLS — bloquear escrita quando expirado
Para cada tabela de domínio do usuário (empréstimos, clientes, receitas, despesas, cobranças, cartões, mealheiros, folha, metas, veículos, produtos, estoque, telegram bots do usuário etc.), adicionar políticas:

```sql
CREATE POLICY "<tbl>_block_writes_when_trial_expired_ins"
ON public.<tbl> FOR INSERT TO authenticated
WITH CHECK (NOT public.is_trial_expired(auth.uid()));

CREATE POLICY "<tbl>_block_writes_when_trial_expired_upd"
ON public.<tbl> FOR UPDATE TO authenticated
USING (NOT public.is_trial_expired(auth.uid()));

CREATE POLICY "<tbl>_block_writes_when_trial_expired_del"
ON public.<tbl> FOR DELETE TO authenticated
USING (NOT public.is_trial_expired(auth.uid()));
```

Leitura (SELECT) continua liberada normalmente. Assinatura ativa libera tudo de volta automaticamente.

### 3.3 Edge functions sensíveis
Em `link-telegram-bot`, `validate-telegram-bot`, `telegram-webhook-setup`, `admin-create-user`, `admin-manage-user`, `seed-new-user`, `wipe-all-data`, etc., adicionar guard:

```ts
const expired = await supabase.rpc("is_trial_expired", { _user_id: userId });
if (expired.data === true) {
  return new Response(JSON.stringify({ error: "trial_expired" }), { status: 403, headers: corsHeaders });
}
```

---

## 4. Unicidade do teste grátis

### 4.1 Migration
- Adicionar coluna `profiles.trial_used_at timestamptz`.
- No trigger `handle_new_user`, manter `trial_started_at` no primeiro cadastro.
- Função `public.has_used_trial(_email text) returns boolean` que verifica se já existe `profiles` com aquele e-mail (normalizado) e `trial_started_at IS NOT NULL`.

### 4.2 Fluxo de cadastro
- Em `Cadastro.tsx`, antes de criar a conta, chamar `has_used_trial` com o e-mail. Se `true`, bloquear seleção do plano "Teste Gratuito" e exibir mensagem orientando assinar um plano pago.
- Em `seed-new-user` (edge function), revalidar e negar atribuição do plano de teste se `has_used_trial` retornar `true`.

---

## 5. Desbloqueio imediato após upgrade

- `useSubscription` já refaz fetch após `payments-webhook` confirmar. Garantir que `usePlanEntitlements` reage a `isActive` (já reage via dependência em `subscription?.product_id`).
- Em `Pricing.tsx` (callback de sucesso do Paddle), invalidar/refetch a assinatura imediatamente e — se houver — disparar `window.dispatchEvent(new Event("subscription:refresh"))` que `useSubscription` escuta. Garantir que `lockdown` recalcula sem reload.

---

## 6. Validação (critérios de aceite)

- Conta com trial expirado:
  - Botões "Novo/Editar/Excluir" ficam desabilitados com tooltip em todas as abas listadas.
  - `TelegramBotsHub` não permite conectar/configurar.
  - Tentativa direta via repositório falha com `trial_expired`.
  - INSERT/UPDATE/DELETE via PostgREST retorna 403 por RLS.
  - Edge functions sensíveis retornam 403.
  - Listagens e detalhes continuam visíveis.
- Cadastro com e-mail que já teve trial: plano "Teste Gratuito" indisponível, mensagem clara.
- Após pagar plano: UI libera sem refresh; nova mutação passa.

---

## Detalhes técnicos

- `<WriteGuard>` usa `React.cloneElement` para injetar `disabled` em `Button`/`button`/`IconButton`. Itens de menu (`DropdownMenuItem`) recebem prop equivalente.
- O store `readOnlyState` é um `let` + `subscribe` simples (sem dependência nova); evita prop drilling nos repositórios.
- Não há mudança nos fluxos de planos ativos nem na tela de compra — fora do escopo.
- Não tocar em `src/integrations/supabase/client.ts` nem em `supabase/config.toml` (auto-gerados).

---

## Arquivos impactados (alto nível)

- Novos: `src/hooks/useReadOnlyMode.ts`, `src/components/upgrade/WriteGuard.tsx`, `src/lib/readOnlyState.ts`.
- Migrations: criar `is_trial_expired`, `has_used_trial`, coluna `profiles.trial_used_at`, políticas RLS nas tabelas de domínio.
- Edge functions: guards em funções sensíveis listadas; ajuste em `seed-new-user`.
- UI: envolver botões de escrita nas telas principais e em `TelegramBotsHub`.
- `src/pages/Cadastro.tsx`: checagem de reuso do trial.
- Repositórios em `src/repositories/*`: `assertWritable()` nas mutações.
