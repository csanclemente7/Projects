import Anthropic from '@anthropic-ai/sdk';
import { supabaseOrders, supabaseOrdersAdmin, supabaseQuotes, supabaseQuotesAdmin } from './supabase';
import { generarExcel } from './excel';
import type { ToolResult } from './types';

const NO_ASIGNADO_ID = '849dac95-99d8-4f43-897e-7565fec32382';

// ----------------------------------------------------------------
// Definición de herramientas
// ----------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_clientes',
    description: 'Busca clientes/empresas por nombre. Devuelve id, nombre, categoría y ciudad.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Nombre o parte del nombre del cliente' },
      },
      required: ['query'],
    },
  },
  {
    name: 'obtener_sedes_cliente',
    description: 'Obtiene las sedes (sucursales) registradas de un cliente empresa.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID del cliente empresa' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'obtener_dependencias_sede',
    description: 'Obtiene las dependencias (áreas, consultorios, pisos, zonas) de una sede específica.',
    input_schema: {
      type: 'object',
      properties: {
        sede_id: { type: 'string', description: 'UUID de la sede (maintenance_companies)' },
      },
      required: ['sede_id'],
    },
  },
  {
    name: 'listar_tecnicos',
    description: 'Lista todos los técnicos activos disponibles.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_agenda',
    description: 'Obtiene todas las órdenes agendadas para una fecha específica con nombre de cliente, sede, técnicos y hora.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'consultar_agenda_tecnico',
    description: 'Obtiene las órdenes asignadas a un técnico específico en un rango de fechas.',
    input_schema: {
      type: 'object',
      properties: {
        technician_id: { type: 'string', description: 'UUID del técnico' },
        fecha_inicio:  { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        fecha_fin:     { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional)' },
      },
      required: ['technician_id', 'fecha_inicio'],
    },
  },
  {
    name: 'consultar_equipos',
    description: 'Consulta los equipos registrados de un cliente o sede, incluyendo próximo mantenimiento y si está vencido.',
    input_schema: {
      type: 'object',
      properties: {
        sede_id:   { type: 'string', description: 'UUID de la sede (preferido)' },
        client_id: { type: 'string', description: 'UUID del cliente (si no hay sede específica)' },
      },
    },
  },
  {
    name: 'consultar_historial_mantenimiento',
    description: 'Consulta el historial reciente de servicios de un cliente o sede.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'UUID del cliente' },
        sede_id:   { type: 'string', description: 'UUID de la sede específica (opcional)' },
        limite:    { type: 'number',  description: 'Máximo de registros (por defecto 10)' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'crear_orden',
    description: 'Crea una nueva orden de servicio. SOLO llamar después de confirmación explícita del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        clientId:           { type: 'string', description: 'UUID del cliente' },
        sede_id:            { type: 'string', description: 'UUID de la sede (opcional)' },
        dependency_id:      { type: 'string', description: 'UUID de la dependencia (opcional)' },
        service_date:       { type: 'string', description: 'Fecha del servicio YYYY-MM-DD' },
        service_time:       { type: 'string', description: 'Hora HH:MM (opcional)' },
        order_type:         { type: 'string', description: 'Tipo(s) de servicio' },
        notes:              { type: 'string', description: 'Notas internas (opcional)' },
        estimated_duration: { type: 'number', description: 'Duración estimada en horas (opcional)' },
        technician_ids:     { type: 'array',  items: { type: 'string' }, description: 'UUIDs de técnicos (opcional)' },
        items: {
          type: 'array',
          description: 'Servicios o insumos con cantidades',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity:    { type: 'number' },
            },
            required: ['description', 'quantity'],
          },
        },
      },
      required: ['clientId', 'service_date', 'order_type'],
    },
  },
  {
    name: 'modificar_orden',
    description: 'Modifica campos de una orden existente. SOLO llamar después de confirmación del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID o manualId de la orden' },
        cambios: {
          type: 'object',
          description: 'Campos a cambiar: service_date, service_time, order_type, notes, status, estimated_duration, sede_id',
        },
        nuevos_tecnicos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Reemplaza la lista de técnicos si se especifica (UUIDs)',
        },
      },
      required: ['order_id', 'cambios'],
    },
  },
  {
    name: 'buscar_orden',
    description: 'Busca una orden por número manual (ej: 1854) o por nombre de cliente.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Número de orden o nombre de cliente' },
      },
      required: ['query'],
    },
  },
  {
    name: 'adjuntar_foto',
    description: 'Adjunta una foto (URL) a una orden existente.',
    input_schema: {
      type: 'object',
      properties: {
        order_id:  { type: 'string', description: 'UUID o manualId de la orden' },
        photo_url: { type: 'string', description: 'URL de la foto' },
        caption:   { type: 'string', description: 'Descripción opcional' },
      },
      required: ['order_id', 'photo_url'],
    },
  },
  {
    name: 'crear_cliente',
    description: 'Crea un nuevo cliente. SOLO llamar después de confirmación del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: 'Nombre completo' },
        category: { type: 'string', enum: ['empresa', 'residencial'] },
        address:  { type: 'string' },
        city:     { type: 'string' },
        phone:    { type: 'string' },
        email:    { type: 'string' },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'generar_borrador_cotizacion',
    description: 'Genera un borrador de cotización. SOLO llamar después de confirmación del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        clientId: { type: 'string', description: 'UUID del cliente' },
        sede_id:  { type: 'string', description: 'UUID de la sede (opcional)' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity:    { type: 'number' },
              price:       { type: 'number', description: 'Precio unitario en COP sin IVA' },
            },
            required: ['description', 'quantity', 'price'],
          },
        },
        notas: { type: 'string', description: 'Términos u observaciones (opcional)' },
      },
      required: ['clientId', 'items'],
    },
  },
  {
    name: 'resumen_semanal',
    description: 'Genera estadísticas de una semana: órdenes por tipo, técnicos activos, estados.',
    input_schema: {
      type: 'object',
      properties: {
        fecha_inicio: { type: 'string', description: 'Lunes de la semana YYYY-MM-DD' },
      },
      required: ['fecha_inicio'],
    },
  },
  {
    name: 'exportar_excel',
    description: 'Genera un archivo Excel descargable. Tipos: "agenda" (órdenes por rango de fechas), "historial" (mantenimiento de un cliente), "clientes" (lista por búsqueda). Devuelve una URL de descarga.',
    input_schema: {
      type: 'object',
      properties: {
        tipo:         { type: 'string', enum: ['agenda', 'historial', 'clientes'], description: 'Tipo de reporte' },
        fecha_inicio: { type: 'string', description: 'YYYY-MM-DD — requerido para tipo "agenda"' },
        fecha_fin:    { type: 'string', description: 'YYYY-MM-DD — opcional para "agenda", por defecto = fecha_inicio' },
        client_id:    { type: 'string', description: 'UUID del cliente — requerido para "historial"' },
        client_name:  { type: 'string', description: 'Nombre del cliente para el archivo — para "historial"' },
        sede_id:      { type: 'string', description: 'UUID de la sede — opcional para "historial"' },
        query:        { type: 'string', description: 'Búsqueda por nombre — requerido para "clientes"' },
      },
      required: ['tipo'],
    },
  },
];

