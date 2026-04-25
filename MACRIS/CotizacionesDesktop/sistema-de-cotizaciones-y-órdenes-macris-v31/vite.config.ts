import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const tauriDevHost = process.env.TAURI_DEV_HOST;
  const isDesktopBuild = mode === 'desktop';
  const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

  return {
    base: isDesktopBuild || isTauriBuild ? './' : '/apps/cotizaciones/',
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
      host: tauriDevHost || false,
      hmr: tauriDevHost
        ? {
            protocol: 'ws',
            host: tauriDevHost,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },
    build: {
      target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : undefined,
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          admin: path.resolve(__dirname, 'admin/index.html'),
        },
      },
    },

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    envPrefix: ['VITE_', 'TAURI_ENV_*'],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'), // Así apuntas a 'src'
      }
    }
  };
});
