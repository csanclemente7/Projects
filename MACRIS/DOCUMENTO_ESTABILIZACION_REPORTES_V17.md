# Documento de Estabilizacion de Reportes V17

## 1. Objetivo

Definir, con el mayor nivel de detalle posible, que se debe corregir en la aplicacion **Reportes V17** para:

- corregir errores reales ya detectados,
- prevenir errores futuros,
- fortalecer la logica de sincronizacion y ubicacion,
- mejorar rendimiento en tecnico y administracion,
- y hacerlo **sin alterar la logica funcional vigente del sistema MACRIS**.

Este documento no propone redisenar el producto. Propone **endurecer** lo que ya existe.

---

## 2. Fuentes de verdad que este documento respeta

Este plan se apoya en dos documentos ya existentes en el proyecto:

- `GUIA_SISTEMA_MACRIS.md`
- `sync_architecture_documentation.md`

De esos documentos se desprenden reglas que se consideran **canonicas** y no deben romperse.

---

## 3. Reglas canonicas que NO se deben romper

### 3.1 Modelo de negocio base

El sistema MACRIS ya no maneja una sola nocion plana de "empresa". El modelo correcto es:

- **Cliente residencial**
- **Cliente empresa**
  - Empresa madre
  - Sede
  - Dependencia

### 3.2 Fuente de verdad de la empresa madre

La empresa madre vive en `clients` y, cuando es `category = 'empresa'`, se sincroniza a `maintenance_companies` con el **mismo UUID**.

Eso implica:

- `clients` sigue siendo la identidad comercial raiz.
- `maintenance_companies` cumple doble rol:
  - empresa raiz sincronizada,
  - sede hija cuando `client_id` apunta a la empresa madre.

### 3.3 Jerarquia operativa correcta

La estructura correcta del sistema es:

```text
Empresa madre (client_id real)
  -> Sede (sede_id, cuando exista)
    -> Dependencia
```

### 3.4 Regla para empresas sin sedes

Si una empresa no tiene sedes:

- la orden puede existir sin `sede_id`,
- el reporte puede existir sin `sede_id`,
- la dependencia puede quedar asociada directamente a la empresa madre,
- la UI debe usar los datos del cliente como fallback.

### 3.5 Fallback obligatorio

Si existe `sede_id`, la ubicacion visible debe priorizar:

```text
Sede -> Cliente empresa -> N/A
```

Si no existe `sede_id`, se debe usar:

```text
Cliente empresa -> N/A
```

Para cliente residencial:

```text
Cliente residencial -> N/A
```

### 3.6 Compatibilidad con datos legacy

El sistema ya tuvo un bug historico donde en algunos casos el ID de sede termino guardado como si fuera ID de empresa. Por eso:

- no se puede suponer que todos los registros historicos estan limpios,
- no se pueden hacer cambios destructivos de lectura,
- toda correccion debe mantener compatibilidad con rescate por `client_id`, `companyId`, `companyName` y fallbacks existentes.

---

## 4. Principio rector del plan

La prioridad no es "limpiar codigo por gusto". La prioridad es:

1. preservar la logica funcional actual,
2. reparar las zonas fragiles,
3. unificar criterios internos,
4. reducir probabilidad de corrupcion futura,
5. mejorar rendimiento sin cambiar el resultado funcional.

---

## 5. Riesgos verificados hoy en Reportes V17

Esta seccion resume las zonas fragiles reales observadas en el codigo de `Reportes/V17/reportes-app`.

### 5.1 Flujo de sedes inconsistente

Riesgo:

- `auth.ts` usa `fetchSedes()` en el refresh de catalogos en segundo plano.
- pero esa pieza quedo fragil y puede interrumpir la actualizacion completa de catalogos si falla.
- ademas, la persistencia local de `sedes` no esta cerrada de forma consistente en IndexedDB.

Impacto:

- sedes desactualizadas,
- fallas en empresas multisede,
- formularios que muestran empresa correcta pero sede incorrecta,
- offline inconsistente.

### 5.2 El modelo interno de Dependencia en Reportes colapsa conceptos

