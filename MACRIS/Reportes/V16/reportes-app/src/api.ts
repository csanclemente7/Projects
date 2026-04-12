// --- Report Columns Optimization ---
// Columnas ligeras (sin imágenes ni firmas pesadas)
const REPORT_LIST_COLUMNS = [
    'id',
    'timestamp',
    'service_type',
    'observations',
    'equipment_snapshot',
    'items_snapshot',
    'city_id',
    'company_id',
    'dependency_id',
    'worker_id',
    'worker_name',
    'pressure',
    'amperage',
    'is_paid',
    'order_id',
    'sede_id'
].join(', ');

// Lazy load de campos pesados
export async function fetchReportDetails(reportId: string): Promise<any> {
    const { data, error } = await supabaseOrders
        .from('maintenance_reports')
        .select('client_signature, photo_internal_unit_url, photo_external_unit_url')
        .eq('id', reportId)
        .single();
    if (error) throw error;
    return data;
}
import { createClient, PostgrestError } from '@supabase/supabase-js';
import { Database, Report, User, Equipment, City, Company, Sede, Dependency, Order, OrderItem, ServiceType, AppSettings, ClientsDatabase, EntityType, EquipmentType, RefrigerantType } from './types';
import { addEntityToQueue } from './lib/local-db';
import * as State from './state';

// --- Supabase Configuration ---
// DB for Orders/Maintenance
const ORDERS_SUPABASE_URL: string = 'https://fzcalgofrhbqvowazdpk.supabase.co';
const ORDERS_SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o';

// DB for Clients/Quotes
const CLIENTS_SUPABASE_URL: string = 'https://ctitnuadeqdwsgulhpjg.supabase.co';
const CLIENTS_SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';

const ordersClientOptions = {
    auth: {
        storageKey: 'sb-orders-auth-token',
    },
};

const clientsClientOptions = {
    auth: {
        storageKey: 'sb-clients-auth-token',
    },
};

export const supabaseOrders = createClient<Database>(ORDERS_SUPABASE_URL, ORDERS_SUPABASE_ANON_KEY, ordersClientOptions);
// For the clients DB, since we don't have its full schema, we can use a generic type.
export const supabaseClients = createClient<ClientsDatabase>(CLIENTS_SUPABASE_URL, CLIENTS_SUPABASE_ANON_KEY, clientsClientOptions);

console.log("Supabase clients for Orders and Clients initialized.");

const normalizeEntityName = (value: string): string => value.trim().replace(/\s+/g, ' ');
const normalizeEntityKey = (value: string): string =>
    normalizeEntityName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const normalizeEntityId = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();
const SUPABASE_FETCH_BATCH_SIZE = 1000;
const SUPABASE_IN_FILTER_CHUNK_SIZE = 200;

const splitIntoChunks = <T>(items: T[], chunkSize: number): T[][] => {
    if (chunkSize <= 0) return [items];
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
};

const uniqueNonEmptyStrings = (items: Array<string | null | undefined>): string[] => {
    return [...new Set(items.filter((item): item is string => !!item && item.trim().length > 0))];
};

const fetchAllRows = async <T>(
    queryFactory: () => any,
    entityLabel: string,
    options: { maxRows?: number } = {}
): Promise<T[]> => {
    const maxRows = options.maxRows && options.maxRows > 0 ? options.maxRows : undefined;
    const allRows: T[] = [];
    let from = 0;

    while (true) {
        let to = from + SUPABASE_FETCH_BATCH_SIZE - 1;
        if (maxRows !== undefined) {
            to = Math.min(to, maxRows - 1);
        }
        const { data, error } = await queryFactory().range(from, to);
        if (error) {
            console.error(`Error fetching ${entityLabel} (range ${from}-${to}):`, JSON.stringify(error, null, 2));
            throw error;
        }

        const batch = (data as T[]) || [];
        allRows.push(...batch);
        const requestedBatchSize = to - from + 1;

        if (maxRows !== undefined && allRows.length >= maxRows) {
            allRows.length = maxRows;
            break;
        }

        if (batch.length < requestedBatchSize) {
            break;
        }
        from += SUPABASE_FETCH_BATCH_SIZE;
    }

    return allRows;
};


// --- Data Fetching ---

type OrderWithItems = Database['public']['Tables']['orders']['Row'] & {
    items: Database['public']['Tables']['order_items']['Row'][];
};

export async function fetchAppSettings(): Promise<AppSettings> {
    const { data, error } = await supabaseOrders.from('app_settings').select('*');
    if (error) {
        console.error('Error fetching app settings:', JSON.stringify(error, null, 2));
        throw error;
    }
    const settings: AppSettings = {};
    if (data) {
        (data as any[]).forEach(setting => {
            let parsedValue = setting.value;
            // Si la base de datos devuelve strings 'true' o 'false', los convertimos a booleanos reales
            // para no romper la lógica de la app existente que espera booleanos.
            if (parsedValue === 'true' || parsedValue === 'TRUE') parsedValue = true;
            if (parsedValue === 'false' || parsedValue === 'FALSE') parsedValue = false;
            
            settings[setting.key] = parsedValue;
        });
    }
    return settings;
}

