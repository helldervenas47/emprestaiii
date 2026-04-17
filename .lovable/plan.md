
## Objetivo
Fazer o Telegram mostrar o menu de autocomplete quando o usuário digita "/" no chat do bot.

## Como funciona
O Telegram não lê os comandos do código — é preciso **registrá-los** explicitamente via `setMyCommands` da Bot API. Uma vez registrados, ficam salvos no servidor do Telegram e o autocomplete aparece automaticamente para todos os usuários do bot. Não precisa rodar toda hora — só quando a lista mudar.

## Comandos a registrar (já existentes no `telegram-process`)
- `saldo` — Gastos do mês por categoria
- `ultimas` — Últimas 5 despesas
- `apagar` — Apaga a despesa mais recente
- `help` — Mostra ajuda
- `start` — Vincular conta com código

## Implementação

**Nova Edge Function `telegram-set-commands`** (one-shot, chamada manualmente):
- Faz `POST` no gateway `/setMyCommands` com a lista acima
- Também registra o "menu button" como `commands` (aquele botão azul ao lado do campo de texto que abre a lista)
- Retorna confirmação

**Como acionar:** depois de deployada, eu chamo a função uma vez via `supabase--curl_edge_functions` e pronto — os comandos ficam salvos no Telegram permanentemente.

**Código (resumo):**
```ts
await fetch(`${GATEWAY_URL}/setMyCommands`, {
  method: 'POST', headers: {...},
  body: JSON.stringify({
    commands: [
      { command: 'saldo', description: 'Gastos do mês por categoria' },
      { command: 'ultimas', description: 'Últimas 5 despesas' },
      { command: 'apagar', description: 'Apaga a despesa mais recente' },
      { command: 'help', description: 'Mostra ajuda' },
      { command: 'start', description: 'Vincular conta com código' },
    ],
  }),
});

await fetch(`${GATEWAY_URL}/setChatMenuButton`, {
  method: 'POST', headers: {...},
  body: JSON.stringify({ menu_button: { type: 'commands' } }),
});
```

## Fora de escopo
- Comandos personalizados por usuário (a API só permite lista global ou por escopo de chat — sem valor agora).
- Mudar os handlers já existentes — eles continuam iguais.

## Resultado esperado
Ao digitar "/" no chat do bot, o Telegram mostra a lista com descrição de cada comando. O botão de menu (ícone "/") também passa a abrir essa lista.
