
import { createClient, PostgrestError } from '@supabase/supabase-js';
import { Database, Report, User, Equipment, City, Company, Dependency, Sede, Order, OrderItem, ServiceType, AppSettings, ClientsDatabase, EntityType, EquipmentType, RefrigerantType } from './types';

// --- Supabase Configuration ---
const ORDERS_SUPABASE_URL: string = 'https://fzcalgofrhbqvowazdpk.supabase.co';
const ORDERS_SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o';
const CLIENTS_SUPABASE_URL: string = 'https://ctitnuadeqdwsgulhpjg.supabase.co';
const CLIENTS_SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';

export const supabaseOrders = createClient<Database>(ORDERS_SUPABASE_URL, ORDERS_SUPABASE_ANON_KEY);
export const supabaseClients = createClient<ClientsDatabase>(CLIENTS_SUPABASE_URL, CLIENTS_SUPABASE_ANON_KEY);

const REPORT_LIST_COLUMNS = 'id,timestamp,service_type,observations,equipment_snapshot,items_snapshot,city_id,company_id,dependency_id,worker_id,worker_name,pressure,amperage,is_paid,order_id';
const MAX_IN_CLAUSE = 100;

function chunkArray<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

async function fetchOrderItemsByOrderIds(orderIds: string[]): Promise<OrderItem[]> {
    if (orderIds.length === 0) return [];
    const batches = chunkArray(orderIds, MAX_IN_CLAUSE);
    const responses = await Promise.all(
        batches.map(batch => supabaseOrders.from('order_items').select('*').in('orderId', batch))
    );
    const items: OrderItem[] = [];
    for (const res of responses) {
        if (res.error) throw res.error;
        if (res.data) items.push(...res.data);
    }
    return items;
}

async function fetchOrderTechniciansByOrderIds(orderIds: string[]): Promise<{ order_id: string; technician_id: string }[]> {
    if (orderIds.length === 0) return [];
    const batches = chunkArray(orderIds, MAX_IN_CLAUSE);
    const responses = await Promise.all(
        batches.map(batch => supabaseOrders.from('order_technicians').select('order_id, technician_id').in('order_id', batch))
    );
    const rows: { order_id: string; technician_id: string }[] = [];
    for (const res of responses) {
        if (res.error) throw res.error;
        if (res.data) rows.push(...res.data);
    }
    return rows;
}

async function fetchClientsByIds(clientIds: string[]): Promise<ClientsDatabase['public']['Tables']['clients']['Row'][]> {
    if (clientIds.length === 0) return [];
    const batches = chunkArray(clientIds, MAX_IN_CLAUSE);
    const responses = await Promise.all(
        batches.map(batch => supabaseClients.from('clients').select('*').in('id', batch))
    );
    const clients: ClientsDatabase['public']['Tables']['clients']['Row'][] = [];
    for (const res of responses) {
        if (res.error) throw res.error;
        if (res.data) clients.push(...res.data);
    }
    return clients;
}

const mapDbReportToReport = (dbReport: any): Report => ({
    id: dbReport.id,
    timestamp: dbReport.timestamp,
    serviceType: dbReport.service_type,
    observations: dbReport.observations,
    equipmentSnapshot: dbReport.equipment_snapshot as Report['equipmentSnapshot'],
    itemsSnapshot: (dbReport.items_snapshot as Report['itemsSnapshot']) || null,
    cityId: dbReport.city_id,
    companyId: dbReport.company_id,
    dependencyId: dbReport.dependency_id,
    workerId: dbReport.worker_id,
    workerName: dbReport.worker_name,
    clientSignature: dbReport.client_signature,
    pressure: dbReport.pressure,
    amperage: dbReport.amperage,
    is_paid: dbReport.is_paid || false,
    photo_internal_unit_url: dbReport.photo_internal_unit_url,
    photo_external_unit_url: dbReport.photo_external_unit_url,
    orderId: dbReport.order_id,
});

