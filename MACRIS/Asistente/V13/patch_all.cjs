const fs = require('fs');
const path = require('path');
const base = 'c:/Users/LENOVO X1/Documents/Projects/MACRIS/Asistente/V13/';

// ═══════════════════════════════════════════════════════════════
// 1. index.html
// ═══════════════════════════════════════════════════════════════
{
  let html = fs.readFileSync(base + 'index.html', 'utf8');

  // 1a. Change logo in header
  html = html.replace(
    `src="Macris-horizontal.png" alt="Macris Logo" class="admin-logo"`,
    `src="Logo_macris.png" alt="Macris Logo" class="admin-logo"`
  );

  // 1b. Change logo in login
  html = html.replace(
    `src="Macris-horizontal.png" alt="Macris Logo" class="login-logo"`,
    `src="Logo_macris.png" alt="Macris Logo" class="login-logo"`
  );

  // 1c. Remove mobile-only from toggle-sidebar-mobile (make visible always)
  html = html.replace(
    `id="toggle-sidebar-mobile" class="btn-drawer-toggle mobile-only"`,
    `id="toggle-sidebar-mobile" class="btn-drawer-toggle panel-toggle" title="Filtros"`
  );

  // 1d. Remove mobile-only from toggle-chat-mobile
  html = html.replace(
    `id="toggle-chat-mobile" class="btn-drawer-toggle mobile-only"`,
    `id="toggle-chat-mobile" class="btn-drawer-toggle panel-toggle" title="Asistente IA"`
  );

  // 1e. Add settings button after logout-btn
  html = html.replace(
    `<button id="logout-btn" class="btn btn-danger btn-icon-only"><i class="fas fa-power-off"></i></button>`,
    `<button id="btn-settings" class="btn-drawer-toggle panel-toggle" title="Ajustes y Tema"><i class="fas fa-sliders-h"></i></button>\n                <button id="logout-btn" class="btn btn-danger btn-icon-only"><i class="fas fa-power-off"></i></button>`
  );

  // 1f. Add overlay div before </main>
  html = html.replace(
    `        </main>`,
    `        </main>\n        <div id="panel-overlay" class="panel-overlay"></div>`
  );

  // 1g. Add Settings Panel before </div> (end of app-screen)
  const settingsPanel = `
    <!-- Settings / Theme Panel -->
    <div id="settings-panel" class="settings-panel">
        <div class="settings-panel-header">
            <div class="settings-panel-title">
                <i class="fas fa-palette"></i>
                <span>Apariencia</span>
            </div>
            <button id="close-settings-panel" class="settings-close-btn"><i class="fas fa-times"></i></button>
        </div>
        <div class="settings-panel-body">
            <p class="settings-section-label">Tema de Color</p>
            <div class="theme-grid" id="theme-grid">
                <button class="theme-swatch" data-theme="cyber-teal" title="Cyber Teal">
                    <span class="swatch-dot" style="background:#00DFFF"></span>
                    <span class="swatch-name">Cyber Teal</span>
                    <i class="fas fa-check swatch-check"></i>
                </button>
                <button class="theme-swatch" data-theme="neon-violet" title="Neon Violet">
                    <span class="swatch-dot" style="background:#A855F7"></span>
                    <span class="swatch-name">Neon Violet</span>
                    <i class="fas fa-check swatch-check"></i>
                </button>
                <button class="theme-swatch" data-theme="emerald" title="Emerald">
                    <span class="swatch-dot" style="background:#10B981"></span>
                    <span class="swatch-name">Emerald</span>
                    <i class="fas fa-check swatch-check"></i>
                </button>
                <button class="theme-swatch" data-theme="amber" title="Amber Gold">
                    <span class="swatch-dot" style="background:#F59E0B"></span>
                    <span class="swatch-name">Amber Gold</span>
                    <i class="fas fa-check swatch-check"></i>
                </button>
                <button class="theme-swatch" data-theme="rose" title="Rose Red">
                    <span class="swatch-dot" style="background:#F43F5E"></span>
                    <span class="swatch-name">Rose Red</span>
                    <i class="fas fa-check swatch-check"></i>
                </button>
                <button class="theme-swatch" data-theme="arctic" title="Arctic Blue">
                    <span class="swatch-dot" style="background:#38BDF8"></span>
                    <span class="swatch-name">Arctic Blue</span>
                    <i class="fas fa-check swatch-check"></i>
                </button>
            </div>
        </div>
    </div>`;

  // Insert before closing app-screen div
  html = html.replace(
    `    </div>\n\n    <!-- Modal: Configuración`,
    settingsPanel + `\n    </div>\n\n    <!-- Modal: Configuración`
  );

  fs.writeFileSync(base + 'index.html', html);
  console.log('[1] index.html patched');
}

