

## Objetivo
Permitir cadastrar despesas pessoais enviando mensagens em texto livre para um **bot do Telegram**, interpretadas pela Lovable AI.

## Fluxo
1. Usuário fala com o bot (ex: "gastei 45 no uber ontem").
2. Polling captura a mensagem (cron a cada minuto + long polling).
3. Edge function identifica o usuário pelo `chat_id` vinculado e chama a Lovable AI para extrair `descrição`, `valor`, `categoria`, `data`.
4. Insere em `expenses` com `scope='personal'` e responde no Telegram confirmando (✅ valor + categoria) ou pedindo correção.

## Vinculação de conta
Na aba **Despesas Pessoais** novo card "Telegram":
- Botão "Conectar Telegram" gera um código de 6 dígitos (válido 10 min).
- Usuário envia `/start CODIGO` no bot → vinculado.
- Mostra status conectado + botão desconectar.

## Mudanças no banco
Nova tabela `telegram_links`: `user_id`, `chat_id` (unique), `created_at`.
Nova tabela `telegram_link_codes`: `code`, `user_id`, `expires_at`.
Tabelas de polling do guia: `telegram_bot_state`, `telegram_messages` (consumida e marcada como processada).
RLS: usuário vê só seu link; service role gerencia tudo.

## Edge functions
- **`telegram-poll`** — cron 1x/min, faz long polling de `getUpdates`, salva mensagens.
- **`telegram-process`** — disparada após o poll: para cada mensagem nova, resolve `chat_id → user_id`, trata `/start CODIGO` (vincula) e `/help`, ou chama Lovable AI (`google/gemini-3-flash-preview`) com tool calling estruturado para extrair a despesa, insere em `expenses` e envia confirmação via `sendMessage`.
- **`telegram-link-code`** — gera código de vinculação para o usuário logado.

## IA (extração estruturada)
Tool calling com schema:
```
{ description, amount, category (enum das categoriasPessoais), date (YYYY-MM-DD, default hoje), confidence }
```
Se `confidence < 0.6` ou faltar valor → bot responde pedindo para reescrever.

## Pré-requisitos
- Conectar o connector **Telegram** (vou pedir via `standard_connectors--connect`).
- Criar bot no @BotFather e fornecer o token na conexão.
- Lovable AI já disponível (LOVABLE_API_KEY presente).

## UI
- Card "Telegram" em `PersonalExpenseList.tsx` com estados: não vinculado (botão gerar código + instruções) / vinculado (chat_id + desconectar).
- Toast quando código copiado.
- Realtime em `expenses` já existe → despesa cadastrada via Telegram aparece automaticamente na lista.

## Observações
- Sem webhook (não suportado pelo gateway) — latência típica 0–60s.
- Apenas o dono dos dados (não usuários `operador`) pode vincular, para manter isolamento.

