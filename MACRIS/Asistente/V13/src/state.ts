
import type { Report, User, City, Company, ServiceType, EquipmentType, Dependency, Order, Equipment, RefrigerantType } from './types';
import { fuzzyNormalize } from './utils';

// Standard lookup data
export let reports: Report[] = [];
export let filteredReports: Report[] = [];
export let users: User[] = [];
export let cities: City[] = [];
export let companies: Company[] = [];
export let dependencies: Dependency[] = [];
export let serviceTypes: ServiceType[] = [];
export let equipmentTypes: EquipmentType[] = [];
export let refrigerantTypes: RefrigerantType[] = [];
export let historicalCompanyNames: string[] = []; // Nombres únicos de snapshots históricos

// Pagination State
export let currentPage = 0;
export const itemsPerPage = 50;
export let totalReportsCount = 0;

// Session and context
export let currentUser: User | null = null;
export let assignedOrders: Order[] = [];
export let allServiceOrders: Order[] = [];
export let equipmentList: Equipment[] = [];
export let showAllMyReports = false;

// AI Chat State
export type ChatHistoryEntry = {
    role: 'user' | 'model';
    parts: { text: string }[];
};

export let chatHistory: ChatHistoryEntry[] = [];

// UI State flags
export let entityFormContext: any = null;
export let manualReportCreationState: any = {};
export let currentReportSignatureDataUrl: string | null = null;
export let currentReportPhotoInternalBase64: string | null = null;
export let currentReportPhotoExternalBase64: string | null = null;
export let editLocationState: any = { newDependencyNameToCreate: null };
export let contextForPhotoUpdate: { reportId: string, photoType: 'internal' | 'external' } | null = null;

export const appSettings: { [key: string]: boolean } = {};

export const tableSearchTerms = {
    myReports: '',
    adminReports: '',
    adminOrders: '',
    adminEquipment: '',
};

export interface FilterState {
    global: string;
    dateStart: string;
    dateEnd: string;
    cityId: string;
    companyId: string | string[];
    techId: string;
    serviceType: string;
    eqType: string;
    paid: string | boolean;
}

export const filters: FilterState = {
    global: '',
    dateStart: '',
    dateEnd: '',
    cityId: '',
    companyId: [] as string[],
    techId: '',
    serviceType: '',
    eqType: '',
    paid: ''
};

// --- Setters ---

export function setCurrentPage(page: number) { currentPage = page; }
export function setTotalReportsCount(count: number) { totalReportsCount = count; }

export function setChatHistory(history: ChatHistoryEntry[]) {
    chatHistory = history;
}

export function resetFiltersToDefault() {
    filters.global = '';
    filters.dateStart = '';
    filters.dateEnd = '';
    filters.cityId = '';
    filters.companyId = [];
    filters.techId = '';
    filters.serviceType = '';
    filters.eqType = '';
    filters.paid = '';
    currentPage = 0;
    applyFilters();
}

export function setEntityFormContext(ctx: any) { entityFormContext = ctx; }

export function setReports(data: Report[], total?: number) {
    reports = data;
    if (total !== undefined) totalReportsCount = total;
    filteredReports = [...data];
}

export function setUsers(data: User[]) { users = data; }
export function setCurrentUser(user: User | null) { currentUser = user; }
export function setAssignedOrders(orders: Order[]) { assignedOrders = orders; }
export function setAllServiceOrders(orders: Order[]) { allServiceOrders = orders; }
export function setEquipmentList(list: Equipment[]) { equipmentList = list; }
export function setCities(data: City[]) { cities = data; }
export function setCompanies(data: Company[]) { companies = data; }
export function setDependencies(data: Dependency[]) { dependencies = data; }
export function setEquipmentTypes(data: EquipmentType[]) { equipmentTypes = data; }
export function setRefrigerantTypes(data: RefrigerantType[]) { refrigerantTypes = data; }
export function setHistoricalCompanyNames(names: string[]) { historicalCompanyNames = names; }
export function setShowAllMyReports(val: boolean) { showAllMyReports = val; }
export function setTableSearchTerm(table: keyof typeof tableSearchTerms, term: string) { tableSearchTerms[table] = term; }
export function setContextForPhotoUpdate(ctx: typeof contextForPhotoUpdate) { contextForPhotoUpdate = ctx; }

export function updateOrderInState(orderId: string, updates: Partial<Order>) {
    const o1 = assignedOrders.find(o => o.id === orderId);
    if (o1) Object.assign(o1, updates);
    const o2 = allServiceOrders.find(o => o.id === orderId);
    if (o2) Object.assign(o2, updates);
}

export function setLookupData(data: { users: User[], cities: City[], companies: Company[], serviceTypes: ServiceType[], equipmentTypes: EquipmentType[] }) {
    users = data.users;
    cities = data.cities;
    companies = data.companies;
    serviceTypes = data.serviceTypes;
    equipmentTypes = data.equipmentTypes;
}

export function updateFilter(key: keyof FilterState, value: any) {
    (filters as any)[key] = value;
    currentPage = 0; 
    applyFilters();
}

export function updateFilters(newFilters: Partial<FilterState>) {
    Object.assign(filters, newFilters);
    currentPage = 0;
    applyFilters();
}

export function applyFilters() {
    filteredReports = [...reports];
}
