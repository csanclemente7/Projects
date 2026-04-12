
import { fetchCities, fetchCompanies, fetchUsers, fetchServiceTypes, fetchEquipmentTypes, fetchDependencies, fetchRefrigerantTypes } from './api';
import * as State from './state';
import * as UI from './ui';
import * as D from './dom';
import * as Auth from './auth';
import { setupEventListeners } from './events';
import { initCompanyMerge } from './company-merge';
import { initSedeCleanup } from './sede-cleanup';
import { initBackupRestore } from './backup';

async function initAuthGate() {
    UI.showLoader('Sincronizando acceso...');
    let usersLoaded = false;
    try {
        const users = await fetchUsers();
        State.setUsers(users);
        usersLoaded = true;
    } catch (error) {
        console.error("Error loading users:", error);
        if (D.adminPasswordError) {
            D.adminPasswordError.textContent = 'No se pudo sincronizar usuarios. Reintente.';
        }
    } finally {
        UI.hideLoader();
    }

    if (usersLoaded) {
        Auth.checkForPersistedSession();
    }
}

export async function loadSharedLookupData() {
    try {
        const [sTypes, eTypes, cities, companies, deps, rTypes, sedes] = await Promise.all([
            fetchServiceTypes(),
            fetchEquipmentTypes(),
            fetchCities(),
            fetchCompanies(),
            fetchDependencies(),
            fetchRefrigerantTypes()
        ]);
        State.setLookupData({ users: State.users, cities, companies, serviceTypes: sTypes, equipmentTypes: eTypes });
        State.setDependencies(deps);
        State.setRefrigerantTypes(rTypes);
    } catch (err) {
        console.error("Error loading shared lookup data:", err);
        throw err;
    }
}

import { setupDashboard } from './dashboard';

export async function main() {
    setupEventListeners();
    initCompanyMerge();
    initSedeCleanup();
    initBackupRestore();
    setupDashboard();

    D.logoutBtn?.addEventListener('click', () => {
        if (confirm('¿Cerrar sesión?')) Auth.handleLogout();
    });

    await initAuthGate();
}