// ═══════════════════════════════════════════════════════════════
// 2. ui.ts — expand setupMobileDrawers + add theme engine
// ═══════════════════════════════════════════════════════════════
{
  let ui = fs.readFileSync(base + 'src/ui.ts', 'utf8');

  // 2a. Replace setupMobileDrawers entirely
  const OLD_FN = `function setupMobileDrawers() {
    const filterSidebar = document.getElementById('filter-sidebar');
    const aiSidebar = document.getElementById('ai-chat-sidebar');
    const toggleFilterBtn = document.getElementById('toggle-sidebar-mobile');
    const toggleChatBtn = document.getElementById('toggle-chat-mobile');
    const closeBtns = document.querySelectorAll('.close-drawer');

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);

    const closeAll = () => {
        filterSidebar?.classList.remove('open');
        aiSidebar?.classList.remove('open');
        overlay.classList.remove('active');
    };

    toggleFilterBtn?.addEventListener('click', () => { filterSidebar?.classList.add('open'); overlay.classList.add('active'); });
    toggleChatBtn?.addEventListener('click', () => { aiSidebar?.classList.add('open'); overlay.classList.add('active'); });
    closeBtns.forEach(btn => btn.addEventListener('click', closeAll));
    overlay.addEventListener('click', closeAll);

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const action = (btn as HTMLElement).dataset.action;
            if (action === 'filters') toggleFilterBtn?.click();
            if (action === 'ai') toggleChatBtn?.click();
            if (action === 'reports') closeAll();
        });
    });
}`;

  const NEW_FN = `function setupMobileDrawers() {
    const filterSidebar = document.getElementById('filter-sidebar') as HTMLElement | null;
    const aiSidebar    = document.getElementById('ai-chat-sidebar') as HTMLElement | null;
    const toggleFilterBtn = document.getElementById('toggle-sidebar-mobile') as HTMLElement | null;
    const toggleChatBtn   = document.getElementById('toggle-chat-mobile')   as HTMLElement | null;
    const overlay = document.getElementById('panel-overlay') as HTMLElement | null;
    const closeBtns = document.querySelectorAll('.close-drawer');

    const closeAll = () => {
        filterSidebar?.classList.remove('is-open');
        aiSidebar?.classList.remove('is-open');
        overlay?.classList.remove('active');
        toggleFilterBtn?.classList.remove('active-toggle');
        toggleChatBtn?.classList.remove('active-toggle');
        updateNavBtns('reports');
    };

    const openFilter = () => {
        aiSidebar?.classList.remove('is-open');
        toggleChatBtn?.classList.remove('active-toggle');
        const isOpen = filterSidebar?.classList.contains('is-open');
        if (isOpen) {
            closeAll();
        } else {
            filterSidebar?.classList.add('is-open');
            overlay?.classList.add('active');
            toggleFilterBtn?.classList.add('active-toggle');
        }
    };

    const openChat = () => {
        filterSidebar?.classList.remove('is-open');
        toggleFilterBtn?.classList.remove('active-toggle');
        const isOpen = aiSidebar?.classList.contains('is-open');
        if (isOpen) {
            closeAll();
        } else {
            aiSidebar?.classList.add('is-open');
            overlay?.classList.add('active');
            toggleChatBtn?.classList.add('active-toggle');
        }
    };

    const updateNavBtns = (action: string) => {
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', (b as HTMLElement).dataset.action === action);
        });
    };

    toggleFilterBtn?.addEventListener('click', openFilter);
    toggleChatBtn?.addEventListener('click', openChat);
    closeBtns.forEach(btn => btn.addEventListener('click', closeAll));
    overlay?.addEventListener('click', closeAll);

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = (btn as HTMLElement).dataset.action;
            if (action === 'filters') openFilter();
            else if (action === 'ai') openChat();
            else closeAll();
        });
    });

    // Settings panel
    const settingsBtn   = document.getElementById('btn-settings');
    const settingsPanel = document.getElementById('settings-panel') as HTMLElement | null;
    const closeSettings = document.getElementById('close-settings-panel');

    settingsBtn?.addEventListener('click', () => {
        closeAll();
        settingsPanel?.classList.toggle('is-open');
        overlay?.classList.toggle('active', !!settingsPanel?.classList.contains('is-open'));
    });
    closeSettings?.addEventListener('click', () => {
        settingsPanel?.classList.remove('is-open');
        overlay?.classList.remove('active');
    });

    overlay?.addEventListener('click', () => {
        settingsPanel?.classList.remove('is-open');
    });

    // Theme swatches
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = (btn as HTMLElement).dataset.theme || 'cyber-teal';
            applyTheme(theme);
        });
    });
}

export function applyTheme(theme: string) {
    document.body.dataset.theme = theme;
    localStorage.setItem('macris_theme', theme);
    // Update swatch active state
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset.theme === theme);
    });
}

export function initTheme() {
    const saved = localStorage.getItem('macris_theme') || 'cyber-teal';
    applyTheme(saved);
}`;

  if (ui.includes('function setupMobileDrawers()')) {
    ui = ui.replace(OLD_FN, NEW_FN);
    console.log('[2] ui.ts — setupMobileDrawers replaced');
  } else {
    console.log('[2] ui.ts — setupMobileDrawers not found (may have different whitespace), trying regex...');
    const matched = /function setupMobileDrawers\(\)[\s\S]*?\n\}/m.exec(ui);
    if (matched) {
      ui = ui.replace(matched[0], NEW_FN);
      console.log('[2] ui.ts — replaced via regex');
    } else {
      console.log('[2] ui.ts — COULD NOT FIND setupMobileDrawers, check manually');
    }
  }

  // 2b. Call initTheme() in initUI
  ui = ui.replace(
    `export function initUI() {`,
    `export function initUI() {\n    initTheme();`
  );

  fs.writeFileSync(base + 'src/ui.ts', ui);
  console.log('[2] ui.ts patched');
}

console.log('\nAll patches applied.');