Hoy, al leer dependencias, `Reportes` mapea algo equivalente a:

- `companyId = dbDependency.company_id || dbDependency.client_id`
- `sedeId = dbDependency.sede_id || null`

Eso significa que el frontend de Reportes pierde una distincion importante:

- a veces `companyId` representa la sede,
- a veces representa la empresa raiz,
- a veces representa un fallback por compatibilidad.

Impacto:

- ambiguedad al abrir formularios,
- validaciones dificiles,
- riesgo de asociar una dependencia a un destino incorrecto,
- dificultad para garantizar consistencia en multisede.

### 5.3 Guardado ambiguo de dependencias

En el guardado de dependencias en Reportes, la logica actual usa un campo de formulario `company_id` que, segun el contexto, puede representar:

- una empresa raiz,
- una sede,
- o un destino ambiguo.

Ademas, existe un camino donde el codigo intenta guardar:

- `client_id = empresa raiz`
- `company_id = null`

Eso es funcionalmente fragil, porque:

- no coincide claramente con la convencion usada en Cotizaciones,
- complica la sincronizacion offline,
- dificulta construir restricciones claras,
- deja la semantica de `company_id` poco definida.

### 5.4 Sincronizacion offline de dependencias incompleta

La capa de `sync.ts` para entidades offline:

- remapea `company_id` local a server ID,
- pero no trata con el mismo rigor `client_id` y `sede_id`,
- y la deteccion de duplicados para dependencias se apoya en `name + company_id`.

Eso es insuficiente en un modelo donde la unicidad real depende tambien de:

- empresa madre,
- sede,
- y nombre normalizado.

Impacto:

- duplicados silenciosos,
- falsa deteccion de "ya existe",
- mala conciliacion de entidades creadas offline,
- errores si una dependencia de empresa sin sede y otra de empresa con sede comparten nombre.

### 5.5 Autosave demasiado agresivo

El formulario de reporte guarda draft en cada `input` y `change`, recorriendo todo el form y escribiendo en `localStorage`, que es sincrono.

Impacto:

- lag visible al escribir,
- peor experiencia en Android de gama baja,
- sensacion de app pesada justo en el flujo mas importante del tecnico.

### 5.6 Exceso de timers y refresh duplicado

Para tecnico conviven:

- sync de cola,
- polling de ordenes,
- refresh de reportes,
- refresh de catalogos.

Ademas, el refresh de reportes vuelve a disparar actualizacion de ordenes, generando solapamiento.

Impacto:

- mas bateria,
- mas consumo de red,
- mas escrituras en IndexedDB,
- mas comparaciones de estado,
- y mayor riesgo de condiciones de carrera suaves.

### 5.7 Cache local demasiado ruidoso y costoso

`cacheAllData()` hace `clear + put masivo` y el codigo loguea lecturas y escrituras rutinarias en IndexedDB.

Impacto:

- mas costo de I/O local,
- mas ruido en WebView,
- mas CPU consumida en operaciones que deberian ser silenciosas.

### 5.8 Comparacion de ordenes costosa

`serializeOrders()` compara ordenes con `JSON.stringify`, ordenamientos y composicion de campos.

Eso es mejor que comparar objetos enteros sin control, pero sigue siendo pesado si se ejecuta muchas veces.

Impacto:

- costo de CPU innecesario,
- mas trabajo en cada polling,
- mas presion sobre dispositivos moviles.

### 5.9 Falta de definicion unica para dependencias en empresas sin sedes

El sistema ya acepta, por logica de negocio, que una empresa sin sedes tenga dependencias directas a la empresa madre.

El problema no es el negocio. El problema es que hay que dejar una unica convencion de almacenamiento y de lectura, o la aplicacion seguira resolviendo esos casos de forma distinta segun modulo.

---

## 6. Prioridades de correccion

Este es el orden recomendado para trabajar sin romper la aplicacion.

### Prioridad 1

Blindar la jerarquia `Empresa madre -> Sede -> Dependencia` y reparar el flujo de `sedes`.

### Prioridad 2

Normalizar la semantica de dependencias y su compatibilidad con empresas sin sedes.

### Prioridad 3