function isValidUUID(uuid: string): boolean {
    const s = uuid.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Normaliza un término para búsqueda SQL usando comodines fonéticos y espaciales.
 * 'Comfandi' -> '%co_fa_di%' (co_fa_di encontrará comfandi y confandi)
 */
function sqlFuzzyNormalize(term: string): string {
    return `%${term.trim().toLowerCase()
        .replace(/m/g, '_')
        .replace(/n/g, '_')
        .replace(/\s+/g, '%')}%`;
}

function isDateOnlyString(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateInput(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    if (isDateOnlyString(raw)) {
        const [year, month, day] = raw.split('-').map(Number);
        if (!year || !month || !day) return null;
        return new Date(year, month - 1, day, 0, 0, 0, 0);
    }
    const parsed = new Date(raw);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
}

function toUtcRangeStart(value: unknown): string | null {
    const date = parseDateInput(value);
    if (!date) return null;
    if (typeof value === 'string' && isDateOnlyString(value.trim())) {
        date.setHours(0, 0, 0, 0);
    }
    return date.toISOString();
}

function toUtcRangeEnd(value: unknown): { value: string; useLt: boolean } | null {
    const date = parseDateInput(value);
    if (!date) return null;
    if (typeof value === 'string' && isDateOnlyString(value.trim())) {
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 1);
        return { value: date.toISOString(), useLt: true };
    }
    return { value: date.toISOString(), useLt: false };
}

function buildFilteredQuery(filters: any) {
    let query = supabaseOrders.from('maintenance_reports').select(REPORT_LIST_COLUMNS, { count: 'exact' });

    if (filters.cityId) query = query.eq('city_id', filters.cityId);

    if (filters.companyId) {
        const ids = Array.isArray(filters.companyId) ? filters.companyId : [filters.companyId];
        const activeIds = ids.filter((v: string) => v && isValidUUID(v));
        const activeNames = ids.filter((v: string) => v && !isValidUUID(v));

        if (activeIds.length > 0 || activeNames.length > 0) {
            let orConditions: string[] = [];
            if (activeIds.length > 0) orConditions.push(`company_id.in.(${activeIds.join(',')})`);
            
            activeNames.forEach((name: string) => {
                const searchTerm = sqlFuzzyNormalize(name);
                orConditions.push(`equipment_snapshot->>companyName.ilike.${searchTerm}`);
                orConditions.push(`equipment_snapshot->>client_name.ilike.${searchTerm}`);
            });

            if (orConditions.length > 0) {
                query = query.or(orConditions.join(','));
            }
        }
    }
    
    if (filters.techId) query = query.eq('worker_id', filters.techId);
    if (filters.serviceType) query = query.eq('service_type', filters.serviceType);
    if (filters.dateStart) {
        const start = toUtcRangeStart(filters.dateStart);
        if (start) query = query.gte('timestamp', start);
    }
    if (filters.dateEnd) {
        const end = toUtcRangeEnd(filters.dateEnd);
        if (end) query = end.useLt ? query.lt('timestamp', end.value) : query.lte('timestamp', end.value);
    }
    if (filters.paid === 'true' || filters.paid === true) query = query.eq('is_paid', true);
    if (filters.paid === 'false' || filters.paid === false) query = query.eq('is_paid', false);

    if (filters.global && filters.global.trim() !== '') {
        const searchTerm = sqlFuzzyNormalize(filters.global);
        
        const orConditions = [
            `observations.ilike.${searchTerm}`,
            `worker_name.ilike.${searchTerm}`,
            `service_type.ilike.${searchTerm}`,
            `equipment_snapshot->>companyName.ilike.${searchTerm}`,
            `equipment_snapshot->>client_name.ilike.${searchTerm}`,
            `equipment_snapshot->>brand.ilike.${searchTerm}`,
            `equipment_snapshot->>model.ilike.${searchTerm}`,
            `equipment_snapshot->>manualId.ilike.${searchTerm}`
        ].join(',');
        query = query.or(orConditions);
    }
    return query;
}

export async function fetchAllReports(page: number = 0, limit: number = 50, filters: any = {}): Promise<{ reports: Report[], total: number }> {
    const query = buildFilteredQuery(filters);
    const from = page * limit;
    const to = from + limit - 1;

    const { data, error, count } = await query
        .order('timestamp', { ascending: false })
        .range(from, to);

    if (error) throw error;
    return { reports: (data || []).map(mapDbReportToReport), total: count || 0 };
}

export async function fetchUniqueNamesFromSnapshots(): Promise<string[]> {
    // Obtenemos solo las columnas JSONB necesarias para extraer nombres únicos de forma ligera
    const { data, error } = await supabaseOrders
        .from('maintenance_reports')
        .select('equipment_snapshot')
        .limit(2000); // Un límite razonable para el historial

    if (error) return [];
    
    const names = new Set<string>();
    (data as any[]).forEach(r => {
        const snap = r.equipment_snapshot;
        if (snap.companyName) names.add(snap.companyName);
        if (snap.client_name) names.add(snap.client_name);
    });
    return Array.from(names).sort();
}

export async function fetchAllReportsForExport(filters: any): Promise<Report[]> {
    const query = buildFilteredQuery(filters);
    const { data, error } = await query
        .order('timestamp', { ascending: false })
        .limit(10000);

    if (error) throw error;
    return (data || []).map(mapDbReportToReport);
}

export async function fetchReportsForWorker(workerId: string, page: number = 0, limit: number = 50): Promise<{ reports: Report[], total: number }> {
    const from = page * limit;
    const to = from + limit - 1;
    const { data, error, count } = await supabaseOrders
        .from('maintenance_reports')
        .select(REPORT_LIST_COLUMNS, { count: 'exact' })
        .eq('worker_id', workerId)
        .order('timestamp', { ascending: false })
        .range(from, to);
    if (error) throw error;
    return { reports: (data || []).map(mapDbReportToReport), total: count || 0 };
}

export async function fetchReportDetails(reportId: string): Promise<any> {
    const { data, error } = await supabaseOrders.from('maintenance_reports').select('client_signature, photo_internal_unit_url, photo_external_unit_url').eq('id', reportId).single();
    if (error) throw error;
    return data;
}

export async function fetchAppSettings(): Promise<AppSettings> {
    const { data, error } = await supabaseOrders.from('app_settings').select('*');
    if (error) throw error;
    const settings: AppSettings = {};
    if (data) (data as any[]).forEach(s => settings[s.key] = s.value);
    return settings;
}

export async function fetchServiceTypes(): Promise<ServiceType[]> {
    const { data, error } = await supabaseOrders.from('service_types').select('*').order('name');
    if (error) throw error;
    return (data as any) || [];
}

export async function fetchEquipmentTypes(): Promise<EquipmentType[]> {
    const { data, error } = await supabaseOrders.from('maintenance_equipment_types').select('id, name').order('name');
    if (error) throw error;
    return data || [];
}

export async function fetchRefrigerantTypes(): Promise<RefrigerantType[]> {
    const { data, error } = await supabaseOrders.from('maintenance_refrigerant_types').select('id, name').order('name');
    if (error) throw error;
    return data || [];
}

export async function fetchCities(): Promise<City[]> {
    const { data, error } = await supabaseOrders.from('maintenance_cities').select('*').order('name');
    if (error) throw error;
    return (data as any) || [];
}

export async function fetchCompanies(): Promise<Company[]> {
    const { data, error } = await supabaseOrders.from('maintenance_companies').select('*').order('name');
    if (error) throw error;
    return (data as any[] || []).map(db => ({ id: db.id, name: db.name, cityId: db.city_id, clientId: db.client_id, category: db.category }));
}

export async function fetchSedes(): Promise<Sede[]> {
    const { data, error } = await supabaseOrders
        .from('maintenance_companies')
        .select('*')
        .not('client_id', 'is', null)
        .order('name');
    if (error) throw error;
    return (data as any[] || []).map(db => ({
        id: db.id,
        name: db.name,
        address: db.address || null,
        companyId: db.client_id,
        cityId: db.city_id || null,
    }));
}

export async function fetchDependencies(): Promise<Dependency[]> {
    const { data, error } = await supabaseOrders.from('maintenance_dependencies').select('*').order('name');
    if (error) throw error;
    // Map company_id to companyId to match Dependency interface
    return (data as any[] || []).map(db => ({ id: db.id, name: db.name, companyId: db.company_id }));
}

export async function fetchEquipment(): Promise<Equipment[]> {
    const { data, error } = await supabaseOrders.from('maintenance_equipment').select('*, equipment_type:maintenance_equipment_types(id, name), refrigerant_type:maintenance_refrigerant_types(id, name)').order('brand').order('model');
    if (error) throw error;
    return (data || []).map((db: any) => ({
        id: db.id, created_at: db.created_at, manualId: db.manual_id, model: db.model, brand: db.brand, type: db.type,
        typeName: db.equipment_type?.name || db.type || 'N/A', equipment_type_id: db.equipment_type_id,
        refrigerantName: db.refrigerant_type?.name || null, refrigerant_type_id: db.refrigerant_type_id,
        capacity: db.capacity, periodicityMonths: db.periodicity_months, lastMaintenanceDate: db.last_maintenance_date,
        cityId: db.city_id, companyId: db.company_id, dependencyId: db.dependency_id, category: db.category || 'empresa',
        address: db.address, client_name: db.client_name,
    }));
}

export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabaseOrders.from('maintenance_users').select('*');
    if (error) throw error;
    return (data || []).map((db: any) => ({
        id: db.id, username: db.username, password: db.password, role: db.role, name: db.name, cedula: db.cedula,
        isActive: db.is_active !== false, points: db.points || 0,
    }));
}

