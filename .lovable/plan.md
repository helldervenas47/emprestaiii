## Objetivo
Adicionar um sino de notificações no header (ao lado do sino de aprovações já existente) com um feed in-app contendo:
- Parcelas **vencendo nos próximos 3 dias**
- Parcelas **vencidas hoje**
- **Pagamentos recebidos recentemente** (últimas 24h)

## Comportamento

- Ícone de sino com badge mostrando o total de itens não-lidos.
- Ao clicar, abre um `Sheet` lateral (mesmo padrão do `ApprovalRequestsButton`) com 3 seções:
  1. **Vencidas hoje** (vermelho) — empréstimo, cliente, parcela X/Y, valor.
  2. **Vencendo (próx. 3 dias)** (amarelo) — mesma info + dias restantes.
  3. **Recebidas recentemente** (verde) — cliente, valor, data/hora, parcela.
- Cada item é clicável → muda para a aba `dashboard` (Empréstimos) e foca no empréstimo correspondente (via query param/estado).
- Botão "Marcar tudo como lido" no topo do feed.
- Atualização automática a cada 60s e ao abrir o sheet.

## Persistência de "lido"

Sem nova tabela. Usar `localStorage` por usuário com a chave `notif:lastSeen:<userId>`:
- Ao abrir o sheet, salvar `Date.now()` como "última visualização".
- Badge = count de itens cuja data-chave (vencimento ou pagamento) é mais recente que `lastSeen`.
- Simples, suficiente para feed informativo (não é caixa de mensagens).

## Fonte de dados (cliente, sem nova tabela)

Já existem hooks com todos os dados necessários:
- `useLoans()` → empréstimos + parcelas pagas
- `useClients()` → para nome/telefone do cliente
- `usePayments()` ou os payments já carregados em `Index.tsx`

Criar um hook `useNotificationsFeed(loans, clients, payments)`:
- Para cada empréstimo `active`, calcula próximas parcelas em aberto usando os utilitários existentes (`loanInstallmentAmount.ts`, `dueStatus.ts`) e classifica como `overdueToday` ou `dueSoon` (próx. 3 dias).
- Lista os últimos pagamentos com `date >= now - 24h`.
- Retorna `{ overdue, dueSoon, recentPayments, unreadCount }`.

## Arquivos

**Novos:**
- `src/components/NotificationsFeedButton.tsx` — sino + Sheet com as 3 seções.
- `src/hooks/useNotificationsFeed.ts` — agregação e contagem de não-lidos.

**Editados:**
- `src/pages/Index.tsx`:
  - Importar `NotificationsFeedButton` e renderizar no header ao lado de `ApprovalRequestsButton` (linha ~632).
  - Passar `loans`, `clients`, `payments` (já disponíveis no Index) e um callback `onSelectLoan(loanId)` que troca para a aba `dashboard` e seta um `highlightLoanId` em estado.
  - Passar `highlightLoanId` para `LoanList` (ele já lida com seleção; senão, faz scroll-into-view).

## Detalhes técnicos

```ts
// useNotificationsFeed.ts (esboço)
const today = startOfDay(new Date());
const in3Days = addDays(today, 3);

const items = loans.filter(l => l.status !== "paid").flatMap(loan => {
  const next = computeNextOpenInstallments(loan); // já existe util similar
  return next
    .filter(i => i.dueDate <= in3Days)
    .map(i => ({
      kind: isSameDay(i.dueDate, today) || i.dueDate < today ? "overdue" : "dueSoon",
      loanId: loan.id, clientName: loan.borrowerName,
      installmentNumber: i.number, amount: i.amount, dueDate: i.dueDate,
    }));
});

const recent = payments
  .filter(p => Date.now() - new Date(p.date).getTime() < 24*3600*1000)
  .sort((a,b) => +new Date(b.date) - +new Date(a.date));
```

UI: `Sheet` com `SheetContent w-full sm:max-w-md`, cada seção com header colapsável e badge de contagem. Empty state "Sem notificações no momento.". Reaproveita tokens semânticos (`text-destructive`, `text-warning` se existir, `text-success`).

## Fora de escopo

- Criação de nova tabela / push.
- Integração com Telegram/WhatsApp (já existem outros componentes para isso).
- Marcar item individual como lido (apenas global "tudo lido").
