import * as D from './dom';
import * as State from './state';
import { formatCurrency, formatDate, formatDateTime, isToday, isThisMonth, stockStatus, stockStatusLabel, movementProfit, escapeHtml } from './utils';
import type { InventoryItem, InventoryMovement } from './types';

// ----------------------------------------------------------------
// Loader
// ----------------------------------------------------------------
export function showLoader(msg = 'Cargando...') {
  D.loaderText.textContent = msg;
  D.loader.style.display = 'flex';
}
export function hideLoader() {
  D.loader.style.display = 'none';
  D.app.style.display = 'flex';
}

// ----------------------------------------------------------------
// Notifications
// ----------------------------------------------------------------
export function showNotification(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') {
  const icon = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-triangle-exclamation', info: 'fa-info-circle' }[type];
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.innerHTML = `<i class="fas ${icon}"></i> ${escapeHtml(msg)}`;
  D.notificationArea.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ----------------------------------------------------------------
// Navigation
// ----------------------------------------------------------------
const SECTION_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventario',
  movements: 'Movimientos',
  gestion: 'Gestión',
};

export function navigateTo(section: string) {
  State.setActiveSection(section);
  // sections
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.add('active');
  // nav items
  document.querySelectorAll('[data-section]').forEach(el => {
    el.classList.toggle('active', (el as HTMLElement).dataset.section === section);
  });
  // mobile title
  D.pageTitleMobile.textContent = SECTION_TITLES[section] || section;
}

// ----------------------------------------------------------------
// Low-stock alerts
// ----------------------------------------------------------------
export function renderAlerts() {
  const low = State.getLowStockItems();
  const out = State.getOutOfStockItems();
  const total = low.length + out.length;

  // Sidebar badge
  if (total > 0) {
    D.lowStockBadgeSidebar.style.display = 'flex';
    D.lowStockCountSidebar.textContent = String(total);
    D.lowStockBadgeMobile.style.display = 'flex';
    D.lowStockCountMobile.textContent = String(total);
  } else {
    D.lowStockBadgeSidebar.style.display = 'none';
    D.lowStockBadgeMobile.style.display = 'none';
  }

  // Alert banner on dashboard
  if (total > 0) {
    D.alertBanner.style.display = 'flex';
    D.alertBannerText.textContent = `${out.length > 0 ? out.length + ' ítem(s) agotado(s)' : ''} ${out.length > 0 && low.length > 0 ? 'y' : ''} ${low.length > 0 ? low.length + ' ítem(s) con stock bajo' : ''}`.trim();
  } else {
    D.alertBanner.style.display = 'none';
  }

  // Low stock panel
  const allAlert = [...out, ...low];
  if (allAlert.length > 0) {
    D.lowStockPanel.style.display = 'block';
    D.lowStockList.innerHTML = allAlert.map(item => {
      const status = stockStatus(item);
      const cls = status === 'out' ? 'stock-out' : 'stock-low';
      return `<div class="low-stock-item">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-stock ${cls}">${item.current_stock} ${escapeHtml(item.unit)}</span>
        <span class="text-muted" style="font-size:.75rem;">mín: ${item.min_stock}</span>
      </div>`;
    }).join('');
  } else {
    D.lowStockPanel.style.display = 'none';
  }
}

// ----------------------------------------------------------------
// Dashboard KPIs
// ----------------------------------------------------------------
export function renderDashboard(movements: InventoryMovement[]) {
  const items = State.getItems().filter(i => i.is_active);
  const low = State.getLowStockItems();
  const out = State.getOutOfStockItems();

  D.kpiTotalItems.textContent     = String(items.length);
  D.kpiLowStock.textContent       = String(low.length);
  D.kpiOutOfStock.textContent     = String(out.length);

  const invValue = items.reduce((s, i) => s + i.current_stock * i.cost_price, 0);
  D.kpiInvValue.textContent = formatCurrency(invValue);

  const profit = movements
    .filter(m => m.type === 'salida' && isThisMonth(m.created_at) && m.unit_price != null)
    .reduce((s, m) => s + (m.unit_price! - m.unit_cost) * m.quantity, 0);
  D.kpiProfitMonth.textContent = formatCurrency(profit);

  const todayMoves = movements.filter(m => isToday(m.created_at)).length;
  D.kpiMovementsToday.textContent = String(todayMoves);

  renderAlerts();
  renderRecentMovements(movements.slice(0, 15));
}

