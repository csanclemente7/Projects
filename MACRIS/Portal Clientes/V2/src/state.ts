import type { City, Company, Equipment, Report } from './types';

export let cities: City[] = [];
export let companies: Company[] = [];
export let equipmentList: Equipment[] = [];
export let adminEquipmentList: Equipment[] = [];
export let reports: Report[] = [];
export let currentCompany: Company | null = null;
export let currentAccessCode: string | null = null;
export let adminSessionActive = false;
export let reportsPagination = { currentPage: 1, itemsPerPage: 10 };
export let reportsSearchTerm = '';
export let reportsDateRange = { start: '', end: '' };
export let equipmentPagination = { currentPage: 1, itemsPerPage: 10 };
export let equipmentSearchTerm = '';
export let adminEquipmentPagination = { currentPage: 1, itemsPerPage: 12 };
export let adminEquipmentSearchTerm = '';
export let adminCompanySearchTerm = '';

export function setCities(value: City[]) {
  cities = value;
}

export function setCompanies(value: Company[]) {
  companies = value;
}

export function setEquipmentList(value: Equipment[]) {
  equipmentList = value;
}

export function setAdminEquipmentList(value: Equipment[]) {
  adminEquipmentList = value;
}

export function setReports(value: Report[]) {
  reports = value;
}

export function setCurrentCompany(value: Company | null) {
  currentCompany = value;
}

export function setCurrentAccessCode(value: string | null) {
  currentAccessCode = value;
}

export function setAdminSessionActive(value: boolean) {
  adminSessionActive = value;
}

export function setReportsSearchTerm(value: string) {
  reportsSearchTerm = value;
}

export function setReportsDateStart(value: string) {
  reportsDateRange = { ...reportsDateRange, start: value };
}

export function setReportsDateEnd(value: string) {
  reportsDateRange = { ...reportsDateRange, end: value };
}

export function resetReportsDateRange() {
  reportsDateRange = { start: '', end: '' };
}

export function setEquipmentSearchTerm(value: string) {
  equipmentSearchTerm = value;
}

export function setAdminEquipmentSearchTerm(value: string) {
  adminEquipmentSearchTerm = value;
}

export function setAdminCompanySearchTerm(value: string) {
  adminCompanySearchTerm = value;
}

export function resetReportsPagination() {
  reportsPagination.currentPage = 1;
}

export function resetEquipmentPagination() {
  equipmentPagination.currentPage = 1;
}

export function resetAdminEquipmentPagination() {
  adminEquipmentPagination.currentPage = 1;
}
