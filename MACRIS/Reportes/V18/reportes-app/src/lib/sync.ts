import { getQueuedReports, removeReportFromQueue, QueuedReport, getQueuedEntities, removeEntityFromQueue, QueuedEntity, addOrUpdateItemInStore, getAllFromStore, cacheAllData } from './local-db';
import { supabaseOrders, upsertMaintenanceReport, updateOrderStatus, awardPointToTechnician, fetchAllReports, fetchReportsForWorker, fetchCompanies, fetchCities, fetchDependencies, fetchEquipmentTypes, fetchRefrigerantTypes, updateEquipmentLastMaintenanceDate } from '../api';
import { showAppNotification, renderMyReportsTable, renderAdminReportsTable, renderAssignedOrdersList, renderAdminOrdersList, updateUserPointsDisplay } from '../ui';
import * as State from '../state';
import { EntityType } from '../types';
import { checkOnlineStatus, withTimeout, shouldUpdateLastMaintenance, toDateString } from '../utils';
import { Network } from '@capacitor/network';


let isSyncing = false; // Simple lock to prevent concurrent syncs
// This map will hold the mapping from temporary local IDs to permanent server IDs during a sync cycle.
const localToServerIdMap = new Map<string, string>();

let periodicSyncIntervalId: number | null = null;
const SYNC_INTERVAL = 60 * 1000; // 60 seconds — reduced from 30s to save battery and data

async function hasReliableConnection(): Promise<boolean> {
  try {
    if ((Network as any)?.getStatus) {
      const status = await Network.getStatus();
      return !!status.connected;
    }
  } catch (error) {
    console.warn('[Sync] Failed to read Capacitor network status. Falling back to web connectivity check.', error);
  }

  if (navigator.onLine) {
    return true;
  }

  return await checkOnlineStatus();
}

export function startPeriodicSync() {
  if (periodicSyncIntervalId !== null) {
    console.log('[Sync] Periodic sync is already running.');
    return;
  }

  console.log(`[Sync] Starting periodic sync every ${SYNC_INTERVAL / 1000} seconds.`);

  periodicSyncIntervalId = window.setInterval(async () => {
    try {
      const isOnline = await hasReliableConnection();
      if (!isOnline) {
        console.log('[Periodic Sync] Skipped: device is offline.');
        return;
      }

      console.log('[Periodic Sync] Device online, running synchronization...');
      await synchronizeQueue();
    } catch (err) {
      console.error('[Periodic Sync] Error during network check:', err);
    }
  }, SYNC_INTERVAL);
}



export function stopPeriodicSync() {
    if (periodicSyncIntervalId !== null) {
        console.log('[Sync] Stopping periodic sync.');
        clearInterval(periodicSyncIntervalId);
        periodicSyncIntervalId = null;
    }
}