// ----------------------------------------------------------------
// Router de herramientas
// ----------------------------------------------------------------

export async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  const start = Date.now();
  let result: ToolResult;

  try {
    switch (name) {
      case 'buscar_clientes':                result = await buscarClientes(input.query as string); break;
      case 'obtener_sedes_cliente':          result = await obtenerSedesCliente(input.client_id as string); break;
      case 'obtener_dependencias_sede':      result = await obtenerDependenciasSede(input.sede_id as string); break;
      case 'listar_tecnicos':                result = await listarTecnicos(); break;
      case 'consultar_agenda':               result = await consultarAgenda(input.fecha as string); break;
      case 'consultar_agenda_tecnico':       result = await consultarAgendaTecnico(
                                               input.technician_id as string,
                                               input.fecha_inicio as string,
                                               input.fecha_fin as string | undefined); break;
      case 'consultar_equipos':              result = await consultarEquipos(
                                               input.sede_id as string | undefined,
                                               input.client_id as string | undefined); break;
      case 'consultar_historial_mantenimiento': result = await consultarHistorialMantenimiento(
                                               input.client_id as string,
                                               input.sede_id as string | undefined,
                                               (input.limite as number) || 10); break;
      case 'crear_orden':                    result = await crearOrden(input); break;
      case 'modificar_orden':                result = await modificarOrden(
                                               input.order_id as string,
                                               input.cambios as Record<string, unknown>,
                                               input.nuevos_tecnicos as string[] | undefined); break;
      case 'buscar_orden':                   result = await buscarOrden(input.query as string); break;
      case 'adjuntar_foto':                  result = await adjuntarFoto(
                                               input.order_id as string,
                                               input.photo_url as string,
                                               input.caption as string | undefined); break;
      case 'crear_cliente':                  result = await crearCliente(input); break;
      case 'generar_borrador_cotizacion':    result = await generarBorradorCotizacion(
                                               input.clientId as string,
                                               input.items as Array<{ description: string; quantity: number; price: number }>,
                                               input.sede_id as string | undefined,
                                               input.notas as string | undefined); break;
      case 'resumen_semanal':                result = await resumenSemanal(input.fecha_inicio as string); break;
      case 'exportar_excel':                 result = await exportarExcel(input); break;
      default:
        result = { ok: false, error: `Herramienta desconocida: ${name}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result = { ok: false, error: message };
  }

  const ms = Date.now() - start;
  const status = result.ok ? 'OK' : 'ERR';
  const out = result.ok ? JSON.stringify(result.data).slice(0, 200) : result.error;
  console.log(`[AUDIT ${new Date().toISOString()}] ${status} ${name} (${ms}ms) | ${out}`);

  return result;
}

// ----------------------------------------------------------------
// Implementaciones
// ----------------------------------------------------------------

async function buscarClientes(query: string): Promise<ToolResult> {
  const { data, error } = await supabaseQuotes
    .from('clients')
    .select('id, manualId, name, address, city, category')
    .ilike('name', `%${query}%`)
    .limit(8);
  if (error) return { ok: false, error: error.message };
  // Log para debug: confirmar IDs retornados
  if (data?.length) console.log(`[buscarClientes] "${query}" →`, JSON.stringify(data.map((c: Record<string,unknown>) => ({ id: c.id, manualId: c.manualId, name: c.name }))));
  return { ok: true, data };
}

async function obtenerSedesCliente(clientId: string): Promise<ToolResult> {
  const [sedesRes, citiesRes] = await Promise.all([
    supabaseOrders.from('maintenance_companies').select('id, name, address, city_id').eq('client_id', clientId).order('name'),
    supabaseOrders.from('maintenance_cities').select('id, name'),
  ]);
  if (sedesRes.error) return { ok: false, error: sedesRes.error.message };

  const cityMap = new Map((citiesRes.data || []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const enriched = (sedesRes.data || []).map((s: Record<string, unknown>) => ({
    id:      s.id,
    name:    s.name,
    address: s.address,
    city:    cityMap.get(s.city_id as string) || null,
  }));
  return { ok: true, data: enriched };
}

async function obtenerDependenciasSede(sedeId: string): Promise<ToolResult> {
  const { data, error } = await supabaseOrders
    .from('maintenance_dependencies')
    .select('id, name, company_id, sede_id')
    .or(`company_id.eq.${sedeId},sede_id.eq.${sedeId}`)
    .order('name');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function listarTecnicos(): Promise<ToolResult> {
  const { data, error } = await supabaseOrders
    .from('maintenance_users')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

async function consultarAgenda(fecha: string): Promise<ToolResult> {
  const { data, error } = await supabaseOrders
    .from('orders')
    .select('id, manualId, clientId, sede_id, status, service_time, order_type, notes, estimated_duration, order_technicians(technician_id)')
    .eq('service_date', fecha)
    .order('service_time', { ascending: true, nullsFirst: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: await enrichOrders(data || []) };
}

async function consultarAgendaTecnico(techId: string, fechaInicio: string, fechaFin?: string): Promise<ToolResult> {
  const end = fechaFin || fechaInicio;
  const { data: techOrders, error: tErr } = await supabaseOrders
    .from('order_technicians').select('order_id').eq('technician_id', techId);
  if (tErr) return { ok: false, error: tErr.message };
  if (!techOrders?.length) return { ok: true, data: [] };

  const orderIds = techOrders.map((r: { order_id: string }) => r.order_id);
  const { data, error } = await supabaseOrders
    .from('orders')
    .select('id, manualId, clientId, sede_id, status, service_date, service_time, order_type, notes, order_technicians(technician_id)')
    .in('id', orderIds)
    .gte('service_date', fechaInicio)
    .lte('service_date', end)
    .order('service_date')
    .order('service_time', { nullsFirst: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: await enrichOrders(data || []) };
}

async function consultarEquipos(sedeId?: string, clientId?: string): Promise<ToolResult> {
  if (!sedeId && !clientId) return { ok: false, error: 'Se requiere sede_id o client_id' };

  let sedeIds: string[] = sedeId ? [sedeId] : [];

  if (!sedeId && clientId) {
    const { data: sedes } = await supabaseOrders
      .from('maintenance_companies').select('id').eq('client_id', clientId);
    sedeIds = (sedes || []).map((s: { id: string }) => s.id);
    if (!sedeIds.length) return { ok: true, data: [] };
  }

  const filterStr = sedeIds.map(id => `company_id.eq.${id},sede_id.eq.${id}`).join(',');
  const { data, error } = await supabaseOrders
    .from('maintenance_equipment')
    .select('id, manual_id, model, brand, type, capacity, last_maintenance_date, periodicity_months, category')
    .or(filterStr)
    .order('model')
    .limit(30);
  if (error) return { ok: false, error: error.message };

  const today = new Date();
  const enriched = (data || []).map((eq: Record<string, unknown>) => {
    let proximoMantenimiento: string | null = null;
    if (eq.last_maintenance_date && eq.periodicity_months) {
      const d = new Date(eq.last_maintenance_date as string);
      d.setMonth(d.getMonth() + (eq.periodicity_months as number));
      proximoMantenimiento = d.toISOString().split('T')[0];
    }
    return {
      ...eq,
      proximo_mantenimiento: proximoMantenimiento,
      vencido: proximoMantenimiento ? new Date(proximoMantenimiento) < today : false,
    };
  });
  return { ok: true, data: enriched };
}

async function consultarHistorialMantenimiento(clientId: string, sedeId?: string, limite = 10): Promise<ToolResult> {
  let sedeIds: string[] = [];

  if (sedeId) {
    sedeIds = [sedeId];
  } else {
    const { data: sedes } = await supabaseOrders
      .from('maintenance_companies').select('id, name').eq('client_id', clientId);
    sedeIds = (sedes || []).map((s: { id: string }) => s.id);
  }
  if (!sedeIds.length) return { ok: true, data: [] };

  const { data, error } = await supabaseOrders
    .from('maintenance_reports')
    .select('id, timestamp, service_type, worker_name, company_id, observations')
    .in('company_id', sedeIds)
    .order('timestamp', { ascending: false })
    .limit(limite);
  if (error) return { ok: false, error: error.message };

  const { data: sedesData } = await supabaseOrders
    .from('maintenance_companies').select('id, name').in('id', sedeIds);
  const sedeMap = new Map((sedesData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

  const enriched = (data || []).map((r: Record<string, unknown>) => ({
    fecha:         (r.timestamp as string)?.split('T')[0],
    hora:          (r.timestamp as string)?.split('T')[1]?.slice(0, 5),
    tipo_servicio: r.service_type,
    tecnico:       r.worker_name,
    sede:          sedeMap.get(r.company_id as string) || r.company_id,
    observaciones: r.observations,
  }));
  return { ok: true, data: enriched };
}

async function crearOrden(input: Record<string, unknown>): Promise<ToolResult> {
  // Validar que clientId sea un UUID real y no un manualId numérico
  const rawClientId = input.clientId as string;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!rawClientId || !uuidRegex.test(rawClientId)) {
    // Intentar resolver por manualId o nombre
    const { data: found } = await supabaseQuotes.from('clients').select('id, name').eq('manualId', rawClientId).maybeSingle();
    if (found) {
      input.clientId = found.id;
      console.warn(`[crearOrden] clientId "${rawClientId}" era manualId → resuelto a UUID ${found.id}`);
    } else {
      return { ok: false, error: `clientId "${rawClientId}" no es un UUID válido. Usa la herramienta buscar_clientes primero y pasa el campo "id" (UUID).` };
    }
  }
  console.log(`[crearOrden] clientId=${input.clientId}`);

  const manualId = await getNextManualId();
  const id       = crypto.randomUUID();
  const techIds  = (input.technician_ids as string[] | undefined) || [];
  if (techIds.length === 0) techIds.push(NO_ASIGNADO_ID);

  // Incluir nombre de dependencia en notas si viene dependency_id
  let notes = (input.notes as string) || null;
  if (input.dependency_id) {
    const { data: dep } = await supabaseOrders
      .from('maintenance_dependencies').select('name').eq('id', input.dependency_id).single();
    if (dep?.name) {
      notes = notes ? `${notes}\nDependencia: ${dep.name}` : `Dependencia: ${dep.name}`;
    }
  }

  const orderRow = {
    id, manualId,
    clientId:           input.clientId,
    sede_id:            input.sede_id            ?? null,
    status:             'scheduled',
    service_date:       input.service_date,
    service_time:       input.service_time        ?? '07:30',
    order_type:         input.order_type,
    notes,
    estimated_duration: input.estimated_duration  ?? null,
  };

  console.log(`[crearOrden] insertando:`, JSON.stringify({ manualId, clientId: orderRow.clientId, service_date: orderRow.service_date, order_type: orderRow.order_type }));
  const { error: orderErr } = await supabaseOrdersAdmin.from('orders').insert(orderRow);
  if (orderErr) {
    console.error(`[crearOrden] ❌ INSERT FALLÓ:`, orderErr.message, orderErr.code, orderErr.details);
    return { ok: false, error: `Error al insertar orden: ${orderErr.message}` };
  }
  console.log(`[crearOrden] ✅ INSERT OK → manualId=${manualId}`);

  const { data: verify } = await supabaseOrdersAdmin.from('orders').select('id, clientId').eq('id', id).single();
  if (!verify) return { ok: false, error: 'La orden no se guardó. Verifica ORDERS_SUPABASE_SERVICE_KEY en .env.' };

  // Verificar que el clientId almacenado resuelve a un cliente real
  const { data: clientCheck } = await supabaseQuotes.from('clients').select('id, name').eq('id', verify.clientId).maybeSingle();
  if (!clientCheck) {
    console.warn(`[crearOrden] ⚠️  clientId "${verify.clientId}" NO resuelve a ningún cliente en supabaseQuotes.clients`);
  } else {
    console.log(`[crearOrden] ✅ clientId resuelto: "${clientCheck.name}" (${clientCheck.id})`);
  }

  const techRows = techIds.map((tid: string) => ({ order_id: id, technician_id: tid }));
  const { error: techErr } = await supabaseOrdersAdmin.from('order_technicians').insert(techRows);
  if (techErr) return { ok: false, error: `Orden creada pero error asignando técnicos: ${techErr.message}` };

  const items = input.items as Array<{ description: string; quantity: number }> | undefined;
  if (items?.length) {
    const itemRows = items.map(item => ({
      id:          crypto.randomUUID(),
      orderId:     id,
      itemId:      crypto.randomUUID(),
      manualId:    `${manualId}-I`,
      description: item.description,
      quantity:    item.quantity,
      price:       0,
    }));
    const { error: itemErr } = await supabaseOrdersAdmin.from('order_items').insert(itemRows);
    if (itemErr) console.warn(`[crearOrden] items no insertados: ${itemErr.message}`);
  }

  return { ok: true, data: { id, manualId, status: 'scheduled' } };
}

async function modificarOrden(orderId: string, cambios: Record<string, unknown>, nuevosTecnicos?: string[]): Promise<ToolResult> {
  const resolvedId = await resolveOrderId(orderId);
  if (!resolvedId) return { ok: false, error: `No se encontró la orden "${orderId}"` };

  const allowed = ['service_date', 'service_time', 'order_type', 'notes', 'status', 'estimated_duration', 'sede_id'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in cambios) update[k] = cambios[k]; }

  if (Object.keys(update).length > 0) {
    const { error } = await supabaseOrdersAdmin.from('orders').update(update).eq('id', resolvedId);
    if (error) return { ok: false, error: error.message };
  }

  if (nuevosTecnicos?.length) {
    await supabaseOrdersAdmin.from('order_technicians').delete().eq('order_id', resolvedId);
    const rows = nuevosTecnicos.map(tid => ({ order_id: resolvedId, technician_id: tid }));
    const { error } = await supabaseOrdersAdmin.from('order_technicians').insert(rows);
    if (error) return { ok: false, error: `Error actualizando técnicos: ${error.message}` };
  }

  return { ok: true, data: { id: resolvedId, updated: true } };
}

async function buscarOrden(query: string): Promise<ToolResult> {
  const isNumeric = /^\d+$/.test(query.trim());
  let data: unknown[] = [];

  if (isNumeric) {
    const { data: d } = await supabaseOrders
      .from('orders')
      .select('id, manualId, clientId, sede_id, status, service_date, service_time, order_type, notes, order_technicians(technician_id)')
      .eq('manualId', query.trim()).limit(1);
    data = d || [];
  }

  if (!data.length) {
    const { data: clients } = await supabaseQuotes
      .from('clients').select('id').ilike('name', `%${query}%`).limit(5);
    if (clients?.length) {
      const ids = clients.map((c: { id: string }) => c.id);
      const { data: d } = await supabaseOrders
        .from('orders')
        .select('id, manualId, clientId, sede_id, status, service_date, service_time, order_type, notes, order_technicians(technician_id)')
        .in('clientId', ids).order('service_date', { ascending: false }).limit(5);
      data = d || [];
    }
  }
  return { ok: true, data: await enrichOrders(data as Record<string, unknown>[]) };
}

async function adjuntarFoto(orderId: string, storagePath: string, _caption?: string): Promise<ToolResult> {
  const resolvedId = await resolveOrderId(orderId);
  if (!resolvedId) return { ok: false, error: `No se encontró la orden "${orderId}"` };

  const { data: order, error: fetchErr } = await supabaseOrdersAdmin
    .from('orders').select('image_urls').eq('id', resolvedId).single();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const existing: string[] = (order?.image_urls as string[] | null) || [];
  const { error } = await supabaseOrdersAdmin
    .from('orders').update({ image_urls: [...existing, storagePath] }).eq('id', resolvedId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { attached: true, order_id: resolvedId, total_fotos: existing.length + 1 } };
}

async function crearCliente(input: Record<string, unknown>): Promise<ToolResult> {
  const manualId = await getNextClientManualId();
  const row: Record<string, unknown> = {
    id: crypto.randomUUID(), manualId,
    name: input.name, category: input.category, city: input.city || 'Buga',
  };
  if (input.address) row.address = input.address;
  if (input.phone)   row.phone   = input.phone;
  if (input.email)   row.email   = input.email;

  const { data, error } = await supabaseQuotesAdmin
    .from('clients').insert(row).select('id, manualId, name, category, city').single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'El cliente no se guardó. Verifica QUOTES_SUPABASE_SERVICE_KEY.' };
  return { ok: true, data };
}

async function generarBorradorCotizacion(
  clientId: string,
  items: Array<{ description: string; quantity: number; price: number }>,
  sedeId?: string,
  notas?: string
): Promise<ToolResult> {
  const quoteId  = crypto.randomUUID();
  const manualId = await getNextQuoteManualId();
  const today    = new Date().toISOString().split('T')[0];

  const { error: quoteErr } = await supabaseQuotesAdmin.from('quotes').insert({
    id: quoteId, manualId, date: today, clientId,
    taxRate: 19,
    terms: notas || 'Válido por 30 días. Precios en COP sin IVA.',
    sede_id: sedeId || null,
  });
  if (quoteErr) return { ok: false, error: `Error creando cotización: ${quoteErr.message}` };

  if (items.length > 0) {
    const itemRows = items.map((item, idx) => ({
      id:          crypto.randomUUID(),
      quoteId,
      itemId:      null,
      description: item.description,
      quantity:    item.quantity,
      price:       item.price,
      manualId:    `${manualId}-${idx + 1}`,
    }));
    const { error: itemErr } = await supabaseQuotesAdmin.from('quote_items').insert(itemRows);
    if (itemErr) console.warn(`[borrador_cotizacion] ítems no insertados: ${itemErr.message}`);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const iva      = Math.round(subtotal * 0.19);
  return { ok: true, data: { quoteId, manualId, items: items.length, subtotal, iva, total: subtotal + iva } };
}

async function exportarExcel(input: Record<string, unknown>): Promise<ToolResult> {
  const result = await generarExcel(input.tipo as string, input);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    data: {
      download_url: `/api/download/${result.token}`,
      filename:     result.filename,
      rows:         result.rows,
    },
  };
}

async function resumenSemanal(fechaInicio: string): Promise<ToolResult> {
  const start = new Date(fechaInicio);
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  const endStr = end.toISOString().split('T')[0];

  const { data, error } = await supabaseOrders
    .from('orders')
    .select('id, status, order_type, order_technicians(technician_id)')
    .gte('service_date', fechaInicio).lte('service_date', endStr);
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: true, data: { total: 0, message: 'Sin órdenes en esa semana' } };

  const byType: Record<string, number>   = {};
  const byStatus: Record<string, number> = {};
  const techCount: Record<string, number> = {};

  data.forEach((o: Record<string, unknown>) => {
    String(o.order_type || '').split(' • ').map((s: string) => s.trim()).filter(Boolean)
      .forEach(t => { byType[t] = (byType[t] || 0) + 1; });
    const s = String(o.status);
    byStatus[s] = (byStatus[s] || 0) + 1;
    (o.order_technicians as Array<{ technician_id: string }> || []).forEach(t => {
      if (t.technician_id !== NO_ASIGNADO_ID)
        techCount[t.technician_id] = (techCount[t.technician_id] || 0) + 1;
    });
  });

  const topTechs = Object.entries(techCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const techNames: string[] = [];
  for (const [tid, count] of topTechs) {
    const { data: t } = await supabaseOrders
      .from('maintenance_users').select('name').eq('id', tid).single();
    techNames.push(`${t?.name || tid} (${count})`);
  }

  return { ok: true, data: {
    semana: `${fechaInicio} al ${endStr}`,
    total: data.length, por_tipo: byType, por_estado: byStatus,
    tecnicos_mas_activos: techNames,
  }};
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function getNextManualId(): Promise<string> {
  const { data } = await supabaseOrders.from('orders').select('manualId')
    .not('manualId', 'is', null).order('created_at', { ascending: false }).limit(20);
  const nums = (data || []).map((r: { manualId: string }) => parseInt(r.manualId, 10)).filter((n: number) => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1001';
}

async function getNextClientManualId(): Promise<string> {
  const { data } = await supabaseQuotes.from('clients').select('manualId')
    .not('manualId', 'is', null).order('created_at', { ascending: false }).limit(20);
  const nums = (data || []).map((r: { manualId: string }) => parseInt(r.manualId, 10)).filter((n: number) => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1001';
}

async function getNextQuoteManualId(): Promise<string> {
  const { data } = await supabaseQuotes.from('quotes').select('manualId')
    .not('manualId', 'is', null).order('created_at', { ascending: false }).limit(20);
  const nums = (data || []).map((r: { manualId: string }) => parseInt(r.manualId, 10)).filter((n: number) => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1001';
}

async function resolveOrderId(query: string): Promise<string | null> {
  if (/^[0-9a-f-]{36}$/.test(query)) return query;
  const { data } = await supabaseOrders
    .from('orders').select('id').eq('manualId', query.trim()).single();
  return data?.id ?? null;
}

async function enrichOrders(orders: Record<string, unknown>[]): Promise<unknown[]> {
  if (!orders.length) return [];

  const clientIds = [...new Set(orders.map(o => o.clientId as string).filter(Boolean))];
  const sedeIds   = [...new Set(orders.map(o => o.sede_id   as string).filter(Boolean))];
  const techIds: string[] = [];
  orders.forEach(o => {
    ((o.order_technicians as Array<{ technician_id: string }>) || [])
      .forEach(t => { if (!techIds.includes(t.technician_id)) techIds.push(t.technician_id); });
  });

  const [clientsRes, sedesRes, techsRes] = await Promise.all([
    clientIds.length ? supabaseQuotes.from('clients').select('id, name').in('id', clientIds)        : Promise.resolve({ data: [] }),
    sedeIds.length   ? supabaseOrders.from('maintenance_companies').select('id, name, client_id').in('id', sedeIds) : Promise.resolve({ data: [] }),
    techIds.length   ? supabaseOrders.from('maintenance_users').select('id, name').in('id', techIds) : Promise.resolve({ data: [] }),
  ]);

  const clientMap = new Map((clientsRes.data || []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const sedeMap   = new Map((sedesRes.data  || []).map((s: { id: string; name: string; client_id: string }) => [s.id, s]));
  const techMap   = new Map((techsRes.data  || []).map((t: { id: string; name: string }) => [t.id, t.name]));

  return orders.map(o => {
    const clientName = clientMap.get(o.clientId as string) || o.clientId;
    const sede       = sedeMap.get(o.sede_id as string);
    const location   = sede
      ? `${clientMap.get(sede.client_id) || clientName} — ${sede.name}`
      : clientName;

    const techs = ((o.order_technicians as Array<{ technician_id: string }>) || [])
      .map(t => techMap.get(t.technician_id) || t.technician_id)
      .filter(n => n !== 'No Asignado' && n !== NO_ASIGNADO_ID);

    return {
      manualId:           o.manualId,
      location,
      status:             o.status,
      service_date:       o.service_date,
      service_time:       o.service_time,
      order_type:         o.order_type,
      notes:              o.notes,
      estimated_duration: o.estimated_duration,
      technicians:        techs,
    };
  });
}