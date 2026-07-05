-- P0-03 (etapa A): RPC agregada para totais do Dashboard.
--
-- Objetivo: permitir que o Dashboard obtenha os totais consolidados de
-- empréstimos em uma única requisição (poucos bytes), sem precisar
-- baixar loans + payments completos apenas para exibir os cards.
--
-- Regras:
--  * Escopo por owner via public.get_data_owner_id(auth.uid()) — respeita a
--    tabela user_owner (co-locadores compartilham o mesmo dono).
--  * Aceita um intervalo [_start, _end] (datas) para filtrar recebimentos e
--    despesas. Empréstimos são contabilizados pela data de criação/início.
--  * Não altera nenhuma fórmula existente — este é um espelho agregado dos
--    números que o frontend calcula em useDashboardMetrics. Serve para
--    comparação (etapa de validação) antes de substituir o cálculo cliente.
--
-- Segurança: SECURITY DEFINER + search_path = public. Grant apenas a
-- authenticated (service_role já tem acesso).

CREATE OR REPLACE FUNCTION public.dashboard_loan_totals(
  _start date,
  _end   date
)
RETURNS TABLE(
  owner_id            uuid,
  loans_count         bigint,
  loans_active_count  bigint,
  loans_paid_count    bigint,
  total_lent          numeric,      -- soma de loans.amount (contratos ativos + pagos, todo o histórico)
  total_lent_period   numeric,      -- soma de loans.amount cujo start_date ∈ [_start,_end]
  total_received      numeric,      -- soma de payments.amount ∈ [_start,_end]
  total_interest_received numeric,  -- juros recebidos ∈ [_start,_end] (aproximação: installment_number<=0 => 100% juros; caso contrário rateio pelo interest_ratio do contrato)
  remaining_capital   numeric,      -- soma de loans.remaining_amount para status != 'paid'
  overdue_count       bigint        -- contratos ativos com due_date < CURRENT_DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
BEGIN
  _owner := public.get_data_owner_id(auth.uid());
  IF _owner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scoped_loans AS (
    SELECT l.*
    FROM public.loans l
    WHERE l.user_id = _owner
  ),
  scoped_payments AS (
    SELECT p.*
    FROM public.payments p
    JOIN scoped_loans l ON l.id = p.loan_id
    WHERE p.date >= _start AND p.date <= _end
  ),
  -- Rateio principal/juros por contrato: interest_ratio = (total_com_juros - principal) / total_com_juros
  -- total_com_juros aproximado por: amount * (1 + interest_rate/100 * installments) para juros simples,
  -- OU quando custom_interest_value estiver definido, usar (amount + custom_interest_value).
  loan_ratio AS (
    SELECT
      l.id,
      CASE
        WHEN COALESCE(l.custom_interest_value, 0) > 0
          THEN COALESCE(l.custom_interest_value, 0) / NULLIF(l.amount + COALESCE(l.custom_interest_value, 0), 0)
        WHEN COALESCE(l.interest_rate, 0) > 0 AND COALESCE(l.installments, 0) > 0
          THEN (l.amount * (l.interest_rate/100.0) * l.installments)
               / NULLIF(l.amount * (1 + (l.interest_rate/100.0) * l.installments), 0)
        ELSE 0
      END AS interest_ratio
    FROM scoped_loans l
  ),
  interest_calc AS (
    SELECT
      SUM(
        CASE
          WHEN COALESCE(p.installment_number, 0) <= 0 THEN p.amount   -- juros/parcial
          ELSE p.amount * COALESCE(lr.interest_ratio, 0)
        END
      ) AS interest_received
    FROM scoped_payments p
    LEFT JOIN loan_ratio lr ON lr.id = p.loan_id
  )
  SELECT
    _owner,
    (SELECT COUNT(*) FROM scoped_loans),
    (SELECT COUNT(*) FROM scoped_loans WHERE status <> 'paid'),
    (SELECT COUNT(*) FROM scoped_loans WHERE status = 'paid'),
    COALESCE((SELECT SUM(amount) FROM scoped_loans), 0),
    COALESCE((SELECT SUM(amount) FROM scoped_loans WHERE start_date BETWEEN _start AND _end), 0),
    COALESCE((SELECT SUM(amount) FROM scoped_payments), 0),
    COALESCE((SELECT interest_received FROM interest_calc), 0),
    COALESCE((SELECT SUM(remaining_amount) FROM scoped_loans WHERE status <> 'paid'), 0),
    (SELECT COUNT(*) FROM scoped_loans WHERE status <> 'paid' AND due_date < CURRENT_DATE);
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_loan_totals(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_loan_totals(date, date) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_loan_totals(date, date) IS
  'P0-03 Egress: agregados de empréstimos para o Dashboard num único round-trip. Usado inicialmente em modo comparativo (dev-only) antes de substituir o cálculo cliente.';