export async function fetchServiceTypes(): Promise<ServiceType[]> {
    return await fetchAllRows<ServiceType>(
        () => supabaseOrders.from('service_types').select('*').order('name'),
        'service types'
    );
}

export async function fetchEquipmentTypes(): Promise<EquipmentType[]> {
    return await fetchAllRows<EquipmentType>(
        () => supabaseOrders.from('maintenance_equipment_types').select('id, name').order('name'),
        'equipment types'
    );
}

export async function fetchRefrigerantTypes(): Promise<RefrigerantType[]> {
    return await fetchAllRows<RefrigerantType>(
        () => supabaseOrders.from('maintenance_refrigerant_types').select('id, name').order('name'),
        'refrigerant types'
    );
}

export async function fetchCities(): Promise<City[]> {
    return await fetchAllRows<City>(
        () => supabaseOrders.from('maintenance_cities').select('*').order('name'),
        'cities'
    );
}

export async function fetchCompanies(): Promise<Company[]> {
    const companyRows = await fetchAllRows<any>(
        () => supabaseClients.from('clients').select('*').eq('category', 'empresa').order('name'),
        'companies'
    );
    return companyRows.map((dbCompany) => ({
        id: dbCompany.id,
        name: dbCompany.name,
        cityId: dbCompany.city || '', // Clients only have string city, real UI city flow is driven by Sede
    }));
}

export async function fetchDependencies(): Promise<Dependency[]> {
    const dependencyRows = await fetchAllRows<any>(
        () => supabaseOrders.from('maintenance_dependencies').select('*').order('name'),
        'dependencies'
    );
    return dependencyRows.map((dbDependency) => ({
        id: dbDependency.id,
        name: dbDependency.name,
        companyId: dbDependency.company_id || dbDependency.client_id,
        sedeId: dbDependency.sede_id || null,
    }));
}

export async function fetchSedes(): Promise<Sede[]> {
    const sedeRows = await fetchAllRows<any>(
        () => supabaseOrders.from('maintenance_companies').select('*').order('name'),
        'sedes'
    );
    return sedeRows.map((dbSede) => ({
        id: dbSede.id,
        name: dbSede.name,
        address: dbSede.address || null,
        companyId: dbSede.client_id || null,
        cityId: dbSede.city_id || null,
        contact_person: dbSede.contact_person || null,
        phone: dbSede.phone || null,
    }));
}

// UNPAGINATED - for heavy client-side tasks like schedule calculation
// FIX: Renamed from _fetchAllEquipment_unpaginated to fix export error.
export async function fetchAllEquipment(): Promise<Equipment[]> {
    const equipmentRows = await fetchAllRows<any>(
        () => supabaseOrders
            .from('maintenance_equipment')
            .select('*, equipment_type:maintenance_equipment_types(id, name), refrigerant_type:maintenance_refrigerant_types(id, name)')
            .order('brand')
            .order('model'),
        'equipment'
    );

    return equipmentRows.map((dbEquipment) => ({
        id: dbEquipment.id,
        created_at: dbEquipment.created_at,
        manualId: dbEquipment.manual_id,
        model: dbEquipment.model,
        brand: dbEquipment.brand,
        type: dbEquipment.type,
        typeName: dbEquipment.equipment_type?.name || dbEquipment.type || 'N/A',
        equipment_type_id: dbEquipment.equipment_type_id,
        refrigerantName: dbEquipment.refrigerant_type?.name || null,
        refrigerant_type_id: dbEquipment.refrigerant_type_id,
        capacity: dbEquipment.capacity,
        periodicityMonths: dbEquipment.periodicity_months,
        lastMaintenanceDate: dbEquipment.last_maintenance_date,
        cityId: dbEquipment.city_id,
        companyId: dbEquipment.company_id,
        dependencyId: dbEquipment.dependency_id,
        category: dbEquipment.category || 'empresa',
        address: dbEquipment.address,
        client_name: dbEquipment.client_name,
        sedeId: dbEquipment.sede_id || null,
    }));
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
    sedeId: dbReport.sede_id || null,
});


// UNPAGINATED - for heavy client-side tasks
// FIX: Renamed from _fetchAllReports_unpaginated to fix export error.
type FetchReportsOptions = { daysBack?: number };

