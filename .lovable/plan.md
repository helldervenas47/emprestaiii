

## Plano: Gesto de swipe para abrir menu lateral no mobile

### O que será feito
Adicionar detecção de gesto de swipe (arrastar da esquerda para a direita) na versão mobile para abrir o menu lateral de abas, que já existe como um `Sheet` com `side="left"`.

### Detalhes técnicos

**Arquivo:** `src/pages/Index.tsx`

1. Adicionar detecção de touch events (`touchstart`, `touchmove`, `touchend`) no container principal da página quando `isMobile` for `true`.
2. Detectar swipe da esquerda para a direita: o toque deve iniciar nos primeiros ~30px da tela (borda esquerda) e mover pelo menos 50px para a direita.
3. Quando detectado, chamar `setSidebarOpen(true)` para abrir o Sheet lateral que já existe.
4. Implementar via `useEffect` com event listeners ou criar um hook customizado `useSwipeToOpen`.

Nenhuma biblioteca adicional será necessária — apenas eventos touch nativos do browser.

