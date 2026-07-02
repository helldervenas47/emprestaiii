-- =============================================================================
-- P0-01b — Backfill + triggers de sincronização do `account_ledger`
-- =============================================================================
-- Este script é IDEMPOTENTE e NÃO altera UI, empréstimos, cofrinhos ou cartões.
-- Ele apenas:
--   1) garante um índice único de idempotência em `account_ledger`;
--   2) faz backfill de receitas recebidas, despesas pagas e vendas recebidas;
--   3) instala triggers que mantêm o ledger sincronizado a partir de agora.
--
-- Convenção de idempotência (sem alterar schema):
--   metadata->>'source_kind'  ∈ {'income','expense','sale','sale_payment',
--                                'credit_card_invoice_payment','manual_balance'}
--   metadata->>'source_id'    = id do registro de origem
--   metadata->>'scope'        = 'vehicle' quando a linha se refere a veículos
--                               (excluída do saldo geral)
--
-- PREMISSAS (confirmar no bloco de auditoria abaixo antes de aplicar):
--   * `account_ledger` tem: id uuid pk, user_id uuid, direction text
--     ('in'|'out'), amount numeric, description text, metadata jsonb,
--     created_at timestamptz.
--   * `incomes` tem: id, user_id, amount, status ('received'|...), category,
--     received_date, description.
--   * `expenses` tem: id, user_id, amount, paid boolean, scope
--     ('personal'|'business'|...), category, due_date, notes, paid_at (opc).
--   * `sales` tem: id, user_id, business_type, payment_history jsonb
--     (com {amount, date}), down_payment, installment_value, paid_installments,
--     partial_paid, total, installments. Se sua tabela usar colunas nomeadas
--     diferentes, ajuste os SELECTs indicados.
--   * Regra de negócio já vigente: itens de cartão de crédito (fatura) NÃO
--     entram como expense debitando o saldo — o débito vem do pagamento da
--     fatura já lançado no ledger. O backfill ignora expenses de cartão.
--   * Vendas com `business_type = 'aluguel_veiculo'` afetam o saldo de
--     veículos, não o geral. Marcamos essas linhas com scope='vehicle'.
--
-- COFRINHOS: pendência para P0-01d. Não são tocados aqui.
-- AJUSTES MANUAIS em `balance` (conta/dinheiro): pendência — hoje não há
-- tabela de histórico de ajustes; será tratada quando `balance_adjustments`
-- for auditada em P0-01d.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. AUDITORIA (rodar isolado, revisar, e SÓ DEPOIS aplicar o resto).
-- -----------------------------------------------------------------------------
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='account_ledger'
--  ORDER BY ordinal_position;
--
-- SELECT column_name, data_type
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name IN ('incomes','expenses','sales')
--  ORDER BY table_name, ordinal_position;


-- -----------------------------------------------------------------------------
-- 1. Índice único de idempotência.
--    Impede duplicar a mesma origem no ledger. Só se aplica a linhas com
--    source_kind + source_id não nulos (não afeta linhas manuais antigas).
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS account_ledger_source_uidx
  ON public.account_ledger (
    user_id,
    ((metadata->>'source_kind')),
    ((metadata->>'source_id'))
  )
  WHERE metadata ? 'source_kind' AND metadata ? 'source_id';


