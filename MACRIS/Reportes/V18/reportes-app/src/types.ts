export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ClientsDatabase = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          created_at?: string;
          name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          city: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          city?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          name?: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          city?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
};

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          value: boolean;
          description: string | null;
          created_at: string;
        };
        Insert: {
          key: string;
          value: boolean;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          key?: string;
          value?: boolean;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      maintenance_cities: {
        Row: { id: string; name: string; created_at?: string; };
        Insert: { id?: string; name: string; created_at?: string; };
        Update: { id?: string; name?: string; created_at?: string; };
        Relationships: [];
      };
      maintenance_companies: {
        Row: { id: string; name: string; city_id: string; client_id: string | null; category: string | null; created_at?: string; };
        Insert: { id?: string; name: string; city_id: string; client_id?: string | null; category?: string | null; created_at?: string; };
        Update: { id?: string; name?: string; city_id?: string; client_id?: string | null; category?: string | null; created_at?: string; };
        Relationships: [];
      };
      maintenance_dependencies: {
        Row: { id: string; name: string; company_id: string; sede_id: string | null; client_id: string | null; created_at?: string; };
        Insert: { id?: string; name: string; company_id: string; sede_id?: string | null; client_id?: string | null; created_at?: string; };
        Update: { id?: string; name?: string; company_id?: string; sede_id?: string | null; client_id?: string | null; created_at?: string; };
        Relationships: [];
      };
      maintenance_equipment: {
        Row: {
          id: string;
          created_at?: string;
          manual_id: string | null;
          model: string;
          brand: string;
          type: string;
          equipment_type_id: string | null;
          refrigerant_type_id: string | null;
          capacity: string | null;
          city_id: string;
          company_id: string | null;
          dependency_id: string | null;
          periodicity_months: number;
          last_maintenance_date: string | null;
          category: string;
          address: string | null;
          client_name: string | null;
          sede_id: string | null;
          client_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          manual_id?: string | null;
          model: string;
          brand: string;
          type: string;
          equipment_type_id?: string | null;
          refrigerant_type_id?: string | null;
          capacity?: string | null;
          city_id: string;
          company_id?: string | null;
          dependency_id?: string | null;
          periodicity_months: number;
          last_maintenance_date?: string | null;
          category?: string;
          address?: string | null;
          client_name?: string | null;
          sede_id?: string | null;
          client_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          manual_id?: string | null;
          model?: string;
          brand?: string;
          type?: string;
          equipment_type_id?: string | null;
          refrigerant_type_id?: string | null;
          capacity?: string | null;
          city_id?: string;
          company_id?: string | null;
          dependency_id?: string | null;
          periodicity_months?: number;
          last_maintenance_date?: string | null;
          category?: string;
          address?: string | null;
          client_name?: string | null;
          sede_id?: string | null;
          client_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "maintenance_equipment_equipment_type_id_fkey"
            columns: ["equipment_type_id"]
            referencedRelation: "maintenance_equipment_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_equipment_refrigerant_type_id_fkey"
            columns: ["refrigerant_type_id"]
            referencedRelation: "maintenance_refrigerant_types"
            referencedColumns: ["id"]
          }
        ];
      };
      maintenance_reports: {
        Row: {
          id: string;
          timestamp: string;
          service_type: string;
          observations: string | null;
          equipment_snapshot: Json;
          items_snapshot: Json | null;
          city_id: string;
          company_id: string | null;
          dependency_id: string | null;
          worker_id: string;
          worker_name: string;
          client_signature: string | null;
          pressure: string | null;
          amperage: string | null;
          is_paid: boolean;
          photo_internal_unit_url: string | null;
          photo_external_unit_url: string | null;
          order_id: string | null;
          sede_id: string | null;
          client_id: string | null;
        };
        Insert: {
          id?: string;
          timestamp: string;
          service_type: string;
          observations?: string | null;
          equipment_snapshot: Json;
          items_snapshot?: Json | null;
          city_id: string;
          company_id?: string | null;
          dependency_id?: string | null;
          worker_id: string;
          worker_name: string;
          client_signature?: string | null;
          pressure?: string | null;
          amperage?: string | null;
          is_paid?: boolean;
          photo_internal_unit_url?: string | null;
          photo_external_unit_url?: string | null;
          order_id?: string | null;
          sede_id?: string | null;
          client_id?: string | null;
        };
        Update: {
          id?: string;
          timestamp?: string;
          service_type?: string;
          observations?: string | null;
          equipment_snapshot?: Json;
          items_snapshot?: Json | null;
          city_id?: string;
          company_id?: string | null;
          dependency_id?: string | null;
          worker_id?: string;
          worker_name?: string;
          client_signature?: string | null;
          pressure?: string | null;
          amperage?: string | null;
          is_paid?: boolean;
          photo_internal_unit_url?: string | null;
          photo_external_unit_url?: string | null;
          order_id?: string | null;
          sede_id?: string | null;
          client_id?: string | null;
        };
        Relationships: [];
      };
      maintenance_users: {
        Row: {
          id: string;
          username: string;
          password?: string;
          role: "admin" | "worker";
          name: string | null;
          cedula: string | null;
          is_active: boolean | null;
          points: number | null;
        };
        Insert: {
          id?: string;
          username: string;
          password: string;
          role: "admin" | "worker";
          name?: string | null;
          cedula?: string | null;
          is_active?: boolean | null;
          points?: number | null;
        };
        Update: {
          id?: string;
          username?: string;
          password?: string;
          role?: "admin" | "worker";
          name?: string | null;
          cedula?: string | null;
          is_active?: boolean | null;
          points?: number | null;
        };
        Relationships: [];
      };
       maintenance_equipment_types: {
        Row: { id: string; name: string; created_at?: string; };
        Insert: { id?: string; name: string; created_at?: string; };
        Update: { id?: string; name?: string; created_at?: string; };
        Relationships: [];
      };
      maintenance_refrigerant_types: {
        Row: { id: string; name: string; created_at?: string; };
        Insert: { id?: string; name: string; created_at?: string; };
        Update: { id?: string; name?: string; created_at?: string; };
        Relationships: [];
      };
      service_types: {
        Row: { id: string; name: string; created_at?: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          created_at: string | null;
          manualId: string | null;
          quoteId: string | null;
          clientId: string;
          status: "pending" | "en_progreso" | "completed" | "cancelada" | null;
          service_date: string | null;
          service_time: string | null;
          order_type: string | null;
          notes: string | null;
          estimated_duration: number | null;
          image_urls: string[] | null;
          sede_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          manualId?: string | null;
          quoteId?: string | null;
          clientId: string;
          status?: "pending" | "en_progreso" | "completed" | "cancelada" | null;
          service_date?: string | null;
          service_time?: string | null;
          order_type?: string | null;
          notes?: string | null;
          estimated_duration?: number | null;
          image_urls?: string[] | null;
          sede_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string | null;
          manualId?: string | null;
          quoteId?: string | null;
          clientId?: string;
          status?: "pending" | "en_progreso" | "completed" | "cancelada" | null;
          service_date?: string | null;
          service_time?: string | null;
          order_type?: string | null;
          notes?: string | null;
          estimated_duration?: number | null;
          image_urls?: string[] | null;
          sede_id?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          orderId: string;
          itemId: string;
          manualId: string;
          description: string;
          quantity: number;
          price: number;
          created_at?: string;
          completed_quantity: number;
        };
        Insert: {
          id?: string;
          orderId: string;
          itemId: string;
          manualId: string;
          description: string;
          quantity: number;
          price: number;
          created_at?: string;
          completed_quantity?: number;
        };
        Update: {
          id?: string;
          orderId?: string;
          itemId?: string;
          manualId?: string;
          description?: string;
          quantity?: number;
          price?: number;
          created_at?: string;
          completed_quantity?: number;
        };
        Relationships: [];
      };
      order_technicians: {
        Row: {
          order_id: string;
          technician_id: string;
        };
        Insert: {
          order_id: string;
          technician_id: string;
        };
        Update: {
          order_id?: string;
          technician_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    // FIX: Add RPC function definition to enable type-safe calls
    Functions: {
      increment_user_points: {
        Args: {
          user_id_to_update: string;
          points_to_add: number;
        };
        Returns: undefined;
      };
    };
    Enums: { [key: string]: never };
    CompositeTypes: { [key: string]: never };
  };
}


