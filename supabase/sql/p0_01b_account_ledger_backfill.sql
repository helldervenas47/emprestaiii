-- =============================================================================
-- P0-01b — Backfill + triggers do `account_ledger`  (REV 2)
-- =============================================================================
-- Mudanças vs. rev 1:
--   * FIX: `ON CONFLICT ON CONSTRAINT` trocado por `ON CONFLICT (expr) WHERE ...`
--          — o alvo é um índice único parcial, não uma constraint. A sintaxe
--          antiga faria os INSERTs falharem no primeiro duplicado.
--   * Preflight que aborta se alguma coluna esperada não existir.
--   * Heurística cartão/veículo movida para funções (`is_credit_card_expense`,
--     `is_vehicle_expense`) — trocar por coluna dedicada num único ponto.
--   * ON CONFLICT DO NOTHING também nos INSERTs das triggers (proteção contra
--     reentrância / execuções concorrentes).
--   * Rollback documentado ao final.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. PREFLIGHT — aborta se o schema não bate com o esperado.
--    Roda dentro de uma transação; se algo faltar, faça ROLLBACK.
-- -----------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  missing text := '';
  chk record;
BEGIN
  FOR chk IN
    SELECT * FROM (VALUES
      ('account_ledger','user_id'),
      ('account_ledger','direction'),
      ('account_ledger','amount'),
      ('account_ledger','description'),
      ('account_ledger','metadata'),
      ('account_ledger','created_at'),
      ('incomes','id'), ('incomes','user_id'), ('incomes','amount'),
      ('incomes','status'), ('incomes','received_date'),
      ('expenses','id'), ('expenses','user_id'), ('expenses','amount'),
      ('expenses','paid'), ('expenses','scope'), ('expenses','due_date'),
      ('sales','id'), ('sales','user_id'), ('sales','payment_history'),
      ('sales','business_type')
    ) AS t(tbl,col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=chk.tbl AND column_name=chk.col
    ) THEN
      missing := missing || chk.tbl || '.' || chk.col || ' ';
    END IF;
  END LOOP;
  IF missing <> '' THEN
    RAISE EXCEPTION 'Colunas ausentes: %', missing;
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- 1. Índice único PARCIAL para idempotência.
--    Só se aplica a linhas que possuem source_kind + source_id no metadata,
--    então não interfere em lançamentos manuais legados.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_source_uidx
  ON public.account_ledger (
    user_id,
    ((metadata->>'source_kind')),
    ((metadata->>'source_id'))
  )
  WHERE metadata ? 'source_kind' AND metadata ? 'source_id';


-- -----------------------------------------------------------------------------
-- 2. Helpers de classificação — trocar aqui quando existir coluna dedicada.
-- -----------------------------------------------------------------------------
-- Detecção de despesa de cartão. Substitua pelo campo real (ex.:
-- e.payment_method = 'credit_card' OR e.credit_card_id IS NOT NULL) quando
-- confirmar a coluna. Enquanto usa heurística textual.
CREATE OR REPLACE FUNCTION public.is_credit_card_expense(e public.expenses)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(e.category,'') ILIKE '%cart%'
      OR COALESCE(e.notes,'')    ILIKE '%cart%'
$$;

-- Detecção de despesa de veículo. Trocar por vehicle_id/tag real quando existir.
CREATE OR REPLACE FUNCTION public.is_vehicle_expense(e public.expenses)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(e.category,'') ILIKE '%veic%'
      OR COALESCE(e.notes,'')    ILIKE '%veic%'
$$;

CREATE OR REPLACE FUNCTION public.ledger_meta(
  _kind text, _source_id text, _scope text DEFAULT NULL, _extra jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
           'source_kind', _kind,
           'source_id',   _source_id,
           'scope',       _scope,
           'kind',        _kind
         )) || COALESCE(_extra, '{}'::jsonb)
$$;


-- -----------------------------------------------------------------------------
-- 3. BACKFILL — receitas recebidas.
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
SELECT
  i.user_id, 'in', i.amount,
  COALESCE(i.description, 'Receita'),
  public.ledger_meta('income', i.id::text, NULL,
    jsonb_build_object('received_date', i.received_date, 'category', i.category)),
  COALESCE(i.received_date::timestamptz, now())
  FROM public.incomes i
 WHERE i.status = 'received' AND i.amount IS NOT NULL AND i.amount <> 0
