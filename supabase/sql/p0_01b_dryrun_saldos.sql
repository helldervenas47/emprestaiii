-- Bloco 7 — saldo esperado por usuário (rode separado, retorna 1 linha por user)
WITH sim AS (
  SELECT user_id, wallet, amount FROM public.account_ledger
  UNION ALL
  SELECT i.user_id,
         COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id=i.payment_method_id),'account'),
         i.amount
  FROM public.incomes i WHERE i.received_date IS NOT NULL AND i.ledger_id IS NULL
  UNION ALL
  SELECT e.user_id,
         COALESCE((SELECT pm.kind FROM public.payment_methods pm WHERE pm.id=e.payment_method_id),'account'),
         -e.amount
  FROM public.expenses e
  WHERE e.paid_date IS NOT NULL AND COALESCE(e.category,'')<>'Cartão de Crédito'
    AND NOT EXISTS (SELECT 1 FROM public.account_ledger l WHERE l.source='expense' AND l.expense_id=e.id)
  UNION ALL
  SELECT s.user_id,'account',p.amount
  FROM public.payments p JOIN public.sales s ON s.id=p.sale_id
  WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
    AND NOT EXISTS (
      SELECT 1 FROM public.account_ledger l
      WHERE l.user_id=s.user_id AND l.metadata->>'sale_id'=s.id::text
        AND l.metadata->>'sale_payment_idx'=p.id::text)
  UNION ALL
  SELECT user_id,'account',COALESCE(amount,0)-COALESCE(previous_amount,0)
  FROM public.balance_adjustments WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)<>0
)
SELECT user_id,
       SUM(amount) FILTER (WHERE wallet='account') AS saldo_conta_esperado,
       SUM(amount) FILTER (WHERE wallet='cash')    AS saldo_caixa_esperado,
       SUM(amount)                                 AS saldo_total_esperado
FROM sim GROUP BY user_id ORDER BY saldo_total_esperado DESC;

-- Bloco 8 — divergência vs balance atual (rode separado)
WITH sim AS (
  SELECT user_id, SUM(amount) AS oficial_esperado FROM (
    SELECT user_id, amount FROM public.account_ledger
    UNION ALL
    SELECT i.user_id, i.amount FROM public.incomes i
      WHERE i.received_date IS NOT NULL AND i.ledger_id IS NULL
    UNION ALL
    SELECT e.user_id, -e.amount FROM public.expenses e
      WHERE e.paid_date IS NOT NULL AND COALESCE(e.category,'')<>'Cartão de Crédito'
        AND NOT EXISTS (SELECT 1 FROM public.account_ledger l WHERE l.source='expense' AND l.expense_id=e.id)
    UNION ALL
    SELECT s.user_id, p.amount FROM public.payments p JOIN public.sales s ON s.id=p.sale_id
      WHERE COALESCE(s.business_type,'')<>'aluguel_veiculo'
        AND NOT EXISTS (
          SELECT 1 FROM public.account_ledger l
          WHERE l.user_id=s.user_id AND l.metadata->>'sale_id'=s.id::text
            AND l.metadata->>'sale_payment_idx'=p.id::text)
    UNION ALL
    SELECT user_id, COALESCE(amount,0)-COALESCE(previous_amount,0)
      FROM public.balance_adjustments
      WHERE COALESCE(amount,0)-COALESCE(previous_amount,0)<>0
  ) x GROUP BY user_id
)
SELECT b.user_id, b.amount AS saldo_app_atual, s.oficial_esperado,
       (s.oficial_esperado - b.amount) AS divergencia
FROM public.balance b
LEFT JOIN sim s ON s.user_id=b.user_id
ORDER BY ABS(COALESCE(s.oficial_esperado - b.amount,0)) DESC;
