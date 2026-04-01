import type { User, City, Company, Dependency, Equipment, Report, PaginationState, MaintenanceTableKey, EntityType, Order, ServiceType, AppSettings, EquipmentType, RefrigerantType } from './types';

// --- App State ---
export let currentUser: User | null = null;
export let users: User[] = [];
export let equipmentList: Equipment[] = [];
export let cities: City[] = [];
export let companies: Company[] = [];
export let dependencies: Dependency[] = [];
export let reports: Report[] = [];
export let serviceTypes: ServiceType[] = [];
export let equipmentTypes: EquipmentType[] = [];
export let refrigerantTypes: RefrigerantType[] = [];
export let appSettings: AppSettings = {};
export let currentReportSignatureDataUrl: string | null = null;
export let isSignaturePadDirty = false;
export let reportIdForSignatureUpdate: string | null = null;
export let currentReportPhotoInternalBase64: string | null = null;
export let currentReportPhotoExternalBase64: string | null = null;
export let currentPhotoCaptureType: 'internal' | 'external' | null = null;
export let contextForPhotoUpdate: { reportId: string, photoType: 'internal' | 'external' } | null = null;
export let aiScanTargetForm: 'report' | 'equipment' | null = null;
export let showAllMyReports = false;
export let showAllAdminReports = false;
export let isUsingFullAdminReportsDataset = false;
export let recentAdminReportsSnapshot: Report[] = [];

// New flags for on-demand loading of heavy data
export let isScheduleDataLoaded: boolean = false;
export let isAllAdminDataLoadedForHeavyTasks: boolean = false;


export let entityFormContext: {
    source: 'reportForm' | 'entityForm' | 'equipmentSelectionModal';
    entityType?: EntityType;
    selectedCompanyId?: string;
    originalEntityId?: string;
} | null = null;

export let editLocationState: {
    originalReport: Report | null;
    newDependencyNameToCreate: string | null;
} = {
    originalReport: null,
    newDependencyNameToCreate: null,
};

export let assignedOrders: Order[] = [];
export let allServiceOrders: Order[] = [];
export let orderToReportOn: Order | null = null;


export let manualReportCreationState: { 
    category: 'empresa' | 'residencial' | null;
    nextAction: 'manual' | 'search' | 'fromOrder' | null 
} = { category: null, nextAction: null };

export const tablePaginationStates: Record<MaintenanceTableKey, PaginationState> = {
    // FIX: Added missing 'totalItems' property to satisfy PaginationState type.
    myReports: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    adminReports: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    adminSchedule: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    adminEquipment: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    // FIX: Added missing 'totalItems' property to satisfy PaginationState type.
    adminCities: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    // FIX: Added missing 'totalItems' property to satisfy PaginationState type.
    adminCompanies: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    // FIX: Added missing 'totalItems' property to satisfy PaginationState type.
    adminDependencies: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    // FIX: Added missing 'totalItems' property to satisfy PaginationState type.
    adminEmployees: { currentPage: 1, itemsPerPage: 10, totalItems: 0 },
    adminOrders: { currentPage: 1, itemsPerPage: 6, totalItems: 0 },
};

export const tableSearchTerms: Record<MaintenanceTableKey, string> = {
    myReports: '',
    adminReports: '',
    adminSchedule: '',
    adminEquipment: '',
    adminCities: '',
    adminCompanies: '',
    adminDependencies: '',
    adminEmployees: '',
    adminOrders: '',
};

// --- localStorage Keys ---
export const DATA_VERSION_KEY = 'maintenance_data_version';
export const CURRENT_DATA_VERSION = '1.9_full_local_reset';

