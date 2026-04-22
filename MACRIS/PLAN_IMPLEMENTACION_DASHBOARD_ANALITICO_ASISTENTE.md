# Plan de Implementacion: Dashboard Analitico en Asistente MACRIS

## 1. Objetivo

Potencializar la aplicacion de **Asistente** para que su dashboard no solo muestre reportes generales, sino que funcione como un centro de analisis operativo y comercial.

El objetivo es convertir los datos de **Agenda**, **Reportes**, **Ordenes** y **Cotizaciones** en indicadores utiles para tomar decisiones sobre:

- Planeacion de tecnicos.
- Carga operativa por ciudad, cliente y sede.
- Demanda por tipo de servicio.
- Reincidencias tecnicas.
- Conversion comercial de cotizaciones a ordenes.
- Clientes e items con mayor impacto.
- Margen estimado por tipo de servicio.

La implementacion debe hacerse dentro de **Asistente**, preferiblemente en el dashboard, sin afectar la operacion actual de Agenda, Reportes, Cotizaciones, Admin Equipos ni la vision de tecnico.

## 2. Alcance

El trabajo se concentrara en la aplicacion:

- `Asistente/V13`

El dashboard actual ya cuenta con una base importante:

- Vista de tabla y vista de dashboard.
- Widgets tipo KPI, grafica, tabla e insights.
- Constructor de dashboard con IA.
- Lectura de reportes mediante funciones existentes.

La propuesta es ampliar esa base para que el dashboard tenga dos nuevos bloques principales:

- **Planeacion de Tecnicos y Agenda**
- **Conversion de Cotizaciones**

## 3. Principio de implementacion

La aplicacion de Asistente debe consumir datos de otras aplicaciones, pero no debe duplicar ni modificar la logica principal de ellas.

La regla recomendada es:

- Agenda, Reportes y Cotizaciones siguen siendo las aplicaciones donde se crea la informacion.
- Asistente se convierte en la capa de analisis, visualizacion y recomendaciones.
- Los calculos deben centralizarse en servicios de analitica para evitar mezclar demasiada logica dentro de los componentes visuales.

## 4. Modulo A: Planeacion de Tecnicos y Agenda

Este modulo debe responder preguntas como:

- Cuantos servicios esta realizando cada tecnico.
- Que tan cargada esta la agenda por semana.
- Que ciudades concentran mas ordenes.
- Que clientes generan mas volumen de trabajo.
- En que dias y horas se concentra la demanda.
- Donde se estan repitiendo fallas o servicios con demasiada frecuencia.

### 4.1 Indicadores iniciales

#### Servicios por tecnico por semana

Medir cuantas ordenes, reportes o servicios completados tiene cada tecnico en cada semana.

Uso practico:

- Balancear cargas entre tecnicos.
- Detectar semanas saturadas.
- Ver si un tecnico esta recibiendo demasiadas ordenes frente a otros.
- Identificar capacidad disponible.

Visualizaciones recomendadas:

- Grafica de barras por tecnico.
- Grafica por semana.
- Tabla con tecnico, semana, servicios realizados y tipos de servicio.

Filtros:

- Rango de fechas.
- Tecnico.
- Ciudad.
- Tipo de servicio.
- Cliente.

#### Duracion promedio por tipo de servicio

Medir cuanto tiempo toma en promedio cada tipo de servicio.

Uso practico:

- Estimar mejor la duracion de futuras ordenes.
- Planear rutas y cargas diarias.
- Detectar servicios que toman mas tiempo de lo esperado.

Consideracion importante:

Si actualmente no existe hora real de inicio y hora real de finalizacion, la primera version no debe inventar duraciones. Se puede iniciar con una duracion estimada por tipo de servicio y luego mejorarla cuando se registren tiempos reales.

Campos recomendados a futuro:

- `started_at`
- `finished_at`
- `estimated_duration_minutes`
- `actual_duration_minutes`

Visualizaciones recomendadas:

- KPI de duracion promedio.
- Barras por tipo de servicio.
- Comparativo entre duracion estimada y duracion real.

#### Ordenes por ciudad

