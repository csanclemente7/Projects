// --- Polyfill para crypto.randomUUID (compatibilidad Android WebView) ---
if (!(window.crypto as any).randomUUID) {
  (window.crypto as any).randomUUID = function () {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    // Ajusta bits según RFC 4122 (UUID v4)
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    return (
      hex.slice(0, 8) + '-' +
      hex.slice(8, 12) + '-' +
      hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' +
      hex.slice(20)
    );
  };
}

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Report, User, City, Company, Dependency, Equipment, ServiceType, EquipmentType, RefrigerantType, AppSettings, Order, EntityType } from '../types';

const DB_NAME = 'maintenance-db';
const DB_VERSION = 4; // Incremented version to trigger upgrade for entities_queue

// Define a type for the reports in the queue, adding a local ID for IndexedDB key
export interface QueuedReport extends Report {
    localId: string;
    status: 'pending_sync';
}

export interface QueuedEntity {
    localId: string;
    type: EntityType;
    payload: any; // The entity data
    status: 'pending_sync';
}

interface MaintenanceDB {
  reports_queue: {
    key: string;
    value: QueuedReport;
    indexes: { 'by-status': string };
  };
  entities_queue: {
    key: string;
    value: QueuedEntity;
    indexes: { 'by-status': string };
  };
  // Specific stores for each data type
  users: { key: string; value: User };
  cities: { key: string; value: City };
  companies: { key: string; value: Company };
  dependencies: { key: string; value: Dependency };
  equipment: { key: string; value: Equipment };
  service_types: { key: string; value: ServiceType };
  equipment_types: { key: string; value: EquipmentType };
  refrigerant_types: { key: string; value: RefrigerantType };
  app_settings: { key: string; value: { key: string, value: boolean } };
  orders: { key: string; value: Order };
  reports: { key: string; value: Report };
}

// Define the names of the stores for type-safe access
// FIX: Use Extract<..., string> to get only string keys from the schema,
// preventing type errors with library methods that expect a union of string literals.
export type StoreName = Extract<keyof MaintenanceDB, string>;

let db: IDBPDatabase<MaintenanceDB> | null = null;

export async function initDB() {
  if (db) {
    return;
  }
  db = await openDB<MaintenanceDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      console.log(`Upgrading database from version ${oldVersion} to ${DB_VERSION}...`);
      
      // Keep the original reports_queue store
      if (!db.objectStoreNames.contains('reports_queue')) {
        const queueStore = db.createObjectStore('reports_queue', {
          keyPath: 'localId',
        });
        queueStore.createIndex('by-status', 'status');
        console.log('Object store "reports_queue" created.');
      }
      
      // From version 2 onwards, create specific stores
      if (oldVersion < 2) {
        // FIX: The legacy 'app_cache' store is not in the DB schema.
        // The contains method is not strictly typed, so we cast to any to check for the old store name.
        if ((db.objectStoreNames as any).contains('app_cache')) {
            // FIX: The legacy 'app_cache' store is not in the DB schema.
            // Casting `db` to `any` allows us to delete this untyped, old store during migration.
            (db as any).deleteObjectStore('app_cache');
            console.log('Old object store "app_cache" deleted.');
        }

        // FIX: Use `as const` to infer literal types for store names, making them compatible with `createObjectStore`.
        const storesToCreate = [
            { name: 'users', keyPath: 'id' },
            { name: 'cities', keyPath: 'id' },
            { name: 'companies', keyPath: 'id' },
            { name: 'dependencies', keyPath: 'id' },
            { name: 'equipment', keyPath: 'id' },
            { name: 'service_types', keyPath: 'id' },
            { name: 'equipment_types', keyPath: 'id' },
            { name: 'refrigerant_types', keyPath: 'id' },
            { name: 'app_settings', keyPath: 'key' },
            { name: 'orders', keyPath: 'id' }
        ] as const;

        storesToCreate.forEach(storeInfo => {
             if (!db.objectStoreNames.contains(storeInfo.name)) {
                // FIX: Removed unnecessary `as any` cast. The `keyPath` type is correctly inferred from the `as const` array.
                db.createObjectStore(storeInfo.name, { keyPath: storeInfo.keyPath });
                console.log(`Object store "${storeInfo.name}" created.`);
            }
        });
      }
       if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('reports')) {
          db.createObjectStore('reports', { keyPath: 'id' });
          console.log('Object store "reports" created.');
        }
      }
      if (oldVersion < 4) {
        if (!db.objectStoreNames.contains('entities_queue')) {
          const queueStore = db.createObjectStore('entities_queue', {
            keyPath: 'localId',
          });
          queueStore.createIndex('by-status', 'status');
          console.log('Object store "entities_queue" created.');
        }
      }
    },
  });
}

/**
 * Adds or updates a single item in a specified store.
 * @param storeName The name of the store.
 * @param item The item to add or update.
 */
export async function addOrUpdateItemInStore<T extends StoreName>(storeName: T, item: MaintenanceDB[T]['value']): Promise<void> {
    if (!db) await initDB();
    try {
        await db!.put(storeName, item);
    } catch (error) {
        console.error(`[IDB] Failed to add/update item in "${storeName}":`, error);
        throw error;
    }
}

/**
 * Clears a specific store and populates it with new data in a single transaction.
 * @param storeName The name of the store to cache data into.
 * @param data An array of items to store.
 */
