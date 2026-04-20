import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// ACCIÓN REQUERIDA
// Crea un nuevo proyecto en https://supabase.com y pega aquí
// la URL y la anon key de ese proyecto.
// Luego ejecuta el archivo setup.sql en el SQL Editor.
// ============================================================
const SUPABASE_URL = 'https://dfghghdangxgiyszpnfe.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmZ2hnaGRhbmd4Z2l5c3pwbmZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTk5NDIsImV4cCI6MjA5MTkzNTk0Mn0.9A6L9lGlPRazyzZ_1pCzZHDxY4us7_dmxQfj0xXtNTU';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// DB de Órdenes/Técnicos (compartido con app de Cotizaciones)
// ============================================================
const ORDERS_URL = 'https://fzcalgofrhbqvowazdpk.supabase.co';
const ORDERS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6Y2FsZ29mcmhicXZvd2F6ZHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0NjQwNTQsImV4cCI6MjA2NzA0MDA1NH0.yavOv5g0iQElk7X8GHOAQrO9rnvb2mDb-i2PgtGCX-o';

export const supabaseOrders: SupabaseClient = createClient(ORDERS_URL, ORDERS_KEY);