import type { Client, Dependency, Item, Order, Quote, Sede, ServiceType, Technician } from './types';
import { isDesktopRuntime, isTauriRuntime } from './runtime';
import {
    createLegacyLocalStorageBackend,
    readLegacyJson,
    type DesktopPersistenceBackend,
} from './desktop-persistence/backend';
import { canUseIndexedDb, createIndexedDbBackend } from './desktop-persistence/indexeddb-backend';
import { resolveTauriSqliteBackend } from './desktop-persistence/tauri-sqlite-backend';

const DESKTOP_CATALOG_CACHE_KEY = 'macris_desktop_catalog_cache_v1';
const DESKTOP_SETTINGS_CACHE_KEY = 'macris_desktop_settings_cache_v1';
const DESKTOP_QUOTES_CACHE_KEY = 'macris_desktop_quotes_cache_v1';
const DESKTOP_ORDERS_CACHE_KEY = 'macris_desktop_orders_cache_v1';
const DESKTOP_PENDING_MUTATIONS_KEY = 'macris_desktop_pending_mutations_v1';
const DESKTOP_SYNC_META_KEY = 'macris_desktop_sync_meta_v1';

export type DesktopCatalogSnapshot = {
    savedAt: string;
    items: Item[];
    clients: Client[];
    technicians: Technician[];
    serviceTypes: ServiceType[];
    sedes: Sede[];
    dependencies: Dependency[];
};

export type DesktopPendingMutation = {
    entity: 'quote' | 'order';
    action: 'upsert' | 'delete';
    id: string;
    payload?: Quote | Order;
    savedAt: string;
};

type DesktopSyncMeta = {
    lastSyncedAt: string | null;
};

type DesktopMemoryState = {
    initialized: boolean;
    catalogSnapshot: DesktopCatalogSnapshot | null;
    settings: Record<string, string>;
    quotes: Quote[];
    orders: Order[];
    pendingMutations: DesktopPendingMutation[];
    syncMeta: DesktopSyncMeta;
};

const desktopMemoryState: DesktopMemoryState = {
    initialized: false,
    catalogSnapshot: null,
    settings: {},
    quotes: [],
    orders: [],
    pendingMutations: [],
    syncMeta: { lastSyncedAt: null },
};

let initPromise: Promise<void> | null = null;
let persistQueue = Promise.resolve();
let selectedBackend: DesktopPersistenceBackend | null = null;

function deepClone<T>(value: T): T {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

function emitWindowEvent(name: string, detail: Record<string, unknown>) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

function getDesktopBackend(): DesktopPersistenceBackend {
    if (selectedBackend) return selectedBackend;

    if (isTauriRuntime()) {
        const tauriBackend = resolveTauriSqliteBackend();
        if (tauriBackend) {
            selectedBackend = tauriBackend;
            return selectedBackend;
        }
    }

    if (canUseIndexedDb()) {
        selectedBackend = createIndexedDbBackend();
        return selectedBackend;
    }

    selectedBackend = createLegacyLocalStorageBackend();
    return selectedBackend;
}

function queuePersist(key: string, value: unknown) {
    if (!isDesktopRuntime()) return;

    persistQueue = persistQueue
        .then(() => getDesktopBackend().set(key, value))
        .catch(error => {
            console.error(`Failed to persist desktop cache key "${key}" in backend "${getDesktopBackend().name}":`, error);
        });
}

async function loadInitialValue<T>(key: string): Promise<T | null> {
    const backend = getDesktopBackend();

    if (backend.name === 'localStorage') {
        return backend.get<T>(key);
    }

    const backendValue = await backend.get<T>(key);
    if (backendValue !== null) {
        return backendValue;
    }

    const legacyValue = readLegacyJson<T>(key);
    if (legacyValue !== null) {
        await backend.set(key, legacyValue);
    }

    return legacyValue;
}

function loadLegacyFallbackState() {
    desktopMemoryState.catalogSnapshot = deepClone(readLegacyJson<DesktopCatalogSnapshot>(DESKTOP_CATALOG_CACHE_KEY));
    desktopMemoryState.settings = deepClone(readLegacyJson<Record<string, string>>(DESKTOP_SETTINGS_CACHE_KEY) || {});
    desktopMemoryState.quotes = deepClone(readLegacyJson<Quote[]>(DESKTOP_QUOTES_CACHE_KEY) || []);
    desktopMemoryState.orders = deepClone(readLegacyJson<Order[]>(DESKTOP_ORDERS_CACHE_KEY) || []);
    desktopMemoryState.pendingMutations = deepClone(readLegacyJson<DesktopPendingMutation[]>(DESKTOP_PENDING_MUTATIONS_KEY) || []);
    desktopMemoryState.syncMeta = deepClone(readLegacyJson<DesktopSyncMeta>(DESKTOP_SYNC_META_KEY) || { lastSyncedAt: null });
    desktopMemoryState.initialized = true;
}

export async function initDesktopPersistence(): Promise<void> {
    if (!isDesktopRuntime()) return;
    if (desktopMemoryState.initialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const backend = getDesktopBackend();
            const [
                catalogSnapshot,
                settings,
                quotes,
                orders,
                pendingMutations,
                syncMeta,
            ] = await Promise.all([
                loadInitialValue<DesktopCatalogSnapshot>(DESKTOP_CATALOG_CACHE_KEY),
                loadInitialValue<Record<string, string>>(DESKTOP_SETTINGS_CACHE_KEY),
                loadInitialValue<Quote[]>(DESKTOP_QUOTES_CACHE_KEY),
                loadInitialValue<Order[]>(DESKTOP_ORDERS_CACHE_KEY),
                loadInitialValue<DesktopPendingMutation[]>(DESKTOP_PENDING_MUTATIONS_KEY),
                loadInitialValue<DesktopSyncMeta>(DESKTOP_SYNC_META_KEY),
            ]);

            desktopMemoryState.catalogSnapshot = deepClone(catalogSnapshot);
            desktopMemoryState.settings = deepClone(settings || {});
            desktopMemoryState.quotes = deepClone(quotes || []);
            desktopMemoryState.orders = deepClone(orders || []);
            desktopMemoryState.pendingMutations = deepClone(pendingMutations || []);
            desktopMemoryState.syncMeta = deepClone(syncMeta || { lastSyncedAt: null });
            desktopMemoryState.initialized = true;
            console.log(`Desktop persistence initialized with backend "${backend.name}".`);
        } catch (error) {
            console.error('Failed to initialize desktop persistence backend. Falling back to legacy localStorage.', error);
            selectedBackend = createLegacyLocalStorageBackend();
            loadLegacyFallbackState();
        }

        emitWindowEvent('macris:pending-sync-changed', { count: desktopMemoryState.pendingMutations.length });
        emitWindowEvent('macris:last-sync-changed', { lastSyncedAt: desktopMemoryState.syncMeta.lastSyncedAt });
    })();

    return initPromise;
}

