# Migração de Edge Functions: Lovable Cloud → Supabase Externo

## Situação atual (verificada)

- **33 edge functions** rodam hoje no Lovable Cloud (usam `Deno.env.get('SUPABASE_URL')` nativo do Cloud).
- 26 funções já rodam no Cloud mas falam com o externo via `EXTERNAL_SUPABASE_URL` (não fazem parte desta migração).
- O frontend tem dois clients:
  - `src/integrations/supabase/client.ts` → Lovable Cloud (chama as 33)
  - `src/integrations/supabase/userClient.ts` → Supabase externo
- Secrets necessários já existem no Supabase externo (confirmado).

## Funções a migrar (33)

Telegram (19): `telegram-accumulated-delinquency-summary`, `telegram-billing-summary`, `telegram-daily-summary`, `telegram-due-today-loans-summary`, `telegram-link-code`, `telegram-manager-weekly-summary`, `telegram-monthly-summary`, `telegram-overdue-loans-summary`, `telegram-poll`, `telegram-process`, `telegram-reports-link-code`, `telegram-reports-poll`, `telegram-set-commands`, `telegram-vencimentos-semana`, `telegram-webhook`, `telegram-webhook-setup`, `telegram-weekly-summary`, `link-telegram-bot`, `validate-telegram-bot`, `debug-telegram`

Outras (14): `add-products-active`, `daily-planning-summary`, `debug-cron-jobs`, `ensure-user-role`, `fix-sales-product-fk`, `generate-income-health-report`, `generate-personal-insights`, `get-paddle-price`, `html-to-image-usage`, `incomes-expenses-summary`, `seed-new-user`, `send-personal-insights-telegram`, `setup-dashboard-prefs`

## Estratégia

Como as funções já usam `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` nativos, **o código delas não precisa mudar** — basta que sejam re-deployadas no projeto Supabase externo, onde essas envs vão apontar naturalmente para o externo. A migração se concentra no **frontend** e nos **cron jobs**.

## Etapas

### 1. Frontend — apontar invocações para o externo
Para cada chamada `supabase.functions.invoke('<nome>')` referente a uma das 33 funções:
- Trocar o import de `@/integrations/supabase/client` por `@/integrations/supabase/userClient`.
- Arquivos afetados (callsites já mapeados): `useAuth.tsx`, `Welcome.tsx`, `Cadastro.tsx`, `Auth.tsx`, `useExpenses.ts`, `usePersonalInsights.ts`, `AutoBackupCard.tsx`, `DashboardOverview.tsx`, `DailyPlanningReport.tsx`, `UserManagement.tsx`, `PersonalAIInsightsCard.tsx`, `paddle.ts`, `ScheduledReportCard.tsx`, e demais retornados pelo grep.
- Cada arquivo é editado de forma cirúrgica (sem mexer em lógica), trocando apenas o client usado para invocar essas funções específicas.

### 2. Deploy no Supabase externo (você faz)
Você vai copiar/colar o conteúdo de `supabase/functions/<nome>/index.ts` no projeto externo (via SQL editor / dashboard / CLI). Os arquivos atuais ficam preservados no repositório como fonte da verdade.

### 3. Cron jobs (pg_cron) — SQL pronto para o externo
Vou gerar um arquivo `migrations-externo/cron-jobs.sql` com:
- `cron.unschedule(...)` para os jobs antigos (a serem rodados no Cloud, se quiser desligar lá).
- `cron.schedule(...)` recriando cada job no externo, com a nova URL `https://<ref-externo>.supabase.co/functions/v1/<nome>` e o anon key do externo.
- Você cola e roda no SQL editor do projeto externo.

### 4. Limpeza opcional (depois de validar)
- Deletar as 33 funções do Lovable Cloud com `supabase--delete_edge_functions` para evitar cobrança dupla / execução duplicada.
- Remover os cron jobs antigos do Cloud.

## Pontos de atenção

- **Telegram webhook URL**: após o deploy no externo, o webhook do bot precisa ser repontado para a nova URL — a função `telegram-webhook-setup` faz isso; rodar uma vez após o deploy resolve.
- **Paddle / webhooks externos**: `get-paddle-price` é chamado pelo frontend (ok), mas se houver webhook configurado em painel do Paddle ou outro serviço apontando para o Cloud, precisa repointar.
- **`seed-new-user` / `handle_new_user` trigger**: hoje a trigger `handle_new_user` está no Cloud. Se `seed-new-user` é disparado a partir do Cloud, considerar se faz sentido manter a parte de auth lá ou migrar tudo — recomendo discutir antes de tocar.
- **Secrets**: vou confirmar com `fetch_secrets` no externo (via lista que você já validou). Se faltar algum (ex.: `LOVABLE_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `PADDLE_*`), o deploy quebra silenciosamente em runtime.

## O que NÃO faço nesta migração
- Não altero o código das funções (a menos que você peça).
- Não removo nada do Cloud automaticamente — só depois da sua validação.
- Não migro as 26 funções que já apontam para o externo.

Confirme que posso seguir e eu executo a etapa 1 (frontend) + gero o SQL da etapa 3 num único passo.