// --- State Setters ---
export function setCurrentUser(user: User | null) {
    currentUser = user;
}
export function setUsers(newUsers: User[]) {
    users = newUsers;
}
export function setEquipmentList(newEquipmentList: Equipment[]) {
    equipmentList = newEquipmentList;
}
export function setCities(newCities: City[]) {
    cities = newCities;
}
export function setCompanies(newCompanies: Company[]) {
    companies = newCompanies;
}
export function setDependencies(newDependencies: Dependency[]) {
    dependencies = newDependencies;
}
export function setReports(newReports: Report[]) {
    reports = newReports;
}
export function setServiceTypes(newServiceTypes: ServiceType[]) {
    serviceTypes = newServiceTypes;
}
export function setEquipmentTypes(newEquipmentTypes: EquipmentType[]) {
    equipmentTypes = newEquipmentTypes;
}
export function setRefrigerantTypes(newRefrigerantTypes: RefrigerantType[]) {
    refrigerantTypes = newRefrigerantTypes;
}
export function setAppSettings(settings: AppSettings) {
    appSettings = settings;
}
export function setCurrentReportSignatureDataUrl(url: string | null) {
    currentReportSignatureDataUrl = url;
}
export function setIsSignaturePadDirty(dirty: boolean) {
    isSignaturePadDirty = dirty;
}
export function setReportIdForSignatureUpdate(reportId: string | null) {
    reportIdForSignatureUpdate = reportId;
}
export function setCurrentReportPhotoInternalBase64(base64: string | null) {
    currentReportPhotoInternalBase64 = base64;
}
export function setCurrentReportPhotoExternalBase64(base64: string | null) {
    currentReportPhotoExternalBase64 = base64;
}
export function setCurrentPhotoCaptureType(type: 'internal' | 'external' | null) {
    currentPhotoCaptureType = type;
}
export function setContextForPhotoUpdate(context: typeof contextForPhotoUpdate) {
    contextForPhotoUpdate = context;
}
export function setAiScanTargetForm(target: 'report' | 'equipment' | null) {
    aiScanTargetForm = target;
}
export function setShowAllMyReports(show: boolean) {
    showAllMyReports = show;
}
export function setShowAllAdminReports(show: boolean) {
    showAllAdminReports = show;
}
export function setIsUsingFullAdminReportsDataset(useFull: boolean) {
    isUsingFullAdminReportsDataset = useFull;
}
export function setRecentAdminReportsSnapshot(newReports: Report[]) {
    recentAdminReportsSnapshot = [...newReports];
}
export function shouldUseFullAdminReportsDataset() {
    return showAllAdminReports || isUsingFullAdminReportsDataset;
}
export function setIsAllAdminDataLoadedForHeavyTasks(loaded: boolean) {
    isAllAdminDataLoadedForHeavyTasks = loaded;
}


export function setEntityFormContext(context: typeof entityFormContext) {
    entityFormContext = context;
}
export function setEditLocationState(state: typeof editLocationState) {
    editLocationState = state;
}

export function setAssignedOrders(newOrders: Order[]) {
    assignedOrders = newOrders;
}

export function setAllServiceOrders(newOrders: Order[]) {
    allServiceOrders = newOrders;
}
export function setOrderToReportOn(order: Order | null) {
    orderToReportOn = order;
}

export function updateOrderInState(orderId: string, updates: Partial<Order>) {
    assignedOrders = assignedOrders.map(o => o.id === orderId ? { ...o, ...updates } : o);
    allServiceOrders = allServiceOrders.map(o => o.id === orderId ? { ...o, ...updates } : o);
}

export function setManualReportCreationState(state: typeof manualReportCreationState | null) {
    if (state) {
        manualReportCreationState = state;
    } else {
        manualReportCreationState = { category: null, nextAction: null };
    }
}

export function setTableSearchTerm(key: MaintenanceTableKey, term: string) {
    tableSearchTerms[key] = term;
}

// --- Auto Logout for Admin when offline ---
import * as UI from './ui';

export async function autoLogoutAdmin() {
  if (currentUser && currentUser.role === 'admin') {
    console.warn('[AutoLogout] Admin desconectado, cerrando sesión automáticamente.');

    // 🔹 Limpiar usuario y sesión
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('auth_token');

    // 🔹 Mostrar notificación
    UI.showAppNotification('Sesión cerrada: conexión perdida.', 'warning');

    // 🔹 Esperar un poco por seguridad (DOM estable)
    setTimeout(() => {
      const loginScreen = document.getElementById('login-screen');
      const appScreen = document.getElementById('app-screen');
      const bottomNav = document.getElementById('bottom-nav');

      if (loginScreen && appScreen) {
        appScreen.style.display = 'none';
        loginScreen.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'none';
        console.log('[AutoLogout] Vista cambiada correctamente a pantalla de login.');
      } else {
        console.error('[AutoLogout] No se encontraron los elementos del DOM, recargando app...');
        setTimeout(() => window.location.reload(), 1000);
      }
    }, 400);
  }
}
