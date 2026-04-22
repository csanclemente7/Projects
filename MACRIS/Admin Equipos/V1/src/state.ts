import type { User, City, Company, Sede, Dependency, Equipment, Report, PaginationState, MaintenanceTableKey, EntityType, Order, ServiceType, AppSettings, EquipmentType, RefrigerantType } from './types';

// --- App State ---
export let currentUser: User | null = null;
export let users: User[] = [];
export let equipmentList: Equipment[] = [];
export let cities: City[] = [];
export let companies: Company[] = [];
export let sedes: Sede[] = [];
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
    myReports: { currentPage: 1, itemsPerPage: 10 },
    adminReports: { currentPage: 1, itemsPerPage: 10 },
    adminSchedule: { currentPage: 1, itemsPerPage: 10 },
    adminEquipment: { currentPage: 1, itemsPerPage: 20 },
    adminCities: { currentPage: 1, itemsPerPage: 10 },
    adminCompanies: { currentPage: 1, itemsPerPage: 10 },
    adminSedes: { currentPage: 1, itemsPerPage: 10 },
    adminDependencies: { currentPage: 1, itemsPerPage: 10 },
    adminEmployees: { currentPage: 1, itemsPerPage: 10 },
    adminOrders: { currentPage: 1, itemsPerPage: 6 },
};

export const tableSearchTerms: Record<MaintenanceTableKey, string> = {
    myReports: '',
    adminReports: '',
    adminSchedule: '',
    adminEquipment: '',
    adminCities: '',
    adminCompanies: '',
    adminSedes: '',
    adminDependencies: '',
    adminEmployees: '',
    adminOrders: '',
};

// --- localStorage Keys ---
export const DATA_VERSION_KEY = 'maintenance_data_version';
export const CURRENT_DATA_VERSION = '1.8_db_types';

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
export function setSedes(newSedes: Sede[]) {
    sedes = newSedes;
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
