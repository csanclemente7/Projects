import * as State from './state';
import * as UI    from './ui';
import { fetchOrders, fetchClients, fetchSedes, fetchTechnicians } from './api';
import type { AgendaView } from './types';

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutos

// ----------------------------------------------------------------
// Inicialización
// ----------------------------------------------------------------
async function init() {
  // Aplicar ajustes guardados antes de mostrar la app
  UI.loadSavedSettings();

  try {
    const [orders, clients, sedes, technicians] = await Promise.all([
      fetchOrders(),
      fetchClients(),
      fetchSedes(),
      fetchTechnicians(),
    ]);

    State.setOrders(orders);
    State.setClients(clients);
    State.setSedes(sedes);
    State.setTechnicians(technicians);

    document.getElementById('loader')!.style.display = 'none';
    document.getElementById('app')!.style.display    = 'flex';

    UI.render();
    UI.updateLastUpdated();

    setupEvents();
    setupSwipe();
    startAutoRefresh();

  } catch (err: any) {
    document.getElementById('loader')!.innerHTML = `
      <div style="text-align:center;padding:32px;color:#94a3b8;font-family:sans-serif">
        <p style="font-size:2rem;margin-bottom:12px">⚠️</p>
        <h2 style="margin-bottom:8px;color:#f1f5f9">Error al conectar</h2>
        <p style="margin-bottom:6px">No se pudo cargar la agenda.</p>
        <p style="font-size:.8rem;color:#64748b">${err.message || err}</p>
        <button onclick="location.reload()" style="margin-top:16px;padding:8px 20px;background:#5b78f6;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem">
          Reintentar
        </button>
      </div>`;
  }
}

// ----------------------------------------------------------------
// Eventos de navegación y vistas
// ----------------------------------------------------------------
function setupEvents() {
  // Botones header
  document.getElementById('btn-prev')!.addEventListener('click', () => navigate('prev'));
  document.getElementById('btn-next')!.addEventListener('click', () => navigate('next'));
  document.getElementById('btn-today')!.addEventListener('click', () => {
    State.setAgendaDate(new Date());
    UI.render();
  });
  document.getElementById('btn-refresh')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.classList.add('spinning');
    await refresh();
    btn.classList.remove('spinning');
  });

  // View switcher desktop
  document.getElementById('view-switcher')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-view]') as HTMLElement;
    if (!btn) return;
    switchView(btn.dataset.view as AgendaView);
  });

  // Bottom nav móvil
  document.getElementById('bottom-nav')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-view]') as HTMLElement;
    if (!btn) return;
    if (btn.dataset.view === State.getAgendaView()) {
      // Mismo botón: ir a hoy
      State.setAgendaDate(new Date());
    }
    switchView(btn.dataset.view as AgendaView);
  });

  // Click en celdas del mes (delegado)
  document.getElementById('agenda-container')!.addEventListener('click', e => {
    // Abrir detalle de orden si se clickea una tarjeta
    const card = (e.target as HTMLElement).closest('[data-order-id]') as HTMLElement | null;
    if (card?.dataset.orderId) {
      UI.openOrderDetail(card.dataset.orderId);
      return;
    }

    if (State.getAgendaView() !== 'month') return;
    const cell = (e.target as HTMLElement).closest('[data-date]') as HTMLElement | null;
    if (!cell?.dataset.date) return;
    if (isMobile()) {
      UI.openDayPanel(cell.dataset.date);
    } else {
      // Desktop: cambiar al día clickeado
      const [y, m, d] = cell.dataset.date.split('-').map(Number);
      State.setAgendaDate(new Date(y, m - 1, d));
      switchView('day');
    }
  });

  // Clicks en tarjetas dentro del panel del día (móvil)
  document.getElementById('panel-body')!.addEventListener('click', e => {
    const card = (e.target as HTMLElement).closest('[data-order-id]') as HTMLElement | null;
    if (card?.dataset.orderId) UI.openOrderDetail(card.dataset.orderId);
  });

  // Panel overlay — cerrar al tocar fondo
  document.getElementById('panel-overlay')!.addEventListener('click', UI.closeDayPanel);
  document.querySelector('.panel-handle')?.addEventListener('click', UI.closeDayPanel);

  // Modal detalle orden — cerrar
  document.getElementById('order-modal-overlay')!.addEventListener('click', UI.closeOrderDetail);
  document.getElementById('order-modal-close')!.addEventListener('click', UI.closeOrderDetail);

  // Compartir orden como imagen
  document.getElementById('btn-share-order')!.addEventListener('click', UI.shareOrderAsImage);

  // Lightbox
  UI.setupLightbox();

  // Resumen semanal
  document.getElementById('btn-summary')!.addEventListener('click', UI.openWeeklySummary);
  document.getElementById('summary-modal-close')!.addEventListener('click', UI.closeWeeklySummary);
  document.getElementById('summary-modal-overlay')!.addEventListener('click', UI.closeWeeklySummary);
  document.getElementById('btn-share-wa')!.addEventListener('click', e => { e.stopPropagation(); UI.toggleShareMenu(); });
  document.getElementById('btn-share-tomorrow-agenda')!.addEventListener('click', () => { UI.closeShareMenu(); UI.shareTomorrowAgendaWhatsApp(); });
  document.getElementById('btn-share-tomorrow')!.addEventListener('click', () => { UI.closeShareMenu(); UI.shareTomorrowWhatsApp(); });
  document.getElementById('btn-share-week')!.addEventListener('click', () => { UI.closeShareMenu(); UI.shareWeekWhatsApp(); });
  document.addEventListener('click', e => {
    const wrap = document.getElementById('sm-share-wrap');
    if (wrap && !wrap.contains(e.target as Node)) UI.closeShareMenu();
  });

  // Ajustes
  document.getElementById('btn-settings')!.addEventListener('click', UI.openSettings);
  document.getElementById('settings-close')!.addEventListener('click', UI.closeSettings);
  document.getElementById('settings-overlay')!.addEventListener('click', UI.closeSettings);

  // Botones de tema
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = (btn as HTMLElement).dataset.theme as 'dark' | 'light' | 'navy';
      UI.applyTheme(theme);
    });
  });

  // Botones de tamaño de fuente
  document.querySelectorAll('.fontsize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = (btn as HTMLElement).dataset.size as 'small' | 'normal' | 'large';
      UI.applyFontSize(size);
    });
  });

  // Cerrar modales con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      UI.closeOrderDetail();
      UI.closeWeeklySummary();
      UI.closeSettings();
    }
  });
}

