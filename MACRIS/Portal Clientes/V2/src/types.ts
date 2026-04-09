export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface City {
  id: string;
  name: string;
}

export interface Company {
  id: string;
  name: string;
  cityId?: string;
}

export interface Dependency {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  manualId?: string | null;
}

export interface Equipment {
  id: string;
  manualId: string | null;
  model: string;
  brand: string;
  type: string | null;
  companyId: string | null;
  dependencyId: string | null;
  dependencyName?: string | null;
  companyName?: string | null;
}

export interface Report {
  id: string;
  timestamp: string;
  serviceType: string;
  observations: string | null;
  equipmentSnapshot: {
    id: string;
    manualId?: string | null;
    model: string;
    brand: string;
    type: string;
    capacity?: string | null;
    refrigerant?: string | null;
    category?: string | null;
    address?: string | null;
    client_name?: string | null;
    companyName?: string | null;
    dependencyName?: string | null;
  };
  itemsSnapshot: { description: string; quantity: number }[] | null;
  cityId?: string | null;
  companyId: string | null;
  dependencyId: string | null;
  workerName: string;
  pressure: string | null;
  amperage: string | null;
  clientSignature?: string | null;
  photo_internal_unit_url?: string | null;
  photo_external_unit_url?: string | null;
  orderId?: string | null;
}
