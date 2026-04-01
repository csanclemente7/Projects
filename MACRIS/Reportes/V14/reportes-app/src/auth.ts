import {
    supabaseOrders,
    fetchAssignedOrders,
    fetchAllReports,
    fetchReportsForWorker,
    fetchUsers,
    fetchCities,
    fetchCompanies,
    fetchDependencies,
    fetchAllEquipment,
    fetchServiceTypes,
    fetchAppSettings,
    fetchEquipmentTypes,
    fetchRefrigerantTypes,
    fetchAllEnrichedOrders,
} from './api';
import * as State from './state';
import * as D from './dom';
import { populateBottomNav, showView, showLoader, hideLoader, showAppNotification, populateAdminFilterDropdowns, renderAdminOrdersList, populateAdminOrderFilterDropdowns, updateUserPointsDisplay, renderAssignedOrdersList, renderMyReportsTable, renderAdminReportsTable, renderAdminEquipmentTable, renderAdminScheduleTable, renderCitiesTable, renderCompaniesTable, renderDependenciesTable, renderEmployeesTable, renderAppSettings } from './ui';
import { cacheAllData, getAllFromStore } from './lib/local-db';
import { synchronizeQueue } from './lib/sync';
import { User, Order, AppSettings, Report } from './types';
import { checkOnlineStatus, withTimeout } from './utils';
import { RealtimeChannel } from '@supabase/supabase-js';
import { UserPrefsManager } from './user-preferences';

let reportRefreshIntervalId: number | null = null;
let orderRealtimeChannel: RealtimeChannel | null = null;
let orderRefreshIntervalId: number | null = null;
let masterDataRefreshIntervalId: number | null = null;
let isMasterDataRefreshRunning = false;
let isRefreshingReportsInBackground = false;
const ORDER_POLL_INTERVAL = 8000; // ms
const MASTER_DATA_REFRESH_INTERVAL = 120000; // 2 minutos
const ORDER_ERROR_COOLDOWN_MS = 45000; // Evita spamear avisos cuando no hay red
let lastOrderErrorNotificationTs = 0;
let visibilityOrderHandler: (() => void) | null = null;
const REQUEST_TIMEOUT_MS = 12000; // corta llamadas de red colgadas
const ADMIN_RECENT_REPORTS_DAYS = 4;