Fortalecer sincronizacion y compatibilidad con datos legacy.

### Prioridad 4

Mejorar rendimiento de tecnico sin alterar la funcionalidad.

---

## 7. Plan detallado de correccion

## 7.1 Reparar por completo el circuito de Sedes en Reportes

### Problema a resolver

`Reportes` depende de `sedes` para:

- renderizar ordenes con ubicacion correcta,
- prellenar formulario de reporte desde una orden,
- mostrar dependencias correctas,
- aplicar el fallback correcto,
- y preservar el modelo multisede.

Si el flujo de `sedes` falla, la app puede seguir "funcionando", pero empieza a mezclar empresa, sede y dependencia.

### Que se debe hacer

1. Verificar y corregir la importacion de `fetchSedes` en todos los puntos de auto-refresh y post-login donde aplique.
2. Agregar `sedes` como store formal y soportada en la capa de IndexedDB de Reportes.
3. Confirmar que `cacheAllData('sedes', ...)` y `getAllFromStore('sedes')` funcionen sin ambiguedad.
4. Asegurar que el login tecnico, login admin y fallback offline carguen `sedes` de forma consistente.
5. Confirmar que el refresh en background no se rompa completo si `sedes` falla.

### Que NO se debe cambiar

- no cambiar la regla 0 / 1 / N sedes,
- no quitar el fallback a datos de cliente,
- no cambiar la estructura visual del tecnico,
- no eliminar compatibilidad con ordenes viejas sin `sede_id`.

### Validaciones obligatorias

- empresa sin sedes sigue funcionando igual,
- empresa con una sede sigue autoseleccionando,
- empresa con varias sedes sigue filtrando ciudad -> sede,
- orden vieja sin `sede_id` sigue mostrando datos del cliente,
- orden nueva con `sede_id` sigue mostrando datos de la sede.

---

## 7.2 Separar semanticamente empresa raiz, sede y dependencia dentro del modelo interno

### Problema a resolver

La app hoy reutiliza campos ambiguos para representar destinos distintos.

En especial, el modelo interno de `Dependency` en Reportes no expresa claramente:

- `client_id` como empresa madre real,
- `sede_id` como sede exacta,
- `company_id` como referencia tecnica en `maintenance_companies`.

### Que se debe hacer

1. Extender el modelo interno de dependencias para conservar por separado:
   - `clientId`
   - `sedeId`
   - `companyRefId` o equivalente tecnico
2. Evitar que el frontend siga colapsando `company_id || client_id` dentro de una sola propiedad ambigua.
3. Centralizar la resolucion de identidad de ubicacion en helpers dedicados.

### Helpers recomendados

Crear utilidades como:

```text
resolveRootClientId(...)
resolveSedeId(...)
resolveDependencyScope(...)
resolveDisplayLocation(...)
isDependencyCompatibleWithSelection(...)
```

### Que NO se debe cambiar

- no cambiar la estructura de base de datos en la primera fase,
- no romper lecturas de datos antiguos,
- no eliminar el fallback por nombre en registros danados.

### Beneficio

Esto no cambia el negocio. Solo evita que la app siga resolviendo con heuristicas dispersas algo que debe ser centralizado.

---

## 7.3 Definir una convencion unica para dependencias

### Problema a resolver

Hoy la misma idea de "dependencia" puede quedar representada de forma distinta segun modulo.

### Convencion recomendada

#### Caso A: empresa con sedes

La dependencia debe guardar:

- `client_id = empresa madre real`
- `sede_id = sede exacta`
- `company_id = referencia al registro de sede en maintenance_companies`

#### Caso B: empresa sin sedes

La dependencia debe guardar:

- `client_id = empresa madre real`
- `sede_id = null`
- `company_id = registro raiz sincronizado en maintenance_companies` con el mismo UUID del cliente

### Nota importante

Aunque historicamente haya registros con `company_id = null` para dependencias directas a empresa, esa forma debe tratarse como **legacy tolerado**, no como la convencion futura.

### Que se debe hacer

