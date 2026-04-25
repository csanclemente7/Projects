import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

// DB Mantenimiento — lectura (anon key)
export const supabaseOrders: SupabaseClient = createClient(
  process.env.ORDERS_SUPABASE_URL!,
  process.env.ORDERS_SUPABASE_KEY!
);

// DB Mantenimiento — escritura (service_role key, bypasa RLS)
export const supabaseOrdersAdmin: SupabaseClient = createClient(
  process.env.ORDERS_SUPABASE_URL!,
  process.env.ORDERS_SUPABASE_SERVICE_KEY || process.env.ORDERS_SUPABASE_KEY!
);

// DB Cotizaciones — lectura (anon key)
export const supabaseQuotes: SupabaseClient = createClient(
  process.env.QUOTES_SUPABASE_URL!,
  process.env.QUOTES_SUPABASE_KEY!
);

// DB Cotizaciones — escritura (service_role key, bypasa RLS)
export const supabaseQuotesAdmin: SupabaseClient = createClient(
  process.env.QUOTES_SUPABASE_URL!,
  process.env.QUOTES_SUPABASE_SERVICE_KEY || process.env.QUOTES_SUPABASE_KEY!
);

// Advertencia en arranque si faltan service keys
if (!process.env.ORDERS_SUPABASE_SERVICE_KEY) {
  console.warn('[supabase] ⚠️  ORDERS_SUPABASE_SERVICE_KEY no definida — usando anon key para escrituras (puede fallar por RLS)');
}
if (!process.env.QUOTES_SUPABASE_SERVICE_KEY) {
  console.warn('[supabase] ⚠️  QUOTES_SUPABASE_SERVICE_KEY no definida — usando anon key para escrituras (puede fallar por RLS)');
}