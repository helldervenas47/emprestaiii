## Criar `vercel.json` para SPA (Single Page Application)

Objetivo: adicionar o arquivo de configuração do Vercel para garantir que todas as rotas do React Router sejam redirecionadas para `index.html` e que os assets estáticos sejam cacheados corretamente.

### O que será criado

Arquivo `vercel.json` na raiz do projeto contendo:

1. **Rewrite de SPA** — Todas as rotas (`/auth`, `/cadastro`, `/planejamento-do-dia`, etc.) redirecionadas para `index.html` para que o React Router lide com o roteamento no client-side.
2. **Headers de cache** — Assets estáticos (JS, CSS, imagens, fontes) com cache longo (`immutable`), e `index.html` com `no-cache` para que atualizações da PWA cheguem rapidamente.
3. **Exclusão de assets reais** — O rewrite não afeta arquivos estáticos existentes (assets do Vite).

### Exemplo do resultado

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

Nenhuma mudança em código existente é necessária.
