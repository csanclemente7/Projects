# Plan de Implementación: Último Mantenimiento Preventivo de Equipos

## 1. Objetivo

Actualizar automáticamente la fecha de **Último mantenimiento** de un equipo cuando se registre un reporte de **Mantenimiento Preventivo** sobre un equipo que ya exista en el inventario.

El objetivo operativo es evitar mantenimientos preventivos duplicados dentro del mismo periodo, alimentar correctamente el **Cronograma**, y permitir generar listas de equipos pendientes o ya atendidos.

Ejemplo:

- Equipo: `mc-0021`
- Periodicidad: `4 meses`
- Preventivo realizado: `2026-04-20`
- Resultado esperado:
  - `Último mantenimiento`: `2026-04-20`
  - `Próximo mantenimiento`: `2026-08-20`
  - `Estado`: `Faltan X días`

## 2. Aplicaciones involucradas

Este cambio afecta principalmente estas áreas:

- **Admin Equipos**
  - Lista de Inventario de Equipos.
  - Campo `Último Mtto.`.

- **Reportes**
  - Creación de reportes de mantenimiento.
  - Sección **Gestión de Equipos**.
  - Sección **Cronograma**.
  - Sincronización offline/online de reportes.

No se debe modificar la estructura visual ni la navegación principal de la vista del técnico.

## 3. Estado actual identificado

Actualmente existe el campo:

```text
maintenance_equipment.last_maintenance_date
```

Ese campo se usa para mostrar la fecha de último mantenimiento en Admin Equipos y en la lógica de equipos, pero hoy se actualiza principalmente cuando se crea o edita manualmente un equipo.

Al guardar un reporte de mantenimiento, la aplicación de Reportes crea o actualiza registros en:

```text
maintenance_reports
```

Pero no actualiza automáticamente:

```text
maintenance_equipment.last_maintenance_date
```

El Cronograma actualmente calcula fechas usando reportes asociados al equipo y/o la fecha manual del equipo. Ese cálculo debe quedar alineado con la nueva regla para que solo el mantenimiento preventivo afecte la programación preventiva.

## 4. Regla funcional principal

Actualizar `last_maintenance_date` solo cuando se cumplan todas estas condiciones:

1. El reporte se guarda correctamente.
2. El tipo de servicio es exactamente:

   ```text
   Mantenimiento Preventivo
   ```

3. El reporte está asociado a un equipo existente en inventario.
4. El `equipmentSnapshot.id` corresponde a un equipo real de `maintenance_equipment`.
5. El equipo no es manual ni temporal.

No actualizar cuando:

- El servicio sea correctivo.
- El servicio sea montaje/instalación.
- El servicio sea otro tipo diferente a preventivo.
- El equipo sea `MANUAL_NO_ID`.
- El equipo sea `INSTALL_NO_ID`.
- El reporte se haya creado sin seleccionar un equipo del inventario.

## 5. Fecha oficial a guardar

La fecha oficial debe salir del reporte guardado, no de la fecha del dispositivo al momento posterior.

Recomendación:

```text
last_maintenance_date = fecha del reporte preventivo
```

Si el reporte usa `timestamp` ISO, se debe normalizar a formato de fecha:

```text
YYYY-MM-DD
```

Ejemplo:

```text
report.timestamp = 2026-04-20T15:30:00.000Z
last_maintenance_date = 2026-04-20
```

Esto facilita filtros por periodo y evita diferencias por hora.

## 6. Cambios propuestos en Reportes

### 6.1 Crear función API específica

Agregar una función en la capa API de Reportes:

```ts
updateEquipmentLastMaintenanceDate(equipmentId: string, maintenanceDate: string)
```

Responsabilidad:

```sql
update maintenance_equipment
set last_maintenance_date = maintenanceDate
where id = equipmentId
```

Debe estar centralizada en la API para no duplicar llamadas directas a Supabase en varios flujos.

### 6.2 Integrar con guardado online de reportes

En el flujo online:

1. Construir el reporte.
2. Guardar el reporte en `maintenance_reports`.
3. Si es `Mantenimiento Preventivo` y el equipo es real:
   - Actualizar `maintenance_equipment.last_maintenance_date`.
   - Actualizar `State.equipmentList` local.
   - Recalcular/repintar Cronograma si está visible.
   - Repintar Gestión de Equipos si está visible.

La actualización del equipo debe ocurrir después de que el reporte se guarde correctamente.

### 6.3 Integrar con edición de reportes

