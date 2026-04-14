import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.macrisingenieria.reportes',
  appName: 'Reportes Macris',
  webDir: 'dist',
  bundledWebRuntime: false,

  plugins: {
    BackgroundRunner: {
      // Debe coincidir con MainActivity.java
      channelId: "background_runner_default",
      channelName: "Background Sync",

      // Debe existir en android/app/src/main/res/drawable/
      icon: "ic_launcher",

      // Opcional pero recomendado
      enableHeadless: true
    }
  }
};

export default config;
