import {
    fetchCities, fetchCompanies, fetchDependencies, fetchUsers,
    supabaseOrders, fetchServiceTypes, fetchAppSettings, fetchEquipmentTypes,
    fetchRefrigerantTypes, fetchAllEquipment, fetchAllEnrichedOrders, fetchAllReports
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
import { BackgroundRunner } from '@capacitor/background-runner';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { SERVICE_WORKER_URL } from './assets';

const NATIVE_APP_VERSION_KEY = 'maintenance_native_app_version';

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
        localQueuedReports
    ] = await Promise.all([
        getAllFromStore('users'), getAllFromStore('cities'), getAllFromStore('companies'),
        getAllFromStore('dependencies'), getAllFromStore('equipment'), getAllFromStore('service_types'),
        getAllFromStore('equipment_types'), getAllFromStore('refrigerant_types'), getAllFromStore('app_settings'),
        getAllFromStore('reports'), getAllFromStore('orders'),
        getAllFromStore('reports_queue'),
    ]);

    const hasLocalData = localUsers.length > 0 && localCities.length > 0;

    if (hasLocalData) {
        console.log("Datos locales encontrados. Cargando desde IndexedDB.");
        State.setUsers(localUsers);
        State.setCities(localCities);
        State.setCompanies(localCompanies);
        State.setDependencies(localDependencies);
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
                equipmentData, serviceTypesData, equipmentTypesData, refrigerantTypesData, allReportsData
            ] = await Promise.all([
                fetchUsers(), fetchAppSettings(), fetchCities(), fetchCompanies(), fetchDependencies(),
                fetchAllEquipment(), fetchServiceTypes(), fetchEquipmentTypes(), fetchRefrigerantTypes(), fetchAllReports({ daysBack: 4 })
            ]);

            // Si llega aquí, todo bien:
            State.setUsers(usersData);
            State.setCities(citiesData);
            State.setCompanies(companiesData);
            State.setDependencies(dependenciesData);
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
        localQueuedReports
    ] = await Promise.all([
        getAllFromStore('users'), getAllFromStore('cities'), getAllFromStore('companies'),
        getAllFromStore('dependencies'), getAllFromStore('equipment'), getAllFromStore('service_types'),
        getAllFromStore('equipment_types'), getAllFromStore('refrigerant_types'), getAllFromStore('app_settings'),
        getAllFromStore('reports'), getAllFromStore('orders'),
        getAllFromStore('reports_queue'),
    ]);

    const hasLocalData = localUsers.length > 0 && localCities.length > 0;

    if (hasLocalData) {
        console.log("Datos locales encontrados. Cargando desde IndexedDB.");
        State.setUsers(localUsers);
        State.setCities(localCities);
        State.setCompanies(localCompanies);
        State.setDependencies(localDependencies);
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
    if (!navigator.onLine) {
        if (!hasLocalData) {
            showAppNotification("Sin conexión y sin datos locales. Conéctate a internet para la primera carga.", 'error', 10000);
        }
        return;
    }

    const maybeShowLoader = (msg: string) => {
        if (!silent) showLoader(msg);
    };

    try {
        maybeShowLoader(hasLocalData ? 'Actualizando datos...' : 'Descargando datos iniciales...');

        const [
            usersData, appSettingsData, citiesData, companiesData, dependenciesData,
            equipmentData, serviceTypesData, equipmentTypesData, refrigerantTypesData, allReportsData
        ] = await Promise.all([
            fetchUsers(), fetchAppSettings(), fetchCities(), fetchCompanies(), fetchDependencies(),
            fetchAllEquipment(), fetchServiceTypes(), fetchEquipmentTypes(), fetchRefrigerantTypes(), fetchAllReports({ daysBack: 4 })
        ]);

        State.setUsers(usersData);
        State.setCities(citiesData);
        State.setCompanies(companiesData);
        State.setDependencies(dependenciesData);
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
            setTimeout(() => refreshOnlineData({ silent: false, hasLocalData: false }), 5000);
        } else if (!silent) {
            showAppNotification("Sin conexión. Usando datos locales.", 'info');
        }
    } finally {
        if (!silent) hideLoader();
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
    // -------------------------------------------------------
    // 🔥 Registrar BackgroundRunner SOLO en Android
    // -------------------------------------------------------
    if (Capacitor.getPlatform() === 'android') {
        try {
            await BackgroundRunner.registerTask({
                name: 'backgroundSync',
                description: 'Sincroniza reportes automáticamente incluso con la app cerrada',
                path: 'background/sync-job'
            });

            await BackgroundRunner.start({
                title: 'Sincronización activa',
                description: 'La app continúa subiendo reportes automáticamente.',
                icon: 'ic_launcher'
            });

            console.log('[BackgroundRunner] Registrado correctamente.');
        } catch (err) {
            console.error('[BackgroundRunner] Error al registrar:', err);
        }
    } else {
        console.log('[BackgroundRunner] No disponible en esta plataforma:', Capacitor.getPlatform());
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
            // Primera vez sin cache: mantenemos flujo bloqueante
            await refreshOnlineData({ silent: false, hasLocalData: false });
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
