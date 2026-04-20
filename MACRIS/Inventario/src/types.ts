export interface InventoryItem {
  id: string;
  created_at: string;
  manual_id: string;
  name: string;
  description: string | null;
  category: 'consumible' | 'vendible';
  unit: string;
  current_stock: number;
  min_stock: number;
  cost_price: number;
  sale_price: number | null;
  is_active: boolean;
}

export type InventoryItemInsert = Omit<InventoryItem, 'id' | 'created_at'>;

export interface InventoryMovement {
  id: string;
  created_at: string;
  manual_id: string;
  item_id: string;
  type: 'entrada' | 'salida' | 'devolucion';
  quantity: number;
  unit_cost: number;
  unit_price: number | null;
  notes: string | null;
  reference: string | null;
  worker_name: string | null;
  // Enriched in app
  item?: InventoryItem;
}

export interface DashboardStats {
  totalItems: number;
  lowStockItems: InventoryItem[];
  outOfStockItems: InventoryItem[];
  inventoryValue: number;
  profitThisMonth: number;
  movementsToday: number;
}

export type MovementFilter = 'all' | 'entrada' | 'salida' | 'devolucion';
export type InventoryFilter = 'all' | 'vendible' | 'consumible' | 'low' | 'out';