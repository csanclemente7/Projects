import { createClient, PostgrestError } from '@supabase/supabase-js';
import { Database, Report, User, Equipment, City, Company, Sede, Dependency, Order, OrderItem, ServiceType, AppSettings, ClientsDatabase, EntityType, EquipmentType, RefrigerantType } from './types';

// --- Supabase Configuration ---
const ORDERS_SUPABASE_URL: string = 'https://fzcalgofrhbqvowazdpk.supabase.co';
const ORDERS_SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o';

const CLIENTS_SUPABASE_URL: string = 'https://ctitnuadeqdwsgulhpjg.supabase.co';
const CLIENTS_SUPABASE_ANON_KEY: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';

export const supabaseOrders = createClient<Database>(ORDERS_SUPABASE_URL, ORDERS_SUPABASE_ANON_KEY);
export const supabaseClients = createClient<ClientsDatabase>(CLIENTS_SUPABASE_URL, CLIENTS_SUPABASE_ANON_KEY);

type OrderWithItems = Database['public']['Tables']['orders']['Row'] & {
    items: Database['public']['Tables']['order_items']['Row'][];
};

const normalizeLookupKey = (value: string | null | undefined): string =>
    (value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SUPABASE_FETCH_BATCH_SIZE = 1000;

async function fetchAllRows<T>(queryFactory: () => any): Promise<T[]> {
    const allRows: T[] = [];
    let from = 0;

    while (true) {
        const to = from + SUPABASE_FETCH_BATCH_SIZE - 1;
        const { data, error } = await queryFactory().range(from, to);
        if (error) throw error;

        const batch = (data as T[]) || [];
        allRows.push(...batch);

        if (batch.length < SUPABASE_FETCH_BATCH_SIZE) {
            break;
        }

        from += SUPABASE_FETCH_BATCH_SIZE;
    }

    return allRows;
}

async function getNextClientManualId(): Promise<string> {
    const { data, error } = await supabaseClients
        .from('clients')
        .select('manualId')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) {
        console.warn('Could not fetch remote next client ID, using fallback.', error);
        return '101';
    }

    const maxId = parseInt(data[0].manualId, 10);
    return isNaN(maxId) ? '101' : (maxId + 1).toString();
}

export async function fetchAppSettings(): Promise<AppSettings> {
    const { data, error } = await supabaseOrders.from('app_settings').select('*');
    if (error) throw error;
    const settings: AppSettings = {};
    if (data) {
        (data as any[]).forEach(setting => {
            settings[setting.key] = setting.value;
        });
    }
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
    const [{ data, error }, { data: cities, error: citiesError }] = await Promise.all([
        supabaseClients.from('clients').select('*').eq('category', 'empresa').order('name'),
        supabaseOrders.from('maintenance_cities').select('id, name')
    ]);

    if (error) throw error;
    if (citiesError) throw citiesError;

    const cityMap = new Map(
        ((cities as { id: string; name: string }[]) || []).map(city => [normalizeLookupKey(city.name), city])
    );

    if (data) {
        return data.map((dbCompany) => {
            const matchedCity = dbCompany.city ? cityMap.get(normalizeLookupKey(dbCompany.city)) : null;
            return {
                id: dbCompany.id,
                manualId: dbCompany.manualId,
                name: dbCompany.name,
                cityId: matchedCity?.id || '',
                cityName: dbCompany.city || matchedCity?.name || null,
            };
        });
    }
    return [];
}

export async function fetchSedes(): Promise<Sede[]> {
    const { data, error } = await supabaseOrders.from('maintenance_companies').select('*').order('name');
    if (error) throw error;
    if (data) {
        return data.map((dbSede) => ({
            id: dbSede.id,
            name: dbSede.name,
            companyId: dbSede.client_id || dbSede.id, // Fallback to its own ID if it's a legacy company acting as a sede
            cityId: dbSede.city_id || null,
            address: dbSede.address || null
        }));
    }
    return [];
}

