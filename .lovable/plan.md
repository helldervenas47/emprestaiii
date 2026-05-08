## Mudança no cálculo do Saldo Previsto

**Nova fórmula:**
```
Saldo Previsto = Saldo em Conta + Receitas pendentes do mês − Despesas pessoais pendentes do mês
```

### O que muda em `src/components/IncomeBalanceCard.tsx`

1. Remover o cálculo `totalMonthExpenses` (que somava pagas + pendentes e causava dupla contagem).
2. Voltar a usar `futureOut` como deduzido no Saldo Previsto, mas com dois filtros adicionais:
   - **scope === "personal"** (ignora despesas business)
   - **!paid** (apenas pendentes)
   - Mantém a regra `coversCurrentMonth` para incluir parcelas/fixas em ciclo ativo no mês mesmo quando o `dueDate` do contrato pai já avançou.
3. Atualizar a fórmula final:
   ```ts
   projected = balance + futureIn − personalPendingOut
   ```
4. O card "Saldo em Conta" continua igual (receitas recebidas − despesas pagas, todos escopos), pois reflete o caixa real.

### Validação esperada (Maio/2026, dados atuais)

```
Saldo em Conta:                    636,71
+ Receitas pendentes do mês:         0,00
− Despesas pessoais pendentes:   1.180,45
= Saldo Previsto:                 −543,74
```

Despesas pessoais pendentes incluem: Iphone (424), Conta Luz (150), Uniasselvi (85,36), Parcela Biz (256,28), Seguro Carro (169,91), Claro (49,90), Internet (45).

### Arquivos afetados

- `src/components/IncomeBalanceCard.tsx` (única alteração de lógica)
