

# Criar Sub-aba "Notificações" na Aba Relatório

## Visão Geral
Adicionar sub-abas na aba "Relatório" (overdue): **Cobranças** (conteúdo atual) e **Notificações** (nova). A sub-aba Notificações mostrará uma lista de notificações padrão com toggles de ativo/inativo e seletor de horário de envio.

## Alterações

### 1. Criar componente `NotificationSettings.tsx`
Novo componente que exibe uma lista de notificações padrão configuráveis:
- **Parcelas vencendo hoje** — lembrete diário das cobranças do dia
- **Parcelas em atraso** — alerta de parcelas atrasadas
- **Resumo diário** — relatório resumido do dia (webhook)

Cada item terá:
- Nome e descrição da notificação
- Switch ativo/inativo
- Seletor de horário de envio (dropdown com horas cheias)

O componente reutilizará a lógica existente de `usePushNotifications` para o toggle de push e `webhook_settings` para o webhook. Também integrará com a tabela `push_tokens` para salvar preferências.

### 2. Migração SQL — tabela `notification_preferences`
Nova tabela para armazenar preferências por tipo de notificação:
- `id`, `user_id`, `notification_type` (text), `enabled` (boolean), `send_time` (text), `created_at`, `updated_at`
- Unique constraint em `(user_id, notification_type)`
- RLS: usuários autenticados podem CRUD nos próprios registros

### 3. Alterar `src/pages/Index.tsx`
- Adicionar estado `overdueSubTab` ("cobranças" | "notificacoes")
- No bloco `tab === "overdue"`, renderizar sub-abas com botões (mesmo padrão visual de `planMgmtSubTab`)
- Sub-aba "Cobranças" mostra o conteúdo atual (`OverdueLoans` + `WhatsAppReport`)
- Sub-aba "Notificações" renderiza o novo `NotificationSettings`

### 4. Criar hook `useNotificationPreferences.ts`
Hook para CRUD na tabela `notification_preferences`, com tipos padrão pré-definidos e upsert ao alterar toggle ou horário.

## Detalhes Técnicos

**Tabela `notification_preferences`:**
```sql
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  send_time text NOT NULL DEFAULT '08:00',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, notification_type)
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
-- RLS policies for authenticated users on own data
```

**Tipos de notificação padrão:**
- `parcelas_hoje` — Parcelas vencendo hoje
- `parcelas_atrasadas` — Parcelas em atraso  
- `resumo_diario` — Resumo diário

**Arquivos criados/alterados:**
- `src/components/NotificationSettings.tsx` (novo)
- `src/hooks/useNotificationPreferences.ts` (novo)
- `src/pages/Index.tsx` (sub-abas no Relatório)
- Migração SQL para `notification_preferences`