1. Documentar esta convencion dentro del codigo de Reportes.
2. Ajustar la capa de guardado para seguir una sola convencion.
3. Mantener la lectura compatible con:
   - registros correctos nuevos,
   - registros legacy con `company_id = null`,
   - registros con `company_id` danado.

### Que NO se debe hacer

- no lanzar de inmediato una migracion destructiva,
- no asumir que todos los datos actuales cumplen ya la convencion.

---

## 7.4 Endurecer validaciones de dependencia por ambito correcto

### Problema a resolver

La dependencia no debe validarse solo por nombre global ni solo por empresa.

### Regla correcta

#### Empresa con sedes

Se debe permitir:

- `Urgencias` en Sede Buga
- `Urgencias` en Sede Cali Norte

No se debe permitir:

- dos veces `Urgencias` dentro de la misma sede si funcionalmente representan lo mismo.

#### Empresa sin sedes

La dependencia debe ser unica por empresa madre cuando `sede_id = null`.

### Regla de unicidad funcional recomendada

- con sede: unico por `client_id + sede_id + nombre normalizado`
- sin sede: unico por `client_id + nombre normalizado` cuando `sede_id is null`

### Que se debe hacer

1. Cambiar las validaciones del frontend y backend local para usar el ambito correcto.
2. Ajustar deteccion de duplicados en sincronizacion offline.
3. No asumir que `company_id` por si solo define el alcance correcto.

### Validacion critica

Si el usuario cambia la sede seleccionada en un formulario:

1. la dependencia actual debe limpiarse,
2. la lista de dependencias debe recargarse,
3. no se debe permitir guardar una dependencia de otra sede.

---

## 7.5 Fortalecer compatibilidad con datos legacy y datos corruptos

### Problema a resolver

Ya existe evidencia de registros historicos donde el ID guardado en el campo de empresa en realidad correspondia a una sede.

### Que se debe hacer

1. Mantener la logica de rescate actual basada en:
   - `client_id`,
   - `companyId`,
   - `companyName`
2. Llevar esa logica a helpers reutilizables y no dejarla dispersa.
3. Aplicar la misma filosofia de rescate en:
   - repeticion de datos,
   - precarga de formularios,
   - render de ordenes,
   - render de reportes,
   - resolucion de equipos.
4. Agregar trazas controladas de diagnostico solo en errores reales, no en flujo rutinario.

### Objetivo

Que la app siga rescatando historicos danados sin romper registros nuevos limpios.

---

## 7.6 Corregir el autosave sin tocar la logica de borrador

### Problema a resolver

El problema no es tener draft. El problema es **cuando** y **cuanto** se guarda.

### Que se debe hacer

1. Aplicar `debounce` al autosave de 600 ms.
2. Evitar guardar mientras el usuario sigue escribiendo continuamente.
3. Mantener el mismo contenido del draft.
4. Conservar `restoreDraft()` y `clearDraft()` tal como funcionan hoy, salvo ajustes minimos si el debounce lo exige.
5. Eliminar trabajo innecesario como construir estructuras no usadas dentro del guardado.

### Que NO se debe cambiar

- no quitar autosave,
- no mover el draft a otra tecnologia si no es necesario,
- no cambiar el comportamiento visible para el tecnico.

### Resultado esperado

Misma logica funcional, menos lag.

---

## 7.7 Racionalizar timers y refresh sin alterar la experiencia funcional

### Problema a resolver

Hay trabajo redundante de sincronizacion y polling.

### Que se debe hacer

1. Subir el sync periodico del tecnico de 30s a 60s.
2. Evitar que el refresh de reportes vuelva a refrescar ordenes si ya existe polling de ordenes dedicado.
3. Mantener el refresh de catalogos separado, pero con control de visibilidad y de concurrencia.
4. Confirmar que no se disparen varios procesos equivalentes sobre el mismo estado en paralelo.

### Que NO se debe cambiar

- no quitar la sincronizacion offline,
- no quitar el polling del tecnico si es la estrategia elegida,
- no depender exclusivamente de realtime si en campo no es estable.

### Resultado esperado

Mismo resultado funcional con menor consumo de red, CPU y bateria.

---

## 7.8 Reducir costo y ruido de IndexedDB

### Problema a resolver

