
import { supabaseOrders, fetchAssignedOrders, fetchAllOrdersAndTechnicians, fetchAllReports, fetchReportsForWorker, fetchEquipment } from './api';
import * as State from './state';
import * as D from './dom';
import { populateBottomNav, showView, showLoader, hideLoader, showAppNotification, populateAdminFilterDropdowns, renderAdminOrdersList, populateAdminOrderFilterDropdowns, updateUserPointsDisplay, initUI } from './ui';
import { User } from './types';
import { loadSharedLookupData } from './main';

const USER_SESSION_KEY = 'maintenance_app_current_user';
let uiInitialized = false;

function ensureUiInitialized() {
    if (uiInitialized) return;
    initUI();
    uiInitialized = true;
}

export function checkForPersistedSession() {
    const storedUserJSON = localStorage.getItem(USER_SESSION_KEY);
    if (storedUserJSON) {
        try {
            const storedUser = JSON.parse(storedUserJSON) as User;
            // It's crucial to find the user in the fresh list from the DB
            // to ensure their data (like isActive) is current.
            const userFromState = State.users.find(u => u.id === storedUser.id);
            
            if (userFromState && userFromState.isActive) {
                console.log("Found persisted session. Logging in user automatically.", userFromState);
                handlePostLogin(userFromState);
            } else {
                // User might have been deactivated or deleted. Clear the session.
                console.log("Found persisted session for an inactive/deleted user. Clearing session.");
                localStorage.removeItem(USER_SESSION_KEY);
                hideLoader(); // Hide loader if session was invalid
            }
        } catch (error) {
            console.error("Failed to parse persisted user session:", error);
            localStorage.removeItem(USER_SESSION_KEY);
            hideLoader(); // Hide loader on error
        }
    } else {
        console.log("No persisted session found. Showing login screen.");
        hideLoader(); // Hide loader if no session exists
    }
}

async function handlePostLogin(user: User) {
    State.setCurrentUser(user);
    const userToStore = { ...user };
    delete userToStore.password;
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userToStore));
    
    showLoader('Cargando datos básicos...');
    try {
        // Step 1: Load small, shared lookup data quickly for everyone.
        await loadSharedLookupData();

        if (user.role === 'worker') {
            // Step 2 (Worker): Load only essential data for the initial view (orders and own reports).
            showLoader('Cargando sus órdenes y reportes...');
            const [orders, reports] = await Promise.all([
                fetchAssignedOrders(user.id, State.users),
                fetchReportsForWorker(user.id)
            ]);
            State.setAssignedOrders(orders);
            // Fix: Pass reports array and total count separately to State.setReports to match signature.
            State.setReports(reports.reports, reports.total); // State now contains ONLY the worker's reports
            console.log('Órdenes de Servicio Asignadas (Enriquecidas):', orders);
            
            ensureUiInitialized();
            // Make the app interactive immediately
            startAppSession();
            hideLoader(); // Hide loader now, app is usable.

            const pendingOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelada');
            if (pendingOrders.length > 0) {
                showAppNotification(`Tiene ${pendingOrders.length} órdenes de servicio pendientes.`, 'info');
            }

            // Step 3 (Worker): Load heavy equipment data in the background without a loader.
            console.log("Loading equipment data in the background...");
            fetchEquipment().then(equipment => {
                State.setEquipmentList(equipment);
                console.log("Background equipment data loaded.");
            }).catch(err => {
                console.error("Failed to load equipment data in background:", err);
                showAppNotification("No se pudo cargar la lista de equipos.", 'warning');
            });

        } else if (user.role === 'admin') {
            // Step 2 (Admin): Load all necessary data for the admin role.
            showLoader('Cargando datos de administrador...');
            const [allOrders, allReports, allEquipment] = await Promise.all([
                fetchAllOrdersAndTechnicians(State.users),
                fetchAllReports(),
                fetchEquipment()
            ]);
            State.setAllServiceOrders(allOrders);
            // Fix: Pass reports array and total count separately to State.setReports to match signature.
            State.setReports(allReports.reports, allReports.total);
            State.setEquipmentList(allEquipment);
            console.log('All Service Orders for Admin:', allOrders);
            
            // Populate filters now that all data is available
            populateAdminFilterDropdowns();
            populateAdminOrderFilterDropdowns();
            renderAdminOrdersList();

            // Finalize UI setup
            ensureUiInitialized();
            startAppSession();
            hideLoader();
        }

    } catch (error) {
        console.error('Failed to load application data after login:', error);
        showAppNotification('Error al cargar los datos. Por favor, intente de nuevo.', 'error');
        handleLogout(); // Log out to prevent being in a broken state
    }
}


