## Objetivo

Permitir que o bot do Telegram envie os relatórios como **imagem PNG** (card visual), além do texto. Começamos pelo **Resumo Mensal Pessoal** e deixamos a base pronta para expandir aos demais (diário, semanal, gerente, cobrança, inadimplência, planejamento, insights).

## Como vai funcionar

1. A edge function que monta o relatório continua coletando os mesmos dados que já coleta hoje.
2. Em vez de (ou além de) montar texto, ela monta um **SVG** com o layout do card (título, totais, comparações, lista de categorias, barras de orçamento, marca do app).
3. O SVG é convertido em **PNG** dentro da própria função usando a biblioteca `resvg` para Deno (`@resvg/resvg-wasm`), sem dependências externas pagas.
4. O PNG é enviado pelo Telegram via `sendPhoto` no gateway de conectores que já usamos, com uma legenda curta (mês, total, variação).

Sem novos secrets. Sem serviço externo. Sem custo adicional.

## Escopo desta entrega

- **Resumo mensal pessoal** (`telegram-monthly-summary`) passa a enviar PNG + legenda curta.
- Criamos um helper compartilhado `supabase/functions/_shared/renderReportImage.ts` com:
  - Função `buildMonthlySummarySVG(data, brand)` — monta o SVG do card.
  - Função `svgToPng(svg)` — converte SVG → PNG via `@resvg/resvg-wasm`.
  - Função `tgSendPhoto(chatId, pngBytes, caption, ...)` — envia via gateway.
- Configuração por usuário: nova coluna `monthly_format` em `telegram_summary_prefs` com valores `text` (atual) ou `image` (novo). Default: `text` para não mudar comportamento de quem já usa.
- Toggle na UI de preferências do bot (componente do resumo mensal) para o usuário escolher entre Texto / Imagem.
- Os outros bots ficam exatamente como estão hoje (texto). O helper já fica pronto para reuso quando você quiser ativar nos próximos.

## Design do card (resumo mensal)

```text
┌──────────────────────────────────────────┐
│  EmprestAI · Resumo Mensal               │
│  Abril / 2026                            │
│                                          │
│  Total do mês                            │
│  R$ 4.823,10        🔻 -12% vs mês ant. │
│  Média diária: R$ 160,77 (30 dias)       │
│ ─────────────────────────────────────── │
│  Top categorias                          │
│  ▰▰▰▰▰▰▱▱  Mercado     R$ 1.420  +5%   │
│  ▰▰▰▰▱▱▱▱  Transporte  R$   890  -8%   │
│  ▰▰▰▱▱▱▱▱  Lazer       R$   620  +20%  │
│  ...                                     │
│ ─────────────────────────────────────── │
│  Orçamentos                              │
│  🟢 Mercado     78%   R$ 380 restante   │
│  🟡 Lazer       91%   R$  60 restante   │
│  🔴 Restaurante 112%  R$ 120 acima      │
└──────────────────────────────────────────┘
```

- Largura 1080px (boa qualidade no celular do Telegram).
- Paleta: usa `app_branding` (cor primária) quando disponível, fallback para azul atual do app.
- Tipografia: fontes do sistema embutidas como SVG `<text>` — sem precisar baixar fonte externa.

## Detalhes técnicos

**Arquivos novos**
- `supabase/functions/_shared/renderReportImage.ts` — gerador SVG + conversão PNG + helper `sendPhoto`.

**Arquivos alterados**
- `supabase/functions/telegram-monthly-summary/index.ts` — usa o helper quando `monthly_format = 'image'`; senão mantém fluxo de texto atual.
- `src/components/TelegramReportsConnectCard.tsx` (ou o componente que controla o resumo mensal — confirmar ao implementar) — adiciona o seletor Texto/Imagem.
- `src/hooks/useTelegramSummaryPref.ts` — expõe `monthly_format` no estado e no `save`.

**Migração SQL**
```sql
ALTER TABLE public.telegram_summary_prefs
  ADD COLUMN IF NOT EXISTS monthly_format text NOT NULL DEFAULT 'text'
  CHECK (monthly_format IN ('text','image'));
```

**Conversão SVG → PNG**
- Import: `import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2"`
- Inicializa o wasm uma vez por invocação, reaproveita em todos os envios do loop cron.

**Envio**
- `POST {GATEWAY}/sendPhoto` com `multipart/form-data`: campo `chat_id`, `caption` (Markdown curto), e `photo` como arquivo binário do PNG.
- Mantém `parse_mode: Markdown` na legenda.

## Fora do escopo (próximas iterações)

- Aplicar o mesmo formato nos outros bots (diário, semanal, gerente, cobrança, etc.). A base fica pronta — basta criar `buildXxxSVG` e plugar.
- Gráficos avançados (linha, pizza). Usaremos barras simples desenhadas em SVG nesta primeira versão.

## Validação

- Disparar manualmente `telegram-monthly-summary?user_id=...` autenticado e conferir o PNG recebido.
- Conferir logs da função para garantir que `resvg` carregou e o `sendPhoto` retornou `ok: true`.
- Verificar que usuários com `monthly_format = 'text'` continuam recebendo texto (sem regressão).
