export function isDesktopRuntime(): boolean {
    return import.meta.env.MODE === 'desktop' || document.documentElement.dataset.runtime === 'desktop';
}

export function isTauriRuntime(): boolean {
    if (typeof window === 'undefined') return false;
    const runtimeWindow = window as Window & {
        __TAURI__?: unknown;
        __TAURI_INTERNALS__?: unknown;
    };
    return Boolean(runtimeWindow.__TAURI__ || runtimeWindow.__TAURI_INTERNALS__);
}