export function startAppSession() {
    if (!D.loginScreen || !D.appScreen || !State.currentUser) return;
    D.loginScreen.style.display = 'none';
    D.appScreen.style.display = 'block';
    if (D.bottomNav) D.bottomNav.style.display = '';

    document.body.dataset.userRole = State.currentUser.role;

    if (D.currentUserDisplay) {
        D.currentUserDisplay.textContent = `${State.currentUser.name || State.currentUser.username}`;
    }

    populateBottomNav(State.currentUser.role);
    updateUserPointsDisplay(State.currentUser.points); // Display points on login


    if (State.currentUser.role === 'admin') {
        if (D.changePasswordActionButton) D.changePasswordActionButton.style.display = 'inline-flex';
        // Trigger click on the first nav item for admin
        const firstNavItem = D.bottomNav?.querySelector('.nav-item') as HTMLButtonElement | null;
        firstNavItem?.click();
    } else { // Worker
        if (D.changePasswordActionButton) D.changePasswordActionButton.style.display = 'none';
        // Trigger click on the first nav item for worker
        const firstNavItem = D.bottomNav?.querySelector('.nav-item') as HTMLButtonElement | null;
        firstNavItem?.click();
    }
}

export async function handleLogin(e: SubmitEvent) {
    e.preventDefault();
    if (!D.usernameInput || !D.passwordInput || !D.loginError) return;
    D.loginError.textContent = '';

    const userId = D.usernameInput.value;
    const password = D.passwordInput.value; // This is the cedula

    if (!userId) {
        D.loginError.textContent = 'Por favor, seleccione su nombre.';
        return;
    }

    const user = State.users.find(u => u.id === userId);

    if (user && user.password === password) {
        if (user.isActive) {
            await handlePostLogin(user);
        } else {
            D.loginError.textContent = 'Este usuario está inactivo. Contacte al administrador.';
        }
    } else {
        D.loginError.textContent = 'Contraseña (cédula) incorrecta.';
    }
}

export function handleLogout() {
    State.setCurrentUser(null);
    State.setAssignedOrders([]); // Clear orders on logout
    State.setAllServiceOrders([]);
    localStorage.removeItem(USER_SESSION_KEY);
    if (D.loginScreen) D.loginScreen.style.display = 'flex';
    if (D.appScreen) D.appScreen.style.display = 'none';
    if (D.bottomNav) D.bottomNav.style.display = 'none';
    if (D.loginForm) D.loginForm.reset();
    if (D.adminPasswordForm) D.adminPasswordForm.reset();
    if (D.adminPasswordError) D.adminPasswordError.textContent = '';
    document.body.removeAttribute('data-user-role');
}

export function openAdminPasswordModal() {
    if (!D.adminPasswordModal) return;
    D.adminPasswordModal.style.display = 'flex';
    if (D.adminPasswordInput) {
        D.adminPasswordForm.reset();
        D.adminPasswordError.textContent = '';
        setTimeout(() => D.adminPasswordInput.focus(), 100); // Focus after transition
    }
}

export async function handleAdminPasswordSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (D.adminPasswordError) D.adminPasswordError.textContent = '';
    const password = D.adminPasswordInput.value.trim();
    const adminUser = State.users.find(u => u.role === 'admin' && u.password === password && u.isActive);

    // FIX: Verify adminUser exists before calling handlePostLogin to satisfy TypeScript
    if (adminUser) {
        closeAdminPasswordModal();
        await handlePostLogin(adminUser);
    } else {
        if (D.adminPasswordError) D.adminPasswordError.textContent = 'Clave de acceso incorrecta.';
    }
}

export function closeAdminPasswordModal() {
    if (D.adminPasswordModal) D.adminPasswordModal.style.display = 'none';
}


export function openChangePasswordModal() {
    if (!D.changePasswordModal || !D.changePasswordForm || !State.currentUser || State.currentUser.role !== 'admin') return;
    D.changePasswordForm.reset();
    if (D.changePasswordError) D.changePasswordError.textContent = '';
    D.changePasswordModal.style.display = 'flex';
}

export async function handleChangePasswordSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!State.currentUser || State.currentUser.role !== 'admin' || !D.changePasswordError) return;

    const currentPassword = D.currentPasswordInput.value;
    const newPassword = D.newPasswordInput.value;
    const confirmPassword = D.confirmNewPasswordInput.value;

    if (currentPassword !== State.currentUser.password) {
        D.changePasswordError.textContent = 'La contraseña actual es incorrecta.';
        return;
    }
    if (newPassword.length < 6) {
        D.changePasswordError.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
        return;
    }
    if (newPassword !== confirmPassword) {
        D.changePasswordError.textContent = 'Las nuevas contraseñas no coinciden.';
        return;
    }

    showLoader("Cambiando contraseña...");
    const { error } = await supabaseOrders.from('maintenance_users').update({ password: newPassword }).eq('id', State.currentUser.id);
    hideLoader();

    if (error) {
        D.changePasswordError.textContent = `Error al actualizar: ${error.message}`;
        showAppNotification('Error al cambiar contraseña.', 'error');
    } else {
        // Update local user object
        const updatedUser = { ...State.currentUser, password: newPassword };
        State.setCurrentUser(updatedUser);
        
        // Update persisted session data
        const userToStore = { ...updatedUser };
        delete userToStore.password;
        localStorage.setItem(USER_SESSION_KEY, JSON.stringify(userToStore));

        showAppNotification('Contraseña cambiada con éxito.', 'success');
        closeChangePasswordModal();
    }
}

export function closeChangePasswordModal() {
    if (D.changePasswordModal) D.changePasswordModal.style.display = 'none';
}