export interface User {
    id: string;
    username: string; // For admin: 'admin', for worker: cedula
    password?: string; // Hashed or plain for localStorage, plain for initial setup
    role: 'admin' | 'worker';
    name?: string; // Worker's full name
    cedula?: string; // Worker's ID, also username
    isActive?: boolean;
    points?: number;
}

export interface City {
    id: string;
    name: string;
}

export interface Company {
    id: string;
    name: string;
    cityId: string;
}

export interface Sede {
    id: string;
    name: string;
    address?: string | null;
    companyId: string | null;
    cityId: string | null;
    contact_person?: string | null;
    phone?: string | null;
}

export interface Dependency {
    id: string;
    name: string;
    /**
     * Referencia técnica en maintenance_companies.
     * Para dependencias de sede: contiene el ID de la sede.
     * Para dependencias de empresa sin sedes: contiene el ID de la empresa madre
     * (que comparte UUID con clients).
     * Mantiene fallback a client_id para compatibilidad con registros legacy (company_id = null).
     */
    companyId: string;
    /**
     * ID de la empresa madre real en la tabla clients.
     * Null en registros legacy que no tenían client_id guardado.
     */
    clientId?: string | null;
    /**
     * ID de la sede exacta (maintenance_companies) cuando aplica.
     * Null para dependencias de empresa sin sedes.
     */
    sedeId?: string | null;
}

