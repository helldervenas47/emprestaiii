
O usuário pergunta se dá pra acelerar a integração Telegram ↔ app. Hoje o fluxo é: cron a cada 1min → `telegram-poll` faz long polling até 55s → grava em `telegram_messages` → `telegram-process` lê e responde.

Latência típica atual: **0–55s** para receber, mais alguns segundos para processar/responder. Pior caso ~60s. Vamos atacar onde realmente dá ganho.

## Onde está a latência hoje

```text
mensagem do usuário no Telegram
  └─► getUpdates long poll (0–50s de espera) 
       └─► insert telegram_messages
            └─► telegram-process roda (chamado como?) — verificar
                 └─► AI parser (Lovable AI) ~1–3s
                      └─► sendMessage de volta (~300–600ms)
```

Os dois maiores gargalos são (1) o long poll de até 50s e (2) o tempo do AI parser.

## Plano de otimização (3 níveis, escolha quanto quer aplicar)

### Nível 1 — Ganho grande, esforço baixo (recomendado)
1. **Cron de 1min → cada 30s** efetivos: agendar **2 jobs pg_cron** com offset (um em `* * * * *`, outro em `* * * * *` mas com `pg_sleep(30)` antes do `net.http_post`). Como o `telegram-poll` já roda 55s, os dois jobs se intercalam e cobrem o gap de ~5s entre invocações → latência média cai de ~27s para ~14s, pior caso de 60s para ~32s.
2. **Disparar `telegram-process` imediatamente após inserts**: hoje (presumido) ele roda em cron separado ou é chamado dentro do poll. Mudar `telegram-poll` para, ao final de cada batch com mensagens, chamar `telegram-process` via `fetch` direto (fire-and-forget) em vez de esperar próximo cron. Economiza até 60s no processamento.
3. **Reduzir `allowed_updates`** já está OK (`['message']`), mas **adicionar** `callback_query` se a edição de despesa via botão usa callback — assim cliques em botões também chegam rápido.

**Resultado esperado:** latência média de resposta cai de ~30–60s para **~5–15s**.

### Nível 2 — Ganho médio, esforço médio
4. **Trocar AI parser por regex-first**: hoje toda mensagem vai pro Lovable AI (~1–3s + custo). Adicionar um pré-parser regex para formatos comuns (`"45 mercado"`, `"R$ 12,50 uber"`, `/saldo`, `/resumo`) e só cair no AI se regex falhar. Economiza 1–3s na maioria das mensagens + reduz custo de tokens.
5. **Cache de chat→user_id em memória do edge** (Map com TTL) — evita 1 query Supabase por mensagem.

### Nível 3 — Ganho máximo, esforço alto (provavelmente não vale)
6. **Substituir polling por webhook**: webhooks Telegram → Edge Function dariam latência **<1s**, mas o connector gateway atual da Lovable **não suporta webhooks** (documentado). Inviável sem trocar a forma de conectar (sair do connector e usar bot token direto), o que perderia a gestão automática de credenciais. **Não recomendo agora.**

## O que vou fazer (se aprovar nível 1+2)

**Migrações SQL:**
- Atualizar o cron `poll-telegram-updates` para 2 jobs com offset de 30s usando `pg_sleep`.
- (Sem mudança de schema — apenas cron.)

**Edge `telegram-poll/index.ts`:**
- Adicionar `callback_query` em `allowed_updates`.
- Após cada batch com mensagens, fazer `fetch(...telegram-process, { method: 'POST' })` sem `await` (fire-and-forget) para acionamento imediato.

**Edge `telegram-process/index.ts`:**
- Adicionar pré-parser regex para padrões `<valor> <descrição>` antes de chamar Lovable AI.
- Cache em memória `Map<chat_id, {user_id, expires}>` para o lookup de vínculo (TTL 5min).

## Detalhes técnicos
- O segundo cron com `pg_sleep(30)` é seguro porque `pg_cron` executa em workers separados; não bloqueia o primeiro.
- Fire-and-forget no Deno: `fetch(url).catch(console.error)` sem `await` — Deno mantém a request viva enquanto a function principal não retorna; ideal é usar `EdgeRuntime.waitUntil(fetch(...))` se disponível, com fallback `void fetch(...)`.
- Regex parser: `/^\s*(R?\$?\s*[\d.,]+)\s+(.+)$/i` cobre ~70% das despesas digitadas; resto vai pro AI normalmente.
- Cache em memória de Edge Function é per-isolate; em alta concorrência cada isolate tem o próprio cache, o que é OK (é só um speedup).

## Fora de escopo
- Webhook real (limitação do gateway).
- Mudar para outro provedor de Telegram.
- Reescrever o pipeline inteiro.

## Pergunta antes de implementar
Quer aplicar **só o Nível 1** (cron 30s + acionamento imediato — ganho grande, mudança mínima), ou **Nível 1 + 2** (também regex-first + cache, ganho extra de ~1–3s nas respostas)?
