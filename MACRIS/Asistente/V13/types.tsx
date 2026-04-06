// This file now acts as a re-exporter to ensure the entire application
// uses the single source of truth for types from `src/types.ts`.
// This prevents type inconsistencies and resolves issues with Supabase client typing.
export * from './src/types';
