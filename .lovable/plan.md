

# Implementar Notificações Web Push

## Visão Geral
Adicionar notificações push via navegador para alertar sobre parcelas vencidas e lembretes de cobrança. O sistema pedirá permissão ao usuário, salvará o token de push no banco, e uma Edge Function agendada via cron enviará as notificações diariamente.

## Arquitetura

```text
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Navegador  │────>│  push_tokens     │     │  Edge Function   │
│  (SW + API) │     │  (tabela DB)     │<────│  send-push-notif │
└─────────────┘     └──────────────────┘     └──────────────────┘
      ▲                                             │
      └─────────── Web Push (VAPID) ────────────────┘
```

## Etapas

### 1. Gerar VAPID Keys e armazenar como secrets
- Gerar par de chaves VAPID (pública + privada) via script
- Salvar `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` como secrets do projeto
- A chave pública será usada no frontend; a privada na Edge Function

### 2. Criar tabela `push_tokens`
```sql
CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
-- Políticas: usuário pode inserir/ver/deletar seus próprios tokens
```

### 3. Criar Service Worker customizado para push
- Arquivo `public/sw-push.js` — escuta evento `push` e exibe notificação
- Ao clicar na notificação, abre o app na aba de parcelas vencidas

### 4. Criar hook `usePushNotifications`
- Verifica suporte a notificações no navegador
- Solicita permissão ao usuário
- Registra o service worker de push
- Obtém subscription via `pushManager.subscribe()` com a VAPID key pública
- Salva o token (endpoint + keys) na tabela `push_tokens`
- Componente de toggle na UI para ativar/desativar notificações

### 5. Adicionar UI de ativação
- Botão/switch na página principal ou configurações para ativar notificações push
- Mostra status atual (ativo/inativo/não suportado)

### 6. Criar Edge Function `send-push-notifications`
- Consulta empréstimos com parcelas vencidas (mesma lógica do `send-webhook-report`)
- Para cada usuário com parcelas vencidas, busca tokens na tabela `push_tokens`
- Envia notificação via Web Push API usando a biblioteca `web-push` (VAPID)
- Remove tokens inválidos (endpoint expirado)

### 7. Agendar execução diária via pg_cron
- Cron job diário (ex: 8h da manhã) que chama a Edge Function `send-push-notifications`

## Pré-requisito do usuário
- Será necessário adicionar 2 secrets: `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` (gerados automaticamente por script)

## Arquivos criados/alterados
- `public/sw-push.js` — Service Worker de push (novo)
- `src/hooks/usePushNotifications.ts` — Hook para gerenciar permissão e subscription (novo)
- `src/components/PushNotificationToggle.tsx` — Componente UI de ativação (novo)
- `supabase/functions/send-push-notifications/index.ts` — Edge Function de envio (novo)
- `src/pages/Index.tsx` — Integrar toggle de notificações
- Migração SQL para tabela `push_tokens`
- Insert SQL para cron job

