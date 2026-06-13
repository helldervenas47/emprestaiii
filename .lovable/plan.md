## Objetivo

Quando um novo usuário criar conta (`/cadastro`), ele passa por um wizard de 3 passos e cai no dashboard já com as **mesmas categorias e configurações que você (owner principal) já tem hoje**, prontas pra usar.

## Fluxo

```text
/cadastro (signup)
   │
   ▼
/bem-vindo  ← novo (wizard 3 passos, rota protegida só p/ quem não completou)
   │  Passo 1: Nome do negócio / nome de exibição
   │  Passo 2: Pré-visualização das categorias que serão criadas
   │           (pode desmarcar as que não quiser)
   │  Passo 3: Confirmar e entrar
   ▼
/ (dashboard)  ← com categorias, métodos de pagamento e prefs já seeded
```

## O que será copiado do owner principal

Edge function `seed-new-user` (service role) lê do **owner principal** (seu user_id como template) e replica para o novo user_id:

- `personal_expense_categories` — todas as categorias customizadas que você criou
- `income_categories` — categorias de receita
- `payment_methods` (se a tabela existir) — métodos de pagamento padrão
- `account_settings` — só os defaults visuais/comportamentais (não copia dados sensíveis)

NÃO copia: clientes, empréstimos, despesas, saldos, integrações Telegram/WhatsApp.

## Passos de implementação

1. **Marcar quem é o "owner template"**
   - Adicionar coluna `is_seed_template boolean default false` em `profiles`
   - Você marca seu próprio profile como `true` (via SQL único)

2. **Edge function `seed-new-user`**
   - Recebe `user_id` (do JWT), valida que usuário existe
   - Busca categorias/configs do `is_seed_template = true`
   - Insere cópias com `user_id` do novo usuário
   - Idempotente (não duplica se já rodou)
   - Marca `profiles.onboarded = true` no fim

3. **Adicionar `onboarded boolean default false` em `profiles`**

4. **Página `/bem-vindo` (wizard 3 passos)**
   - Componente `OnboardingWizard.tsx` com 3 etapas e barra de progresso
   - Passo 1: input nome do negócio + nome de exibição (grava em `profiles`)
   - Passo 2: preview das categorias (chama edge function `preview-seed-categories` que retorna a lista pra exibir; checkboxes pra desmarcar)
   - Passo 3: botão "Concluir" chama `seed-new-user` com a seleção final

5. **Guard de rota no `App.tsx`**
   - `ProtectedRoute` lê `profile.onboarded`. Se `false` e rota ≠ `/bem-vindo`, redireciona pra `/bem-vindo`.

6. **Testar no preview** — criar conta de teste e verificar o fluxo end-to-end.

## Detalhes técnicos

- **Schema**: 1 migration adicionando 2 colunas em `profiles` (`is_seed_template`, `onboarded`).
- **Edge functions**: 2 novas (`seed-new-user`, `preview-seed-categories`), ambas com `verify_jwt = false` validando JWT em código (padrão do projeto).
- **Frontend**: nova rota `/bem-vindo` + componente `OnboardingWizard.tsx` + alteração em `ProtectedRoute`.
- **Sem alterações** em Paddle, emails, ou trigger no `auth.users`.

## Fora do escopo (deixar pra próxima rodada)

- Emails brandeados (você ainda não tem domínio próprio — emails padrão Lovable continuam funcionando)
- Integração Paddle real (preview já mostra banner "modo teste")
- Vídeo/tutorial dentro do wizard
