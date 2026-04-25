import ExcelJS from 'exceljs';
import { supabaseOrders, supabaseQuotes } from './supabase';

// ── Estilos ───────────────────────────────────────────────────────
const ACCENT  = '2B5ED4';
const HDR_FG  = 'FFFFFF';
const ROW_ALT = 'EEF3FB';
const BORDER  = 'CBD5E1';

const STATUS_ES: Record<string, string> = {
  scheduled:   'Programada',
  completed:   'Completada',
  cancelled:   'Cancelada',
  in_progress: 'En progreso',
};

const NO_ASIG_ID = '849dac95-99d8-4f43-897e-7565fec32382';

// ── Store en memoria (TTL 1 hora) ─────────────────────────────────
interface StoreEntry { buffer: Buffer; filename: string; createdAt: number; }
const fileStore = new Map<string, StoreEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [t, f] of fileStore) if (now - f.createdAt > 3_600_000) fileStore.delete(t);
}, 1_800_000);

export function getExcelFile(token: string): StoreEntry | undefined {
  return fileStore.get(token);
}

// ── API pública ───────────────────────────────────────────────────
export async function generarExcel(
  tipo: string,
  params: Record<string, unknown>
): Promise<{ ok: boolean; token?: string; filename?: string; rows?: number; error?: string }> {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MACRIS IA';
    wb.created = new Date();

    let filename = 'reporte.xlsx';
    let rows = 0;

    switch (tipo) {
      case 'agenda':    ({ filename, rows } = await buildAgenda(wb, params));    break;
      case 'historial': ({ filename, rows } = await buildHistorial(wb, params)); break;
      case 'clientes':  ({ filename, rows } = await buildClientes(wb, params));  break;
      default:
        return { ok: false, error: `Tipo "${tipo}" no reconocido. Usa: agenda, historial, clientes.` };
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const token  = crypto.randomUUID();
    fileStore.set(token, { buffer, filename, createdAt: Date.now() });
    return { ok: true, token, filename, rows };

  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Helpers de estilo ─────────────────────────────────────────────

function applyHeader(ws: ExcelJS.Worksheet, headers: string[], widths: number[]) {
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).header = h;
    ws.getColumn(i + 1).width  = widths[i] ?? 15;
  });

  const row = ws.getRow(1);
  row.height = 22;
  row.font      = { bold: true, color: { argb: `FF${HDR_FG}` }, size: 11 };
  row.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ACCENT}` } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.views      = [{ state: 'frozen', ySplit: 1 }];
}

function applyDataRow(row: ExcelJS.Row, idx: number) {
  row.height    = 18;
  row.alignment = { vertical: 'middle', wrapText: false };
  if (idx % 2 === 0) {
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${ROW_ALT}` } };
  }
  row.eachCell(cell => {
    cell.border = { bottom: { style: 'thin', color: { argb: `FF${BORDER}` } } };
  });
}

// ── Reporte: AGENDA ───────────────────────────────────────────────

async function buildAgenda(
  wb: ExcelJS.Workbook,
  p: Record<string, unknown>
): Promise<{ filename: string; rows: number }> {
  const desde = p.fecha_inicio as string;
  const hasta = (p.fecha_fin as string) || desde;

  const { data: orders, error } = await supabaseOrders
    .from('orders')
    .select('id, manualId, clientId, sede_id, status, service_date, service_time, order_type, notes, order_technicians(technician_id)')
    .gte('service_date', desde)
    .lte('service_date', hasta)
    .order('service_date')
    .order('service_time', { nullsFirst: false });

  if (error) throw new Error(error.message);
  if (!orders?.length) throw new Error(`No hay órdenes entre ${desde} y ${hasta}.`);

  // Enrich: clients, sedes, técnicos
  const clientIds = [...new Set(orders.map((o: Record<string,unknown>) => o.clientId as string).filter(Boolean))];
  const sedeIds   = [...new Set(orders.map((o: Record<string,unknown>) => o.sede_id   as string).filter(Boolean))];
  const techIds: string[] = [];
  orders.forEach((o: Record<string,unknown>) =>
    ((o.order_technicians as Array<{ technician_id: string }>) || []).forEach(t => {
      if (!techIds.includes(t.technician_id)) techIds.push(t.technician_id);
    })
  );

  const [cRes, sRes, tRes] = await Promise.all([
    clientIds.length ? supabaseQuotes.from('clients').select('id, name').in('id', clientIds)               : { data: [] },
    sedeIds.length   ? supabaseOrders.from('maintenance_companies').select('id, name').in('id', sedeIds)   : { data: [] },
    techIds.length   ? supabaseOrders.from('maintenance_users').select('id, name').in('id', techIds)       : { data: [] },
  ]);

  const cMap = new Map((cRes.data || []).map((x: { id: string; name: string }) => [x.id, x.name]));
  const sMap = new Map((sRes.data || []).map((x: { id: string; name: string }) => [x.id, x.name]));
  const tMap = new Map((tRes.data || []).map((x: { id: string; name: string }) => [x.id, x.name]));

  const ws = wb.addWorksheet('Agenda');
  applyHeader(ws,
    ['# Orden', 'Cliente', 'Sede', 'Fecha', 'Hora', 'Tipo de Servicio', 'Técnico(s)', 'Estado', 'Notas'],
    [10, 28, 22, 12, 8, 30, 26, 14, 40]
  );

  let rowIdx = 2;
  for (const o of orders as Record<string,unknown>[]) {
    const techs = ((o.order_technicians as Array<{ technician_id: string }>) || [])
      .map(t => tMap.get(t.technician_id) || '')
      .filter(n => n && n !== 'No Asignado' && !n.includes(NO_ASIG_ID))
      .join(', ');

    const row = ws.addRow([
      o.manualId,
      cMap.get(o.clientId as string) || o.clientId,
      sMap.get(o.sede_id  as string) || '',
      o.service_date,
      (o.service_time as string)?.slice(0, 5) || '',
      o.order_type,
      techs,
      STATUS_ES[o.status as string] || o.status,
      o.notes || '',
    ]);
    applyDataRow(row, rowIdx++);
  }

  const fname = `agenda_${desde}${hasta !== desde ? `_al_${hasta}` : ''}.xlsx`;
  return { filename: fname, rows: orders.length };
}

