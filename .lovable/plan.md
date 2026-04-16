
## Problema

O app é um PWA com service worker (`vite-plugin-pwa` + `registerType: "autoUpdate"`). Quando você publica uma nova versão, o service worker continua servindo os arquivos do cache antigo até que o usuário limpe o cache manualmente. Isso acontece porque:

1. O `autoUpdate` baixa a nova versão em background, mas só a ativa **após o usuário fechar todas as abas** do site.
2. Não existe nenhum mecanismo para forçar o `skipWaiting` + `clients.claim()`, que faria o novo SW assumir imediatamente.
3. Não há aviso ao usuário de que existe uma nova versão disponível.
4. O cache `NetworkFirst` do Supabase tem TTL de 5 min, mas o shell do app (HTML/JS/CSS) fica preso no cache do Workbox até a próxima ativação.

## Solução

Ajustar o `vite.config.ts` e o `src/main.tsx` para que cada nova publicação seja aplicada automaticamente, sem o usuário precisar limpar cache.

### 1. `vite.config.ts` — forçar ativação imediata do novo SW
Adicionar ao bloco `workbox`:
- `skipWaiting: true` — o novo SW pula a fase "waiting" e ativa imediatamente.
- `clientsClaim: true` — o novo SW assume o controle de todas as abas abertas sem precisar recarregar.
- `cleanupOutdatedCaches: true` — remove caches de versões antigas do Workbox.

### 2. `src/main.tsx` — detectar atualização e recarregar
Usar o helper `registerSW` do `virtual:pwa-register` com:
- `onNeedRefresh`: quando uma nova versão é detectada, chama `updateSW(true)` que força o reload da página com a versão nova.
- Opcionalmente mostrar um toast "Nova versão disponível, atualizando..." antes do reload (1–2s de delay) para que o usuário não fique surpreso.

Isso faz com que, assim que o usuário abrir o app após uma nova publicação, o novo SW seja baixado, ativado e a página recarregue automaticamente com a versão mais recente — sem necessidade de limpar cache.

### 3. Ajustar `index.html` (opcional, reforço)
Garantir que o próprio `index.html` nunca seja cacheado pelo navegador (`Cache-Control: no-cache` via meta tag), para que o navegador sempre baixe o HTML novo, que por sua vez carrega os assets versionados (hash) corretos.

## Arquivos a alterar

- `vite.config.ts` — adicionar `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches` no workbox.
- `src/main.tsx` — registrar o SW via `virtual:pwa-register` com auto-reload em `onNeedRefresh`.
- `index.html` — adicionar `<meta http-equiv="Cache-Control" content="no-cache">` como reforço.

## Observação importante

Esta correção só vai surtir efeito **a partir da próxima publicação** (porque os usuários que já têm o SW antigo instalado precisam baixar o SW novo uma vez para receber as instruções de auto-update). Da segunda publicação em diante, todas as atualizações serão automáticas.

Usuários que estão com a versão atual travada agora ainda vão precisar limpar o cache **uma última vez** para pegar essa correção.
