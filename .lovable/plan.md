

## Assistente Financeiro com IA

Vou criar um assistente financeiro conversacional integrado ao seu sistema, usando a IA já conectada (Lovable AI Gateway — sem precisar de API key adicional). Ele terá acesso aos seus dados reais (contratos, clientes, despesas, metas) para responder perguntas e dar recomendações.

### O que será construído

**1. Botão flutuante de chat** (canto inferior direito, em todas as páginas)
- Ícone de mensagem com indicador de "online"
- Abre um painel lateral (Sheet) com a conversa

**2. Painel de conversa**
- Histórico da conversa na sessão atual
- Campo de input com envio por Enter
- Streaming token-a-token (resposta aparece em tempo real)
- Renderização em markdown (listas, negrito, tabelas)
- Botão "Nova conversa" para limpar histórico
- Sugestões rápidas iniciais ("Como está minha inadimplência?", "Quais contratos vencem hoje?", "Resumo do mês")

**3. Edge function `financial-assistant`** (backend)
- Valida JWT do usuário
- Carrega contexto financeiro do `data_owner_id`:
  - Resumo de contratos (ativos, vencidos, a vencer 7 dias)
  - Top 5 inadimplentes
  - Receita e despesas do mês corrente
  - Metas do mês e progresso
  - Capital ativo atual
- Envia contexto + histórico da conversa para `google/gemini-3-flash-preview` via Lovable AI
- Faz streaming SSE da resposta para o frontend
- Trata erros 429 (rate limit) e 402 (créditos)

**4. Prompt do assistente**
- Persona: consultor financeiro especialista em crédito e cobrança
- Tom: equilibrado, direto, com números específicos
- Restrições: não inventar dados, citar valores reais do contexto, sugerir ações práticas
- Idioma: português

### O que o assistente poderá responder

- "Quanto tenho a receber esta semana?"
- "Qual cliente está mais inadimplente?"
- "Como está minha margem este mês vs mês passado?"
- "Devo aumentar o limite do cliente X?" (usa risco já calculado)
- "Resumo executivo do meu negócio agora"
- Conselhos de cobrança, estratégia, redução de risco

### Arquivos

**Criar:**
- `supabase/functions/financial-assistant/index.ts` — edge function com streaming SSE
- `src/components/FinancialAssistant.tsx` — botão flutuante + painel de chat
- `src/hooks/useFinancialAssistant.ts` — gerencia mensagens e streaming

**Editar:**
- `src/App.tsx` — montar `<FinancialAssistant />` globalmente (apenas para usuários autenticados)
- `package.json` — adicionar `react-markdown` para renderizar respostas

### Considerações técnicas

- **Sem custo adicional de API**: usa Lovable AI Gateway (`LOVABLE_API_KEY` já existe nos secrets)
- **Sem persistência**: conversas ficam apenas na sessão (memória local). Se quiser histórico salvo entre sessões, podemos adicionar uma tabela `assistant_conversations` depois
- **Privacidade**: o contexto enviado à IA é apenas do `data_owner_id` do próprio usuário (respeita o sistema multi-usuário)
- **Custo de tokens**: usa modelo Flash (mais barato/rápido); contexto é resumido, não envia dados brutos completos

