# Guía del Sistema MACRIS
## Cotizaciones · Reportes · Asistente

> **Versiones actuales:** Cotizaciones V31 · Reportes V17 · Asistente V13  
> **Stack:** TypeScript + Vite · Supabase (dos bases de datos) · Capacitor (Android para Reportes)

---

## Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [Modelo de Clientes: Empresa vs Residencial](#2-modelo-de-clientes-empresa-vs-residencial)
3. [Jerarquía: Empresa → Sede → Dependencia](#3-jerarquía-empresa--sede--dependencia)
4. [Empresas sin Sedes vs Empresas con Sedes](#4-empresas-sin-sedes-vs-empresas-con-sedes)
5. [Base de Datos: Cambios para Sedes](#5-base-de-datos-cambios-para-sedes)
6. [Aplicación: Cotizaciones (V31)](#6-aplicación-cotizaciones-v31)
7. [Clientes en Cotizaciones: Ver y Gestionar Sedes](#7-clientes-en-cotizaciones-ver-y-gestionar-sedes)
8. [Aplicación: Reportes (V17)](#8-aplicación-reportes-v17)
9. [Aplicación: Asistente (V13)](#9-aplicación-asistente-v13)
10. [Flujo Completo: De Cotización a Reporte](#10-flujo-completo-de-cotización-a-reporte)
11. [Sincronización Bidireccional Cotizaciones ↔ Reportes](#11-sincronización-bidireccional-cotizaciones--reportes)
12. [Preguntas y Aspectos Pendientes de Confirmar](#12-preguntas-y-aspectos-pendientes-de-confirmar)

---

## 1. Arquitectura General

El sistema MACRIS está compuesto por tres aplicaciones web/móvil independientes que comparten **dos bases de datos en Supabase**:

| Aplicación | Tipo | Propósito |
|---|---|---|
| **Cotizaciones (V31)** | Web (desktop/tablet) | Administración: cotizaciones, órdenes de servicio, clientes, catálogo |
| **Reportes (V17)** | Web + APK Android | Técnicos en campo: ver órdenes asignadas, crear reportes de mantenimiento |
| **Asistente (V13)** | Web (admin) | Panel de administración avanzado: reportes, equipos, estadísticas, IA |

### Bases de Datos Supabase

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│     DB Cotizaciones         │    │      DB Mantenimiento       │
│  (supabaseQuotes)           │    │   (supabaseOrders)          │
├─────────────────────────────┤    ├─────────────────────────────┤
│ clients                     │◄──►│ maintenance_companies       │
│ items                       │    │ maintenance_users           │
│ quotes                      │    │ maintenance_dependencies    │
│ quote_items                 │    │ maintenance_equipment       │
│ settings                    │    │ maintenance_reports         │
│                             │    │ maintenance_cities          │
│                             │    │ orders                      │
│                             │    │ order_items                 │
│                             │    │ order_technicians           │
│                             │    │ service_types               │
└─────────────────────────────┘    └─────────────────────────────┘
```

**Punto clave:** Las empresas tipo "empresa" en la tabla `clients` (DB Cotizaciones) se sincronizan automáticamente con `maintenance_companies` (DB Mantenimiento) **usando el mismo UUID**, lo que permite que ambas bases compartan la misma identidad de empresa sin duplicar información.

---

## 2. Modelo de Clientes: Empresa vs Residencial

La tabla `clients` en la DB Cotizaciones tiene un campo `category` que puede tomar dos valores:

### Cliente Residencial (`category: 'residencial'`)

Representa una **persona natural** — por ejemplo, alguien con un aire acondicionado en su casa o apartamento. Su estructura es sencilla:

| Campo | Descripción |
|---|---|
| `name` | Nombre del cliente |
| `address` | Dirección del servicio |
| `city` | Ciudad |
| `phone` | Teléfono de contacto |
| `email` | Correo electrónico |
| `contactPerson` | Persona de contacto (opcional) |

Un cliente residencial **nunca tiene sedes**. Cuando se le asigna una cotización u orden, los datos de ubicación (dirección, ciudad) se toman directamente del registro del cliente.

### Cliente Empresa (`category: 'empresa'`)

Representa una **persona jurídica o empresa** — hospitales, clínicas, centros comerciales, compañías, etc. que tienen uno o más equipos distribuidos en diferentes ubicaciones.

Características:
- Al guardar un cliente tipo "empresa" en Cotizaciones, el sistema lo sincroniza automáticamente a `maintenance_companies` en la DB Mantenimiento (usando el mismo UUID).
- Puede tener **cero o más sedes** asociadas.
- Los datos de dirección/ciudad de la empresa aplican solo cuando **no tiene sedes registradas**.

### Distinción visual en la UI

En la sección "Clientes" de Cotizaciones, cada cliente muestra un botón de color que indica su categoría:
- **Amarillo / casa** (`fa-home`): actualmente es Empresa → hacer clic cambia a Residencial.
- **Verde / edificio** (`fa-building`): actualmente es Residencial → hacer clic cambia a Empresa.

Los clientes Empresa también tienen un botón extra (azul, ícono edificio) para **añadir sedes directamente** desde el listado.

---

## 3. Jerarquía: Empresa → Sede → Dependencia

Para clientes tipo Empresa que operan en múltiples ubicaciones, el sistema maneja una jerarquía de tres niveles:

```
Empresa (Compañía Madre)
│   ← Registrada en: clients (DB Cotizaciones)
│   ← Sincronizada en: maintenance_companies (DB Mantenimiento)
│
├── Sede (Sucursal en una Ciudad)
│   ← Registrada en: maintenance_companies con client_id apuntando a la Empresa
│   ← Tiene: nombre, dirección, ciudad, contacto, teléfono
│
│   ├── Dependencia (Área o departamento dentro de la Sede)
│   │   ← Registrada en: maintenance_dependencies
│   │   ← Tiene: nombre, company_id (FK a maintenance_companies), sede_id
│   │
│   └── (más dependencias...)
│
└── (más sedes...)
```

**Ejemplo concreto:**
```
IPS Medic (Empresa)
├── Sede Buga
│   ├── Área de Urgencias
│   └── Consultorios
└── Sede Cali Norte
    ├── Quirófano 1
    └── Farmacia
```

En este ejemplo, `IPS Medic` existe en `clients` con `category: 'empresa'`, y sus dos sedes existen en `maintenance_companies` con `client_id` apuntando al UUID de `IPS Medic`.

---

## 4. Empresas sin Sedes vs Empresas con Sedes

Este es uno de los puntos más importantes del sistema. El comportamiento cambia según si una empresa tiene sedes registradas o no:

### Empresa SIN sedes

- El sistema **no muestra selector de sedes** en el formulario de cotización/orden.
- Los datos de ubicación (dirección, ciudad, contacto) se toman directamente del registro de la empresa en `clients`.
- `sede_id` queda como `null` en la cotización/orden.
- Funciona igual que antes de implementar la lógica de sedes.

### Empresa con UNA sola sede

- El sistema **asigna la sede automáticamente** (sin que el usuario tenga que elegir).
- Muestra la información de la sede inline (no muestra selector).
- `sede_id` se guarda automáticamente en la cotización/orden.
- Los datos de ubicación mostrados al técnico provienen de la sede.

### Empresa con MÚLTIPLES sedes

- El sistema muestra un **selector en cascada**: primero Ciudad → luego Sede.
- Al seleccionar la ciudad, se filtran solo las sedes de esa ciudad.
- Al seleccionar la sede, se muestra su información detallada (dirección, contacto, teléfono).
- `sede_id` se guarda en la cotización/orden.
- Los datos de ubicación en el reporte final provienen de la sede seleccionada.

### Regla de Fallback (Resiliencia)

El sistema siempre aplica un fallback en cascada para garantizar que nunca aparezca "N/A" si existe información:

```
Sede → datos de la Sede
  ↓ (si vacío)
Empresa → datos de la Empresa (clients)
  ↓ (si vacío)
"N/A"
```

Esto aplica para: dirección, ciudad, contacto, teléfono.

---

## 5. Base de Datos: Cambios para Sedes

### El rol dual de `maintenance_companies`

La tabla `maintenance_companies` en la DB Mantenimiento cumple **dos roles simultáneos**:

1. **Empresa sincronizada:** Cuando se crea/edita un cliente empresa en Cotizaciones, se crea un registro en `maintenance_companies` con el **mismo UUID**. Este registro representa la empresa raíz.

2. **Sede:** Cuando se crea una sede para una empresa, también se crea un registro en `maintenance_companies`, pero con un `client_id` que apunta al UUID de la empresa raíz. Este registro representa la sucursal.

La distinción entre ambos casos es el campo `client_id`:
- Si `client_id IS NULL` → es una empresa raíz (o un registro legacy).
- Si `client_id IS NOT NULL` → es una sede de la empresa indicada por `client_id`.

### Columnas nuevas añadidas

Para soportar la jerarquía sin romper registros antiguos, se añadieron columnas nullable a varias tablas:

| Tabla | Columnas añadidas | Propósito |
|---|---|---|
| `maintenance_companies` | `client_id`, `contact_person`, `phone` | Vincular sede a empresa madre; datos de contacto de la sede |
| `orders` | `sede_id` | Registrar la sede específica donde se ejecuta el servicio |
| `maintenance_reports` | `sede_id`, `client_id` | Snapshot de ubicación exacta donde se realizó el mantenimiento |
| `maintenance_equipment` | `sede_id`, `client_id` | Vincular equipo a sede y empresa raíz |
| `maintenance_dependencies` | `sede_id`, `client_id` | Vincular dependencia a sede y empresa raíz |
| `quotes` | `sede_id` | Vincular cotización a una sede específica |

Todas estas columnas son **nullable** para mantener compatibilidad total con registros anteriores que no tenían esta información.

### Sincronización de IDs (clave para entender el sistema)

Cuando se crea un cliente empresa en Cotizaciones:
```
clients.id = "abc-123-uuid"  ←── mismo UUID ──►  maintenance_companies.id = "abc-123-uuid"
```

Cuando se crea una sede para esa empresa:
```
maintenance_companies.id = "xyz-456-uuid" (nuevo UUID para la sede)
maintenance_companies.client_id = "abc-123-uuid" (apunta a la empresa madre)
```

### Compatibilidad con registros legacy

Los registros más antiguos (antes de la implementación de sedes) tienen `sede_id = null` y `client_id = null`. El sistema los maneja correctamente mediante el sistema de fallback descrito en la sección 4.

---

## 6. Aplicación: Cotizaciones (V31)

### Módulos principales

| Módulo | Archivo | Descripción |
|---|---|---|
| Estado global | `src/state.ts` | Variables en memoria: clientes, cotizaciones, órdenes, sedes, técnicos |
| API Cotizaciones | `src/api.ts` | CRUD contra ambas DBs en Supabase |
| Interfaz principal | `src/ui.ts` | Renderizado de todos los paneles, modales y formularios |
| PDFs | `src/pdf.ts` + `src/pdf-templates/` | Generación de cotizaciones y órdenes en PDF (plantillas: classic, modern, sleek, vivid) |
| Reportes admin | `src/ui-reports.ts` / `src/api-reports.ts` | Vista de reportes y órdenes desde el lado admin |
| Agenda | `src/ui.ts` (agenda functions) | Vista de calendario (mes/semana/día) para órdenes programadas |
| Autenticación | `src/auth.ts` | Login con roles: admin y user |

### Secciones de la interfaz

- **Cotizaciones:** Crear/editar cotizaciones con búsqueda de cliente, catálogo de insumos, IVA configurable, exportación PDF.
- **Órdenes:** Crear órdenes (desde cotización o desde cero), asignar técnicos, programar fecha/hora, gestión de estado (pendiente → en progreso → completada).
- **Clientes:** Listado con búsqueda, crear/editar clientes empresa y residenciales, gestión de sedes.
- **Catálogo:** Listado de insumos con precio, crear/editar.
- **Técnicos:** Listado de técnicos, crear/editar.
- **Agenda:** Vista de calendario con órdenes programadas.
- **Reportes:** Vista de reportes de mantenimiento generados por los técnicos.
- **Configuración:** Datos de empresa en PDF, plantilla PDF, IVA por defecto, tema visual.

### Flujo de creación de una Cotización/Orden con Sede

1. El usuario escribe el nombre del cliente en el buscador (busca en `clients` filtrando por `category`).
2. Al seleccionar el cliente, `renderClientDetails()` evalúa si es residencial o empresa.
3. Si es empresa, consulta `State.getSedes()` filtrando por `client_id === cliente.id`.
4. Según el número de sedes encontradas, aplica la lógica de 0/1/N sedes (ver sección 4).
5. Si hay múltiples sedes, el usuario elige ciudad → sede. Al elegir, se actualiza `quote.sede_id` o `order.sede_id`.
6. Al guardar, `sede_id` persiste en la DB.

---

## 7. Clientes en Cotizaciones: Ver y Gestionar Sedes

### Listado de Clientes

La función `renderClientsList()` en `src/ui.ts` genera la tabla de clientes con las columnas:

```
| Nombre (+ ID interno) | Contacto | Teléfono | Email | Acciones |
```

### Botones de Acción por Cliente

Cada fila tiene los siguientes botones en la columna "Acciones":

| Botón | Color | Descripción |
|---|---|---|
| ✏️ Editar (lápiz) | Gris | Abre modal para editar datos del cliente |
| 🏢 Añadir Sede (edificio) | Azul | **Solo aparece si `category === 'empresa'`**. Abre modal para crear una nueva sede asociada a esta empresa |
| 🔄 Toggle Categoría | Amarillo/Verde | Cambia el cliente entre Empresa y Residencial |
| 🗑️ Eliminar (basura) | Rojo | Elimina el cliente |

> **Nota importante:** El listado actual muestra los clientes de forma **plana** (sin expandir sedes debajo). Las sedes de una empresa no se listan en la tabla de Clientes; son accesibles al momento de crear cotizaciones/órdenes, o al registrar equipos en la aplicación Asistente.

### Crear o Editar una Sede

Al hacer clic en el botón "Añadir Sede" (o al editar una sede existente), se abre el modal con el formulario:

```
Empresa asociada:  [Select dropdown con todas las empresas]
Nombre de Sede:    [Input - Ej. "Principal", "Sucursal Norte"]
Encargado:         [Input - Persona de contacto]
Dirección:         [Input]
Ciudad:            [Select - ciudades de la DB Mantenimiento]
Teléfono:          [Input]
```

Al guardar, la sede se crea en `maintenance_companies` con `client_id` apuntando al UUID de la empresa.

### Búsqueda de Sedes

Las sedes están disponibles en el estado global (`State.getSedes()`) y se puede acceder a ellas filtrando por `client_id`:

```typescript
// Obtener todas las sedes de una empresa
const sedesDeEmpresa = State.getSedes().filter(s => s.client_id === empresaId);
```

---

## 8. Aplicación: Reportes (V17)

### Propósito y tecnología

Aplicación usada por los **técnicos en campo**. Disponible como:
- **Web app** (acceso desde cualquier navegador)
- **APK Android** (compilado con Capacitor)

### Módulos principales

| Módulo | Archivo | Descripción |
|---|---|---|
| Estado global | `src/state.ts` | Datos en memoria del técnico logueado, órdenes, reportes, empresas, sedes |
| API | `src/api.ts` | Consultas a ambas DBs, incluyendo sedes y órdenes |
| Interfaz | `src/ui.ts` | Tarjetas de órdenes, formulario de reporte, galería de fotos |
| Autenticación | `src/auth.ts` | Login por cédula/contraseña, sesión persistida en localStorage |
| Escáner QR | `src/qr-scanner.tsx` | Escanear QR de equipos para acceder a ficha técnica |
| Formulario PDF | `src/pdf-generator.tsx` | Generación de PDF del reporte de mantenimiento |

### Tarjetas de Órdenes (lógica de sede)

Cuando un técnico ve sus órdenes asignadas, cada tarjeta muestra la dirección y nombre del lugar de servicio. La lógica en `ui.ts` es:

```
Si orden.sede_id existe:
    → Mostrar: nombre del cliente + "- Sede " + sede.name
    → Dirección: sede.address (o fallback a cliente.address)
Si orden.sede_id es null:
    → Mostrar: nombre del cliente
    → Dirección: cliente.address
```

### Formulario de Nuevo Reporte (`openReportFormModal`)

Al crear un reporte desde una orden asignada:

1. El sistema lee `order.sede_id`.
2. **Auto-completa** el selector de Empresa (filtrando por `client_id` de la sede).
3. **Restringe** las ciudades disponibles a la ciudad de la sede.
4. **Auto-selecciona** la sede en el selector de Sede.
5. Muestra las dependencias disponibles para esa sede.

Si la orden no tiene `sede_id`, el formulario se pre-llena con los datos del cliente directamente.

### Resiliencia: Corrección de IDs corruptos

En versiones anteriores había un bug donde se guardaba el ID de la sede en el campo de empresa. Para corregir esto en reportes existentes, el sistema aplica un fallback en dos niveles al cargar un reporte previo para "repetirlo":

```typescript
// Nivel 1: Buscar por client_id (el campo correcto)
let companyIdToSelect = targetEquipment.client_id || targetEquipment.companyId;

// Nivel 2 FALLBACK: Si el ID no corresponde a ninguna empresa conocida,
// buscar por nombre para rescatar el ID correcto
if (companyIdToSelect && !State.companies.find(c => c.id === companyIdToSelect)) {
    if (targetEquipment.companyName) {
        const matched = State.companies.find(c => c.name === targetEquipment.companyName);
        if (matched) companyIdToSelect = matched.id;
    }
}
```

### Modal de Detalles del Reporte

Al ver un reporte en modo lectura, los campos mostrados incluyen explícitamente:

```
Empresa → Sede → Dependencia
```

La Sede aparece como campo visible entre Empresa y Dependencia.

---

## 9. Aplicación: Asistente (V13)

### Propósito

Panel de administración avanzado para el **administrador de MACRIS**. Acceso exclusivo por contraseña de admin.

### Módulos principales

| Módulo | Archivo | Descripción |
|---|---|---|
| Dashboard | `src/dashboard.ts` | Widgets de estadísticas: reportes del mes, técnicos activos, próximos mantenimientos |
| IA (Gemini) | `src/ai.ts` | Asistente conversacional que filtra y analiza reportes usando Google Gemini |
| Generador QR | `src/qr-bulk-generator.ts` | Generación masiva de etiquetas QR para equipos |
| Fusión empresas | `src/company-merge.ts` | Herramienta para fusionar registros duplicados de empresas |
| Limpieza de sedes | `src/sede-cleanup.ts` | Herramienta para limpiar sedes huérfanas o duplicadas |
| Backup | `src/backup.ts` | Exportar/importar datos del sistema |
| API | `src/api.ts` | Consultas de reportes, equipos, empresas, sedes, dependencias |

### Asistente IA

El módulo de IA usa **Google Gemini** para interpretar consultas en lenguaje natural del tipo:

- "Muéstrame los reportes de Comfandi del mes pasado"
- "¿Cuántos servicios hizo Juan este mes?"
- "Filtra los reportes de equipos tipo mini-split sin pagar"

**Lógica de desambiguación con sedes:**  
Si el usuario menciona "Comfandi" y hay múltiples sedes registradas, el sistema devuelve `requiresClarification: true` con una lista de las sedes exactas, para que el usuario seleccione cuál busca.

Las acciones posibles que devuelve la IA son: `filter`, `download_pdf`, `download_excel`, `build_dashboard`, `none`.

### Generador QR Masivo

Genera etiquetas QR en lote que pueden imprimirse y pegarse en los equipos. Cada QR contiene el identificador del equipo. Las etiquetas incluyen:
- Logo MACRIS (configurable)
- Leyenda personalizable
- Prefijo + número de serie
- Formato de salida: PNG individual o ZIP con todas las etiquetas

### Sede Cleanup (`sede-cleanup.ts`)

Herramienta de mantenimiento para identificar y limpiar registros de `maintenance_companies` que:
- Son sedes sin `client_id` asignado
- Tienen nombres duplicados dentro de la misma empresa
- Son huérfanos (sin dependencias ni equipos asociados)

### Company Merge (`company-merge.ts`)

Herramienta para fusionar dos registros de empresa que representan la misma entidad. Transfiere todos los equipos, dependencias y reportes al registro destino antes de eliminar el duplicado.

---

## 10. Flujo Completo: De Cotización a Reporte

```
[COTIZACIONES - Admin]
    1. Crear cliente Empresa → sincroniza a maintenance_companies
    2. Añadir sede(s) para la empresa → crea en maintenance_companies con client_id
    3. Crear cotización seleccionando empresa y sede
    4. Convertir cotización en Orden de Servicio
    5. Asignar técnico a la orden
    6. La orden se guarda con (clientId, sede_id)
              ↓
[REPORTES - Técnico en campo]
    7. Técnico ve la orden en su aplicación
    8. La tarjeta muestra dirección/nombre desde la sede (o cliente si no hay sede)
    9. Técnico crea reporte: empresa y sede se pre-llenan automáticamente
    10. Técnico registra equipos, observaciones, firma del cliente, fotos
    11. El reporte se guarda con (company_id, sede_id, client_id)
              ↓
[ASISTENTE - Admin]
    12. Admin consulta reportes filtrando por empresa/sede/técnico/fecha
    13. Genera PDF o Excel de los reportes
    14. Visualiza estadísticas en el dashboard
```

---

## 11. Sincronización Bidireccional Cotizaciones ↔ Reportes

La sincronización no es en tiempo real por sockets (no hay webhooks configurados); ambas apps leen de la misma DB Supabase. Lo que sí existe es **sincronización de esquema** al crear/editar entidades:

| Acción en Cotizaciones | Efecto en DB Mantenimiento |
|---|---|
| Crear cliente empresa | Upsert en `maintenance_companies` con mismo UUID |
| Editar cliente empresa | Upsert actualiza nombre en `maintenance_companies` |
| Crear sede | Insert en `maintenance_companies` con `client_id` |
| Crear/editar orden | Guarda `sede_id` en `orders` |

> **Nota:** Si se cambia la `category` de un cliente de "empresa" a "residencial", el registro en `maintenance_companies` **no se elimina automáticamente**. Solo se deja de sincronizar hacia adelante.

---

## 12. Preguntas y Aspectos Pendientes de Confirmar

Los siguientes puntos requieren confirmación del desarrollador para completar esta guía:

1. **Listado de Sedes en la sección Clientes:** Actualmente `renderClientsList()` muestra los clientes en una tabla plana. Las sedes no se listan directamente en esa vista. ¿Se desea agregar una fila expandible por empresa que muestre sus sedes? ¿O una columna adicional con conteo de sedes?

2. **Cambio de categoría empresa → residencial:** ¿Qué debe pasar con las sedes ya registradas si un cliente cambia de empresa a residencial? ¿Se desvinculan, se eliminan, o se mantienen como están?

3. **Sincronización de nombre:** Si se edita el nombre de una empresa en Cotizaciones, ¿se actualiza también el nombre en `maintenance_companies` (sedes hijas) o solo el registro raíz?

4. **Eliminación de cliente empresa:** Al eliminar una empresa en Cotizaciones, ¿deben eliminarse también sus sedes en `maintenance_companies`? Actualmente la lógica de `deleteClient` solo elimina de `clients`, no de `maintenance_companies`.

5. **Sedes en cotización:** ¿El PDF de cotización debe mostrar explícitamente el nombre de la sede? ¿O solo la dirección/ciudad de la sede?

---

*Guía generada el 2026-04-16 · Sistema MACRIS Refrigeración y Climatización*
