import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.emprestaii.app',
  appName: 'EmprestAii',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
