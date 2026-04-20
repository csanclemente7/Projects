declare global {
    interface Window {
        __macrisCotizacionesPwaRegistered__?: boolean;
    }
}

function getBaseUrl(): string {
    const baseUrl = import.meta.env.BASE_URL || '/';
    return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function canRegisterServiceWorker(): boolean {
    if (!('serviceWorker' in navigator)) return false;
    if (window.location.protocol === 'https:') return true;
    return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

// ----------------------------------------------------------------
// Splash screen — Twitter/X-style zoom-in → zoom-out → fade
// ----------------------------------------------------------------
export function runPwaSplash(): Promise<void> {
    return new Promise(resolve => {
        const splash = document.getElementById('pwa-splash');
        const logo   = document.getElementById('pwa-splash-logo');
        if (!splash || !logo) { resolve(); return; }

        setTimeout(() => {
            logo.classList.add('zoom-out');
            setTimeout(() => {
                splash.classList.add('fade-out');
                setTimeout(() => {
                    splash.classList.add('hidden');
                    resolve();
                }, 460);
            }, 380);
        }, 700);
    });
}

export function registerCotizacionesPwa(): void {
    if (window.__macrisCotizacionesPwaRegistered__) return;
    window.__macrisCotizacionesPwaRegistered__ = true;

    if (!canRegisterServiceWorker()) return;

    const registerServiceWorker = () => {
        const scope = new URL(getBaseUrl(), window.location.origin).toString();
        const serviceWorkerUrl = new URL('sw.js', scope).toString();

        navigator.serviceWorker
            .register(serviceWorkerUrl, { scope })
            .then((registration) => {
                console.info('[PWA] Service worker registrado:', registration.scope);
            })
            .catch((error) => {
                console.warn('[PWA] No se pudo registrar el service worker:', error);
            });
    };

    if (document.readyState === 'complete') {
        registerServiceWorker();
    } else {
        window.addEventListener('load', registerServiceWorker, { once: true });
    }
}

export {};
