// --- Supabase-generated like types ---

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];


// Specific DB Schemas for each client
export type DatabaseQuotes = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          created_at: string
          manualId: string
          name: string
          address: string | null
          city: string | null
          phone: string | null
          email: string | null
          contactPerson: string | null
          category: string | null
        }
        Insert: {
          id?: string
          manualId: string
          name: string
          address?: string | null
          city?: string | null
          phone?: string | null
          email?: string | null
          contactPerson?: string | null
          category?: string | null
        }
        Update: {
          id?: string
          manualId?: string
          name?: string
          address?: string | null
          city?: string | null
          phone?: string | null
          email?: string | null
          contactPerson?: string | null
          category?: string | null
        }
      }
      items: {
        Row: {
          id: string
          created_at: string
          manualId: string
          name: string
          price: number
        }
        Insert: {
          id?: string
          manualId: string
          name: string
          price: number
        }
        Update: {
          id?: string
          manualId?: string
          name?: string
          price?: number
        }
      }
      quotes: {
        Row: {
          id: string
          created_at: string
          manualId: string
          date: string
          clientId: string | null
          taxRate: number
          terms: string
          image_urls?: string[] | null
          internal_notes?: string | null
          sede_id?: string | null
        }
        Insert: {
          id?: string
          manualId: string
          date: string
          clientId: string | null
          taxRate: number
          terms: string
          image_urls?: string[] | null
          internal_notes?: string | null
          sede_id?: string | null
        }
        Update: {
          id?: string
          manualId?: string
          date?: string
          clientId?: string | null
          taxRate?: number
          terms?: string
          image_urls?: string[] | null
          internal_notes?: string | null
          sede_id?: string | null
        }
      }
      quote_items: {
        Row: {
          id: string
          created_at: string
          quoteId: string
          itemId: string | null
          description: string
          quantity: number
          price: number
          manualId: string | null
        }
        Insert: {
          id?: string
          quoteId: string
          itemId?: string | null
          description: string
          quantity: number
          price: number
          manualId?: string | null
        }
        Update: {
          id?: string
          quoteId?: string
          itemId?: string | null
          description?: string
          quantity?: number
          price?: number
          manualId?: string | null
        }
      }
      settings: {
        Row: {
          key: string
          value: string | null
        }
        Insert: {
          key: string
          value: string | null
        }
        Update: {
          key?: string
          value?: string | null
        }
      }
    }
    Views: {}
    Functions: {
      clear_all_data: {
        Args: Record<string, unknown>
        Returns: void
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type DatabaseOrders = {
  public: {
    Tables: {
      maintenance_users: {
        Row: {
          id: string
          created_at: string
          name: string | null
          cedula: string | null
          username: string | null
          password: string | null
          role: string | null
          is_active: boolean
        }
        Insert: {
          id?: string
          name?: string | null
          cedula?: string | null
          username?: string | null
          password?: string | null
          role?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          name?: string | null
          cedula?: string | null
          username?: string | null
          password?: string | null
          role?: string | null
          is_active?: boolean
        }
      }
      orders: {
        Row: {
          id: string
          created_at: string
          manualId: string
          quoteId: string | null
          clientId: string
          status: "pending" | "scheduled" | "in_progress" | "completed" | "cancelled"
          service_date: string
          service_time: string | null
          order_type: string
          notes: string | null
          estimated_duration: number | null
          image_urls?: string[] | null
          sede_id: string | null
        }
        Insert: {
          id?: string
          manualId: string
          quoteId?: string | null
          clientId: string
          status?: "pending" | "scheduled" | "in_progress" | "completed" | "cancelled"
          service_date: string
          service_time?: string | null
          order_type?: string
          notes?: string | null
          estimated_duration?: number | null
          image_urls?: string[] | null
          sede_id?: string | null
        }
        Update: {
          id?: string
          manualId?: string
          quoteId?: string | null
          clientId?: string
          status?: "pending" | "scheduled" | "in_progress" | "completed" | "cancelled"
          service_date?: string
          service_time?: string | null
          order_type?: string
          notes?: string | null
          estimated_duration?: number | null
          image_urls?: string[] | null
          sede_id?: string | null
        }
      }
      order_items: {
        Row: {
          id: string
          created_at: string
          orderId: string
          itemId: string | null
          description: string
          quantity: number
          completed_quantity: number
          price: number
          manualId: string | null
        }
        Insert: {
          id?: string
          orderId: string
          itemId?: string | null
          description: string
          quantity: number
          completed_quantity?: number
          price: number
          manualId?: string | null
        }
        Update: {
          id?: string
          orderId?: string
          itemId?: string | null
          description?: string
          quantity?: number
          completed_quantity?: number
          price?: number
          manualId?: string | null
        }
      }
      order_technicians: {
        Row: {
          order_id: string
          technician_id: string
        }
        Insert: {
          order_id: string
          technician_id: string
        }
        Update: {
          order_id?: string
          technician_id?: string
        }
      }
      service_types: {
        Row: {
          id: string
          created_at: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}


// --- Application-level types ---
export type Client = DatabaseQuotes['public']['Tables']['clients']['Row'];
export type ClientInsert = DatabaseQuotes['public']['Tables']['clients']['Insert'];
export type Item = DatabaseQuotes['public']['Tables']['items']['Row'];
export type ItemInsert = DatabaseQuotes['public']['Tables']['items']['Insert'];
export type QuoteItem = DatabaseQuotes['public']['Tables']['quote_items']['Row'];
export type QuoteItemInsert = DatabaseQuotes['public']['Tables']['quote_items']['Insert'];
export type Setting = DatabaseQuotes['public']['Tables']['settings']['Row'];
export type SettingInsert = DatabaseQuotes['public']['Tables']['settings']['Insert'];

export type Technician = DatabaseOrders['public']['Tables']['maintenance_users']['Row'];
export type TechnicianInsert = DatabaseOrders['public']['Tables']['maintenance_users']['Insert'];
export type OrderItem = DatabaseOrders['public']['Tables']['order_items']['Row'];
export type OrderItemInsert = DatabaseOrders['public']['Tables']['order_items']['Insert'];
export type OrderTechnicianInsert = DatabaseOrders['public']['Tables']['order_technicians']['Insert'];
export type ServiceType = DatabaseOrders['public']['Tables']['service_types']['Row'];

export type Sede = {
    id: string;
    name: string;
    address?: string | null;
    company_id?: string | null;
    city_id?: string | null;
};

// This is the composite object the app works with for quotes
export type Quote = DatabaseQuotes['public']['Tables']['quotes']['Row'] & {
  items: QuoteItem[]
}
export type QuoteInsert = DatabaseQuotes['public']['Tables']['quotes']['Insert'];

// This is the composite object the app works with for orders
export type Order = DatabaseOrders['public']['Tables']['orders']['Row'] & {
  items: OrderItem[],
  technicianIds: string[],
  taxRate: number
}
export type OrderInsert = DatabaseOrders['public']['Tables']['orders']['Insert'];

export type PdfTemplate = 'classic' | 'modern' | 'sleek' | 'vivid';

export type AppUser = {
  id: string;
  name: string;
  username: string;
  email?: string;
  password: string;
  role: 'admin' | 'user';
  active: boolean;
};
