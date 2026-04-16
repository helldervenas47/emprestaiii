

# Corrigir Ativação de Notificações Push no PWA iOS

## Problema Identificado

O arquivo `src/main.tsx` possui um guarda de segurança que **desregistra todos os Service Workers** quando detecta que o app está rodando em um domínio de preview (`lovableproject.com`). Se você instalou o app na Tela de Início a partir do link de preview, o hostname ainda contém `lovableproject.com`, fazendo com que o Service Worker de push (`sw-push.js`) seja removido a cada carregamento da página — impedindo qualquer notificação.

Além disso, mesmo na URL publicada (`emprestaii.lovable.app`), o guarda pode interferir se o app estiver em um iframe.

## Solução

### 1. Ajustar o guarda em `main.tsx`
- Não desregistrar Service Workers quando o app estiver em **modo standalone** (instalado na tela de início), independentemente do hostname
- Isso permite que o `sw-push.js` permaneça registrado no PWA instalado

### 2. Melhorar feedback no `PushNotificationToggle`
- Se o usuário estiver no preview (não standalone) e tentar ativar, mostrar mensagem explicando que precisa instalar o app primeiro
- Adicionar tratamento para quando o iOS bloqueia a permissão

### 3. Proteger o registro do SW de push contra o guarda
- No hook `usePushNotifications`, verificar se o ambiente permite registro antes de tentar

## Detalhes Técnicos

**Arquivo: `src/main.tsx`**
```typescript
const isInStandaloneMode =
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as any).standalone === true;

if ((isPreviewHost || isInIframe) && !isInStandaloneMode) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}
```

**Arquivo: `src/components/PushNotificationToggle.tsx`**
- Adicionar mensagem quando o usuário está no navegador (não PWA instalado) no iOS, orientando a instalar primeiro

**Arquivo: `src/hooks/usePushNotifications.ts`**
- Adicionar verificação de ambiente (standalone vs browser) para feedback mais claro ao usuário

## Resultado Esperado
Após a correção, ao abrir o app pelo ícone na Tela de Início do iPhone, o sino funcionará normalmente: ao ativar o toggle, o iOS pedirá permissão e as notificações serão registradas.

