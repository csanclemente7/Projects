import { supabaseOrders } from './supabase';
import type { Report, City, Company, Dependency } from './reports-types';

export const SUPABASE_REPORT_BATCH = 10;

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

export async function fetchReportsBatch(offset: number, limit: number, filters?: { searchTerm?: string, dateFrom?: string, dateTo?: string }) {
    const rpcParams = {
        search_term: filters?.searchTerm || null,
        date_from: filters?.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null,
        date_to: filters?.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null
    };

    const { data, error, count } = await supabaseOrders
        .rpc('filter_maintenance_reports', rpcParams, { count: 'exact' })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('Error fetching reports via rpc:', error);
        return { data: [], count: 0 };
    }

    return { 
        data: (data || []).map(mapRowToReport), 
        count: count || 0
    };
}

export async function fetchAllExportableReports(filters?: { searchTerm?: string, dateFrom?: string, dateTo?: string }) {
    const rpcParams = {
        search_term: filters?.searchTerm || null,
        date_from: filters?.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null,
        date_to: filters?.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null
    };

    const { data, error } = await supabaseOrders
        .rpc('filter_maintenance_reports', rpcParams);

    if (error) {
        console.error('Error fetching all exportable reports:', error);
        return [];
    }

    return (data || []).map(mapRowToReport);
}

export async function updateReportPaymentStatus(id: string, isPaid: boolean) {
    const { error } = await supabaseOrders
        .from('maintenance_reports')
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
    const { data, error } = await supabaseOrders.from('maintenance_dependencies').select('*');
    if (error) return [];
    return data as Dependency[];
}
