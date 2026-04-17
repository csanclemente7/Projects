import * as State from './state';
import type { Order, OrderItem } from './types';
import { supabaseOrders, supabaseQuotes } from './supabase';
import html2canvas from 'html2canvas';

// ----------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------
const NO_ASIGNADO_ID = '849dac95-99d8-4f43-897e-7565fec32382';

const MONTHS  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DAYS    = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAYS_SH = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', scheduled: 'Agendada',
  in_progress: 'En progreso', completed: 'Completada', cancelled: 'Cancelada',
};

const HOUR_H_DESKTOP = 60; // px por hora
const HOUR_H_MOBILE  = 56;
const TL_START = 7;   // 7 AM
const TL_END   = 21;  // 9 PM

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day  = copy.getDay();
  copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
  return copy;
}

function isMobile(): boolean { return window.innerWidth <= 768; }

function formatTime(t: string | null): string {
  if (!t) return 'Todo el día';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function getServiceTypeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('preventivo'))                    return '#3b82f6';
  if (t.includes('montaje') || t.includes('instalac')) return '#f97316';
  if (t.includes('correctivo'))                    return '#ef4444';
  if (t.includes('desmonte'))                      return '#a855f7';
  if (t.includes('mano de obra'))                  return '#14b8a6';
  return '#5b78f6';
}

function getPillColor(order: Order): string {
  if (!order.order_type) return '#5b78f6';
  return getServiceTypeColor(order.order_type.split(' • ')[0]);
}

function getLocationName(order: Order): string {
  if (order.sede_id) {
    const sede = State.getSedeById(order.sede_id);
    if (sede) {
      // sede.client_id != null → es una sede real; mostrar "Empresa - Sede"
      if (sede.client_id) {
        const parent = State.getClientById(sede.client_id);
        if (parent?.name) return `${parent.name} - ${sede.name}`;
      }
      // sin client_id → registro raíz o legacy, solo el nombre de la sede
      return sede.name;
    }
  }
  const client = State.getClientById(order.clientId);
  return client?.name || '—';
}

function getLocationAddress(order: Order): string {
  // maintenance_companies tiene address pero NO city (usa city_id como FK)
  // clients sí tiene address + city directamente
  if (order.sede_id) {
    const sede = State.getSedeById(order.sede_id);
    // Primero intentar dirección de la sede
    if (sede?.address) return sede.address;
    // Si no, buscar en el cliente padre (client_id de la sede)
    if (sede?.client_id) {
      const parent = State.getClientById(sede.client_id);
      if (parent?.address) return parent.city ? `${parent.address}, ${parent.city}` : parent.address;
    }
  }
  // Fallback: dirección del cliente de la orden
  const client = State.getClientById(order.clientId);
  if (client?.address) return client.city ? `${client.address}, ${client.city}` : client.address;
  return '';
}

function getRealTechNames(order: Order): string[] {
  return order.technicianIds
    .filter(id => id !== NO_ASIGNADO_ID)
    .map(id => State.getTechnicianById(id)?.name || null)
    .filter(Boolean) as string[];
}

interface ServiceSummary { name: string; quantity: number; }

function getServiceSummaries(order: Order): ServiceSummary[] {
  if (!order.order_type) return [];

  const names = order.order_type.split(' • ').map(s => s.trim()).filter(Boolean);
  const map   = new Map<string, ServiceSummary>();
  names.forEach(n => map.set(n.toLowerCase(), { name: n, quantity: 0 }));

  // Sumar cantidades de los ítems que coincidan con cada tipo de servicio
  (order.items || []).forEach(item => {
    const desc = item.description.toLowerCase();
    for (const [key, summary] of map) {
      // Coincidencia por palabra clave del tipo de servicio dentro de la descripción del ítem
      const keyword = key.split(' ')[0]; // primera palabra ("preventivo", "correctivo"…)
      if (desc.includes(keyword)) {
        summary.quantity += item.quantity;
        break;
      }
    }
  });

  return Array.from(map.values()).map(s => ({
    ...s,
    quantity: s.quantity > 0 ? Math.round(s.quantity) : 1,
  }));
}

function buildServiceBadges(order: Order): string {
  const summaries = getServiceSummaries(order);
  if (summaries.length === 0) return '';

  return summaries.map(s => {
    const color   = getServiceTypeColor(s.name);
    const qtyHtml = s.quantity > 1
      ? `<span class="svc-qty" style="background:${color}">${s.quantity}</span>`
      : '';
    return `<span class="svc-wrap">
      <span class="service-badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${esc(s.name)}</span>
      ${qtyHtml}
    </span>`;
  }).join('');
}