El cache local esta cumpliendo su funcion, pero esta haciendo demasiado ruido y trabajo rutinario.

### Que se debe hacer

1. Quitar `console.log` de lecturas y escrituras rutinarias de IndexedDB.
2. Mantener solo:
   - errores,
   - warnings relevantes,
   - logs de migracion o fallos serios.
3. Revisar el patron `clear + insert masivo` para que no se ejecute donde no es necesario.
4. Si no se cambia aun la estrategia de cache, al menos reducir la frecuencia con que se dispara.

### Que NO se debe hacer

- no eliminar el cache offline,
- no introducir una reescritura completa de almacenamiento local en esta fase.

---

## 7.9 Aligerar comparacion de ordenes sin volverla ciega

### Problema a resolver

La comparacion actual detecta cambios, pero es costosa.

### Que se debe hacer

1. Mantener una comparacion semantica.
2. Reducir el payload comparado a campos realmente relevantes.
3. Incluir, como minimo:
   - `id`
   - `status`
   - `service_date`
   - `service_time`
   - tecnicos asignados
   - items y cantidades
   - `sede_id`

### Que NO se debe hacer

- no comparar solo IDs,
- no ignorar `sede_id`,
- no ignorar cambios de estado o asignacion.

### Resultado esperado

Menor costo de CPU sin perder deteccion real de cambios.

---

## 7.10 Corregir sincronizacion offline de dependencias y entidades relacionadas

### Problema a resolver

La cola offline hoy entiende bien algunas relaciones, pero no todas las variantes del modelo jerarquico.

### Que se debe hacer

1. Revisar remapeo de IDs locales para dependencias considerando:
   - `client_id`
   - `company_id`
   - `sede_id`
2. Revisar la deteccion de duplicados offline para dependencias con las mismas reglas de ambito del sistema real.
3. Confirmar que una dependencia creada offline para empresa sin sede no falle al sincronizar.
4. Confirmar que una dependencia creada offline para empresa con sede termine vinculada a la sede correcta.

### Que NO se debe cambiar

- no quitar la cola offline,
- no quitar soporte a creacion offline si hoy existe.

---

## 8. Secuencia recomendada de implementacion

## Fase 1 - Hotfixes de muy bajo riesgo

Objetivo:

Corregir lo urgente sin mover el modelo.

Incluye:

- reparar flujo de `sedes`,
- arreglar persistencia local de `sedes`,
- debounce en autosave,
- quitar logs calientes de IndexedDB,
- subir sync a 60s,
- cortar refresh duplicado de ordenes.

## Fase 2 - Integridad jerarquica interna

Objetivo:

Dejar de mezclar empresa raiz, sede y dependencia a nivel de modelo interno.

Incluye:

- extender tipos internos,
- agregar helpers de resolucion,
- normalizar guardado de dependencias,
- mantener compatibilidad con legacy.

## Fase 3 - Robustez offline y duplicados

Objetivo:

Asegurar que la cola offline entienda la jerarquia real.

Incluye:

- remapeo correcto de IDs,
- duplicados por ambito,
- pruebas de sincronizacion real con entidades nuevas.

## Fase 4 - Endurecimiento optativo en base de datos

Objetivo:

Solo despues de auditar datos reales, introducir restricciones mas fuertes.

Incluye, si se valida previamente:

- indices unicos parciales,
- scripts de saneamiento de legacy,
- reportes de inconsistencia para administracion.

Importante:

Esta fase no debe ejecutarse primero.

---

## 9. Archivos probables a intervenir

Este documento no aplica cambios, pero la zona de trabajo esperada es:

```text
Reportes/V17/reportes-app/src/auth.ts
Reportes/V17/reportes-app/src/api.ts
Reportes/V17/reportes-app/src/ui.ts
Reportes/V17/reportes-app/src/events.ts
Reportes/V17/reportes-app/src/main.ts
Reportes/V17/reportes-app/src/form-autosave.ts
Reportes/V17/reportes-app/src/lib/local-db.ts
Reportes/V17/reportes-app/src/lib/sync.ts
Reportes/V17/reportes-app/src/types.ts
Reportes/V17/reportes-app/src/utils.ts
```