export async function fetchAllReports(options: FetchReportsOptions = {}): Promise<Report[]> {
    const { daysBack } = options;
    let fromTimestamp: string | null = null;
    if (daysBack) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - daysBack);
        fromTimestamp = fromDate.toISOString();
    }

    const reportsData = await fetchAllRows<any>(
        () => {
            let query = supabaseOrders
                .from('maintenance_reports')
                .select(REPORT_LIST_COLUMNS)
                .order('timestamp', { ascending: false })
                .order('id', { ascending: false });
            if (fromTimestamp) {
                query = query.gte('timestamp', fromTimestamp);
            }
            return query;
        },
        'reports list'
    );

    const [pendingSigRows, pendingPhotoRows] = await Promise.all([
        fetchAllRows<any>(
            () => {
                let query = supabaseOrders
                    .from('maintenance_reports')
                    .select('id')
                    .or('client_signature.is.null,client_signature.eq.PENDING_SIGNATURE')
                    .order('id', { ascending: true });
                if (fromTimestamp) {
                    query = query.gte('timestamp', fromTimestamp);
                }
                return query;
            },
            'reports pending signature ids'
        ),
        fetchAllRows<any>(
            () => {
                let query = supabaseOrders
                    .from('maintenance_reports')
                    .select('id')
                    .or('photo_internal_unit_url.is.null,photo_internal_unit_url.eq.PENDING_PHOTO,photo_external_unit_url.is.null,photo_external_unit_url.eq.PENDING_PHOTO')
                    .order('id', { ascending: true });
                if (fromTimestamp) {
                    query = query.gte('timestamp', fromTimestamp);
                }
                return query;
            },
            'reports pending photo ids'
        ),
    ]);

    const pendingSigIds = new Set(pendingSigRows.map((r: any) => r.id));
    const pendingPhotoIds = new Set(pendingPhotoRows.map((r: any) => r.id));

    return reportsData ? reportsData.map((dbReport: any) => {
        const report = mapDbReportToReport(dbReport);
        report.isSignaturePending = pendingSigIds.has(report.id);
        report.arePhotosPending = report.serviceType === 'Montaje/Instalación'
            ? pendingPhotoIds.has(report.id)
            : false;
        return report;
    }) : [];
}

export async function fetchReportsForWorker(workerId: string, options: FetchReportsOptions = {}): Promise<Report[]> {
    const { daysBack } = options;
    let fromTimestamp: string | null = null;
    if (daysBack) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - daysBack);
        fromTimestamp = fromDate.toISOString();
    }

    const reportsData = await fetchAllRows<any>(
        () => {
            let query = supabaseOrders
                .from('maintenance_reports')
                .select(REPORT_LIST_COLUMNS)
                .eq('worker_id', workerId)
                .order('timestamp', { ascending: false })
                .order('id', { ascending: false });
            if (fromTimestamp) {
                query = query.gte('timestamp', fromTimestamp);
            }
            return query;
        },
        `worker ${workerId} reports`
    );

    const [pendingSigRows, pendingPhotoRows] = await Promise.all([
        fetchAllRows<any>(
            () => {
                let query = supabaseOrders
                    .from('maintenance_reports')
                    .select('id')
                    .eq('worker_id', workerId)
                    .or('client_signature.is.null,client_signature.eq.PENDING_SIGNATURE')
                    .order('id', { ascending: true });
                if (fromTimestamp) {
                    query = query.gte('timestamp', fromTimestamp);
                }
                return query;
            },
            `worker ${workerId} pending signature ids`
        ),
        fetchAllRows<any>(
            () => {
                let query = supabaseOrders
                    .from('maintenance_reports')
                    .select('id')
                    .eq('worker_id', workerId)
                    .or('photo_internal_unit_url.is.null,photo_internal_unit_url.eq.PENDING_PHOTO,photo_external_unit_url.is.null,photo_external_unit_url.eq.PENDING_PHOTO')
                    .order('id', { ascending: true });
                if (fromTimestamp) {
                    query = query.gte('timestamp', fromTimestamp);
                }
                return query;
            },
            `worker ${workerId} pending photo ids`
        ),
    ]);

    const pendingSigIds = new Set(pendingSigRows.map((r: any) => r.id));
    const pendingPhotoIds = new Set(pendingPhotoRows.map((r: any) => r.id));

    return reportsData ? reportsData.map((dbReport: any) => {
        const report = mapDbReportToReport(dbReport);
        report.isSignaturePending = pendingSigIds.has(report.id);
        report.arePhotosPending = report.serviceType === 'Montaje/Instalación'
            ? pendingPhotoIds.has(report.id)
            : false;
        return report;
    }) : [];
}


export async function fetchUsers(): Promise<User[]> {
    const userRows = await fetchAllRows<any>(
        () => supabaseOrders.from('maintenance_users').select('*').order('id'),
        'users'
    );
    return userRows.map((dbUser) => ({
        id: dbUser.id,
        username: dbUser.username,
        password: dbUser.password,
        role: dbUser.role,
        name: dbUser.name,
        cedula: dbUser.cedula,
        isActive: dbUser.is_active !== false, // default to true if null/undefined
        points: dbUser.points || 0,
    }));
}


