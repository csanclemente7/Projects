
import { fetchCities, fetchCompanies, fetchSedes, fetchDependencies, fetchUsers, fetchEquipmentTypes, fetchRefrigerantTypes, fetchEquipment } from './api';
import { setupEventListeners } from './events';
import * as D from './dom';
import { hideLoader, showLoader, renderAdminEquipmentTable, renderAdminScheduleTable, showAdminView } from './ui';
import { checkForPersistedSession } from './auth';
import * as State from './state';

/**
 * Carga los datos maestros compartidos.
 */
export async function loadSharedLookupData() {
    const [
        cities, companies, sedesList, deps, 
        eqTypes, refrigTypes
    ] = await Promise.all([
        fetchCities(), fetchCompanies(), fetchSedes(), fetchDependencies(),
        fetchEquipmentTypes(), fetchRefrigerantTypes()
    ]);

    State.setCities(cities);
    State.setCompanies(companies);
    State.setSedes(sedesList);
    State.setDependencies(deps);
    State.setEquipmentTypes(eqTypes);
    State.setRefrigerantTypes(refrigTypes);
}

/**
 * Carga todo el inventario de equipos para el administrador.
 */
async function loadAdminData() {
    showLoader('Cargando inventario...');
    try {
        await loadSharedLookupData();
        
        const [list, users] = await Promise.all([
            fetchEquipment(),
            fetchUsers()
        ]);

        State.setEquipmentList(list);
        State.setUsers(users);

        renderAdminEquipmentTable();
        renderAdminScheduleTable();
        showAdminView('equipment');
    } catch (err) {
        console.error("Error al cargar datos administrativos:", err);
    } finally {
        hideLoader();
    }
}

export async function main() {
    setupEventListeners();
    
    // 1. Verificar si ya estaba logueado
    checkForPersistedSession();
    
    // 2. Cargar los datos de la base de datos
    await loadAdminData();
    
    hideLoader();
}