const serializeOrders = (orders: Order[]) => {
    return JSON.stringify(
        [...orders]
            .map(o => ({
                ...o,
                assignedTechnicians: o.assignedTechnicians?.map(t => t.id).sort() || [],
                // Sort items by id to avoid false positives caused by ordering differences.
                items: (o.items || []).slice().sort((a, b) => a.id.localeCompare(b.id))
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
    );
};

const USER_SESSION_KEY = 'maintenance_app_current_user';
const stableStringifyById = <T extends { id?: string }>(items: T[]) =>
    JSON.stringify([...items].sort((a, b) => `${a.id || ''}`.localeCompare(`${b.id || ''}`)));
const haveArraysChanged = <T extends { id?: string }>(current: T[], incoming: T[]) =>
    stableStringifyById(current) !== stableStringifyById(incoming);
const haveSettingsChanged = (current: AppSettings, incoming: AppSettings) =>
    JSON.stringify(current || {}) !== JSON.stringify(incoming || {});
const isSectionVisible = (section?: HTMLElement | null) => !!section && section.style.display !== 'none';
const getActiveManagementTabId = () => D.adminManagementSection?.querySelector('.tab-link.active')?.getAttribute('data-tab');
const getRecentAdminReportsOptions = () => ({ daysBack: ADMIN_RECENT_REPORTS_DAYS });
const sortReportsByTimestampDesc = (reports: Report[]) =>
    [...reports].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
const mergeReportsForDisplay = (reports: Report[]) => {
    const reportMap = new Map<string, Report>();
    reports.forEach((report) => {
        const key = report.id || (report as any).localId;
        reportMap.set(key, report);
    });
    return sortReportsByTimestampDesc(Array.from(reportMap.values()));
};
const mergeRecentAdminReportsIntoFullDataset = (existingReports: Report[], recentReports: Report[]) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ADMIN_RECENT_REPORTS_DAYS);
    const cutoffTime = cutoff.getTime();
    const olderReports = existingReports.filter(report => new Date(report.timestamp || 0).getTime() < cutoffTime);
    return mergeReportsForDisplay([...recentReports, ...olderReports]);
};

function applyWorkerAppSettings() {
    if (State.currentUser?.role !== 'worker') return;
    if (D.scanQrCameraButton) {
        D.scanQrCameraButton.style.display = State.appSettings['show_qr_camera_button'] ? 'inline-flex' : 'none';
    }
    if (D.searchByIdButton) {
        D.searchByIdButton.style.display = State.appSettings['show_search_by_id_button'] ? 'inline-flex' : 'none';
    }
    if (D.scanQrFromFileButton) {
        D.scanQrFromFileButton.style.display = State.appSettings['show_qr_file_button'] ? 'inline-block' : 'none';
    }
}

async function refreshMasterDataInBackground() {
    if (!State.currentUser || !navigator.onLine) return;
    if (isMasterDataRefreshRunning) return;
    if (document.visibilityState === 'hidden') return;

    isMasterDataRefreshRunning = true;
    try {
        const [
            users,
            appSettingsData,
            cities,
            companies,
            dependencies,
            equipment,
            serviceTypes,
            equipmentTypes,
            refrigerantTypes,
        ] = await Promise.all([
            fetchUsers(),
            fetchAppSettings(),
            fetchCities(),
            fetchCompanies(),
            fetchDependencies(),
            fetchAllEquipment(),
            fetchServiceTypes(),
            fetchEquipmentTypes(),
            fetchRefrigerantTypes(),
        ]);

        const normalizedSettings: AppSettings = {};
        appSettingsData && Object.entries(appSettingsData).forEach(([key, value]) => normalizedSettings[key] = value);

        const usersChanged = haveArraysChanged(State.users, users);
        const citiesChanged = haveArraysChanged(State.cities, cities);
        const companiesChanged = haveArraysChanged(State.companies, companies);
        const dependenciesChanged = haveArraysChanged(State.dependencies, dependencies);
        const equipmentChanged = haveArraysChanged(State.equipmentList, equipment);
        const serviceTypesChanged = haveArraysChanged(State.serviceTypes, serviceTypes);
        const equipmentTypesChanged = haveArraysChanged(State.equipmentTypes, equipmentTypes);
        const refrigerantTypesChanged = haveArraysChanged(State.refrigerantTypes, refrigerantTypes);
        const appSettingsChanged = haveSettingsChanged(State.appSettings, normalizedSettings);

        const cachePromises: Promise<void>[] = [];

        if (usersChanged) {
            State.setUsers(users);
            populateLoginWorkerSelect();
            populateAdminFilterDropdowns();
            populateAdminOrderFilterDropdowns();
            cachePromises.push(cacheAllData('users', users));

            const currentUserFromServer = users.find(u => u.id === State.currentUser?.id);
            if (!currentUserFromServer || !currentUserFromServer.isActive) {
                showAppNotification('Tu usuario fue desactivado o eliminado. Se cerrará la sesión.', 'warning');
                handleLogout();
                return;
            }
            const serializedServerUser = JSON.stringify(currentUserFromServer);
            const serializedLocalUser = JSON.stringify(State.currentUser);
            if (serializedServerUser !== serializedLocalUser) {
                State.setCurrentUser(currentUserFromServer);
                updateUserPointsDisplay(currentUserFromServer.points);
            }
        }

        if (citiesChanged) {
            State.setCities(cities);
            cachePromises.push(cacheAllData('cities', cities));
        }
        if (companiesChanged) {
            State.setCompanies(companies);
            cachePromises.push(cacheAllData('companies', companies));
        }
        if (dependenciesChanged) {
            State.setDependencies(dependencies);
            cachePromises.push(cacheAllData('dependencies', dependencies));
        }
        if (equipmentChanged) {
            State.setEquipmentList(equipment);
            cachePromises.push(cacheAllData('equipment', equipment));
        }
        if (serviceTypesChanged) {
            State.setServiceTypes(serviceTypes);
            cachePromises.push(cacheAllData('service_types', serviceTypes));
        }
        if (equipmentTypesChanged) {
            State.setEquipmentTypes(equipmentTypes);
            cachePromises.push(cacheAllData('equipment_types', equipmentTypes));
        }
        if (refrigerantTypesChanged) {
            State.setRefrigerantTypes(refrigerantTypes);
            cachePromises.push(cacheAllData('refrigerant_types', refrigerantTypes));
        }
        if (appSettingsChanged) {
            State.setAppSettings(normalizedSettings);
            const settingsForCache = Object.entries(normalizedSettings).map(([key, value]) => ({
                key,
                value: value as boolean
            }));
            cachePromises.push(cacheAllData('app_settings', settingsForCache));
            applyWorkerAppSettings();
        }

        if (cachePromises.length > 0) {
            await Promise.allSettled(cachePromises);
        }

        const shouldRefreshAdminFilters = usersChanged || citiesChanged || companiesChanged || dependenciesChanged;

        if (shouldRefreshAdminFilters) {
            populateAdminFilterDropdowns();
            populateAdminOrderFilterDropdowns();
        }

        const adminManagementVisible = isSectionVisible(D.adminManagementSection);
        const activeManagementTab = getActiveManagementTabId();

        if (adminManagementVisible) {
            if (citiesChanged && activeManagementTab === 'cities-tab') {
                renderCitiesTable();
            }
            if (companiesChanged && activeManagementTab === 'companies-tab') {
                renderCompaniesTable();
            }
            if (dependenciesChanged && activeManagementTab === 'dependencies-tab') {
                renderDependenciesTable();
            }
            if (usersChanged && activeManagementTab === 'employees-tab') {
                renderEmployeesTable();
            }
            if (appSettingsChanged && activeManagementTab === 'settings-tab') {
                renderAppSettings();
            }
        }

        if (equipmentChanged) {
            const adminEquipmentSection = document.getElementById('admin-equipment-section');
            const adminScheduleSection = document.getElementById('admin-schedule-section');
            if (isSectionVisible(adminEquipmentSection)) {
                renderAdminEquipmentTable();
            }
            if (isSectionVisible(adminScheduleSection)) {
                renderAdminScheduleTable();
            }
        }

        const adminReportsSection = D.adminReportsTableBody?.closest('section');
        if (citiesChanged || companiesChanged || dependenciesChanged || usersChanged) {
            renderAdminReportsTable();
            await refreshReportsInBackground();
        }

        const adminOrdersSection = D.adminOrdersSection;
        if ((usersChanged || companiesChanged || dependenciesChanged) && isSectionVisible(adminOrdersSection)) {
            renderAdminOrdersList();
        }

        // Refresh admin orders list in background (only for admins, online, and if section is visible)
        if (State.currentUser?.role === 'admin' && navigator.onLine && isSectionVisible(D.adminOrdersSection)) {
            try {
                const latestOrders = await withTimeout(
                    fetchAllEnrichedOrders(State.users, { daysBack: 90, limit: 300 }),
                    REQUEST_TIMEOUT_MS,
                    'órdenes admin (auto refresh)'
                );
                const hasOrderChanges = serializeOrders(State.allServiceOrders) !== serializeOrders(latestOrders);
                if (hasOrderChanges) {
                    State.setAllServiceOrders(latestOrders);
                    cachePromises.push(cacheAllData('orders', latestOrders));
                    if (isSectionVisible(D.adminOrdersSection)) {
                        renderAdminOrdersList();
                    }
                }
            } catch (orderErr) {
                console.error('[Auto Refresh] Error al actualizar órdenes en segundo plano:', orderErr);
            }
        }
    } catch (error) {
        console.error('[Auto Refresh] Error al actualizar catálogos en segundo plano:', error);
    } finally {
        isMasterDataRefreshRunning = false;
    }
}

function startMasterDataAutoRefresh() {
    stopMasterDataAutoRefresh();
    refreshMasterDataInBackground();
    masterDataRefreshIntervalId = window.setInterval(refreshMasterDataInBackground, MASTER_DATA_REFRESH_INTERVAL);
}

function stopMasterDataAutoRefresh() {
    if (masterDataRefreshIntervalId) {
        clearInterval(masterDataRefreshIntervalId);
        masterDataRefreshIntervalId = null;
    }
}

async function refreshAssignedOrdersForWorker(
    user: User,
    options: { notifyOnNew?: boolean; onlyIfChanged?: boolean } = {}
) {
    const { notifyOnNew = false, onlyIfChanged = false } = options;
    try {
        const orders = await fetchAssignedOrders(user.id, State.users);
        const previousOrders = State.assignedOrders;
        const hasChanges = serializeOrders(previousOrders) !== serializeOrders(orders);
        const previousIds = new Set(previousOrders.map(o => o.id));
        const hasNewAssignment = orders.some(o => !previousIds.has(o.id));

        if (onlyIfChanged && !hasChanges) {
            return;
        }

        State.setAssignedOrders(orders);
        State.setAllServiceOrders(orders); // Mantener cache en memoria para offline
        await cacheAllData('orders', orders); // Persistir en IndexedDB para uso offline
        renderAssignedOrdersList();

        if (notifyOnNew && hasNewAssignment) {
            showAppNotification('Nueva asignación de orden recibida.', 'info');
        }
    } catch (error) {
        console.error('[Realtime Orders] Error updating assigned orders:', error);
        const now = Date.now();
        if (now - lastOrderErrorNotificationTs > ORDER_ERROR_COOLDOWN_MS) {
            showAppNotification('No se pudieron actualizar las órdenes asignadas.', 'warning');
            lastOrderErrorNotificationTs = now;
        }
    }
}

function unsubscribeFromOrderRealtime() {
    if (orderRealtimeChannel) {
        orderRealtimeChannel.unsubscribe();
        orderRealtimeChannel = null;
    }
}

function stopOrderPolling() {
    if (orderRefreshIntervalId) {
        clearInterval(orderRefreshIntervalId);
        orderRefreshIntervalId = null;
    }
}

function subscribeToOrderRealtime(user: User) {
    unsubscribeFromOrderRealtime();
    orderRealtimeChannel = supabaseOrders.channel(`worker-orders-${user.id}`)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'order_technicians', filter: `technician_id=eq.${user.id}` },
            async (payload) => {
                console.log('[Realtime Orders] Change detected for technician', user.id, payload);
                await refreshAssignedOrdersForWorker(user, { notifyOnNew: true, onlyIfChanged: true });
            }
        )
        .subscribe((status) => {
            console.log('[Realtime Orders] Channel status:', status);
            if (status === 'SUBSCRIBED') {
                console.log('[Realtime Orders] Listening for assignment changes...');
            }
        });
}

