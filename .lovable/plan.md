## Causa raiz

O efeito de backfill em `src/hooks/useIncomes.ts` dispara toda vez que o realtime atualiza a lista. Como cada `INSERT` de filho gera um novo evento realtime, o efeito reentra **antes** do pai ser marcado como `[Expanded]`, e várias execuções paralelas criam o mesmo lançamento N vezes (no banco há até 8 cópias do dia 05/12 do "Jefinho", por exemplo).

A checagem `existingDates` usa o snapshot `incomes` do React, que está defasado durante a execução paralela, então não bloqueia as duplicatas.

## Plano

### 1. Corrigir o backfill (`src/hooks/useIncomes.ts`)

- Adicionar um `Set<string>` em `useRef` com IDs de pais "em processamento" — se um pai já está no set, o efeito ignora.
- **Antes** de inserir qualquer filho, marcar o pai com `[Expanded]` no banco (uma única atualização). Isso fecha a janela de corrida: a próxima reentrada do efeito já vê o marcador e descarta.
- Antes de inserir cada filho, fazer um `SELECT` direto no banco para confirmar que ainda não existe linha com o mesmo `parent_id` + `received_date` (defesa em profundidade contra execuções concorrentes em outras abas).
- Mesma proteção no `addIncome` para receitas mensais/anuais novas: gravar o pai com `[Expanded]` desde o primeiro insert (já é feito hoje) e checar duplicatas antes de cada filho.

### 2. Limpar duplicatas existentes no banco

Executar um único comando que mantém a linha mais antiga (menor `created_at`) por combinação `user_id` + `description` + `received_date` + `parent_id` e remove as demais. Apenas em receitas com `recurrence = 'once'` e `parent_id IS NOT NULL` (filhos materializados). Pais (`parent_id IS NULL`) não são tocados.

### 3. Verificação

Após a limpeza, rodar uma consulta para confirmar que nenhum (`parent_id`, `received_date`) tem mais de 1 linha.

## Detalhes técnicos

- O `Set` em `useRef` é local à aba; o `[Expanded]` no banco protege contra abas/sessões diferentes.
- Não altera schema. Apenas hook + um `DELETE` data-fix.
- Nenhuma mudança em UI.
