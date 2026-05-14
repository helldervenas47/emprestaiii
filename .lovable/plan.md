
## Objetivo

Permitir que cada cofrinho use automaticamente a taxa CDI vigente (derivada da Selic publicada pelo Banco Central) em vez de uma taxa fixa digitada pelo usuário. O sistema busca a taxa diariamente, recalcula os rendimentos futuros sem alterar histórico, e exibe na UI a taxa aplicada e a data da última atualização.

## Fonte de dados

API pública do Banco Central (sem chave, sem custo, sem CORS issues quando chamada do servidor):

- **Série SGS 4389** — *Taxa de juros - CDI anualizada base 252* (% a.a.)
- Endpoint: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json`
- Fallback: série **1178** (Selic anualizada) caso 4389 fique indisponível.

## Mudanças no backend

1. **Nova tabela `market_rates`** (cache global, 1 linha por indicador):
   - `indicator text primary key` (ex.: `'cdi'`)
   - `annual_rate numeric not null`
   - `source text` (ex.: `'BCB SGS 4389'`)
   - `reference_date date` (data do dado retornado pelo BCB)
   - `fetched_at timestamptz default now()`
   - RLS: leitura liberada para qualquer usuário autenticado; escrita só via service role (edge function).

2. **Coluna nova em `piggy_banks`**:
   - `auto_rate boolean not null default false`
   - Quando `true`, o cálculo usa a taxa do `market_rates.cdi` em vez de `annual_rate`.

3. **Edge function `sync-cdi-rate`**:
   - Busca a série 4389 no BCB.
   - Faz `upsert` em `market_rates` (indicator='cdi').
   - Para cada cofrinho com `auto_rate=true` cuja `annual_rate` diferir da nova taxa em mais de 0,01 p.p., insere uma nova linha em `piggy_bank_rate_history` com `effective_from = hoje` e atualiza `piggy_banks.annual_rate`. Isso preserva o cálculo segmentado por períodos já existente em `src/lib/piggyTax.ts` (rendimento passado mantém a taxa antiga; só o futuro usa a nova).
   - `verify_jwt = false` (chamada por cron e por trigger client-side de "atualizar agora").

4. **Cron diário** via `pg_cron` + `pg_net` chamando a edge function (08:00 BRT, dias úteis).

## Mudanças no frontend

5. **`usePiggyBanks.ts`**:
   - Carregar `market_rates` (linha cdi) e expor `cdiRate`, `cdiUpdatedAt`, `cdiSource`.
   - Mapear `auto_rate` no `PiggyBank`.
   - Em `periodsFor(pb)`: se `pb.autoRate`, usar histórico + ponto final com a taxa CDI atual (`effectiveFrom = max(history.effectiveFrom, market_rates.reference_date)`).
   - Função `refreshCdiNow()` que invoca a edge function e recarrega.

6. **Form do cofrinho (`PiggyBankList.tsx`)**:
   - Toggle "Atualizar taxa automaticamente com CDI". Quando ligado, o input de taxa fica desabilitado e mostra a taxa atual em modo somente leitura.
   - Ao salvar com toggle ligado, gravar `auto_rate=true` e usar a taxa CDI atual como `annual_rate` inicial.

7. **Card do cofrinho**:
   - Substituir `{pb.annualRate.toFixed(2)}% a.a.` por:
     - Se `autoRate`: badge "CDI" + `X,XX% a.a.` + tooltip "Atualizada em DD/MM/AAAA · fonte BCB".
     - Se manual: como hoje.

8. **Indicador global** no topo da aba Cofrinhos:
   - Pequena pílula: `CDI hoje: X,XX% a.a. · atualizado HH:mm` com botão de refresh manual (chama `refreshCdiNow()`).

## Detalhes técnicos

- **Cálculo retroativo seguro**: a engine atual (`compoundWithSegments`) já aplica taxas diferentes em janelas. Basta acrescentar a nova taxa CDI como período começando hoje — rendimentos passados não são reescritos.
- **Refresh client-side defensivo**: ao montar o app (após auth), se `cdiUpdatedAt < hoje - 12h`, dispara `refreshCdiNow()` em background. Garante atualização mesmo se o cron falhar.
- **Erro / offline**: se a API do BCB falhar, a edge function não toca em `market_rates` e retorna 502; a UI continua usando o último valor cacheado.
- **Migração de dados existentes**: nenhum cofrinho existente é alterado (default `auto_rate=false`). O usuário ativa quando quiser.

## Diagrama do fluxo

```text
 pg_cron (diário) ─┐
 botão "atualizar"─┼──► edge: sync-cdi-rate ──► BCB SGS 4389
                  │            │
 useEffect 12h ───┘            ▼
                       upsert market_rates(cdi)
                               │
                               ▼
                  para cada piggy auto_rate=true:
                   - insert piggy_bank_rate_history
                   - update piggy_banks.annual_rate
                               │
                               ▼
                  Realtime ► usePiggyBanks ► UI recalcula
```

## Arquivos afetados

- Migração SQL: nova tabela `market_rates`, coluna `auto_rate` em `piggy_banks`, RLS.
- `supabase/functions/sync-cdi-rate/index.ts` (nova).
- Cron via `supabase--insert` (não migração — contém URL/anon key).
- `src/hooks/usePiggyBanks.ts` — carregar CDI cache, expor `refreshCdiNow`, suportar `autoRate` no `periodsFor`.
- `src/components/PiggyBankList.tsx` — toggle no form, badge no card, pílula global.
- `src/lib/piggyTax.ts` — sem mudanças (já suporta períodos).

## Pontos para confirmar antes de implementar

1. **Indicador**: usar **CDI (SGS 4389)** ou **Selic Meta (SGS 432)**? CDI é o que tipicamente remunera renda fixa pós-fixada, então é a escolha padrão — ok seguir com CDI?
2. **Granularidade do toggle**: por cofrinho (proposta) ou um único switch global que afeta todos? A proposta atual é por cofrinho para dar flexibilidade.
3. **Frequência do cron**: 1x/dia em dia útil às 8h BRT está ok? (o BCB publica dado D-1)
