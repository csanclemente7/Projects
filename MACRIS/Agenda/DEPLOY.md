# Despliegue Web - Agenda MACRIS

La aplicacion es una app Vite estatica. Para publicarla en Netlify, Vercel o un hosting similar, usa esta carpeta como raiz del proyecto:

```text
MACRIS/Agenda
```

La version web queda publicada bajo esta ruta:

```text
/agenda
```

## Variables de entorno

Configura estas variables en el panel del proveedor de hosting:

```text
VITE_SUPABASE_ORDERS_URL
VITE_SUPABASE_ORDERS_ANON_KEY
VITE_SUPABASE_QUOTES_URL
VITE_SUPABASE_QUOTES_ANON_KEY
```

Los nombres deben conservar el prefijo `VITE_` para que Vite los incluya en el build del frontend.

## Comandos

```bash
npm install
npm run build
npm run preview
```

El build web usa `base: /agenda/`. Para sincronizar Capacitor/Android se mantiene un build separado:

```bash
npm run build:capacitor
npm run cap:sync
```

## Netlify

Si Netlify usa esta carpeta como raiz, `netlify.toml` ya define:

```text
Build command: npm run build
Publish directory: dist
Root redirect: / -> /agenda/
App route: /agenda/*
```

## Vercel

Si Vercel usa esta carpeta como raiz, `vercel.json` ya define:

```text
Framework: Vite
Build command: npm run build
Output directory: dist
Root redirect: / -> /agenda
App route: /agenda/*
```

## Archivos locales

`.env.local` queda excluido por `.gitignore`. Sirve para desarrollo local y no debe subirse al repositorio.
