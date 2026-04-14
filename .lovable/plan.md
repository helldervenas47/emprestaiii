

# Plano: Efeito de degradê hover nos botões

Adicionar um efeito de hover nos botões onde, ao passar o mouse, um degradê (da esquerda para a direita) aparece suavemente.

## Implementação

Modificar o componente `src/components/ui/button.tsx` para adicionar um efeito de gradiente animado no hover usando pseudo-elemento CSS ou classes Tailwind customizadas.

Adicionar em `src/index.css` uma classe utilitária que aplica um gradiente da esquerda para a direita no hover com transição suave, usando `background-size` e `background-position` para animar o degradê.

O efeito será aplicado nas variantes `default`, `destructive` e `success` (as que têm cor de fundo sólida).

