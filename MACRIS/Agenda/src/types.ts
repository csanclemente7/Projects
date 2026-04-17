export interface OrderItem {
  id: string;
  description: string;
  quantity: number;
}

export interface Order {
  id: string;
  created_at: string;
  manualId: string;
  clientId: string;
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  service_date: string | null;
  service_time: string | null;
  order_type: string | null;
  notes: string | null;
  estimated_duration: number | null;
  sede_id: string | null;
  technicianIds: string[];
  items: OrderItem[];
  image_urls: string[] | null;
}

export interface Client {
  id: string;
  name: string;
  address: string | null;
  city:    string | null;
  phone:   string | null;
}

export interface Sede {
  id: string;
  name: string;
  client_id: string | null;
  address:   string | null;
  // city_id es FK a otra tabla — no usamos city directamente
}

export interface Technician {
  id: string;
  name: string | null;
}

export type AgendaView = 'month' | 'week' | 'day';