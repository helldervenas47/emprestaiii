

# Página de Planos e Preços

## O que será feito

Criar uma página pública (`/planos`) com os planos de assinatura do sistema, acessível sem login. A página terá um design moderno com cards para cada plano, botão de CTA e link visível na tela de login.

## Estrutura

1. **Nova página `src/pages/Pricing.tsx`**
   - 2-3 cards de planos (ex: Básico, Profissional, Empresarial) com preços, lista de funcionalidades e botão de ação
   - Design responsivo com gradientes e destaque no plano recomendado
   - Botão "Criar conta" que redireciona para `/auth`
   - Header com logo e botão "Entrar"

2. **Rota pública no `App.tsx`**
   - Adicionar rota `/planos` como rota pública (sem autenticação)

3. **Link na página de login (`Auth.tsx`)**
   - Adicionar link "Ver planos" na tela de autenticação para direcionar novos visitantes

## Planos sugeridos (editáveis depois)

| Plano | Preço | Destaques |
|-------|-------|-----------|
| Básico | R$ 29/mês | Até 50 empréstimos, 1 usuário |
| Profissional | R$ 59/mês | Empréstimos ilimitados, 3 usuários, relatórios |
| Empresarial | R$ 99/mês | Tudo incluso, usuários ilimitados, suporte prioritário |

Os valores e funcionalidades são apenas visuais por enquanto — sem integração de pagamento. Você poderá ajustar textos e preços facilmente depois.

## Arquivos modificados
- `src/pages/Pricing.tsx` — novo
- `src/App.tsx` — nova rota pública
- `src/pages/Auth.tsx` — link para /planos

