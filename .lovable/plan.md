

## Cobrança automática por WhatsApp

### Como funcionaria

Usaremos a **WhatsApp Cloud API (oficial da Meta)** ou um provedor compatível (Z-API / Evolution API) através de uma edge function agendada que roda diariamente e envia mensagens para os contratos elegíveis.

### Pré-requisitos do usuário

Você precisará fornecer (via Secrets):
- **Opção A — Meta Cloud API (oficial, gratuita até 1.000 conversas/mês)**: `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN`. Exige número verificado no Meta Business e templates aprovados.
- **Opção B — Z-API / Evolution API (não oficial, mais simples)**: `ZAPI_INSTANCE_ID` + `ZAPI_TOKEN` (ou URL + token da Evolution). Usa seu próprio número WhatsApp conectado por QR Code.

> A Opção B é mais rápida de configurar e não exige aprovação de templates, mas é não oficial e pode ter o número bloqueado pela Meta se mal usado.

### Mudanças no banco

Nova tabela `whatsapp_billing_schedule` (configuração global por usuário):
- `enabled` (on/off geral)
- `provider` ('meta' | 'zapi' | 'evolution')
- `send_time` (horário diário, ex: 09:00)
- `days_before_due` (quantos dias antes do vencimento avisar, padrão 1)
- `send_on_due_day` (avisar no próprio dia)
- `send_when_overdue` (reenviar quando vencido)
- `overdue_repeat_days` (a cada quantos dias reenviar para vencidos)

Nova tabela `whatsapp_billing_log` para registrar envios (evitar duplicatas):
- `loan_id`, `installment_number`, `status_when_sent`, `sent_at`, `success`, `error_message`

A flag por contrato `auto_billing_enabled` (que já existe) continua sendo respeitada — contratos desligados não recebem.

### Edge function

`send-whatsapp-billing` — agendada via `pg_cron` para rodar de hora em hora:
1. Busca configurações com `enabled = true` no horário atual (±1h)
2. Para cada owner, busca contratos ativos com `auto_billing_enabled = true`
3. Calcula status da próxima parcela (a vencer / vence hoje / vencida)
4. Filtra pelas regras (dias antes, vencido, etc.)
5. Verifica `whatsapp_billing_log` para não enviar duas vezes no mesmo dia
6. Aplica variáveis `{nome}`, `{valor}`, `{data_vencimento}` no template já cadastrado em "Cobrança WhatsApp"
7. Envia via provedor configurado e registra no log

### UI

Novo card na aba **Relatórios → Cobrança WhatsApp**:
- Toggle "Ativar cobrança automática"
- Seleção de provedor + campos de credenciais (com botão "Testar conexão")
- Horário diário de envio
- Checkboxes: "Avisar X dias antes", "Avisar no dia do vencimento", "Reenviar para vencidos a cada X dias"
- Lista dos últimos envios (sucesso/erro)

### Fluxo

```text
Cron (a cada hora)
   → edge function lê configs ativas
   → para cada contrato com auto_billing_enabled=true
      → checa parcela próxima/vencida
      → checa se já enviou hoje (log)
      → renderiza template ({nome}/{valor}/{data})
      → envia via Meta/Z-API/Evolution
      → grava resultado no log
```

### Detalhes técnicos

- **Cron**: `pg_cron` + `pg_net` rodando hourly job que invoca a edge function com o anon key.
- **Idempotência**: chave única `(loan_id, installment_number, date_part('day', sent_at))` no log.
- **RLS**: tabelas com `owner_id = get_data_owner_id(auth.uid())`.
- **Telefone**: reaproveita `normalizePhoneBR` de `src/lib/whatsappBilling.ts`.
- **Templates**: reaproveita os já cadastrados em `whatsapp_billing_messages`.
- **Secrets**: usa `secrets--add_secret` para pedir as credenciais antes de implementar a edge function.

### O que vou precisar de você antes de começar

1. Escolher **Opção A (Meta oficial)** ou **Opção B (Z-API/Evolution)**
2. Após aprovar o plano, te pedirei as credenciais correspondentes via Secrets