Medir cuantas ordenes se hacen por ciudad.

Uso practico:

- Planear disponibilidad por zona.
- Identificar ciudades con mayor demanda.
- Agrupar visitas por ubicacion.
- Anticipar necesidades de personal o transporte.

Visualizaciones recomendadas:

- Grafica de barras por ciudad.
- Mapa futuro si se desea georreferenciar.
- Tabla con ciudad, ordenes, clientes y sedes.

#### Clientes con mayor volumen

Medir que clientes generan mas servicios, ordenes o reportes.

Uso practico:

- Identificar clientes estrategicos.
- Priorizar seguimiento comercial.
- Detectar clientes con alta carga correctiva.
- Analizar rentabilidad por cliente.

Visualizaciones recomendadas:

- Top 10 clientes por cantidad de servicios.
- Top clientes por valor facturado o cotizado.
- Tabla con cliente, ciudad, sedes, servicios y tipos de servicio.

#### Dias y horas de mayor demanda

Medir en que dias de la semana y horas se crean, programan o cierran mas ordenes.

Uso practico:

- Ajustar disponibilidad del equipo.
- Evitar saturacion en franjas criticas.
- Planear mejor las rutas.
- Definir horarios de soporte reforzado.

Visualizaciones recomendadas:

- Mapa de calor por dia y hora.
- Grafica por dia de la semana.
- Grafica por hora del dia.

Primera version:

- Usar fecha/hora de creacion o programacion de la orden.

Version posterior:

- Diferenciar entre fecha de creacion, fecha programada, inicio real y cierre real.

#### Reincidencias por tecnico, equipo o sede

Medir cuando un equipo, sede o cliente recibe varios servicios similares en un periodo corto.

Uso practico:

- Detectar fallas repetitivas.
- Encontrar equipos problematicos.
- Identificar sedes con alto riesgo operativo.
- Analizar si hay servicios que requieren seguimiento.
- Evitar que una misma falla se atienda varias veces sin solucion de fondo.

Criterios sugeridos:

- Misma sede con varios correctivos en 30, 60 o 90 dias.
- Mismo equipo con varios reportes en un periodo corto.
- Mismo tipo de servicio repetido en el mismo cliente.
- Reincidencias asociadas a un tecnico solo como dato contextual, no como indicador sancionatorio.

Visualizaciones recomendadas:

- Tabla de alertas de reincidencia.
- Top sedes con mas reincidencias.
- Top equipos con mas reincidencias.
- Filtro por tecnico, sede, equipo, cliente y tipo de servicio.

## 5. Modulo B: Conversion de Cotizaciones

Este modulo debe convertir Cotizaciones en un motor comercial, permitiendo entender que se cotiza, que se convierte y donde se pierden oportunidades.

### 5.1 Indicadores iniciales

#### Cotizaciones creadas

Medir cuantas cotizaciones se crean en un periodo.

Uso practico:

- Ver actividad comercial.
- Comparar periodos.
- Medir volumen por cliente, ciudad o tipo de servicio.

Visualizaciones recomendadas:

- KPI de cotizaciones creadas.
- Grafica por semana o mes.
- Tabla por cliente y estado.

#### Cotizaciones convertidas en orden

Medir que porcentaje de cotizaciones termina en una orden.

Formula sugerida:

```text
conversion (%) = cotizaciones convertidas / cotizaciones creadas * 100
```

Uso practico:

- Medir efectividad comercial.
- Detectar tipos de servicio con baja conversion.
- Identificar clientes que cotizan mucho pero compran poco.

Requisito tecnico:

Debe existir una relacion confiable entre cotizacion y orden, por ejemplo:

- `orders.quote_id`
- `quotes.order_id`
- Estado de cotizacion equivalente a convertida.

Si esa relacion no existe o no es consistente, se debe crear antes de mostrar el porcentaje como dato oficial.

#### Tiempo promedio de conversion

Medir cuantos dias tarda una cotizacion en convertirse en orden.

Formula sugerida:

```text
tiempo de conversion = fecha de orden - fecha de cotizacion
```

Uso practico:

