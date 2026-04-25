# Cotizaciones Desktop

Esta copia es la base para la futura aplicacion de escritorio de Windows.

## Estado actual

- El frontend ya tiene un modo `desktop`.
- El build desktop usa rutas relativas (`./`) para que luego pueda empaquetarse en un contenedor nativo.
- En modo `desktop` no intenta registrar `service worker`.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run dev:desktop`
- `npm run build:desktop`

## Lo que ya queda preparado

- `vite.config.ts` cambia el `base` segun el modo.
- `index.html` ya no depende de `/index.css`.
- `src/pwa.ts` desactiva el registro PWA en desktop.
- `index.html` ya no carga Google Fonts ni `importmap` remotos.
- `index.tsx` carga `flatpickr` desde dependencias locales.
- el arranque ya no monta `index.tsx` dos veces.
- `index.html` ya no depende de Font Awesome por CDN.
- `src/icons.ts` reemplaza iconos `fa-*` por iconos locales.
- `src/state.ts` ya puede usar cache local de catalogos en modo `desktop`.
- `src/api.ts` ya usa cache local para `settings` en modo `desktop`.
- `src/main.ts` ya evita `realtime` en modo `desktop`.
- `src/state.ts` ya puede cargar `cotizaciones` y `ordenes` desde cache local si la nube no responde.
- `src/api.ts` ya puede guardar y eliminar `cotizaciones` / `ordenes` localmente en modo `desktop` cuando no hay red.
- `src/sync.ts` ya sincroniza la cola local cuando vuelve la conexion.
- `src/db.ts` ya usa `IndexedDB` como persistencia local real, con migracion silenciosa desde el cache legado.
- `src/desktop-persistence/` separa el backend actual de persistencia del resto de la app.
- `src-tauri/` ya existe con el esqueleto base de `Tauri`.
- `src-tauri/src/lib.rs` ya expone un puente IPC `desktop_cache_get/set` para que Tauri pueda asumir la persistencia local sin tocar `db.ts`.
- ese puente ya guarda en `SQLite` y migra de forma silenciosa desde `desktop-cache.json`.
- `src/auth.ts` ya inicializa la persistencia desktop antes del login para permitir acceso offline con credenciales ya cacheadas.
- `package.json` ya incluye scripts `tauri`, `tauri:dev` y `tauri:build`.

## Lo que falta para convertirla en app Windows real

1. Instalar Rust.
2. Instalar la CLI de Tauri.
3. Probar el wrapper nativo (`src-tauri/`) que ya quedó creado.
4. Reemplazar dependencias remotas que hoy rompen el offline real:
   - terminado: `formsubmit`
5. Cambiar la arquitectura de datos a offline-first:
   - base local
   - cola de sincronizacion
6. Llevar la persistencia local al siguiente nivel:
   - hoy ya usa `IndexedDB`
   - falta pasar luego a `SQLite` con Tauri
7. Sincronizar la cola local pendiente con Supabase cuando vuelva la conexion.
8. Mostrar en UI el estado de sincronizacion y el numero de cambios pendientes de forma persistente.
   - resolucion de conflictos

## Nota importante

Aunque esta copia ya puede compilar en modo `desktop`, levantar catalogos desde cache local, conservar `cotizaciones` / `ordenes` localmente y sincronizar cambios pendientes al reconectar, todavia **no es offline real completo** porque aun no tiene `SQLite`, login local desacoplado, ni manejo de conflictos serio.

## Estado de Tauri

Ya quedó preparado:

- `src-tauri/Cargo.toml`
- `src-tauri/build.rs`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`

Pendiente para poder correrlo:

- instalar `Rust` (`cargo`, `rustc`)
- instalar dependencias reales de `@tauri-apps/cli`
- generar iconos definitivos de bundle para Windows (`.ico`)

## Siguiente salto tecnico

La persistencia desktop ya no depende de una implementacion pegada a `db.ts`.

Hoy:
- backend activo: `IndexedDB`
- fallback legado: `localStorage`
- puente `Tauri` listo por IPC
- backend nativo previsto: `SQLite`

Siguiente paso:
- validar el backend `SQLite` del bridge `Tauri` cuando Rust ya este instalado
- y dejar `db.ts` apuntando a ese backend cuando Tauri ya este operativo
