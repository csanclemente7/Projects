import {
    fetchCities, fetchCompanies, fetchDependencies, fetchUsers,
    supabaseOrders, fetchServiceTypes, fetchAppSettings, fetchEquipmentTypes,
    fetchRefrigerantTypes, fetchAllEquipment, fetchAllEnrichedOrders, fetchAllReports, fetchSedes
} from './api';
import { setupEventListeners } from './events';
import { initSignaturePad, hideLoader, showLoader, showAppNotification, populateLoginWorkerSelect } from './ui';
import { initQrScanner } from './lib/qr-scanner';
import * as D from './dom';
import { openReportFormModal } from './ui';
import * as State from './state';
import { Database, AppSettings, Report } from './types';
import { checkForPersistedSession } from './auth';
import { UserPrefsManager } from './user-preferences';
import { FormAutosave } from './form-autosave';
import { initDB, getAllFromStore, cacheAllData, resetLocalDatabase } from './lib/local-db';
import { synchronizeQueue, startPeriodicSync } from './lib/sync';

import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { SERVICE_WORKER_URL } from './assets';
import { checkOnlineStatus } from './utils';

const NATIVE_APP_VERSION_KEY = 'maintenance_native_app_version';
const INITIAL_BOOTSTRAP_MAX_ATTEMPTS = 3;
const INITIAL_BOOTSTRAP_RETRY_DELAY_MS = 3500;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function hasUsableInternetConnection(): Promise<boolean> {
    try {
        if (Capacitor.isNativePlatform()) {
            const nativeStatus = await Network.getStatus();
            if (!nativeStatus.connected) {
                return false;
            }
        } else if (!navigator.onLine) {
            return false;
        }

        return await checkOnlineStatus();
    } catch (error) {
        console.warn('[Startup] Could not verify internet connectivity.', error);
        return false;
    }
}

function hasMinimumBootstrapData(): boolean {
    return State.users.length > 0 && State.cities.length > 0;
}

async function unregisterServiceWorkersOnNative(): Promise<void> {
    if (!Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return;
    try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if (registrations.length > 0) {
            console.log(`[Startup] Unregistered ${registrations.length} service worker(s) on native platform.`);
        }
    } catch (error) {
        console.error('[Startup] Failed to unregister native service workers:', error);
    }
}

async function clearRuntimeCaches(): Promise<void> {
    if (!('caches' in window)) return;
    try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        if (cacheNames.length > 0) {
            console.log(`[Startup] Deleted ${cacheNames.length} runtime cache(s).`);
        }
    } catch (error) {
        console.error('[Startup] Failed to clear runtime caches:', error);
    }
}

async function resetLocalPersistence(reason: string): Promise<void> {
    console.warn(reason);

    try {
        await resetLocalDatabase();
    } catch (error) {
        console.error('[Startup] Failed to reset IndexedDB:', error);
    }

    try {
        localStorage.clear();
    } catch (error) {
        console.error('[Startup] Failed to clear localStorage:', error);
    }

    await unregisterServiceWorkersOnNative();
    await clearRuntimeCaches();
}

async function getPendingSyncCounts(): Promise<{ reports: number; entities: number }> {
    try {
        await initDB();
        const [queuedReports, queuedEntities] = await Promise.all([
            getAllFromStore('reports_queue'),
            getAllFromStore('entities_queue'),
        ]);
        return {
            reports: queuedReports.length,
            entities: queuedEntities.length,
        };
    } catch (error) {
        console.error('[Startup] Failed to inspect pending sync queues before reset:', error);
        return { reports: 0, entities: 0 };
    }
}

async function ensureFreshLocalPersistence(): Promise<void> {
    const resetReasons: string[] = [];
    const storedDataVersion = localStorage.getItem(State.DATA_VERSION_KEY);

    if (storedDataVersion !== State.CURRENT_DATA_VERSION) {
        resetReasons.push(`data version "${storedDataVersion}" -> "${State.CURRENT_DATA_VERSION}"`);
    }

    let currentNativeVersion: string | null = null;
    if (Capacitor.isNativePlatform()) {
        try {
            const appInfo = await App.getInfo();
            currentNativeVersion = `${appInfo.version ?? '0'}+${appInfo.build ?? '0'}`;
            const storedNativeVersion = localStorage.getItem(NATIVE_APP_VERSION_KEY);
            if (storedNativeVersion !== currentNativeVersion) {
                resetReasons.push(`native version "${storedNativeVersion}" -> "${currentNativeVersion}"`);
            }
        } catch (error) {
            console.error('[Startup] Failed to read native app version:', error);
        }
    }

    if (resetReasons.length > 0) {
        const pendingSyncCounts = await getPendingSyncCounts();
        if (pendingSyncCounts.reports > 0 || pendingSyncCounts.entities > 0) {
            console.warn(
                `[Startup] Skipping local reset because there are ${pendingSyncCounts.reports} pending report(s) and ${pendingSyncCounts.entities} pending entit(ies) awaiting sync.`
            );
            return;
        }

        await resetLocalPersistence(`[Startup] Resetting local app data: ${resetReasons.join(', ')}.`);
    }

    localStorage.setItem(State.DATA_VERSION_KEY, State.CURRENT_DATA_VERSION);
    if (currentNativeVersion) {
        localStorage.setItem(NATIVE_APP_VERSION_KEY, currentNativeVersion);
    }
}


