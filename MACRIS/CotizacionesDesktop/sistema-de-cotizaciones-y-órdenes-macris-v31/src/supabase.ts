import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseQuotes, DatabaseOrders } from './types';

// #############################################################################
// ¡ACCIÓN REQUERIDA!
// Por favor, completa las credenciales para tu base de datos de COTIZACIONES.
// #############################################################################
const QUOTES_SUPABASE_URL = 'https://ctitnuadeqdwsgulhpjg.supabase.co';
const QUOTES_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0aXRudWFkZXFkd3NndWxocGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3NjAxMjQsImV4cCI6MjA2ODMzNjEyNH0.Tmd2X11ukDi3I2h4uDXVABghKyMgcPpUMcGIdZbjOQE';


// --- Base de datos de ÓRDENES y TÉCNICOS ---
const ordersSupabaseUrl = 'https://fzcalgofrhbqvowazdpk.supabase.co';
const ordersSupabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o';


// --- Creación de los clientes de Supabase ---

// Cliente para Cotizaciones, Clientes, Insumos, etc.
export const supabaseQuotes: SupabaseClient<DatabaseQuotes> = createClient<DatabaseQuotes>(QUOTES_SUPABASE_URL, QUOTES_SUPABASE_KEY);

// Cliente para Órdenes y Técnicos
export const supabaseOrders: SupabaseClient<DatabaseOrders> = createClient<DatabaseOrders>(ordersSupabaseUrl, ordersSupabaseKey);