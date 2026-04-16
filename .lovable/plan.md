

# Redirecionar ao clicar na notificação push

## Problema
Atualmente, o payload da notificação envia `url: "/"`, e o Service Worker ao receber o clique apenas foca a janela existente sem navegar para a rota correta. O usuário não é levado à seção relevante (ex: parcelas atrasadas).

## Solução

### 1. Edge function `send-push-notifications/index.ts`
Incluir URLs específicas no payload de acordo com o tipo de notificação:
- Parcelas atrasadas/hoje → `url: "/?tab=overdue"`

### 2. Service Worker `public/sw-push.js`
Ajustar o handler `notificationclick` para:
- Se já houver uma janela aberta, navegar para a URL da notificação (`client.navigate(url)`) e focar
- Se não houver janela, abrir nova com a URL completa

### 3. `src/pages/Index.tsx`
Ler o parâmetro `tab` da URL (query string) ao carregar e definir a aba ativa automaticamente. Assim, `/?tab=overdue` abre direto na aba de Relatório/Cobranças.

## Detalhes Técnicos

**`public/sw-push.js` — notificationclick:**
```javascript
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'navigate' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
```

**Edge function payload:**
```typescript
url: "/?tab=overdue"
```

**`Index.tsx` — leitura de query param:**
```typescript
const searchParams = new URLSearchParams(window.location.search);
const initialTab = searchParams.get("tab") as Tab;
// usar como valor inicial do useState de tab
```

