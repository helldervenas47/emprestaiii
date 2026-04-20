

## Diagnóstico

O sistema **já permite login simultâneo em vários dispositivos no nível do Supabase** (cada device guarda seu próprio refresh token em `localStorage`). O problema está na lógica custom de `src/hooks/useAuth.tsx`:

```ts
// Hoje: se sessionStorage não tiver a flag, força signOut
} else if (!sessionStorage.getItem("hvcred_session")) {
  await supabase.auth.signOut();
}
```

Isso causa três problemas práticos para uso multi-device:

1. **Nova aba / nova janela** → `sessionStorage` é por aba. Abrir o app numa segunda aba do mesmo navegador faz logout forçado, mesmo com sessão válida no `localStorage`.
2. **PWA reaberto / app fechado e reaberto** → mesma coisa: a flag de sessão some e o usuário é deslogado mesmo tendo refresh token válido.
3. **Refresh token rotativo falhando** (visto nos logs: `refresh_token_not_found` retornando 400) → o handler atual não trata isso de forma graciosa, e combinado com a flag de `sessionStorage` derruba a sessão de forma agressiva.

Logs confirmam: `400 Invalid Refresh Token: Refresh Token Not Found` aparece logo após o usuário tentar abrir o app em outro contexto.

## Solução proposta

### 1. Remover a trava de `sessionStorage` no `useAuth.tsx`
Deixar o Supabase gerenciar a sessão pelo `localStorage` (que já é compartilhado entre abas e persiste entre fechamentos). Cada dispositivo continua com seu próprio refresh token independente — múltiplos devices ficam logados simultaneamente sem se derrubarem.

### 2. Tratamento gracioso de refresh token inválido
Se o refresh token expirou em um device específico (ex: ficou offline muito tempo), apenas redirecionar para `/auth` naquele device, sem afetar os outros. Não chamar `signOut()` global.

### 3. Sincronização entre abas do mesmo navegador
Adicionar listener no evento `storage` do `window` para que, quando o usuário fizer login/logout em uma aba, as outras abas reflitam imediatamente sem precisar recarregar.

### 4. Habilitar `multiTab: true` no client Supabase
Garantir que múltiplas abas compartilhem corretamente o estado de auth via `BroadcastChannel`.

### 5. (Opcional, mas recomendado) Sincronização de dados em tempo real
Para que mudanças feitas no celular apareçam no desktop sem refresh, habilitar Supabase Realtime nas tabelas principais (`loans`, `payments`, `expenses`, `clients`, `sales`, `personal_expense_categories`) e adicionar listeners nos hooks correspondentes para revalidar dados quando outro device alterar.

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/hooks/useAuth.tsx` | Remover lógica de `sessionStorage`; tratar refresh token inválido apenas localmente; manter hidratação atual |
| `src/integrations/supabase/client.ts` | **Não pode editar** — é gerado. A config padrão já é suficiente. |
| `src/hooks/useLoans.ts`, `useExpenses.ts`, `usePayments` (etc., se #5) | Adicionar canal Realtime para refetch em mudanças remotas |
| Migration SQL (se #5) | `ALTER PUBLICATION supabase_realtime ADD TABLE ...` para tabelas chave |

## Pergunta para você

Quero confirmar 2 coisas antes de implementar:

1. **Quer só permitir login simultâneo** (passos 1–4, mais leve e seguro)?  
   **Ou também sincronização instantânea de dados** entre os aparelhos (passo 5, requer Realtime)?

2. Você quer que **logout em um aparelho desconecte os outros** também (modo "segurança máxima"), ou que **cada aparelho seja independente** (logout só onde foi clicado — recomendado e padrão)?