async function seedInitialUsers(initialUsers: any[]) {
    let usersNeedRefetch = false;

    const adminUserExists = initialUsers.some(u => u.username === 'admin');
    if (!adminUserExists) {
        console.log("Seeding Admin user...");
        const adminUserData: Database['public']['Tables']['maintenance_users']['Insert'] = {
            username: 'admin',
            password: 'Admin@Macris2026!',
            role: 'admin',
            name: 'Administrador Principal',
            cedula: 'admin001',
            is_active: true,
        };
        const { error } = await supabaseOrders.from('maintenance_users').insert([adminUserData] as any);
        if (error) console.error("Error seeding admin:", error);
        else usersNeedRefetch = true;
    }

    if (usersNeedRefetch) {
        console.log("Refetching users after seeding...");
        const finalUsers = await fetchUsers();
        State.setUsers(finalUsers);
    }
}

async function synchronizeAndLoadData() {
    showLoader('Cargando datos locales...');
    const [
        localUsers, localCities, localCompanies, localDependencies,
        localEquipment, localServiceTypes, localEquipmentTypes,
        localRefrigerantTypes, localAppSettings, localReports, localOrders,
        localQueuedReports, localSedes
    ] = await Promise.all([
        getAllFromStore('users'), getAllFromStore('cities'), getAllFromStore('companies'),
        getAllFromStore('dependencies'), getAllFromStore('equipment'), getAllFromStore('service_types'),
        getAllFromStore('equipment_types'), getAllFromStore('refrigerant_types'), getAllFromStore('app_settings'),
        getAllFromStore('reports'), getAllFromStore('orders'),
        getAllFromStore('reports_queue'), getAllFromStore('sedes'),
    ]);

    const hasLocalData = localUsers.length > 0 && localCities.length > 0;

    if (hasLocalData) {
        console.log("Datos locales encontrados. Cargando desde IndexedDB.");
        State.setUsers(localUsers);
        State.setCities(localCities);
        State.setCompanies(localCompanies);
        State.setDependencies(localDependencies);
        State.setSedes(localSedes || []);
        State.setEquipmentList(localEquipment);
        State.setServiceTypes(localServiceTypes);
        State.setEquipmentTypes(localEquipmentTypes);
        State.setRefrigerantTypes(localRefrigerantTypes);
        const settings: AppSettings = {};
        localAppSettings.forEach(s => settings[s.key] = s.value);
        State.setAppSettings(settings);

        // Combine reports from main cache and queue
        const combinedLocalReports = [...localQueuedReports, ...localReports];
        const localReportMap = new Map(combinedLocalReports.map(r => [r.id, r]));
        State.setReports(Array.from(localReportMap.values()));

        State.setAllServiceOrders(localOrders);
    }

    const isOnline = navigator.onLine;

    if (isOnline) {
        try {
            showLoader(hasLocalData ? 'Actualizando datos...' : 'Descargando datos iniciales...');

            // 🔹 Intentamos descargar todos los datos desde el servidor
            const [
                usersData, appSettingsData, citiesData, companiesData, dependenciesData,
                equipmentData, serviceTypesData, equipmentTypesData, refrigerantTypesData, allReportsData, sedesData 
            ] = await Promise.all([
                fetchUsers(), fetchAppSettings(), fetchCities(), fetchCompanies(), fetchDependencies(),
                fetchAllEquipment(), fetchServiceTypes(), fetchEquipmentTypes(), fetchRefrigerantTypes(), fetchAllReports({ daysBack: 4 }), fetchSedes()
            ]);

            // Si llega aquí, todo bien:
            State.setUsers(usersData);
            State.setCities(citiesData);
            State.setCompanies(companiesData);
            State.setDependencies(dependenciesData);
            State.setSedes(sedesData);
            State.setEquipmentList(equipmentData);
            State.setServiceTypes(serviceTypesData);
            State.setEquipmentTypes(equipmentTypesData);
            State.setRefrigerantTypes(refrigerantTypesData);
            const settings: AppSettings = {};
            appSettingsData && Object.entries(appSettingsData).forEach(([key, value]) => settings[key] = value);
            State.setAppSettings(settings);

            const allEnrichedOrdersData = await fetchAllEnrichedOrders(usersData, { daysBack: 90, limit: 300 });
            const allQueuedReportsData = await getAllFromStore('reports_queue');

            const combinedReports = [...allQueuedReportsData, ...allReportsData];
            const reportMap = new Map(combinedReports.map(r => [r.id, r]));
            State.setReports(Array.from(reportMap.values()));
            State.setAllServiceOrders(allEnrichedOrdersData);

            // 🔹 Cachea todo localmente
            await Promise.all([
                cacheAllData('users', usersData),
                cacheAllData('cities', citiesData),
                cacheAllData('companies', companiesData),
                cacheAllData('dependencies', dependenciesData),
                cacheAllData('sedes', sedesData),
                cacheAllData('equipment', equipmentData),
                cacheAllData('service_types', serviceTypesData),
                cacheAllData('equipment_types', equipmentTypesData),
                cacheAllData('refrigerant_types', refrigerantTypesData),
                cacheAllData('app_settings', Object.entries(settings).map(([key, value]) => ({ key, value }))),
                cacheAllData('reports', allReportsData),
                cacheAllData('orders', allEnrichedOrdersData)
            ]);

            await seedInitialUsers(usersData);
            console.log("✅ Datos iniciales descargados y guardados correctamente.");

        } catch (error: any) {
            console.error("Error al sincronizar datos:", error);

            // 🔸 Solo mostrar error grave si no hay datos locales
            if (!hasLocalData) {
                showAppNotification("No se pudieron descargar los datos iniciales. Reintentando en unos segundos...", 'warning');

                // 🔁 Reintento automático tras 5 segundos
                setTimeout(() => synchronizeAndLoadData(), 5000);
            } else {
                showAppNotification("Sin conexión. Usando datos locales.", 'info');
            }
        }
    } else {
        // 🔸 Caso sin conexión y sin datos locales (inicio completamente offline)
        if (!hasLocalData) {
            showAppNotification("Sin conexión y sin datos locales. Conéctate a internet para la primera carga.", 'error', 10000);
            return;
        }
        showAppNotification("Sin conexión. Usando datos guardados localmente.", 'info');
    }

}

