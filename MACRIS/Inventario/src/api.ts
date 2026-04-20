import { supabase, supabaseOrders } from './supabase';
import type { InventoryItem, InventoryItemInsert, InventoryMovement } from './types';

// ----------------------------------------------------------------
// Technicians (from Cotizaciones/Orders DB)
// ----------------------------------------------------------------
export interface Technician {
  id: string;
  name: string | null;
  cedula: string | null;
}

export async function fetchTechnicians(): Promise<Technician[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_users')
    .select('id, name, cedula')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as Technician[];
}

// ----------------------------------------------------------------
// ID generation helpers
// ----------------------------------------------------------------
export async function getNextItemId(): Promise<string> {
  const { data } = await supabase
    .from('inventory_items')
    .select('manual_id')
    .like('manual_id', 'INV-%')
    .order('manual_id', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return 'INV-001';
  const last = parseInt((data[0].manual_id as string).replace('INV-', ''), 10) || 0;
  return `INV-${String(last + 1).padStart(3, '0')}`;
}

export async function getNextMovementId(): Promise<string> {
  const { data } = await supabase
    .from('inventory_movements')
    .select('manual_id')
    .like('manual_id', 'MOV-%')
    .order('manual_id', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return 'MOV-001';
  const last = parseInt((data[0].manual_id as string).replace('MOV-', ''), 10) || 0;
  return `MOV-${String(last + 1).padStart(3, '0')}`;
}

// ----------------------------------------------------------------
// Items
// ----------------------------------------------------------------
export async function fetchItems(includeInactive = false): Promise<InventoryItem[]> {
  let query = supabase.from('inventory_items').select('*').order('name');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as InventoryItem[];
}

export async function upsertItem(item: InventoryItemInsert & { id?: string }): Promise<InventoryItem> {
  const payload = { ...item };
  if (!payload.id) payload.id = crypto.randomUUID();
  const { data, error } = await supabase
    .from('inventory_items')
    .upsert([payload], { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data as InventoryItem;
}

export async function setItemActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from('inventory_items')
    .update({ is_active })
    .eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// Movements
// ----------------------------------------------------------------
export interface MovementFilters {
  type?: string;
  itemId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export async function fetchMovements(filters: MovementFilters = {}): Promise<InventoryMovement[]> {
  let query = supabase
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.limit) query = query.limit(filters.limit);
  if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type);
  if (filters.itemId) query = query.eq('item_id', filters.itemId);
  if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom + 'T00:00:00');
  if (filters.dateTo)   query = query.lte('created_at', filters.dateTo + 'T23:59:59');

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as InventoryMovement[];
}

export interface RegisterMovementInput {
  item_id: string;
  type: 'entrada' | 'salida' | 'devolucion';
  quantity: number;
  unit_cost: number;
  unit_price?: number | null;
  notes?: string | null;
  reference?: string | null;
  worker_name?: string | null;
}

export async function registerMovement(input: RegisterMovementInput): Promise<InventoryMovement> {
  const manual_id = await getNextMovementId();
  const { data, error } = await supabase.rpc('register_movement', {
    p_item_id:     input.item_id,
    p_manual_id:   manual_id,
    p_type:        input.type,
    p_quantity:    input.quantity,
    p_unit_cost:   input.unit_cost,
    p_unit_price:  input.unit_price ?? null,
    p_notes:       input.notes ?? null,
    p_reference:   input.reference ?? null,
    p_worker_name: input.worker_name ?? null,
  });
  if (error) throw error;
  return data as InventoryMovement;
}