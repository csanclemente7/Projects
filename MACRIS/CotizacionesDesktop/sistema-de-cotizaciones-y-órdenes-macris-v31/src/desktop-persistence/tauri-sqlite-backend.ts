import type { DesktopPersistenceBackend } from './backend';

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function resolveTauriInvoke(): TauriInvoke | null {
    if (typeof window === 'undefined') return null;

    const runtimeWindow = window as Window & {
        __TAURI__?: {
            core?: {
                invoke?: TauriInvoke;
            };
        };
        __TAURI_INTERNALS__?: {
            invoke?: TauriInvoke;
        };
    };

    return runtimeWindow.__TAURI__?.core?.invoke || runtimeWindow.__TAURI_INTERNALS__?.invoke || null;
}

export function resolveTauriSqliteBackend(): DesktopPersistenceBackend | null {
    const invoke = resolveTauriInvoke();
    if (!invoke) return null;

    return {
        name: 'tauri-ipc',
        async get<T>(key: string) {
            const value = await invoke('desktop_cache_get', { key });
            return (value as T | null) ?? null;
        },
        async set(key: string, value: unknown) {
            await invoke('desktop_cache_set', { key, value });
        },
    };
}