export async function cacheAllData<T extends StoreName>(storeName: T, data: MaintenanceDB[T]['value'][]): Promise<void> {
    if (!db) await initDB();
    try {
        const tx = db!.transaction(storeName, 'readwrite');
        await tx.store.clear();
        await Promise.all(data.map(item => tx.store.put(item)));
        await tx.done;
    } catch (error) {
        console.error(`[IDB] Failed to cache data into "${storeName}":`, error);
        // Don't re-throw, as this shouldn't be a critical app-breaking error.
    }
}

/**
 * Retrieves all items from a specific store.
 * @param storeName The name of the store to retrieve data from.
 * @returns A promise that resolves to an array of all items in the store.
 */
export async function getAllFromStore<T extends StoreName>(storeName: T): Promise<MaintenanceDB[T]['value'][]> {
    if (!db) await initDB();
    try {
        return await db!.getAll(storeName);
    } catch (error) {
        console.error(`[IDB] Failed to get data from "${storeName}":`, error);
        return [];
    }
}


/**
 * Adds a report to the synchronization queue.
 * @param report The report object to add.
 */
export async function addReportToQueue(report: Report): Promise<void> {
  if (!db) await initDB();
  const queuedReport: QueuedReport = {
    ...report,
    localId: report.id || crypto.randomUUID(), // Use existing ID or generate a new local one
    status: 'pending_sync',
  };
  await db!.put('reports_queue', queuedReport);
}

/**
 * Updates a report locally while offline. If the report is already synced (in 'reports' cache),
 * it applies the update and moves it to the 'reports_queue' for future synchronization. If it's
 * a new, unsynced report (in 'reports_queue'), it simply updates it there.
 * @param reportId The ID of the report to update.
 * @param updates An object containing the fields to update.
 */
export async function updateLocalReport(reportId: string, updates: Partial<Report>): Promise<void> {
    if (!db) await initDB();

    // Iniciar una transacción en ambas tablas para asegurar que la operación sea atómica
    const tx = db.transaction(['reports_queue', 'reports'], 'readwrite');
    const queueStore = tx.objectStore('reports_queue');
    const mainStore = tx.objectStore('reports');

    const reportInQueue = await queueStore.get(reportId);

    if (reportInQueue) {
        // Caso 1: El reporte ya estaba en la cola de espera (es un reporte nuevo, no sincronizado).
        const updatedReport = { ...reportInQueue, ...updates };
        await queueStore.put(updatedReport);
        console.log(`[Offline Edit] Updated report in queue: ${reportId}`);
    } else {
        // Caso 2: El reporte no está en la cola, así que debe estar en el caché principal (es un reporte ya sincronizado).
        const reportInMain = await mainStore.get(reportId);

        if (reportInMain) {
            // Encontrado. Aplicamos los cambios y lo AÑADIMOS a la cola de espera.
            const updatedReport: QueuedReport = {
                ...reportInMain,
                ...updates,
                localId: reportInMain.id,
                status: 'pending_sync',
            };
            await queueStore.put(updatedReport);
            console.log(`[Offline Edit] Copied synced report to queue for update: ${reportId}`);
        } else {
            // Caso 3: El reporte no se encontró en NINGÚN lado (por ejemplo, se creó online y nunca se cacheó).
            console.warn(`[Offline Edit] Report ${reportId} not found locally. Creating temporary local copy for offline edits.`);

            // Creamos una copia mínima local para permitir edición offline
            const newLocalReport = {
                ...updates,
                id: reportId,
                localId: reportId,
                status: 'pending_sync',
            } as QueuedReport;

            await queueStore.put(newLocalReport);
            console.log(`[Offline Edit] Created new local copy of online report: ${reportId}`);
        }
    }

    await tx.done;
}



/**
 * Retrieves all reports currently in the sync queue.
 * @returns An array of queued reports.
 */
export async function getQueuedReports(): Promise<QueuedReport[]> {
  if (!db) await initDB();
  return await db!.getAllFromIndex('reports_queue', 'by-status', 'pending_sync');
}

/**
 * Removes a report from the sync queue by its local ID.
 * @param localId The local ID of the report to remove.
 */
export async function removeReportFromQueue(localId: string): Promise<void> {
  if (!db) await initDB();
  await db!.delete('reports_queue', localId);
}


// --- Entity Queue Functions ---

/**
 * Adds an entity to the synchronization queue.
 * @param entity The entity object to add.
 */
export async function addEntityToQueue(entity: QueuedEntity): Promise<void> {
  if (!db) await initDB();
  await db!.put('entities_queue', entity);
}

/**
 * Retrieves all entities currently in the sync queue.
 * @returns An array of queued entities.
 */
export async function getQueuedEntities(): Promise<QueuedEntity[]> {
  if (!db) await initDB();
  return await db!.getAllFromIndex('entities_queue', 'by-status', 'pending_sync');
}

/**
 * Removes an entity from the sync queue by its local ID.
 * @param localId The local ID of the entity to remove.
 */
export async function removeEntityFromQueue(localId: string): Promise<void> {
  if (!db) await initDB();
  await db!.delete('entities_queue', localId);
}

/**
 * Fully resets local IndexedDB persistence.
 * Used when the installed app version changes and cached data must be rebuilt.
 */
export async function resetLocalDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => {
      console.log(`IndexedDB "${DB_NAME}" deleted successfully.`);
      resolve();
    };

    request.onerror = () => {
      console.error(`Failed to delete IndexedDB "${DB_NAME}":`, request.error);
      reject(request.error ?? new Error(`Failed to delete IndexedDB "${DB_NAME}".`));
    };

    request.onblocked = () => {
      console.warn(`Delete request for IndexedDB "${DB_NAME}" is blocked by another open connection.`);
    };
  });
}
