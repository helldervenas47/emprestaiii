## Buscador de Boletos

Criar uma nova seção **Boletos** no app com duas funções:

1. **Consulta por linha digitável / código de barras** — funciona offline, sem API externa.
2. **Importação de boletos a pagar de uma plataforma externa** — estrutura pronta, pendente de você confirmar qual plataforma (Asaas, Cora, Iugu, Banco Inter PJ, BB API, etc.).

Em ambos os casos os boletos aparecem **apenas para consulta** — nada é gravado automaticamente em Despesas. Um botão "Salvar como despesa" fica disponível para o usuário decidir caso a caso.

---

### 1. Parser de linha digitável (offline)

Tela com um campo grande onde o usuário cola/digita a linha digitável (47 dígitos para boleto bancário, 48 para arrecadação/concessionária). O app decodifica localmente e mostra:

- **Banco emissor** (ex: 341 → Itaú, 001 → BB, 237 → Bradesco…) via tabela local + fallback BrasilAPI para nomes não conhecidos.
- **Vencimento** (calculado a partir do fator de vencimento).
- **Valor** (últimas 10 posições do código).
- **Tipo**: cobrança bancária ou arrecadação (água, luz, tributo…).
- **Validade dos dígitos verificadores** (módulo 10 / 11) — alerta vermelho se inválido.
- **Código de barras** (44 dígitos) reconstruído, com botão "Copiar".

Tudo isso roda no frontend, sem custos e sem chamadas externas (exceto opcionalmente o nome do banco).

> Importante: a linha digitável **não contém** o nome do beneficiário nem o status (pago/em aberto). Essa informação só existe no sistema do banco emissor — por isso a parte 2.

### 2. Importação de boletos de plataforma externa

Tela "Meus boletos a pagar" lista boletos pendentes vindos de uma API externa, com filtros por status (pendente / pago / vencido) e busca por beneficiário/valor.

Como não existe uma API única que retorna "qualquer boleto do Brasil", a integração é por plataforma. A arquitetura é genérica: uma edge function `boletos-import` recebe o nome do provedor e devolve uma lista normalizada `{id, beneficiary, dueDate, amount, status, barcode, payLink}`. Adapters por provedor ficam isolados.

**Provedores prontos para plugar** (decidir 1 e me dizer qual):
- **Asaas** — só API key, mais simples.
- **Cora** — OAuth2 + client_id/secret.
- **Iugu** — API key.
- **Banco Inter PJ** — exige certificado mTLS (mais complexo, edge function precisa de variáveis extras).
- **BB API** — exige cadastro no portal do desenvolvedor + OAuth.

Enquanto você não escolher, a tela mostra estado vazio com botão "Configurar provedor".

### 3. Integração com o app

- Novo item no menu/abas principais: **Boletos** (logo após Despesas).
- Mesmo padrão visual das outras abas (Card, Badge, MoneyInput, dialog em pt-BR).
- Botão secundário em cada boleto consultado: **"Salvar como despesa"** → abre o `ExpenseForm` pré-preenchido (descrição = beneficiário, valor, vencimento, categoria sugerida "Boletos"). Salvar só acontece se o usuário confirmar — sem duplicidade.
- Histórico local (Lovable Cloud) das últimas linhas digitáveis consultadas, para reabertura rápida.

---

### Detalhes técnicos

**Arquivos novos:**
- `src/lib/boleto/parseLinhaDigitavel.ts` — parser puro (banco, vencimento, valor, DV, código de barras).
- `src/lib/boleto/banks.ts` — dicionário código→nome dos principais bancos brasileiros.
- `src/components/boletos/BoletoSearchTab.tsx` — tela principal com 2 sub-abas: "Consultar" e "A pagar".
- `src/components/boletos/BoletoParserCard.tsx` — input + resultado decodificado.
- `src/components/boletos/BoletoImportList.tsx` — lista vinda da edge function.
- `src/hooks/useBoletoHistory.ts` — histórico das consultas recentes.
- `supabase/migrations/...` — tabela `boleto_lookups` (id, user_id, raw_line, parsed_json, created_at) com RLS por `get_data_owner_id(auth.uid())`.
- `supabase/functions/boletos-import/index.ts` — edge function genérica com adapter pattern (`adapters/asaas.ts`, etc.). Inicialmente só o esqueleto + um adapter de exemplo (Asaas, se você confirmar).

**Arquivos alterados:**
- `src/lib/appTabs.ts` — adicionar a aba "Boletos".
- `src/pages/Index.tsx` — registrar a aba (provavelmente atrás de `SubscriptionGate` Tier 1 ou 2, igual ao padrão atual).
- `src/components/ExpenseForm.tsx` — aceitar `initialValues` opcionais via props para o atalho "Salvar como despesa".

**Algoritmo do parser** (resumo):
```text
Linha digitável (47 dígitos) → reordena para código de barras (44 dígitos):
  posições 1-4 banco, 5 moeda, 33 DV geral,
  34-37 fator de vencimento (dias desde 07/10/1997),
  38-47 valor em centavos,
  18-44 campo livre do banco.
Vencimento = 1997-10-07 + fator dias.
Cada um dos 3 campos da linha tem DV módulo 10.
```

**Custos/limites:** parser é grátis. Importação externa depende da plataforma escolhida — algumas têm tier gratuito (Asaas), outras só PJ pago.

---

### Próximo passo

Me confirme **qual plataforma** você quer usar na importação (ou se prefere começar só com o parser e adicionar a integração externa depois). Depois disso eu implemento.
