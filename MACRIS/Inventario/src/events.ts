import * as D from './dom';
import * as State from './state';
import * as API from './api';
import * as UI from './ui';
import { fetchItems, fetchMovements } from './api';
import type { InventoryItemInsert } from './types';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es';

// ----------------------------------------------------------------
// Navigation
// ----------------------------------------------------------------
function setupNavigation() {
  D.navItems.forEach(el => {
    el.addEventListener('click', () => {
      const section = el.dataset.section!;
      UI.navigateTo(section);
      if (section === 'inventory')  UI.renderInventoryTable();
      if (section === 'movements')  refreshMovementsTable();
      if (section === 'gestion')    UI.renderGestionTable();
    });
  });

  D.alertBannerBtn.addEventListener('click', () => {
    State.setInventoryFilter('low');
    syncFilterTabUI('inventory-filter-tabs', 'low');
    UI.navigateTo('inventory');
    UI.renderInventoryTable();
  });
}

// ----------------------------------------------------------------
// Inventory filters
// ----------------------------------------------------------------
function setupInventoryFilters() {
  D.inventoryFilterTabs.addEventListener('click', e => {
    const tab = (e.target as HTMLElement).closest('.filter-tab') as HTMLElement;
    if (!tab) return;
    const filter = tab.dataset.filter as any;
    State.setInventoryFilter(filter);
    syncFilterTabUI('inventory-filter-tabs', filter);
    UI.renderInventoryTable();
  });

  D.inventorySearch.addEventListener('input', () => {
    State.setInventorySearch(D.inventorySearch.value);
    UI.renderInventoryTable();
  });
}

// ----------------------------------------------------------------
// Movement filters
// ----------------------------------------------------------------
function setupMovementFilters() {
  D.movementFilterTabs.addEventListener('click', e => {
    const tab = (e.target as HTMLElement).closest('.filter-tab') as HTMLElement;
    if (!tab) return;
    const filter = tab.dataset.filter as any;
    State.setMovementFilter(filter);
    syncFilterTabUI('movement-filter-tabs', filter);
    refreshMovementsTable();
  });

  D.movementsSearch.addEventListener('input', () => {
    State.setMovementSearch(D.movementsSearch.value);
    refreshMovementsTable();
  });

  // Flatpickr date pickers
  flatpickr(D.dateFrom, {
    locale: Spanish as any, dateFormat: 'Y-m-d', allowInput: false,
    onChange: ([date]) => {
      State.setMovementDateFrom(date ? date.toISOString().split('T')[0] : '');
      refreshMovementsTable();
    }
  });
  flatpickr(D.dateTo, {
    locale: Spanish as any, dateFormat: 'Y-m-d', allowInput: false,
    onChange: ([date]) => {
      State.setMovementDateTo(date ? date.toISOString().split('T')[0] : '');
      refreshMovementsTable();
    }
  });

  D.btnClearDates.addEventListener('click', () => {
    (D.dateFrom as any)._flatpickr?.clear();
    (D.dateTo as any)._flatpickr?.clear();
    State.setMovementDateFrom('');
    State.setMovementDateTo('');
    refreshMovementsTable();
  });
}

// ----------------------------------------------------------------
// Gestión filters
// ----------------------------------------------------------------
function setupGestionFilters() {
  D.gestionSearch.addEventListener('input', () => {
    State.setGestionSearch(D.gestionSearch.value);
    UI.renderGestionTable();
  });
  D.showInactiveToggle.addEventListener('change', () => {
    State.setShowInactive(D.showInactiveToggle.checked);
    UI.renderGestionTable();
  });
}

// ----------------------------------------------------------------
// Movement buttons
// ----------------------------------------------------------------
function setupMovementButtons() {
  D.btnQuickMovement.addEventListener('click', () => UI.openMovementModal());
  D.btnNewMovement.addEventListener('click',   () => UI.openMovementModal());

  // Delegated: quick movement from inventory table
  D.inventoryTableBody.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement;
    if (!btn) return;
    const id = btn.dataset.id!;
    if (btn.classList.contains('mov-entrada-btn'))    UI.openMovementModal(id, 'entrada');
    if (btn.classList.contains('mov-salida-btn'))     UI.openMovementModal(id, 'salida');
    if (btn.classList.contains('mov-devolucion-btn')) UI.openMovementModal(id, 'devolucion');
  });
}

// ----------------------------------------------------------------
// Item buttons (gestión)
// ----------------------------------------------------------------
function setupGestionButtons() {
  D.btnAddItem.addEventListener('click', () => UI.openItemModal(null));

  D.gestionTableBody.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement;
    if (!btn) return;
    const id = btn.dataset.id!;

    if (btn.classList.contains('edit-item-btn')) {
      UI.openItemModal(id);
    }

    if (btn.classList.contains('toggle-active-btn')) {
      const isActive = btn.dataset.active === 'true';
      const label = isActive ? 'desactivar' : 'activar';
      if (!confirm(`¿Deseas ${label} este ítem?`)) return;
      try {
        await API.setItemActive(id, !isActive);
        const items = await fetchItems(true);
        State.setItems(items);
        UI.renderGestionTable();
        UI.renderAlerts();
        UI.showNotification(`Ítem ${!isActive ? 'activado' : 'desactivado'}.`, 'success');
      } catch (err: any) {
        UI.showNotification('Error: ' + (err.message || err), 'error');
      }
    }
  });
}

