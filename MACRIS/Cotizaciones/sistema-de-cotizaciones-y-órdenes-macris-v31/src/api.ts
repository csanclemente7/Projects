import { supabaseQuotes, supabaseOrders } from './supabase';
import type {
    Item, Client, Quote, QuoteItem, Setting, Technician, Order, OrderItem, ServiceType, Sede, Dependency,
    ClientInsert, ItemInsert, QuoteInsert, QuoteItemInsert, OrderInsert, OrderItemInsert, TechnicianInsert, OrderTechnicianInsert, SettingInsert, DatabaseQuotes
} from './types';
import { generateId } from './utils';
import { fetchCities } from './api-reports';

// --- ID Generation ---
async function _findNextHighestManualId(
    tableName: 'quotes' | 'clients' | 'items',
    fallbackStartId: number
): Promise<string> {
    const { data, error } = await supabaseQuotes
        .from(tableName)
        .select('manualId')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) {
        console.warn(`Could not fetch remote next ${tableName} ID, using fallback.`, error);
        return fallbackStartId.toString();
    }
    const maxId = parseInt((data[0] as any).manualId, 10);
    return isNaN(maxId) ? fallbackStartId.toString() : (maxId + 1).toString();
}

export function getNextQuoteId(): Promise<string> {
    return _findNextHighestManualId('quotes', 737);
}
export function getNextClientManualId(): Promise<string> {
    return _findNextHighestManualId('clients', 101);
}
export function getNextItemManualId(): Promise<string> {
    return _findNextHighestManualId('items', 201);
}
export async function getNextOrderId(): Promise<string> {
    const { data, error } = await supabaseOrders
        .from('orders')
        .select('manualId')
        .order('manualId', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) {
        console.warn('Could not fetch remote next order ID, using fallback.', error);
        return '1001';
    }
    const maxId = parseInt(data[0].manualId, 10);
    return isNaN(maxId) ? '1001' : (maxId + 1).toString();
}

// --- Data Fetching (Online Only) ---
export async function getItemsFromSupabase(): Promise<Item[]> {
    const { data, error } = await supabaseQuotes.from('items').select('*');
    if (error) throw error;
    return data || [];
}
export async function getClientsFromSupabase(): Promise<Client[]> {
    const { data, error } = await supabaseQuotes.from('clients').select('*');
    if (error) throw error;
    return data || [];
}
export async function fetchSedes(): Promise<Sede[]> {
    const [{ data, error }, cities] = await Promise.all([
        supabaseOrders.from('maintenance_companies').select('*'),
        fetchCities()
    ]);
    if (error) throw error;
    
    const cityMap = new Map();
    cities.forEach(c => cityMap.set(c.id, c.name));

    // Map to Sede interface
    return (data || []).map(dbSede => ({
        id: dbSede.id,
        name: dbSede.name,
        address: dbSede.address || null,
        client_id: dbSede.client_id || null,
        city_id: dbSede.city_id || null,
        cityName: cityMap.get(dbSede.city_id) || null,
        contact_person: (dbSede as any).contact_person || null,
        phone: (dbSede as any).phone || null,
        category: dbSede.category || null,
    }));
}

export async function fetchDependencies(): Promise<Dependency[]> {
    const { data, error } = await supabaseOrders.from('maintenance_dependencies').select('*').order('name');
    if (error) throw error;

    return (data || []).map(dbDependency => ({
        id: dbDependency.id,
        name: dbDependency.name,
        company_id: dbDependency.company_id,
        sede_id: dbDependency.sede_id || null,
        client_id: dbDependency.client_id || null,
        created_at: dbDependency.created_at,
    }));
}

export async function getTechniciansFromSupabase(): Promise<Technician[]> {
    const { data, error } = await supabaseOrders.from('maintenance_users').select('*');
    if (error) throw error;
    return data || [];
}

export async function getServiceTypesFromSupabase(): Promise<ServiceType[]> {
    const { data, error } = await supabaseOrders.from('service_types').select('*');
    if (error) throw error;
    return data || [];
}

