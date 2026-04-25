# PLAN DE IMPLEMENTACION - IA OPERATIVA MACRIS

## 1. Objetivo General

Construir una IA operativa local para MACRIS capaz de entender instrucciones básicas del negocio en lenguaje natural, convertirlas en datos estructurados y ejecutar acciones reales sobre el sistema, empezando por la creación de órdenes y la gestión de agenda.

La IA no debe reemplazar la lógica del sistema. Debe actuar como una capa de interpretación, validación asistida y ejecución controlada.

## 2. Idea Principal del Producto

La herramienta será un asistente operativo especializado en MACRIS. Su función principal será:

1. recibir texto libre del usuario;
2. interpretar intención y entidades del negocio;
3. proponer un borrador estructurado;
4. validar contra datos reales del sistema;
5. pedir confirmación cuando exista ambigüedad;
6. ejecutar la acción en el módulo correspondiente.

Ejemplo:

`programa mantenimiento para IPS Medic principal tulua mañana 8 am con Frank en consultorio 2`

La IA deberá transformar eso en algo estructurado como:

- cliente: `IPS MEDIC`
- sede: `Principal Tulua`
- dependencia: `Consultorio 2`
- fecha: `2026-04-24`
- hora: `08:00`
- técnico: `Frank`
- tipo de servicio: `Mantenimiento Preventivo`

## 3. Principios de Diseño

### 3.1 La IA no inventa datos

Toda entidad relevante debe resolverse contra datos reales:

- empresas
- sedes
- dependencias
- técnicos
- equipos
- clientes residenciales

### 3.2 La lógica del negocio sigue siendo determinística

La IA interpreta. El sistema valida y decide.

### 3.3 Confirmación antes de acciones sensibles

Si el texto es ambiguo o incompleto, la IA debe pedir confirmación antes de crear o modificar registros.

### 3.4 Arquitectura escalable

La solución debe empezar funcionando en local, pero preparada para crecer si:

- mejora el hardware;
- se quiere centralizar el modelo;
- se quiere exponer a web y móvil;
- se quieren integrar más módulos del ecosistema MACRIS.

## 4. Alineación con la Arquitectura Actual de MACRIS

Este proyecto debe respetar la arquitectura documentada en:

- `sync_architecture_documentation.md`
- `GUIA_SISTEMA_MACRIS.md`

En particular, debe asumir como contratos canónicos:

- Empresa madre: `clients`
- Sede: `maintenance_companies`
- Dependencia: `maintenance_dependencies`

Y debe respetar siempre la jerarquía:

`Empresa -> Sede -> Dependencia`

Esto es crítico para evitar que la IA cree o interprete datos fuera de la estructura real del sistema.

## 5. Vision de Plataforma

La IA debe nacer como un nuevo núcleo funcional, no como una extensión rígida de una sola app existente.

La visión es construir una base que permita:

- escritorio local;
- web interna;
- móvil más adelante;
- integración con múltiples módulos;
- reemplazo del modelo de IA sin reescribir la lógica del negocio.

## 6. Arquitectura Recomendada

## 6.1 Capas

### Capa 1: Motor de IA local

Responsable de:

- interpretar lenguaje natural;
- extraer intención;
- extraer campos;
- clasificar tipo de acción.

No debe guardar datos ni hablar directo con la base de negocio.

### Capa 2: Motor de orquestación y reglas

Responsable de:

- normalizar los datos extraídos;
- resolver entidades del negocio;
- validar contra reglas reales;
- detectar ambigüedades;
- construir el comando operativo final.

### Capa 3: Adaptadores de integración

Responsable de hablar con los módulos existentes:

- Agenda
- Cotizaciones
- Reportes
- Admin Equipos

Cada adaptador debe exponer operaciones claras, por ejemplo:

- crear orden
- reprogramar orden
- buscar cliente
- resolver sede
- consultar equipos
- generar borrador de cotización

### Capa 4: Interfaces

