import type { DesktopPersistenceBackend } from './backend';

const DESKTOP_DB_NAME = 'macris-desktop-cache';
const DESKTOP_DB_VERSION = 1;
const DESKTOP_DB_STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

export function canUseIndexedDb(): boolean {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDesktopDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DESKTOP_DB_NAME, DESKTOP_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(DESKTOP_DB_STORE)) {
                db.createObjectStore(DESKTOP_DB_STORE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open desktop cache database.'));
    });

    return dbPromise;
}

function readStoreValue<T>(key: string): Promise<T | null> {
    return openDesktopDb().then(db => new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(DESKTOP_DB_STORE, 'readonly');
        const store = tx.objectStore(DESKTOP_DB_STORE);
        const request = store.get(key);

        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => reject(request.error || new Error(`Failed to read desktop cache key "${key}".`));
    }));
}

function writeStoreValue(key: string, value: unknown): Promise<void> {
    return openDesktopDb().then(db => new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DESKTOP_DB_STORE, 'readwrite');
        const store = tx.objectStore(DESKTOP_DB_STORE);
        const request = store.put(value, key);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error(`Failed to write desktop cache key "${key}".`));
    }));
}

export function createIndexedDbBackend(): DesktopPersistenceBackend {
    return {
        name: 'indexeddb',
        get: readStoreValue,
        set: writeStoreValue,
    };
}