function startOrderPolling(user: User) {
    stopOrderPolling();
    const poll = () => refreshAssignedOrdersForWorker(user, { onlyIfChanged: true });
    // Disparar de inmediato para no depender del siguiente tick.
    poll();
    orderRefreshIntervalId = window.setInterval(poll, ORDER_POLL_INTERVAL);
}

function attachVisibilityOrderRefresh(user: User) {
    if (visibilityOrderHandler) {
        document.removeEventListener('visibilitychange', visibilityOrderHandler);
    }
    visibilityOrderHandler = () => {
        if (document.visibilityState === 'visible') {
            refreshAssignedOrdersForWorker(user, { onlyIfChanged: true });
        }
    };
    document.addEventListener('visibilitychange', visibilityOrderHandler);
}

function detachVisibilityOrderRefresh() {
    if (visibilityOrderHandler) {
        document.removeEventListener('visibilitychange', visibilityOrderHandler);
        visibilityOrderHandler = null;
    }
}

export function checkForPersistedSession() {
    const storedUserJSON = localStorage.getItem(USER_SESSION_KEY);
    if (storedUserJSON) {
        try {
            const storedUser = JSON.parse(storedUserJSON) as User;
            // It's crucial to find the user in the fresh list from the DB
            // to ensure their data (like isActive) is current.
            const userFromState = State.users.find(u => u.id === storedUser.id);
            
            if (userFromState && userFromState.isActive) {
                console.log("Found persisted session. Logging in user automatically.", userFromState);
                handlePostLogin(userFromState);
            } else {
                // User might have been deactivated or deleted. Clear the session.
                console.log("Found persisted session for an inactive/deleted user. Clearing session.");
                localStorage.removeItem(USER_SESSION_KEY);
                hideLoader(); // Hide loader if session was invalid
            }
        } catch (error) {
            console.error("Failed to parse persisted user session:", error);
            localStorage.removeItem(USER_SESSION_KEY);
            hideLoader(); // Hide loader on error
        }
    } else {
        console.log("No persisted session found. Showing login screen.");
        hideLoader(); // Hide loader if no session exists
    }
}

