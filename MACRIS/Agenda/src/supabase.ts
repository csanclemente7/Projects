import { createClient, SupabaseClient } from '@supabase/supabase-js';

// DB de Órdenes: técnicos, órdenes, sedes (maintenance_companies)
const ORDERS_URL = import.meta.env.VITE_SUPABASE_ORDERS_URL;
const ORDERS_KEY = import.meta.env.VITE_SUPABASE_ORDERS_ANON_KEY;

// DB de Cotizaciones: clientes
const QUOTES_URL = import.meta.env.VITE_SUPABASE_QUOTES_URL;
const QUOTES_KEY = import.meta.env.VITE_SUPABASE_QUOTES_ANON_KEY;

if (!ORDERS_URL || !ORDERS_KEY || !QUOTES_URL || !QUOTES_KEY) {
  throw new Error('Faltan variables de entorno de Supabase para Agenda.');
}

export const supabaseOrders: SupabaseClient = createClient(ORDERS_URL, ORDERS_KEY);
export const supabaseQuotes: SupabaseClient  = createClient(QUOTES_URL, QUOTES_KEY);