/**
 * Carga datos locales mínimos para permitir login inmediato.
 * Devuelve si existen datos en cache para poder arrancar sin bloqueo.
 */
async function loadLocalDataIntoState(): Promise<boolean> {
    showLoader('Cargando datos locales...');
    const [
        localUsers, localCities, localCompanies, localDependencies,
        localEquipment, localServiceTypes, localEquipmentTypes,
        localRefrigerantTypes, localAppSettings, localReports, localOrders,
        localQueuedReports, localSedes
    ] = await Promise.all([
        getAllFromStore('users'), getAllFromStore('cities'), getAllFromStore('companies'),
        getAllFromStore('dependencies'), getAllFromStore('equipment'), getAllFromStore('service_types'),
        getAllFromStore('equipment_types'), getAllFromStore('refrigerant_types'), getAllFromStore('app_settings'),
        getAllFromStore('reports'), getAllFromStore('orders'),
        getAllFromStore('reports_queue'), getAllFromStore('sedes'),
    ]);

    const hasLocalData = localUsers.length > 0 && localCities.length > 0;

    if (hasLocalData) {
        console.log("Datos locales encontrados. Cargando desde IndexedDB.");
        State.setUsers(localUsers);
        State.setCities(localCities);
        State.setCompanies(localCompanies);
        State.setDependencies(localDependencies);
        State.setSedes(localSedes || []);
        State.setEquipmentList(localEquipment);
        State.setServiceTypes(localServiceTypes);
        State.setEquipmentTypes(localEquipmentTypes);
        State.setRefrigerantTypes(localRefrigerantTypes);
        const settings: AppSettings = {};
        localAppSettings.forEach(s => settings[s.key] = s.value);
        State.setAppSettings(settings);

        // Combine reports from main cache and queue
        const combinedLocalReports = [...localQueuedReports, ...localReports];
        const localReportMap = new Map(combinedLocalReports.map(r => [r.id || (r as any).localId, r]));
        State.setReports(Array.from(localReportMap.values()));

        State.setAllServiceOrders(localOrders);
    }

    hideLoader();
    return hasLocalData;
}

