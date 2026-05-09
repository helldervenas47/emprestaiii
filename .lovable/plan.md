## Diagnóstico

Os relatórios não chegam ao **Bot de Relatórios** porque a chave de conexão dele (`TELEGRAM_API_KEY_1`) **não está configurada** no projeto.

### Como descobri

1. Você possui **dois bots distintos** no Telegram:
   - **Bot de Despesas** → usa o secret `TELEGRAM_API_KEY` e escreve/lê em `telegram_links`.
   - **Bot de Relatórios** → deveria usar `TELEGRAM_API_KEY_1` e escrever em `telegram_reports_links`.

2. Todas as edge functions de relatório apontam corretamente para o segundo bot:
   - `telegram-billing-summary` (cobranças)
   - `telegram-accumulated-delinquency-summary` (inadimplência acumulada)
   - `telegram-manager-weekly-summary` (resumo semanal do gestor)
   - `daily-planning-summary` (planejamento do dia)
   - `send-personal-insights-telegram` (insights pessoais)
   - `telegram-reports-poll` (recebe `/code` no bot)

   Todas chamam `Deno.env.get("TELEGRAM_API_KEY_1")`.

3. Listando os secrets do projeto, só existe `TELEGRAM_API_KEY` — **`TELEGRAM_API_KEY_1` não existe**. Por isso, ao tentar enviar via gateway, o Telegram recusa (chave ausente/ inválida) e nenhuma mensagem chega, embora:
   - O cron esteja disparando (vejo as functions bootando de minuto em minuto nos logs).
   - O seu vínculo exista em `telegram_reports_links` (chat_id `8727068214`).

## Como resolver

Conectar uma **segunda conexão do Telegram** no projeto, vinculada ao bot de relatórios, e expô-la como `TELEGRAM_API_KEY_1`.

Passos:

1. Em **Connectors → Telegram**, criar uma nova conexão usando o token do **bot de relatórios** (o `BotFather` do bot que recebe os relatórios). A primeira conexão (do bot de despesas) deve ser mantida.
2. Garantir que a nova conexão exponha o secret com o nome **`TELEGRAM_API_KEY_1`** (é o nome esperado por todas as functions acima). Se o connector criar com outro nome, podemos renomear/duplicar via secrets.
3. Após salvar, o `telegram-reports-poll` passa a responder `/start` e `/code` no bot certo, e os horários configurados em:
   - Cobranças (`telegram_billing_prefs`)
   - Inadimplência acumulada (`telegram_accumulated_delinquency_prefs`)
   - Resumo do gestor (`telegram_manager_weekly_prefs`)
   - Planejamento diário (`daily_planning_telegram_prefs`)
   - Insights pessoais (`telegram_personal_insights_prefs`)
   começam a entregar normalmente.
4. Validação rápida: invocar manualmente `telegram-billing-summary` com `force_user_id` igual ao seu `user_id` e confirmar a mensagem chegando no bot de relatórios.

## Observações

- Não há nada errado no código das functions nem nos crons — o problema é puramente de configuração de credencial.
- Enquanto `TELEGRAM_API_KEY_1` não existir, qualquer "Try to fix" ou alteração de código não vai resolver.
- Se preferir consolidar tudo em um único bot, a alternativa é trocar `TELEGRAM_API_KEY_1` por `TELEGRAM_API_KEY` em todas as functions de relatório e usar `telegram_links` no lugar de `telegram_reports_links` — mas isso mistura despesas pessoais com relatórios de cobrança no mesmo chat. **Recomendo manter dois bots** e apenas configurar o secret faltante.

Quer que eu prepare a troca para um bot único, ou você prefere conectar o segundo bot via Connectors (recomendado)?