/**
 * Busca los reportes más recientes desde el servidor y actualiza la UI solo si hay cambios.
 * Se ejecuta periódicamente en segundo plano mientras el usuario tenga la sesión iniciada.
 */
async function refreshReportsInBackground() {
    // No hacer nada si no hay un usuario logueado o si no hay conexión a internet.
    if (!State.currentUser || !navigator.onLine || isRefreshingReportsInBackground) {
        return;
    }

    // Evitar trabajo si la vista de reportes de admin no está visible
    if (State.currentUser.role === 'admin') {
        const adminReportsSection = D.adminReportsTableBody?.closest('section');
        if (!isSectionVisible(adminReportsSection)) {
            return;
        }
    }

    isRefreshingReportsInBackground = true;

    try {
        // Pide los reportes correspondientes según el rol del usuario y combina con los que estén en cola local.
        const [latestReports, queuedReports] = await Promise.all([
            State.currentUser.role === 'admin'
                ? await withTimeout(
                    fetchAllReports(getRecentAdminReportsOptions()),
                    REQUEST_TIMEOUT_MS,
                    'reportes admin'
                )
                : await withTimeout(
                    fetchReportsForWorker(State.currentUser.id, State.showAllMyReports ? {} : { daysBack: 4 }),
                    REQUEST_TIMEOUT_MS,
                    'reportes técnico'
                ),
            getAllFromStore('reports_queue'),
        ]);

        // Mantener visibles los reportes pendientes de sincronización (cola local) durante la subida.
        const mergedReports = mergeReportsForDisplay([...(queuedReports as Report[]), ...latestReports]);
        const nextReports = State.currentUser.role === 'admin' && State.shouldUseFullAdminReportsDataset()
            ? mergeRecentAdminReportsIntoFullDataset(State.reports, mergedReports)
            : mergedReports;

        if (State.currentUser.role === 'admin') {
            State.setRecentAdminReportsSnapshot(mergedReports);
        }

        // Optimización: solo refrescar la UI si hubo cambios reales.
        if (JSON.stringify(nextReports) !== JSON.stringify(State.reports)) {
            console.log('[Auto Refresh] Se detectaron cambios en los reportes. Actualizando...');
            State.setReports(nextReports); // Actualizamos el estado global
            
            // Volvemos a renderizar la tabla correspondiente a la vista del usuario.
            if (State.currentUser.role === 'admin') {
                // Solo renderiza si el usuario está en la sección de reportes para evitar trabajo innecesario
                if (D.adminReportsTableBody?.closest('section')?.style.display === 'block') {
                    renderAdminReportsTable();
                }
            } else {
                 if (D.myReportsTableBody?.closest('section')?.style.display === 'block') {
                    renderMyReportsTable();
                }
            }
        }
    } catch (error) {
        // Si hay un error durante la actualización en segundo plano, solo lo mostramos en la consola
        // para no interrumpir al usuario con notificaciones.
        console.error("Error durante la actualización automática de reportes:", error);
    } finally {
        isRefreshingReportsInBackground = false;
    }

    // Sincronizar también las órdenes asignadas del técnico para reflejar nuevas asignaciones o cambios.
    if (State.currentUser?.role === 'worker') {
        await refreshAssignedOrdersForWorker(State.currentUser, { notifyOnNew: true, onlyIfChanged: true });
    }
}