-- -----------------------------------------------------------------------------
-- 2. Helper: gera o payload metadata padronizado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_meta(
  _kind text,
  _source_id uuid,
  _scope text DEFAULT NULL,
  _extra jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_strip_nulls(
           jsonb_build_object(
             'source_kind', _kind,
             'source_id',   _source_id::text,
             'scope',       _scope,
             'kind',        _kind
           )
         ) || COALESCE(_extra, '{}'::jsonb)
$$;


-- -----------------------------------------------------------------------------
-- 3. BACKFILL — receitas recebidas.
--    Detecção de cartão de crédito: se você tiver flag específica em incomes,
--    ajuste o WHERE. Como padrão consideramos toda receita recebida.
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
SELECT
  i.user_id,
  'in',
  i.amount,
  COALESCE(i.description, 'Receita'),
  public.ledger_meta('income', i.id, NULL,
    jsonb_build_object('received_date', i.received_date, 'category', i.category)),
  COALESCE(i.received_date::timestamptz, now())
  FROM public.incomes i
 WHERE i.status = 'received'
   AND i.amount IS NOT NULL
   AND i.amount <> 0
ON CONFLICT ON CONSTRAINT account_ledger_source_uidx DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. BACKFILL — despesas pagas.
--    Regra: não debitar despesas de cartão (o débito vem do pagamento da
--    fatura, já lançado). Se o seu schema usa outra chave para marcar cartão,
--    ajuste a cláusula `is_credit_card` abaixo. Aqui usamos duas heurísticas
--    que podem coexistir:
--      * expenses.category ILIKE '%cart%'
--      * expenses.notes    ILIKE '%cart%'
--    Se você tiver coluna dedicada (ex.: payment_method='credit_card' ou
--    credit_card_id), TROQUE por ela — é mais preciso.
--
--    Despesas de veículos: recebem scope='vehicle' para ficarem fora do
--    saldo geral. Detectamos por category ILIKE '%veic%' OR notes ILIKE
--    '%veic%'; ajuste conforme sua convenção.
-- -----------------------------------------------------------------------------
INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
SELECT
  e.user_id,
  'out',
  e.amount,
  COALESCE(e.description, e.category, 'Despesa'),
  public.ledger_meta(
    'expense',
    e.id,
    CASE
      WHEN COALESCE(e.category,'') ILIKE '%veic%' OR COALESCE(e.notes,'') ILIKE '%veic%'
        THEN 'vehicle'
      ELSE NULL
    END,
    jsonb_build_object('due_date', e.due_date, 'category', e.category, 'scope_field', e.scope)
  ),
  COALESCE(e.due_date::timestamptz, now())
  FROM public.expenses e
 WHERE e.paid = true
   AND e.amount IS NOT NULL
   AND e.amount <> 0
   AND (e.scope IS NULL OR e.scope = 'personal')
   -- excluir despesas que representam item de fatura de cartão:
   AND NOT (COALESCE(e.category,'') ILIKE '%cart%' OR COALESCE(e.notes,'') ILIKE '%cart%')
ON CONFLICT ON CONSTRAINT account_ledger_source_uidx DO NOTHING;


-- -----------------------------------------------------------------------------
-- 5. BACKFILL — vendas recebidas (payment_history).
--    Estratégia: para cada pagamento em sales.payment_history[] gera 1 linha
--    no ledger com source_kind='sale_payment' e source_id = sale_id||'#'||idx.
--    Aluguel de veículo (`business_type='aluguel_veiculo'`) recebe
--    scope='vehicle' (não entra no saldo geral).
--
--    Se você tiver tabela dedicada `sale_payments`, o certo é iterar dela.
--    Ajuste o FROM abaixo se for o caso.
-- -----------------------------------------------------------------------------
WITH sp AS (
  SELECT
    s.id  AS sale_id,
    s.user_id,
    s.business_type,
    (elem.value->>'amount')::numeric AS amount,
    COALESCE((elem.value->>'date')::timestamptz, now()) AS paid_at,
    elem.ordinality AS idx
    FROM public.sales s,
         LATERAL jsonb_array_elements(COALESCE(s.payment_history, '[]'::jsonb))
           WITH ORDINALITY AS elem(value, ordinality)
   WHERE jsonb_typeof(COALESCE(s.payment_history,'[]'::jsonb)) = 'array'
)
INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
SELECT
  sp.user_id,
  'in',
  sp.amount,
  'Recebimento de venda',
  jsonb_build_object(
    'source_kind', 'sale_payment',
    'source_id',   sp.sale_id::text || '#' || sp.idx::text,
    'scope',       CASE WHEN sp.business_type = 'aluguel_veiculo' THEN 'vehicle' ELSE NULL END,
    'sale_id',     sp.sale_id
  ),
  sp.paid_at
  FROM sp
 WHERE sp.amount IS NOT NULL AND sp.amount <> 0
ON CONFLICT ON CONSTRAINT account_ledger_source_uidx DO NOTHING;


-- -----------------------------------------------------------------------------
-- 6. TRIGGERS — sincronização contínua a partir de agora.
--    Cada trigger é idempotente via o índice único + upsert manual (DELETE
--    prévio da linha correspondente antes do INSERT em UPDATE).
-- -----------------------------------------------------------------------------

-- 6.1 incomes -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_sync_income()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.account_ledger
     WHERE user_id = OLD.user_id
       AND metadata->>'source_kind' = 'income'
       AND metadata->>'source_id'   = OLD.id::text;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.status = 'received'
     AND NEW.amount IS NOT NULL AND NEW.amount <> 0 THEN
    INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
    VALUES (
      NEW.user_id, 'in', NEW.amount,
      COALESCE(NEW.description,'Receita'),
      public.ledger_meta('income', NEW.id, NULL,
        jsonb_build_object('received_date', NEW.received_date, 'category', NEW.category)),
      COALESCE(NEW.received_date::timestamptz, now())
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_income ON public.incomes;
CREATE TRIGGER trg_ledger_sync_income
AFTER INSERT OR UPDATE OR DELETE ON public.incomes
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_income();


-- 6.2 expenses ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_sync_expense()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_is_card boolean;
  v_scope   text;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    DELETE FROM public.account_ledger
     WHERE user_id = OLD.user_id
       AND metadata->>'source_kind' = 'expense'
       AND metadata->>'source_id'   = OLD.id::text;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') AND NEW.paid = true
     AND NEW.amount IS NOT NULL AND NEW.amount <> 0
     AND (NEW.scope IS NULL OR NEW.scope = 'personal') THEN
    v_is_card := (COALESCE(NEW.category,'') ILIKE '%cart%'
                  OR COALESCE(NEW.notes,'')    ILIKE '%cart%');
    IF NOT v_is_card THEN
      v_scope := CASE
        WHEN COALESCE(NEW.category,'') ILIKE '%veic%'
          OR COALESCE(NEW.notes,'')    ILIKE '%veic%' THEN 'vehicle'
        ELSE NULL
      END;
      INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
      VALUES (
        NEW.user_id, 'out', NEW.amount,
        COALESCE(NEW.description, NEW.category, 'Despesa'),
        public.ledger_meta('expense', NEW.id, v_scope,
          jsonb_build_object('due_date', NEW.due_date, 'category', NEW.category)),
        COALESCE(NEW.due_date::timestamptz, now())
      );
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_expense ON public.expenses;
CREATE TRIGGER trg_ledger_sync_expense
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_expense();


-- 6.3 sales -------------------------------------------------------------------
-- Estratégia: em qualquer mudança em sales, apaga todas as linhas
-- 'sale_payment' desta sale e reinsere a partir de payment_history.
CREATE OR REPLACE FUNCTION public.ledger_sync_sale()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_user uuid;
  v_scope text;
  elem jsonb;
  idx int := 0;
  amt numeric;
  paid_at timestamptz;
BEGIN
  v_id   := COALESCE(NEW.id, OLD.id);
  v_user := COALESCE(NEW.user_id, OLD.user_id);

  DELETE FROM public.account_ledger
   WHERE user_id = v_user
     AND metadata->>'source_kind' = 'sale_payment'
     AND (metadata->>'sale_id') = v_id::text;

  IF TG_OP <> 'DELETE' AND jsonb_typeof(COALESCE(NEW.payment_history,'[]'::jsonb)) = 'array' THEN
    v_scope := CASE WHEN NEW.business_type = 'aluguel_veiculo' THEN 'vehicle' ELSE NULL END;
    FOR elem IN SELECT * FROM jsonb_array_elements(NEW.payment_history) LOOP
      idx := idx + 1;
      amt := (elem->>'amount')::numeric;
      paid_at := COALESCE((elem->>'date')::timestamptz, now());
      IF amt IS NOT NULL AND amt <> 0 THEN
        INSERT INTO public.account_ledger (user_id, direction, amount, description, metadata, created_at)
        VALUES (
          v_user, 'in', amt, 'Recebimento de venda',
          jsonb_build_object(
            'source_kind','sale_payment',
            'source_id',  v_id::text || '#' || idx::text,
            'scope',      v_scope,
            'sale_id',    v_id
          ),
          paid_at
        );
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_ledger_sync_sale ON public.sales;
CREATE TRIGGER trg_ledger_sync_sale
AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.ledger_sync_sale();


-- -----------------------------------------------------------------------------
-- 7. VALIDAÇÃO (antes/depois) — rodar como SELECT, não altera nada.
-- -----------------------------------------------------------------------------
-- Saldo oficial pelo ledger, por usuário, EXCLUINDO scope='vehicle':
-- SELECT user_id,
--        SUM(CASE WHEN direction='in' THEN amount ELSE -amount END) AS saldo_oficial
--   FROM public.account_ledger
--  WHERE COALESCE(metadata->>'scope','') <> 'vehicle'
--  GROUP BY user_id
--  ORDER BY user_id;
--
-- Comparação com o cálculo legado (aproximação — não considera cofrinhos
-- nem ajustes de balance):
-- WITH inc AS (
--   SELECT user_id, SUM(amount) v FROM public.incomes WHERE status='received' GROUP BY 1
-- ), exp AS (
--   SELECT user_id, SUM(amount) v FROM public.expenses
--    WHERE paid=true AND (scope IS NULL OR scope='personal')
--      AND NOT (COALESCE(category,'') ILIKE '%cart%' OR COALESCE(notes,'') ILIKE '%cart%')
--      AND NOT (COALESCE(category,'') ILIKE '%veic%' OR COALESCE(notes,'') ILIKE '%veic%')
--    GROUP BY 1
-- ), sal AS (
--   SELECT s.user_id, SUM((e->>'amount')::numeric) v
--     FROM public.sales s, jsonb_array_elements(COALESCE(s.payment_history,'[]'::jsonb)) e
--    WHERE s.business_type IS DISTINCT FROM 'aluguel_veiculo'
--    GROUP BY 1
-- )
-- SELECT COALESCE(inc.user_id, exp.user_id, sal.user_id) AS user_id,
--        COALESCE(inc.v,0) + COALESCE(sal.v,0) - COALESCE(exp.v,0) AS saldo_legado
--   FROM inc FULL OUTER JOIN exp USING (user_id)
--            FULL OUTER JOIN sal USING (user_id);


-- =============================================================================
-- PENDÊNCIAS PARA P0-01c (migração da UI)
-- =============================================================================
-- (a) Ajustes manuais de `balance` (conta/dinheiro): decidir se serão migrados
--     como linhas 'manual_balance' no ledger e criar backfill a partir de
--     `balance_adjustments` (auditar colunas antes).
-- (b) Cofrinhos: definir se depósitos/resgates entram como linhas
--     scope='piggy' no ledger ou permanecem fora — P0-01d.
-- (c) Detecção de "despesa de cartão" e "despesa de veículo" está por
--     heurística de texto; se existir coluna dedicada, substituir para maior
--     precisão (menos falsos positivos).
-- (d) Pagamentos de fatura de cartão já registrados no ledger permanecem
--     intactos (kind='credit_card_invoice_payment'); o backfill de expenses
--     ignora itens de cartão para não duplicar.
-- (e) Só depois desta migração aplicada e validada em produção é seguro
--     migrar a UI para `useOfficialAccountBalance` (P0-01c).
-- =============================================================================