Clientes que consumen el núcleo:

- escritorio local
- web interna
- móvil más adelante

## 6.2 Recomendación inicial de despliegue

La mejor ruta inicial es:

- backend local;
- interfaz web local;
- empaquetado desktop con Tauri para Windows.

Esto permite:

- velocidad de iteración;
- uso local;
- facilidad de expansión a otras plataformas.

## 7. Casos de Uso Iniciales

## 7.1 MVP obligatorio

Primer caso de uso:

### Crear una orden desde texto natural

Flujo:

1. usuario escribe una instrucción libre;
2. la IA interpreta intención y campos;
3. el sistema resuelve empresa, sede, dependencia, técnico y fecha;
4. se muestra una vista previa estructurada;
5. el usuario confirma;
6. se crea la orden en Agenda/Cotizaciones.

## 7.2 Casos de uso inmediatos posteriores

- reprogramar una orden;
- consultar agenda de un técnico;
- sugerir técnico disponible;
- crear borrador de cotización a partir de una necesidad escrita;
- buscar información de un cliente o sede;
- consultar historial básico de un equipo.

## 8. Integración con Modulos Existentes

## 8.1 Agenda

Integración esperada:

- crear órdenes;
- reprogramar servicios;
- consultar disponibilidad;
- validar fechas y técnicos;
- detectar conflictos básicos.

## 8.2 Cotizaciones

Integración esperada:

- crear borradores de cotización;
- convertir solicitudes en estructura comercial;
- relacionar órdenes y cotizaciones;
- usar clientes, sedes, dependencias y técnicos existentes.

## 8.3 Reportes

Integración esperada:

- leer historial operativo;
- usar observaciones para contexto;
- identificar reincidencias;
- resumir historial de mantenimiento;
- alimentar decisiones futuras de agenda o correctivo.

## 8.4 Admin Equipos

Integración esperada:

- resolver equipos por ID manual;
- cruzar cliente, sede y dependencia;
- leer periodicidad y último mantenimiento;
- usar cronograma para sugerir servicios pendientes.

## 8.5 Futuras integraciones

- Dashboard analítico
- Inventario/Insumos
- Portal clientes
- Asistente administrativo

## 9. Recomendación Tecnica Inicial

## 9.1 Proyecto nuevo

Crear un proyecto independiente. No incrustar la IA directamente dentro de una app existente.

Nombre sugerido:

`MACRIS-IA-Core`

## 9.2 Estructura sugerida

```text
MACRIS-IA-Core/
  docs/
  ai-engine/
  business-rules/
  integrations/
    agenda/
    cotizaciones/
    reportes/
    admin-equipos/
  shared/
  ui-web/
  ui-desktop/
  storage/
  tests/
```

## 9.3 Stack sugerido

- modelo local: `Ollama` o `llama.cpp`
- backend local: `FastAPI` o `Node`
- interfaz inicial: web responsive
- desktop: `Tauri`
- almacenamiento local: `SQLite`
- sincronización futura: cola local + adaptadores de sync

## 10. Estrategia de IA

## 10.1 No usar la IA como motor completo del negocio

La IA debe resolver tareas acotadas:

- extracción de campos;
- clasificación de intención;
- normalización de lenguaje natural;
- propuesta de borrador.

## 10.2 Apoyarse en catálogos reales

La rapidez y precisión vendrán de combinar:

- modelo local pequeño o mediano;
- catálogos reales del negocio;
- reglas determinísticas;
- confirmación de usuario.

## 10.3 Escalabilidad del modelo

La arquitectura debe permitir:

- comenzar con un modelo pequeño cuantizado;
- migrar a un modelo mayor si mejora el hardware;
- mover el modelo a un servidor local más potente si se requiere;
- mantener la misma capa de negocio aunque cambie el modelo.

## 11. Fases de Implementación

## Fase 0 - Definición

Objetivo:

