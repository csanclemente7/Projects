
import * as D from './dom';
import { hideLoader } from './ui';

const USER_SESSION_KEY = 'equipment_admin_session';

/**
 * Verifica si ya hay una sesión activa en el almacenamiento local.
 */
export function checkForPersistedSession() {
    const isLogged = localStorage.getItem(USER_SESSION_KEY) === 'true';
    if (isLogged) {
        startAppSession();
    }
    // No ocultamos el loader aquí todavía, lo hará el main después de cargar los datos
}

/**
 * Activa la interfaz de la aplicación y oculta la pantalla de login.
 */
export function startAppSession() {
    const loginScreen = document.getElementById('login-screen');
    const appScreen = document.getElementById('app-screen');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (appScreen) appScreen.style.display = 'block';
    
    localStorage.setItem(USER_SESSION_KEY, 'true');
}

/**
 * Cierra la sesión y limpia el almacenamiento.
 */
export function handleLogout() {
    localStorage.removeItem(USER_SESSION_KEY);
    location.reload();
}

// Funciones stub para mantener compatibilidad con otros módulos
export async function handleLogin(e: SubmitEvent) { e.preventDefault(); }
export function openAdminPasswordModal() {}
export async function handleAdminPasswordSubmit(e: SubmitEvent) {}
export function closeAdminPasswordModal() {}
export function openChangePasswordModal() {}
export async function handleChangePasswordSubmit(e: SubmitEvent) {}
export function closeChangePasswordModal() {}
