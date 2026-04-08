import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const defaultBase = mode === 'production' ? '/apps/reportesdev/' : './';
  const publicBase = env.VITE_PUBLIC_BASE?.trim() || defaultBase;

  return {
    // Default web builds target the hosted subpath, while mobile builds can use `--mode mobile`
    // to keep relative asset paths for Capacitor.
    base: publicBase,

    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.')
      }
    }
  };
});