async function handlePostLogin(user: User) {
    State.setCurrentUser(user);
    const userToStore = { ...user };
    delete userToStore.password;
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userToStore));
    UserPrefsManager.applyPrefs();

    showLoader('Cargando datos de sesión...');

    try {
        // ========================================================
        //                 LOGIN COMO TÉCNICO
        // ========================================================
        if (user.role === 'worker') {
            let orders: Order[];
            let reportsForWorker = [];

            showLoader('Cargando sus órdenes...');
            try {
                // Intento online primero
                orders = await withTimeout(
                    fetchAssignedOrders(user.id, State.users),
                    REQUEST_TIMEOUT_MS,
                    'órdenes del técnico'
                );
                // Persistir para disponibilidad offline
                State.setAllServiceOrders(orders);
                await cacheAllData('orders', orders);
            } catch (error: any) {
                // Si el error es por falta de internet → fallback local
                if (error.message && error.message.includes('Failed to fetch')) {
                    console.warn('Online fetch for orders failed. Falling back to local data.');
                    showAppNotification('Sin conexión. Cargando órdenes locales.', 'info');

                    // Usar órdenes cacheadas localmente (o las que queden en memoria)
                    const localOrders = await getAllFromStore('orders');
                    const sourceOrders = (localOrders && localOrders.length > 0) ? localOrders : State.allServiceOrders;
                    orders = sourceOrders.filter(o =>
                        o.assignedTechnicians?.some(t => t.id === user.id)
                    );
                    State.setAllServiceOrders(sourceOrders);
                } else {
                    throw error;
                }
            }

            // Cargar reportes del técnico (online con fallback a cache/cola)
            const loadLocalWorkerReports = async () => {
                const [localReports, queuedReports] = await Promise.all([
                    getAllFromStore('reports'),
                    getAllFromStore('reports_queue')
                ]);
                const combined = [...queuedReports, ...localReports].filter(r => r.workerId === user.id);
                const deduped = Array.from(new Map(combined.map(r => [r.id || (r as any).localId, r])).values());
                return deduped;
            };

            try {
                if (navigator.onLine) {
                    reportsForWorker = await withTimeout(
                        fetchReportsForWorker(user.id, State.showAllMyReports ? {} : { daysBack: 4 }),
                        REQUEST_TIMEOUT_MS,
                        'reportes del técnico'
                    );
                    // Cachear para disponibilidad offline
                    await cacheAllData('reports', reportsForWorker);
                } else {
                    throw new Error('offline');
                }
            } catch (error: any) {
                console.warn('Falling back to local reports for worker login.', error);
                showAppNotification('Sin conexión. Mostrando reportes locales.', 'info');
                reportsForWorker = await loadLocalWorkerReports();
            }

            State.setAssignedOrders(orders);
            State.setReports(reportsForWorker);
            console.log(`Worker login complete. ${orders.length} assigned orders loaded.`);

            renderAssignedOrdersList();
            renderMyReportsTable();
            subscribeToOrderRealtime(user);
            startOrderPolling(user); // Fallback polling for cuando Realtime no está habilitado
            attachVisibilityOrderRefresh(user);

            startAppSession();
            hideLoader();

            const pendingOrders = orders.filter(
                o => o.status !== 'completed' && o.status !== 'cancelada'
            );
            if (pendingOrders.length > 0) {
                showAppNotification(
                    `Tiene ${pendingOrders.length} órdenes de servicio pendientes.`,
                    'info'
                );
            }

            // Fin login técnico
            // ========================================================
        }

        // ========================================================
        //                 LOGIN COMO ADMIN
        // ========================================================
        else if (user.role === 'admin') {

            showLoader('Cargando datos de administrador...');

            try {
                let allReports: Report[] = [];
                let allOrders: Order[] = [];

                if (navigator.onLine) {
                    // Modo online → cargar desde API
                    const [reportsFromApi, ordersFromApi] = await withTimeout(
                        Promise.all([
                            fetchAllReports(State.shouldUseFullAdminReportsDataset() ? {} : getRecentAdminReportsOptions()),
                            fetchAllEnrichedOrders(State.users, { daysBack: 90, limit: 300 })
                        ]),
                        REQUEST_TIMEOUT_MS,
                        'datos de administrador'
                    );
                    allReports = reportsFromApi;
                    allOrders = ordersFromApi;

                    // Mantener cache local actualizado
                    await Promise.all([
                        cacheAllData('reports', reportsFromApi),
                        cacheAllData('orders', ordersFromApi),
                    ]);

                    State.setReports(allReports);
                    if (!State.shouldUseFullAdminReportsDataset()) {
                        State.setRecentAdminReportsSnapshot(allReports);
                    }
                    State.setAllServiceOrders(allOrders);
                    console.log(`Admin login complete. ${allReports.length} reports and ${allOrders.length} orders loaded.`);
                } else {
                    // Sin internet → cargar desde IndexedDB
                    showAppNotification(
                        "Modo sin conexión. Mostrando datos locales.",
                        "info"
                    );

                    const [localReports, localOrders] = await Promise.all([
                        getAllFromStore('reports'),
                        getAllFromStore('orders'),
                    ]);
                    State.setReports(localReports);
                    State.setRecentAdminReportsSnapshot(localReports);
                    State.setAllServiceOrders(localOrders);
                    console.log(`Admin offline login. ${localReports.length} reports and ${localOrders.length} orders loaded.`);
                }
            } catch (error) {
                // Cualquier error online → fallback seguro a datos locales
                console.warn('Online fetch for reports/orders failed. Using local data.', error);
                showAppNotification(
                    'No se pudieron actualizar los reportes u órdenes. Mostrando datos locales.',
                    'info'
                );

                const [localReports, localOrders] = await Promise.all([
                    getAllFromStore('reports'),
                    getAllFromStore('orders'),
                ]);
                State.setReports(localReports);
                State.setRecentAdminReportsSnapshot(localReports);
                State.setAllServiceOrders(localOrders);
            }

            populateAdminFilterDropdowns();
            populateAdminOrderFilterDropdowns();
            renderAdminOrdersList();

            startAppSession();
            hideLoader();

            // Fin login admin
            // ========================================================
        }

        // ========================================================
        //          ACTUALIZACIÓN AUTOMÁTICA DE REPORTES
        // ========================================================
        if (reportRefreshIntervalId) {
            clearInterval(reportRefreshIntervalId);
        }

        const REFRESH_INTERVAL = 45000; // Reducido frecuencia para bajar egress (45s)
        console.log(`[Auth] Iniciando actualización automática de reportes cada ${REFRESH_INTERVAL / 1000}s.`);
        reportRefreshIntervalId = window.setInterval(refreshReportsInBackground, REFRESH_INTERVAL);
        startMasterDataAutoRefresh();

        if (user.role === 'worker') {
            synchronizeQueue().catch(error => {
                console.error('[Auth] Failed to synchronize pending queue after worker login:', error);
            });
        }

    } catch (error) {
        console.error('Failed to load application data after login:', error);
        showAppNotification('Error al cargar los datos. Por favor, intente de nuevo.', 'error');
        handleLogout(); 
    }
}