// ----------------------------------------------------------------
// Modal confirm
// ----------------------------------------------------------------
function setupModalActions() {
  D.modalClose.addEventListener('click',  UI.closeModal);
  D.modalCancel.addEventListener('click', UI.closeModal);
  D.modalOverlay.addEventListener('click', e => {
    if (e.target === D.modalOverlay) UI.closeModal();
  });

  D.modalConfirm.addEventListener('click', async () => {
    const action = D.modalConfirm.dataset.action;
    if (action === 'save-item')     await handleSaveItem();
    if (action === 'save-movement') await handleSaveMovement();
  });
}

async function handleSaveItem() {
  const body = D.modalBody;
  const get = (name: string) => (body.querySelector(`[name="${name}"]`) as HTMLInputElement)?.value.trim() || '';

  const name = get('name');
  if (!name) { UI.showNotification('El nombre es requerido.', 'warning'); return; }

  const itemId = D.modalConfirm.dataset.itemId || undefined;
  const payload: InventoryItemInsert & { id?: string } = {
    id: itemId || undefined,
    manual_id:     itemId ? (State.getItemById(itemId)?.manual_id || '') : await API.getNextItemId(),
    name,
    description:   get('description') || null,
    category:      get('category') as 'consumible' | 'vendible',
    unit:          get('unit') || 'unidad',
    current_stock: parseFloat(get('current_stock')) || 0,
    min_stock:     parseFloat(get('min_stock')) || 0,
    cost_price:    parseFloat(get('cost_price')) || 0,
    sale_price:    get('category') === 'vendible' ? (parseFloat(get('sale_price')) || null) : null,
    is_active:     true,
  };

  D.modalConfirm.disabled = true;
  try {
    const saved = await API.upsertItem(payload);
    State.upsertItemInState(saved);
    UI.renderGestionTable();
    UI.renderInventoryTable();
    UI.renderAlerts();
    UI.closeModal();
    UI.showNotification(itemId ? 'Ítem actualizado.' : 'Ítem creado.', 'success');
  } catch (err: any) {
    UI.showNotification('Error: ' + (err.message || err), 'error');
  } finally {
    D.modalConfirm.disabled = false;
  }
}

async function handleSaveMovement() {
  const body = D.modalBody;

  const itemId   = (body.querySelector('#item-id-mov')     as HTMLInputElement)?.value;
  const type     = (body.querySelector('#mov-type')        as HTMLInputElement)?.value as 'entrada' | 'salida' | 'devolucion';
  const quantity = parseFloat((body.querySelector('#mov-quantity')  as HTMLInputElement)?.value || '0');
  const unitCost = parseFloat((body.querySelector('#mov-unit-cost') as HTMLInputElement)?.value || '0');
  const unitPrice= parseFloat((body.querySelector('#mov-unit-price') as HTMLInputElement)?.value || '0') || null;
  const reference= (body.querySelector('#mov-reference')   as HTMLInputElement)?.value.trim() || null;
  const worker   = (body.querySelector('#mov-worker')      as HTMLInputElement)?.value.trim() || null;
  const notes    = (body.querySelector('#mov-notes')       as HTMLInputElement)?.value.trim() || null;

  if (!itemId)      { UI.showNotification('Selecciona un ítem.', 'warning'); return; }
  if (quantity <= 0){ UI.showNotification('La cantidad debe ser mayor a 0.', 'warning'); return; }

  D.modalConfirm.disabled = true;
  try {
    const saved = await API.registerMovement({ item_id: itemId, type, quantity, unit_cost: unitCost, unit_price: unitPrice, notes, reference, worker_name: worker });

    // Refresh item stock in state
    const items = await fetchItems();
    State.setItems(items);

    State.prependMovement(saved);

    // Re-render current section
    const section = State.getActiveSection();
    if (section === 'inventory')  UI.renderInventoryTable();
    if (section === 'movements')  refreshMovementsTable();
    if (section === 'dashboard')  {
      const movements = await fetchMovements({ limit: 50 });
      State.setMovements(movements);
      UI.renderDashboard(movements);
    }
    UI.renderAlerts();
    UI.closeModal();

    const typeLabel = { entrada: 'Entrada', salida: 'Salida', devolucion: 'Devolución' }[type];
    UI.showNotification(`${typeLabel} registrada correctamente.`, 'success');
  } catch (err: any) {
    UI.showNotification('Error: ' + (err.message || err), 'error');
  } finally {
    D.modalConfirm.disabled = false;
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function syncFilterTabUI(containerId: string, active: string) {
  const container = document.getElementById(containerId);
  container?.querySelectorAll('.filter-tab').forEach(tab => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.filter === active);
  });
}

async function refreshMovementsTable() {
  const movements = await fetchMovements({
    type:     State.getMovementFilter() !== 'all' ? State.getMovementFilter() : undefined,
    dateFrom: State.getMovementDateFrom() || undefined,
    dateTo:   State.getMovementDateTo()   || undefined,
  });
  State.setMovements(movements);
  UI.renderMovementsTable(movements);
}

// ----------------------------------------------------------------
// Bootstrap all events
// ----------------------------------------------------------------
export function setupEventListeners() {
  setupNavigation();
  setupInventoryFilters();
  setupMovementFilters();
  setupGestionFilters();
  setupMovementButtons();
  setupGestionButtons();
  setupModalActions();
}