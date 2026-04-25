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
    cityId: string;
}

export interface Dependency {
    id: string;
    name: string;
    companyId: string;
}

export interface Report {
    id: string;
    timestamp: string; // ISO date string
    serviceType: string;
    observations: string | null;
    equipmentSnapshot: { // Snapshot of equipment details at the time of report
        id: string; // Original equipment ID
        manualId?: string | null; // Manual ID at the time of report
        model: string;
        brand: string;
        type: string;
        capacity?: string;
        refrigerant?: string | null;
        category?: 'empresa' | 'residencial' | string;
        address?: string | null;
        client_name?: string | null;
        companyName?: string; // Denormalized for display
        dependencyName?: string; // Denormalized for display
        sedeName?: string | null; // Denormalized for display
    };
    itemsSnapshot: { description: string; quantity: number }[] | null;
    cityId: string;
    companyId: string | null;
    dependencyId: string | null;
    workerId: string; 
    workerName: string; 
    clientSignature?: string | null;
    pressure: string | null;
    amperage: string | null;
    is_paid: boolean;
    photo_internal_unit_url?: string | null;
    photo_external_unit_url?: string | null;
    orderId?: string | null;
}