export async function getQuotesFromSupabase(): Promise<Quote[]> {
    const { data, error } = await supabaseQuotes.from('quotes').select('*, items:quote_items(*)');
    if (error) throw error;
    return (data || []).map(q => {
        const allItems = q.items || [];
        const realItems = allItems.filter((i: any) => !i.description.startsWith('<IMAGE::>'));
        const imageItems = allItems.filter((i: any) => i.description.startsWith('<IMAGE::>'));

        return {
            ...q,
            items: realItems,
            image_urls: imageItems.map((i: any) => i.description.replace('<IMAGE::>', ''))
        };
    });
}
export async function getOrdersFromSupabase(): Promise<Order[]> {
    const { data, error } = await supabaseOrders.from('orders').select('*, items:order_items(*), technicians:order_technicians(technician_id)');
    if (error) throw error;
    // The 'technicians' property from the query result must be removed before it's added to the state,
    // otherwise it will be sent back on upsert, causing a column mismatch error.
    return (data || []).map(o => {
        const { technicians, ...restOfOrder } = o;
        return {
            ...restOfOrder,
            items: restOfOrder.items || [],
            technicianIds: (technicians || []).map((t: any) => t.technician_id),
            taxRate: 0, // taxRate is an app-level concept, not in DB
        };
    });
}


// --- Data Manipulation (Online Only) ---
export async function upsertClient(client: ClientInsert | Client): Promise<Client> {
    const { data, error } = await supabaseQuotes.from('clients').upsert([client] as any, { onConflict: 'id' }).select().single();
    if (error) throw error;
    if (!data) throw new Error('Client upsert failed.');

    // Cross-DB synchronization for "Empresa" Category
    if (data.category === 'empresa') {
        try {
            const maintenanceCompany = {
                id: data.id, // We share the exact same ID UUID
                name: data.name,
                city_id: data.city || null,
                address: data.address || null,
                // Add any other mapped attributes here
            };
            const { error: syncError } = await supabaseOrders.from('maintenance_companies').upsert([maintenanceCompany], { onConflict: 'id' });
            if (syncError) console.error("Warning: Could not sync company to Orders DB:", syncError);
        } catch (e) {
            console.error("Failed to execute cross-DB sync:", e);
        }
    }

    return data;
}
export async function deleteClient(clientId: string): Promise<void> {
    const { error } = await supabaseQuotes.from('clients').delete().eq('id', clientId);
    if (error) throw error;
}
export async function upsertItem(item: ItemInsert): Promise<Item> {
    const { data, error } = await supabaseQuotes.from('items').upsert([item] as any, { onConflict: 'id' }).select().single();
    if (error) throw error;
    if (!data) throw new Error('Item upsert failed.');
    return data;
}
export async function deleteItem(itemId: string): Promise<void> {
    const { error } = await supabaseQuotes.from('items').delete().eq('id', itemId);
    if (error) throw error;
}
export async function upsertSedeFull(sedeId: string, sedeName: string, companyId: string, address?: string | null, cityId?: string | null, phone?: string | null, contactPerson?: string | null): Promise<Sede> {
    const newSede = {
        id: sedeId,
        name: sedeName,
        client_id: companyId,
        address: address || null,
        city_id: cityId || null,
        phone: phone || null,
        contact_person: contactPerson || null
    };
    const { data, error } = await supabaseOrders.from('maintenance_companies').upsert([newSede] as any, { onConflict: 'id' }).select().single();
    if (error) throw error;
    if (!data) throw new Error('Sede upsert failed.');
    const cities = await fetchCities();
    const cityName = cities.find(c => c.id === (data as any).city_id)?.name || null;
    return {
        id: data.id,
        name: data.name,
        address: (data as any).address || null,
        client_id: data.client_id || null,
        city_id: data.city_id || null,
        cityName,
        phone: (data as any).phone || null,
        contact_person: (data as any).contact_person || null,
    };
}

export async function upsertDependencyFull(dependencyId: string, name: string, companyId: string, sedeId: string | null): Promise<Dependency> {
    const dependencyData = {
        id: dependencyId,
        name,
        client_id: companyId,
        company_id: sedeId || companyId,
        sede_id: sedeId,
    };

    const { data, error } = await (supabaseOrders as any)
        .from('maintenance_dependencies')
        .upsert([dependencyData], { onConflict: 'id' })
        .select()
        .single();

    if (error) throw error;
    if (!data) throw new Error('Dependency upsert failed.');

    return {
        id: data.id,
        name: data.name,
        company_id: data.company_id,
        sede_id: data.sede_id || null,
        client_id: data.client_id || null,
        created_at: data.created_at,
    };
}

export async function deleteDependency(dependencyId: string): Promise<void> {
    const { error } = await supabaseOrders.from('maintenance_dependencies').delete().eq('id', dependencyId);
    if (error) throw error;
}

export async function deleteSede(sedeId: string): Promise<void> {
    const { error: dependencyError } = await supabaseOrders
        .from('maintenance_dependencies')
        .delete()
        .or(`sede_id.eq.${sedeId},company_id.eq.${sedeId}`);
    if (dependencyError) throw dependencyError;

    const { error } = await supabaseOrders.from('maintenance_companies').delete().eq('id', sedeId);
    if (error) throw error;
}

