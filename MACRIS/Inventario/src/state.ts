import type { InventoryItem, InventoryMovement, MovementFilter, InventoryFilter } from './types';
import type { Technician } from './api';

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------
let items: InventoryItem[] = [];
let movements: InventoryMovement[] = [];
let technicians: Technician[] = [];
let activeSection: string = 'dashboard';
let inventoryFilter: InventoryFilter = 'all';
let inventorySearch: string = '';
let movementFilter: MovementFilter = 'all';
let movementSearch: string = '';
let movementDateFrom: string = '';
let movementDateTo: string = '';
let gestionSearch: string = '';
let showInactive: boolean = false;

// ----------------------------------------------------------------
// Getters
// ----------------------------------------------------------------
export const getItems = () => items;
export const getMovements = () => movements;
export const getTechnicians = () => technicians;
export const getActiveSection = () => activeSection;
export const getInventoryFilter = () => inventoryFilter;
export const getInventorySearch = () => inventorySearch;
export const getMovementFilter = () => movementFilter;
export const getMovementSearch = () => movementSearch;
export const getMovementDateFrom = () => movementDateFrom;
export const getMovementDateTo = () => movementDateTo;
export const getGestionSearch = () => gestionSearch;
export const getShowInactive = () => showInactive;

export function getItemById(id: string): InventoryItem | undefined {
  return items.find(i => i.id === id);
}

export function getLowStockItems(): InventoryItem[] {
  return items.filter(i => i.is_active && i.current_stock > 0 && i.current_stock <= i.min_stock);
}

export function getOutOfStockItems(): InventoryItem[] {
  return items.filter(i => i.is_active && i.current_stock <= 0);
}

// ----------------------------------------------------------------
// Setters
// ----------------------------------------------------------------
export function setItems(v: InventoryItem[]) { items = v; }
export function setMovements(v: InventoryMovement[]) { movements = v; }
export function setTechnicians(v: Technician[]) { technicians = v; }
export function setActiveSection(v: string) { activeSection = v; }
export function setInventoryFilter(v: InventoryFilter) { inventoryFilter = v; }
export function setInventorySearch(v: string) { inventorySearch = v; }
export function setMovementFilter(v: MovementFilter) { movementFilter = v; }
export function setMovementSearch(v: string) { movementSearch = v; }
export function setMovementDateFrom(v: string) { movementDateFrom = v; }
export function setMovementDateTo(v: string) { movementDateTo = v; }
export function setGestionSearch(v: string) { gestionSearch = v; }
export function setShowInactive(v: boolean) { showInactive = v; }

export function upsertItemInState(item: InventoryItem) {
  const idx = items.findIndex(i => i.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
}

export function updateItemStock(itemId: string, newStock: number) {
  const item = items.find(i => i.id === itemId);
  if (item) item.current_stock = newStock;
}

export function prependMovement(m: InventoryMovement) {
  movements.unshift(m);
}