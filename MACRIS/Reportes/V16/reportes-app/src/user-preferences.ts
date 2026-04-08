import * as State from './state';
import { MACRIS_HORIZONTAL_LOGO_URL, MACRIS_LOGO_URL } from './assets';

export interface UserPreferences {
  theme: 'dark' | 'light';
  textScale: number;
  btnScale: number;
}

const DEFAULT_PREFS: UserPreferences = {
  theme: 'dark',
  textScale: 1.0,
  btnScale: 1.0,
};

export const UserPrefsManager = {
  getUserId(): string | null {
    return State.currentUser?.id || null;
  },

  getPrefs(): UserPreferences {
    const userId = this.getUserId();
    if (!userId) return { ...DEFAULT_PREFS };

    const stored = localStorage.getItem(`userPrefs_${userId}`);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing user prefs', e);
      }
    }
    return { ...DEFAULT_PREFS };
  },

  savePrefs(prefs: UserPreferences) {
    const userId = this.getUserId();
    if (!userId) return;
    localStorage.setItem(`userPrefs_${userId}`, JSON.stringify(prefs));
    this.applyPrefs(prefs);
  },

  applyPrefs(prefs?: UserPreferences) {
    const p = prefs || this.getPrefs();

    // Theming
    if (p.theme === 'light') {
      document.body.classList.add('theme-light');
      document.querySelectorAll('.login-logo, .header-logo').forEach(el => {
        (el as HTMLImageElement).src = MACRIS_LOGO_URL;
      });
    } else {
      document.body.classList.remove('theme-light');
      document.querySelectorAll('.login-logo, .header-logo').forEach(el => {
        (el as HTMLImageElement).src = MACRIS_HORIZONTAL_LOGO_URL;
      });
    }

    // Scaling
    document.documentElement.style.setProperty('--user-text-scale', p.textScale.toString());
    document.documentElement.style.setProperty('--user-btn-scale', p.btnScale.toString());
  },

  initUI() {
    const settingsBtn = document.getElementById('user-settings-button');
    const modal = document.getElementById('user-settings-modal');
    const closeBtn1 = document.getElementById('close-user-settings-modal');
    const closeBtn2 = document.getElementById('close-user-settings-btn');

    if (!settingsBtn || !modal) return;

    const themeToggle = document.getElementById('user-theme-toggle') as HTMLInputElement;
    const txtDec = document.getElementById('user-text-decrease');
    const txtInc = document.getElementById('user-text-increase');
    const btnDec = document.getElementById('user-btn-decrease');
    const btnInc = document.getElementById('user-btn-increase');
    
    const txtDisplay = document.getElementById('user-text-scale-display');
    const btnDisplay = document.getElementById('user-btn-scale-display');

    let currentPrefs = this.getPrefs();

    // Update UI functions
    const updateDisplays = () => {
      if (txtDisplay) txtDisplay.innerText = `${Math.round(currentPrefs.textScale * 100)}%`;
      if (btnDisplay) btnDisplay.innerText = `${Math.round(currentPrefs.btnScale * 100)}%`;
      if (themeToggle) themeToggle.checked = currentPrefs.theme === 'light';
    };

    // Open Modal
    settingsBtn.addEventListener('click', () => {
      currentPrefs = this.getPrefs();
      updateDisplays();
      modal.style.display = 'flex';
    });

    // Close Modal
    const closeModal = () => {
      modal.style.display = 'none';
      this.savePrefs(currentPrefs);
    };

    closeBtn1?.addEventListener('click', closeModal);
    closeBtn2?.addEventListener('click', closeModal);

    // Event Listeners
    themeToggle?.addEventListener('change', (e) => {
      currentPrefs.theme = (e.target as HTMLInputElement).checked ? 'light' : 'dark';
      this.applyPrefs(currentPrefs);
    });

    txtDec?.addEventListener('click', () => {
      if (currentPrefs.textScale > 0.7) currentPrefs.textScale -= 0.1;
      updateDisplays();
      this.applyPrefs(currentPrefs);
    });

    txtInc?.addEventListener('click', () => {
      if (currentPrefs.textScale < 1.5) currentPrefs.textScale += 0.1;
      updateDisplays();
      this.applyPrefs(currentPrefs);
    });

    btnDec?.addEventListener('click', () => {
      if (currentPrefs.btnScale > 0.7) currentPrefs.btnScale -= 0.1;
      updateDisplays();
      this.applyPrefs(currentPrefs);
    });

    btnInc?.addEventListener('click', () => {
      if (currentPrefs.btnScale < 1.5) currentPrefs.btnScale += 0.1;
      updateDisplays();
      this.applyPrefs(currentPrefs);
    });
  }
};