export interface ServiceType {
    id: string;
    name: string;
}

export interface EquipmentType {
    id: string;
    name: string;
}

export interface RefrigerantType {
    id: string;
    name: string;
}


export interface Equipment {
    id: string;
    manualId?: string | null;
    created_at?: string; // ISO date string
    model: string;
    brand: string;
    type: string;
    typeName: string; // The name of the equipment type for display
    equipment_type_id: string | null; // The foreign key
    refrigerantName: string | null; // The name of the refrigerant for display
    refrigerant_type_id: string | null; // The foreign key
    capacity?: string;
    cityId: string;
    companyId?: string | null;
    dependencyId?: string | null;
    periodicityMonths: number;
    lastMaintenanceDate?: string;
    category: 'empresa' | 'residencial' | string;
    address?: string | null;
    client_name?: string | null;
    sedeId?: string | null;
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
        sedeName?: string; // Denormalized for display
        contact_person?: string | null;
        phone?: string | null;
    };
    itemsSnapshot: { description: string; quantity: number }[] | null;
    cityId: string;
    companyId: string | null;
    clientId?: string | null;
    sedeId?: string | null;
    dependencyId: string | null;
    workerId: string; // User ID of the worker
    workerName: string; // Name of the worker
    clientSignature?: string | null; // Base64 data URL of the signature image (opcional para lazy load)
    pressure: string | null;
    amperage: string | null;
    is_paid: boolean;
    photo_internal_unit_url?: string | null;
    photo_external_unit_url?: string | null;
    orderId?: string | null;
    sedeId?: string | null;
    // Banderas de estado para optimización UI
    isSignaturePending?: boolean; // true si falta firma (sin descargar imagen)
    arePhotosPending?: boolean;   // true si faltan fotos (sin descargar imágenes)
}

export interface ScheduledMaintenanceItem { // Renamed from ScheduledMaintenance for clarity
    equipment: Equipment;
    nextDueDate: Date;
    daysRemaining: number;
    statusText: string;
    statusColorClass: string;
    lastMaintenanceDate: string;
}

export interface Client {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    created_at?: string;
    sede_id?: string | null;
}

export interface OrderItem {
    id: string;
    orderId: string;
    itemId: string;
    manualId: string;
    description: string;
    quantity: number;
    price: number;
    created_at?: string;
    completed_quantity?: number;
}

export interface Order {
    id: string;
    created_at?: string;
    manualId: string | null;
    quoteId: string | null;
    clientId: string;
    sede_id?: string | null;
    status: 'pending' | 'en_progreso' | 'completed' | 'cancelada' | null;
    service_date: string | null;
    service_time: string | null;
    order_type: string | null;
    notes: string | null;
    estimated_duration: number | null;
    image_urls?: string[] | null;
    // Enriched properties
    items?: OrderItem[];
    clientDetails?: Client | null;
    assignedTechnicians?: User[];
}

export interface PaginationState {
    currentPage: number;
    itemsPerPage: number;
    totalItems: number; // No longer optional, will be fetched from API
}

export interface AppSettings {
    [key: string]: boolean;
}

export type MaintenanceTableKey = 
    'myReports' | 
    'adminReports' | 
    'adminSchedule' | 
    'adminEquipment' | 
    'adminCities' | 
    'adminCompanies' | 
    'adminDependencies' | 
    'adminEmployees' |
    'adminOrders';

export type EntityType = 'city'|'company'|'dependency'|'equipment'|'employee' | 'equipmentType' | 'refrigerant';