export async function upsertTechnician(technician: TechnicianInsert): Promise<Technician> {
    const { data, error } = await supabaseOrders.from('maintenance_users').upsert([technician] as any, { onConflict: 'id' }).select().single();
    if (error) throw error;
    if (!data) throw new Error('Technician upsert failed.');
    return data;
}
export async function deleteTechnician(technicianId: string): Promise<void> {
    const { error } = await supabaseOrders.from('maintenance_users').delete().eq('id', technicianId);
    if (error) throw error;
}

export async function saveQuote(quote: Quote): Promise<Quote> {
    const { items, image_urls, created_at, ...quoteData } = quote;
    const { data: savedQuote, error: quoteError } = await supabaseQuotes.from('quotes').upsert([quoteData] as any, { onConflict: 'id' }).select().single();
    if (quoteError) throw quoteError;
    if (!savedQuote) throw new Error('Failed to save quote');

    const { error: deleteError } = await supabaseQuotes.from('quote_items').delete().eq('quoteId', savedQuote.id);
    if (deleteError) throw deleteError;

    let savedItems: QuoteItem[] = [];
    const itemsToInsert: QuoteItemInsert[] = [];

    if (items && items.length > 0) {
        items.forEach(i => {
            const { created_at, ...itemInsert } = i;
            itemsToInsert.push({ ...itemInsert, quoteId: savedQuote.id });
        });
    }

    if (image_urls && image_urls.length > 0) {
        image_urls.forEach((url, idx) => {
            itemsToInsert.push({
                id: generateId(),
                quoteId: savedQuote.id,
                description: `<IMAGE::>${url}`,
                quantity: 0,
                price: 0,
                itemId: null,
                manualId: `IMG-${idx}`
            });
        });
    }

    if (itemsToInsert.length > 0) {
        const { data: newItems, error: itemsError } = await supabaseQuotes.from('quote_items').insert(itemsToInsert as any).select();
        if (itemsError) throw itemsError;
        // Filter out images from the returned items for the frontend state
        if (newItems) {
            savedItems = newItems.filter((i: any) => !i.description.startsWith('<IMAGE::>'));
        }
    }

    return { ...savedQuote, items: savedItems, image_urls: image_urls || [] };
}

export async function saveOrder(order: Order): Promise<Order> {
    const { items, technicianIds, taxRate, created_at, ...orderData } = order;
    const { data: savedOrder, error: orderError } = await supabaseOrders.from('orders').upsert([orderData] as any, { onConflict: 'id' }).select().single();
    if (orderError) throw orderError;
    if (!savedOrder) throw new Error('Failed to save order');

    await supabaseOrders.from('order_items').delete().eq('orderId', (savedOrder as any).id);
    if (items.length > 0) {
        const itemsToInsert: OrderItemInsert[] = items.map(i => {
            const { created_at, ...itemInsert } = i;
            return { ...itemInsert, orderId: (savedOrder as any).id };
        });
        const { error: itemsError } = await supabaseOrders.from('order_items').insert(itemsToInsert as any);
        if (itemsError) throw itemsError;
    }

    await supabaseOrders.from('order_technicians').delete().eq('order_id', (savedOrder as any).id);
    if (technicianIds.length > 0) {
        const techsToInsert: OrderTechnicianInsert[] = technicianIds.map(techId => ({ order_id: (savedOrder as any).id, technician_id: techId }));
        const { error: techsError } = await supabaseOrders.from('order_technicians').insert(techsToInsert as any);
        if (techsError) throw techsError;
    }

    // Re-fetch the complete order to return it
    const { data: finalOrderData, error: fetchError } = await supabaseOrders.from('orders').select('*, items:order_items(*), technicians:order_technicians(technician_id)').eq('id', (savedOrder as any).id).single();
    if (fetchError || !finalOrderData) throw new Error("Could not re-fetch saved order.");

    // Reconstruct the Order object correctly, removing the 'technicians' property
    const { technicians, ...restOfOrder } = finalOrderData as any;
    const finalOrder: Order = {
        ...restOfOrder,
        items: restOfOrder.items || [],
        technicianIds: (technicians || []).map((t: any) => t.technician_id),
        taxRate: order.taxRate, // taxRate is app-level, not in DB
    };

    return finalOrder;
}


export async function deleteQuote(quoteId: string): Promise<void> {
    await supabaseQuotes.from('quote_items').delete().eq('quoteId', quoteId);
    await supabaseQuotes.from('quotes').delete().eq('id', quoteId);
}
export async function deleteOrder(orderId: string): Promise<void> {
    await supabaseOrders.from('order_items').delete().eq('orderId', orderId);
    await supabaseOrders.from('order_technicians').delete().eq('order_id', orderId);
    await supabaseOrders.from('orders').delete().eq('id', orderId);
}

