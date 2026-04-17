import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.macris.agenda',
  appName: 'Agenda MACRIS',
  webDir: 'dist',
  android: {
    buildOptions: {
      keystorePath: undefined,
    }
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
  server: {
    // Permite cleartext para desarrollo local; en producción se usa el bundle
    cleartext: false,
  }
};

export default config;