async function syncEntitiesQueue(): Promise<boolean> {
    const queuedEntities = await getQueuedEntities();
    if (queuedEntities.length === 0) {
        console.log('[Sync] No entities in queue to sync.');
        return true; // Nothing to do, so it's a "success"
    }

    console.log(`[Sync] Found ${queuedEntities.length} entities to sync.`);
    let allSucceeded = true;

    // Define the order of synchronization based on dependencies
    const syncOrder: EntityType[] = ['city', 'company', 'dependency', 'equipmentType', 'refrigerant'];
    const sortedEntities = queuedEntities.sort((a, b) => {
        return syncOrder.indexOf(a.type) - syncOrder.indexOf(b.type);
    });

    for (const entity of sortedEntities) {
        try {
            const { localId, type, payload } = entity;
            // The payload already contains a temporary `id` property which we need to remove before inserting.
            const { id, ...originalPayload } = payload;
            let insertPayload = { ...originalPayload };
            
            // --- ID REMAPPING LOGIC ---
            if (type === 'company' && insertPayload.city_id && insertPayload.city_id.startsWith('local_')) {
                const serverCityId = localToServerIdMap.get(insertPayload.city_id);
                if (!serverCityId) throw new Error(`Parent city with local ID ${insertPayload.city_id} has not been synced yet.`);
                insertPayload.city_id = serverCityId;
            }
            if (type === 'dependency' && insertPayload.company_id && insertPayload.company_id.startsWith('local_')) {
                const serverCompanyId = localToServerIdMap.get(insertPayload.company_id);
                if (!serverCompanyId) throw new Error(`Parent company with local ID ${insertPayload.company_id} has not been synced yet.`);
                insertPayload.company_id = serverCompanyId;
            }
            // sede_id mirrors company_id for sede-dependencies (new convention: both hold the sedeId).
            // Remap it independently in case the sede was also created offline in this cycle.
            if (type === 'dependency' && insertPayload.sede_id && insertPayload.sede_id.startsWith('local_')) {
                const serverSedeId = localToServerIdMap.get(insertPayload.sede_id);
                if (serverSedeId) {
                    insertPayload.sede_id = serverSedeId;
                } else {
                    console.warn(`[Sync] Could not find server ID for local sede_id ${insertPayload.sede_id}. Setting to null.`);
                    insertPayload.sede_id = null;
                }
            }
            // client_id for dependencies comes from State.companies (clients DB) so it should always
            // be a real server UUID. This remapping is defensive for unexpected edge cases.
            if (type === 'dependency' && insertPayload.client_id && insertPayload.client_id.startsWith('local_')) {
                const serverClientId = localToServerIdMap.get(insertPayload.client_id);
                if (serverClientId) {
                    insertPayload.client_id = serverClientId;
                } else {
                    console.warn(`[Sync] Unexpected local client_id for dependency: ${insertPayload.client_id}. This likely means the parent company was not synced first.`);
                    insertPayload.client_id = null;
                }
            }
            // --- END OF ID REMAPPING ---

            let tableName: string;
            switch(type) {
                case 'city': tableName = 'maintenance_cities'; break;
                case 'company': tableName = 'maintenance_companies'; break;
                case 'dependency': tableName = 'maintenance_dependencies'; break;
                case 'equipmentType': tableName = 'maintenance_equipment_types'; break;
                case 'refrigerant': tableName = 'maintenance_refrigerant_types'; break;
                default:
                    throw new Error(`Sync for entity type "${type}" is not implemented.`);
            }

            // IMPORTANT: We need to get the created entity back to get its new server-side UUID
            const { data: newServerEntity, error } = await withTimeout(
                supabaseOrders.from(tableName).insert(insertPayload).select().single(),
                15000,
                `creación de entidad offline ${type}`
            );

            if (error) {
                if (error.code === '23505') { // Duplicate error
                    console.warn(`[Sync] Entity ${localId} already exists (duplicate). Recovering server ID...`);
                    
                    let existingId: string | null = null;
                    try {
                        if (type === 'company' && insertPayload.name && insertPayload.city_id) {
                            const { data } = await supabaseOrders.from('maintenance_companies')
                                 .select('id').eq('name', insertPayload.name).eq('city_id', insertPayload.city_id).single();
                            if (data) existingId = data.id;
                        } else if (type === 'dependency' && insertPayload.name) {
                            // Ámbito primario: company_id + name (funciona para nueva convención
                            // y legacy donde company_id es sedeId o clientId).
                            if (insertPayload.company_id) {
                                const { data } = await supabaseOrders.from('maintenance_dependencies')
                                    .select('id').eq('name', insertPayload.name).eq('company_id', insertPayload.company_id).maybeSingle();
                                if (data) existingId = data.id;
                            }
                            // Fallback: client_id + sede_id + name para registros legacy donde
                            // company_id era null o no coincide (datos anteriores a la convención).
                            if (!existingId && insertPayload.client_id) {
                                let fallbackQuery = supabaseOrders.from('maintenance_dependencies')
                                    .select('id').eq('name', insertPayload.name).eq('client_id', insertPayload.client_id);
                                if (insertPayload.sede_id) {
                                    fallbackQuery = fallbackQuery.eq('sede_id', insertPayload.sede_id);
                                } else {
                                    fallbackQuery = fallbackQuery.is('sede_id', null);
                                }
                                const { data: fallbackData } = await fallbackQuery.maybeSingle();
                                if (fallbackData) existingId = fallbackData.id;
                            }
                        } else if (insertPayload.name) {
                            const { data } = await supabaseOrders.from(tableName)
                                 .select('id').eq('name', insertPayload.name).single();
                            if (data) existingId = data.id;
                        }
                    } catch (fetchErr) {
                        console.error(`[Sync] Error recovering existing ID for duplicate ${localId}:`, fetchErr);
                    }

                    if (existingId) {
                        localToServerIdMap.set(localId, existingId);
                        console.log(`[Sync] Mapped duplicate entity ${localId} to server ID: ${existingId}`);
                        await removeEntityFromQueue(localId);
                    } else {
                        console.error(`[Sync] Failed to find existing ID for duplicate ${localId}. Removing from queue.`);
                        await removeEntityFromQueue(localId);
                    }
                } else {
                    throw error;
                }
            // FIX: Check for newServerEntity to ensure it's not null before use.
            } else if (newServerEntity) {
                // Success! Map the local ID to the new server ID and remove from queue
                // FIX: Cast newServerEntity to `any` to access the `id` property, as its type cannot be inferred from a dynamic table name.
                localToServerIdMap.set(localId, (newServerEntity as any).id);
                await removeEntityFromQueue(localId);
                // FIX: Cast newServerEntity to `any` to access the `id` property, as its type cannot be inferred from a dynamic table name.
                console.log(`[Sync] Successfully synced entity ${localId}. New server ID: ${(newServerEntity as any).id}`);
            } else {
                // This case is unlikely after a successful insert but good to handle.
                throw new Error(`[Sync] Insert succeeded but failed to retrieve new entity for local ID ${localId}.`);
            }
        } catch (error: any) {
            allSucceeded = false;
            console.error(`[Sync] Failed to sync entity ${entity.localId}:`, error);
            showAppNotification(`Error al sincronizar la entidad: ${entity.payload.name || entity.type}.`, 'error');
        }
    }
    
    // After syncing, refetch the master data to update the app state
    if (queuedEntities.length > 0 && allSucceeded) {
        console.log('[Sync] Refetching master data after entity sync...');
        const [cities, companies, dependencies, equipmentTypes, refrigerantTypes] = await Promise.all([
            fetchCities(),
            fetchCompanies(),
            fetchDependencies(),
            fetchEquipmentTypes(),
            fetchRefrigerantTypes(),
        ]);
        State.setCities(cities);
        State.setCompanies(companies);
        State.setDependencies(dependencies);
        State.setEquipmentTypes(equipmentTypes);
        State.setRefrigerantTypes(refrigerantTypes);
        await Promise.allSettled([
            cacheAllData('cities', cities),
            cacheAllData('companies', companies),
            cacheAllData('dependencies', dependencies),
            cacheAllData('equipment_types', equipmentTypes),
            cacheAllData('refrigerant_types', refrigerantTypes),
        ]);
        console.log('[Sync] Master data refetched.');
    }

    return allSucceeded;
}