const enrichOrders = async (baseOrders: OrderWithItems[], allUsers: User[]): Promise<Order[]> => {
    if (!baseOrders || baseOrders.length === 0) {
        return [];
    }

    // 1. Get all technician assignments for the given orders
    const orderIds = uniqueNonEmptyStrings(baseOrders.map(o => o.id));
    const allOrderTechnicians: any[] = [];
    for (const orderIdChunk of splitIntoChunks(orderIds, SUPABASE_IN_FILTER_CHUNK_SIZE)) {
        const { data, error: otError } = await supabaseOrders
            .from('order_technicians')
            .select('order_id, technician_id')
            .in('order_id', orderIdChunk);

        if (otError) throw otError;
        allOrderTechnicians.push(...(data || []));
    }

    // 2. Fetch clients in bulk using only the confirmed `clientId` field.
    const uniqueClientIds = uniqueNonEmptyStrings(baseOrders.map(order => order.clientId));
    
    let clients: any[] = [];
    if (uniqueClientIds.length > 0) {
        for (const clientIdChunk of splitIntoChunks(uniqueClientIds, SUPABASE_IN_FILTER_CHUNK_SIZE)) {
            const { data, error: clientsError } = await supabaseClients
                .from('clients')
                .select('*')
                .in('id', clientIdChunk);
            if (clientsError) throw clientsError;
            clients.push(...(data || []));
        }
        if (clients.length === 0) {
            console.warn("[enrichOrders] No matching clients found for the provided client IDs.");
        }
    } else {
        console.warn("[enrichOrders] Orders found but they have no client ID associated. Returning orders without client details.");
    }

    // 3. Create maps for efficient lookup
    const clientsMap = new Map(clients.map(client => [client.id, client]));
    const techniciansMap = new Map((allUsers || []).map(u => [u.id, u]));

    const techniciansByOrderId = new Map<string, User[]>();
    ((allOrderTechnicians as any[]) || []).forEach(ot => {
        const technician = techniciansMap.get(ot.technician_id);
        if (technician) {
            if (!techniciansByOrderId.has(ot.order_id)) {
                techniciansByOrderId.set(ot.order_id, []);
            }
            techniciansByOrderId.get(ot.order_id)!.push(technician);
        }
    });

    // 4. Enrich orders with all details
    return baseOrders.map((dbOrder): Order => {
        const items: OrderItem[] = (dbOrder.items || []).map((item: any): OrderItem => ({
            id: item.id,
            orderId: item.order_id || item.orderId, // Handle both snake and camel depending on the fetch
            itemId: item.item_id || item.itemId,
            manualId: item.manual_id || item.manualId,
            description: item.description,
            quantity: item.quantity,
            completed_quantity: item.completed_quantity,
            price: item.price,
            created_at: item.created_at,
        }));
        
        const mappedOrder: Order = {
            id: dbOrder.id,
            created_at: dbOrder.created_at ?? undefined,
            manualId: (dbOrder as any).manual_id || dbOrder.manualId,
            quoteId: (dbOrder as any).quote_id || dbOrder.quoteId,
            clientId: (dbOrder as any).client_id || dbOrder.clientId,
            sede_id: dbOrder.sede_id || (dbOrder as any).sede_id,
            status: dbOrder.status,
            service_date: dbOrder.service_date,
            service_time: dbOrder.service_time,
            order_type: dbOrder.order_type,
            notes: dbOrder.notes,
            estimated_duration: dbOrder.estimated_duration,
            image_urls: dbOrder.image_urls,
            items: items,
            clientDetails: clientsMap.get(dbOrder.clientId) || null,
            assignedTechnicians: techniciansByOrderId.get(dbOrder.id) || [],
        };
        return mappedOrder;
    });
};