ON CONFLICT (user_id, ((metadata->>'source_kind')), ((metadata->>'source_id')))
   WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. BACKFILL — despesas pagas (exclui cartão; marca veículo).
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
SELECT
  e.user_id, 'out', e.amount,
  COALESCE(e.description, e.category, 'Despesa'),
  public.ledger_meta('expense', e.id::text,
    CASE WHEN public.is_vehicle_expense(e) THEN 'vehicle' ELSE NULL END,
    jsonb_build_object('due_date', e.due_date, 'category', e.category, 'scope_field', e.scope)),
  COALESCE(e.due_date::timestamptz, now())
  FROM public.expenses e
 WHERE e.paid = true
   AND e.amount IS NOT NULL AND e.amount <> 0
   AND (e.scope IS NULL OR e.scope = 'personal')
   AND NOT public.is_credit_card_expense(e)
ON CONFLICT (user_id, ((metadata->>'source_kind')), ((metadata->>'source_id')))
   WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
DO NOTHING;


-- -----------------------------------------------------------------------------
-- 5. BACKFILL — vendas recebidas (payment_history[]).
--    Cada pagamento vira uma linha com source_id = <sale_id>#<indice>.
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
SELECT
  s.user_id, 'in',
  (elem.value->>'amount')::numeric,
  'Recebimento de venda',
  jsonb_build_object(
    'source_kind','sale_payment',
    'source_id',  s.id::text || '#' || elem.ordinality::text,
    'scope',      CASE WHEN s.business_type = 'aluguel_veiculo' THEN 'vehicle' END,
    'sale_id',    s.id
  ),
  COALESCE((elem.value->>'date')::timestamptz, now())
  FROM public.sales s,
       LATERAL jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb))
         WITH ORDINALITY AS elem(value, ordinality)
 WHERE jsonb_typeof(COALESCE(s.payment_history,'[]'::jsonb)) = 'array'
   AND (elem.value->>'amount')::numeric IS NOT NULL
   AND (elem.value->>'amount')::numeric <> 0
ON CONFLICT (user_id, ((metadata->>'source_kind')), ((metadata->>'source_id')))
   WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
DO NOTHING;


-- -----------------------------------------------------------------------------
-- 6. TRIGGERS de sincronização.
-- -----------------------------------------------------------------------------

-- 6.1 incomes
CREATE OR REPLACE FUNCTION public.ledger_sync_income()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.account_ledger
     WHERE user_id = OLD.user_id
       AND metadata->>'source_kind' = 'income'
       AND metadata->>'source_id'   = OLD.id::text;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status='received'
     AND NEW.amount IS NOT NULL AND NEW.amount <> 0 THEN
    INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
    VALUES (
      NEW.user_id, 'in', NEW.amount,
      COALESCE(NEW.description,'Receita'),
      public.ledger_meta('income', NEW.id::text, NULL,
        jsonb_build_object('received_date', NEW.received_date, 'category', NEW.category)),
      COALESCE(NEW.received_date::timestamptz, now())
    )
    ON CONFLICT (user_id, ((metadata->>'source_kind')), ((metadata->>'source_id')))
       WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
    DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_income ON public.incomes;
CREATE TRIGGER trg_ledger_sync_income
AFTER INSERT OR UPDATE OR DELETE ON public.incomes
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_income();


-- 6.2 expenses
CREATE OR REPLACE FUNCTION public.ledger_sync_expense()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_scope text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.account_ledger
     WHERE user_id = OLD.user_id
       AND metadata->>'source_kind' = 'expense'
       AND metadata->>'source_id'   = OLD.id::text;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.paid = true
     AND NEW.amount IS NOT NULL AND NEW.amount <> 0
     AND (NEW.scope IS NULL OR NEW.scope='personal')
     AND NOT public.is_credit_card_expense(NEW) THEN
    v_scope := CASE WHEN public.is_vehicle_expense(NEW) THEN 'vehicle' END;
    INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
    VALUES (
      NEW.user_id, 'out', NEW.amount,
      COALESCE(NEW.description, NEW.category, 'Despesa'),
      public.ledger_meta('expense', NEW.id::text, v_scope,
        jsonb_build_object('due_date', NEW.due_date, 'category', NEW.category)),
      COALESCE(NEW.due_date::timestamptz, now())
    )
    ON CONFLICT (user_id, ((metadata->>'source_kind')), ((metadata->>'source_id')))
       WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
    DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_expense ON public.expenses;
