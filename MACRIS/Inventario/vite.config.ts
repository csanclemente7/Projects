import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command, mode }) => ({
  root: '.',
  // build:web  → base '/inventario/' (subpath en servidor web)
  // build       → base './'           (Capacitor / WebView nativo)
  // dev         → base '/'            (servidor local)
  base: command === 'build'
    ? (mode === 'web' ? '/inventario/' : './')
    : '/',
  build: {
    outDir: mode === 'web' ? 'dist-web' : 'dist',
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') }
    }
  },
  server: { port: 5174 }
}));