// --- Settings API (Online Only) ---
export async function getSetting(key: string): Promise<string | null> {
    const { data, error } = await supabaseQuotes.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) {
        console.error(`Error fetching setting ${key}:`, error);
        return null;
    };
    return (data as any)?.value ?? null;
}
export async function setSetting(key: string, value: string): Promise<void> {
    const setting: SettingInsert = { key, value };
    const { error } = await supabaseQuotes.from('settings').upsert([setting] as any, { onConflict: 'key' });
    if (error) throw error;
}

// --- Data Reset Functions ---
export async function clearAllData(): Promise<void> {
    const { error } = await supabaseQuotes.rpc('clear_all_data');
    if (error) throw error;
    // Note: This only clears the quotes DB. A second RPC might be needed for the orders DB.
}
export async function restoreDataFromBackup(backupData: any): Promise<void> {
    console.log("Starting restore process...");
    await supabaseQuotes.rpc('clear_all_data');
    await supabaseOrders.from('order_items').delete().gt('quantity', -1); // DANGEROUS: Deletes all rows
    await supabaseOrders.from('order_technicians').delete().gt('order_id', -1); // DANGEROUS: Deletes all rows
    await supabaseOrders.from('orders').delete().gt('created_at', '1900-01-01'); // DANGEROUS: Deletes all rows
    await supabaseOrders.from('maintenance_users').delete().gt('created_at', '1900-01-01'); // DANGEROUS: Deletes all rows
    console.log("All existing remote data cleared.");

    if (backupData.maintenance_users && Array.isArray(backupData.maintenance_users)) {
        const techs = backupData.maintenance_users.map((t: any) => { delete t.created_at; return t; });
        const { error } = await supabaseOrders.from('maintenance_users').upsert(techs, { onConflict: 'id' });
        if (error) throw new Error(`Failed to restore technicians: ${error.message}`);
    }
    if (backupData.clients && Array.isArray(backupData.clients)) {
        const clients = backupData.clients.map((c: any) => { delete c.created_at; return c; });
        const { error } = await supabaseQuotes.from('clients').upsert(clients, { onConflict: 'id' });
        if (error) throw new Error(`Failed to restore clients: ${error.message}`);
    }
    if (backupData.items && Array.isArray(backupData.items)) {
        const items = backupData.items.map((i: any) => { delete i.created_at; return i; });
        const { error } = await supabaseQuotes.from('items').upsert(items, { onConflict: 'id' });
        if (error) throw new Error(`Failed to restore items: ${error.message}`);
    }
    if (backupData.quotes && Array.isArray(backupData.quotes)) {
        const quotes = backupData.quotes.map((q: any) => { delete q.items; delete q.created_at; return q; });
        const { error } = await supabaseQuotes.from('quotes').upsert(quotes, { onConflict: 'id' });
        if (error) throw new Error(`Failed to restore quotes: ${error.message}`);

        const allQuoteItems = backupData.quotes.flatMap((q: any) => q.items || []).map((qi: any) => { delete qi.created_at; return qi; });
        if (allQuoteItems.length > 0) {
            const { error: qiError } = await supabaseQuotes.from('quote_items').upsert(allQuoteItems, { onConflict: 'id' });
            if (qiError) throw new Error(`Failed to restore quote items: ${qiError.message}`);
        }
    }
    if (backupData.orders && Array.isArray(backupData.orders)) {
        const orders = backupData.orders.map((o: any) => { delete o.items; delete o.technicianIds; delete o.taxRate; delete o.created_at; return o; });
        const { error } = await supabaseOrders.from('orders').upsert(orders, { onConflict: 'id' });
        if (error) throw new Error(`Failed to restore orders: ${error.message}`);

        const allOrderItems = backupData.orders.flatMap((o: any) => o.items || []).map((oi: any) => { delete oi.created_at; return oi; });
        if (allOrderItems.length > 0) {
            const { error: oiError } = await supabaseOrders.from('order_items').upsert(allOrderItems, { onConflict: 'id' });
            if (oiError) throw new Error(`Failed to restore order items: ${oiError.message}`);
        }
        const allOrderTechs = backupData.orders.flatMap((o: any) => (o.technicianIds || []).map((techId: string) => ({ order_id: o.id, technician_id: techId })));
        if (allOrderTechs.length > 0) {
            const { error: otError } = await supabaseOrders.from('order_technicians').upsert(allOrderTechs, { onConflict: 'order_id,technician_id' });
            if (otError) throw new Error(`Failed to restore order technicians: ${otError.message}`);
        }
    }
    console.log("Restore process finished.");
}