// ── Reporte: HISTORIAL ────────────────────────────────────────────

async function buildHistorial(
  wb: ExcelJS.Workbook,
  p: Record<string, unknown>
): Promise<{ filename: string; rows: number }> {
  const clientId   = p.client_id   as string;
  const clientName = (p.client_name as string) || 'cliente';
  const sedeId     = p.sede_id      as string | undefined;

  let sedeIds: string[] = [];
  if (sedeId) {
    sedeIds = [sedeId];
  } else {
    const { data: sedes } = await supabaseOrders
      .from('maintenance_companies').select('id').eq('client_id', clientId);
    sedeIds = (sedes || []).map((s: { id: string }) => s.id);
  }
  if (!sedeIds.length) throw new Error('El cliente no tiene sedes registradas.');

  const { data, error } = await supabaseOrders
    .from('maintenance_reports')
    .select('id, timestamp, service_type, worker_name, company_id, observations')
    .in('company_id', sedeIds)
    .order('timestamp', { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('No hay registros de historial para este cliente.');

  const { data: sedesData } = await supabaseOrders
    .from('maintenance_companies').select('id, name').in('id', sedeIds);
  const sMap = new Map((sedesData || []).map((s: { id: string; name: string }) => [s.id, s.name]));

  const ws = wb.addWorksheet('Historial');
  applyHeader(ws,
    ['Fecha', 'Hora', 'Tipo de Servicio', 'Técnico', 'Sede', 'Observaciones'],
    [12, 8, 28, 24, 24, 55]
  );
  ws.getColumn(6).alignment = { wrapText: true, vertical: 'top' };

  let rowIdx = 2;
  for (const r of data as Record<string,unknown>[]) {
    const ts    = (r.timestamp as string) || '';
    const fecha = ts.split('T')[0] || '';
    const hora  = ts.split('T')[1]?.slice(0, 5) || '';
    const row = ws.addRow([
      fecha, hora,
      r.service_type,
      r.worker_name,
      sMap.get(r.company_id as string) || r.company_id,
      r.observations || '',
    ]);
    applyDataRow(row, rowIdx++);
  }

  const safe  = clientName.replace(/[^\w\s]/g, '').trim().slice(0, 30).replace(/\s+/g, '_');
  return { filename: `historial_${safe}.xlsx`, rows: data.length };
}

// ── Reporte: CLIENTES ─────────────────────────────────────────────

async function buildClientes(
  wb: ExcelJS.Workbook,
  p: Record<string, unknown>
): Promise<{ filename: string; rows: number }> {
  const query = (p.query as string) || '';

  const { data, error } = await supabaseQuotes
    .from('clients')
    .select('manualId, name, category, city, address, phone, email')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(300);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error(`No se encontraron clientes con "${query}".`);

  const ws = wb.addWorksheet('Clientes');
  applyHeader(ws,
    ['# Cliente', 'Nombre', 'Categoría', 'Ciudad', 'Dirección', 'Teléfono', 'Correo'],
    [11, 34, 14, 16, 34, 16, 30]
  );

  let rowIdx = 2;
  for (const c of data as Record<string,unknown>[]) {
    const row = ws.addRow([
      c.manualId, c.name,
      c.category === 'empresa' ? 'Empresa' : 'Residencial',
      c.city || '', c.address || '', c.phone || '', c.email || '',
    ]);
    applyDataRow(row, rowIdx++);
  }

  const safe = query.replace(/[^\w\s]/g, '').trim().slice(0, 20).replace(/\s+/g, '_') || 'todos';
  return { filename: `clientes_${safe}.xlsx`, rows: data.length };
}