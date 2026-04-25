import Anthropic from '@anthropic-ai/sdk';
import { supabaseOrders, supabaseOrdersAdmin, supabaseQuotes, supabaseQuotesAdmin } from './supabase';
import type { ToolResult } from './types';

const NO_ASIGNADO_ID = '849dac95-99d8-4f43-897e-7565fec32382';

// ----------------------------------------------------------------
// Definiciones de herramientas para Claude
// ----------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'buscar_clientes',
    description: 'Busca clientes por nombre en la base de datos. Devuelve id, nombre, categoría y ciudad.',
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
    name: 'listar_tecnicos',
    description: 'Lista todos los técnicos activos disponibles.',
    input_schema: {
      type: 'object',
      properties: {},
    },
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
        fecha_inicio: { type: 'string', description: 'Fecha inicio YYYY-MM-DD' },
        fecha_fin: { type: 'string', description: 'Fecha fin YYYY-MM-DD (opcional, por defecto igual a fecha_inicio)' },
      },
      required: ['technician_id', 'fecha_inicio'],
    },
  },
  {
    name: 'crear_orden',
    description: 'Crea una nueva orden de servicio. SOLO llamar después de que el usuario haya confirmado los datos. Si el usuario pide "2 preventivos" crea UNA sola orden con un item {description:"Preventivo", quantity:2}.',
    input_schema: {
      type: 'object',
      properties: {
        clientId:           { type: 'string', description: 'UUID del cliente' },
        sede_id:            { type: 'string', description: 'UUID de la sede (opcional)' },
        service_date:       { type: 'string', description: 'Fecha del servicio YYYY-MM-DD' },
        service_time:       { type: 'string', description: 'Hora del servicio HH:MM (opcional)' },
        order_type:         { type: 'string', description: 'Tipo(s) de servicio. Ej: "Preventivo" o "Preventivo • Correctivo"' },
        notes:              { type: 'string', description: 'Notas internas (opcional)' },
        estimated_duration: { type: 'number', description: 'Duración estimada en horas (opcional)' },
        technician_ids:     { type: 'array', items: { type: 'string' }, description: 'UUIDs de técnicos asignados' },
        items: {
          type: 'array',
          description: 'Insumos o servicios con cantidades. Ej: [{description:"Preventivo", quantity:2}]',
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
          description: 'Objeto con los campos a cambiar: service_date, service_time, order_type, notes, status, estimated_duration, sede_id',
        },
        nuevos_tecnicos: {
          type: 'array',
          items: { type: 'string' },
          description: 'Si se especifica, reemplaza la lista de técnicos (UUIDs)',
        },
      },
      required: ['order_id', 'cambios'],
    },
  },
  {
    name: 'buscar_orden',
    description: 'Busca una orden por su número manual (ej: 1854) o por nombre de cliente.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Número de orden (ej: "1854") o nombre de cliente' },
      },
      required: ['query'],
    },
  },
  {
    name: 'adjuntar_foto',
    description: 'Adjunta una foto a una orden existente. Usar cuando el mensaje contiene [FOTO_ADJUNTA:url]. Pregunta primero a qué orden va si no está claro.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'UUID o manualId de la orden' },
        photo_url: { type: 'string', description: 'URL de la foto (la que viene en [FOTO_ADJUNTA:url])' },
        caption:   { type: 'string', description: 'Descripción opcional de la foto' },
      },
      required: ['order_id', 'photo_url'],
    },
  },
  {
    name: 'crear_cliente',
    description: 'Crea un nuevo cliente en la base de datos. SOLO llamar después de confirmación del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        name:     { type: 'string', description: 'Nombre completo del cliente o empresa' },
        category: { type: 'string', enum: ['empresa', 'residencial'], description: 'Tipo de cliente' },
        address:  { type: 'string', description: 'Dirección (opcional)' },
        city:     { type: 'string', description: 'Ciudad (opcional)' },
        phone:    { type: 'string', description: 'Teléfono de contacto (opcional)' },
        email:    { type: 'string', description: 'Correo electrónico (opcional)' },
      },
      required: ['name', 'category'],
    },
  },
  {
    name: 'resumen_semanal',
    description: 'Genera estadísticas de una semana: total de órdenes por tipo, técnicos más activos, órdenes completadas vs pendientes.',
    input_schema: {
      type: 'object',
      properties: {
        fecha_inicio: { type: 'string', description: 'Lunes de la semana en YYYY-MM-DD' },
      },
      required: ['fecha_inicio'],
    },
  },
];

