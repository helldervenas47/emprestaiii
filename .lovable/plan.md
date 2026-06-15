# Subaba "Planos" em Sistemas

## Escopo

Nova subaba **Planos** dentro de `SystemSettings.tsx`, posicionada logo após **Administração** (somente admin). Gerencia a tabela `plans` já existente, estendida com novos campos, e a tela `/planos` (Pricing) passa a refletir tudo automaticamente.

## 1. Banco de dados (migration)

Estender a tabela `public.plans` (já existe com `id, name, price, highlight, active, features, sort_order, allowed_tabs, max_users, max_loans`). Adicionar:

- `description text`
- `price_semestral numeric` (valor total cobrado no semestre — pode ser calculado ou manual)
- `price_anual numeric` (valor total do ano)
- `discount_semestral numeric default 0` (% — CHECK 0..100)
- `discount_anual numeric default 0` (% — CHECK 0..100)
- `badge text` (ex.: "Mais Popular", "Melhor Custo-Benefício", "Mais Vendido", null)
- `promo_text text` (texto livre, ex.: "2 meses grátis")
- `highlight_color text` (hex/HSL para borda/destaque)
- `recommended boolean default false` (Plano Recomendado — destaque visual extra)

RLS: a tabela já tem policy de leitura pública. Adicionar policies de INSERT/UPDATE/DELETE restritas a `has_role(auth.uid(),'admin')`. Manter GRANTs (`SELECT` para `anon`/`authenticated`, `ALL` para `service_role`).

## 2. Componente novo `PlanManagement.tsx`

Em `src/components/admin/PlanManagement.tsx`:

- Lista de planos (cards/tabela) com botões Editar, Ativar/Desativar, Excluir, "Definir como recomendado".
- Botão "Novo plano" abre `Dialog` com formulário (react-hook-form + zod):
  - Nome, Descrição, Ordem, Status (Switch Ativo)
  - **Valor mensal** (MoneyInput)
  - **Desconto semestral (%)** e **Desconto anual (%)** — sliders/inputs 0–100
  - **Valor semestral** e **Valor anual** — auto-calculados a partir do mensal e desconto (`mensal * meses * (1 - desc/100)`), mas editáveis manualmente (campo "sobrescrever").
  - Selo (`Select`: nenhum, Mais Popular, Melhor Custo-Benefício, Mais Vendido, custom)
  - Texto promocional
  - Cor de destaque (color picker)
  - Switch "Plano recomendado" (ao marcar, desmarca os outros)
  - Switch "Destaque (highlight)"
- Painel de preview ao lado mostrando como o card aparecerá na tela `/planos`, incluindo: valor original riscado, valor com desconto, "Economize R$ X (Y%)", badge e borda colorida.
- Validações: desconto 0–100, preço ≥ 0, nome obrigatório.

Hook `usePlans.ts` para CRUD via supabase client (`from('plans')`).

## 3. Integração com `SystemSettings.tsx`

- Importar lazy `PlanManagement`.
- Adicionar `<TabsTrigger value="plans">` com ícone `Package`/`Tag`, logo após o trigger `admin`, condicionado a `isAdmin`.
- Adicionar `<TabsContent value="plans">` chamando `<PlanManagement />`.

## 4. Tela `/planos` (Pricing.tsx)

- Estender query para selecionar novos campos.
- Adicionar **toggle de ciclo** (Mensal | Semestral | Anual) acima do grid.
- Renderização dinâmica por plano:
  - Calcular `displayPrice = ciclo === 'mensal' ? price : (override || price*meses*(1-desc/100))`.
  - Mostrar valor "por mês equivalente" (`displayPrice / meses`).
  - Se há desconto: mostrar valor original riscado + economia em R$ e %.
  - Renderizar `badge` (substitui o atual "Mais popular" fixo).
  - Aplicar `highlight_color` na borda quando `recommended`.
  - Mostrar `promo_text` abaixo do preço.
- Ordenação por `sort_order`.

## 5. Regras de cálculo (helper `src/lib/planPricing.ts`)

```ts
calcCyclePrice(monthly, months, discountPct, override?)
calcSavings(monthly, cyclePrice, months) → { saved: R$, percent: % }
```

## Detalhes técnicos

- Tipos do Supabase serão auto-regenerados após a migration.
- Usar `Money` formatter já existente em `src/lib/utils.ts` / `MoneyInput`.
- Cache: `Pricing` faz fetch direto; após edição, admin pode recarregar — sem realtime por enquanto.
- Acesso à subaba: bloqueado se `role !== 'admin'`.

## Arquivos criados/alterados

```text
db migration                               (nova)
src/components/admin/PlanManagement.tsx    (novo)
src/hooks/usePlans.ts                      (novo)
src/lib/planPricing.ts                     (novo)
src/components/SystemSettings.tsx          (editado)
src/pages/Pricing.tsx                      (editado)
```

## Fora do escopo

- Integração com gateway de pagamento por ciclo (Asaas/Stripe) — os novos preços ficam disponíveis no banco, mas a criação de assinaturas semestral/anual no gateway é um próximo passo.
- Histórico de versões de preço.
- A/B testing de planos.