export async function synchronizeQueue(): Promise<void> {
    if (isSyncing) {
        console.log('[Sync] Aborted: Sync already in progress.');
        return;
    }

    const isOnline = await hasReliableConnection();
    if (!isOnline) {
        console.log('[Sync] Aborted: Offline after reliable connectivity check.');
        return;
    }
    
    if (!State.currentUser) {
        console.log('[Sync] Aborted: No user is currently logged in.');
        return;
    }

    // P2: Salida temprana si no hay nada pendiente (evita adquirir el lock y hacer trabajo innecesario)
    const [pendingReports, pendingEntities] = await Promise.all([
        getQueuedReports(),
        getQueuedEntities()
    ]);
    if (pendingReports.length === 0 && pendingEntities.length === 0) {
        console.log('[Sync] Aborted: No pending items in queue.');
        return;
    }

    isSyncing = true;
    localToServerIdMap.clear(); // Clear the map at the start of each new sync process
    console.log('[Sync] Lock acquired. Starting synchronization process...');

    try {
        // --- STEP 1: Sync Entities First ---
        console.log('[Sync] === Phase 1: Syncing Entities ===');
        const entitiesSyncedSuccessfully = await syncEntitiesQueue();
        if (!entitiesSyncedSuccessfully) {
            console.warn('[Sync] Not all entities synced successfully. Halting report sync to prevent data integrity issues.');
            showAppNotification('Algunas entidades no se pudieron sincronizar. La sincronización de reportes se reintentará más tarde.', 'warning');
            return;
        }
        console.log('[Sync] === Phase 1 Complete ===');

        // --- STEP 2: Sync Reports ---
        console.log('[Sync] === Phase 2: Syncing Reports ===');
        const queuedReports = await getQueuedReports();

        if (queuedReports.length === 0) {
            console.log("[Sync] No reports in queue to sync.");
            return;
        }

        showAppNotification(`Conexión detectada. Sincronizando ${queuedReports.length} reporte(s)...`, 'info', 5000);

        let successCount = 0;
        let failCount = 0;

        for (const report of queuedReports) {
            try {
                const { localId, status, ...reportToSync } = report;
                
                // --- ID REMAPPING FOR REPORTS ---
                if (reportToSync.cityId && reportToSync.cityId.startsWith('local_')) {
                    const serverId = localToServerIdMap.get(reportToSync.cityId);
                    if (serverId) reportToSync.cityId = serverId;
                    else console.warn(`[Sync] Could not find server ID for local city ID: ${reportToSync.cityId}`);
                }
                if (reportToSync.companyId && reportToSync.companyId.startsWith('local_')) {
                    const serverId = localToServerIdMap.get(reportToSync.companyId);
                    if (serverId) reportToSync.companyId = serverId;
                    else console.warn(`[Sync] Could not find server ID for local company ID: ${reportToSync.companyId}`);
                }
                if (reportToSync.dependencyId && reportToSync.dependencyId.startsWith('local_')) {
                    const serverId = localToServerIdMap.get(reportToSync.dependencyId);
                    if (serverId) reportToSync.dependencyId = serverId;
                    else console.warn(`[Sync] Could not find server ID for local dependency ID: ${reportToSync.dependencyId}`);
                }
                // --- END ID REMAPPING ---

                const reportForDb = {
                    id: reportToSync.id,
                    timestamp: reportToSync.timestamp,
                    service_type: reportToSync.serviceType,
                    observations: reportToSync.observations,
                    equipment_snapshot: reportToSync.equipmentSnapshot as any,
                    items_snapshot: reportToSync.itemsSnapshot,
                    city_id: reportToSync.cityId,
                    company_id: reportToSync.companyId,
                    dependency_id: reportToSync.dependencyId,
                    worker_id: reportToSync.workerId,
                    worker_name: reportToSync.workerName,
                    client_signature: reportToSync.clientSignature,
                    pressure: reportToSync.pressure,
                    amperage: reportToSync.amperage,
                    is_paid: reportToSync.is_paid,
                    photo_internal_unit_url: reportToSync.photo_internal_unit_url,
                    photo_external_unit_url: reportToSync.photo_external_unit_url,
                    order_id: reportToSync.orderId || null,
                };

                await withTimeout(
                    upsertMaintenanceReport(reportForDb), 
                    15000, 
                    `subida de reporte offline`
                );

                if (report.orderId) {
                    await updateOrderStatus(report.orderId, 'completed');
                    State.updateOrderInState(report.orderId, { status: 'completed' });
                }
                
                if (State.currentUser.id === report.workerId) {
                     const { error: pointError } = await awardPointToTechnician(report.workerId);
                     if (!pointError && State.currentUser.points !== undefined && State.currentUser.points !== null) {
                        if (State.currentUser) {
                            State.currentUser.points++;
                        }
                     } else if (pointError) {
                         console.warn(`[Sync] Failed to award point for report ${report.localId}, but sync will continue.`, pointError);
                     }
                }

                // Plan sección 7.2: actualizar last_maintenance_date al sincronizar un preventivo offline.
                const syncSnapId = reportToSync.equipmentSnapshot?.id;
                if (shouldUpdateLastMaintenance(reportToSync.serviceType, syncSnapId)) {
                    const syncDateStr = toDateString(reportToSync.timestamp);
                    const syncEq = State.equipmentList.find(eq => eq.id === syncSnapId);
                    if (!syncEq?.lastMaintenanceDate || syncDateStr >= syncEq.lastMaintenanceDate) {
                        try {
                            await updateEquipmentLastMaintenanceDate(syncSnapId!, syncDateStr);
                            State.updateEquipmentInState(syncSnapId!, { lastMaintenanceDate: syncDateStr });
                        } catch (eqErr) {
                            console.warn('[Sync] No se pudo actualizar last_maintenance_date:', eqErr);
                        }
                    }
                }

                // **CRITICAL FIX**: After successful sync, add to the main `reports` cache
                // before removing from the queue. This ensures offline availability.
                await addOrUpdateItemInStore('reports', reportToSync);

                await removeReportFromQueue(localId);
                successCount++;

            } catch (error: any) {
                console.error(`[Sync] Failed to sync report ${report.localId}:`, error);
                if (error.code === '23505') { 
                    showAppNotification(`Reporte ${report.localId.substring(0,8)} ya existe. Eliminando de la cola.`, 'info');
                    // Even if it's a duplicate, ensure it's in the local cache
                    const { localId, status, ...reportToCache } = report;
                    await addOrUpdateItemInStore('reports', reportToCache);
                    await removeReportFromQueue(report.localId);
                } else {
                    showAppNotification(`Error al sincronizar reporte ${report.localId.substring(0,8)}.`, 'error');
                    failCount++;
                }
            }
        }

        if (successCount > 0) {
            showAppNotification(`${successCount} reporte(s) sincronizado(s).`, 'success');
        }
        if (failCount === 0 && successCount > 0) {
            showAppNotification('Sincronización completada.', 'success', 2000);
        }
        
        if (successCount > 0) {
            showAppNotification('Actualizando listas...', 'info', 1500);
            // After sync, the in-memory state might be out of date.
            // Let's rebuild it from the updated local DB stores.
            const [syncedReports, stillQueued] = await Promise.all([
                getAllFromStore('reports'),
                getQueuedReports()
            ]);
            
            const combined = [...stillQueued, ...syncedReports];
            const reportMap = new Map(combined.map(r => [r.id, r]));
            State.setReports(Array.from(reportMap.values()));


            if (State.currentUser.role === 'worker') {
                renderMyReportsTable();
                renderAssignedOrdersList();
            } else {
                renderAdminReportsTable();
                renderAdminOrdersList();
            }
            updateUserPointsDisplay(State.currentUser.points);
        }
        console.log('[Sync] === Phase 2 Complete ===');

    } catch (error) {
        console.error("[Sync] A critical error occurred during the sync process:", error);
        showAppNotification('Ocurrió un error inesperado durante la sincronización.', 'error');
    } finally {
        isSyncing = false;
        console.log('[Sync] Lock released. Synchronization process finished.');
    }
}