// ----------------------------------------------------------------
// Implementaciones
// ----------------------------------------------------------------

export async function executeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'buscar_clientes':         return await buscarClientes(input.query as string);
      case 'obtener_sedes_cliente':   return await obtenerSedesCliente(input.client_id as string);
      case 'listar_tecnicos':         return await listarTecnicos();
      case 'consultar_agenda':        return await consultarAgenda(input.fecha as string);
      case 'consultar_agenda_tecnico':return await consultarAgendaTecnico(
                                        input.technician_id as string,
                                        input.fecha_inicio as string,
                                        input.fecha_fin as string | undefined
                                      );
      case 'crear_orden':             return await crearOrden(input);
      case 'modificar_orden':         return await modificarOrden(
                                        input.order_id as string,
                                        input.cambios as Record<string, unknown>,
                                        input.nuevos_tecnicos as string[] | undefined
                                      );
      case 'buscar_orden':            return await buscarOrden(input.query as string);
      case 'adjuntar_foto':           return await adjuntarFoto(
                                        input.order_id as string,
                                        input.photo_url as string,
                                        input.caption as string | undefined
                                      );
      case 'crear_cliente':           return await crearCliente(input);
      case 'resumen_semanal':         return await resumenSemanal(input.fecha_inicio as string);
      default:
        return { ok: false, error: `Herramienta desconocida: ${name}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ── Buscar clientes ──────────────────────────────────────────────

async function buscarClientes(query: string): Promise<ToolResult> {
  const { data, error } = await supabaseQuotes
    .from('clients')
    .select('id, name, address, city, category')
    .ilike('name', `%${query}%`)
    .limit(8);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ── Obtener sedes ────────────────────────────────────────────────

async function obtenerSedesCliente(clientId: string): Promise<ToolResult> {
  const { data, error } = await supabaseOrders
    .from('maintenance_companies')
    .select('id, name, address, client_id')
    .eq('client_id', clientId)
    .order('name');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ── Listar técnicos ──────────────────────────────────────────────

async function listarTecnicos(): Promise<ToolResult> {
  const { data, error } = await supabaseOrders
    .from('maintenance_users')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ── Consultar agenda ─────────────────────────────────────────────

async function consultarAgenda(fecha: string): Promise<ToolResult> {
  const { data, error } = await supabaseOrders
    .from('orders')
    .select('id, manualId, clientId, sede_id, status, service_time, order_type, notes, estimated_duration, order_technicians(technician_id)')
    .eq('service_date', fecha)
    .order('service_time', { ascending: true, nullsFirst: false });

  if (error) return { ok: false, error: error.message };

  const enriched = await enrichOrders(data || []);
  return { ok: true, data: enriched };
}

// ── Consultar agenda de técnico ──────────────────────────────────

async function consultarAgendaTecnico(
  technicianId: string,
  fechaInicio: string,
  fechaFin?: string
): Promise<ToolResult> {
  const end = fechaFin || fechaInicio;

  const { data: techOrders, error: tErr } = await supabaseOrders
    .from('order_technicians')
    .select('order_id')
    .eq('technician_id', technicianId);

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

  const enriched = await enrichOrders(data || []);
  return { ok: true, data: enriched };
}

// ── Crear orden ──────────────────────────────────────────────────

async function crearOrden(input: Record<string, unknown>): Promise<ToolResult> {
  const manualId = await getNextManualId();
  const id = crypto.randomUUID();
  const techIds = (input.technician_ids as string[] | undefined) || [];
  if (techIds.length === 0) techIds.push(NO_ASIGNADO_ID);

  const orderRow = {
    id,
    manualId,
    clientId:           input.clientId,
    sede_id:            input.sede_id            ?? null,
    status:             'scheduled',
    service_date:       input.service_date,
    service_time:       input.service_time        ?? '07:30',
    order_type:         input.order_type,
    notes:              input.notes               ?? null,
    estimated_duration: input.estimated_duration  ?? null,
  };

  const { error: orderErr } = await supabaseOrdersAdmin.from('orders').insert(orderRow);
  if (orderErr) return { ok: false, error: `Error al insertar orden: ${orderErr.message}` };

  // Verificar que la fila realmente quedó guardada
  const { data: verify } = await supabaseOrdersAdmin.from('orders').select('id').eq('id', id).single();
  if (!verify) return { ok: false, error: 'La orden no se guardó en la base de datos. Verifica que ORDERS_SUPABASE_SERVICE_KEY esté configurada en .env.' };

  const techRows = techIds.map((tid: string) => ({ order_id: id, technician_id: tid }));
  const { error: techErr } = await supabaseOrdersAdmin.from('order_technicians').insert(techRows);
  if (techErr) return { ok: false, error: `Orden creada pero error asignando técnicos: ${techErr.message}` };

  // Insertar items si se proporcionaron
  const items = input.items as Array<{ description: string; quantity: number }> | undefined;
  if (items && items.length > 0) {
    const itemRows = items.map(item => ({
      order_id:    id,
      description: item.description,
      quantity:    item.quantity,
    }));
    const { error: itemErr } = await supabaseOrdersAdmin.from('order_items').insert(itemRows);
    if (itemErr) console.warn(`[crearOrden] items no insertados: ${itemErr.message}`);
  }

  return { ok: true, data: { id, manualId, status: 'scheduled' } };
}

// ── Adjuntar foto ────────────────────────────────────────────────

async function adjuntarFoto(orderId: string, storagePath: string, _caption?: string): Promise<ToolResult> {
  const resolvedId = await resolveOrderId(orderId);
  if (!resolvedId) return { ok: false, error: `No se encontró la orden "${orderId}"` };

  // Leer image_urls actuales
  const { data: order, error: fetchErr } = await supabaseOrdersAdmin
    .from('orders')
    .select('image_urls')
    .eq('id', resolvedId)
    .single();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const existing: string[] = (order?.image_urls as string[] | null) || [];
  const updated = [...existing, storagePath];

  const { error } = await supabaseOrdersAdmin
    .from('orders')
    .update({ image_urls: updated })
    .eq('id', resolvedId);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { attached: true, order_id: resolvedId, total_fotos: updated.length } };
}

// ── Crear cliente ────────────────────────────────────────────────

async function crearCliente(input: Record<string, unknown>): Promise<ToolResult> {
  const manualId = await getNextClientManualId();
  const row: Record<string, unknown> = {
    id:       crypto.randomUUID(),
    manualId,
    name:     input.name,
    category: input.category,
    city:     input.city || 'Buga',
  };
  if (input.address) row.address = input.address;
  if (input.phone)   row.phone   = input.phone;
  if (input.email)   row.email   = input.email;

  const { data, error } = await supabaseQuotesAdmin.from('clients').insert(row).select('id, manualId, name, category, city').single();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'El cliente no se guardó (sin error pero sin datos). Verifica QUOTES_SUPABASE_SERVICE_KEY.' };
  return { ok: true, data };
}

// ── Modificar orden ──────────────────────────────────────────────

async function modificarOrden(
  orderId: string,
  cambios: Record<string, unknown>,
  nuevosTecnicos?: string[]
): Promise<ToolResult> {
  // Resolver UUID si llega manualId
  const resolvedId = await resolveOrderId(orderId);
  if (!resolvedId) return { ok: false, error: `No se encontró la orden "${orderId}"` };

  // Campos permitidos para modificar
  const allowed = ['service_date', 'service_time', 'order_type', 'notes', 'status',
                   'estimated_duration', 'sede_id'];
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in cambios) update[k] = cambios[k];
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabaseOrdersAdmin.from('orders').update(update).eq('id', resolvedId);
    if (error) return { ok: false, error: error.message };
  }

  if (nuevosTecnicos && nuevosTecnicos.length > 0) {
    await supabaseOrdersAdmin.from('order_technicians').delete().eq('order_id', resolvedId);
    const rows = nuevosTecnicos.map(tid => ({ order_id: resolvedId, technician_id: tid }));
    const { error } = await supabaseOrdersAdmin.from('order_technicians').insert(rows);
    if (error) return { ok: false, error: `Error actualizando técnicos: ${error.message}` };
  }

  return { ok: true, data: { id: resolvedId, updated: true } };
}

// ── Buscar orden ─────────────────────────────────────────────────

async function buscarOrden(query: string): Promise<ToolResult> {
  // Intentar por manualId primero
  const isNumeric = /^\d+$/.test(query.trim());

  let data: unknown[] = [];

  if (isNumeric) {
    const { data: d } = await supabaseOrders
      .from('orders')
      .select('id, manualId, clientId, sede_id, status, service_date, service_time, order_type, notes, order_technicians(technician_id)')
      .eq('manualId', query.trim())
      .limit(1);
    data = d || [];
  }

  // Si no encontró por número, buscar por clientId coincidentes
  if (!data.length) {
    const { data: clients } = await supabaseQuotes
      .from('clients')
      .select('id')
      .ilike('name', `%${query}%`)
      .limit(5);

    if (clients?.length) {
      const ids = clients.map((c: { id: string }) => c.id);
      const { data: d } = await supabaseOrders
        .from('orders')
        .select('id, manualId, clientId, sede_id, status, service_date, service_time, order_type, notes, order_technicians(technician_id)')
        .in('clientId', ids)
        .order('service_date', { ascending: false })
        .limit(5);
      data = d || [];
    }
  }

  const enriched = await enrichOrders(data as Record<string, unknown>[]);
  return { ok: true, data: enriched };
}

// ── Resumen semanal ──────────────────────────────────────────────

async function resumenSemanal(fechaInicio: string): Promise<ToolResult> {
  const start = new Date(fechaInicio);
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  const endStr = end.toISOString().split('T')[0];

  const { data, error } = await supabaseOrders
    .from('orders')
    .select('id, status, order_type, order_technicians(technician_id)')
    .gte('service_date', fechaInicio)
    .lte('service_date', endStr);

  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: true, data: { total: 0, message: 'Sin órdenes en esa semana' } };

  // Conteo por tipo de servicio
  const byType: Record<string, number> = {};
  data.forEach((o: Record<string, unknown>) => {
    const types = String(o.order_type || '').split(' • ').map((s: string) => s.trim()).filter(Boolean);
    types.forEach(t => { byType[t] = (byType[t] || 0) + 1; });
  });

  // Conteo por estado
  const byStatus: Record<string, number> = {};
  data.forEach((o: Record<string, unknown>) => {
    const s = String(o.status);
    byStatus[s] = (byStatus[s] || 0) + 1;
  });

  // Técnico más activo
  const techCount: Record<string, number> = {};
  data.forEach((o: Record<string, unknown>) => {
    const techs = o.order_technicians as Array<{ technician_id: string }>;
    (techs || []).forEach(t => {
      if (t.technician_id !== NO_ASIGNADO_ID)
        techCount[t.technician_id] = (techCount[t.technician_id] || 0) + 1;
    });
  });

  // Resolver nombres de técnicos más activos
  const topTechs = Object.entries(techCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const techNames: string[] = [];
  for (const [tid, count] of topTechs) {
    const { data: t } = await supabaseOrders
      .from('maintenance_users')
      .select('name')
      .eq('id', tid)
      .single();
    techNames.push(`${t?.name || tid} (${count})`);
  }

  return {
    ok: true,
    data: {
      semana: `${fechaInicio} al ${endStr}`,
      total: data.length,
      por_tipo: byType,
      por_estado: byStatus,
      tecnicos_mas_activos: techNames,
    },
  };
}

// ----------------------------------------------------------------
// Helpers internos
// ----------------------------------------------------------------

async function getNextManualId(): Promise<string> {
  const { data } = await supabaseOrders
    .from('orders')
    .select('manualId')
    .not('manualId', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data?.length) return '1001';
  const nums = data
    .map((r: { manualId: string }) => parseInt(r.manualId, 10))
    .filter((n: number) => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1001';
}

async function getNextClientManualId(): Promise<string> {
  const { data } = await supabaseQuotes
    .from('clients')
    .select('manualId')
    .not('manualId', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data?.length) return '1001';
  const nums = data
    .map((r: { manualId: string }) => parseInt(r.manualId, 10))
    .filter((n: number) => !isNaN(n));
  return nums.length ? String(Math.max(...nums) + 1) : '1001';
}

async function resolveOrderId(query: string): Promise<string | null> {
  // Si parece UUID devolver directamente
  if (/^[0-9a-f-]{36}$/.test(query)) return query;

  const { data } = await supabaseOrders
    .from('orders')
    .select('id')
    .eq('manualId', query.trim())
    .single();
  return data?.id ?? null;
}

// Enriquece órdenes con nombres de clientes, sedes y técnicos
async function enrichOrders(orders: Record<string, unknown>[]): Promise<unknown[]> {
  if (!orders.length) return [];

  // Recolectar IDs únicos
  const clientIds  = [...new Set(orders.map(o => o.clientId as string).filter(Boolean))];
  const sedeIds    = [...new Set(orders.map(o => o.sede_id  as string).filter(Boolean))];
  const techIds: string[] = [];
  orders.forEach(o => {
    const techs = o.order_technicians as Array<{ technician_id: string }> | undefined;
    (techs || []).forEach(t => { if (!techIds.includes(t.technician_id)) techIds.push(t.technician_id); });
  });

  // Cargar en paralelo
  const [clientsRes, sedesRes, techsRes] = await Promise.all([
    clientIds.length
      ? supabaseQuotes.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] }),
    sedeIds.length
      ? supabaseOrders.from('maintenance_companies').select('id, name, client_id').in('id', sedeIds)
      : Promise.resolve({ data: [] }),
    techIds.length
      ? supabaseOrders.from('maintenance_users').select('id, name').in('id', techIds)
      : Promise.resolve({ data: [] }),
  ]);

  const clientMap = new Map((clientsRes.data || []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const sedeMap   = new Map((sedesRes.data  || []).map((s: { id: string; name: string; client_id: string }) => [s.id, s]));
  const techMap   = new Map((techsRes.data  || []).map((t: { id: string; name: string }) => [t.id, t.name]));

  return orders.map(o => {
    const clientName = clientMap.get(o.clientId as string) || o.clientId;
    const sede       = sedeMap.get(o.sede_id as string);
    const locationName = sede
      ? `${clientMap.get(sede.client_id) || clientName} - ${sede.name}`
      : clientName;

    const techs = (o.order_technicians as Array<{ technician_id: string }> | undefined) || [];
    const techNames = techs
      .map(t => techMap.get(t.technician_id) || t.technician_id)
      .filter(n => n !== 'No Asignado' && n !== NO_ASIGNADO_ID);

    return {
      manualId:           o.manualId,
      location:           locationName,
      status:             o.status,
      service_date:       o.service_date,
      service_time:       o.service_time,
      order_type:         o.order_type,
      notes:              o.notes,
      estimated_duration: o.estimated_duration,
      technicians:        techNames,
    };
  });
}