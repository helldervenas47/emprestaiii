
## Diagnóstico

A logo aparece pequena no PWA do iPhone por causa de **dois fatores combinados**:

1. **`apple-touch-icon.png` (180×180)** — quando geramos esse arquivo, usamos `-resize 180x180` direto. Como a logo original tem bastante "respiro" (espaço transparente ao redor do símbolo), ao caber 180×180 o desenho útil ocupa só ~60% da área. O iOS **não aplica safe area** no apple-touch-icon — ele usa a imagem inteira como ícone. Resultado: a logo fica visualmente pequena dentro do quadrado.

2. **`logo-maskable-*` com 80% de safe area** — quando você instala via "Adicionar à Tela de Início" no iOS, o Safari pode usar o ícone do manifest. Os maskable foram gerados em ~410/153 px dentro de canvas 512/192 (80%), o que também encolhe o símbolo.

### Tamanhos atuais
| Arquivo | Dimensão | Conteúdo útil |
|---|---|---|
| `apple-touch-icon.png` | 180×180 | ~60% (logo "solta" na arte original) |
| `logo-maskable-512.png` | 512×512 | 80% (410px) |
| `logo-maskable-192.png` | 192×192 | 80% (153px) |
| `logo-ios-512.png` | 512×512 | ~60% |
| `logo-512/384/.../72.png` | originais | ~60% |

## Plano de correção

Regerar todos os ícones recortando primeiro as bordas transparentes da logo original (`-trim`), depois reposicionando com a proporção correta para cada plataforma:

1. **Apple Touch Icon (`apple-touch-icon.png`, 180×180)**
   - Trim da arte original → resize para **~92% do canvas (165×165)** centralizado em fundo `#0F172A` com cantos preenchidos (iOS arredonda automaticamente).
   - Padrão Apple: o símbolo deve ocupar ~80–90% do quadrado.

2. **Ícones standard (`logo-72` … `logo-512.png`)**
   - Trim + resize para **~88% do canvas**, fundo transparente. Usado em abas, atalhos Android e fallback.

3. **Maskable (`logo-maskable-192/512.png`)**
   - Manter safe area, mas aumentar conteúdo de 80% → **~88%** (Android só recorta ~10% nas bordas em formas circulares). Fundo `#0F172A`.

4. **Favicon (`favicon.png`, 64×64)** e **`logo-ios-512.png`**
   - Trim + resize a ~92%, mantendo padrão dos demais.

5. **`src/assets/logo.png` e `logo-icon.png`**
   - Regerar com trim para que a logo dentro do app (header/login) também fique mais cheia.

### Detalhes técnicos
- Usar `convert SRC -trim +repage` para remover transparência ao redor antes de redimensionar.
- Para canvas com fundo: `-background "#0F172A" -gravity center -extent WxH`.
- Manter os mesmos nomes de arquivo (sem mudanças em `index.html` ou `manifest.json`).
- Após a troca, o usuário precisa **reinstalar o PWA no iPhone** (remover ícone da home e adicionar de novo) — iOS faz cache agressivo do apple-touch-icon e não atualiza só com reload.

## Resumo
Hoje o `apple-touch-icon` está em **180×180** e os maskable em **512/192 com 80% de safe area**, mas a arte original tem muito espaço vazio em volta, o que faz a logo parecer pequena. Vou regerar todos os ícones aplicando `-trim` antes do resize, deixando o símbolo ocupar ~88–92% do quadrado em cada formato.

<lov-actions>
<lov-suggestion message="Aplique o plano: regere os ícones com trim e maior preenchimento (88-92%) e atualize apple-touch-icon, maskable, standard e assets internos">Aplicar correção de tamanho</lov-suggestion>
<lov-suggestion message="Aplique o plano mas use 100% do canvas (sem margem) no apple-touch-icon para máxima presença visual no iPhone">Maximizar logo no iOS (100%)</lov-suggestion>
</lov-actions>
