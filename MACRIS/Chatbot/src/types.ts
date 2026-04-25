// ----------------------------------------------------------------
// Tipos del dominio MACRIS
// ----------------------------------------------------------------

export interface Client {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  category: 'empresa' | 'residencial';
}

export interface Sede {
  id: string;
  name: string;
  client_id: string | null;
  address: string | null;
}

export interface Technician {
  id: string;
  name: string | null;
}

export interface Order {
  id: string;
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
}

// ----------------------------------------------------------------
// Conversación
// ----------------------------------------------------------------

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string | ConversationContentBlock[];
}

export interface ConversationContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface ConversationSession {
  phone: string;
  messages: ConversationMessage[];
  lastActivity: number; // timestamp ms
}

// ----------------------------------------------------------------
// Resultado de herramientas
// ----------------------------------------------------------------

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}