

# Plano: Transformar EmprestAI em App Nativo com Capacitor

## O que será feito

Configurar o projeto para funcionar como um app nativo (Android/iOS) usando Capacitor, permitindo publicação na App Store e Google Play.

## Etapas

### 1. Instalar dependências do Capacitor
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`

### 2. Inicializar o Capacitor
- Criar `capacitor.config.ts` com:
  - appId: `app.lovable.a2e7985c0a3e46259cac584b7fc384f5`
  - appName: `emprestaii`
  - Server apontando para o preview do sandbox (hot-reload durante desenvolvimento)

### 3. Ajustar `vite.config.ts`
- Adicionar `base: './'` para que os assets funcionem corretamente no Electron/Capacitor via `file://`

### 4. Passos manuais (você fará no seu computador)
Após eu fazer as configurações acima, você precisará:

1. Exportar o projeto para o GitHub (botão "Export to GitHub" no Lovable)
2. Clonar o repositório no seu computador
3. Rodar `npm install`
4. Adicionar a plataforma: `npx cap add android` e/ou `npx cap add ios`
5. Rodar `npm run build` e depois `npx cap sync`
6. Abrir no emulador: `npx cap run android` ou `npx cap run ios`

**Requisitos no seu computador:**
- Android: Android Studio instalado
- iOS: Mac com Xcode instalado

## Referência
Guia completo: https://docs.lovable.dev/tips-tricks/native-mobile-apps

