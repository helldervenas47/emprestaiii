

## Problema

O trigger `handle_new_user` cria 2 registros de assinatura por usuário (sandbox e live). Quando o admin altera o plano de um usuário, ambos os registros aparecem na lista, duplicando o usuário.

## Solução

Agrupar os assinantes por `user_id` em `PlanSubscribers.tsx`, mostrando apenas uma entrada por usuário. A prioridade será exibir o registro `live` (se existir e não for free), senão o `sandbox`.

### Alteração em `src/components/PlanSubscribers.tsx`

Na função `fetchSubscribers`, após o filtro de `ownedUserIds`, agrupar por `user_id`:

```typescript
// Deduplicate: keep one entry per user (prefer "live" over "sandbox")
const userMap = new Map<string, typeof filteredSubs[0]>();
for (const s of filteredSubs) {
  const existing = userMap.get(s.user_id);
  if (!existing || (s.environment === "live" && existing.environment !== "live")) {
    userMap.set(s.user_id, s);
  }
}
const deduped = Array.from(userMap.values());
```

Depois usar `deduped` no lugar de `filteredSubs` para montar a lista `mapped`.

Apenas 1 arquivo alterado, nenhuma mudança no banco.