export function getDesktopPersistenceBackendName(): string {
    return getDesktopBackend().name;
}

export function loadDesktopCatalogSnapshot(): DesktopCatalogSnapshot | null {
    return deepClone(desktopMemoryState.catalogSnapshot);
}

export function saveDesktopCatalogSnapshot(snapshot: Omit<DesktopCatalogSnapshot, 'savedAt'>) {
    const value: DesktopCatalogSnapshot = {
        ...deepClone(snapshot),
        savedAt: new Date().toISOString(),
    };
    desktopMemoryState.catalogSnapshot = value;
    queuePersist(DESKTOP_CATALOG_CACHE_KEY, value);
}

export function getCachedSetting(key: string): string | null {
    return desktopMemoryState.settings[key] ?? null;
}

export function setCachedSetting(key: string, value: string) {
    desktopMemoryState.settings = {
        ...desktopMemoryState.settings,
        [key]: value,
    };
    queuePersist(DESKTOP_SETTINGS_CACHE_KEY, desktopMemoryState.settings);
}

export function loadDesktopQuotesCache(): Quote[] {
    return deepClone(desktopMemoryState.quotes);
}

export function saveDesktopQuotesCache(quotes: Quote[]) {
    desktopMemoryState.quotes = deepClone(quotes);
    queuePersist(DESKTOP_QUOTES_CACHE_KEY, desktopMemoryState.quotes);
}

export function loadDesktopOrdersCache(): Order[] {
    return deepClone(desktopMemoryState.orders);
}

export function saveDesktopOrdersCache(orders: Order[]) {
    desktopMemoryState.orders = deepClone(orders);
    queuePersist(DESKTOP_ORDERS_CACHE_KEY, desktopMemoryState.orders);
}

export function loadDesktopPendingMutations(): DesktopPendingMutation[] {
    return deepClone(desktopMemoryState.pendingMutations);
}

export function queueDesktopPendingMutation(mutation: Omit<DesktopPendingMutation, 'savedAt'>) {
    const mutations = desktopMemoryState.pendingMutations.filter(entry => !(entry.entity === mutation.entity && entry.id === mutation.id));
    mutations.push({
        ...deepClone(mutation),
        savedAt: new Date().toISOString(),
    });
    desktopMemoryState.pendingMutations = mutations;
    queuePersist(DESKTOP_PENDING_MUTATIONS_KEY, mutations);
    emitWindowEvent('macris:pending-sync-changed', { count: mutations.length });
}

export function clearDesktopPendingMutation(entity: DesktopPendingMutation['entity'], id: string) {
    const mutations = desktopMemoryState.pendingMutations.filter(entry => !(entry.entity === entity && entry.id === id));
    desktopMemoryState.pendingMutations = mutations;
    queuePersist(DESKTOP_PENDING_MUTATIONS_KEY, mutations);
    emitWindowEvent('macris:pending-sync-changed', { count: mutations.length });
}

export function replaceDesktopPendingMutations(mutations: DesktopPendingMutation[]) {
    desktopMemoryState.pendingMutations = deepClone(mutations);
    queuePersist(DESKTOP_PENDING_MUTATIONS_KEY, desktopMemoryState.pendingMutations);
    emitWindowEvent('macris:pending-sync-changed', { count: desktopMemoryState.pendingMutations.length });
}

export function applyDesktopPendingMutations<T extends Quote | Order>(records: T[], entity: DesktopPendingMutation['entity']): T[] {
    let result = [...records];

    for (const mutation of loadDesktopPendingMutations().filter(entry => entry.entity === entity)) {
        if (mutation.action === 'delete') {
            result = result.filter(record => record.id !== mutation.id);
            continue;
        }

        if (mutation.payload) {
            result = [
                ...result.filter(record => record.id !== mutation.id),
                mutation.payload as T,
            ];
        }
    }

    return result.sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
    });
}

export function getDesktopLastSyncAt(): string | null {
    return desktopMemoryState.syncMeta.lastSyncedAt || null;
}

export function setDesktopLastSyncAt(value: string | null) {
    desktopMemoryState.syncMeta = { lastSyncedAt: value };
    queuePersist(DESKTOP_SYNC_META_KEY, desktopMemoryState.syncMeta);
    emitWindowEvent('macris:last-sync-changed', { lastSyncedAt: value });
}
