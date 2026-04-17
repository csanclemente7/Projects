import { supabaseOrders, supabaseQuotes } from './supabase';
import type { Order, Client, Sede, Technician } from './types';

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabaseOrders
    .from('orders')
    .select('*, order_technicians(technician_id), order_items(id, description, quantity)')
    .not('service_date', 'is', null)
    .order('service_date', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id:                 row.id,
    created_at:         row.created_at,
    manualId:           row.manualId,
    clientId:           row.clientId,
    status:             row.status,
    service_date:       row.service_date,
    service_time:       row.service_time ?? null,
    order_type:         row.order_type ?? null,
    notes:              row.notes ?? null,
    estimated_duration: row.estimated_duration ?? null,
    sede_id:            row.sede_id ?? null,
    technicianIds:      (row.order_technicians || []).map((t: any) => t.technician_id),
    items:              (row.order_items || []).map((i: any) => ({
      id:          i.id,
      description: i.description ?? '',
      quantity:    i.quantity ?? 1,
    })),
    image_urls:         row.image_urls ?? null,
  }));
}

export async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabaseQuotes
    .from('clients')
    .select('id, name, address, city')
    .order('name');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id:      r.id,
    name:    r.name,
    address: r.address ?? null,
    city:    r.city    ?? null,
  }));
}

export async function fetchSedes(): Promise<Sede[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_companies')
    .select('id, name, client_id, address')
    .order('name');
  if (error) throw error;
  return (data || []).map((r: any) => ({
    id:        r.id,
    name:      r.name,
    client_id: r.client_id ?? null,
    address:   r.address   ?? null,
  }));
}

export async function fetchTechnicians(): Promise<Technician[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_users')
    .select('id, name')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as Technician[];
}