function switchView(view: AgendaView) {
  State.setAgendaView(view);

  // Sincronizar botones desktop
  document.querySelectorAll('#view-switcher .view-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.view === view);
  });
  // Sincronizar bottom nav
  document.querySelectorAll('#bottom-nav .bottom-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.view === view);
  });

  UI.render();
}

function navigate(dir: 'prev' | 'next') {
  const d    = new Date(State.getAgendaDate());
  const view = State.getAgendaView();
  const mult = dir === 'next' ? 1 : -1;

  if (view === 'month') {
    d.setMonth(d.getMonth() + mult);
  } else if (view === 'week') {
    d.setDate(d.getDate() + 7 * mult);
  } else {
    d.setDate(d.getDate() + mult);
  }

  State.setAgendaDate(d);
  UI.render();
}

// ----------------------------------------------------------------
// Swipe horizontal para navegar (móvil)
// ----------------------------------------------------------------
function setupSwipe() {
  let startX = 0;
  let startY = 0;

  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    // Ignorar si el panel está abierto
    if (document.getElementById('day-panel')!.classList.contains('open')) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      navigate(dx < 0 ? 'next' : 'prev');
    }
  }, { passive: true });
}

// ----------------------------------------------------------------
// Auto-refresh
// ----------------------------------------------------------------
function startAutoRefresh() {
  setInterval(async () => {
    await refresh();
  }, REFRESH_INTERVAL);
}

async function refresh() {
  try {
    const orders = await fetchOrders();
    State.setOrders(orders);
    UI.render();
    UI.updateLastUpdated();
  } catch (err) {
    console.warn('Auto-refresh fallido:', err);
  }
}

function isMobile(): boolean { return window.innerWidth <= 768; }

// ----------------------------------------------------------------
// Arranque
// ----------------------------------------------------------------
init();