export function startAppSession() {
    if (!D.loginScreen || !D.appScreen || !D.bottomNav || !D.currentUserDisplay || !State.currentUser || !D.changePasswordActionButton) return;
    D.loginScreen.style.display = 'none';
    D.appScreen.style.display = 'block';
    D.bottomNav.style.display = 'flex';

    document.body.dataset.userRole = State.currentUser.role;

    D.currentUserDisplay.textContent = `${State.currentUser.name || State.currentUser.username}`;

    populateBottomNav(State.currentUser.role);
    updateUserPointsDisplay(State.currentUser.points); // Display points on login


    if (State.currentUser.role === 'admin') {
        D.changePasswordActionButton.style.display = 'inline-flex';
        // Trigger click on the first nav item for admin to load its initial data
        const firstNavItem = D.bottomNav.querySelector('.nav-item') as HTMLButtonElement | null;
        firstNavItem?.click();
    } else { // Worker
        D.changePasswordActionButton.style.display = 'none';
        // Trigger click on the first nav item for worker
        const firstNavItem = D.bottomNav.querySelector('.nav-item') as HTMLButtonElement | null;
        firstNavItem?.click();
    }
}

export async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    if (!D.usernameInput || !D.passwordInput || !D.loginError) return;
    D.loginError.textContent = '';

    const userId = D.usernameInput.value;
    const password = D.passwordInput.value; // This is the cedula

    if (!userId) {
        D.loginError.textContent = 'Por favor, seleccione su nombre.';
        return;
    }

    const user = State.users.find(u => u.id === userId);

    if (user && user.password === password) {
        if (user.isActive) {
            await handlePostLogin(user);
        } else {
            D.loginError.textContent = 'Este usuario está inactivo. Contacte al administrador.';
        }
    } else {
        D.loginError.textContent = 'Contraseña (cédula) incorrecta.';
    }
}