CREATE TRIGGER trg_ledger_sync_expense
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_expense();


-- 6.3 sales — reprocessa payment_history inteiro em cada mudança.
CREATE OR REPLACE FUNCTION public.ledger_sync_sale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := COALESCE(NEW.id, OLD.id);
  v_user uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_scope text;
BEGIN
  DELETE FROM public.account_ledger
   WHERE user_id = v_user
     AND metadata->>'source_kind' = 'sale_payment'
     AND (metadata->>'sale_id') = v_id::text;

  IF TG_OP <> 'DELETE'
     AND jsonb_typeof(COALESCE(NEW.payment_history,'[]'::jsonb)) = 'array' THEN
    v_scope := CASE WHEN NEW.business_type = 'aluguel_veiculo' THEN 'vehicle' END;
    INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
    SELECT
      NEW.user_id, 'in',
      (elem.value->>'amount')::numeric,
      'Recebimento de venda',
      jsonb_build_object(
        'source_kind','sale_payment',
        'source_id',  NEW.id::text || '#' || elem.ordinality::text,
        'scope',      v_scope,
        'sale_id',    NEW.id
      ),
      COALESCE((elem.value->>'date')::timestamptz, now())
      FROM jsonb_array_elements(NEW.payment_history) WITH ORDINALITY AS elem(value, ordinality)
     WHERE (elem.value->>'amount')::numeric IS NOT NULL
       AND (elem.value->>'amount')::numeric <> 0
    ON CONFLICT (user_id, ((metadata->>'source_kind')), ((metadata->>'source_id')))
       WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
    DO NOTHING;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_sale ON public.sales;
CREATE TRIGGER trg_ledger_sync_sale
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_sale();


-- -----------------------------------------------------------------------------
-- 7. Fim da transação. Revise os SELECTs de validação abaixo antes de COMMIT.
-- -----------------------------------------------------------------------------
-- COMMIT;   -- descomente após revisar
-- ROLLBACK; -- use se qualquer preflight ou backfill retornar erro


-- =============================================================================
-- VALIDAÇÃO (rodar como SELECT, não altera nada)
-- =============================================================================
-- Saldo oficial pelo ledger (exclui scope='vehicle'):
--   SELECT user_id,
--          SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) AS saldo_oficial
--     FROM public.account_ledger
--    WHERE COALESCE(metadata->>'scope','') <> 'vehicle'
--    GROUP BY user_id ORDER BY user_id;
--
-- Contagem de duplicatas potenciais (deve retornar 0 linhas):
--   SELECT user_id, metadata->>'source_kind' k, metadata->>'source_id' i, COUNT(*)
--     FROM public.account_ledger
--    WHERE metadata ? 'source_kind' AND metadata ? 'source_id'
--    GROUP BY 1,2,3 HAVING COUNT(*) > 1;

-- =============================================================================
-- ROLLBACK (script separado, para desfazer se necessário)
-- =============================================================================
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_income  ON public.incomes;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_expense ON public.expenses;
--   DROP TRIGGER IF EXISTS trg_ledger_sync_sale    ON public.sales;
--   DROP FUNCTION IF EXISTS public.ledger_sync_income();
--   DROP FUNCTION IF EXISTS public.ledger_sync_expense();
--   DROP FUNCTION IF EXISTS public.ledger_sync_sale();
--   DROP FUNCTION IF EXISTS public.ledger_meta(text,text,text,jsonb);
--   DROP FUNCTION IF EXISTS public.is_credit_card_expense(public.expenses);
--   DROP FUNCTION IF EXISTS public.is_vehicle_expense(public.expenses);
--   -- Remove SOMENTE as linhas de ledger geradas pelo backfill/triggers:
--   DELETE FROM public.account_ledger
--    WHERE metadata->>'source_kind' IN ('income','expense','sale_payment');
--   DROP INDEX IF EXISTS public.account_ledger_source_uidx;
-- COMMIT;
