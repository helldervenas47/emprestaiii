# EmprestAI

Aplicativo de controle de empréstimos e finanças pessoais, importado do repositório original e conectado diretamente a um único projeto Supabase.

## Configuração

1. Copie `.env.example` para `.env`.
2. Preencha `VITE_SUPABASE_URL` e uma chave pública em `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`.
3. Instale as dependências com `npm install`.
4. Inicie com `npm run dev`.

O frontend usa somente `src/integrations/supabase/userClient.ts`. O arquivo `client.ts` apenas reexporta a mesma instância para compatibilidade com imports antigos.

## Edge functions

As funções em `supabase/functions` usam as variáveis nativas do projeto:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEYS` (com fallback para `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_ANON_KEY` localmente)
- `SUPABASE_SECRET_KEYS` (com fallback para `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` localmente)

No Supabase hospedado, essas variáveis são fornecidas ao runtime das edge functions. Para execução local, copie `supabase/.env.example` para `supabase/.env.local` e preencha os valores. A service role nunca deve receber o prefixo `VITE_` nem ser importada pelo frontend.

O projeto vinculado pela configuração do Supabase é `syyxnqzxqabeuqbuptkh`.

## Validação

```bash
npm test
npm run lint
npm run build
```
