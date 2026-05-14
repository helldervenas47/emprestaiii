## Objetivo

Permitir que **todos os relatórios automáticos da aba "Bot Telegram"** sejam enviados como **imagem PNG (visual fiel ao app) + caption resumida**, em vez de mensagens de texto Markdown.

Hoje cada cron envia `sendMessage` com texto. Vamos passar a gerar uma imagem do relatório via serviço externo de HTML→PNG e enviar com `sendPhoto`.

## Escopo

Aplicar a todos os relatórios disparados pela aba Bot Telegram:

- `telegram-summary` (resumo diário de despesas)
- `telegram-weekly-summary` (resumo semanal)
- `telegram-billing-summary` (cobrança)
- `telegram-daily-planning` (planejamento diário)
- `telegram-incomes-expenses` (receitas/despesas do dia)
- `telegram-accumulated-delinquency` (inadimplência acumulada)
- `telegram-manager-weekly-summary` (resumo do gestor)

Cada um continua respeitando seus horários, prefs e modo manual ("Enviar agora").

## Arquitetura

```text
cron / "Enviar agora"
        │
        ▼
edge function existente (ex: telegram-weekly-summary)
        │  monta dados → buildHtml(report)
        ▼
shared/report-image.ts  ──►  serviço HTML→PNG  ──►  PNG bytes
        │                                              │
        └──────────────► sendPhoto(chat_id, photo, caption)
```

## Decisões

1. **Serviço de render**: usar um provider externo de screenshot (ex.: Browserless, ScreenshotOne ou htmlcsstoimage). A escolha final depende de qual já tiver conta/token; caso contrário sugiro **htmlcsstoimage.com** (API simples, paga por imagem, sem manter Chromium).
   - Adicionar segredo `HTML_TO_IMAGE_API_KEY` (e `HTML_TO_IMAGE_USER_ID` se necessário).
2. **Caption resumida**: cada relatório define 3–5 linhas com os números-chave (ex.: total da semana, top categoria, n.º de despesas) — vai como `caption` do `sendPhoto`, com `parse_mode: Markdown`.
3. **Sem fallback de texto longo**: se a geração de imagem falhar, cai para `sendMessage` com o texto atual (mantendo robustez).
4. **Visual**: HTML inline com tokens do app (cores HSL do `index.css`), largura fixa 720px, fonte Inter, cabeçalho com `brand_name`, blocos por seção, formatação BRL — fiel ao look dos cards.

## Implementação

### 1. Helper compartilhado
`supabase/functions/_shared/report-image.ts`
- `renderHtmlToPng(html: string): Promise<Uint8Array>` — chama o provider com `HTML_TO_IMAGE_API_KEY`, retorna PNG.
- `tgSendPhoto(chatId, png, caption, lovableKey, telegramKey)` — `multipart/form-data` para `${GATEWAY_URL}/sendPhoto`.
- `tgSendMessageFallback(...)` — usa texto se a imagem falhar.

### 2. Templates HTML por relatório
`supabase/functions/_shared/report-templates/`
- `weeklySummary.ts`, `dailySummary.ts`, `billing.ts`, `dailyPlanning.ts`, `incomesExpenses.ts`, `accumulatedDelinquency.ts`, `managerWeekly.ts`.
- Cada um exporta `buildHtml(data, brandName)` e `buildCaption(data, brandName)`.
- Estilo comum em `report-templates/_base.ts` (CSS inline, paleta, helpers `fmtBRL`, `fmtDateBR`).

### 3. Atualizar as edge functions
Em cada uma das 7 functions listadas no Escopo:
- Substituir a montagem de `lines.join("\n")` + `tgSend(...)` por:
  ```ts
  const html = buildHtml(data, brandName);
  const caption = buildCaption(data, brandName);
  try {
    const png = await renderHtmlToPng(html);
    await tgSendPhoto(chatId, png, caption, ...);
  } catch (e) {
    console.error("image render failed, falling back to text", e);
    await tgSend(chatId, legacyText, ...); // texto atual como fallback
  }
  ```
- Manter exatamente a lógica de auth, cron, prefs e `last_*_sent_date`.

### 4. Segredo e configuração
- `add_secret HTML_TO_IMAGE_API_KEY` (e `_USER_ID` se aplicável) — pedir ao usuário onde obter.
- Sem migrações de banco.
- `supabase/config.toml` não precisa mudar (mesmas funções).

### 5. UI da aba Bot Telegram
- Nada obrigatório a mudar (o "Enviar agora" passa a entregar imagem automaticamente).
- Opcional (decidir depois): badge "Enviado como imagem" no card de cada agendamento.

## Fora de escopo

- WhatsApp (continua como está).
- Mudança no design dos próprios cards do app.
- Persistir o PNG gerado (ele é só enviado e descartado).
- Internacionalização — segue pt-BR.

## Pré-requisitos do usuário

1. Confirmar o provider de HTML→PNG (sugestão: htmlcsstoimage.com).
2. Após aprovar o plano, fornecer a API key via prompt seguro.

## Riscos

- **Custo por imagem**: cada envio = 1 render. Múltiplos horários × usuários multiplicam.
- **Latência**: ~1–3s a mais por envio; aceitável para cron.
- **Falha do provider**: mitigada pelo fallback automático para texto.