Regla sugerida para edición:

- Si se edita un reporte y sigue siendo `Mantenimiento Preventivo`, se puede actualizar el equipo con la fecha del reporte editado.
- Si se cambia de preventivo a otro tipo, no se debe borrar automáticamente `last_maintenance_date`, porque podría existir otro preventivo posterior.

Para evitar inconsistencias, en una primera fase se recomienda:

- Actualizar `last_maintenance_date` al crear preventivos nuevos.
- En edición, solo actualizar si el reporte editado es preventivo y su fecha es igual o posterior a la fecha actual guardada en el equipo.

## 7. Cambios propuestos en sincronización offline

La app de Reportes ya maneja guardado offline y sincronización posterior. Este cambio debe respetar ese flujo.

### 7.1 Cuando el técnico está offline

Al guardar un preventivo offline:

1. Guardar el reporte en cola local.
2. Actualizar estado local para que el técnico vea que el reporte quedó guardado.
3. Opcionalmente actualizar `equipmentList` local con la nueva fecha, marcado como cambio pendiente.

### 7.2 Cuando vuelve internet

Al sincronizar:

1. Subir/actualizar el reporte en `maintenance_reports`.
2. Si el reporte sincronizado es `Mantenimiento Preventivo` y tiene equipo real:
   - Actualizar `maintenance_equipment.last_maintenance_date`.
3. Refrescar o reconciliar `equipmentList`.
4. Recalcular Cronograma.

Esto evita que un preventivo hecho offline quede registrado como reporte, pero sin impactar el inventario.

## 8. Integración con Cronograma

El Cronograma debe convertirse en el principal consumidor operativo de `last_maintenance_date`.

### 8.1 Datos que debe mostrar

Por cada equipo:

- Equipo.
- Ubicación.
- Último Mtto.
- Próximo Mtto.
- Estado.

### 8.2 Cálculo esperado

```text
Próximo mantenimiento = Último mantenimiento + periodicidad_meses
```

Ejemplo:

```text
Último mantenimiento: 2026-04-20
Periodicidad: 4 meses
Próximo mantenimiento: 2026-08-20
Estado: Faltan X días
```

### 8.3 Prioridad de cálculo recomendada

El Cronograma debe usar esta prioridad:

1. `equipment.lastMaintenanceDate`
   - Dato oficial del inventario, actualizado por preventivos.
2. Último reporte de tipo `Mantenimiento Preventivo` asociado al equipo.
   - Solo como respaldo si el equipo aún no tiene `lastMaintenanceDate`.
3. `equipment.created_at`
   - Solo como fallback inicial para equipos sin histórico.

Importante:

Un reporte correctivo, montaje u otro tipo de servicio no debe mover la programación de mantenimiento preventivo.

### 8.4 Estado

El estado debe recalcularse automáticamente a partir del próximo mantenimiento:

- `Vencido hace X días`
- `Vence hoy`
- `Vence en X días`
- `Faltan X días`

Después de registrar un preventivo, el equipo debería dejar de aparecer como vencido y pasar a mostrar los días faltantes hasta el próximo mantenimiento.

## 9. Alerta por preventivo reciente

Antes de crear o guardar un reporte de `Mantenimiento Preventivo` para un equipo existente, validar:

- `lastMaintenanceDate`
- `periodicityMonths`
- fecha del próximo mantenimiento calculada

Si el equipo todavía está dentro del periodo vigente, mostrar una alerta.

Ejemplo:

```text
Este equipo tuvo mantenimiento preventivo el 2026-04-20.
Su periodicidad es de 4 meses.
Próximo mantenimiento sugerido: 2026-08-20.
```

La alerta no debe bloquear de forma absoluta. Debe permitir continuar con confirmación, porque puede haber casos excepcionales donde el preventivo sí se deba repetir.

## 10. Listas operativas para técnicos

Con `last_maintenance_date` actualizado correctamente, se pueden crear filtros administrativos como:

- Equipos pendientes del periodo.
- Equipos ya atendidos en el periodo.
- Equipos vencidos.
- Equipos próximos a vencer.
- Equipos por ciudad, empresa, sede o dependencia.

Estas listas pueden servir para asignar a los técnicos únicamente los equipos que realmente necesitan mantenimiento preventivo.

## 11. No afectar vista del técnico

Restricciones:

