# Roadmap Windows Desktop

## Fase 1. Preparacion del frontend

- `build:desktop` con `base: './'`
- sin `service worker` en modo desktop
- sin referencias absolutas a recursos web locales
- sin `importmap` remoto
- sin Google Fonts remotas
- sin Font Awesome remoto
- sin `formsubmit`
- `flatpickr` CSS cargado desde dependencias locales
- un solo punto de arranque para la app
- `settings` con fallback local
- catalogos con cache local
- cotizaciones y ordenes con cache local
- cola local minima de cambios pendientes
- sincronizacion basica al reconectar
- persistencia local en `IndexedDB`
- backend de persistencia ya desacoplado en `src/desktop-persistence/`
- sin `realtime` en modo desktop

## Fase 2. Contenedor Windows

Recomendado: `Tauri`

Objetivo:
- generar `.exe` o instalador para Windows
- abrir el frontend local en WebView nativo

Estado actual:
- `src-tauri/` ya fue creado manualmente
- `tauri.conf.json` ya apunta a `npm run dev:desktop` y `npm run build:desktop`
- capability base `default` ya existe
- `src-tauri/src/lib.rs` ya expone comandos IPC de cache local para el frontend desktop
- ese bridge ya persiste en `SQLite` y migra el JSON legado

Prerequisitos pendientes:
- `Rust`
- `cargo`
- `rustc`
- dependencias instaladas de `@tauri-apps/cli`
- iconos de bundle definitivos para Windows

## Fase 3. Offline real

La app actual aun depende de:
- Supabase online
- iconos remotos
- escritura remota directa de cotizaciones y ordenes
- falta pasar de `IndexedDB` a una base local mas robusta para escritorio

Para que funcione sin internet de verdad se necesita:

1. base local (`SQLite`)
2. lectura y escritura local
3. sincronizacion diferida
4. cola de cambios
5. manejo de conflictos
6. login local desacoplado de la nube
7. estrategia de sincronizacion de adjuntos y buckets
8. activar y validar la persistencia `SQLite` del bridge Tauri cuando Rust este disponible
9. cambiar el backend preferido del frontend de `IndexedDB` a `Tauri/SQLite`

## Fase 4. Modulos a migrar primero a offline

Orden sugerido:

1. autenticacion local
2. catalogos base
   - clientes
   - empresas
   - sedes
   - dependencias
   - insumos
3. cotizaciones
4. ordenes locales
5. PDFs y exportaciones
6. sincronizacion con nube

## Riesgos actuales

- El proyecto usa recursos CDN que no sirven offline.
- La logica hoy esta pensada para consultar Supabase directamente.
- Si se empaqueta asi como esta, seria una app Windows pero no una app offline confiable.