export async function fetchAssignedOrders(technicianId: string, allUsers: User[]): Promise<Order[]> {
    console.log(`Fetching and enriching orders for technician ID: ${technicianId}`);
    try {
        // Step 1: Get order_ids from the junction table
        const technicianOrders = await fetchAllRows<any>(
            () => supabaseOrders
                .from('order_technicians')
                .select('order_id')
                .eq('technician_id', technicianId)
                .order('order_id', { ascending: true }),
            `technician ${technicianId} assigned order IDs`
        );

        if (!technicianOrders || technicianOrders.length === 0) {
            console.log('No orders found for this technician.');
            return [];
        }
        const assignedOrderIds = uniqueNonEmptyStrings((technicianOrders as any[]).map(to => to.order_id));
        console.log("Found assigned order IDs:", assignedOrderIds);

        // Step 2: Get base orders with items from Orders DB
        // OPTIMIZACIÓN OFFLINE: Retener en caché móvil del técnico únicamente:
        // - Órdenes no completadas/canceladas (siempre)
        // - Órdenes finalizadas (completadas/canceladas) de los últimos 30 días únicamente.
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const cutoffString = cutoffDate.toISOString().split('T')[0];

        const baseOrders: any[] = [];
        for (const orderIdChunk of splitIntoChunks(assignedOrderIds, SUPABASE_IN_FILTER_CHUNK_SIZE)) {
            const { data, error: ordersError } = await supabaseOrders
                .from('orders')
                .select('*, items:order_items(*)')
                .in('id', orderIdChunk)
                .or(`status.in.(pending,en_progreso),and(status.in.(completed,cancelada),service_date.gte.${cutoffString})`);

            if (ordersError) throw ordersError;
            baseOrders.push(...(data || []));
        }
        
        console.log("Base orders fetched:", baseOrders);

        if (!baseOrders || baseOrders.length === 0) {
             console.log('Assigned order IDs found, but no matching orders in the orders table.');
             return [];
        }
        
        // Step 3: Enrich the fetched orders
        return await enrichOrders((baseOrders as any) || [], allUsers);

    } catch (error) {
        console.error('Error during order enrichment process:', JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function fetchPaginatedOrders(
    allUsers: User[],
    page: number,
    itemsPerPage: number,
    filters: { startDate?: string; endDate?: string; status?: string; type?: string; technicianId?: string; searchTerm?: string }
): Promise<{ data: Order[]; count: number }> {
    console.log(`Fetching paginated orders for admin view. Page: ${page}`, filters);

    let query = supabaseOrders.from('orders').select('*, items:order_items(*)', { count: 'exact' });

    // Apply filters
    // FIX: Cast filters.status to the specific union type to satisfy Supabase's strict typing.
    if (filters.status) query = query.eq('status', filters.status as "pending" | "en_progreso" | "completed" | "cancelada");
    if (filters.type) query = query.eq('order_type', filters.type);
    if (filters.startDate) query = query.gte('service_date', filters.startDate);
    if (filters.endDate) query = query.lte('service_date', filters.endDate);

    if (filters.technicianId) {
        const techOrders = await fetchAllRows<any>(
            () => supabaseOrders
                .from('order_technicians')
                .select('order_id')
                .eq('technician_id', filters.technicianId)
                .order('order_id', { ascending: true }),
            `filtered technician ${filters.technicianId} order IDs`
        );
        const orderIds = uniqueNonEmptyStrings(techOrders.map(t => t.order_id));
        if (orderIds.length === 0) {
            return { data: [], count: 0 };
        }
        query = query.in('id', orderIds);
    }
    
    // Apply search term. This is tricky as client name is in another DB.
    // We'll have to do a two-step search if a search term is provided.
    // For now, let's search on fields available in the 'orders' table.
    if (filters.searchTerm) {
         query = query.ilike('manualId', `%${filters.searchTerm}%`); // Simple search for now
    }
    
    // Apply pagination
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage - 1;
    query = query.range(startIndex, endIndex).order('created_at', { ascending: false });

    const { data: baseOrders, error: ordersError, count } = await query;
    if (ordersError) throw ordersError;

    const enrichedData = await enrichOrders((baseOrders as any) || [], allUsers);

    // If search term exists, we might need to filter again on client name client-side
    // This is a trade-off for performance without a complex DB function.
    let finalData = enrichedData;
    if (filters.searchTerm) {
        finalData = enrichedData.filter(order => 
            [
                order.manualId,
                order.clientDetails?.name,
                order.clientDetails?.address,
                order.order_type,
                order.assignedTechnicians?.map(t => t.name).join(' ')
            ].join(' ').toLowerCase().includes(filters.searchTerm!.toLowerCase())
        );
    }

    return { data: finalData, count: count || 0 };
}

type FetchAllOrdersOptions = { daysBack?: number; limit?: number };

export async function fetchAllEnrichedOrders(allUsers: User[], options: FetchAllOrdersOptions = {}): Promise<Order[]> {
    const { daysBack = 90, limit = 300 } = options;
    const logParts = [];
    if (daysBack) logParts.push(`últimos ${daysBack} días`);
    if (limit) logParts.push(`límite ${limit}`);
    console.log(`Fetching enriched orders (${logParts.join(', ') || 'sin filtro'}).`);

    let fromServiceDate: string | null = null;
    if (daysBack) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - daysBack);
        fromServiceDate = fromDate.toISOString().substring(0, 10);
    }

    const baseOrders = await fetchAllRows<any>(
        () => {
            let query = supabaseOrders
                .from('orders')
                .select('*, items:order_items(*)')
                .order('created_at', { ascending: false })
                .order('id', { ascending: false });
            if (fromServiceDate) {
                query = query.gte('service_date', fromServiceDate);
            }
            return query;
        },
        'all enriched orders base rows',
        { maxRows: limit || undefined }
    );
    
    if (!baseOrders || baseOrders.length === 0) {
        return [];
    }

    // Now enrich them
    return await enrichOrders((baseOrders as any) || [], allUsers);
}


// --- Data Mutation ---

export async function updateAppSetting(key: string, value: boolean) {
    const { error } = await supabaseOrders
        .from('app_settings')
        .update({ value: value })
        .eq('key', key);
    if (error) {
        console.error(`Error updating setting ${key}:`, JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function saveEntity(type: EntityType, id: string, formData: FormData): Promise<{ data: any; error: PostgrestError | null; }> {
    const normalizedEntityId = normalizeEntityId(id);
    const isEditing = !!normalizedEntityId;

    // --- OFFLINE CREATION LOGIC (as a helper) ---
    const saveToOfflineQueue = async () => {
        console.log(`[Offline] Saving new entity of type "${type}" locally.`);
        const localId = `local_${crypto.randomUUID()}`;

        // Build the payload object from FormData, ensuring snake_case for DB columns
        let payload: any;
        if (type === 'company') {
            payload = { id: localId, name: formData.get('name') as string, city_id: formData.get('city_id') as string };
        } else if (type === 'city') {
            payload = { id: localId, name: formData.get('name') as string };
        } else if (type === 'dependency') {
            payload = { id: localId, name: formData.get('name') as string, company_id: formData.get('company_id') as string };
        } else if (type === 'equipmentType' || type === 'refrigerant') {
            payload = { id: localId, name: formData.get('new_value') as string };
        } else {
            payload = { id: localId };
            // This fallback caused the bug, but is kept for other potential types. The specific cases above are now the fix.
            formData.forEach((value, key) => {
                if (key !== 'id' && key !== 'type') {
                    // Correctly map form names to payload property names
                    if (key === 'new_value') {
                        payload['name'] = value;
                    } else {
                        payload[key] = value;
                    }
                }
            });
        }

        await addEntityToQueue({
            localId: localId,
            type: type,
            payload: payload,
            status: 'pending_sync'
        });

        // Mimic a Supabase response so the UI handler can process it consistently.
        const returnedData = {
            id: payload.id, // The temporary local ID
            name: payload.name,
            ...(type === 'company' && { city_id: payload.city_id }),
            ...(type === 'dependency' && { company_id: payload.company_id }),
        };

        return { data: returnedData, error: null };
    };

    // --- ONLINE LOGIC (as a helper) ---
    const onlineRequest = async () => {
        let result: { data: any; error: PostgrestError | null; };
        const newValue = formData.get('new_value') as string;

        switch (type) {
            case 'city':
                const cityData = { name: formData.get('name') as string };
                result = isEditing
                    ? await supabaseOrders.from('maintenance_cities').update(cityData).eq('id', normalizedEntityId).select().single()
                    : await supabaseOrders.from('maintenance_cities').insert(cityData).select().single();
                break;
            case 'company':
                const companyData = { name: formData.get('name') as string, city_id: formData.get('city_id') as string };
                result = isEditing
                    ? await supabaseOrders.from('maintenance_companies').update(companyData).eq('id', normalizedEntityId).select().single()
                    : await supabaseOrders.from('maintenance_companies').insert(companyData).select().single();
                break;
            case 'dependency':
                const rawCompanyId = ((formData.get('company_id') as string) || '').trim();
                const isClientDirect = !!State.companies.find(c => c.id === rawCompanyId);

                const dependencyData: any = {
                    name: normalizeEntityName((formData.get('name') as string) || ''),
                };

                if (isClientDirect) {
                    dependencyData.client_id = rawCompanyId;
                    dependencyData.company_id = null; // Let's hope the DB allows null if it's a direct client
                } else {
                    dependencyData.company_id = rawCompanyId;
                }

                if (!rawCompanyId) {
                    throw new Error('Debe seleccionar una empresa o sede para la dependencia.');
                }
                if (!dependencyData.name) {
                    throw new Error('El nombre de la dependencia es obligatorio.');
                }

                // Server-side guard
                let existingDependenciesQuery = supabaseOrders
                    .from('maintenance_dependencies')
                    .select('id, name, company_id, client_id')
                    .or(`company_id.eq.${rawCompanyId},client_id.eq.${rawCompanyId}`);

                if (isEditing) {
                    existingDependenciesQuery = existingDependenciesQuery.neq('id', normalizedEntityId);
                }

                const { data: existingDependencies, error: existingDependenciesError } = await existingDependenciesQuery;

                if (!existingDependenciesError) {
                    const dependencyKey = normalizeEntityKey(dependencyData.name);
                    const duplicateDependency = (existingDependencies || []).find((row: any) =>
                        normalizeEntityKey((row?.name as string) || '') === dependencyKey
                    );
                    if (duplicateDependency) {
                        throw new Error(`La dependencia "${dependencyData.name}" ya existe para este destino.`);
                    }
                }

                result = isEditing
                    ? await supabaseOrders.from('maintenance_dependencies').update(dependencyData).eq('id', normalizedEntityId).select().single()
                    : await supabaseOrders.from('maintenance_dependencies').insert(dependencyData).select().single();
                break;
            case 'employee':
                const cedula = formData.get('cedula') as string;
                const password = formData.get('password') as string;
                if (isEditing) {
                    const employeeUpdateData: Database['public']['Tables']['maintenance_users']['Update'] = { name: formData.get('name') as string, cedula: cedula, username: cedula, role: 'worker' };
                    if (password) employeeUpdateData.password = password;
                    result = await supabaseOrders.from('maintenance_users').update(employeeUpdateData).eq('id', normalizedEntityId).select().single();
                } else {
                    if (!cedula) throw new Error("Cédula is required to create a new employee.");
                    const employeeInsertData: Database['public']['Tables']['maintenance_users']['Insert'] = { name: formData.get('name') as string, cedula: cedula, username: cedula, role: 'worker', password: password || cedula };
                    result = await supabaseOrders.from('maintenance_users').insert(employeeInsertData).select().single();
                }
                break;
            case 'equipmentType':
                if (!newValue) throw new Error("El nombre del tipo de equipo no puede estar vacío.");
                result = await supabaseOrders.from('maintenance_equipment_types').insert({ name: newValue }).select().single();
                break;
            case 'refrigerant':
                if (!newValue) throw new Error("El nombre del refrigerante no puede estar vacío.");
                result = await supabaseOrders.from('maintenance_refrigerant_types').insert({ name: newValue }).select().single();
                break;
            case 'equipment':
                const equipmentData: Database['public']['Tables']['maintenance_equipment']['Insert'] = { manual_id: (formData.get('manual_id') as string) || null, brand: formData.get('brand') as string, model: formData.get('model') as string, type: formData.get('type') as string, equipment_type_id: formData.get('equipment_type_id') as string, refrigerant_type_id: (formData.get('refrigerant_type_id') as string) || null, capacity: (formData.get('capacity') as string) || null, periodicity_months: Number(formData.get('periodicityMonths')), last_maintenance_date: (formData.get('lastMaintenanceDate') as string) || null, category: formData.get('category') as string, city_id: formData.get('city_id') as string, company_id: formData.get('category') === 'empresa' ? (formData.get('company_id') as string) : null, dependency_id: formData.get('category') === 'empresa' ? (formData.get('dependency_id') as string) : null, client_name: formData.get('category') === 'residencial' ? (formData.get('client_name') as string) : null, address: formData.get('category') === 'residencial' ? (formData.get('address') as string) : null };
                result = isEditing
                    ? await supabaseOrders.from('maintenance_equipment').update(equipmentData).eq('id', normalizedEntityId).select().single()
                    : await supabaseOrders.from('maintenance_equipment').insert(equipmentData).select().single();
                break;
            default:
                throw new Error(`Unknown entity type: ${type}`);
        }
        if (result.error) throw result.error;
        return result;
    }

    // --- MAIN EXECUTION LOGIC ---
    try {
        return await onlineRequest();
    } catch (error: any) {
        // The Supabase client wraps the network TypeError in its own error object.
        // We must inspect the message string instead of checking `instanceof TypeError`.
        const message = String(error?.message || '');
        const isNetworkError = /Failed to fetch|NetworkError|Network request failed|Load failed/i.test(message);
        
        if (!isEditing && isNetworkError) {
            // Fall back to offline queue if it's a network error during creation
            console.log("[Offline Fallback] Network error detected. Saving to local queue.");
            return saveToOfflineQueue();
        } else {
            // For edits, or for non-network errors, let the caller handle it.
            console.error('API Error during entity save:', error);
            const isDependencyDuplicateError = type === 'dependency' &&
                (error?.code === '23505' || /duplicate|ya existe|already exists/i.test(message));
            const friendlyMessage = isDependencyDuplicateError
                ? 'La dependencia ya existe para la empresa seleccionada.'
                : message;
            // Shape the error to be consistent with a PostgrestError for the handler
            // FIX: Add 'name' property to satisfy the PostgrestError type, which requires it.
            return {
                data: null,
                error: {
                    name: 'APIError',
                    message: friendlyMessage,
                    details: error.details || '',
                    hint: error.hint || '',
                    code: error.code || ''
                } as PostgrestError
            };
        }
    }
}


export async function deleteEntity(type: 'city'|'company'|'dependency'|'equipment', id: string) {
    let tableName: string;

    switch (type) {
        case 'city':
            tableName = 'maintenance_cities';
            break;
        case 'company':
            tableName = 'maintenance_companies';
            break;
        case 'dependency':
            tableName = 'maintenance_dependencies';
            break;
        case 'equipment':
            tableName = 'maintenance_equipment';
            break;
        default:
            // This case should be unreachable with the current types, but it's good practice
            throw new Error(`Invalid entity type for deletion: ${type}`);
    }

    return await supabaseOrders.from(tableName).delete().eq('id', id);
}

export async function deleteReport(id: string) {
    const { error } = await supabaseOrders.from('maintenance_reports').delete().eq('id', id);
    if (error) {
        console.error("Error deleting report:", JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function deleteAllReports() {
    const { error } = await supabaseOrders.from('maintenance_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    if (error) {
        console.error("Error deleting all reports:", JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function toggleEmployeeStatus(userId: string, currentStatus: boolean) {
    const { error } = await supabaseOrders.from('maintenance_users').update({ is_active: !currentStatus }).eq('id', userId);
    if (error) {
        console.error("Error toggling employee status:", JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function saveMaintenanceReport(reportData: Database['public']['Tables']['maintenance_reports']['Insert']) {
    // Potentially upload photos to storage here first if they are not base64
    const { error } = await supabaseOrders.from('maintenance_reports').insert(reportData);
    if (error) throw error;
}

export async function upsertMaintenanceReport(reportData: Database['public']['Tables']['maintenance_reports']['Insert']) {
    const { error } = await supabaseOrders.from('maintenance_reports').upsert(reportData);
    if (error) throw error;
}

export async function updateMaintenanceReport(reportId: string, reportData: Database['public']['Tables']['maintenance_reports']['Update']) {
    const { error } = await supabaseOrders.from('maintenance_reports').update(reportData).eq('id', reportId);
    if (error) throw error;
}

export async function toggleReportPaidStatus(reportId: string, currentStatus: boolean) {
    const { error } = await supabaseOrders.from('maintenance_reports').update({ is_paid: !currentStatus }).eq('id', reportId);
    if (error) {
        console.error("Error toggling paid status:", JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function updateOrderItemQuantity(orderItemId: string, quantity: number) {
    const { error } = await supabaseOrders
        .from('order_items')
        .update({ quantity: quantity })
        .eq('id', orderItemId);
    
    if (error) {
        console.error("Error updating item quantity:", JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function updateOrderStatus(orderId: string, status: Order['status']) {
    const { error } = await supabaseOrders
        .from('orders')
        .update({ status: status })
        .eq('id', orderId);

    if (error) {
        console.error(`Error updating order status to ${status}:`, JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function awardPointToTechnician(userId: string) {
    // FIX: The Supabase client's generated types did not include RPC functions.
    // This has been fixed by adding the function signature to `src/types.ts`,
    // making the `as any` cast unnecessary.
    const { error } = await supabaseOrders.rpc('increment_user_points', {
        user_id_to_update: userId,
        points_to_add: 1,
    });

    if (error) {
        console.error('Error awarding point:', JSON.stringify(error, null, 2));
        // We don't throw an error here because the main operation (saving report) was successful.
        // We'll just log it and maybe show a non-critical notification.
        return { error };
    }
    return { error: null };
}

export async function updateUserPoints(userId: string, newTotalPoints: number) {
    const { error } = await supabaseOrders
        .from('maintenance_users')
        .update({ points: newTotalPoints })
        .eq('id', userId);
    if (error) {
        console.error("Error updating user points:", JSON.stringify(error, null, 2));
        throw error;
    }
}

export async function incrementOrderItemCompletedQuantity(orderItemId: string) {
    const { data: itemData, error: fetchError } = await supabaseOrders
        .from('order_items')
        .select('completed_quantity, quantity, orderId')
        .eq('id', orderItemId)
        .single();
    if (fetchError) throw fetchError;
    
    // cast to any to avoid typescript inferring an error from the query format when it has no valid inference
    const typedItemData = itemData as any;

    const newQuantity = (typedItemData.completed_quantity || 0) + 1;
    const { error: updateError } = await supabaseOrders
        .from('order_items')
        .update({ completed_quantity: newQuantity })
        .eq('id', orderItemId);
        
    if (updateError) throw updateError;
    
    return { newQuantity, maxQuantity: typedItemData.quantity, orderId: typedItemData.orderId };
}

export async function checkAndCompleteOrderIfFinished(orderId: string) {
    const { data: items, error: fetchError } = await supabaseOrders
        .from('order_items')
        .select('completed_quantity, quantity, description')
        .eq('orderId', orderId); // using mapped column name
        
    if (fetchError) throw fetchError;
    
    const isServiceItem = (desc: string) => /mano de obra|montaje|instalaci[oó]n|desmonte|mantenimiento/i.test(desc);
    const serviceItems = (items || []).filter((item: any) => isServiceItem(item.description));
    
    // If no service items or all service items are complete, mark as complete.
    // If there were no service items at front, it could technically complete right away, 
    // but in practice orders always have at least 1 service item.
    let isCompleted = false;
    if (serviceItems.length > 0) {
        isCompleted = serviceItems.every((item: any) => (item.completed_quantity || 0) >= item.quantity);
    } else {
        // Fallback for older orders without recognizable keyword: check all items
        isCompleted = (items || []).every((item: any) => (item.completed_quantity || 0) >= item.quantity);
    }

    if (isCompleted) {
        await updateOrderStatus(orderId, 'completed');
    }
    return isCompleted;
}
