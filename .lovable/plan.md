

# Adicionar sub-cards de Saldo Previsto no card "Saldo em Conta"

## O que será feito

Abaixo do valor de "Saldo em Conta", adicionar 2 mini-cards lado a lado:

1. **Saldo Previsto (Domingo)** — Saldo atual + soma das parcelas (`remaining_amount` ou valor da parcela) que vencem até o próximo domingo (a partir de segunda-feira, considera o domingo seguinte)
2. **Saldo Previsto (Fim do Mês)** — Saldo atual + soma das parcelas que vencem até o último dia do mês vigente

Apenas parcelas de empréstimos ativos e não pagas entram na simulação.

## Detalhes técnicos

**Arquivo:** `src/components/DashboardOverview.tsx`

1. **Calcular próximo domingo:** Se hoje é domingo, usa hoje; senão, avança até o próximo domingo (day === 0)

2. **Calcular parcelas elegíveis:** Filtrar `installmentSchedules` onde:
   - O empréstimo está ativo (`status !== "paid"`)
   - A parcela ainda não foi paga (`installmentNumber > loan.paidInstallments`)
   - `dueDate` está entre hoje e o limite (domingo ou fim do mês)
   - Somar os valores dessas parcelas

3. **Saldo previsto = accountBalance + soma das parcelas elegíveis**

4. **Layout:** Dentro do card `Saldo em Conta` (linhas ~553-578), após o valor do saldo, adicionar uma div com `grid grid-cols-2 gap-2` contendo os dois mini-cards com ícone de calendário, label e valor formatado