export async function updateAppSetting(key: string, value: boolean) {
    const { error } = await supabaseOrders.from('app_settings').update({ value }).eq('key', key);
    if (error) throw error;
}

export async function saveEntity(type: EntityType, id: string, formData: FormData) {
    const isEditing = !!id;
    let res: any;
    switch (type) {
        case 'city': res = isEditing ? await supabaseOrders.from('maintenance_cities').update({ name: formData.get('name') as string }).eq('id', id).select().single() : await supabaseOrders.from('maintenance_cities').insert({ name: formData.get('name') as string }).select().single(); break;
        case 'company': res = isEditing ? await supabaseOrders.from('maintenance_companies').update({ name: formData.get('name') as string, city_id: formData.get('city_id') as string }).eq('id', id).select().single() : await supabaseOrders.from('maintenance_companies').insert({ name: formData.get('name') as string, city_id: formData.get('city_id') as string }).select().single(); break;
        case 'dependency': res = isEditing ? await supabaseOrders.from('maintenance_dependencies').update({ name: formData.get('name') as string, company_id: formData.get('company_id') as string }).eq('id', id).select().single() : await supabaseOrders.from('maintenance_dependencies').insert({ name: formData.get('name') as string, company_id: formData.get('company_id') as string }).select().single(); break;
        case 'equipment': 
            const eqData = { brand: formData.get('brand'), model: formData.get('model'), type: formData.get('type'), equipment_type_id: formData.get('equipment_type_id'), city_id: formData.get('city_id'), company_id: formData.get('company_id'), dependency_id: formData.get('dependency_id'), category: formData.get('category') };
            res = isEditing ? await supabaseOrders.from('maintenance_equipment').update(eqData).eq('id', id).select().single() : await supabaseOrders.from('maintenance_equipment').insert(eqData).select().single(); break;
    }
    return res;
}