export function handleLogout() {
    // Detiene el temporizador de actualización automática al cerrar sesión.
    if (reportRefreshIntervalId) {
        console.log('[Auth] Deteniendo actualización automática de reportes.');
        clearInterval(reportRefreshIntervalId);
        reportRefreshIntervalId = null;
    }
    stopMasterDataAutoRefresh();
    unsubscribeFromOrderRealtime();
    stopOrderPolling();
    detachVisibilityOrderRefresh();
    State.setShowAllAdminReports(false);
    State.setIsUsingFullAdminReportsDataset(false);
    State.setRecentAdminReportsSnapshot([]);
    State.setCurrentUser(null);
     State.setReports([]);          // ← ← ← FIX CRÍTICO
    State.setAssignedOrders([]); // Clear orders on logout
    State.setAllServiceOrders([]);
    localStorage.removeItem(USER_SESSION_KEY);
    if (D.loginScreen) D.loginScreen.style.display = 'flex';
    if (D.appScreen) D.appScreen.style.display = 'none';
    if (D.bottomNav) D.bottomNav.style.display = 'none';
    if (D.loginForm) D.loginForm.reset();
    document.body.removeAttribute('data-user-role');
}

export function openAdminPasswordModal() {
    if (!D.adminPasswordModal) return;
    D.adminPasswordModal.style.display = 'flex';
    if (D.adminPasswordInput) {
        D.adminPasswordForm.reset();
        D.adminPasswordError.textContent = '';
        setTimeout(() => D.adminPasswordInput.focus(), 100); // Focus after transition
    }
}

