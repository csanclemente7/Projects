import * as State from './state';
import * as UI    from './ui';
import { fetchOrders, fetchClients, fetchSedes, fetchTechnicians } from './api';
import { supabaseQuotes } from './supabase';
import type { AgendaView } from './types';

const REFRESH_INTERVAL   = 5 * 60 * 1000;
const ADMIN_SESSION_KEY  = 'macris_admin_session_active'; // misma clave que el portal admin

// ----------------------------------------------------------------
// Splash screen (Twitter/X-style)
// ----------------------------------------------------------------
function runSplash(): Promise<void> {
  return new Promise(resolve => {
    const splash = document.getElementById('splash-screen')!;
    const logo   = document.getElementById('splash-logo') as HTMLImageElement;

    setTimeout(() => {
      logo.classList.add('zoom-out');
      setTimeout(() => {
        splash.classList.add('hidden');
        setTimeout(resolve, 460);
      }, 380);
    }, 700);
  });
}

// ----------------------------------------------------------------
// Auth — misma lógica que portal admin de Cotizaciones
// ----------------------------------------------------------------
async function getAdminPassword(): Promise<string> {
  const { data } = await supabaseQuotes
    .from('settings')
    .select('value')
    .eq('key', 'app_password')
    .maybeSingle();
  return (data as any)?.value || 'wilson1423';
}

function isSessionActive(): boolean {
  return localStorage.getItem(ADMIN_SESSION_KEY) === 'true';
}

function showAuthScreen(): Promise<void> {
  return new Promise(resolve => {
    const authScreen = document.getElementById('auth-screen')!;
    const userInput  = document.getElementById('auth-email') as HTMLInputElement;
    const passInput  = document.getElementById('auth-password') as HTMLInputElement;
    const submitBtn  = document.getElementById('auth-submit') as HTMLButtonElement;
    const errorEl    = document.getElementById('auth-error')!;

    authScreen.classList.remove('hidden');

    const handleSubmit = async () => {
      const username = userInput.value.trim().toLowerCase();
      const password = passInput.value;

      if (!username || !password) {
        errorEl.textContent = 'Por favor completa todos los campos.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Verificando...';
      errorEl.textContent = '';

      try {
        const adminPassword = await getAdminPassword();

        if (username === 'admin' && password === adminPassword) {
          localStorage.setItem(ADMIN_SESSION_KEY, 'true');
          submitBtn.removeEventListener('click', handleSubmit);
          userInput.removeEventListener('keydown', onEnter);
          passInput.removeEventListener('keydown', onEnter);
          authScreen.classList.add('hidden');
          resolve();
        } else {
          errorEl.textContent = 'Usuario o contraseña incorrectos.';
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Ingresar';
          passInput.value = '';
          passInput.focus();
        }
      } catch {
        errorEl.textContent = 'Error al verificar credenciales.';
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-right-to-bracket"></i> Ingresar';
      }
    };

    const onEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') handleSubmit(); };

    submitBtn.addEventListener('click', handleSubmit);
    userInput.addEventListener('keydown', onEnter);
    passInput.addEventListener('keydown', onEnter);

    setTimeout(() => userInput.focus(), 100);
  });
}

// ----------------------------------------------------------------
// Logout
// ----------------------------------------------------------------
function handleLogout() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  location.reload();
}

// ----------------------------------------------------------------
// Inicialización
// ----------------------------------------------------------------
async function init() {
  // 1. Splash screen
  await runSplash();

  // 2. Ajustes guardados
  UI.loadSavedSettings();

  // 3. Verificar sesión (misma que el portal admin)
  if (!isSessionActive()) {
    await showAuthScreen();
  }

  // Mostrar loader mientras cargamos datos
  document.getElementById('loader')!.style.display = 'flex';

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
// Eventos
// ----------------------------------------------------------------
function setupEvents() {
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

  document.getElementById('view-switcher')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-view]') as HTMLElement;
    if (!btn) return;
    switchView(btn.dataset.view as AgendaView);
  });

  document.getElementById('bottom-nav')!.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('[data-view]') as HTMLElement;
    if (!btn) return;
    if (btn.dataset.view === State.getAgendaView()) {
      State.setAgendaDate(new Date());
    }
    switchView(btn.dataset.view as AgendaView);
  });

  document.getElementById('agenda-container')!.addEventListener('click', e => {
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
      const [y, m, d] = cell.dataset.date.split('-').map(Number);
      State.setAgendaDate(new Date(y, m - 1, d));
      switchView('day');
    }
  });

  document.getElementById('panel-body')!.addEventListener('click', e => {
    const card = (e.target as HTMLElement).closest('[data-order-id]') as HTMLElement | null;
    if (card?.dataset.orderId) UI.openOrderDetail(card.dataset.orderId);
  });

  document.getElementById('panel-overlay')!.addEventListener('click', UI.closeDayPanel);
  document.querySelector('.panel-handle')?.addEventListener('click', UI.closeDayPanel);

  document.getElementById('order-modal-overlay')!.addEventListener('click', UI.closeOrderDetail);
  document.getElementById('order-modal-close')!.addEventListener('click', UI.closeOrderDetail);
  document.getElementById('btn-share-order')!.addEventListener('click', UI.shareOrderAsImage);

  UI.setupLightbox();

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

  document.getElementById('btn-settings')!.addEventListener('click', UI.openSettings);
  document.getElementById('settings-close')!.addEventListener('click', UI.closeSettings);
  document.getElementById('settings-overlay')!.addEventListener('click', UI.closeSettings);
  document.getElementById('btn-logout')!.addEventListener('click', handleLogout);

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = (btn as HTMLElement).dataset.theme as 'dark' | 'light' | 'navy';
      UI.applyTheme(theme);
    });
  });

  document.querySelectorAll('.fontsize-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const size = (btn as HTMLElement).dataset.size as 'small' | 'normal' | 'large';
      UI.applyFontSize(size);
    });
  });

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
  document.querySelectorAll('#view-switcher .view-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.view === view);
  });
  document.querySelectorAll('#bottom-nav .bottom-btn').forEach(b => {
    b.classList.toggle('active', (b as HTMLElement).dataset.view === view);
  });
  UI.render();
}

function navigate(dir: 'prev' | 'next') {
  const d    = new Date(State.getAgendaDate());
  const view = State.getAgendaView();
  const mult = dir === 'next' ? 1 : -1;
  if (view === 'month')     d.setMonth(d.getMonth() + mult);
  else if (view === 'week') d.setDate(d.getDate() + 7 * mult);
  else                      d.setDate(d.getDate() + mult);
  State.setAgendaDate(d);
  UI.render();
}

// ----------------------------------------------------------------
// Swipe (móvil)
// ----------------------------------------------------------------
function setupSwipe() {
  let startX = 0;
  let startY = 0;
  document.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
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
  setInterval(async () => { await refresh(); }, REFRESH_INTERVAL);
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