- Saber que tan rapido responde el mercado.
- Detectar cotizaciones que requieren seguimiento.
- Crear alertas para cotizaciones antiguas sin respuesta.

Visualizaciones recomendadas:

- KPI de dias promedio de conversion.
- Tabla de cotizaciones pendientes por antiguedad.
- Grafica por tipo de servicio o cliente.

#### Clientes que cotizan y no compran

Medir clientes que tienen cotizaciones creadas, pero no generan ordenes.

Formula sugerida:

```text
no compra (%) = clientes con cotizaciones no convertidas / clientes con cotizaciones * 100
```

Uso practico:

- Detectar oportunidades perdidas.
- Priorizar seguimiento comercial.
- Revisar precios, tiempos de respuesta o condiciones comerciales.

Visualizaciones recomendadas:

- Tabla de clientes con mayor cantidad de cotizaciones no convertidas.
- KPI de porcentaje de no conversion.
- Filtro por ciudad, cliente, vendedor, tipo de servicio y rango de fechas.

#### Items mas frecuentes

Medir los items que mas aparecen en cotizaciones.

Uso practico:

- Saber que productos o servicios se piden mas.
- Preparar inventario o proveedores.
- Optimizar listas de precios.
- Detectar oportunidades para paquetes comerciales.

Visualizaciones recomendadas:

- Top items cotizados.
- Top items convertidos.
- Comparativo entre item cotizado e item comprado.

#### Margen estimado por tipo de servicio

Medir margen aproximado por tipo de servicio.

Formula sugerida:

```text
margen estimado = valor cotizado - costo estimado
margen (%) = margen estimado / valor cotizado * 100
```

Consideracion importante:

Si la aplicacion aun no tiene costos reales por item, tecnico, desplazamiento o insumo, la primera version debe llamarse **utilidad estimada** o **margen estimado**, nunca margen real.

Campos recomendados:

- Costo estimado por item.
- Costo de mano de obra por tipo de servicio.
- Costo de desplazamiento.
- Costo de insumos.
- Valor cotizado.
- Valor final aprobado.

Visualizaciones recomendadas:

- Margen estimado por tipo de servicio.
- Margen estimado por cliente.
- Items con mayor utilidad estimada.
- Servicios con baja utilidad.

## 6. Arquitectura propuesta en Asistente

Para mantener el codigo ordenado, se recomienda crear una capa de analitica dentro de `Asistente/V13/src`.

Estructura sugerida:

```text
Asistente/V13/src/analytics/
  types.ts
  api.ts
  calculations.ts
  widgets.ts
  filters.ts
```

Responsabilidad de cada archivo:

- `types.ts`: tipos de datos para ordenes, reportes, cotizaciones, items, tecnicos y widgets.
- `api.ts`: funciones para traer datos desde Supabase.
- `calculations.ts`: calculos de metricas, porcentajes, agrupaciones y rankings.
- `widgets.ts`: definicion de widgets disponibles para el dashboard.
- `filters.ts`: logica compartida de filtros por fecha, ciudad, cliente, sede, tecnico y tipo de servicio.

El archivo actual del dashboard debe seguir siendo la capa visual, pero no deberia concentrar toda la logica de calculo.

## 7. Fuentes de datos necesarias

### 7.1 Para Planeacion de Tecnicos y Agenda

Datos requeridos:

- Ordenes.
- Reportes de mantenimiento.
- Tecnicos.
- Empresas/clientes.
- Sedes.
- Ciudades.
- Tipos de servicio.
- Fechas de creacion, programacion y cierre.
- Equipos cuando aplique.

Relaciones importantes:

- Orden -> Cliente.
- Orden -> Sede.
- Orden -> Ciudad.
- Orden -> Tecnico asignado.
- Orden -> Tipo de servicio.
- Reporte -> Orden.
- Reporte -> Equipo.

### 7.2 Para Conversion de Cotizaciones

Datos requeridos:

- Cotizaciones.
- Items de cotizacion.
- Clientes.
- Sedes cuando aplique.
- Orden asociada cuando la cotizacion se convierta.
- Estado de la cotizacion.
- Fecha de creacion.
- Fecha de aprobacion o conversion.
- Valor total.
- Costos estimados si existen.