- No cambiar estructura de navegación del técnico.
- No cambiar la forma principal en que el técnico crea reportes.
- No agregar nuevas tablas o pantallas al técnico en esta fase.
- Solo agregar una alerta discreta cuando intente hacer un preventivo reciente.

El resto de cambios deben vivir en:

- API.
- Guardado/sincronización.
- Estado local.
- Admin Equipos.
- Gestión de Equipos.
- Cronograma.

## 12. Casos borde

### 12.1 Reporte preventivo de equipo manual

No actualizar inventario.

### 12.2 Reporte correctivo

No actualizar `last_maintenance_date`.

### 12.3 Reporte de instalación

No actualizar `last_maintenance_date`.

### 12.4 Equipo eliminado

Si el reporte referencia un equipo que ya no existe, guardar el reporte pero no intentar actualizar `maintenance_equipment`.

### 12.5 Preventivo repetido intencionalmente

Mostrar alerta y permitir continuar con confirmación.

### 12.6 Edición de reporte antiguo

No sobrescribir una fecha más reciente con una fecha vieja.

## 13. Secuencia de implementación recomendada

1. Crear helper de fecha:
   - Convertir `timestamp` del reporte a `YYYY-MM-DD`.

2. Crear helper de validación:
   - Determinar si un reporte debe actualizar `last_maintenance_date`.

3. Crear función API:
   - `updateEquipmentLastMaintenanceDate`.

4. Integrar en guardado online:
   - Después de `saveMaintenanceReport`.

5. Integrar en sincronización offline:
   - Después de `upsertMaintenanceReport`.

6. Actualizar estado local:
   - Cambiar `State.equipmentList` para el equipo actualizado.

7. Ajustar Cronograma:
   - Priorizar `equipment.lastMaintenanceDate`.
   - Filtrar reportes fallback solo por `Mantenimiento Preventivo`.
   - Recalcular `Próximo Mtto.` y `Estado`.

8. Agregar alerta de preventivo reciente:
   - Al seleccionar equipo o antes de guardar.

9. Validar Admin Equipos y Gestión de Equipos:
   - Confirmar que `Último Mtto.` se ve actualizado.

10. Ejecutar pruebas manuales y build.

## 14. Pruebas mínimas

### Caso 1: Preventivo normal

1. Seleccionar equipo real `mc-0021`.
2. Crear reporte `Mantenimiento Preventivo`.
3. Confirmar que se guarda el reporte.
4. Confirmar que `last_maintenance_date` del equipo cambia a la fecha del reporte.
5. Confirmar que Cronograma recalcula próximo mantenimiento.

### Caso 2: Correctivo

1. Crear reporte correctivo sobre el mismo equipo.
2. Confirmar que `last_maintenance_date` no cambia.

### Caso 3: Preventivo reciente

1. Intentar crear otro preventivo antes del próximo vencimiento.
2. Confirmar que aparece alerta.
3. Confirmar que el usuario puede continuar si confirma.

### Caso 4: Equipo manual

1. Crear preventivo sin seleccionar equipo del inventario.
2. Confirmar que se guarda el reporte.
3. Confirmar que no se intenta actualizar `maintenance_equipment`.

### Caso 5: Offline

1. Crear preventivo offline.
2. Confirmar que el reporte queda en cola.
3. Reconectar.
4. Confirmar que se sincroniza el reporte.
5. Confirmar que se actualiza `last_maintenance_date`.

## 15. Riesgos y controles

### Riesgo: sobrescribir fechas recientes

Control:

No actualizar `last_maintenance_date` si la fecha nueva es anterior a la fecha ya guardada.

### Riesgo: que un correctivo afecte Cronograma

Control:

El fallback por reportes debe filtrar solo `Mantenimiento Preventivo`.

### Riesgo: cambios en vista técnico

Control:

Limitar el cambio visible del técnico a una alerta contextual.

### Riesgo: inconsistencia offline

Control:

Actualizar equipo al sincronizar el reporte offline, no solo al guardar localmente.

## 16. Resultado esperado final

Al implementar este plan:

- Cada preventivo sobre un equipo inventariado actualiza `Último mantenimiento`.
- Admin Equipos muestra la fecha actualizada.
- Gestión de Equipos en Reportes queda alineada con el inventario.
- Cronograma calcula `Próximo mantenimiento` y `Estado` con base en el último preventivo real.
- El sistema alerta si se intenta repetir un preventivo antes de tiempo.
- Se pueden generar listas operativas de equipos pendientes o ya atendidos por periodo.
- La vista del técnico no cambia estructuralmente.
