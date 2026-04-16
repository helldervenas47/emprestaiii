

# Substituir ícone principal do site e PWA

## Resumo
Substituir todos os ícones do site (favicon, apple-touch-icon, ícones PWA e logo interno) pelo novo ícone enviado. Gerar todas as variações de tamanho necessárias e configurar o manifest para exibição sem bordas (purpose: "any") em dispositivos móveis.

## Arquivos de ícone a gerar
Usando o ícone enviado, gerar via script Python (Pillow) todos os tamanhos:
- `public/favicon.png` — 32x32
- `public/apple-touch-icon.png` — 180x180
- `public/logo-72.png` — 72x72
- `public/logo-96.png` — 96x96
- `public/logo-128.png` — 128x128
- `public/logo-144.png` — 144x144
- `public/logo-152.png` — 152x152
- `public/logo-192.png` — 192x192
- `public/logo-384.png` — 384x384
- `public/logo-512.png` — 512x512
- `public/logo-icon.png` — 512x512 (usado nas notificações)
- `src/assets/logo-icon.png` — 512x512 (usado nos componentes React)

## Alterações no manifest.json
Alterar `purpose` de todos os ícones grandes (192+) de `"any maskable"` para `"any"` — isso remove o "safe zone" do maskable que adiciona bordas/padding em dispositivos móveis, garantindo que o ícone apareça sem bordas.

## Alterações no PWAInstallPrompt.tsx
Remover `rounded-xl` da tag `<img>` do ícone para não adicionar bordas arredondadas artificiais.

## Arquivos alterados
1. Script Python para gerar todos os tamanhos a partir do upload
2. `public/manifest.json` — purpose dos ícones
3. `src/components/PWAInstallPrompt.tsx` — remover rounded do ícone
4. Todos os PNGs em `public/` e `src/assets/` — substituídos