- cerrar alcance funcional;
- definir contratos;
- definir permisos y trazabilidad;
- definir el primer flujo operativo.

Entregables:

- documento de alcance;
- contratos de datos canónicos;
- definición del primer caso de uso.

## Fase 1 - MVP de Agenda Inteligente

Objetivo:

- crear órdenes desde texto natural.

Entregables:

- campo de entrada de texto libre;
- parser asistido por IA;
- resolvedor de empresa/sede/dependencia/técnico;
- vista previa estructurada;
- confirmación y creación de orden.

Criterio de éxito:

- una instrucción común se transforma en una orden válida en pocos segundos;
- la IA no crea registros ambiguos sin confirmación.

## Fase 2 - Integración Operativa Real

Objetivo:

- conectar de forma robusta con Agenda y Cotizaciones.

Entregables:

- adaptadores de creación/consulta;
- validación de disponibilidad;
- reprogramación básica;
- historial mínimo de interacciones.

## Fase 3 - Robustez y Auditoría

Objetivo:

- volver la herramienta operativamente segura.

Entregables:

- logs de acciones;
- confirmación obligatoria en escenarios ambiguos;
- trazabilidad de qué entendió la IA y qué ejecutó;
- persistencia local;
- pruebas de regresión.

## Fase 4 - Integración con Reportes y Admin Equipos

Objetivo:

- enriquecer contexto operativo.

Entregables:

- consulta de historial de reportes;
- lectura de cronogramas y periodicidad;
- sugerencia de órdenes basadas en mantenimiento pendiente;
- lectura de incidencias recurrentes por equipo o sede.

## Fase 5 - Plataforma Unificada

Objetivo:

- extender la misma lógica a múltiples interfaces.

Entregables:

- desktop estable;
- web interna;
- móvil posterior;
- backend reusable;
- configuración central de integraciones.

## 12. Reglas Operativas Obligatorias

- La IA no debe escribir directamente en tablas sin pasar por reglas del negocio.
- La IA no debe crear entidades nuevas por inferencia débil.
- Toda entidad resuelta debe quedar anclada a la jerarquía canónica.
- Toda acción que modifique datos debe quedar auditada.
- El modelo puede cambiar; la lógica del negocio no debe depender de un modelo específico.

## 13. Riesgos Principales y Mitigación

## 13.1 Alucinación del modelo

Mitigación:

- validación determinística;
- confirmación antes de guardar;
- resolución contra catálogos reales.

## 13.2 Computador modesto

Mitigación:

- empezar con modelos 3B a 7B cuantizados;
- limitar contexto;
- tareas acotadas;
- reglas del negocio fuertes.

## 13.3 Datos legacy o inconsistentes

Mitigación:

- adaptadores canónicos;
- resolvedores con reglas uniformes;
- manejo explícito de ambigüedad.

## 13.4 Acoplamiento excesivo a una interfaz

Mitigación:

- separar núcleo, adaptadores e interfaz desde el principio.

## 14. Metricas Iniciales de Exito

- tiempo promedio para convertir texto en borrador estructurado;
- porcentaje de órdenes creadas sin corrección manual significativa;
- reducción del tiempo de digitación;
- porcentaje de resolución correcta de empresa/sede/dependencia;
- tasa de ambigüedad detectada antes de guardar.

## 15. Decision Estrategica Recomendada

La mejor forma de empezar es:

1. crear un proyecto nuevo;
2. construir primero el núcleo local;
3. usar una interfaz web local como primera UI;
4. empaquetar esa misma interfaz como desktop;
5. integrar después con web y móvil.

No conviene empezar amarrando toda la lógica a una sola app existente.

## 16. Siguiente Paso Inmediato

Construir el MVP de la Fase 1:

- nueva aplicación base;
- entrada de texto natural;
- resolución de cliente, sede, dependencia y técnico;
- vista previa estructurada;
- creación real de orden.

Ese debe ser el primer entregable ejecutable del proyecto.
