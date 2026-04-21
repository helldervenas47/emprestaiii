
Objetivo

Adicionar uma análise ampliada de crédito no app para cada cliente, alimentada automaticamente por fontes externas, cobrindo:
- renda mensal
- histórico de crédito
- score
- nível de endividamento
- estabilidade de emprego
- setor de atuação
- histórico de inadimplência
- relacionamento bancário

O que será construído

1. Cadastro de perfil financeiro do cliente
- Expandir o cadastro do cliente para incluir um bloco de “Análise financeira”.
- Exibir os dados coletados automaticamente com status visual:
  - verificado
  - pendente
  - indisponível
  - desatualizado
- Permitir atualização manual apenas como fallback, sem quebrar a automação.

2. Tela detalhada de análise do cliente
- Criar uma seção dedicada dentro do detalhe do cliente com:
  - score consolidado
  - faixas de risco
  - renda estimada/verificada
  - exposição/endividamento
  - histórico de atrasos e inadimplência
  - estabilidade profissional
  - setor de atuação
  - relacionamento bancário
  - origem e data da última atualização de cada dado
- Manter o padrão visual já usado na tela de detalhes e nos cards de risco.

3. Motor de risco unificado
- Evoluir a lógica atual de risco para combinar:
  - comportamento interno no app
  - sinais externos recebidos dos provedores
- Produzir:
  - score interno
  - score externo
  - score consolidado
  - motivos principais do alerta
  - fatores positivos e negativos

4. Atualização automática
- Criar fluxo de consulta automática quando:
  - um cliente for criado
  - um cliente for atualizado
  - o usuário solicitar nova consulta
  - houver vencimento da validade da análise
- Exibir carregamento, último sync e erros de consulta sem travar a interface.

Mudanças de backend

1. Novas estruturas de dados
Criar tabelas separadas para não misturar dados cadastrais com dados sensíveis de análise:
- client_financial_profiles
  - client_id
  - monthly_income
  - debt_level
  - employment_stability
  - industry_sector
  - banking_relationship
  - external_score
  - internal_score
  - consolidated_score
  - risk_level
  - fetched_at
  - expires_at
- client_credit_reports
  - client_id
  - provider
  - raw_summary
  - delinquency_history
  - credit_history_summary
  - source_status
  - fetched_at
- client_analysis_events
  - client_id
  - event_type
  - status
  - message
  - created_at

2. Segurança e acesso
- Aplicar políticas para que cada conta veja apenas seus próprios clientes e análises.
- Restringir escrita automática aos processos de backend.
- Não salvar segredos nem credenciais no frontend.
- Registrar auditoria de consultas e falhas.

3. Funções de backend
Criar funções para:
- consultar provedores externos
- normalizar respostas diferentes
- consolidar dados em formato único
- recalcular score consolidado
- registrar erros e tentativas
- permitir reconsulta sob demanda

Integrações externas

Como você pediu automação com fontes externas, essa parte depende de integração com provedores especializados. O app pode ser preparado para isso, mas a qualidade dos dados depende do serviço contratado.

Escopo da integração:
- score e histórico de crédito: bureau/antifraude/credit scoring
- renda, vínculo e estabilidade: provedor com validação de renda/emprego
- relacionamento bancário e endividamento: Open Finance/Open Banking ou provedor equivalente
- inadimplência: bureau ou serviço de cobrança/análise cadastral

Abordagem de implementação:
- usar integrações de backend com secrets seguros
- criar adaptadores por provedor para trocar o fornecedor sem reescrever a UI
- padronizar tudo em um modelo único antes de mostrar no app

UI e experiência

1. Cliente
- No formulário de cliente:
  - botão “Analisar automaticamente”
  - indicador de status da análise
  - consentimento/ciência quando necessário

2. Detalhe do cliente
- Novo bloco “Perfil de crédito e capacidade”
- Cards resumidos com semáforo:
  - renda
  - endividamento
  - estabilidade
  - inadimplência
  - bancarização
- Timeline de atualizações e alterações do score

3. Novo empréstimo
- Aproveitar o alerta de risco já existente e enriquecer com dados externos:
  - “Renda incompatível com valor solicitado”
  - “Histórico recente de inadimplência”
  - “Endividamento elevado”
  - “Relacionamento bancário fraco”
- Sugerir ação:
  - prosseguir
  - exigir entrada maior
  - reduzir valor
  - revisar manualmente

Lógica de risco proposta

Peso base do score consolidado:
- 40% comportamento interno no app
- 60% dados externos

Critérios considerados:
- pontualidade e atrasos no histórico interno
- inadimplência recorrente
- volume já emprestado
- score externo
- renda mensal versus parcela proposta
- comprometimento de renda
- estabilidade de emprego
- setor de atuação
- relacionamento bancário
- sinais negativos recentes

Saídas do motor:
- Baixo
- Moderado
- Alto
- Crítico

Critérios de viabilidade

É possível implementar no app, mas alguns dados não existem hoje no projeto e não podem ser inferidos com confiabilidade apenas pelo que já está salvo.
Então a solução completa exige:
- novas tabelas
- novas funções de backend
- integração com um ou mais provedores externos
- configuração segura de credenciais
- regras de consentimento e atualização

Detalhes técnicos

Arquivos mais impactados:
- src/types/loan.ts
- src/hooks/useClients.ts
- src/components/ClientForm.tsx
- src/components/ClientList.tsx
- src/components/ClientDetailDialog.tsx
- src/components/LoanForm.tsx
- src/lib/clientRisk.ts

Novos elementos prováveis:
- hook para análise financeira do cliente
- componentes de cards de análise
- funções de backend para consulta externa
- migração de banco para novas tabelas de análise

Ordem de execução

1. Modelar dados de análise no backend com segurança
2. Criar funções de backend para consulta e normalização
3. Expandir tipos e hooks no frontend
4. Adicionar status de análise no cadastro e na lista de clientes
5. Criar seção completa de análise no detalhe do cliente
6. Integrar esses dados ao alerta de novo empréstimo
7. Tratar reconsulta, cache, expiração e erros
8. Validar o fluxo completo ponta a ponta com clientes reais de teste

Resultado final esperado

O usuário conseguirá abrir o cliente e ver uma análise automática consolidada, com dados internos e externos, além de receber alertas mais inteligentes no momento de criar um novo empréstimo.
