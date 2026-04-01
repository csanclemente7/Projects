// src/lib/background-sync.ts
import { 
    getQueuedReports, removeReportFromQueue, 
    getQueuedEntities, removeEntityFromQueue, 
    addOrUpdateItemInStore, getAllFromStore 
} from './local-db';

import { 
    supabaseOrders, upsertMaintenanceReport, 
    updateOrderStatus, awardPointToTechnician 
} from '../api';

import { EntityType } from '../types';

/**
 * 🚫 NO usar window, navigator, document, UI, Network aquí
 * 👍 Se ejecuta en @capacitor/background-runner (thread nativo)
 */

let isSyncing = false;
const localToServerIdMap = new Map<string, string>();

async function getCurrentUserHeadless() { ... }

async function syncEntitiesQueueHeadless() { ... }

export async function synchronizeQueueHeadless() { ... }
