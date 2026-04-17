/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_ORDERS_URL: string;
  readonly VITE_SUPABASE_ORDERS_ANON_KEY: string;
  readonly VITE_SUPABASE_QUOTES_URL: string;
  readonly VITE_SUPABASE_QUOTES_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