/**
 * Refresca datos en línea. Si `silent` es true, no bloquea la UI ni muestra loader.
 * Cuando no hay datos locales, se mantiene el comportamiento original (bloqueante).
 */
async function refreshOnlineData(options: { silent?: boolean, hasLocalData: boolean }) {
    const { silent = false, hasLocalData } = options;
    const isOnline = await hasUsableInternetConnection();
    if (!isOnline) {
        if (!hasLocalData) {
            showAppNotification("Sin conexión y sin datos locales. Conéctate a internet para la primera carga.", 'error', 10000);
        }
        return;
    }

    // Detectar el rol del usuario persistido para evitar descargas innecesarias.
    // Para técnicos: los reportes y órdenes específicos se cargan en handlePostLogin().
    let persistedRole: string | null = null;
    try {
        const storedUserJSON = localStorage.getItem('maintenance_app_current_user');
        if (storedUserJSON) {
            persistedRole = JSON.parse(storedUserJSON)?.role || null;
        }
    } catch { /* ignore parse errors */ }
    const isWorker = persistedRole === 'worker';

    const maybeShowLoader = (msg: string) => {
        if (!silent) showLoader(msg);
    };

    try {
        maybeShowLoader(hasLocalData ? 'Actualizando datos...' : 'Descargando datos iniciales...');

        // Catálogos base: necesarios para todos los roles (login, formularios, etc.)
        const [
            usersData, appSettingsData, citiesData, companiesData, dependenciesData,
            equipmentData, serviceTypesData, equipmentTypesData, refrigerantTypesData, sedesData
        ] = await Promise.all([
            fetchUsers(), fetchAppSettings(), fetchCities(), fetchCompanies(), fetchDependencies(),
            fetchAllEquipment(), fetchServiceTypes(), fetchEquipmentTypes(), fetchRefrigerantTypes(), fetchSedes()
        ]);

        State.setUsers(usersData);
        State.setCities(citiesData);
        State.setCompanies(companiesData);
        State.setDependencies(dependenciesData);
        State.setSedes(sedesData);
        State.setEquipmentList(equipmentData);
        State.setServiceTypes(serviceTypesData);
        State.setEquipmentTypes(equipmentTypesData);
        State.setRefrigerantTypes(refrigerantTypesData);
        const settings: AppSettings = {};
        appSettingsData && Object.entries(appSettingsData).forEach(([key, value]) => settings[key] = value);
        State.setAppSettings(settings);
        populateLoginWorkerSelect();

        // Datos pesados: solo descargar para admin.
        // Para técnicos, handlePostLogin() se encarga de cargar sus reportes y órdenes específicas.
        if (!isWorker) {
            const allReportsData = await fetchAllReports({ daysBack: 4 });
            const allEnrichedOrdersData = await fetchAllEnrichedOrders(usersData, { daysBack: 90, limit: 300 });
            const allQueuedReportsData = await getAllFromStore('reports_queue');

            const combinedReports = [...allQueuedReportsData, ...allReportsData];
            const reportMap = new Map(combinedReports.map(r => [r.id, r]));
            State.setReports(Array.from(reportMap.values()));
            State.setAllServiceOrders(allEnrichedOrdersData);

            await Promise.all([
                cacheAllData('reports', allReportsData),
                cacheAllData('orders', allEnrichedOrdersData)
            ]);
        }

        // 🔹 Cachea catálogos base localmente
        await Promise.all([
            cacheAllData('users', usersData),
            cacheAllData('cities', citiesData),
            cacheAllData('companies', companiesData),
            cacheAllData('dependencies', dependenciesData),
            cacheAllData('sedes', sedesData),
            cacheAllData('equipment', equipmentData),
            cacheAllData('service_types', serviceTypesData),
            cacheAllData('equipment_types', equipmentTypesData),
            cacheAllData('refrigerant_types', refrigerantTypesData),
            cacheAllData('app_settings', Object.entries(settings).map(([key, value]) => ({ key, value }))),
        ]);

        await seedInitialUsers(usersData);
        console.log(`✅ Datos iniciales descargados y guardados correctamente (rol persistido: ${persistedRole || 'ninguno'}).`);

    } catch (error: any) {
        console.error("Error al sincronizar datos:", error);

        // 🔸 Solo mostrar error grave si no hay datos locales
        if (!hasLocalData) {
            showAppNotification("No se pudieron descargar los datos iniciales. Reintentando en unos segundos...", 'warning');

            // 🔁 Reintento automático tras 5 segundos
            setTimeout(() => refreshOnlineData({ silent: false, hasLocalData: false }), 5000);
        } else if (!silent) {
            showAppNotification("Sin conexión. Usando datos locales.", 'info');
        }
    } finally {
        if (!silent) hideLoader();
    }
}

