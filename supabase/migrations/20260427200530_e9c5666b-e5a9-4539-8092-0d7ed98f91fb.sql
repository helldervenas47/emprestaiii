ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS interest_rate_mode TEXT NOT NULL DEFAULT 'total';

COMMENT ON COLUMN public.loans.interest_rate_mode IS 'Como interpretar interest_rate: "total" (legado: % total do contrato, juros simples flat) ou "monthly" (% ao mês, juros simples). Novos contratos parcelados devem usar "monthly".';