export async function handleAdminPasswordSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!D.adminPasswordInput || !D.adminPasswordError) return;

    showLoader("Verificando conexión...");
    const isOnline = await checkOnlineStatus();
    hideLoader();

    if (!isOnline) {
        D.adminPasswordError.textContent = 'Se requiere conexión a internet para el acceso de administrador.';
        showAppNotification('El acceso de administrador requiere una conexión a internet activa.', 'warning');
        return; // Stop the login process
    }

    const password = D.adminPasswordInput.value;
    const adminUser = State.users.find(u => u.username === 'admin' && u.password === password);

    if (adminUser) {
        closeAdminPasswordModal();
        await handlePostLogin(adminUser);
    } else {
        if (D.adminPasswordError) D.adminPasswordError.textContent = 'Contraseña de administrador incorrecta.';
    }
}

export function closeAdminPasswordModal() {
    if (D.adminPasswordModal) D.adminPasswordModal.style.display = 'none';
}


export function openChangePasswordModal() {
    if (!D.changePasswordModal || !D.changePasswordForm || !State.currentUser || State.currentUser.role !== 'admin') return;
    D.changePasswordForm.reset();
    if (D.changePasswordError) D.changePasswordError.textContent = '';
    D.changePasswordModal.style.display = 'flex';
}

export async function handleChangePasswordSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!State.currentUser || State.currentUser.role !== 'admin' || !D.changePasswordError) return;

    const currentPassword = D.currentPasswordInput.value;
    const newPassword = D.newPasswordInput.value;
    const confirmPassword = D.confirmNewPasswordInput.value;

    if (currentPassword !== State.currentUser.password) {
        D.changePasswordError.textContent = 'La contraseña actual es incorrecta.';
        return;
    }
    if (newPassword.length < 6) {
        D.changePasswordError.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
        return;
    }
    if (newPassword !== confirmPassword) {
        D.changePasswordError.textContent = 'Las nuevas contraseñas no coinciden.';
        return;
    }

    showLoader("Cambiando contraseña...");
    const { error } = await supabaseOrders.from('maintenance_users').update({ password: newPassword }).eq('id', State.currentUser.id);
    hideLoader();

    if (error) {
        D.changePasswordError.textContent = `Error al actualizar: ${error.message}`;
        showAppNotification('Error al cambiar contraseña.', 'error');
    } else {
        // Update local user object
        const updatedUser = { ...State.currentUser, password: newPassword };
        State.setCurrentUser(updatedUser);
        
        // Update persisted session data
        const userToStore = { ...updatedUser };
        delete userToStore.password;
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userToStore));

        showAppNotification('Contraseña cambiada con éxito.', 'success');
        closeChangePasswordModal();
    }
}

export function closeChangePasswordModal() {
    if (D.changePasswordModal) D.changePasswordModal.style.display = 'none';
}
