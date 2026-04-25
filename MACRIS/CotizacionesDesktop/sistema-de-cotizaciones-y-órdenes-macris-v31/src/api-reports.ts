import { supabaseOrders } from './supabase';
import type { Report, City, Company, Dependency } from './reports-types';

export const SUPABASE_REPORT_BATCH = 10;
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

function mapRowToReport(row: any): Report {
    return {
        id: row.id,
        timestamp: row.timestamp,
        serviceType: row.service_type || '', // map from snake_case
        observations: row.observations,
        equipmentSnapshot: row.equipment_snapshot || {},
        itemsSnapshot: row.items_snapshot,
        cityId: row.city_id,
        companyId: row.company_id,
        dependencyId: row.dependency_id,
        workerId: row.worker_id,
        workerName: row.worker_name || '', // map from snake_case
        clientSignature: row.client_signature,
        pressure: row.pressure,
        amperage: row.amperage,
        is_paid: row.is_paid,
        photo_internal_unit_url: row.photo_internal_unit_url,
        photo_external_unit_url: row.photo_external_unit_url,
        orderId: row.order_id
    };
}

export async function fetchReportTechnicians(): Promise<string[]> {
    try {
        const excludedTechnicians = new Set(['Admin(Dev)']);
        const rows = await fetchAllRows<{ worker_name: string | null }>(() =>
            supabaseOrders
                .from('maintenance_reports')
                .select('worker_name')
                .not('worker_name', 'is', null)
                .order('worker_name')
        );

        return Array.from(new Set(
            rows
                .map(row => (row.worker_name || '').trim())
                .filter(name => Boolean(name) && !excludedTechnicians.has(name))
        )).sort((a, b) => a.localeCompare(b, 'es'));
    } catch (error) {
        console.error('Error fetching report technicians:', error);
        return [];
    }
}

export async function fetchReportsBatch(offset: number, limit: number, filters?: { searchTerm?: string, dateFrom?: string, dateTo?: string, serviceType?: string, technicianName?: string, cityId?: string }) {
    const rpcParams = {
        search_term: filters?.searchTerm || null,
        date_from: filters?.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null,
        date_to: filters?.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null
    };

    // @ts-ignore
    let query = supabaseOrders
        .rpc('filter_maintenance_reports', rpcParams as any, { count: 'exact' })
        .range(offset, offset + limit - 1);

    if (filters?.serviceType) {
        // @ts-ignore
        query = query.ilike('service_type', `%${filters.serviceType}%`);
    }

    if (filters?.technicianName) {
        // @ts-ignore
        query = query.eq('worker_name', filters.technicianName);
    }

    if (filters?.cityId) {
        // @ts-ignore
        query = query.eq('city_id', filters.cityId);
    }

    // @ts-ignore
    const { data, error, count } = await query;

    if (error) {
        console.error('Error fetching reports via rpc:', error);
        return { data: [], count: 0 };
    }

    return {
        data: ((data as any[]) || []).map(mapRowToReport),
        count: count || 0
    };
}

export async function fetchAllExportableReports(filters?: { searchTerm?: string, dateFrom?: string, dateTo?: string, serviceType?: string, technicianName?: string, cityId?: string }) {
    const rpcParams = {
        search_term: filters?.searchTerm || null,
        date_from: filters?.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null,
        date_to: filters?.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null
    };

    // @ts-ignore
    let exportQuery = supabaseOrders
        .rpc('filter_maintenance_reports', rpcParams as any);

    if (filters?.serviceType) {
        // @ts-ignore
        exportQuery = exportQuery.ilike('service_type', `%${filters.serviceType}%`);
    }

    if (filters?.technicianName) {
        // @ts-ignore
        exportQuery = exportQuery.eq('worker_name', filters.technicianName);
    }

    if (filters?.cityId) {
        // @ts-ignore
        exportQuery = exportQuery.eq('city_id', filters.cityId);
    }

    // @ts-ignore
    const { data, error } = await exportQuery;

    if (error) {
        console.error('Error fetching all exportable reports:', error);
        return [];
    }

    return ((data as any[]) || []).map(mapRowToReport);
}

export async function fetchReportsByIds(ids: string[]): Promise<Report[]> {
    if (!ids || ids.length === 0) return [];

    const { data, error } = await supabaseOrders
        .from('maintenance_reports')
        .select('*')
        .in('id', ids);

    if (error) {
        console.error('Error fetching reports by ids:', error);
        return [];
    }

    return ((data as any[]) || []).map(mapRowToReport);
}

export async function updateReportPaymentStatus(id: string, isPaid: boolean) {
    const { error } = await supabaseOrders
        .from('maintenance_reports')
        // @ts-ignore
        .update({ is_paid: isPaid } as any)
        .eq('id', id);
        
    if (error) {
        console.error('Error updating payment status:', error);
        return false;
    }
    return true;
}

export async function deleteReport(id: string): Promise<boolean> {
    const { error } = await supabaseOrders
        .from('maintenance_reports')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting report:', error);
        return false;
    }
    return true;
}

export async function updateReportEquipmentSnapshot(id: string, snapshot: any): Promise<boolean> {
    const { error } = await supabaseOrders
        .from('maintenance_reports')
        // @ts-ignore
        .update({ equipment_snapshot: snapshot } as any)
        .eq('id', id);

    if (error) {
        console.error('Error updating equipment snapshot:', error);
        return false;
    }
    return true;
}

export async function fetchCities(): Promise<City[]> {
    const { data, error } = await supabaseOrders.from('maintenance_cities').select('*');
    if (error) return [];
    return data as City[];
}

export async function fetchCompanies(): Promise<Company[]> {
    const { data, error } = await supabaseOrders.from('maintenance_companies').select('*');
    if (error) return [];
    return data as Company[];
}

export async function fetchDependencies(): Promise<Dependency[]> {
    try {
        return await fetchAllRows<Dependency>(() =>
            supabaseOrders.from('maintenance_dependencies').select('*').order('name')
        );
    } catch (error) {
        console.error('Error fetching dependencies:', error);
        return [];
    }
}
export async function updateFullReport(id: string, updates: Partial<any>): Promise<boolean> {
    const { error } = await (supabaseOrders as any)
        .from('maintenance_reports')
        .update(updates)
        .eq('id', id);

    if (error) {
        console.error('Error updating full report:', error);
        return false;
    }
    return true;
}