Si se crean utilidades nuevas, se recomienda encapsular la logica jerarquica en un modulo dedicado, por ejemplo:

```text
Reportes/V17/reportes-app/src/location-resolution.ts
```

---

## 10. Matriz minima de pruebas obligatorias

Antes de dar cualquier cambio por terminado, se debe probar al menos esto.

### Caso 1 - Cliente residencial

- crear orden,
- ver tarjeta en tecnico,
- crear reporte,
- confirmar que no exige sede ni dependencia de empresa.

### Caso 2 - Empresa sin sedes

- crear orden,
- confirmar que no aparece selector de sedes,
- crear dependencia directa a empresa,
- crear reporte,
- verificar fallback al cliente.

### Caso 3 - Empresa con una sede

- crear orden,
- confirmar autoseleccion de sede,
- abrir reporte desde la orden,
- verificar sede y dependencias correctas.

### Caso 4 - Empresa con multiples sedes

- seleccionar ciudad,
- seleccionar sede,
- comprobar que solo aparecen dependencias de esa sede,
- guardar reporte,
- verificar que `client_id` y `sede_id` quedan correctos.

### Caso 5 - Mismo nombre de dependencia en dos sedes distintas

- crear `Urgencias` en Sede A,
- crear `Urgencias` en Sede B,
- confirmar que ambas conviven,
- confirmar que el tecnico solo ve la que corresponde a la sede seleccionada.

### Caso 6 - Cambio de sede en formulario

- seleccionar dependencia,
- cambiar sede,
- confirmar que la dependencia previa se limpia y se recalcula.

### Caso 7 - Registro legacy danado

- usar un reporte/equipo historico con ID de sede en el campo equivocado,
- confirmar que la app rescata correctamente empresa y sede.

### Caso 8 - Offline tecnico

- iniciar con datos locales,
- crear o editar datos permitidos offline,
- reconectar,
- confirmar que sincroniza sin duplicar ni corromper jerarquia.

### Caso 9 - Rendimiento de escritura

- escribir observaciones largas en Android,
- verificar que desaparece el lag fuerte,
- confirmar que el draft sigue restaurando.

### Caso 10 - Regresion general

- login tecnico,
- login admin,
- ver ordenes,
- ver reportes,
- crear reporte desde orden,
- repetir datos,
- revisar detalles del reporte.

---

## 11. Cambios que explicitamente NO se recomiendan en esta etapa

Para no romper produccion, no se recomienda hacer esto primero:

- redisenar todas las tablas,
- eliminar compatibilidad con legacy,
- eliminar campos actuales por parecer redundantes,
- depender exclusivamente de realtime,
- mover todo el cache offline a otra tecnologia,
- imponer indices unicos duros sin auditar datos actuales,
- reemplazar la logica de fallback por una logica estricta que rechace historicos.

---

## 12. Resultado esperado

Si este plan se ejecuta bien, `Reportes V17` deberia quedar:

- mas estable,
- mas coherente con la arquitectura real de `clients + sedes + dependencias`,
- mas compatible con historicos,
- mas rapida en dispositivos moviles,
- menos expuesta a corrupcion silenciosa,
- y sin alterar la experiencia funcional que hoy ya usa el equipo tecnico.

---

## 13. Conclusiones ejecutivas

La mejora mas importante no es visual. Es conceptual:

**Reportes debe dejar de resolver con ambiguedad lo que el negocio ya definio con claridad.**

Esa claridad es:

- `client_id` identifica la empresa madre real,
- `sede_id` identifica la ubicacion fisica exacta cuando existe,
- la dependencia debe validarse dentro de ese ambito,
- y el sistema debe seguir siendo tolerante con historicos viejos o parcialmente corruptos.

La estrategia correcta no es reescribir la aplicacion. Es:

- reparar el flujo de sedes,
- separar conceptos internos,
- endurecer la semantica de dependencias,
- proteger sincronizacion offline,
- y quitar puntos de friccion de rendimiento.

Ese es el camino mas seguro para corregir errores, evitar fallos futuros y no danar `Reportes`.
