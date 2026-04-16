

## Objetivo
Permitir que o usuário envie uma **foto de comprovante/nota fiscal** no Telegram. A IA (Lovable AI multimodal) lê a imagem, extrai valor + categoria + descrição + data e cadastra a despesa automaticamente — mesmo fluxo de confirmação que já existe para texto.

## Fluxo
1. Usuário tira foto de cupom/NF e envia no chat (com ou sem caption).
2. `telegram-poll` já captura o update — precisa começar a aceitar mensagens com `photo` (hoje filtra apenas `text`).
3. `telegram-process` detecta que a mensagem tem `photo`:
   a. Pega o `file_id` do maior tamanho (último item do array `photo`).
   b. Chama `getFile` no gateway → recebe `file_path`.
   c. Baixa bytes via `${GATEWAY_URL}/file/${file_path}`.
   d. Converte para base64 (data URL `data:image/jpeg;base64,...`).
   e. Chama Lovable AI com `google/gemini-3-flash-preview` (multimodal) usando a mesma tool `register_expense` já existente, passando `image_url` + caption (se houver) como contexto adicional.
   f. Mesma lógica de confiança + insert em `expenses` + mensagem de confirmação que o fluxo de texto.
4. Resposta no Telegram inclui ícone 📸 e indica que veio de imagem:
   ```
   📸 Despesa extraída do comprovante

   💰 R$ 87,50
   📂 Alimentação
   📝 Restaurante XYZ
   📅 2026-04-16
   ```

## Mudanças

### 1. `supabase/functions/telegram-poll/index.ts`
- Mudar `allowed_updates: ['message']` (já está) — ok, photo já vem em message.
- No mapeamento de `rows`, salvar também o `raw_update` completo (já salva). Garantir que `text` aceite `null` quando for foto pura, e usar `caption` como text se existir:
  ```ts
  text: u.message.text ?? u.message.caption ?? null
  ```

### 2. `supabase/functions/telegram-process/index.ts`
- Detectar foto: `const photos = msg.raw_update?.message?.photo`. Se array não vazio → fluxo imagem.
- Nova função `downloadTelegramPhoto(fileId, lovableKey, telegramKey)`:
  - POST `${GATEWAY}/getFile` → `file_path`
  - GET `${GATEWAY}/file/${file_path}` → `arrayBuffer` → base64
  - Retorna `data:image/jpeg;base64,${b64}`
- Nova função `extractExpenseFromImage(imageDataUrl, caption, lovableKey)`:
  - Mesmo schema/tool `register_expense` da função `extractExpense` atual
  - `messages` com content multimodal: `[{type:"text", text: systemPrompt + caption}, {type:"image_url", image_url:{url: imageDataUrl}}]`
  - Modelo: `google/gemini-3-flash-preview`
- Branching no loop principal: se mensagem tem foto E usuário vinculado → baixa, extrai, insere, responde com 📸.
- Se usuário não vinculado e mandou foto → mesma mensagem "🔒 Conta não vinculada".
- Se extração falhar/baixa confiança → "🤔 Não consegui ler o comprovante. Tente uma foto mais nítida ou envie por texto."

### 3. `HELP_TEXT`
Adicionar linha:
```
📸 Envie foto de cupom/nota fiscal — eu extraio o valor automaticamente.
```

## Detalhes técnicos
- Telegram entrega `photo` como array de PhotoSize com tamanhos crescentes — usar o último (maior resolução) para melhor OCR.
- Base64 inline é suficiente (cupons fiscais raramente >1MB; gateway aceita).
- Reaproveitar 100% da lógica de insert/categoria/confiança que já existe — única diferença é a fonte (texto vs imagem).
- Continuar marcando a mensagem como `processed = true` ao final, mesmo se foto falhar (evita reprocessar foto borrada).

## Sem alterações
- Schema do banco: nada muda (`expenses` já cobre).
- UI do app: nada muda (foto chega como despesa normal via realtime).
- Outros comandos: intactos.

## Fora de escopo
- Múltiplas despesas em uma mesma foto (cupom com vários itens) — vamos extrair como 1 despesa total.
- Edição/correção via botões inline pós-foto — pode ser próximo passo.
- Salvar a imagem do comprovante anexa à despesa — não solicitado.