function statusChip(status: string): string {
  if (status === 'completed') {
    return `<span class="status-chip s-completed" title="Completada"><i class="fas fa-circle-check"></i></span>`;
  }
  return `<span class="status-chip s-${status}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

function container(): HTMLElement {
  return document.getElementById('agenda-container')!;
}

// ----------------------------------------------------------------
// Render principal
// ----------------------------------------------------------------
export function render() {
  updateHeaderPeriod();
  const view = State.getAgendaView();
  if (view === 'month') renderMonthView();
  if (view === 'week')  { renderWeekView(); scrollToToday(); }
  if (view === 'day')   renderDayView();
}

function scrollToToday() {
  // Esperar al siguiente frame para que el DOM esté pintado
  requestAnimationFrame(() => {
    const todayEl = document.getElementById('today-section');
    if (!todayEl) return;
    todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ----------------------------------------------------------------
// Header period
// ----------------------------------------------------------------
export function updateHeaderPeriod() {
  const el   = document.getElementById('header-period')!;
  const date = State.getAgendaDate();
  const view = State.getAgendaView();

  if (view === 'month') {
    el.textContent = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  } else if (view === 'week') {
    const mon = getMonday(date);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMonth = mon.getMonth() === sun.getMonth();
    if (sameMonth) {
      el.textContent = `${mon.getDate()} – ${sun.getDate()} ${MONTHS_SHORT[mon.getMonth()]} ${mon.getFullYear()}`;
    } else {
      el.textContent = `${mon.getDate()} ${MONTHS_SHORT[mon.getMonth()]} – ${sun.getDate()} ${MONTHS_SHORT[sun.getMonth()]} ${sun.getFullYear()}`;
    }
  } else {
    el.textContent = `${DAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
}

// ----------------------------------------------------------------
// MONTH VIEW
// ----------------------------------------------------------------
function renderMonthView() {
  const date  = State.getAgendaDate();
  const year  = date.getFullYear();
  const month = date.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const gridStart    = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // retroceder al domingo

  const todayStr    = toDateStr(new Date());
  const selectedStr = State.getSelectedDay();

  let html = `<div class="month-grid">`;

  // Cabeceras días
  DAYS_SH.forEach(d => { html += `<div class="weekday-hdr">${d}</div>`; });

  // 42 celdas
  for (let i = 0; i < 42; i++) {
    const cell = new Date(gridStart);
    cell.setDate(gridStart.getDate() + i);
    const dateStr     = toDateStr(cell);
    const otherMonth  = cell.getMonth() !== month;
    const isToday     = dateStr === todayStr;
    const isSelected  = dateStr === selectedStr;
    const dayOrders   = State.getOrdersForDate(dateStr);

    let cls = 'month-cell';
    if (otherMonth)  cls += ' other-month';
    if (isToday)     cls += ' is-today';
    if (isSelected)  cls += ' is-selected';

    // Píldoras desktop
    const maxPills = 3;
    let pills = '<div class="month-pills">';
    dayOrders.slice(0, maxPills).forEach(o => {
      const color = getPillColor(o);
      const time  = o.service_time ? formatTime(o.service_time) + ' ' : '';
      const loc   = getLocationName(o);
      pills += `<div class="month-pill" style="background:${color}" title="${esc(loc)}">${esc(time + loc)}</div>`;
    });
    if (dayOrders.length > maxPills) {
      pills += `<div class="month-more">+${dayOrders.length - maxPills} más</div>`;
    }
    pills += '</div>';

    // Puntos móvil
    let dots = '<div class="month-dots">';
    dayOrders.slice(0, 7).forEach(o => {
      dots += `<div class="order-dot" style="background:${getPillColor(o)}"></div>`;
    });
    dots += '</div>';

    html += `<div class="${cls}" data-date="${dateStr}">
      <span class="day-num">${cell.getDate()}</span>
      ${pills}${dots}
    </div>`;
  }

  html += '</div>';
  container().innerHTML = html;
}

// ----------------------------------------------------------------
// WEEK VIEW
// ----------------------------------------------------------------
function renderWeekView() {
  const monday = getMonday(State.getAgendaDate());
  const todayStr = toDateStr(new Date());
  let html = '<div class="week-view">';

  for (let i = 0; i < 7; i++) {
    const day    = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dateStr = toDateStr(day);
    const isToday = dateStr === todayStr;
    const orders  = State.getOrdersForDate(dateStr).sort((a, b) =>
      (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

    const tomorrowStr = (() => { const t = new Date(); t.setDate(t.getDate() + 1); return toDateStr(t); })();
    const isTomorrow  = dateStr === tomorrowStr;

    const extraLabel = isToday ? 'Hoy' : isTomorrow ? 'Mañana' : null;
    const extraCls   = isToday ? 'day-extra-label is-today-label' : 'day-extra-label is-tomorrow-label';

    const headerCls = `day-sec-header${isToday ? ' is-today' : ''}`;
    const todayAttr  = isToday ? ' id="today-section"' : '';
    html += `<div class="day-section"${todayAttr}>
      <div class="${headerCls}">
        <div class="day-sec-left">
          <span class="day-sec-name">${DAYS[day.getDay()]}</span>
          <span class="day-sec-date">${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}</span>
          ${extraLabel ? `<span class="${extraCls}">${extraLabel}</span>` : ''}
        </div>
        ${orders.length > 0 ? `<span class="day-order-count">${orders.length} orden${orders.length > 1 ? 'es' : ''}</span>` : ''}
      </div>`;

    if (orders.length === 0) {
      html += `<p class="day-empty">Sin órdenes agendadas</p>`;
    } else {
      orders.forEach(o => { html += buildOrderCard(o); });
    }

    html += '</div>';
  }

  html += '</div>';
  container().innerHTML = html;
}

function buildOrderCard(o: Order): string {
  const techs   = getRealTechNames(o);
  const hasTech = techs.length > 0;
  const loc     = getLocationName(o);
  const address = getLocationAddress(o);

  const techsHtml = hasTech
    ? techs.map(t => `<span class="tech-chip"><i class="fas fa-user"></i>${esc(t)}</span>`).join('')
    : `<span class="no-tech"><i class="fas fa-user-slash"></i> Sin técnico</span>`;

  return `<div class="order-card" data-order-id="${esc(o.id)}">
    <div class="order-time-col">
      ${o.service_time
        ? `<div class="order-time">${formatTime(o.service_time)}</div>`
        : `<div class="order-allday">Todo el día</div>`}
    </div>
    <div class="order-body">
      <div class="order-top-row">
        <span class="order-location">${esc(loc)}</span>
        <span class="order-manual-id">#${esc(o.manualId)}</span>
        ${statusChip(o.status)}
      </div>
      ${address ? `<div class="order-address"><i class="fas fa-location-dot"></i> ${esc(address)}</div>` : ''}
      <div class="order-badges">${buildServiceBadges(o)}</div>
      <div class="order-techs">${techsHtml}</div>
      ${o.notes ? `<div class="order-notes">${esc(o.notes)}</div>` : ''}
    </div>
  </div>`;
}

// ----------------------------------------------------------------
// DAY VIEW (timeline)
// ----------------------------------------------------------------
function renderDayView() {
  const dateStr = toDateStr(State.getAgendaDate());
  const orders  = State.getOrdersForDate(dateStr).sort((a, b) =>
    (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

  const allDay  = orders.filter(o => !o.service_time);
  const timed   = orders.filter(o =>  o.service_time);
  const HR      = isMobile() ? HOUR_H_MOBILE : HOUR_H_DESKTOP;
  const hours   = TL_END - TL_START;

  let html = '<div class="day-view">';

  // Órdenes sin hora
  if (allDay.length > 0) {
    html += `<div class="allday-header">
      <div class="allday-label">TODO EL DÍA</div>
      ${allDay.map(o => buildOrderCard(o)).join('')}
    </div>`;
  }

  // Timeline
  html += `<div class="timeline-wrap"><div class="timeline-body" style="--hr:${HR}px">`;

  // Gutter con horas
  html += '<div class="time-gutter">';
  for (let h = TL_START; h <= TL_END; h++) {
    const top = (h - TL_START) * HR;
    const lbl = h === 12 ? '12 pm' : h > 12 ? `${h-12} pm` : `${h} am`;
    html += `<div class="time-lbl" style="top:${top}px">${lbl}</div>`;
  }
  html += '</div>';

  // Área de eventos
  html += `<div class="events-area" style="height:${hours * HR}px">`;

  // Líneas de hora y media hora
  for (let h = 0; h < hours; h++) {
    html += `<div class="hour-line" style="top:${h * HR}px"></div>`;
    html += `<div class="half-line" style="top:${h * HR + HR/2}px"></div>`;
  }

  // Posicionar eventos con detección de solapamiento
  const positioned = positionEvents(timed, HR);
  positioned.forEach(({ order: o, top, height, col, totalCols }) => {
    const color  = getPillColor(o);
    const w      = `calc((100% - 2px) / ${totalCols})`;
    const left   = `calc(${col} * (100% - 2px) / ${totalCols})`;
    const bg     = `${color}22`;
    const techs  = getRealTechNames(o).join(', ');
    const loc    = getLocationName(o);

    html += `<div class="tl-event" style="top:${top}px;height:${height}px;width:${w};left:${left};background:${bg};border-color:${color};color:${color}">
      <div class="tl-ev-time">${formatTime(o.service_time)}</div>
      <div class="tl-ev-loc" style="color:var(--text)">${esc(loc)}</div>
      ${o.order_type ? `<div class="tl-ev-type">${esc(o.order_type.split(' • ')[0])}</div>` : ''}
      ${techs ? `<div class="tl-ev-tech"><i class="fas fa-user" style="font-size:.55rem"></i> ${esc(techs)}</div>` : ''}
    </div>`;
  });

  html += '</div></div></div></div>';
  container().innerHTML = html;
}

interface PositionedEvent {
  order: Order; top: number; height: number; col: number; totalCols: number;
}

function positionEvents(orders: Order[], HR: number): PositionedEvent[] {
  const mapped = orders.map(o => {
    const [h, m] = o.service_time!.split(':').map(Number);
    const startMin = h * 60 + m;
    const dur      = Math.max(o.estimated_duration ?? 1, 0.5);
    const endMin   = startMin + dur * 60;
    return { order: o, startMin, endMin };
  });

  // Asignar columnas (interval scheduling)
  const cols: number[] = [];
  const assigned = mapped.map(ev => {
    let col = cols.findIndex(end => end <= ev.startMin);
    if (col === -1) { col = cols.length; cols.push(0); }
    cols[col] = ev.endMin;
    return { ...ev, col };
  });

  const totalCols = Math.max(cols.length, 1);

  return assigned.map(ev => {
    const [h, m] = ev.order.service_time!.split(':').map(Number);
    const dur    = Math.max(ev.order.estimated_duration ?? 1, 0.5);
    return {
      order:     ev.order,
      top:       (h - TL_START + m / 60) * HR,
      height:    Math.max(dur * HR, 30),
      col:       ev.col,
      totalCols,
    };
  });
}

// ----------------------------------------------------------------
// Panel móvil (día seleccionado desde vista mes)
// ----------------------------------------------------------------
export function openDayPanel(dateStr: string) {
  State.setSelectedDay(dateStr);
  render(); // re-renderizar mes para marcar celda seleccionada

  const orders = State.getOrdersForDate(dateStr).sort((a, b) =>
    (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr = toDateStr(new Date());
  const label = dateStr === todayStr ? 'Hoy' : `${DAYS[date.getDay()]}`;

  document.getElementById('panel-header')!.innerHTML = `
    <h3>${label}, ${d} ${MONTHS[m - 1]}</h3>
    <p>${orders.length} orden${orders.length !== 1 ? 'es' : ''} agendada${orders.length !== 1 ? 's' : ''}</p>
  `;

  const body = document.getElementById('panel-body')!;
  if (orders.length === 0) {
    body.innerHTML = `<div class="empty-agenda" style="padding:32px 16px">
      <i class="fas fa-calendar-xmark"></i>
      <p>No hay órdenes para este día</p>
    </div>`;
  } else {
    body.innerHTML = orders.map(o => buildOrderCard(o)).join('');
  }

  document.getElementById('panel-overlay')!.classList.add('open');
  document.getElementById('day-panel')!.classList.add('open');
}

export function closeDayPanel() {
  document.getElementById('panel-overlay')!.classList.remove('open');
  document.getElementById('day-panel')!.classList.remove('open');
  State.setSelectedDay('');
  render();
}

// ----------------------------------------------------------------
// Modal detalle de orden
// ----------------------------------------------------------------
export function openOrderDetail(orderId: string) {
  const o = State.getOrderById(orderId);
  if (!o) return;

  const loc     = getLocationName(o);
  const address = getLocationAddress(o);
  const techs   = getRealTechNames(o);

  // Fecha
  const [y, mo, d] = (o.service_date || '').split('-').map(Number);
  const dateObj   = o.service_date ? new Date(y, mo - 1, d) : null;
  const dateLabel = dateObj
    ? `${DAYS[dateObj.getDay()]}, ${dateObj.getDate()} ${MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`
    : '—';

  // Duración
  const durLabel = o.estimated_duration
    ? o.estimated_duration === 1 ? '1 hora' : `${o.estimated_duration} horas`
    : null;

  // Insumos / items
  let itemsHtml = '';
  if (o.items && o.items.length > 0) {
    const rows = o.items.map((i: OrderItem) =>
      `<tr><td class="od-item-desc">${esc(i.description)}</td><td class="od-item-qty">${i.quantity}</td></tr>`
    ).join('');
    itemsHtml = `
      <div class="od-section">
        <div class="od-section-title"><i class="fas fa-boxes-stacked"></i> Insumos / Servicios</div>
        <table class="od-items-table">
          <thead><tr><th>Descripción</th><th>Cant.</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // Fotos placeholder (se cargan async)
  const hasPhotos = o.image_urls && o.image_urls.length > 0;
  const photosHtml = hasPhotos
    ? `<div class="od-section">
        <div class="od-section-title"><i class="fas fa-images"></i> Fotos adjuntas (${o.image_urls!.length})</div>
        <div id="od-photos-grid" class="od-photos-grid">
          ${o.image_urls!.map((_: string, i: number) =>
            `<div class="od-photo-cell loading" data-photo-idx="${i}">
              <i class="fas fa-spinner fa-spin"></i>
            </div>`
          ).join('')}
        </div>
      </div>`
    : '';

  document.getElementById('om-manual-id')!.textContent = `#${o.manualId}`;

  document.getElementById('order-modal-body')!.innerHTML = `
    <div class="od-header">
      <div class="od-location">${esc(loc)}</div>
      ${statusChip(o.status)}
    </div>

    <div class="od-section od-meta-grid">
      <div class="od-meta-item"><i class="fas fa-calendar"></i> ${esc(dateLabel)}</div>
      ${o.service_time
        ? `<div class="od-meta-item"><i class="fas fa-clock"></i> ${esc(formatTime(o.service_time))}${durLabel ? ` · ${esc(durLabel)}` : ''}</div>`
        : `<div class="od-meta-item"><i class="fas fa-clock"></i> Todo el día${durLabel ? ` · ${esc(durLabel)}` : ''}</div>`}
      ${address ? `<div class="od-meta-item od-meta-full"><i class="fas fa-location-dot"></i> ${esc(address)}</div>` : ''}
    </div>

    ${buildServiceBadges(o) ? `<div class="od-section"><div class="order-badges">${buildServiceBadges(o)}</div></div>` : ''}

    <div class="od-section">
      <div class="od-section-title"><i class="fas fa-user-hard-hat"></i> Técnicos</div>
      <div class="od-techs-list">
        ${techs.length > 0
          ? techs.map(t => `<span class="tech-chip"><i class="fas fa-user"></i>${esc(t)}</span>`).join('')
          : `<span class="no-tech"><i class="fas fa-user-slash"></i> Sin técnico asignado</span>`}
      </div>
    </div>

    ${o.notes ? `
    <div class="od-section">
      <div class="od-section-title"><i class="fas fa-note-sticky"></i> Notas</div>
      <p class="od-notes-text">${esc(o.notes)}</p>
    </div>` : ''}

    ${itemsHtml}
    ${photosHtml}
  `;

  document.getElementById('order-modal-overlay')!.classList.add('open');
  document.getElementById('order-modal')!.classList.add('open');

  if (hasPhotos) {
    loadOrderPhotos(o);
  }
}

export function closeOrderDetail() {
  document.getElementById('order-modal-overlay')!.classList.remove('open');
  document.getElementById('order-modal')!.classList.remove('open');
}

async function loadOrderPhotos(o: Order) {
  const urls = o.image_urls || [];
  const objectUrls: (string | null)[] = new Array(urls.length).fill(null);

  await Promise.all(urls.map(async (url, idx) => {
    const cell = document.querySelector(`#od-photos-grid [data-photo-idx="${idx}"]`) as HTMLElement | null;
    if (!cell) return;

    try {
      let downloadPromise;
      if (url.startsWith('QUOTE_IMG::')) {
        const clean = url.replace('QUOTE_IMG::', '');
        downloadPromise = supabaseQuotes.storage.from('quote-images').download(clean);
      } else {
        downloadPromise = supabaseOrders.storage.from('order-images').download(url);
      }

      const { data, error } = await downloadPromise;
      if (error || !data) throw error;

      const objUrl = URL.createObjectURL(data);
      objectUrls[idx] = objUrl;
      cell.classList.remove('loading');
      cell.innerHTML = `<img src="${objUrl}" alt="Foto ${idx + 1}" class="od-photo-img" data-photo-idx="${idx}" />`;
    } catch {
      cell.classList.remove('loading');
      cell.classList.add('error');
      cell.innerHTML = `<i class="fas fa-exclamation-triangle"></i>`;
    }
  }));

  // Registrar clicks para lightbox
  document.querySelectorAll('.od-photo-img').forEach(img => {
    img.addEventListener('click', () => {
      const idx = Number((img as HTMLElement).dataset.photoIdx);
      openLightbox(objectUrls, idx);
    });
  });
}

// ----------------------------------------------------------------
// Compartir orden como imagen por WhatsApp
// ----------------------------------------------------------------
export async function shareOrderAsImage() {
  const btn = document.getElementById('btn-share-order') as HTMLButtonElement;
  const body = document.getElementById('order-modal-body');
  const topbar = document.querySelector('.om-topbar') as HTMLElement | null;
  if (!body || !topbar) return;

  // Feedback visual en el botón
  btn.classList.add('loading');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    // Capturar el modal completo (topbar + body) sin el botón de compartir
    btn.style.visibility = 'hidden';
    const modal = document.getElementById('order-modal')!;

    const canvas = await html2canvas(modal, {
      backgroundColor: getComputedStyle(document.documentElement)
        .getPropertyValue('--surface').trim() || '#1e293b',
      scale: 2,
      useCORS: true,
      logging: false,
      ignoreElements: el => el.id === 'btn-share-order',
    });

    btn.style.visibility = '';

    canvas.toBlob(async (blob) => {
      if (!blob) return;

      const manualId = document.getElementById('om-manual-id')?.textContent || '';
      const fileName = `Orden${manualId.replace('#','_')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Intentar Web Share API (funciona en móvil)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Orden ${manualId}`,
          });
        } catch (err: any) {
          // Usuario canceló — no hacer nada
          if (err.name !== 'AbortError') console.warn('Share error:', err);
        }
      } else {
        // Fallback: descargar imagen
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }

      btn.classList.remove('loading');
      btn.innerHTML = '<i class="fab fa-whatsapp"></i>';
    }, 'image/png');

  } catch (err) {
    console.error('Error al capturar:', err);
    btn.style.visibility = '';
    btn.classList.remove('loading');
    btn.innerHTML = '<i class="fab fa-whatsapp"></i>';
  }
}

// ----------------------------------------------------------------
// Lightbox
// ----------------------------------------------------------------
let _lbUrls: (string | null)[] = [];
let _lbIdx = 0;

function openLightbox(urls: (string | null)[], startIdx: number) {
  _lbUrls = urls;
  _lbIdx  = startIdx;
  showLightboxFrame();
  document.getElementById('lightbox-overlay')!.classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox-overlay')!.classList.remove('open');
}

function showLightboxFrame() {
  const url = _lbUrls[_lbIdx];
  const img = document.getElementById('lightbox-img') as HTMLImageElement;
  if (url) img.src = url;
  const prevBtn = document.getElementById('lightbox-prev')!;
  const nextBtn = document.getElementById('lightbox-next')!;
  prevBtn.style.display = _lbUrls.length > 1 ? '' : 'none';
  nextBtn.style.display = _lbUrls.length > 1 ? '' : 'none';
}

export function setupLightbox() {
  document.getElementById('lightbox-close')!.addEventListener('click', closeLightbox);
  document.getElementById('lightbox-overlay')!.addEventListener('click', e => {
    if (e.target === document.getElementById('lightbox-overlay')) closeLightbox();
  });
  document.getElementById('lightbox-prev')!.addEventListener('click', e => {
    e.stopPropagation();
    _lbIdx = (_lbIdx - 1 + _lbUrls.length) % _lbUrls.length;
    showLightboxFrame();
  });
  document.getElementById('lightbox-next')!.addEventListener('click', e => {
    e.stopPropagation();
    _lbIdx = (_lbIdx + 1) % _lbUrls.length;
    showLightboxFrame();
  });
}

// ----------------------------------------------------------------
// Resumen semanal
// ----------------------------------------------------------------
function getWeekOrders(): Order[] {
  const monday = getMonday(State.getAgendaDate());
  const result: Order[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    result.push(...State.getOrdersForDate(toDateStr(d)));
  }
  return result;
}

export function openWeeklySummary() {
  const monday = getMonday(State.getAgendaDate());
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const weekLabel = `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]} ${sunday.getFullYear()}`;

  document.getElementById('sm-title-text')!.textContent = `Resumen semana ${weekLabel}`;

  const orders = getWeekOrders();

  // --- Agrupar insumos ---
  const itemsMap = new Map<string, number>();
  orders.forEach(o => {
    (o.items || []).forEach((item: OrderItem) => {
      const key = item.description.trim();
      if (!key) return;
      itemsMap.set(key, (itemsMap.get(key) || 0) + item.quantity);
    });
  });
  const sortedItems = Array.from(itemsMap.entries())
    .sort((a, b) => b[1] - a[1]);

  let itemsHtml = '';
  if (sortedItems.length === 0) {
    itemsHtml = `<p class="sum-empty"><i class="fas fa-box-open"></i><br>Sin insumos registrados esta semana</p>`;
  } else {
    const rows = sortedItems.map(([desc, qty]) =>
      `<tr>
        <td class="sum-td-desc">${esc(desc)}</td>
        <td class="sum-td-qty"><span class="sum-qty-badge">× ${qty}</span></td>
      </tr>`
    ).join('');
    itemsHtml = `
      <table class="sum-items-table">
        <thead><tr><th>Descripción</th><th>Cant.</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // --- Notas de la semana ---
  const ordersWithNotes = orders.filter(o => o.notes && o.notes.trim());
  let notesHtml = '';
  if (ordersWithNotes.length === 0) {
    notesHtml = `<p class="sum-empty"><i class="fas fa-note-sticky"></i><br>Sin notas esta semana</p>`;
  } else {
    notesHtml = ordersWithNotes.map(o => {
      const loc = getLocationName(o);
      const [y, mo, d] = (o.service_date || '').split('-').map(Number);
      const dateObj = o.service_date ? new Date(y, mo - 1, d) : null;
      const dateLabel = dateObj
        ? `${DAYS_SH[dateObj.getDay()]} ${dateObj.getDate()} ${MONTHS_SHORT[dateObj.getMonth()]}`
        : '';
      return `<div class="sum-note-card">
        <div class="sum-note-header">
          <span class="sum-note-loc">${esc(loc)} <span style="font-weight:400;color:var(--text-muted)">#${esc(o.manualId)}</span></span>
          <span class="sum-note-date">${esc(dateLabel)}</span>
        </div>
        <div class="sum-note-text">${esc(o.notes!)}</div>
      </div>`;
    }).join('');
  }

  document.getElementById('summary-modal-body')!.innerHTML = `
    <div>
      <div class="sum-section-title"><i class="fas fa-boxes-stacked"></i> Insumos y servicios</div>
      ${itemsHtml}
    </div>
    <div>
      <div class="sum-section-title"><i class="fas fa-note-sticky"></i> Notas internas</div>
      ${notesHtml}
    </div>
  `;

  document.getElementById('summary-modal-overlay')!.classList.add('open');
  document.getElementById('summary-modal')!.classList.add('open');
}

export function closeWeeklySummary() {
  document.getElementById('summary-modal-overlay')!.classList.remove('open');
  document.getElementById('summary-modal')!.classList.remove('open');
  closeShareMenu();
}

export function toggleShareMenu() {
  const menu  = document.getElementById('sm-share-menu')!;
  const arrow = document.getElementById('sm-share-arrow')!;
  const open  = menu.classList.toggle('open');
  arrow.style.transform = open ? 'rotate(180deg)' : '';
}

export function closeShareMenu() {
  const menu  = document.getElementById('sm-share-menu');
  const arrow = document.getElementById('sm-share-arrow');
  if (menu)  menu.classList.remove('open');
  if (arrow) arrow.style.transform = '';
}

// ----------------------------------------------------------------
// Compartir resumen por WhatsApp (texto)
// ----------------------------------------------------------------
function sendWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function buildItemsText(orders: Order[]): string {
  const map = new Map<string, number>();
  orders.forEach(o => {
    (o.items || []).forEach((item: OrderItem) => {
      const key = item.description.trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + item.quantity);
    });
  });
  if (map.size === 0) return '_Sin insumos registrados_';
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([desc, qty]) => `• ${desc} × ${qty}`)
    .join('\n');
}

export function shareTomorrowWhatsApp() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);
  const orders = State.getOrdersForDate(tomorrowStr);

  const dateLabel = `${DAYS[tomorrow.getDay()]} ${tomorrow.getDate()} ${MONTHS[tomorrow.getMonth()]}`;
  const itemsText = buildItemsText(orders);

  let lines = `📋 *Insumos y Servicios — Mañana (${dateLabel})*\n\n`;

  if (orders.length === 0) {
    lines += '_Sin órdenes agendadas para mañana_';
  } else {
    lines += itemsText;
    lines += `\n\n_${orders.length} orden${orders.length > 1 ? 'es' : ''} agendada${orders.length > 1 ? 's' : ''}_`;
  }

  lines += '\n\n_MACRIS Refrigeración y Climatización_';
  sendWhatsApp(lines);
}

export function shareTomorrowAgendaWhatsApp() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);
  const orders = State.getOrdersForDate(tomorrowStr)
    .sort((a, b) => (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

  const dateLabel = `${DAYS[tomorrow.getDay()]} ${tomorrow.getDate()} de ${MONTHS[tomorrow.getMonth()]}`;

  let text = `📅 *Agenda — Mañana ${dateLabel}*\n`;
  text += `${'─'.repeat(30)}\n`;

  if (orders.length === 0) {
    text += '\n_Sin órdenes agendadas para mañana_ 🎉';
  } else {
    text += `_${orders.length} orden${orders.length > 1 ? 'es' : ''} programada${orders.length > 1 ? 's' : ''}_\n`;

    orders.forEach((o, idx) => {
      text += `\n${idx + 1 <= 9 ? `${idx + 1}️⃣` : `${idx + 1}.`} `;

      // Hora
      if (o.service_time) {
        text += `⏰ *${formatTime(o.service_time)}*`;
        if (o.estimated_duration) {
          text += ` _(${o.estimated_duration}h)_`;
        }
        text += '\n';
      } else {
        text += `⏰ *Todo el día*\n`;
      }

      // Cliente / Sede
      const loc = getLocationName(o);
      text += `🏢 ${loc}\n`;

      // Dirección
      const address = getLocationAddress(o);
      if (address) text += `📍 ${address}\n`;

      // Tipo de servicio
      if (o.order_type) {
        const summaries = getServiceSummaries(o);
        const svcLine = summaries.map(s => s.quantity > 1 ? `${s.name} ×${s.quantity}` : s.name).join(' · ');
        text += `🔧 ${svcLine}\n`;
      }

      // Técnicos
      const techs = getRealTechNames(o);
      if (techs.length > 0) {
        text += `👷 ${techs.join(', ')}\n`;
      }

      // Estado
      const statusEmoji: Record<string, string> = {
        pending: '🟡', scheduled: '🔵', in_progress: '🟠', completed: '✅', cancelled: '❌'
      };
      const sEmoji = statusEmoji[o.status] || '⚪';
      text += `${sEmoji} ${STATUS_LABEL[o.status] || o.status}\n`;

      // Notas
      if (o.notes?.trim()) {
        text += `📝 _${o.notes.trim()}_\n`;
      }

      if (idx < orders.length - 1) text += '\n';
    });
  }

  text += `\n${'─'.repeat(30)}\n_MACRIS Refrigeración y Climatización_`;
  sendWhatsApp(text);
}

export function shareWeekWhatsApp() {
  const monday = getMonday(State.getAgendaDate());
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const weekLabel = `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_SHORT[sunday.getMonth()]} ${sunday.getFullYear()}`;

  const allOrders = getWeekOrders();
  const itemsText = buildItemsText(allOrders);

  // Órdenes por día
  let scheduleText = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dayOrders = State.getOrdersForDate(toDateStr(d));
    if (dayOrders.length === 0) continue;
    const dayLabel = `${DAYS_SH[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    scheduleText += `\n*${dayLabel}* (${dayOrders.length} orden${dayOrders.length > 1 ? 'es' : ''})\n`;
    dayOrders.forEach(o => {
      const loc  = getLocationName(o);
      const time = o.service_time ? `${formatTime(o.service_time)} ` : '';
      scheduleText += `  ${time}${loc}\n`;
    });
  }

  // Notas
  const ordersWithNotes = allOrders.filter(o => o.notes?.trim());
  let notesText = '';
  if (ordersWithNotes.length > 0) {
    notesText = '\n\n*📝 NOTAS*\n';
    ordersWithNotes.forEach(o => {
      const loc = getLocationName(o);
      const [y, mo, d] = (o.service_date || '').split('-').map(Number);
      const dateObj = o.service_date ? new Date(y, mo - 1, d) : null;
      const dl = dateObj ? `${DAYS_SH[dateObj.getDay()]} ${dateObj.getDate()} ${MONTHS_SHORT[dateObj.getMonth()]}` : '';
      notesText += `\n📍 _${loc}_ #${o.manualId}${dl ? ` | ${dl}` : ''}\n"${o.notes}"\n`;
    });
  }

  const text =
    `📋 *Resumen Semanal — ${weekLabel}*\n\n` +
    `*📦 INSUMOS Y SERVICIOS*\n${itemsText}` +
    (scheduleText ? `\n\n*🗓 AGENDA*${scheduleText}` : '') +
    notesText +
    `\n\n_MACRIS Refrigeración y Climatización_`;

  sendWhatsApp(text);
}

// ----------------------------------------------------------------
// Ajustes (tema + tamaño de letra)
// ----------------------------------------------------------------
export function openSettings() {
  syncSettingsUI();
  document.getElementById('settings-overlay')!.classList.add('open');
  document.getElementById('settings-panel')!.classList.add('open');
}

export function closeSettings() {
  document.getElementById('settings-overlay')!.classList.remove('open');
  document.getElementById('settings-panel')!.classList.remove('open');
}

function syncSettingsUI() {
  const theme    = localStorage.getItem('agenda-theme')    || 'dark';
  const fontsize = localStorage.getItem('agenda-fontsize') || 'normal';

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === theme);
  });
  document.querySelectorAll('.fontsize-btn').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.size === fontsize);
  });
}

export function applyTheme(theme: 'dark' | 'light' | 'navy') {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('agenda-theme', theme);
  syncSettingsUI();
}

export function applyFontSize(size: 'small' | 'normal' | 'large') {
  document.documentElement.dataset.fontsize = size;
  localStorage.setItem('agenda-fontsize', size);
  syncSettingsUI();
}

export function loadSavedSettings() {
  const theme    = (localStorage.getItem('agenda-theme')    || 'dark') as 'dark' | 'light' | 'navy';
  const fontsize = (localStorage.getItem('agenda-fontsize') || 'normal') as 'small' | 'normal' | 'large';
  document.documentElement.dataset.theme    = theme;
  document.documentElement.dataset.fontsize = fontsize;
}

// ----------------------------------------------------------------
// Última actualización
// ----------------------------------------------------------------
export function updateLastUpdated() {
  const el = document.getElementById('last-updated')!;
  const now = new Date();
  el.textContent = `Actualizado ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
}