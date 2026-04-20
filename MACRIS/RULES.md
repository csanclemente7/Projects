# Royal Wash — Rules del Proyecto

Estas reglas aplican a TODAS las conversaciones de este workspace.
Léelas siempre antes de ejecutar cualquier tarea.

## Referencia Principal
El PRD completo está en: `PRD-Royal-Wash.md` — consultarlo para cualquier duda de producto, arquitectura, datos o UX.

---

## Reglas Generales

- SIEMPRE lee el archivo completo antes de editarlo. No asumas contenido.
- NUNCA rehaces un archivo completo si solo necesitas cambiar unas líneas. Usa edits quirúrgicos.
- SIEMPRE trabaja incrementalmente. Un feature a la vez. Un componente a la vez.
- SIEMPRE verifica que tu cambio no rompa la funcionalidad existente antes de reportar éxito.
- NUNCA introduzcas dependencias npm nuevas sin justificar explícitamente por qué la existente no funciona.
- DOCUMENTA toda decisión de diseño no obvia en un comentario breve en el código.

## Arquitectura

- Toda configuración del negocio viene de la tabla `app_config` o de las tablas de catálogo. NUNCA hardcodees valores de negocio (precios, nombres de servicios, textos, etc.).
- Los servicios, precios, lavadores, métodos de pago y textos son SIEMPRE dinámicos desde admin.
- Toda interacción con datos pasa por IndexedDB (Dexie) primero, NUNCA directamente a Supabase desde componentes.
- Las fotos se comprimen a WebP antes de guardarlas. NUNCA guardes una imagen sin comprimir.
- Los estados del servicio siguen una máquina de estados estricta. No permitas transiciones inválidas.
- Los precios se almacenan en centavos (enteros). Para display: `price_cents / 100`, formateado como `$15.000`.

## UX Obligatoria

- CERO scroll en pantallas principales. Si el contenido no cabe, usa paginación, tabs o filtros.
- Toda pantalla del flujo de registro presenta UNA sola decisión/acción.
- Botones principales: mínimo 56px de alto, texto de máximo 5 palabras.
- Colores de estado: Rojo = Lavando, Naranja = Listo/Cobrar, Verde = Pagado. NO cambies estos colores.
- Toda acción del usuario debe tener feedback visual inmediato (< 100ms).
- El modo test y el modo normal usan los MISMOS componentes UI. La diferencia es solo datos y hints.
- La app debe sentirse como un juego funcional, no como un ERP empresarial.

## Offline

- La app debe funcionar 100% sin internet. No muestres errores de red al operador.
- El indicador offline es un dot sutil en el header, NUNCA un modal bloqueante.
- Toda escritura va a Dexie + sync_queue. El sync engine procesa la queue en background.
- Las fotos offline van a image_cache en IndexedDB. Se suben a Supabase Storage al reconectar.

## Supabase

- TODAS las tablas tienen RLS habilitado. Sin RLS = error de seguridad.
- Las imágenes usan la naming convention: `{bucket}/{branch_id}/{YYYY-MM}/{id}_{purpose}.webp`
- Edge Functions solo para tareas CRON (cleanup). No para lógica de negocio.
- Genera TypeScript types después de cada migration con `generate_typescript_types`.

## Frontend

- Usa CSS Modules para componentes. CSS vanilla global solo para tokens y reset.
- Componentes: una responsabilidad, props tipadas, sin side effects en render.
- Estado global en Zustand (mínimo 2 stores: appStore + syncStore).
- Routing con React Router. Lazy-load de módulos: admin, training, reports.
- No uses `useEffect` para fetching. Usa custom hooks que lean de Dexie.
- Formatea precios con `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP'})`.
- Tamaños en rem (1rem=16px). Spacing en múltiplos de 4px (0.25rem).
- Design tokens en `src/styles/tokens.css` como CSS custom properties.

## Tokens / Eficiencia

- NUNCA regeneres un archivo completo si solo cambias una parte.
- Si necesitas crear un componente similar a uno existente, reutiliza el existente con props.
- No repitas tipos/interfaces. Importa desde `src/shared/types/`.
- Los contratos de interfaces entre módulos se definen una vez y se congelan.
- Prefiere CSS custom properties (tokens) sobre valores hardcodeados.

## Stack (congelado, no re-deliberar)

- Frontend: React 19 + Vite 6 + Capacitor 6
- Offline: Dexie.js (IndexedDB)
- State: Zustand
- Backend: Supabase (Auth + PostgreSQL + Storage + Realtime)
- OCR: Google ML Kit on-device (APK) / Manual asistido (PWA)
- Pagos V1: Confirmación manual + foto comprobante
- Imágenes: WebP via Compressor.js. Placa ≤150KB. Recibo ≤250KB.
