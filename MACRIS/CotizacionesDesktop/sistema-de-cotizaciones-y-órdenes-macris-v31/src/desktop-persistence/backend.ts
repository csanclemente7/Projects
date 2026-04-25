export interface DesktopPersistenceBackend {
    readonly name: string;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
}

export function readLegacyJson<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch (error) {
        console.error(`Failed to parse local cache key "${key}":`, error);
        return null;
    }
}

export function writeLegacyJson(key: string, value: unknown) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Failed to persist local cache key "${key}":`, error);
    }
}

export function createLegacyLocalStorageBackend(): DesktopPersistenceBackend {
    return {
        name: 'localStorage',
        async get<T>(key: string) {
            return readLegacyJson<T>(key);
        },
        async set(key: string, value: unknown) {
            writeLegacyJson(key, value);
        },
    };
}