export async function deleteReport(id: string) { await supabaseOrders.from('maintenance_reports').delete().eq('id', id); }
export async function saveMaintenanceReport(data: any) { await supabaseOrders.from('maintenance_reports').insert(data); }
export async function updateMaintenanceReport(id: string, data: any) { await supabaseOrders.from('maintenance_reports').update(data).eq('id', id); }
export async function awardPointToTechnician(userId: string) { return await supabaseOrders.rpc('increment_user_points', { user_id_to_update: userId, points_to_add: 1 }); }
export async function updateUserPoints(userId: string, points: number) { await supabaseOrders.from('maintenance_users').update({ points }).eq('id', userId); }

export async function fetchAssignedOrders(workerId: string, users: User[]): Promise<Order[]> {
    const { data: assignments, error: assignError } = await supabaseOrders.from('order_technicians').select('order_id').eq('technician_id', workerId);
    if (assignError) throw assignError;
    if (!assignments || assignments.length === 0) return [];
    const orderIds = assignments.map(a => a.order_id);
    const { data: orders, error: ordersError } = await supabaseOrders.from('orders').select('*').in('id', orderIds);
    if (ordersError) throw ordersError;
    if (!orders || orders.length === 0) return [];

    const clientIds = Array.from(new Set(orders.map(o => o.clientId).filter(Boolean)));
    const [items, clients] = await Promise.all([
        fetchOrderItemsByOrderIds(orderIds),
        fetchClientsByIds(clientIds)
    ]);

    const itemsByOrderId = new Map<string, OrderItem[]>();
    items.forEach(item => {
        const list = itemsByOrderId.get(item.orderId) || [];
        list.push(item);
        itemsByOrderId.set(item.orderId, list);
    });

    const clientsById = new Map<string, ClientsDatabase['public']['Tables']['clients']['Row']>();
    clients.forEach(client => clientsById.set(client.id, client));

    const assignedTechs = users.filter(u => u.id === workerId);
    return orders.map((o: any) => ({
        ...o,
        items: itemsByOrderId.get(o.id) || [],
        clientDetails: clientsById.get(o.clientId) || null,
        assignedTechnicians: assignedTechs
    })) as Order[];
}

