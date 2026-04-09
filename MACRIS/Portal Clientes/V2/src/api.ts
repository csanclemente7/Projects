import { createClient } from '@supabase/supabase-js';
import type { City, Company, Equipment, Report } from './types';

const ORDERS_SUPABASE_URL = 'https://fzcalgofrhbqvowazdpk.supabase.co';
const ORDERS_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o';

export const supabaseOrders = createClient(ORDERS_SUPABASE_URL, ORDERS_SUPABASE_ANON_KEY);

const REPORT_LIST_COLUMNS = 'id,timestamp,service_type,observations,equipment_snapshot,items_snapshot,city_id,company_id,dependency_id,worker_name,pressure,amperage,order_id';
const EQUIPMENT_LIST_COLUMNS = 'id,manual_id,model,brand,type,company_id,dependency_id,company:maintenance_companies(name),dependency:maintenance_dependencies(name)';

const mapReport = (dbReport: any): Report => ({
  id: dbReport.id,
  timestamp: dbReport.timestamp,
  serviceType: dbReport.service_type,
  observations: dbReport.observations,
  equipmentSnapshot: dbReport.equipment_snapshot as Report['equipmentSnapshot'],
  itemsSnapshot: (dbReport.items_snapshot as Report['itemsSnapshot']) || null,
  cityId: dbReport.city_id,
  companyId: dbReport.company_id,
  dependencyId: dbReport.dependency_id,
  workerName: dbReport.worker_name,
  pressure: dbReport.pressure,
  amperage: dbReport.amperage,
  orderId: dbReport.order_id,
});

const mapEquipment = (dbEquipment: any): Equipment => ({
  id: dbEquipment.id,
  manualId: dbEquipment.manual_id?.trim() || null,
  model: dbEquipment.model,
  brand: dbEquipment.brand,
  type: dbEquipment.type || null,
  companyId: dbEquipment.company_id,
  dependencyId: dbEquipment.dependency_id,
  dependencyName: dbEquipment.dependency?.name || null,
  companyName: dbEquipment.company?.name || null,
});

export async function fetchCities(): Promise<City[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_cities')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching cities:', error);
    throw error;
  }

  return (data || []).map((city: any) => ({
    id: city.id,
    name: city.name,
  }));
}

export async function fetchCompanies(): Promise<Company[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_companies')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching companies:', error);
    throw error;
  }

  return (data || []).map((company: any) => ({
    id: company.id,
    name: company.name,
    cityId: company.city_id,
  }));
}

export async function fetchEquipmentForCompany(companyId: string): Promise<Equipment[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_equipment')
    .select(EQUIPMENT_LIST_COLUMNS)
    .eq('company_id', companyId)
    .order('manual_id');

  if (error) {
    console.error('Error fetching equipment for company:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];
  return data.map(mapEquipment);
}

export async function fetchAllEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_equipment')
    .select(EQUIPMENT_LIST_COLUMNS)
    .order('manual_id');

  if (error) {
    console.error('Error fetching equipment list:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];
  return data.map(mapEquipment);
}

export async function fetchReportsForCompany(companyId: string): Promise<Report[]> {
  const { data, error } = await supabaseOrders
    .from('maintenance_reports')
    .select(REPORT_LIST_COLUMNS)
    .eq('company_id', companyId);

  if (error) {
    console.error('Error fetching reports for company:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];
  return data.map(mapReport);
}

export async function fetchReportDetails(reportId: string): Promise<{
  client_signature: string | null;
  photo_internal_unit_url: string | null;
  photo_external_unit_url: string | null;
}> {
  const { data, error } = await supabaseOrders
    .from('maintenance_reports')
    .select('client_signature, photo_internal_unit_url, photo_external_unit_url')
    .eq('id', reportId)
    .single();

  if (error) {
    console.error('Error fetching report details:', error);
    throw error;
  }

  return data;
}

export async function validateAdminPassword(pin: string): Promise<boolean> {
  const { data, error } = await supabaseOrders
    .from('maintenance_users')
    .select('password, is_active')
    .eq('username', 'admin')
    .single();

  if (error) {
    console.error('Error validating admin password:', error);
    return false;
  }

  if (!data || data.is_active === false) return false;
  return data.password === pin;
}
