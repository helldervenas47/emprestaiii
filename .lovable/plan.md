## Criar aba "Histórico do Cliente" dentro de Empréstimos

### O que será construído

Uma nova visualização chamada **Histórico do Cliente**, acessível a partir da aba **Empréstimos**, que lista todos os clientes com seus respectivos totais financeiros.

### Posicionamento do botão de acesso

- **PC/Tablet:** botão ao lado do "Simular Empréstimo" no header da aba.
- **Mobile:** botão abaixo dos filtros rápidos "Ontem / Hoje / Amanhã".

### Estrutura da listagem

Para cada cliente (ordem alfabética):

| Campo | Descrição |
|-------|-----------|
| Cliente | Nome do cliente |
| Emprestado | Soma de `amount` de todos os contratos do cliente |
| Pago | Soma de todos os pagamentos (`payments`) do cliente |
| Pendente | Soma do saldo restante de cada contrato (`expected - paid` ou `remainingAmount`) |
| Total | Pago + Pendente |
| Taxa de Juros | `((Total - Emprestado) / Emprestado) × 100` formatado como % |

### Arquivos alterados

1. **`src/components/ClientLoanHistory.tsx`** (novo) — componente da listagem com tabela responsiva.
2. **`src/pages/Index.tsx`** — adiciona estado `loanSubTab` (`"loans" | "history"`), botão de acesso no header do dashboard, e renderização condicional.
3. **`src/components/LoanList.tsx`** — adiciona botão de acesso ao histórico na versão mobile (abaixo dos botões Ontem/Hoje/Amanhã).

### Notas técnicas

- Usa os dados já disponíveis: `loans`, `payments`, `installmentSchedules`, `clients`.
- Formatação monetária: `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`.
- Clientes sem empréstimos são excluídos da listagem.
- Design alinhado ao sistema de cards/tabelas do app.