export async function fetchAllOrdersAndTechnicians(users: User[]): Promise<Order[]> {
    const { data: orders, error } = await supabaseOrders.from('orders').select('*');
    if (error) throw error;
    if (!orders || orders.length === 0) return [];

    const orderIds = orders.map(o => o.id);
    const clientIds = Array.from(new Set(orders.map(o => o.clientId).filter(Boolean)));
    const [items, technicians, clients] = await Promise.all([
        fetchOrderItemsByOrderIds(orderIds),
        fetchOrderTechniciansByOrderIds(orderIds),
        fetchClientsByIds(clientIds)
    ]);

    const itemsByOrderId = new Map<string, OrderItem[]>();
    items.forEach(item => {
        const list = itemsByOrderId.get(item.orderId) || [];
        list.push(item);
        itemsByOrderId.set(item.orderId, list);
    });

    const techIdsByOrderId = new Map<string, Set<string>>();
    technicians.forEach(row => {
        const set = techIdsByOrderId.get(row.order_id) || new Set<string>();
        set.add(row.technician_id);
        techIdsByOrderId.set(row.order_id, set);
    });

    const usersById = new Map(users.map(u => [u.id, u]));
    const clientsById = new Map<string, ClientsDatabase['public']['Tables']['clients']['Row']>();
    clients.forEach(client => clientsById.set(client.id, client));

    return orders.map((o: any) => {
        const techIds = techIdsByOrderId.get(o.id) || new Set<string>();
        const assignedTechnicians = Array.from(techIds)
            .map(id => usersById.get(id))
            .filter((u): u is User => !!u);
        return {
            ...o,
            items: itemsByOrderId.get(o.id) || [],
            clientDetails: clientsById.get(o.clientId) || null,
            assignedTechnicians
        } as Order;
    });
}

export async function deleteEntity(type: EntityType, id: string) {
    let table = '';
    switch(type) {
        case 'city': table = 'maintenance_cities'; break;
        case 'company': table = 'maintenance_companies'; break;
        case 'dependency': table = 'maintenance_dependencies'; break;
        case 'equipment': table = 'maintenance_equipment'; break;
    }
    if (!table) return { error: { message: `Unsupported entity type: ${type}`, code: '0' } };
    return await supabaseOrders.from(table).delete().eq('id', id);
}

export async function deleteAllReports() {
    return await supabaseOrders.from('maintenance_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}

export async function toggleEmployeeStatus(userId: string, currentStatus: boolean) {
    return await supabaseOrders.from('maintenance_users').update({ is_active: !currentStatus }).eq('id', userId);
}

export async function toggleReportPaidStatus(reportId: string, currentStatus: boolean) {
    return await supabaseOrders.from('maintenance_reports').update({ is_paid: !currentStatus }).eq('id', reportId);
}

export async function updateOrderItemQuantity(id: string, quantity: number) {
    return await supabaseOrders.from('order_items').update({ quantity }).eq('id', id);
}

export async function updateOrderStatus(orderId: string, status: string) {
    return await supabaseOrders.from('orders').update({ status }).eq('id', orderId);
}

export async function markCompanyAsResidential(company: Company): Promise<void> {
    const { data: cityData } = await supabaseOrders.from('maintenance_cities').select('name').eq('id', company.cityId).single();
    const cityName = cityData?.name || null;

    const { data: newClient, error: clientErr } = await supabaseClients.from('clients')
        .insert({
            name: company.name,
            category: 'residencial',
            city: cityName,
        })
        .select('id')
        .single();
    
    if (clientErr) throw clientErr;
    const newClientId = newClient.id;

    await supabaseOrders.from('maintenance_reports').update({ client_id: newClientId, company_id: null }).eq('company_id', company.id);
    await supabaseOrders.from('maintenance_equipment').update({ client_id: newClientId, company_id: null }).eq('company_id', company.id);
    await supabaseOrders.from('maintenance_dependencies').update({ client_id: newClientId, company_id: null }).eq('company_id', company.id);

    await supabaseOrders.from('maintenance_companies').delete().eq('id', company.id);
}
