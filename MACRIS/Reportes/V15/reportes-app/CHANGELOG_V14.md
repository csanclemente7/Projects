# Changelog de Optimizaciones y Mejoras de Rendimiento Móvil (v14)
**Fecha:** 2 de Abril, 2026

Este documento resume los cambios estructurales aplicados recientemente con el objetivo de blindar la aplicación móvil de los técnicos contra intermitencias de red y cuellos de botella de memoria temporal en dispositivos móviles (IndexedDB limit overflow).

## 1. Supabase & Sincronización de Red
- **Desactivación de WebSockets (Realtime) para Técnicos:** Se descubrió que la suscripción directa `on('postgres_changes')` en Supabase generaba bloqueos recurrentes (`CHANNEL_ERROR`) debido a reintentos infinitos cuando los técnicos perdían señal LTE en zonas remotas, consumiendo recursos de batería injustificadamente.
- **Estrategia Polling-First:** En el archivo `src/auth.ts`, se desactivó la conexión híbrida por defecto y se pasó toda la sincronización de órdenes nuevas a una arquitectura asíncrona de _Polling_. Esto previene la congelación de la pantalla si hay cambio errático entre 3G/4G. 

## 2. Inyección de Compresor Fotográfico
- **El Problema:** La captura con la cámara de dispositivos modernos arrojaba archivos en Base64 altísimos (3MB - 6MB por imagen). Si un técnico tomaba fotos para 4 mantenimientos offline en su jornada, la caché de almacenamiento estático (IndexedDB) colapsaba, arrojando errores y perdiendo la persistencia.
- **Solución Native (Capacitor):** En `src/ui.ts` se interceptó la API de nativa en Capacitor `Camera.getPhoto()`, forzando en el proceso de C (`C++`) una resolución `width: 1280` y `quality: 75`. Esto lleva las imágenes al margen ideal de 100kb a 250kb.
- **Solución Web (Browser DOM Canvas):** Para técnicos operando desde web en sus dispositivos, se ajustó `.toDataURL('image/jpeg', 0.75)` para que sea equitativo al re-escalado por hardware móvil.

## 3. UI/UX: Inserción de Selector Dual de Captura
Se eliminó la fricción obligatoria de pasar por la cámara web del aplicativo antes de poder seleccionar archivos del almacén del dispositivo.
- En la interfaz del reporte (Sección de Capturas de Instalación & Mantenimiento), se dividieron las acciones en 2 componentes directos:
  1. `<button> <i class="fas fa-camera"></i> </button>`: Activación de cámara cruda.
  2. `<button> <i class="fas fa-upload"></i> </button>`: Selector de Imágenes desde Galería.
- En la capa algorítmica (`src/events.ts` y `src/ui.ts`), se intercepta qué botón es presionado para activar dinámicamente `CameraSource.Camera` o `CameraSource.Photos` utilizando la API local robusta sin falsos diálogos.
- En el fallback Web, activa directamente un `<input type="file" />` dinámico embebido.

## 4. UI/UX: Descarga PDF Global Uniforme
- Se agregó transversalmente la funcionalidad nativa de descargar PDFs Masivos unificados dentro de un único archivo utilizando librerías nativas adaptativas para reportes filtrados desde la tabla principal del admin.