Relaciones importantes:

- Cotizacion -> Cliente.
- Cotizacion -> Items.
- Cotizacion -> Orden.
- Cotizacion -> Tipo de servicio.

## 8. Vistas o consultas recomendadas

Para mejorar rendimiento y claridad, se pueden crear vistas SQL o funciones RPC en Supabase.

Vistas sugeridas:

```text
analytics_technician_weekly_load
analytics_service_duration_by_type
analytics_orders_by_city
analytics_top_clients_by_volume
analytics_demand_by_day_hour
analytics_recurrences_by_equipment_site
analytics_quote_conversion
analytics_quote_conversion_time
analytics_clients_quote_no_purchase
analytics_top_quoted_items
analytics_estimated_margin_by_service_type
```

Primera etapa:

- Los calculos pueden hacerse en TypeScript dentro de Asistente si el volumen de datos aun es manejable.

Etapa posterior:

- Mover calculos pesados a Supabase mediante vistas, RPC o materialized views.

## 9. Diseno del dashboard

Se recomienda dividir el dashboard en secciones o pestanas.

### 9.1 Resumen Ejecutivo

Indicadores principales:

- Servicios realizados.
- Cotizaciones creadas.
- Conversion de cotizaciones.
- Tecnico con mayor carga.
- Ciudad con mayor demanda.
- Cliente con mayor volumen.
- Reincidencias detectadas.

### 9.2 Operacion y Agenda

Widgets:

- Servicios por tecnico por semana.
- Ordenes por ciudad.
- Clientes con mayor volumen.
- Demanda por dia y hora.
- Duracion promedio por tipo de servicio.
- Reincidencias por sede/equipo.

### 9.3 Conversion Comercial

Widgets:

- Cotizaciones creadas.
- Porcentaje de conversion.
- Tiempo promedio de conversion.
- Clientes que cotizan y no compran.
- Items mas frecuentes.
- Margen estimado por tipo de servicio.

### 9.4 Alertas

Alertas recomendadas:

- Cliente con muchas cotizaciones sin convertir.
- Sede con alta reincidencia.
- Equipo con servicios repetidos.
- Tecnico con agenda saturada.
- Ciudad con aumento fuerte de demanda.
- Cotizacion sin seguimiento despues de cierto numero de dias.

## 10. Filtros globales

El dashboard debe permitir filtrar todos los indicadores por:

- Rango de fechas.
- Ciudad.
- Cliente.
- Sede.
- Tecnico.
- Tipo de servicio.
- Estado de orden.
- Estado de cotizacion.

Estos filtros deben estar disponibles de forma global para que el usuario pueda analizar el negocio desde distintos angulos.

## 11. Integracion con el constructor de dashboard con IA

El Asistente ya cuenta con una base para crear dashboards con IA. La implementacion debe ampliar esa capacidad para que pueda entender solicitudes como:

- "Muestrame la carga semanal por tecnico".
- "Que ciudades tienen mas ordenes este mes".
- "Que clientes cotizan pero no compran".
- "Cuales son los items mas cotizados".
- "Donde hay mas reincidencias por sede".
- "Cual es la conversion de cotizaciones a ordenes".

Para lograrlo se debe ampliar el esquema de metricas y dimensiones que entiende el constructor.

Metricas nuevas sugeridas:

- `services_count`
- `orders_count`
- `average_service_duration`
- `quote_count`
- `converted_quote_count`
- `quote_conversion_rate`
- `average_conversion_days`
- `no_purchase_rate`
- `recurrence_count`
- `estimated_margin`

Dimensiones nuevas sugeridas:

- `technician`
- `week`
- `city`
- `client`
- `site`
- `service_type`
- `equipment`
- `item`
- `weekday`
- `hour`
- `quote_status`

## 12. Fases de implementacion

### Fase 1: Dashboard descriptivo con datos existentes

Objetivo:

Crear los primeros indicadores sin cambiar la logica de las otras aplicaciones.

Tareas:

- Revisar tablas y relaciones reales disponibles.
- Crear capa `analytics` en Asistente.
- Implementar filtros globales.
- Implementar widgets de servicios por tecnico, ordenes por ciudad, clientes con mayor volumen e items mas frecuentes.
- Implementar cotizaciones creadas y conversion si la relacion cotizacion-orden ya existe.

Resultado:

Dashboard inicial util para seguimiento semanal y mensual.

### Fase 2: Normalizacion de datos faltantes

Objetivo:

Corregir o crear los campos necesarios para indicadores que requieren datos mas precisos.

Tareas:

- Confirmar o crear relacion confiable entre cotizacion y orden.
- Definir fechas de conversion.
- Definir campos de duracion real o estimada.
- Definir costos estimados para margen.
- Normalizar ciudad, sede y cliente en las fuentes necesarias.

Resultado:

Indicadores comerciales y operativos mas confiables.

### Fase 3: Alertas inteligentes

Objetivo:

Pasar de solo visualizar datos a generar alertas utiles.

Tareas:

- Alertar cotizaciones antiguas sin conversion.
- Alertar reincidencias por equipo, sede o cliente.
- Alertar sobrecarga de tecnicos.
- Alertar servicios que se repiten demasiado pronto.
- Alertar ciudades con aumento anormal de demanda.

Resultado:

Asistente empieza a funcionar como herramienta de seguimiento proactivo.

### Fase 4: Ciencia de datos y recomendaciones

Objetivo:

Usar historicos para generar recomendaciones y predicciones.

Tareas:

- Predecir demanda por ciudad y tipo de servicio.
- Recomendar tecnicos segun carga, ciudad y especialidad.
- Estimar probabilidad de conversion de una cotizacion.
- Detectar clientes con riesgo de no compra.
- Detectar equipos o sedes con probabilidad de falla recurrente.
- Sugerir rutas o agrupaciones de visitas por ciudad/sede.

Resultado:

Asistente se convierte en una capa de inteligencia operativa y comercial.

## 13. Validaciones necesarias

Antes de considerar terminada la implementacion se debe validar:

- Que el dashboard cargue sin afectar la vista de tabla.
- Que los filtros no rompan widgets existentes.
- Que los totales coincidan con conteos manuales o consultas SQL.
- Que los porcentajes de conversion usen una relacion real entre cotizacion y orden.
- Que no se muestre margen real si solo existe margen estimado.
- Que la vision de tecnico en Reportes no cambie.
- Que el build de Asistente compile correctamente.

## 14. Riesgos y controles

### Riesgo: datos incompletos de duracion

Control:

No mostrar duracion real si no existen fecha/hora de inicio y finalizacion. Usar "duracion estimada" hasta tener datos reales.

### Riesgo: conversion de cotizaciones mal calculada

Control:

No asumir conversion solo por nombre de cliente o valor. Debe existir relacion directa entre cotizacion y orden o un estado confiable.

### Riesgo: margen estimado confundido con margen real

Control:

Nombrar claramente el indicador como "margen estimado" mientras no existan costos reales completos.

### Riesgo: ranking de tecnicos mal interpretado

Control:

Presentar carga, tiempos y reincidencias como contexto operativo, no como evaluacion aislada de desempeno.

### Riesgo: dashboard lento

Control:

Empezar con calculos en frontend solo si el volumen es bajo. Si crece, mover agregaciones a vistas o RPC en Supabase.

## 15. Resultado esperado

Al finalizar, el dashboard de Asistente debe permitir responder rapidamente:

- Que tecnico tiene mas carga esta semana.
- Que ciudad tiene mas ordenes.
- Que clientes generan mas trabajo.
- Que dias y horas tienen mayor demanda.
- Donde se estan repitiendo fallas.
- Cuantas cotizaciones se estan creando.
- Que porcentaje se convierte en orden.
- Que clientes cotizan y no compran.
- Que items se cotizan mas.
- Que tipos de servicio dejan mejor margen estimado.

Con esto, Asistente dejaria de ser solo un visor o apoyo conversacional y pasaria a ser una herramienta real de direccion operativa y comercial para MACRIS.
