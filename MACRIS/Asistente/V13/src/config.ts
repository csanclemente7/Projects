
// ===================================================================
// DANGER: DEVELOPMENT ONLY - DO NOT COMMIT THIS FILE TO GIT
// ===================================================================
// Este archivo contiene la API Key para el entorno de producción/hosting.
// ===================================================================

export const API_KEY = 'AIzaSyD4iR9yIMJ0qTPcaQ1OeWVnqoi4Wbhp4qQ';

/**
 * Polyfill robusto para process.env en el navegador.
 * Se asegura de que esté disponible tanto en window como en el scope global
 * antes de que cualquier otro módulo intente acceder a él.
 */
const env = {
    API_KEY: API_KEY
};

if (typeof window !== 'undefined') {
    (window as any).process = (window as any).process || {};
    (window as any).process.env = Object.assign((window as any).process.env || {}, env);
}

// También lo asignamos a globalThis para máxima compatibilidad en bundles de producción
(globalThis as any).process = (globalThis as any).process || {};
(globalThis as any).process.env = Object.assign((globalThis as any).process.env || {}, env);
