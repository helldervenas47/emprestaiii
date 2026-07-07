# Revisão da edição dos cartões de despesa

Escopo confirmado: **três listas** — `ExpenseList` (Financeiro), `PersonalExpenseList` (Pessoais) e a lista de despesas dentro de `CreditCardInvoice` (Cartões). São ~4.500 linhas somadas, cada uma com seu próprio diálogo. Para reduzir risco de regressão em cálculos (saldos, ledger, extrato), proponho entregar em **fases pequenas e verificáveis**, todas em uma mesma PR/mensagem.

## Estratégia

Criar um único componente compartilhado `ExpenseEditDialog` padronizado (já existe parcialmente) e adaptá-lo por "modo" (`business` | `personal` | `credit-card`). Cada lista passa a apenas abrir o diálogo — a lógica de save/delete/duplicate continua no hook da própria lista (`useExpenses` / `usePersonalExpenses` / faturas do cartão), preservando os recálculos que já funcionam.

## Fase 1 — Abertura instantânea (baixo risco)

- Card inteiro clicável em `ExpenseList`, `PersonalExpenseList` e nas linhas de despesa em `CreditCardInvoice`.
- Botões internos (pagar, menu ⋮) recebem `stopPropagation` para não abrir o diálogo.
- Um clique = abre o diálogo de edição já preenchido.

## Fase 2 — Diálogo unificado

- Ordem canônica dos campos: Descrição → Categoria → Valor → Vencimento → Pagamento (se pago) → Forma pgto → Conta origem → Cartão (se cartão) → Status → Observações.
- Campos condicionais: "Data de pagamento" só aparece com Status=Pago; "Cartão" só com forma=Cartão; "Conta origem" só com forma=Conta.
- Categoria muda conforme o modo (categorias de negócio, pessoais ou fixas do cartão).
- Todos os inputs com mesma altura (`h-10`), espaçamento `space-y-4`, grid responsivo 1col mobile / 2col desktop.

## Fase 3 — UX de edição

- Enter salva (exceto em `<Textarea>`).
- Esc fecha; se houver alterações não salvas, `AlertDialog` de confirmação.
- Badge "Alterações não salvas" no header do diálogo enquanto `isDirty`.
- Foco inicial no campo Descrição, sem roubar foco em re-render.
- Validação com `zod`: descrição obrigatória, valor > 0, data válida, mensagens em `pt-BR` sob cada campo.

## Fase 4 — Ações

- Botões: Cancelar (ghost) · Excluir (destructive, com confirmação) · Duplicar (secondary, cria despesa nova com data de hoje) · Salvar (primary).
- Em mobile, botões empilham full-width; em desktop ficam em linha à direita.

## Fase 5 — Performance & consistência

- Salvar chama o mutate do hook responsável, que já dispara os eventos `ledger:changed` / `balance:changed` → Dashboard/Extrato reagem sem reload.
- Após salvar, o diálogo fecha sem forçar refetch global; a lista já ouve o evento.
- Nada de `window.location.reload`; nenhum `scroll-to-top` — a posição da lista é preservada naturalmente.

## Fase 6 — Histórico (opcional, best-effort)

- Se a despesa tiver `updated_at` e `created_at`, mostra uma linha discreta no rodapé: "Criada em X · Atualizada em Y". Sem tabela de auditoria nova.

## Arquivos afetados

```text
src/components/ExpenseEditDialog.tsx        (reescrito como diálogo unificado + zod)
src/components/ExpenseList.tsx              (card clicável, remove edit inline)
src/components/PersonalExpenseList.tsx      (card clicável, usa diálogo unificado)
src/components/CreditCardInvoice.tsx        (linhas clicáveis, usa diálogo unificado em modo credit-card)
src/components/product-sales/VehicleExpenseDialogs.tsx  (NÃO alterado — fora do escopo)
```

## Fora do escopo

- Despesas de veículo (aba separada).
- Migração de dados / colunas novas no banco.
- Auditoria de alterações (tabela dedicada).
- Redesenho visual da lista em si (cores, layout do card) — só o diálogo e a interação de abertura.

## Riscos

- `CreditCardInvoice` tem regras próprias de parcelamento; o "modo credit-card" desabilita campos que não fazem sentido (parcelas, fatura de destino) em vez de reescrever essa lógica.
- Mudança de Status Pago↔Pendente já é suportada pelos hooks atuais; apenas será acionada via o novo diálogo.

Aprovar para eu implementar todas as 6 fases nesta mesma resposta seguinte, ou prefere que eu pare após a Fase 3 e valide antes de seguir?
