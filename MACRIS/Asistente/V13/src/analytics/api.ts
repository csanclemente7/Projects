import { supabaseOrders, supabaseClients } from '../api';
import type { Report } from '../types';

export interface RawQuote {
    id: string;
    created_at: string;
    manualId: string;
    date: string;
    clientId: string | null;
    sede_id?: string | null;
}

export interface RawQuoteItem {
    id: string;
    quoteId: string;
    itemId: string | null;
    description: string;
    quantity: number;
    price: number;
}

export interface RawOrder {
    id: string;
    created_at: string | null;
    quoteId: string | null;
    clientId: string;
    status: string | null;
    service_date: string | null;
    order_type: string | null;
    sede_id: string | null;
}

const REPORT_ANALYTICS_COLUMNS = 'id,timestamp,service_type,city_id,company_id,worker_name,is_paid';

export async function fetchReportsForAnalytics(startDate: string, endDate: string): Promise<Report[]> {
    let query = supabaseOrders
        .from('maintenance_reports')
        .select(REPORT_ANALYTICS_COLUMNS)
        .order('timestamp', { ascending: false });

    if (startDate) query = query.gte('timestamp', startDate + 'T00:00:00.000Z');
    if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        query = query.lt('timestamp', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((r: any) => ({
        id: r.id,
        timestamp: r.timestamp,
        serviceType: r.service_type,
        observations: null,
        equipmentSnapshot: { id: '', model: '', brand: '', type: '' },
        itemsSnapshot: null,
        cityId: r.city_id,
        companyId: r.company_id,
        dependencyId: null,
        workerId: '',
        workerName: r.worker_name,
        pressure: null,
        amperage: null,
        is_paid: r.is_paid || false,
    }));
}

export async function fetchOrdersForAnalytics(startDate: string, endDate: string): Promise<RawOrder[]> {
    let query = supabaseOrders
        .from('orders')
        .select('id,created_at,quoteId,clientId,status,service_date,order_type,sede_id')
        .order('created_at', { ascending: false });

    if (startDate) query = (query as any).gte('created_at', startDate + 'T00:00:00.000Z');
    if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        query = (query as any).lt('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as RawOrder[];
}

export async function fetchQuotesForAnalytics(): Promise<RawQuote[]> {
    const { data, error } = await (supabaseClients as any)
        .from('quotes')
        .select('id,created_at,manualId,date,clientId,sede_id')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as RawQuote[];
}

export async function fetchQuoteItemsForAnalytics(): Promise<RawQuoteItem[]> {
    const { data, error } = await (supabaseClients as any)
        .from('quote_items')
        .select('id,quoteId,itemId,description,quantity,price');

    if (error) throw error;
    return (data || []) as RawQuoteItem[];
}