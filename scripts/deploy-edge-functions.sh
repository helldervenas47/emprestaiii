#!/usr/bin/env bash
# =============================================================================
# Deploy de TODAS as edge functions para o projeto Supabase configurado
#
# Pré-requisitos (instalar uma vez):
#   - Supabase CLI: https://supabase.com/docs/guides/cli
#       macOS:  brew install supabase/tap/supabase
#       Linux:  npm i -g supabase   (ou veja docs)
#       Windows (scoop): scoop bucket add supabase https://github.com/supabase/scoop-bucket.git && scoop install supabase
#   - Docker NÃO é necessário para "functions deploy".
#
# Como rodar:
#   chmod +x scripts/deploy-edge-functions.sh
#   ./scripts/deploy-edge-functions.sh
#
# Para definir/atualizar os SECRETS extras (TELEGRAM_BOT_TOKEN,
# GEMINI_API_KEY, etc.), preencha o bloco SECRETS abaixo e descomente.
# =============================================================================
set -euo pipefail

# ---- Credenciais (nunca gravar valores reais neste arquivo) -----------------
: "${SUPABASE_ACCESS_TOKEN:?defina SUPABASE_ACCESS_TOKEN}"
: "${SUPABASE_PROJECT_REF:?defina SUPABASE_PROJECT_REF}"
: "${DB_PASSWORD:?defina DB_PASSWORD}"
PROJECT_REF="$SUPABASE_PROJECT_REF"

# ---- Link ao projeto --------------------------------------------------------
echo "==> Linkando projeto $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"

# ---- Lista de functions -----------------------------------------------------
FUNCTIONS=(
  add-products-active
  admin-create-user
  admin-manage-user
  daily-planning-summary
  debug-telegram
  export-full-backup
  fix-sales-product-fk
  generate-income-health-report
  generate-personal-insights
  generate-risk-reduction-report
  get-paddle-price
  html-to-image-usage
  incomes-expenses-summary
  link-telegram-bot
  list-app-integrations
  list-backups
  login-with-username
  manage-sessions
  migrate-sql
  notify-approval-request
  notify-budget-overrun
  painel-migracao
  payments-webhook
  process-auto-debit-expenses
  recalculate-credit-limits
  send-personal-insights-telegram
  send-push-notifications
  send-webhook-report
  send-whatsapp-billing
  send-whatsapp-manager-summary
  setup-dashboard-prefs
  sync-cdi-rate
  sync-client-analysis
  telegram-accumulated-delinquency-summary
  telegram-billing-summary
  telegram-daily-summary
  telegram-link-code
  telegram-manager-weekly-summary
  telegram-monthly-summary
  telegram-poll
  telegram-process
  telegram-reports-link-code
  telegram-reports-poll
  telegram-set-commands
  telegram-webhook
  telegram-webhook-setup
  telegram-weekly-summary
  validate-telegram-bot
  whatsapp-assistant-webhook
  wipe-all-data
)

# ---- Deploy -----------------------------------------------------------------
FAILED=()
for fn in "${FUNCTIONS[@]}"; do
  echo ""
  echo "==> Deploy: $fn"
  if supabase functions deploy "$fn" --project-ref "$PROJECT_REF"; then
    echo "    OK"
  else
    echo "    FALHOU: $fn"
    FAILED+=("$fn")
  fi
done

echo ""
echo "============================================================"
echo "Deploy finalizado. Total: ${#FUNCTIONS[@]}  Falhas: ${#FAILED[@]}"
if [ ${#FAILED[@]} -gt 0 ]; then
  printf '  - %s\n' "${FAILED[@]}"
fi
echo "============================================================"

# ---- (Opcional) Definir SECRETS --------------------------------------------
# Preencha e descomente para enviar de uma vez:
#
# supabase secrets set --project-ref "$PROJECT_REF" \
#   TELEGRAM_BOT_TOKEN="..." \
#   TELEGRAM_BOT_TOKEN_REPORTS="..." \
#   GEMINI_API_KEY="..." \
#   WHATSMIAU_API_KEY="..." \
#   HTML_TO_IMAGE_USER_ID="..." \
#   HTML_TO_IMAGE_API_KEY="..." \
#   VAPID_PUBLIC_KEY="..." \
#   VAPID_PRIVATE_KEY="..." \
#   BACKUP_CRON_SECRET="..." \
#   PADDLE_API_KEY="..." \
#   PADDLE_WEBHOOK_SECRET="..." \
#   PADDLE_ENV="sandbox"