async function ensureInitialBootstrapData(hasLocalData: boolean): Promise<void> {
    if (hasLocalData || hasMinimumBootstrapData()) {
        return;
    }

    for (let attempt = 1; attempt <= INITIAL_BOOTSTRAP_MAX_ATTEMPTS; attempt++) {
        await refreshOnlineData({ silent: false, hasLocalData: false });

        if (hasMinimumBootstrapData()) {
            return;
        }

        if (attempt < INITIAL_BOOTSTRAP_MAX_ATTEMPTS) {
            showAppNotification(
                `Reintentando carga inicial de técnicos y catálogos (${attempt + 1}/${INITIAL_BOOTSTRAP_MAX_ATTEMPTS})...`,
                'info',
                2500
            );
            await wait(INITIAL_BOOTSTRAP_RETRY_DELAY_MS);
        }
    }
}


export async function main() {
    // 1. Registrar el Service Worker y manejar la activación inicial
    if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
            console.log('Service Worker registrado con éxito. Scope:', registration.scope);

            // --- Manejo de doble recarga del Service Worker ---
            let refreshing = false;
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && !navigator.serviceWorker.controller) {
                            console.log('[SW] Nuevo Service Worker instalado, refrescando...');
                            if (!refreshing) {
                                refreshing = true;
                                window.location.reload();
                            }
                        }
                    });
                }
            });
            // --- FIN de la solución ---

        } catch (error) {
            console.error('Error al registrar el Service Worker:', error);
        }
    }



    // 2. Continuar con el resto de la inicialización de la app
    showLoader('Iniciando aplicación...');

    try {
        await ensureFreshLocalPersistence();
        await initDB();

        const hasLocalData = await loadLocalDataIntoState();

        if (hasLocalData) {
            // Refrescar en segundo plano para no bloquear el login del técnico
            refreshOnlineData({ silent: true, hasLocalData }).catch(err => console.error('Background refresh failed:', err));
        } else {
            // Primera vez sin cache: reintentar porque Android a veces reporta la red tarde al abrir.
            await ensureInitialBootstrapData(false);
        }

        populateLoginWorkerSelect();
        checkForPersistedSession();

        // Intento inicial de sincronización usando la validación de red del sincronizador.
        await synchronizeQueue();
        startPeriodicSync();

        setupEventListeners();
        UserPrefsManager.initUI();
        FormAutosave.init();
        initSignaturePad();

        initQrScanner({
            scanQrCameraButton: D.scanQrCameraButton,
            scanQrFromFileButton: D.scanQrFromFileButton,
            qrFileInput: D.qrFileInput,
            cameraScanModal: D.cameraScanModal,
            closeCameraScanModalButton: D.closeCameraScanModalButton,
            qrVideoElement: D.qrVideoElement,
            qrHiddenCanvasElement: D.qrHiddenCanvasElement,
            cancelCameraScanButton: D.cancelCameraScanButton,
            cameraScanFeedback: D.cameraScanFeedback,
            showLoader,
            hideLoader,
            showAppNotification,
            handleQrCodeResult: (qrData) => {
                showLoader('Procesando QR...');
                try {
                    const manualId = qrData.trim();
                    if (manualId) {
                        const equipment = State.equipmentList.find(eq =>
                            eq.manualId?.trim().toLowerCase() === manualId.toLowerCase()
                        );
                        if (equipment) {
                            showAppNotification(`Equipo encontrado: ${equipment.brand} ${equipment.model}`, 'success');
                            openReportFormModal({ equipment, category: equipment.category as any });
                        } else {
                            showAppNotification(`Equipo con ID Manual '${manualId}' no fue encontrado.`, 'error', 5000);
                        }
                    } else {
                        throw new Error("El código QR está vacío.");
                    }
                } catch (e: any) {
                    showAppNotification('El código QR no es válido o está vacío.', 'error');
                    console.error("Error procesando QR:", e);
                } finally {
                    hideLoader();
                }
            }
        });

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIOS && D.toggleFullscreenButton) {
            D.toggleFullscreenButton.style.display = 'none';
        }

    } catch (error: any) {
        console.error("Error crítico durante inicialización:", error);
        showAppNotification(error.message || 'Error crítico al iniciar la aplicación.', 'error', 10000);
        hideLoader();
    }
}