// ----------------------------------------------------------------
// Recent Movements (Dashboard)
// ----------------------------------------------------------------
function renderRecentMovements(movements: InventoryMovement[]) {
  if (movements.length === 0) {
    D.recentMovementsBody.innerHTML = `<tr><td colspan="6" class="empty-row">No hay movimientos registrados.</td></tr>`;
    return;
  }
  D.recentMovementsBody.innerHTML = movements.map(m => {
    const item = State.getItemById(m.item_id);
    const profit = movementProfit(m);
    return `<tr>
      <td class="text-muted" style="white-space:nowrap;">${formatDate(m.created_at)}</td>
      <td><strong>${escapeHtml(item?.name || m.item_id)}</strong></td>
      <td>${movementBadge(m.type)}</td>
      <td>${m.quantity} ${escapeHtml(item?.unit || '')}</td>
      <td>${profit != null ? `<span class="text-profit">${formatCurrency(profit)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="text-muted">${escapeHtml(m.reference || '—')}</td>
    </tr>`;
  }).join('');
}

// ----------------------------------------------------------------
// Inventory Table
// ----------------------------------------------------------------
export function renderInventoryTable() {
  const filter = State.getInventoryFilter();
  const search = State.getInventorySearch().toLowerCase();

  let items = State.getItems().filter(i => i.is_active);

  if (filter === 'vendible')   items = items.filter(i => i.category === 'vendible');
  if (filter === 'consumible') items = items.filter(i => i.category === 'consumible');
  if (filter === 'low')        items = items.filter(i => i.current_stock > 0 && i.current_stock <= i.min_stock);
  if (filter === 'out')        items = items.filter(i => i.current_stock <= 0);
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search) || i.manual_id.toLowerCase().includes(search));

  if (items.length === 0) {
    D.inventoryTableBody.innerHTML = `<tr><td colspan="9" class="empty-row">No se encontraron ítems.</td></tr>`;
    return;
  }

  D.inventoryTableBody.innerHTML = items.map(item => {
    const status = stockStatus(item);
    const statusHtml = `<span class="status-chip status-${status}">${statusLabel(status)}</span>`;
    return `<tr>
      <td class="text-muted">${escapeHtml(item.manual_id)}</td>
      <td><strong>${escapeHtml(item.name)}</strong>${item.description ? `<br><small class="text-muted">${escapeHtml(item.description)}</small>` : ''}</td>
      <td>${categoryBadge(item.category)}</td>
      <td><strong>${item.current_stock}</strong> <small class="text-muted">${escapeHtml(item.unit)}</small></td>
      <td>${item.min_stock} ${escapeHtml(item.unit)}</td>
      <td>${formatCurrency(item.cost_price)}</td>
      <td>${item.category === 'vendible' && item.sale_price != null ? formatCurrency(item.sale_price) : '<span class="text-muted">—</span>'}</td>
      <td>${statusHtml}</td>
      <td class="col-actions">
        <button class="btn btn-sm btn-primary mov-entrada-btn" data-id="${item.id}" title="Registrar entrada"><i class="fas fa-arrow-down"></i></button>
        <button class="btn btn-sm btn-ghost mov-salida-btn" data-id="${item.id}" title="Registrar salida" style="border-color:#ef4444;color:#ef4444;"><i class="fas fa-arrow-up"></i></button>
        <button class="btn btn-sm btn-ghost mov-devolucion-btn" data-id="${item.id}" title="Devolución" style="border-color:#f59e0b;color:#f59e0b;"><i class="fas fa-rotate-left"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ----------------------------------------------------------------
// Movements Table
// ----------------------------------------------------------------
export function renderMovementsTable(movements: InventoryMovement[]) {
  const filter = State.getMovementFilter();
  const search = State.getMovementSearch().toLowerCase();
  const from = State.getMovementDateFrom();
  const to   = State.getMovementDateTo();

  let filtered = [...movements];
  if (filter !== 'all') filtered = filtered.filter(m => m.type === filter);
  if (search) {
    filtered = filtered.filter(m => {
      const item = State.getItemById(m.item_id);
      return (item?.name.toLowerCase().includes(search)) || (m.reference?.toLowerCase().includes(search)) || m.manual_id.toLowerCase().includes(search);
    });
  }
  if (from) filtered = filtered.filter(m => m.created_at >= from + 'T00:00:00');
  if (to)   filtered = filtered.filter(m => m.created_at <= to   + 'T23:59:59');

  if (filtered.length === 0) {
    D.movementsTableBody.innerHTML = `<tr><td colspan="10" class="empty-row">No hay movimientos con ese criterio.</td></tr>`;
    D.movementsSummary.style.display = 'none';
    return;
  }

  D.movementsTableBody.innerHTML = filtered.map(m => {
    const item = State.getItemById(m.item_id);
    const profit = movementProfit(m);
    return `<tr>
      <td class="text-muted">${escapeHtml(m.manual_id)}</td>
      <td style="white-space:nowrap;">${formatDateTime(m.created_at)}</td>
      <td><strong>${escapeHtml(item?.name || '—')}</strong></td>
      <td>${movementBadge(m.type)}</td>
      <td>${m.quantity} <small class="text-muted">${escapeHtml(item?.unit || '')}</small></td>
      <td>${formatCurrency(m.unit_cost)}</td>
      <td>${m.unit_price != null ? formatCurrency(m.unit_price) : '<span class="text-muted">—</span>'}</td>
      <td>${profit != null ? `<span class="text-profit">${formatCurrency(profit)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td class="text-muted">${escapeHtml(m.reference || '—')}</td>
      <td class="text-muted" style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(m.notes || '')}">${escapeHtml(m.notes || '—')}</td>
    </tr>`;
  }).join('');

  // Summary
  const totalEntradas  = filtered.filter(m => m.type === 'entrada').reduce((s, m) => s + m.quantity * m.unit_cost, 0);
  const totalSalidas   = filtered.filter(m => m.type === 'salida').reduce((s, m) => s + m.quantity * m.unit_cost, 0);
  const totalProfit    = filtered.filter(m => m.type === 'salida' && m.unit_price != null).reduce((s, m) => s + (m.unit_price! - m.unit_cost) * m.quantity, 0);
  D.movementsSummary.style.display = 'flex';
  D.movementsSummary.innerHTML = `
    <span>Registros: <span>${filtered.length}</span></span>
    <span>Costo entradas: <span>${formatCurrency(totalEntradas)}</span></span>
    <span>Costo salidas: <span>${formatCurrency(totalSalidas)}</span></span>
    <span>Utilidad: <span class="text-profit">${formatCurrency(totalProfit)}</span></span>
  `;
}

// ----------------------------------------------------------------
// Gestión Table
// ----------------------------------------------------------------
export function renderGestionTable() {
  const search = State.getGestionSearch().toLowerCase();
  const showInactive = State.getShowInactive();

  let items = showInactive ? State.getItems() : State.getItems().filter(i => i.is_active);
  if (search) items = items.filter(i => i.name.toLowerCase().includes(search) || i.manual_id.toLowerCase().includes(search));

  if (items.length === 0) {
    D.gestionTableBody.innerHTML = `<tr><td colspan="9" class="empty-row">No se encontraron ítems.</td></tr>`;
    return;
  }

  D.gestionTableBody.innerHTML = items.map(item => `<tr style="${!item.is_active ? 'opacity:.55;' : ''}">
    <td class="text-muted">${escapeHtml(item.manual_id)}</td>
    <td><strong>${escapeHtml(item.name)}</strong></td>
    <td>${categoryBadge(item.category)}</td>
    <td>${escapeHtml(item.unit)}</td>
    <td>${item.min_stock}</td>
    <td>${formatCurrency(item.cost_price)}</td>
    <td>${item.category === 'vendible' && item.sale_price != null ? formatCurrency(item.sale_price) : '<span class="text-muted">—</span>'}</td>
    <td><span class="badge ${item.is_active ? 'badge-active' : 'badge-inactive'}">${item.is_active ? 'Activo' : 'Inactivo'}</span></td>
    <td class="col-actions">
      <button class="btn btn-icon edit-item-btn" data-id="${item.id}" title="Editar"><i class="fas fa-edit"></i></button>
      <button class="btn btn-icon danger toggle-active-btn" data-id="${item.id}" data-active="${item.is_active}" title="${item.is_active ? 'Desactivar' : 'Activar'}">
        <i class="fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
      </button>
    </td>
  </tr>`).join('');
}

// ----------------------------------------------------------------
// Modal: New/Edit Item
// ----------------------------------------------------------------
export function openItemModal(itemId: string | null = null) {
  const item = itemId ? State.getItemById(itemId) : null;
  D.modalTitle.textContent = item ? 'Editar ítem' : 'Nuevo ítem';

  D.modalBody.innerHTML = `
    <div class="form-group">
      <label>Categoría</label>
      <select name="category" class="form-control" id="item-category">
        <option value="consumible" ${item?.category === 'consumible' ? 'selected' : ''}>Consumible (uso interno)</option>
        <option value="vendible"   ${item?.category === 'vendible'   ? 'selected' : ''}>Vendible (genera utilidades)</option>
      </select>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Nombre</label>
        <input name="name" class="form-control" value="${escapeHtml(item?.name || '')}" required placeholder="Ej. Tubería 1/4&quot;" />
      </div>
      <div class="form-group">
        <label>Unidad de medida</label>
        <input name="unit" class="form-control" value="${escapeHtml(item?.unit || 'unidad')}" placeholder="unidad, metro, kg, rollo..." />
      </div>
    </div>
    <div class="form-group">
      <label>Descripción (opcional)</label>
      <input name="description" class="form-control" value="${escapeHtml(item?.description || '')}" placeholder="Descripción corta" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Stock inicial / actual</label>
        <input name="current_stock" type="number" min="0" class="form-control" value="${item?.current_stock ?? 0}" />
      </div>
      <div class="form-group">
        <label>Stock mínimo (alerta)</label>
        <input name="min_stock" type="number" min="0" class="form-control" value="${item?.min_stock ?? 0}" />
        <p class="form-hint">Se mostrará alerta cuando el stock llegue a este nivel.</p>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Precio de costo (compra)</label>
        <input name="cost_price" type="number" min="0" class="form-control" value="${item?.cost_price ?? 0}" />
      </div>
      <div class="form-group" id="sale-price-group" style="${item?.category !== 'vendible' ? 'display:none' : ''}">
        <label>Precio de venta</label>
        <input name="sale_price" type="number" min="0" class="form-control" value="${item?.sale_price ?? ''}" placeholder="Solo para vendibles" />
      </div>
    </div>
  `;

  // Show/hide sale price based on category
  const catSel = D.modalBody.querySelector('#item-category') as HTMLSelectElement;
  const salePriceGroup = D.modalBody.querySelector('#sale-price-group') as HTMLDivElement;
  catSel.addEventListener('change', () => {
    salePriceGroup.style.display = catSel.value === 'vendible' ? '' : 'none';
  });

  D.modalConfirm.textContent = item ? 'Guardar cambios' : 'Crear ítem';
  D.modalConfirm.dataset.action = 'save-item';
  D.modalConfirm.dataset.itemId = itemId || '';
  D.modalFooter.style.display = 'flex';
  showModal();
}

// ----------------------------------------------------------------
// Modal: Register Movement
// ----------------------------------------------------------------
export function openMovementModal(preselectedItemId?: string, preselectedType?: 'entrada' | 'salida' | 'devolucion') {
  const defaultType = preselectedType || 'entrada';

  D.modalTitle.textContent = 'Registrar movimiento';
  D.modalBody.innerHTML = buildMovementForm(defaultType, preselectedItemId);
  D.modalConfirm.textContent = 'Registrar';
  D.modalConfirm.dataset.action = 'save-movement';
  D.modalConfirm.dataset.itemId = '';
  D.modalFooter.style.display = 'flex';

  setupMovementFormListeners(defaultType);
  showModal();
}

function buildMovementForm(type: string, preselectedItemId?: string): string {
  const items = State.getItems().filter(i => i.is_active);
  const selectedItem = preselectedItemId ? State.getItemById(preselectedItemId) : null;

  return `
    <div class="move-type-tabs">
      <button type="button" class="move-type-tab ${type === 'entrada' ? 'active-entrada' : ''}" data-type="entrada"><i class="fas fa-arrow-down"></i> Entrada</button>
      <button type="button" class="move-type-tab ${type === 'salida' ? 'active-salida' : ''}" data-type="salida"><i class="fas fa-arrow-up"></i> Salida</button>
      <button type="button" class="move-type-tab ${type === 'devolucion' ? 'active-devolucion' : ''}" data-type="devolucion"><i class="fas fa-rotate-left"></i> Devolución</button>
    </div>
    <input type="hidden" id="mov-type" value="${type}" />

    <div class="form-group">
      <label>Ítem</label>
      <div class="autocomplete-wrapper">
        <input type="text" id="item-search-mov" class="form-control" placeholder="Buscar ítem..." autocomplete="off"
          value="${escapeHtml(selectedItem?.name || '')}" />
        <input type="hidden" id="item-id-mov" value="${selectedItem?.id || ''}" />
        <div class="autocomplete-results" id="item-autocomplete">
          ${items.map(i => `<div class="autocomplete-item" data-id="${i.id}" data-name="${escapeHtml(i.name)}" data-cost="${i.cost_price}" data-price="${i.sale_price ?? ''}" data-unit="${escapeHtml(i.unit)}" data-cat="${i.category}" data-stock="${i.current_stock}">
            <span>${escapeHtml(i.name)} <small class="text-muted">[${escapeHtml(i.manual_id)}]</small></span>
            <span class="ac-stock">Stock: ${i.current_stock} ${escapeHtml(i.unit)}</span>
          </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="mov-quantity" class="form-control" min="0.01" step="any" value="1" />
      </div>
      <div class="form-group">
        <label>Precio de costo (unit.)</label>
        <input type="number" id="mov-unit-cost" class="form-control" min="0" step="any" value="${selectedItem?.cost_price ?? 0}" />
      </div>
    </div>

    <div class="form-group" id="sale-price-row" style="${type === 'salida' && selectedItem?.category === 'vendible' ? '' : 'display:none'}">
      <label>Precio de venta (unit.)</label>
      <input type="number" id="mov-unit-price" class="form-control" min="0" step="any" value="${selectedItem?.sale_price ?? ''}" />
    </div>

    <div id="profit-preview" style="display:none" class="profit-preview">
      Utilidad estimada: <span id="profit-preview-val">—</span>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Referencia (orden, cotización…)</label>
        <input type="text" id="mov-reference" class="form-control" placeholder="Ej. ORD-1234" />
      </div>
      <div class="form-group">
        <label>Técnico / responsable</label>
        <div class="autocomplete-wrapper">
          <input type="text" id="mov-worker" class="form-control" placeholder="Buscar técnico..." autocomplete="off" />
          <div class="autocomplete-results" id="worker-autocomplete">
            ${State.getTechnicians().map(t => `<div class="autocomplete-item" data-name="${escapeHtml(t.name || '')}">
              <span>${escapeHtml(t.name || '')}${t.cedula ? ` <small class="text-muted">${escapeHtml(t.cedula)}</small>` : ''}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>Notas (opcional)</label>
      <input type="text" id="mov-notes" class="form-control" placeholder="Observaciones adicionales" />
    </div>
  `;
}

function setupMovementFormListeners(initialType: string) {
  // Type tabs
  const typeTabs = D.modalBody.querySelectorAll('.move-type-tab');
  typeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const newType = (tab as HTMLElement).dataset.type!;
      (document.getElementById('mov-type') as HTMLInputElement).value = newType;
      typeTabs.forEach(t => t.className = 'move-type-tab');
      tab.classList.add(`active-${newType}`);
      updateSalePriceVisibility();
      updateProfitPreview();
    });
  });

  // Autocomplete
  const searchInput = document.getElementById('item-search-mov') as HTMLInputElement;
  const hiddenId    = document.getElementById('item-id-mov') as HTMLInputElement;
  const acList      = document.getElementById('item-autocomplete') as HTMLDivElement;
  const allItems    = acList.querySelectorAll('.autocomplete-item');

  searchInput.addEventListener('input', () => {
    const term = searchInput.value.toLowerCase();
    let found = 0;
    allItems.forEach(el => {
      const name = (el as HTMLElement).dataset.name!.toLowerCase();
      const show = term.length === 0 || name.includes(term);
      (el as HTMLElement).style.display = show ? '' : 'none';
      if (show) found++;
    });
    acList.style.display = found > 0 ? 'block' : 'none';
    if (!term) hiddenId.value = '';
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.length === 0) acList.style.display = 'block';
  });

  allItems.forEach(el => {
    el.addEventListener('click', () => {
      const h = el as HTMLElement;
      searchInput.value = h.dataset.name!;
      hiddenId.value    = h.dataset.id!;
      acList.style.display = 'none';

      const costInput  = document.getElementById('mov-unit-cost')  as HTMLInputElement;
      const priceInput = document.getElementById('mov-unit-price') as HTMLInputElement;
      costInput.value  = h.dataset.cost || '0';
      if (h.dataset.price) priceInput.value = h.dataset.price;

      D.modalConfirm.dataset.itemCat = h.dataset.cat || '';
      updateSalePriceVisibility();
      updateProfitPreview();
    });
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target as Node) && !acList.contains(e.target as Node)) {
      acList.style.display = 'none';
    }
  });

  // Worker autocomplete
  const workerInput = document.getElementById('mov-worker') as HTMLInputElement;
  const workerList  = document.getElementById('worker-autocomplete') as HTMLDivElement;
  const workerItems = workerList?.querySelectorAll('.autocomplete-item');

  if (workerInput && workerList && workerItems.length > 0) {
    workerInput.addEventListener('input', () => {
      const term = workerInput.value.toLowerCase();
      let found = 0;
      workerItems.forEach(el => {
        const name = (el as HTMLElement).dataset.name!.toLowerCase();
        const show = term.length === 0 || name.includes(term);
        (el as HTMLElement).style.display = show ? '' : 'none';
        if (show) found++;
      });
      workerList.style.display = found > 0 ? 'block' : 'none';
    });
    workerInput.addEventListener('focus', () => {
      if (workerInput.value.length === 0) workerList.style.display = 'block';
    });
    workerItems.forEach(el => {
      el.addEventListener('click', () => {
        workerInput.value = (el as HTMLElement).dataset.name!;
        workerList.style.display = 'none';
      });
    });
    document.addEventListener('click', (e) => {
      if (!workerInput.contains(e.target as Node) && !workerList.contains(e.target as Node)) {
        workerList.style.display = 'none';
      }
    });
  }

  // Profit preview
  const qtyInput   = document.getElementById('mov-quantity')   as HTMLInputElement;
  const costInput  = document.getElementById('mov-unit-cost')  as HTMLInputElement;
  const priceInput = document.getElementById('mov-unit-price') as HTMLInputElement;
  [qtyInput, costInput, priceInput].forEach(el => el?.addEventListener('input', updateProfitPreview));

  function updateSalePriceVisibility() {
    const type    = (document.getElementById('mov-type') as HTMLInputElement).value;
    const cat     = D.modalConfirm.dataset.itemCat || '';
    const priceRow = document.getElementById('sale-price-row');
    if (priceRow) priceRow.style.display = (type === 'salida' && cat === 'vendible') ? '' : 'none';
  }

  function updateProfitPreview() {
    const type       = (document.getElementById('mov-type') as HTMLInputElement).value;
    const preview    = document.getElementById('profit-preview')!;
    const previewVal = document.getElementById('profit-preview-val')!;
    const cat        = D.modalConfirm.dataset.itemCat || '';
    if (type !== 'salida' || cat !== 'vendible') { preview.style.display = 'none'; return; }
    const qty   = parseFloat(qtyInput?.value || '0') || 0;
    const cost  = parseFloat(costInput?.value || '0') || 0;
    const price = parseFloat(priceInput?.value || '0') || 0;
    if (price === 0) { preview.style.display = 'none'; return; }
    const profit = (price - cost) * qty;
    preview.style.display = 'flex';
    previewVal.textContent = formatCurrency(profit);
    previewVal.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  // Set initial category from preselected item
  const preId = (document.getElementById('item-id-mov') as HTMLInputElement).value;
  if (preId) {
    const item = State.getItemById(preId);
    if (item) D.modalConfirm.dataset.itemCat = item.category;
  }
  updateSalePriceVisibility();
}

// ----------------------------------------------------------------
// Modal helpers
// ----------------------------------------------------------------
export function showModal() {
  D.modalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
export function closeModal() {
  D.modalOverlay.style.display = 'none';
  document.body.style.overflow = '';
  D.modalConfirm.dataset.action = '';
  D.modalConfirm.dataset.itemId = '';
  D.modalConfirm.dataset.itemCat = '';
}

// ----------------------------------------------------------------
// Badge helpers
// ----------------------------------------------------------------
function categoryBadge(cat: string): string {
  return cat === 'vendible'
    ? '<span class="badge badge-vendible"><i class="fas fa-tag"></i> Vendible</span>'
    : '<span class="badge badge-consumible"><i class="fas fa-wrench"></i> Consumible</span>';
}

function movementBadge(type: string): string {
  const map: Record<string, string> = {
    entrada:    '<span class="badge badge-entrada"><i class="fas fa-arrow-down"></i> Entrada</span>',
    salida:     '<span class="badge badge-salida"><i class="fas fa-arrow-up"></i> Salida</span>',
    devolucion: '<span class="badge badge-devolucion"><i class="fas fa-rotate-left"></i> Devolución</span>',
  };
  return map[type] || type;
}

function statusLabel(s: 'ok' | 'low' | 'out'): string {
  return stockStatusLabel(s);
}