export async function fetchDependencies(): Promise<Dependency[]> {
    const data = await fetchAllRows<any>(() =>
        supabaseOrders.from('maintenance_dependencies').select('*').order('name')
    );
    if (data) {
        return data.map((dbDependency) => ({
            id: dbDependency.id,
            name: dbDependency.name,
            companyId: dbDependency.company_id || dbDependency.client_id || '',
            clientId: dbDependency.client_id || null,
            sedeId: dbDependency.sede_id || null,
        }));
    }
    return [];
}

export async function fetchEquipment(): Promise<Equipment[]> {
    const { data, error } = await supabaseOrders
      .from('maintenance_equipment')
      .select('*, equipment_type:maintenance_equipment_types(id, name), refrigerant_type:maintenance_refrigerant_types(id, name)')
      .order('brand')
      .order('model');

    if (error) throw error;
    if (data) {
        return data.map((dbEquipment: any) => ({
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
            companyId: dbEquipment.client_id || dbEquipment.company_id,
            dependencyId: dbEquipment.dependency_id,
            category: dbEquipment.category || 'empresa',
            address: dbEquipment.address,
            client_name: dbEquipment.client_name,
            sedeId: dbEquipment.sede_id || (dbEquipment.client_id ? dbEquipment.company_id : null),
        }));
    }
    return [];
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
    sedeId: dbReport.sede_id,
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

// Lightweight columns for list views (EXCLUDES signatures and photos)
const REPORT_LIST_COLUMNS = 'id,timestamp,service_type,observations,equipment_snapshot,items_snapshot,city_id,company_id,sede_id,dependency_id,worker_id,worker_name,pressure,amperage,is_paid,order_id';

export async function fetchAllReports(): Promise<Report[]> {
    const { data: reportsData, error } = await supabaseOrders
        .from('maintenance_reports')
        .select(REPORT_LIST_COLUMNS)
        .order('timestamp', { ascending: false })
        .limit(2000);

    if (error) throw error;
    if (!reportsData || reportsData.length === 0) return [];

    const pendingSigPromise = supabaseOrders
        .from('maintenance_reports')
        .select('id')
        .or('client_signature.is.null,client_signature.eq.PENDING_SIGNATURE');
        
    const pendingPhotosPromise = supabaseOrders
        .from('maintenance_reports')
        .select('id')
        .eq('service_type', 'Montaje/Instalación')
        .or('photo_internal_unit_url.is.null,photo_external_unit_url.is.null,photo_internal_unit_url.eq.PENDING_PHOTO,photo_external_unit_url.eq.PENDING_PHOTO');

    const [sigResult, photoResult] = await Promise.all([pendingSigPromise, pendingPhotosPromise]);
    
    const pendingSigIds = new Set(sigResult.data?.map(r => r.id));
    const pendingPhotoIds = new Set(photoResult.data?.map(r => r.id));

    return reportsData.map(dbReport => {
        const report = mapDbReportToReport(dbReport);
        report.isSignaturePending = pendingSigIds.has(report.id);
        report.arePhotosPending = pendingPhotoIds.has(report.id);
        return report;
    });
}

export async function fetchReportsForWorker(workerId: string): Promise<Report[]> {
    const { data: reportsData, error } = await supabaseOrders
        .from('maintenance_reports')
        .select(REPORT_LIST_COLUMNS)
        .eq('worker_id', workerId)
        .order('timestamp', { ascending: false })
        .limit(1000);
        
    if (error) throw error;
    if (!reportsData || reportsData.length === 0) return [];

    const pendingSigPromise = supabaseOrders
        .from('maintenance_reports')
        .select('id')
        .eq('worker_id', workerId)
        .or('client_signature.is.null,client_signature.eq.PENDING_SIGNATURE');
        
    const pendingPhotosPromise = supabaseOrders
        .from('maintenance_reports')
        .select('id')
        .eq('worker_id', workerId)
        .eq('service_type', 'Montaje/Instalación')
        .or('photo_internal_unit_url.is.null,photo_external_unit_url.is.null,photo_internal_unit_url.eq.PENDING_PHOTO,photo_external_unit_url.eq.PENDING_PHOTO');

    const [sigResult, photoResult] = await Promise.all([pendingSigPromise, pendingPhotosPromise]);
    
    const pendingSigIds = new Set(sigResult.data?.map(r => r.id));
    const pendingPhotoIds = new Set(photoResult.data?.map(r => r.id));

    return reportsData.map(dbReport => {
        const report = mapDbReportToReport(dbReport);
        report.isSignaturePending = pendingSigIds.has(report.id);
        report.arePhotosPending = pendingPhotoIds.has(report.id);
        return report;
    });
}

export async function fetchReportDetails(reportId: string): Promise<any> {
    const { data, error } = await supabaseOrders
        .from('maintenance_reports')
        .select('client_signature, photo_internal_unit_url, photo_external_unit_url')
        .eq('id', reportId)
        .single();
    
    if (error) throw error;
    return data;
}

export async function fetchUsers(): Promise<User[]> {
    const { data, error } = await supabaseOrders.from('maintenance_users').select('*');
    if (error) throw error;
    if (data) {
        return data.map((dbUser) => ({
            id: dbUser.id,
            username: dbUser.username,
            password: dbUser.password,
            role: dbUser.role,
            name: dbUser.name,
            cedula: dbUser.cedula,
            isActive: dbUser.is_active !== false,
            points: dbUser.points || 0,
        }));
    }
    return [];
}

const enrichOrders = async (baseOrders: OrderWithItems[], allUsers: User[]): Promise<Order[]> => {
    if (!baseOrders || baseOrders.length === 0) return [];
    const orderIds = baseOrders.map(o => o.id);
    const { data: allOrderTechnicians, error: otError } = await supabaseOrders
        .from('order_technicians')
        .select('order_id, technician_id')
        .in('order_id', orderIds);

    if (otError) throw otError;
    const uniqueClientIds = [...new Set(baseOrders.map(order => order.clientId).filter(id => !!id))];
    
    let clients: any[] = [];
    if (uniqueClientIds.length > 0) {
        const { data, error: clientsError } = await supabaseClients
            .from('clients')
            .select('*')
            .in('id', uniqueClientIds as string[]);
        if (clientsError) throw clientsError;
        clients = data || [];
    }

    const clientsMap = new Map(clients.map(client => [client.id, client]));
    const techniciansMap = new Map((allUsers || []).map(u => [u.id, u]));
    const techniciansByOrderId = new Map<string, User[]>();
    ((allOrderTechnicians as any[]) || []).forEach(ot => {
        const technician = techniciansMap.get(ot.technician_id);
        if (technician) {
            if (!techniciansByOrderId.has(ot.order_id)) techniciansByOrderId.set(ot.order_id, []);
            techniciansByOrderId.get(ot.order_id)!.push(technician);
        }
    });

    return baseOrders.map((dbOrder): Order => {
        const items: OrderItem[] = (dbOrder.items || []).map((item: any): OrderItem => ({
            id: item.id,
            orderId: item.orderId,
            itemId: item.itemId,
            manualId: item.manualId,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            created_at: item.created_at,
        }));
        
        return {
            id: dbOrder.id,
            created_at: dbOrder.created_at ?? undefined,
            manualId: dbOrder.manualId,
            quoteId: dbOrder.quoteId,
            clientId: dbOrder.clientId,
            status: dbOrder.status,
            service_date: dbOrder.service_date,
            service_time: dbOrder.service_time,
            order_type: dbOrder.order_type,
            notes: dbOrder.notes,
            estimated_duration: dbOrder.estimated_duration,
            items: items,
            clientDetails: clientsMap.get(dbOrder.clientId) || null,
            assignedTechnicians: techniciansByOrderId.get(dbOrder.id) || [],
        };
    });
};

export async function fetchAssignedOrders(technicianId: string, allUsers: User[]): Promise<Order[]> {
    const { data: technicianOrders, error: technicianOrdersError } = await supabaseOrders
        .from('order_technicians')
        .select('order_id')
        .eq('technician_id', technicianId);

    if (technicianOrdersError) throw technicianOrdersError;
    if (!technicianOrders || technicianOrders.length === 0) return [];
    const assignedOrderIds = (technicianOrders as any[]).map(to => to.order_id);
    const { data: baseOrders, error: ordersError } = await supabaseOrders
        .from('orders')
        .select('*, items:order_items(*)')
        .in('id', assignedOrderIds);

    if (ordersError) throw ordersError;
    return await enrichOrders((baseOrders as any) || [], allUsers);
}

export async function fetchAllOrdersAndTechnicians(allUsers: User[]): Promise<Order[]> {
    const { data: baseOrders, error: ordersError } = await supabaseOrders
        .from('orders')
        .select('*, items:order_items(*)');
    if (ordersError) throw ordersError;
    return await enrichOrders((baseOrders as any) || [], allUsers);
}

export async function updateAppSetting(key: string, value: boolean) {
    const { error } = await supabaseOrders.from('app_settings').update({ value }).eq('key', key);
    if (error) throw error;
}

export async function saveEntity(type: EntityType, id: string, formData: FormData): Promise<{ data: any; error: PostgrestError | null; }> {
    const isEditing = !!id;
    let result: { data: any; error: PostgrestError | null; };
    const newValue = formData.get('new_value') as string;

    switch (type) {
        case 'city':
            const cityName = (formData.get('name') as string).trim();
            if (!cityName) throw new Error('Nombre requerido.');

            const { data: existingCity, error: cityCheckError } = await supabaseOrders
                .from('maintenance_cities')
                .select('id, name')
                .ilike('name', cityName);
            if (cityCheckError) throw cityCheckError;
            if (existingCity && existingCity.length > 0 && (!isEditing || existingCity[0].id !== id)) {
                throw new Error(`La ciudad "${existingCity[0].name}" ya existe. Selecciónela del listado.`);
            }

            const cityData = { name: cityName };
            result = isEditing
                ? await supabaseOrders.from('maintenance_cities').update(cityData).eq('id', id).select().single()
                : await supabaseOrders.from('maintenance_cities').insert(cityData).select().single();
            break;

        case 'company':
            const companyName = (formData.get('name') as string).trim();
            const cityId = formData.get('city_id') as string;
            
            // To properly create a client in the clients CRM database.
            // City in clients DB is typically just a string name, but we will store the ID or fetch the name to be safe.
            let cityNameForClient = cityId;
            try {
                const { data: cityData } = await supabaseOrders.from('maintenance_cities').select('name').eq('id', cityId).single();
                if (cityData) cityNameForClient = cityData.name;
            } catch (e) { }

            const companyData = {
                name: companyName,
                city: cityNameForClient,
                category: 'empresa',
                ...(isEditing ? {} : { manualId: await getNextClientManualId() })
            };
            result = isEditing
                ? await supabaseClients.from('clients').update(companyData).eq('id', id).select().single()
                : await supabaseClients.from('clients').insert(companyData).select().single();

            if (result.error) throw result.error;
            if (!result.data?.id) throw new Error('No se pudo guardar la empresa en clients.');

            // Mantiene la misma identidad canónica que Cotizaciones:
            // toda empresa madre en clients debe reflejarse también en maintenance_companies
            // con el mismo UUID, para que sedes, dependencias y equipos compartan la misma jerarquía.
            const rootCompanyData = {
                id: result.data.id,
                name: result.data.name,
                city_id: cityId || null,
            };
            const { error: syncCompanyError } = await supabaseOrders
                .from('maintenance_companies')
                .upsert(rootCompanyData, { onConflict: 'id' });

            if (syncCompanyError) {
                throw new Error(`La empresa se guardó, pero no se pudo sincronizar en mantenimiento: ${syncCompanyError.message}`);
            }
            break;

        case 'sede':
            const sedeData = {
                name: formData.get('name') as string,
                client_id: formData.get('company_id') as string, // map form's company_id to client_id in maintenance_companies
                city_id: (formData.get('city_id') as string) || null,
                address: (formData.get('address') as string) || null
            };
            result = isEditing
                ? await supabaseOrders.from('maintenance_companies').update(sedeData).eq('id', id).select().single()
                : await supabaseOrders.from('maintenance_companies').insert(sedeData).select().single();
            break;

        case 'dependency':
            const uiCompanyDependencyId = (formData.get('company_id') as string) || null;
            const dependencyData = { 
                name: formData.get('name') as string, 
                client_id: uiCompanyDependencyId, 
                company_id: (formData.get('sede_id') as string) || uiCompanyDependencyId, // Satisfy FK
                sede_id: (formData.get('sede_id') as string) || null
            };
            result = isEditing
                ? await supabaseOrders.from('maintenance_dependencies').update(dependencyData).eq('id', id).select().single()
                : await supabaseOrders.from('maintenance_dependencies').insert(dependencyData).select().single();
            break;

        case 'employee':
            const cedula = formData.get('cedula') as string;
            const password = formData.get('password') as string;
            if (isEditing) {
                const updateData: any = { name: formData.get('name') as string, cedula, username: cedula, role: 'worker' };
                if (password) updateData.password = password;
                result = await supabaseOrders.from('maintenance_users').update(updateData).eq('id', id).select().single();
            } else {
                if (!cedula) throw new Error("Cédula es requerida.");
                const insertData = { name: formData.get('name') as string, cedula, username: cedula, role: 'worker', password: password || cedula };
                result = await supabaseOrders.from('maintenance_users').insert(insertData).select().single();
            }
            break;
            
        case 'equipmentType':
            if (!newValue) throw new Error("Nombre requerido.");
            result = await supabaseOrders.from('maintenance_equipment_types').insert({ name: newValue }).select().single();
            break;
            
        case 'refrigerant':
            if (!newValue) throw new Error("Nombre requerido.");
            result = await supabaseOrders.from('maintenance_refrigerant_types').insert({ name: newValue }).select().single();
            break;

        case 'equipment':
            const category = formData.get('category') as string;
            const equipData: any = {
                manual_id: (formData.get('manual_id') as string) || null,
                brand: formData.get('brand') as string,
                model: formData.get('model') as string,
                type: formData.get('type') as string,
                equipment_type_id: formData.get('equipment_type_id') as string,
                refrigerant_type_id: (formData.get('refrigerant_type_id') as string) || null,
                capacity: (formData.get('capacity') as string) || null,
                periodicity_months: Number(formData.get('periodicityMonths')),
                last_maintenance_date: (formData.get('lastMaintenanceDate') as string) || null,
                category: category,
                city_id: formData.get('city_id') as string,
            };
            
            if (category === 'empresa') {
                const uiCompanyEquipId = formData.get('company_id') as string;
                const uiSedeEquipId = formData.get('sede_id') as string;
                
                equipData.client_id = uiCompanyEquipId || null;
                equipData.company_id = uiSedeEquipId || uiCompanyEquipId || null;
                equipData.sede_id = uiSedeEquipId || null;
                equipData.dependency_id = (formData.get('dependency_id') as string) || null;
            } else {
                equipData.client_name = formData.get('client_name') as string;
                equipData.address = formData.get('address') as string;
            }

            result = isEditing
                ? await supabaseOrders.from('maintenance_equipment').update(equipData).eq('id', id).select().single()
                : await supabaseOrders.from('maintenance_equipment').insert(equipData).select().single();
            break;
        default: throw new Error(`Tipo desconocido: ${type}`);
    }
    return result;
}

export async function saveMultipleEquipments(equipments: any[]): Promise<{ data: any, error: any }> {
    // Insert array of objects into maintenance_equipment
    // Equipments param objects must map directly to DB columns
    const mappedEquipments = equipments.map(eq => ({
        manual_id: eq.manualId,
        brand: eq.brand,
        model: eq.model,
        type: eq.typeName,
        capacity: eq.capacity,
        periodicity_months: eq.periodicityMonths,
        equipment_type_id: eq.equipment_type_id,
        refrigerant_type_id: eq.refrigerant_type_id,
        category: eq.category,
        city_id: eq.cityId,
        client_id: eq.companyId,
        company_id: eq.sedeId || eq.companyId, // To satisfy fk in maintenance_companies
        sede_id: eq.sedeId,
        dependency_id: eq.dependencyId,
        client_name: eq.client_name,
        address: eq.address
    }));

    const { data, error } = await supabaseOrders
        .from('maintenance_equipment')
        .insert(mappedEquipments)
        .select();

    return { data, error };
}

export async function updateEquipmentLastMaintenanceDate(id: string, lastMaintenanceDate: string | null) {
    const { data, error } = await supabaseOrders
        .from('maintenance_equipment')
        .update({ last_maintenance_date: lastMaintenanceDate })
        .eq('id', id)
        .select()
        .single();

    return { data, error };
}

export async function deleteEntity(type: EntityType, id: string) {
    switch (type) {
        case 'city':
            return await supabaseOrders.from('maintenance_cities').delete().eq('id', id);
        case 'company':
            // Company is managed in clients CRM
            return await supabaseClients.from('clients').delete().eq('id', id);
        case 'sede':
            // Sede is managed in orders maintenance_companies
            return await supabaseOrders.from('maintenance_companies').delete().eq('id', id);
        case 'dependency':
            return await supabaseOrders.from('maintenance_dependencies').delete().eq('id', id);
        case 'equipmentType':
            return await supabaseOrders.from('maintenance_equipment_types').delete().eq('id', id);
        case 'refrigerant':
            return await supabaseOrders.from('maintenance_refrigerant_types').delete().eq('id', id);
        case 'equipment':
        default:
            return await supabaseOrders.from('maintenance_equipment').delete().eq('id', id);
    }
}

export async function deleteReport(id: string) {
    const { error } = await supabaseOrders.from('maintenance_reports').delete().eq('id', id);
    if (error) throw error;
}

export async function deleteAllReports() {
    const { error } = await supabaseOrders.from('maintenance_reports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
}

export async function toggleEmployeeStatus(userId: string, currentStatus: boolean) {
    const { error } = await supabaseOrders.from('maintenance_users').update({ is_active: !currentStatus }).eq('id', userId);
    if (error) throw error;
}

export async function saveMaintenanceReport(reportData: any) {
    const { error } = await supabaseOrders.from('maintenance_reports').insert(reportData);
    if (error) throw error;
}

export async function updateMaintenanceReport(reportId: string, reportData: any) {
    const { error } = await supabaseOrders.from('maintenance_reports').update(reportData).eq('id', reportId);
    if (error) throw error;
}

export async function toggleReportPaidStatus(reportId: string, currentStatus: boolean) {
    const { error } = await supabaseOrders.from('maintenance_reports').update({ is_paid: !currentStatus }).eq('id', reportId);
    if (error) throw error;
}

export async function updateOrderItemQuantity(orderItemId: string, quantity: number) {
    const { error } = await supabaseOrders.from('order_items').update({ quantity }).eq('id', orderItemId);
    if (error) throw error;
}

export async function updateOrderStatus(orderId: string, status: Order['status']) {
    const { error } = await supabaseOrders.from('orders').update({ status }).eq('id', orderId);
    if (error) throw error;
}

export async function awardPointToTechnician(userId: string) {
    const { error } = await supabaseOrders.rpc('increment_user_points', { user_id_to_update: userId, points_to_add: 1 });
    return { error };
}

export async function updateUserPoints(userId: string, newTotalPoints: number) {
    const { error } = await supabaseOrders.from('maintenance_users').update({ points: newTotalPoints }).eq('id', userId);
    if (error) throw error;
}
