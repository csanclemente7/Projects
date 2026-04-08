import * as D from './dom';
import * as Auth from './auth';
import * as UI from './ui';
import { toggleFullscreen, withTimeout } from './utils';
import * as State from './state';
import { EntityType, Report, Equipment, Order, Database, Company, Dependency } from './types';
// FIX: Added fetchEquipmentTypes and fetchRefrigerantTypes to the import list.
import { deleteEntity as apiDeleteEntity, deleteReport as apiDeleteReport, saveEntity, deleteAllReports as apiDeleteAllReports, toggleEmployeeStatus, saveMaintenanceReport, updateMaintenanceReport, fetchAllEquipment, fetchCities, fetchCompanies, fetchDependencies, fetchUsers, toggleReportPaidStatus, updateOrderItemQuantity, checkAndCompleteOrderIfFinished, incrementOrderItemCompletedQuantity, updateOrderStatus, updateAppSetting, fetchAllReports, fetchReportsForWorker, awardPointToTechnician, updateUserPoints, fetchEquipmentTypes, fetchRefrigerantTypes } from './api';
import { addReportToQueue, updateLocalReport, cacheAllData } from './lib/local-db';
import QRCode from 'qrcode';
import { runAiReconciliation } from './ai';
import { synchronizeQueue, startPeriodicSync, stopPeriodicSync } from './lib/sync';
import { currentUser } from './state';
import { FormAutosave } from './form-autosave';

import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { autoLogoutAdmin } from './state';
const FETCH_TIMEOUT_MS = 12000;
const ADMIN_RECENT_REPORTS_DAYS = 4;
let adminFullReportsLoadPromise: Promise<void> | null = null;
const normalizeEntityName = (value: string): string => value.trim().replace(/\s+/g, ' ');
const normalizeEntityKey = (value: string): string =>
    normalizeEntityName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const normalizeEntityId = (value: string | null | undefined): string =>
    String(value || '').trim().toLowerCase();

const isEntityFormDependencyContext = () =>
    State.entityFormContext?.source === 'reportForm' || State.entityFormContext?.source === 'entityForm';

const choosePreferredDependency = (matches: Dependency[]): Dependency | null => {
    if (matches.length === 0) return null;
    return [...matches].sort((a, b) => {
        const aIsLocal = a.id.startsWith('local_') ? 1 : 0;
        const bIsLocal = b.id.startsWith('local_') ? 1 : 0;
        if (aIsLocal !== bIsLocal) return aIsLocal - bIsLocal; // Prefer server IDs over local_* IDs
        return a.id.localeCompare(b.id);
    })[0];
};

const findDependencyMatch = (companyId: string, dependencyName: string, excludeId: string = ''): Dependency | null => {
    const targetCompanyId = companyId.trim();
    const dependencyNameKey = normalizeEntityKey(dependencyName);
    const excludeKey = normalizeEntityId(excludeId);
    const matches = State.dependencies.filter(d =>
        d.companyId === targetCompanyId &&
        normalizeEntityKey(d.name) === dependencyNameKey &&
        (!excludeKey || normalizeEntityId(d.id) !== excludeKey)
    );
    return choosePreferredDependency(matches);
};

const refreshDependenciesFromServer = async (): Promise<boolean> => {
    if (!navigator.onLine) return false;
    try {
        const latestDependencies = await fetchDependencies();
        State.setDependencies(latestDependencies);
        await cacheAllData('dependencies', latestDependencies);
        return true;
    } catch (error) {
        console.warn('[Dependency Sync] Could not refresh dependencies from server before validation.', error);
        return false;
    }
};

const resolveExistingDependency = async (companyId: string, dependencyName: string, excludeId: string = ''): Promise<Dependency | null> => {
    // First try current in-memory state (fast path).
    let match = findDependencyMatch(companyId, dependencyName, excludeId);
    if (navigator.onLine) {
        await refreshDependenciesFromServer();
        // Re-check with fresh server-backed state and prefer that result.
        match = findDependencyMatch(companyId, dependencyName, excludeId) || match;
    }
    return match;
};

const selectDependencyInOriginContext = (dependency: Dependency) => {
    if (!State.entityFormContext) return;

    if (State.entityFormContext.source === 'reportForm') {
        const companyId = State.entityFormContext.selectedCompanyId || dependency.companyId;
        if (companyId) {
            UI.updateLocationDropdownsFromCompany(companyId);
            const filteredDependencies = State.dependencies.filter(d => d.companyId === companyId);
            UI.populateDropdown(D.reportDependencySelect, filteredDependencies, dependency.id);
        } else {
            D.reportDependencySelect.value = dependency.id;
        }
        UI.closeEntityFormModal();
        return;
    }

    if (State.entityFormContext.source === 'entityForm') {
        const originalEquipmentId = State.entityFormContext.originalEntityId;
        UI.openEntityFormModal('equipment', originalEquipmentId, { source: 'entityForm' });
        setTimeout(() => {
            const companySelect = D.entityFormFieldsContainer.querySelector('#equipment-company') as HTMLSelectElement | null;
            const dependencySelect = D.entityFormFieldsContainer.querySelector('#equipment-dependency') as HTMLSelectElement | null;
            if (companySelect && dependencySelect) {
                companySelect.value = dependency.companyId;
                companySelect.dispatchEvent(new Event('change'));
                setTimeout(() => {
                    dependencySelect.value = dependency.id;
                }, 50);
            }
        }, 100);
    }
};

const getRecentAdminReportsOptions = () => ({ daysBack: ADMIN_RECENT_REPORTS_DAYS });
const hasActiveAdminReportsQuery = () => {
    const values = [
        State.tableSearchTerms.adminReports,
        D.filterReportDateStart?.value,
        D.filterReportDateEnd?.value,
        D.filterReportCity?.value,
        D.filterReportCompany?.value,
        D.filterReportServiceType?.value,
        D.filterReportTechnician?.value,
        D.filterReportCategory?.value,
        D.filterReportPaid?.value,
    ];
    return values.some(value => `${value || ''}`.trim().length > 0);
};

const setAdminReportsToFirstPage = () => {
    State.tablePaginationStates.adminReports.currentPage = 1;
};

async function ensureFullAdminReportsDataset(loaderMessage = 'Cargando historial completo de reportes...'): Promise<boolean> {
    if (State.isUsingFullAdminReportsDataset) {
        return true;
    }

    if (!navigator.onLine) {
        UI.showAppNotification('Se necesita conexión para buscar en todos los reportes.', 'warning');
        return false;
    }

    if (!adminFullReportsLoadPromise) {
        UI.showLoader(loaderMessage);
        adminFullReportsLoadPromise = (async () => {
            const reports = await withTimeout(
                fetchAllReports({}),
                FETCH_TIMEOUT_MS,
                'histórico completo de reportes admin'
            );
            State.setReports(reports);
            State.setIsUsingFullAdminReportsDataset(true);
            await cacheAllData('reports', reports);
        })().finally(() => {
            adminFullReportsLoadPromise = null;
            UI.hideLoader();
        });
    }

    try {
        await adminFullReportsLoadPromise;
        return true;
    } catch (error) {
        console.error('No se pudo cargar el histórico completo de reportes:', error);
        UI.showAppNotification('No se pudo cargar el histórico completo de reportes.', 'error');
        return false;
    }
}

async function restoreRecentAdminReportsDataset(): Promise<boolean> {
    if (State.recentAdminReportsSnapshot.length > 0) {
        State.setReports([...State.recentAdminReportsSnapshot]);
        State.setIsUsingFullAdminReportsDataset(false);
        return true;
    }

    if (!navigator.onLine) {
        return false;
    }

    UI.showLoader('Restaurando reportes recientes...');
    try {
        const reports = await withTimeout(
            fetchAllReports(getRecentAdminReportsOptions()),
            FETCH_TIMEOUT_MS,
            'reportes admin recientes'
        );
        State.setRecentAdminReportsSnapshot(reports);
        State.setReports(reports);
        State.setIsUsingFullAdminReportsDataset(false);
        await cacheAllData('reports', reports);
        return true;
    } catch (error) {
        console.error('No se pudieron restaurar los reportes recientes:', error);
        UI.showAppNotification('No se pudieron restaurar los reportes recientes.', 'error');
        return false;
    } finally {
        UI.hideLoader();
    }
}

async function syncAdminReportsDatasetForQuery(): Promise<void> {
    if (State.currentUser?.role !== 'admin') {
        return;
    }

    const needsFullDataset = State.showAllAdminReports || hasActiveAdminReportsQuery();
    if (needsFullDataset) {
        await ensureFullAdminReportsDataset();
        return;
    }

    if (State.isUsingFullAdminReportsDataset) {
        await restoreRecentAdminReportsDataset();
    }
}

async function refreshReportsState() {
    if (!State.currentUser) return;

    try {
        if (State.currentUser.role === 'admin') {
            const shouldUseFullDataset = State.shouldUseFullAdminReportsDataset();
            const reports = await withTimeout(
                fetchAllReports(shouldUseFullDataset ? {} : getRecentAdminReportsOptions()),
                FETCH_TIMEOUT_MS,
                'reportes admin'
            );
            State.setReports(reports);
            if (!shouldUseFullDataset) {
                State.setRecentAdminReportsSnapshot(reports);
            }
            await cacheAllData('reports', reports); // keep offline cache fresh after online sync
        } else {
            const reports = await withTimeout(
                fetchReportsForWorker(State.currentUser.id, State.showAllMyReports ? {} : { daysBack: 4 }),
                FETCH_TIMEOUT_MS,
                'reportes técnico'
            );
            State.setReports(reports);
            await cacheAllData('reports', reports);
        }
        UI.renderMyReportsTable();
        UI.renderAdminReportsTable(); // This is safe, it just won't render anything if the table body doesn't exist.
    } catch (error) {
        console.error("Failed to refresh reports state:", error);
        UI.showAppNotification("Error al actualizar la lista de reportes.", "error");
    }
}

async function handleAppSettingChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.type !== 'checkbox' || !input.dataset.key) return;

    const key = input.dataset.key;
    const value = input.checked;

    UI.showLoader('Guardando ajuste...');
    try {
        await updateAppSetting(key, value);
        State.appSettings[key] = value; // Update local state
        UI.showAppNotification('Ajuste guardado correctamente.', 'success');
    } catch (error: any) {
        console.error('Failed to save app setting:', error);
        UI.showAppNotification(`Error al guardar: ${error.message}`, 'error');
        // Revert checkbox on failure
        input.checked = !value;
    } finally {
        UI.hideLoader();
    }
}


async function handleDeleteEntity(type: EntityType, id: string, name: string) {
    const confirmed = await UI.showConfirmationModal(`¿Está seguro de que desea eliminar "${name}"? Esta acción no se puede deshacer.`, 'Eliminar');
    if (!confirmed) return;

    UI.showLoader('Eliminando...');
    try {
        if (type === 'city' || type === 'company' || type === 'dependency' || type === 'equipment') {
            const { error } = await apiDeleteEntity(type, id);
            if (error) {
                console.error("Supabase Deletion Error:", error);
                if (error.code === '23503') { // Foreign Key violation
                     let entityName = '';
                     switch(type) {
                        case 'city': entityName = 'la ciudad'; break;
                        case 'company': entityName = 'la empresa'; break;
                        case 'dependency': entityName = 'la dependencia'; break;
                        default: entityName = 'este elemento'; break;
                     }
                    throw new Error(`No se puede eliminar ${entityName} porque tiene otros registros asociados (p. ej., equipos, reportes).`);
                }
                throw error; // Rethrow other DB errors
            }
        } else {
            throw new Error(`Deletion for type "${type}" is not implemented.`);
        }

        UI.showAppNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} eliminado con éxito.`, 'success');

        // Refresh data and UI
        switch(type) {
            case 'city': State.setCities(await fetchCities()); UI.renderCitiesTable(); break;
            case 'company': State.setCompanies(await fetchCompanies()); UI.renderCompaniesTable(); break;
            case 'dependency':
                State.setDependencies(await fetchDependencies());
                await cacheAllData('dependencies', State.dependencies);
                UI.renderDependenciesTable();
                break;
            case 'equipment': State.setEquipmentList(await fetchAllEquipment()); UI.renderAdminEquipmentTable(); break;
        }

    } catch (error: any) {
        UI.showAppNotification(`Error al eliminar: ${error.message}`, 'error');
        console.error(error);
    } finally {
        UI.hideLoader();
    }
}

async function handleEntityFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    UI.showLoader('Guardando...');
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const id = ((formData.get('id') as string) || '').trim();
    const type = formData.get('type') as EntityType;
    let dependencyCompanyIdForRecovery = '';
    let dependencyNameForRecovery = '';

    try {
        // --- PRE-SUBMISSION DATA MANIPULATION ---
        if (type === 'company') {
            const cityId = formData.get('city_id') as string;
            const companyName = normalizeEntityName((formData.get('name') as string) || '');
            formData.set('name', companyName);

            if (cityId === 'otra') {
                throw new Error('Para la Ciudad ha seleccionado "Otra". Esta opción no es válida para guardar. Por favor, pida a un administrador que agregue la ciudad que necesita.');
            }
            if (!id) {
                const nameKey = normalizeEntityKey(companyName);
                const matchingCompany = State.companies.find(c => c.cityId === cityId && normalizeEntityKey(c.name) === nameKey);
                if (matchingCompany) {
                    const cityName = State.cities.find(c => c.id === cityId)?.name || 'esa ciudad';
                    throw new Error(`La empresa "${companyName}" ya existe en ${cityName}. Por favor, selecciónela de la lista.`);
                }
            }
        }

        if (type === 'dependency') {
            const companyId = ((formData.get('company_id') as string) || '').trim();
            const dependencyName = normalizeEntityName((formData.get('name') as string) || '');
            formData.set('name', dependencyName);
            const currentEntityId = normalizeEntityId(id);
            dependencyCompanyIdForRecovery = companyId;
            dependencyNameForRecovery = dependencyName;

            if (!companyId) {
                throw new Error('Debe seleccionar una empresa para la dependencia.');
            }
            if (!dependencyName) {
                throw new Error('El nombre de la dependencia es obligatorio.');
            }

            if (!currentEntityId && navigator.onLine) {
                await refreshDependenciesFromServer();
            }

            const existingDependency = findDependencyMatch(companyId, dependencyName, currentEntityId);

            if (existingDependency) {
                if (!currentEntityId && isEntityFormDependencyContext()) {
                    selectDependencyInOriginContext(existingDependency);
                    UI.showAppNotification(
                        `La dependencia "${existingDependency.name}" ya existía para esta empresa. Se seleccionó automáticamente.`,
                        'info',
                        4500
                    );
                    return;
                }
                const companyName = State.companies.find(c => c.id === companyId)?.name || 'esta empresa';
                throw new Error(`La dependencia "${dependencyName}" ya existe en ${companyName}. Por favor, selecciónela de la lista.`);
            }
        }

        if (type === 'equipment') {
            const equipmentTypeId = formData.get('equipment_type_id') as string;
            const equipmentTypeName = State.equipmentTypes.find(et => et.id === equipmentTypeId)?.name;
            
            if (equipmentTypeName) {
                formData.set('type', equipmentTypeName); // Satisfies the NOT NULL constraint
            } else if (!id) {
                throw new Error("No se pudo encontrar el nombre del tipo de equipo seleccionado.");
            }

            const category = formData.get('category') as string;
            if (category === 'empresa') {
                const companyId = formData.get('company_id') as string;
                const company = State.companies.find(c => c.id === companyId);
                if (company) {
                    formData.set('city_id', company.cityId);
                } else {
                    throw new Error("Empresa seleccionada no es válida.");
                }
            } else if (category === 'residencial') {
                const cityId = formData.get('city_id_residencial') as string;
                formData.set('city_id', cityId);
            }
        }

        // --- API CALL (Online or Offline) ---
        const { data, error } = await saveEntity(type, id, formData);

        if (error) throw error;
        
        const isOfflineCreation = data.id && data.id.startsWith('local_');
        const successMessage = isOfflineCreation ? 
            `${type.charAt(0).toUpperCase() + type.slice(1)} guardado localmente. Se sincronizará al conectar.` :
            `${type.charAt(0).toUpperCase() + type.slice(1)} guardado con éxito.`;
        UI.showAppNotification(successMessage, isOfflineCreation ? 'info' : 'success');


        // --- POST-SUBMISSION DATA REFRESH & UI UPDATE ---
        let shouldCloseCurrentModal = true;
        
        switch(type) {
            case 'city': 
                if (isOfflineCreation) {
                    State.setCities([...State.cities, data]);
                } else {
                    State.setCities(await fetchCities()); 
                }
                UI.renderCitiesTable(); 
                if (State.entityFormContext?.source === 'reportForm') {
                    UI.populateDropdown(D.reportCitySelectResidencial, State.cities, data.id);
                }
                break;
            case 'company': 
                if (isOfflineCreation) {
                    const newCompany: Company = { id: data.id, name: data.name, cityId: data.city_id };
                    State.setCompanies([...State.companies, newCompany]);
                } else {
                    State.setCompanies(await fetchCompanies());
                }
                UI.renderCompaniesTable(); 
                if (State.entityFormContext?.source === 'reportForm') {
                    UI.populateDropdown(D.reportCompanySelect, State.companies, data.id);
                    UI.setReportCompanySelection(data.id);
                } else if (State.entityFormContext?.source === 'entityForm') {
                     // Came from equipment form, re-open it and select the new company
                    const originalEquipmentId = State.entityFormContext.originalEntityId;
                    shouldCloseCurrentModal = false;
                    UI.openEntityFormModal('equipment', originalEquipmentId, { source: 'entityForm' });
                    // We need to wait for the modal to be rendered, then set the value
                    setTimeout(() => {
                        const companySelect = D.entityFormFieldsContainer.querySelector('#equipment-company') as HTMLSelectElement;
                        if(companySelect) {
                           companySelect.value = data.id;
                           companySelect.dispatchEvent(new Event('change')); // Trigger dependency update
                        }
                    }, 100);
                }
                break;
            case 'dependency': 
                 if (isOfflineCreation) {
                    const newDependency: Dependency = { id: data.id, name: data.name, companyId: data.company_id };
                    const duplicateInState = findDependencyMatch(newDependency.companyId, newDependency.name);
                    if (!duplicateInState) {
                        State.setDependencies([...State.dependencies, newDependency]);
                    }
                } else {
                    const latestDependencies = await fetchDependencies();
                    State.setDependencies(latestDependencies);
                }
                await cacheAllData('dependencies', State.dependencies);
                UI.renderDependenciesTable();
                if (State.entityFormContext?.source === 'reportForm' && State.entityFormContext.selectedCompanyId) {
                    const companyId = State.entityFormContext.selectedCompanyId;
                    UI.updateLocationDropdownsFromCompany(companyId);
                    const filteredDependencies = State.dependencies.filter(d => d.companyId === companyId);
                    UI.populateDropdown(D.reportDependencySelect, filteredDependencies, data.id);
                } else if (State.entityFormContext?.source === 'entityForm') {
                     const originalEquipmentId = State.entityFormContext.originalEntityId;
                     shouldCloseCurrentModal = false;
                     UI.openEntityFormModal('equipment', originalEquipmentId, { source: 'entityForm' });
                     setTimeout(() => {
                        const companySelect = D.entityFormFieldsContainer.querySelector('#equipment-company') as HTMLSelectElement;
                        const dependencySelect = D.entityFormFieldsContainer.querySelector('#equipment-dependency') as HTMLSelectElement;
                        if(companySelect && dependencySelect) {
                           companySelect.value = data.company_id;
                           companySelect.dispatchEvent(new Event('change'));
                           setTimeout(() => dependencySelect.value = data.id, 50);
                        }
                    }, 100);
                }
                break;
            case 'employee': 
                State.setUsers(await fetchUsers()); 
                UI.renderEmployeesTable(); 
                UI.populateLoginWorkerSelect();
                break;
            case 'equipment':
                 if (isOfflineCreation) {
                    // This case is more complex and not implemented for offline yet.
                    // For now, assume it's online.
                    State.setEquipmentList(await fetchAllEquipment());
                } else {
                    State.setEquipmentList(await fetchAllEquipment());
                }
                UI.renderAdminEquipmentTable();
                
                if (State.entityFormContext?.source === 'equipmentSelectionModal' && !id) {
                    const newEquipment = State.equipmentList.find(eq => eq.id === data.id);
                    if (newEquipment) {
                        shouldCloseCurrentModal = false;
                        UI.handleEquipmentSelection(newEquipment);
                    }
                }
                break;
            case 'equipmentType':
            case 'refrigerant':
                if (isOfflineCreation) {
                     if (type === 'equipmentType') State.setEquipmentTypes([...State.equipmentTypes, data]);
                     else State.setRefrigerantTypes([...State.refrigerantTypes, data]);
                } else {
                    if (type === 'equipmentType') State.setEquipmentTypes(await fetchEquipmentTypes());
                    else State.setRefrigerantTypes(await fetchRefrigerantTypes());
                }

                if (State.entityFormContext?.source === 'reportForm') {
                    if (type === 'equipmentType') {
                        UI.populateDropdown(D.reportEquipmentTypeSelect, State.equipmentTypes, data.id);
                    } else {
                        UI.populateDropdown(D.reportEquipmentRefrigerantSelect, State.refrigerantTypes, data.id);
                    }
                } else if (State.entityFormContext?.source === 'entityForm') {
                    const originalEquipmentId = State.entityFormContext.originalEntityId;
                    if(originalEquipmentId !== undefined){ // Check if it's new or editing
                        shouldCloseCurrentModal = false;
                        UI.openEntityFormModal('equipment', originalEquipmentId, { source: 'entityForm' });
                    }
                }
                break;
        }

        if (shouldCloseCurrentModal) {
            UI.closeEntityFormModal();
        }

    } catch (err: any) {
        if (
            type === 'dependency' &&
            !id &&
            isEntityFormDependencyContext() &&
            dependencyCompanyIdForRecovery &&
            dependencyNameForRecovery
        ) {
            const recoveredDependency = await resolveExistingDependency(
                dependencyCompanyIdForRecovery,
                dependencyNameForRecovery
            );
            if (recoveredDependency) {
                console.warn('[Dependency Save] Existing dependency found after save error. Reusing it.', err);
                selectDependencyInOriginContext(recoveredDependency);
                UI.showAppNotification(
                    `La dependencia "${recoveredDependency.name}" ya existe para esta empresa. Se seleccionó automáticamente.`,
                    'info',
                    5000
                );
                return;
            }
        }
        console.error(`Error saving entity ${type}:`, err);
        UI.showAppNotification(`Error al guardar: ${err.message}`, 'error');
    } finally {
        UI.hideLoader();
    }
}


async function handleMaintenanceReportSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!D.maintenanceReportForm || !State.currentUser) return;

    const validationErrors: string[] = [];
    let serviceType = D.reportServiceTypeSelect.value;
    if (serviceType === 'Otro') {
        const otherDesc = D.reportServiceTypeOtherInput.value.trim();
        if (!otherDesc) {
            validationErrors.push('Debe especificar el tipo de servicio en la opción "Otro".');
        } else {
            serviceType = `Otro: ${otherDesc}`;
        }
    }

    const isSimplifiedReport = serviceType === 'Montaje/Instalación' || serviceType.startsWith('Otro');
    const isManualEntry = D.reportEquipmentIdHidden.value === 'MANUAL_NO_ID' && !isSimplifiedReport;
    const selectedCategory = D.reportLocationResidencialContainer.style.display === 'block' ? 'residencial' : 'empresa';
    
    let signatureData: string | null = State.currentReportSignatureDataUrl;

    if (!signatureData) {
        const confirmed = await UI.showConfirmationModal(
            "No se ha capturado la firma del cliente. ¿Desea guardar el reporte como 'Firma Pendiente'?",
            "Guardar sin Firma"
        );
        if (confirmed) {
            signatureData = "PENDING_SIGNATURE";
        } else {
            UI.showAppNotification('Guardado cancelado. Por favor, añada una firma.', 'info');
            return;
        }
    }

    if (!serviceType) validationErrors.push('Debe seleccionar un Tipo de Servicio.');
    
    const cityId = selectedCategory === 'residencial' ? D.reportCitySelectResidencial.value : D.reportCitySelectEmpresa.value;
    if (cityId === 'otra') {
        validationErrors.push('Para la Ciudad ha seleccionado "Otra". Esta opción no es válida para guardar. Por favor, contacte a un administrador para que agregue la ciudad que necesita y luego selecciónela de la lista.');
    } else if (!cityId) {
        validationErrors.push('Debe seleccionar una Ciudad.');
    }


    if (selectedCategory === 'empresa') {
        if (!D.reportCompanySelect.value) validationErrors.push('Debe seleccionar una Empresa.');
        if (!D.reportDependencySelect.value) validationErrors.push('Debe seleccionar una Dependencia.');
    } else {
        if (!D.reportClientNameInput.value.trim()) validationErrors.push('El Nombre del Cliente es obligatorio.');
        if (!D.reportAddressInput.value.trim()) validationErrors.push('La Dirección es obligatoria.');
    }
    
    if (isManualEntry) {
        if (!D.reportEquipmentModelInput.value.trim()) validationErrors.push('El Modelo del equipo es obligatorio.');
        if (!D.reportEquipmentBrandInput.value.trim()) validationErrors.push('La Marca del equipo es obligatoria.');
        if (!D.reportEquipmentTypeSelect.value) validationErrors.push('El Tipo de Equipo es obligatorio.');
    }
    
    if (validationErrors.length > 0) {
        const errorListHtml = `- ${validationErrors.join('<br>- ')}`;
        UI.showAppNotification(`<strong>Por favor, corrija lo siguiente:</strong><br>${errorListHtml}`, 'warning', 7000);
        return;
    }

    if (isSimplifiedReport && (!State.currentReportPhotoInternalBase64 || !State.currentReportPhotoExternalBase64)) {
        const confirmed = await UI.showConfirmationModal(
            "No ha adjuntado una o más fotos del servicio. ¿Desea guardar el reporte como 'Fotos Pendientes'?",
            "Guardar con Pendientes"
        );
        if (!confirmed) {
            UI.showAppNotification('Guardado cancelado. Por favor, añada las fotos.', 'info');
            return;
        }
    }

    UI.showLoader('Guardando Reporte...');

    try {
        const isEditing = !!D.reportIdInput.value;
        const reportId = isEditing ? D.reportIdInput.value : crypto.randomUUID();
        const originalReport = isEditing ? State.reports.find(r => r.id === reportId) : null;
        
        let equipmentSnapshot: Report['equipmentSnapshot'];

        if (isSimplifiedReport) {
             equipmentSnapshot = {
                id: 'INSTALL_NO_ID', manualId: null, model: 'N/A', brand: 'N/A', type: 'N/A', refrigerant: 'N/A',
                category: selectedCategory,
                address: selectedCategory === 'residencial' ? D.reportAddressInput.value : null,
                client_name: selectedCategory === 'residencial' ? D.reportClientNameInput.value : null,
                companyName: selectedCategory === 'empresa' ? State.companies.find(c => c.id === D.reportCompanySelect.value)?.name : undefined,
                dependencyName: selectedCategory === 'empresa' ? State.dependencies.find(d => d.id === D.reportDependencySelect.value)?.name : undefined,
            };
        } else {
            const equipmentId = D.reportEquipmentIdHidden.value;
            if (equipmentId && equipmentId !== 'MANUAL_NO_ID') {
                const equipment = State.equipmentList.find(eq => eq.id === equipmentId);
                if (!equipment) throw new Error("Equipo base no encontrado.");
                equipmentSnapshot = {
                    id: equipment.id, manualId: equipment.manualId, model: equipment.model, brand: equipment.brand,
                    type: equipment.typeName, capacity: equipment.capacity, refrigerant: equipment.refrigerantName,
                    category: equipment.category, address: equipment.address, client_name: equipment.client_name,
                    companyName: State.companies.find(c => c.id === equipment.companyId)?.name,
                    dependencyName: State.dependencies.find(d => d.id === equipment.dependencyId)?.name,
                };
            } else {
                const equipmentTypeName = State.equipmentTypes.find(et => et.id === D.reportEquipmentTypeSelect.value)?.name || 'Desconocido';
                const refrigerantTypeName = State.refrigerantTypes.find(rt => rt.id === D.reportEquipmentRefrigerantSelect.value)?.name || null;
                equipmentSnapshot = {
                    id: 'MANUAL_NO_ID', manualId: null, model: D.reportEquipmentModelInput.value, brand: D.reportEquipmentBrandInput.value,
                    type: equipmentTypeName, capacity: D.reportEquipmentCapacityInput.value, refrigerant: refrigerantTypeName,
                    category: selectedCategory,
                    address: selectedCategory === 'residencial' ? D.reportAddressInput.value : null,
                    client_name: selectedCategory === 'residencial' ? D.reportClientNameInput.value : null,
                    companyName: selectedCategory === 'empresa' ? State.companies.find(c => c.id === D.reportCompanySelect.value)?.name : undefined,
                    dependencyName: selectedCategory === 'empresa' ? State.dependencies.find(d => d.id === D.reportDependencySelect.value)?.name : undefined,
                };
            }
        }

        const observations = D.reportObservationsTextarea.value.trim();
        let finalObservations = observations;
        if (serviceType === 'Mantenimiento Preventivo' && !observations) {
            finalObservations = 'Se realiza mantenimiento preventivo.';
        }
        
        const itemsSnapshot = isSimplifiedReport ? Array.from(D.reportInstallationItemsTableBody.querySelectorAll('tr')).map(row => ({
            description: row.cells[0]?.textContent || '',
            quantity: parseInt((row.cells[1]?.querySelector('input') as HTMLInputElement)?.value || '0', 10)
        })) : null;

        const orderIdValue = D.reportOrderIdHidden.value;

        // Step 1: Create the canonical `Report` object (camelCase) for our app state and local DB.
        const reportForState: Report = {
            id: reportId,
            timestamp: new Date().toISOString(),
            serviceType: serviceType,
            observations: finalObservations || null,
            equipmentSnapshot: equipmentSnapshot,
            itemsSnapshot: itemsSnapshot,
            cityId: cityId,
            companyId: selectedCategory === 'empresa' ? D.reportCompanySelect.value : null,
            dependencyId: selectedCategory === 'empresa' ? D.reportDependencySelect.value : null,
            workerId: State.currentUser.id,
            workerName: State.currentUser.name || State.currentUser.username,
            clientSignature: signatureData,
            pressure: D.reportPressureInput.value || null,
            amperage: D.reportAmperageInput.value || null,
            is_paid: originalReport ? originalReport.is_paid : false, // Preserve paid status on edit
            photo_internal_unit_url: isSimplifiedReport ? (State.currentReportPhotoInternalBase64 || 'PENDING_PHOTO') : null,
            photo_external_unit_url: isSimplifiedReport ? (State.currentReportPhotoExternalBase64 || 'PENDING_PHOTO') : null,
            orderId: orderIdValue || undefined,
        };
        
        // --- OFFLINE-FIRST LOGIC ---
        
        if (!navigator.onLine) {
            if (isEditing) {
                // Editing offline is complex and not part of this step's scope.
                // For now we allow local edits via updateLocalReport
                await updateLocalReport(reportId, reportForState);

            } else {
                 // Save new to local queue
                await addReportToQueue(reportForState);
            }
            
            if (orderIdValue) {
                const orderItemIdValue = D.reportOrderItemIdHidden?.value;
                if (orderItemIdValue) {
                    const assignedOrder = State.assignedOrders.find(o => o.id === orderIdValue) || State.allServiceOrders.find(o => o.id === orderIdValue);
                    if (assignedOrder && assignedOrder.items) {
                        const itemToUpdate = assignedOrder.items.find(i => i.id === orderItemIdValue);
                        if (itemToUpdate) itemToUpdate.completed_quantity = (itemToUpdate.completed_quantity || 0) + 1;
                        
                        const isOrderComplete = assignedOrder.items.every(i => (i.completed_quantity || 0) >= i.quantity);
                        if (isOrderComplete) {
                            State.updateOrderInState(orderIdValue, { status: 'completed' });
                        }
                    }
                } else {
                    State.updateOrderInState(orderIdValue, { status: 'completed' });
                }

                if (State.currentUser.role === 'worker') UI.renderAssignedOrdersList();
                else UI.renderAdminOrdersList();
                await cacheAllData('orders', State.allServiceOrders);
            }

            // Manually update local state to show the report immediately
            if (isEditing) {
                State.setReports(State.reports.map(r => r.id === reportId ? reportForState : r));
            } else {
                State.setReports([reportForState, ...State.reports]);
            }
            UI.renderMyReportsTable();
            if (State.currentUser.role === 'admin') UI.renderAdminReportsTable();
            
            FormAutosave.clearDraft(); // LIMPIAR AUTOGUARDADO TRAS GUARDAR
            UI.showAppNotification('Reporte guardado localmente. Se sincronizará cuando haya conexión.', 'info');
            UI.closeReportFormModal();
            return; // --- EARLY EXIT ---
        }

        // --- ONLINE PATH (with fallback) ---
        
        // Step 2: Create a DB-compatible object (snake_case) from our canonical object.
        const reportForDb = {
            id: reportForState.id,
            timestamp: reportForState.timestamp,
            service_type: reportForState.serviceType,
            observations: reportForState.observations,
            equipment_snapshot: reportForState.equipmentSnapshot as any,
            items_snapshot: reportForState.itemsSnapshot,
            city_id: reportForState.cityId,
            company_id: reportForState.companyId,
            dependency_id: reportForState.dependencyId,
            worker_id: reportForState.workerId,
            worker_name: reportForState.workerName,
            client_signature: reportForState.clientSignature,
            pressure: reportForState.pressure,
            amperage: reportForState.amperage,
            is_paid: reportForState.is_paid,
            photo_internal_unit_url: reportForState.photo_internal_unit_url,
            photo_external_unit_url: reportForState.photo_external_unit_url,
            order_id: reportForState.orderId || null,
        };

        try {
            if (isEditing) {
                await updateMaintenanceReport(reportId, reportForDb);
                UI.showAppNotification('Reporte actualizado con éxito.', 'success');
            } else {
                await saveMaintenanceReport(reportForDb);
                const { error: pointError } = await awardPointToTechnician(State.currentUser.id);
                if (pointError) {
                    UI.showAppNotification('Reporte guardado, pero hubo un error al sumar el punto.', 'warning');
                } else {
                    if (State.currentUser.points !== undefined && State.currentUser.points !== null) {
                        State.currentUser.points++;
                        UI.updateUserPointsDisplay(State.currentUser.points);
                    }
                    UI.showAppNotification('¡Reporte guardado con éxito y has ganado 1 punto!', 'success');
                }
            }

            if (orderIdValue) {
                const orderItemIdValue = D.reportOrderItemIdHidden?.value;
                if (orderItemIdValue) {
                    await incrementOrderItemCompletedQuantity(orderItemIdValue);
                    
                    const assignedOrder = State.assignedOrders.find(o => o.id === orderIdValue) || State.allServiceOrders.find(o => o.id === orderIdValue);
                    if (assignedOrder && assignedOrder.items) {
                        const itemToUpdate = assignedOrder.items.find(i => i.id === orderItemIdValue);
                        if (itemToUpdate) itemToUpdate.completed_quantity = (itemToUpdate.completed_quantity || 0) + 1;
                    }

                    const isOrderComplete = await checkAndCompleteOrderIfFinished(orderIdValue);
                    if (isOrderComplete) {
                        State.updateOrderInState(orderIdValue, { status: 'completed' });
                        UI.showAppNotification('La orden ha sido completada en su totalidad.', 'success', 6000);
                    }
                } else {
                    // Fail-safe: Si se grabó un reporte general sin ID de item, no completar la orden 
                    // si tiene items de tipo 'servicio'. Esto evita cerrar la orden accidentalmente.
                    const assignedOrder = State.assignedOrders.find(o => o.id === orderIdValue) || State.allServiceOrders.find(o => o.id === orderIdValue);
                    const isServiceItem = (desc: string) => /mano de obra|montaje|instalaci[oó]n|desmonte|mantenimiento/i.test(desc);
                    const hasServiceItems = assignedOrder?.items && assignedOrder.items.some(i => isServiceItem(i.description));
                    
                    if (!hasServiceItems) {
                        await updateOrderStatus(orderIdValue, 'completed');
                        State.updateOrderInState(orderIdValue, { status: 'completed' });
                    }
                }

                if (State.currentUser.role === 'worker') UI.renderAssignedOrdersList();
                else UI.renderAdminOrdersList();
                await cacheAllData('orders', State.allServiceOrders);
            }

            FormAutosave.clearDraft(); // LIMPIAR AUTOGUARDADO TRAS GUARDAR
            await refreshReportsState(); // Refresh from server on success
            UI.closeReportFormModal();

        } catch (onlineError: any) {
            const isNetworkError = onlineError.message.includes('Failed to fetch') || !navigator.onLine;

            if (isNetworkError && !isEditing) {
                console.warn("Online submission failed, falling back to offline queue.", onlineError);
                await addReportToQueue(reportForState);
                
                // Manually update local state if server refresh isn't possible
                State.setReports([reportForState, ...State.reports]);
                UI.renderMyReportsTable();
                if (State.currentUser.role === 'admin') UI.renderAdminReportsTable();
                
                FormAutosave.clearDraft(); // LIMPIAR AUTOGUARDADO TRAS GUARDAR
                UI.showAppNotification('Sin conexión. Reporte guardado localmente para sincronización.', 'info');
                UI.closeReportFormModal();
            } else {
                // It's a different error (e.g., Supabase policy, data validation), so re-throw it.
                throw onlineError;
            }
        }
    } catch (err: any) {
        UI.showAppNotification(`Error al guardar reporte: ${err.message}`, 'error');
        console.error(err);
    } finally {
        UI.hideLoader();
    }
}

async function handleEditReportAssignmentSubmit(e: SubmitEvent) {
    e.preventDefault();
    UI.showLoader('Guardando cambios...');

    try {
        const reportId = D.editReportAssignmentReportId.value;
        const originalReport = State.reports.find(r => r.id === reportId);
        if (!originalReport) throw new Error('No se encontró el reporte original.');

        const newCategory = D.editCategoryEmpresaRadio.checked ? 'empresa' : 'residencial';
        
        const reportUpdateData: Database['public']['Tables']['maintenance_reports']['Update'] = {};
        let updatedSnapshot = { ...originalReport.equipmentSnapshot };

        if (newCategory === 'empresa') {
            const newCompanyId = D.editReportCompanySelect.value;
            let newDependencyId = D.editReportDependencySelect.value;
            const newCompany = State.companies.find(c => c.id === newCompanyId);
            if (!newCompany) throw new Error('La empresa seleccionada no es válida.');

            if (State.editLocationState.newDependencyNameToCreate) {
                const formData = new FormData();
                formData.append('name', State.editLocationState.newDependencyNameToCreate);
                formData.append('company_id', newCompanyId);
                const { data: newDependency, error } = await saveEntity('dependency', '', formData);
                if (error) throw error;
                newDependencyId = newDependency.id;
                State.setDependencies(await fetchDependencies());
                await cacheAllData('dependencies', State.dependencies);
            }
            
            const newDependency = State.dependencies.find(d => d.id === newDependencyId);
            if (!newDependency) throw new Error('La dependencia seleccionada no es válida.');

            reportUpdateData.company_id = newCompanyId;
            reportUpdateData.dependency_id = newDependencyId;
            reportUpdateData.city_id = newCompany.cityId;
            
            updatedSnapshot = {
                ...updatedSnapshot,
                category: 'empresa',
                companyName: newCompany.name,
                dependencyName: newDependency.name,
                client_name: null,
                address: null,
            };

        } else { // newCategory is 'residencial'
            const newClientName = D.editReportClientNameInput.value;
            const newAddress = D.editReportClientAddressInput.value;
            const newCityId = D.editReportClientCitySelect.value;

            reportUpdateData.city_id = newCityId;
            reportUpdateData.company_id = null;
            reportUpdateData.dependency_id = null;

            updatedSnapshot = {
                ...updatedSnapshot,
                category: 'residencial',
                client_name: newClientName,
                address: newAddress,
                companyName: null,
                dependencyName: null,
            };
        }

        reportUpdateData.equipment_snapshot = updatedSnapshot as any;

        await updateMaintenanceReport(reportId, reportUpdateData);

        await refreshReportsState();

        UI.closeEditReportAssignmentModal();
        UI.showAppNotification('Asignación del reporte actualizada con éxito.', 'success');
        
        UI.openViewReportDetailsModal(reportId);

    } catch (err: any) {
        console.error('Error updating report assignment:', err);
        UI.showAppNotification(`Error al guardar: ${err.message}`, 'error');
    } finally {
        UI.hideLoader();
    }
}

async function handleRedeemPointsSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!D.redeemPointsForm) return;
    D.redeemPointsError.textContent = '';

    const userId = D.redeemPointsUserId.value;
    const pointsToRedeem = parseInt(D.pointsToRedeemInput.value, 10);
    const user = State.users.find(u => u.id === userId);
    
    if (!user) {
        UI.showAppNotification('Error: Usuario no encontrado.', 'error');
        return;
    }

    const currentPoints = user.points || 0;

    if (isNaN(pointsToRedeem) || pointsToRedeem <= 0) {
        D.redeemPointsError.textContent = 'La cantidad a redimir debe ser un número positivo.';
        return;
    }

    if (pointsToRedeem > currentPoints) {
        D.redeemPointsError.textContent = 'No se pueden redimir más puntos de los que tiene el empleado.';
        return;
    }

    const newTotalPoints = currentPoints - pointsToRedeem;
    
    UI.showLoader('Actualizando puntos...');
    try {
        await updateUserPoints(userId, newTotalPoints);
        
        // Update local state to avoid a full refetch
        const userInState = State.users.find(u => u.id === userId);
        if (userInState) {
            userInState.points = newTotalPoints;
        }

        UI.renderEmployeesTable();
        UI.closeRedeemPointsModal();
        UI.showAppNotification('Puntos redimidos con éxito.', 'success');
    } catch (error: any) {
        console.error('Failed to redeem points:', error);
        UI.showAppNotification(`Error al redimir puntos: ${error.message}`, 'error');
    } finally {
        UI.hideLoader();
    }
}


export function setupEventListeners() {
        // --- Capacitor: Detect network and app state ---
let lastNetworkStatus: boolean | null = null;
let networkListenerActive = false;

if (!networkListenerActive) {
  networkListenerActive = true;

  Network.addListener('networkStatusChange', async (status) => {
    console.log('[Network]', status);

    // Evitar mensajes repetidos si no cambió el estado real
    if (status.connected === lastNetworkStatus) return;
    lastNetworkStatus = status.connected;

    if (status.connected) {
      // 🟢 Cuando vuelve la conexión
      if (!currentUser || currentUser.role !== 'admin') {
        UI.showAppNotification('✅ Conexión restablecida. Sincronizando reportes...', 'success');
        await synchronizeQueue();
      } else {
        // Si es admin pero ya se había deslogueado antes
        UI.showAppNotification('🔐 Conexión restablecida. Inicie sesión nuevamente.', 'info');
      }
    } else {
      // 🔴 Cuando se pierde la conexión
      if (currentUser && currentUser.role === 'admin') {
        // Mostrar aviso de cierre automático
        UI.showAppNotification(
          '⚠️ Conexión perdida. Por seguridad, la sesión de administrador se ha cerrado automáticamente.',
          'warning'
        );

        // Esperar un poco para mostrar el mensaje antes de cerrar sesión
        setTimeout(() => {
          autoLogoutAdmin();
        }, 2000);
      } else {
        // Usuarios normales
        UI.showAppNotification('Sin conexión. Guardando reportes localmente...', 'warning');
      }
    }
  });
}


    App.addListener('appStateChange', (state) => {
        console.log('[App State]', state);
        if (state.isActive) {
            console.log('La app volvió a primer plano, intentando sincronizar...');
            synchronizeQueue();
        }
    });

    // --- Authentication ---
    D.loginForm?.addEventListener('submit', Auth.handleLogin);
    D.logoutButton?.addEventListener('click', Auth.handleLogout);
    D.adminLoginButton?.addEventListener('click', Auth.openAdminPasswordModal);
    D.adminPasswordForm?.addEventListener('submit', Auth.handleAdminPasswordSubmit);
    D.closeAdminPasswordModal?.addEventListener('click', Auth.closeAdminPasswordModal);
    D.changePasswordActionButton?.addEventListener('click', Auth.openChangePasswordModal);
    D.changePasswordForm?.addEventListener('submit', Auth.handleChangePasswordSubmit);
    D.closeChangePasswordModal?.addEventListener('click', Auth.closeChangePasswordModal);
    D.cancelChangePasswordButton?.addEventListener('click', Auth.closeChangePasswordModal);

    // --- Main UI ---
    D.toggleFullscreenButton?.addEventListener('click', toggleFullscreen);
    
    // --- Online/Offline Status ---
    window.addEventListener('online', () => {
        UI.showAppNotification('Conexión a internet restablecida.', 'success');
        if (D.reportFormModal.style.display === 'flex') {
            D.aiScanPlateButton.disabled = false;
        }
        stopPeriodicSync(); // Detiene los intentos periódicos ya que estamos en línea
        console.log('[Sync] Conexión restablecida. Activando sincronización inmediata.');
        synchronizeQueue(); // Activa una sincronización inmediata
        if (D.reportFormModal.style.display === 'flex') {
        D.aiScanPlateButton.disabled = false;
        }
        if (D.aiScanOfflineWarning) {
        D.aiScanOfflineWarning.style.display = 'none';
        }
    });

    window.addEventListener('offline', () => {
        if (D.reportFormModal.style.display === 'flex') {
            D.aiScanPlateButton.disabled = true;
        }
        UI.showAppNotification('Se ha perdido la conexión. Trabajando en modo offline.', 'warning');
        startPeriodicSync(); // Inicia los intentos de sincronización periódicos
        if (D.reportFormModal.style.display === 'flex') {
        D.aiScanPlateButton.disabled = true;
        }
        if (D.aiScanOfflineWarning) {
        D.aiScanOfflineWarning.style.display = 'block';
        }
    });

    // --- Modals ---
    D.closeReportFormModalButton?.addEventListener('click', UI.closeReportFormModal);
    D.cancelReportButton?.addEventListener('click', UI.closeReportFormModal);
    D.closeEntityFormModalButton?.addEventListener('click', UI.closeEntityFormModal);
    D.cancelEntityButton?.addEventListener('click', UI.handleCancelEntityForm);
    D.closeViewReportDetailsModalButton?.addEventListener('click', () => D.viewReportDetailsModal.style.display = 'none');
    D.closeViewReportButton?.addEventListener('click', () => D.viewReportDetailsModal.style.display = 'none');
    D.closeImagePreviewModalButton?.addEventListener('click', () => D.imagePreviewModal.style.display = 'none');
    D.closeConfirmationModalButton?.addEventListener('click', () => UI.resolveConfirmation(false));
    D.cancelActionButton?.addEventListener('click', () => UI.resolveConfirmation(false));
    D.closeCategorySelectionModalButton?.addEventListener('click', UI.closeCategorySelectionModal);
    D.cancelCategorySelectionButton?.addEventListener('click', UI.closeCategorySelectionModal);
    D.closeEquipmentSelectionModalButton?.addEventListener('click', UI.closeEquipmentSelectionModal);
    D.cancelEquipmentSelectionButton?.addEventListener('click', UI.closeEquipmentSelectionModal);
    D.closeOrderDetailsModalButton?.addEventListener('click', () => D.orderDetailsModal.style.display = 'none');
    D.closeOrderDetailsButton?.addEventListener('click', () => D.orderDetailsModal.style.display = 'none');
    D.closeAiReconciliationModal?.addEventListener('click', UI.closeAiReconciliationModal);
    D.closeAiReconciliationBtn?.addEventListener('click', UI.closeAiReconciliationModal);
    D.closeRedeemPointsModal?.addEventListener('click', UI.closeRedeemPointsModal);
    D.cancelRedeemPointsButton?.addEventListener('click', UI.closeRedeemPointsModal);
    
    // New unified edit assignment modal listeners
    D.editReportAssignmentForm?.addEventListener('submit', handleEditReportAssignmentSubmit);
    D.closeEditReportAssignmentModal?.addEventListener('click', UI.closeEditReportAssignmentModal);
    D.cancelEditReportAssignmentButton?.addEventListener('click', UI.closeEditReportAssignmentModal);
    D.editCategoryEmpresaRadio?.addEventListener('change', UI.toggleAssignmentFields);
    D.editCategoryResidencialRadio?.addEventListener('change', UI.toggleAssignmentFields);
    D.editReportCompanySelect?.addEventListener('change', UI.handleAssignmentCompanyChange);
    D.editReportDependencySelect?.addEventListener('change', () => {
        if (State.editLocationState.newDependencyNameToCreate) {
            State.editLocationState.newDependencyNameToCreate = null;
            D.editReportDependencyWarning.style.display = 'none';
            D.saveEditReportAssignmentButton.disabled = false;
            D.editReportDependencySelect.setAttribute('required', 'true');
        }
    });

    // --- Worker Actions ---
    D.createManualReportButton?.addEventListener('click', () => UI.openCategorySelectionModal('manual'));
    D.searchByIdButton?.addEventListener('click', () => UI.openCategorySelectionModal('search'));
    D.toggleMyReportsViewButton?.addEventListener('click', async () => {
        State.setShowAllMyReports(!State.showAllMyReports);
        D.toggleMyReportsViewButton.textContent = State.showAllMyReports ? 'Ver Recientes' : 'Ver Todos';
        UI.showLoader('Cargando reportes...');
        try {
            const reports = await withTimeout(
                fetchReportsForWorker(State.currentUser!.id, State.showAllMyReports ? {} : { daysBack: 4 }),
                FETCH_TIMEOUT_MS,
                'reportes técnico'
            );
            State.setReports(reports);
            UI.renderMyReportsTable();
        } catch (err: any) {
            console.error('Error al alternar vista de reportes:', err);
            UI.showAppNotification('No se pudieron cargar los reportes.', 'error');
        } finally {
            UI.hideLoader();
        }
    });

    // Botón dinámico para alternar "Ver Todos" en admin (evita cargar todo por defecto)
    if (D.adminReportsSearchInput && !document.getElementById('admin-toggle-reports-btn')) {
        const adminToggleBtn = document.createElement('button');
        adminToggleBtn.id = 'admin-toggle-reports-btn';
        adminToggleBtn.type = 'button';
        adminToggleBtn.textContent = State.showAllAdminReports ? 'Ver Recientes' : 'Ver Todos';
        adminToggleBtn.className = 'btn btn-secondary';
        adminToggleBtn.style.marginLeft = '8px';
        D.adminReportsSearchInput.insertAdjacentElement('afterend', adminToggleBtn);

        adminToggleBtn.addEventListener('click', async () => {
            const nextShowAll = !State.showAllAdminReports;
            State.setShowAllAdminReports(nextShowAll);
            setAdminReportsToFirstPage();
            adminToggleBtn.textContent = nextShowAll ? 'Ver Recientes' : 'Ver Todos';

            try {
                if (nextShowAll) {
                    const loaded = await ensureFullAdminReportsDataset('Cargando todos los reportes...');
                    if (!loaded) {
                        State.setShowAllAdminReports(false);
                        adminToggleBtn.textContent = 'Ver Todos';
                    }
                } else if (hasActiveAdminReportsQuery()) {
                    State.setIsUsingFullAdminReportsDataset(true);
                } else {
                    const restored = await restoreRecentAdminReportsDataset();
                    if (!restored) {
                        State.setShowAllAdminReports(true);
                        adminToggleBtn.textContent = 'Ver Recientes';
                    }
                }
                UI.renderAdminReportsTable();
            } catch (err: any) {
                console.error('Error al alternar vista de reportes (admin):', err);
                UI.showAppNotification('No se pudieron cargar los reportes.', 'error');
            }
        });
    }
    
    // --- Category & Equipment Selection ---
    D.selectCategoryEmpresaButton?.addEventListener('click', () => {
        State.manualReportCreationState.category = 'empresa';
        if (State.manualReportCreationState.nextAction === 'search') UI.openEquipmentSelectionModal();
        else UI.openReportFormModal({ category: 'empresa' });
        D.categorySelectionModal.style.display = 'none';
    });
    D.selectCategoryResidencialButton?.addEventListener('click', () => {
        State.manualReportCreationState.category = 'residencial';
        if (State.manualReportCreationState.nextAction === 'search') UI.openEquipmentSelectionModal();
        else UI.openReportFormModal({ category: 'residencial' });
        D.categorySelectionModal.style.display = 'none';
    });
    D.equipmentSelectionSearchInput?.addEventListener('input', UI.renderEquipmentSelectionResults);
    D.createNewEquipmentFromSelectionBtn?.addEventListener('click', UI.handleCreateNewEquipmentFromSelection);
    D.continueWithoutEquipmentButton?.addEventListener('click', UI.handleContinueWithoutEquipment);


    // --- Form Submissions ---
    D.maintenanceReportForm?.addEventListener('submit', handleMaintenanceReportSubmit);
    D.maintenanceReportForm?.addEventListener('input', UI.updateSaveReportButtonState);
    D.entityForm?.addEventListener('submit', handleEntityFormSubmit);
    D.redeemPointsForm?.addEventListener('submit', handleRedeemPointsSubmit);

    // --- Report Form Dynamics ---
    D.reportServiceTypeSelect?.addEventListener('change', (e) => UI.toggleReportFormFields((e.target as HTMLSelectElement).value));
    D.reportCompanySelect?.addEventListener('change', (e) => UI.updateLocationDropdownsFromCompany((e.target as HTMLSelectElement).value));
    D.reportCompanySearchInput?.addEventListener('input', UI.renderCompanySearchResults);
    D.reportCompanySearchInput?.addEventListener('focus', UI.renderCompanySearchResults);
    D.reportCompanySearchResults?.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest<HTMLElement>('.company-search-result');
        const companyId = target?.dataset.companyId;
        if (companyId) {
            UI.setReportCompanySelection(companyId);
        }
    });
    D.reportCompanyBadgeClearButton?.addEventListener('click', () => UI.clearReportCompanySelection());
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (D.reportCompanySearchContainer && !D.reportCompanySearchContainer.contains(target)) {
            if (D.reportCompanySearchResults) D.reportCompanySearchResults.innerHTML = '';
        }
    });
    D.openSignatureModalButton?.addEventListener('click', () => UI.openSignatureModal());
    D.closeSignatureModalButton?.addEventListener('click', UI.closeSignatureModal);
    D.aiScanPlateButton?.addEventListener('click', async () => {
        UI.showLoader('Verificando conexión...');
        try {
            // Perform a lightweight fetch request to a reliable endpoint to confirm internet access.
            // A HEAD request to the Supabase URL is a good choice.
            // 'no-cors' mode prevents CORS issues; we only care if the request succeeds or fails.
            // A timeout is crucial to prevent the app from hanging on a slow network.
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout
            
            await fetch('https://fzcalgofrhbqvowazdpk.supabase.co', { 
                method: 'HEAD', 
                mode: 'no-cors', 
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            // If the fetch succeeds, we are online.
            UI.hideLoader();
            UI.openPlateScanModal('report');

        } catch (error) {
            // If the fetch fails (e.g., network error, timeout), we are offline.
            UI.hideLoader();
            console.warn("Connectivity check failed:", error);
            UI.showAppNotification('No hay conexión a internet. Por favor, llene los campos manualmente.', 'warning', 5000);
        }
    });
    D.closePlateScanModal?.addEventListener('click', UI.closePlateScanModal);
    D.cancelPlateScanButton?.addEventListener('click', UI.closePlateScanModal);
    D.takePictureButton?.addEventListener('click', UI.handlePlatePictureTaken);

    // Photo Capture
    D.takeInternalUnitPhotoButton?.addEventListener('click', () => UI.triggerPhotoCapture('internal', 'CAMERA'));
    D.uploadInternalUnitPhotoButton?.addEventListener('click', () => UI.triggerPhotoCapture('internal', 'PHOTOS'));
    
    D.takeExternalUnitPhotoButton?.addEventListener('click', () => UI.triggerPhotoCapture('external', 'CAMERA'));
    D.uploadExternalUnitPhotoButton?.addEventListener('click', () => UI.triggerPhotoCapture('external', 'PHOTOS'));
    
    D.closePhotoCaptureModalButton?.addEventListener('click', UI.closePhotoCaptureModal);
    D.cancelPhotoCaptureButton?.addEventListener('click', UI.closePhotoCaptureModal);
    D.capturePhotoButton?.addEventListener('click', UI.handlePhotoCaptured);
    
    // Inputs file change events
    const handleUploadInput = async (e: Event) => {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        
        UI.showLoader("Procesando imagen...");
        try {
            const file = input.files[0];
            // Since we bypassed the modal, we need to temporarily set the type
            const isInternal = input.id.includes('internal');
            State.setCurrentPhotoCaptureType(isInternal ? 'internal' : 'external');
            await UI.handlePhotoUploadWeb(file);
        } catch (error) {
            console.error("Upload error", error);
            UI.showAppNotification("Error procesando imagen", "error");
        } finally {
            input.value = ''; // Reset input
            UI.hideLoader();
        }
    };
    
    D.uploadInternalUnitInput?.addEventListener('change', handleUploadInput);
    D.uploadExternalUnitInput?.addEventListener('change', handleUploadInput);
    
    D.photoCaptureUploadButton?.addEventListener('click', () => {
        D.photoCaptureUploadInput?.click();
    });

    D.photoCaptureUploadInput?.addEventListener('change', async (e) => {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        
        UI.showLoader("Procesando imagen...");
        try {
            const file = input.files[0];
            await UI.handlePhotoUploadWeb(file);
        } catch (error) {
            console.error("Upload error", error);
            UI.showAppNotification("Error procesando imagen", "error");
        } finally {
            input.value = ''; // Reset input
            UI.hideLoader();
        }
    });
    
    // --- Table/List Event Delegation ---
    document.body.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement>('.action-btn, .link-report-btn, .report-item-btn');
        const card = target.closest<HTMLDivElement>('.order-card');
        const editPhotoBtn = target.closest<HTMLButtonElement>('button[data-action="edit-photo"]');

        const copyBtn = target.closest<HTMLButtonElement>('.copy-info-btn');
        if (copyBtn) {
            const textToCopy = copyBtn.dataset.copyText;
            if (textToCopy) {
                try {
                    await navigator.clipboard.writeText(textToCopy);
                    UI.showAppNotification('Copiado al portapapeles', 'success');
                } catch (err) {
                    console.error('Error al copiar:', err);
                    UI.showAppNotification('Error al copiar', 'error');
                }
            }
            return;
        }

        if (editPhotoBtn) {
            const reportId = editPhotoBtn.dataset.reportId;
            const photoType = editPhotoBtn.dataset.photoType as 'internal' | 'external';
            
            if (!reportId || !photoType) return;

            // Store context for the handler
            State.setContextForPhotoUpdate({ reportId, photoType });

            // For workers, open the camera capture modal. For admins, open file upload.
            if (State.currentUser?.role === 'worker') {
                UI.openPhotoCaptureModal(photoType);
            } else if (State.currentUser?.role === 'admin') {
                D.adminPhotoUploadInput.click();
            }
            return; // Stop further processing
        }


        const openDetailsBtn = target.closest<HTMLButtonElement>('.open-order-details-btn');

        if (openDetailsBtn) {
            const orderId = openDetailsBtn.dataset.orderId;
            if (orderId) UI.openOrderDetailsModal(orderId);
            return;
        }

        if (!btn) return;

        // --- Order Item Reporting ---
        if (btn.matches('.report-item-btn')) {
            const orderId = btn.dataset.orderId!;
            const itemId = btn.dataset.itemId!;
            const order = State.assignedOrders.find(o => o.id === orderId) || State.allServiceOrders.find(o => o.id === orderId);
            if (order) {
                D.orderDetailsModal.style.display = 'none';

                let determinedCategory: 'empresa' | 'residencial' = 'residencial';
                const clientName = order.clientDetails?.name;
                if (clientName) {
                    const matchedCompany = State.companies.find(c => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());
                    if (matchedCompany) {
                        determinedCategory = 'empresa';
                    }
                }

                let sTypeToPass: string | undefined = order.order_type || undefined;
                const item = order.items?.find(i => i.id === itemId);
                if (item) {
                    const exactMatch = State.serviceTypes.find(st => st.name.trim().toLowerCase() === item.description.trim().toLowerCase());
                    if (exactMatch) {
                        sTypeToPass = exactMatch.name;
                    } else {
                        sTypeToPass = "Otro: " + item.description;
                    }
                }

                await UI.openReportFormModal({ 
                    category: determinedCategory,
                    isFromOrder: true,
                    serviceType: sTypeToPass,
                    order: order,
                    orderItemId: itemId
                });
            }
            return;
        }

        // --- AI Reconciliation Actions ---
        if (btn.matches('.link-report-btn')) {
            const orderId = btn.dataset.orderId!;
            const reportId = btn.dataset.reportId!;
            
            const confirmed = await UI.showConfirmationModal(`¿Vincular reporte #${reportId.substring(0,8)} con la orden #${orderId.substring(0,8)}? Esta acción marcará la orden como 'Completada'.`, 'Vincular');
            if (confirmed) {
                UI.showLoader('Vinculando...');
                try {
                    // Update report to link to order
                    await updateMaintenanceReport(reportId, { order_id: orderId });
                    // Update order status to completed
                    await updateOrderStatus(orderId, 'completed');
                    
                    // Refresh local state
                    State.updateOrderInState(orderId, { status: 'completed' });
                    const report = State.reports.find(r => r.id === reportId);
                    if(report) report.orderId = orderId;
                    await cacheAllData('orders', State.allServiceOrders);
                    
                    // Re-render relevant views
                    UI.renderAdminOrdersList();
                    await refreshReportsState();
                    
                    // Remove the card from the AI modal
                    btn.closest('.reconciliation-card')?.remove();
                    
                    UI.showAppNotification('Orden y reporte vinculados exitosamente.', 'success');
                } catch (error: any) {
                    console.error("Error linking report and order:", error);
                    UI.showAppNotification(`Error al vincular: ${error.message}`, 'error');
                } finally {
                    UI.hideLoader();
                }
            }
        }

        // --- Report Actions ---
        if (btn.matches('.view-report-btn')) UI.openViewReportDetailsModal(btn.dataset.reportId!);
        if (btn.matches('.edit-signature-btn')) {
            const reportId = btn.dataset.reportId!;
            UI.openSignatureModal(reportId);
        }
        if (btn.matches('.add-photos-btn')) {
            const reportId = btn.dataset.reportId!;
            const report = State.reports.find(r => r.id === reportId);
            if (report) {
                const needsInternal = !report.photo_internal_unit_url || report.photo_internal_unit_url === 'PENDING_PHOTO';
                const needsExternal = !report.photo_external_unit_url || report.photo_external_unit_url === 'PENDING_PHOTO';
                const photoType: 'internal' | 'external' = needsInternal ? 'internal' : 'external';
                State.setContextForPhotoUpdate({ reportId, photoType });
                UI.openPhotoCaptureModal(photoType);
            }
        }
        if (btn.matches('.edit-report-btn')) {
             const report = State.reports.find(r => r.id === btn.dataset.reportId);
             if (report) UI.openReportFormModal({ report });
        }
        if (btn.matches('.delete-report-btn')) {
            const reportId = btn.dataset.reportId!;
            const confirmed = await UI.showConfirmationModal(`¿Eliminar reporte ${reportId.substring(0,8)}? Esto también anulará el punto otorgado al técnico.`, 'Eliminar');
            if (confirmed) {
                UI.showLoader('Eliminando y ajustando puntos...');
                try {
                    // Find the report to identify the worker and deduct points
                    const reportToDelete = State.reports.find(r => r.id === reportId);
                    
                    if (reportToDelete && reportToDelete.workerId) {
                        const worker = State.users.find(u => u.id === reportToDelete.workerId);
                        
                        // If worker exists and has points, deduct one point
                        if (worker && worker.points && worker.points > 0) {
                            const newPointTotal = worker.points - 1;
                            await updateUserPoints(worker.id, newPointTotal);
                        }
                    }

                    // Then delete the report
                    await apiDeleteReport(reportId);

                    // Refetch users to get updated points, and refresh reports
                    State.setUsers(await fetchUsers());
                    await refreshReportsState();

                    // Re-render relevant tables to reflect the changes
                    UI.renderEmployeesTable();

                    UI.showAppNotification('Reporte eliminado y punto del técnico ajustado.', 'success');

                } catch (error: any) {
                    console.error('Error deleting report and adjusting points:', error);
                    UI.showAppNotification(`Error al eliminar: ${error.message}`, 'error');
                } finally {
                    UI.hideLoader();
                }
            }
        }
        if (btn.matches('.toggle-paid-status-btn')) {
            const reportId = btn.dataset.reportId!;
            const currentStatus = btn.dataset.currentStatus === 'true';
            await toggleReportPaidStatus(reportId, currentStatus);
            await refreshReportsState();
        }
        if (btn.matches('.create-report-from-schedule-btn')) {
            const equipment = State.equipmentList.find(eq => eq.id === btn.dataset.equipmentId);
            if(equipment) UI.openReportFormModal({ equipment, category: equipment.category as any });
        }

        // --- Entity Actions ---
        if (btn.matches('.edit-btn')) {
            UI.openEntityFormModal(btn.dataset.type as EntityType, btn.dataset.id);
        }
        if (btn.matches('.delete-btn')) {
            const type = btn.dataset.type as EntityType;
            const id = btn.dataset.id!;
            const name = btn.closest('tr')?.querySelector('td')?.textContent || `ID: ${id}`;
            handleDeleteEntity(type, id, name);
        }
        if (btn.matches('.toggle-employee-status-btn')) {
            await toggleEmployeeStatus(btn.dataset.userId!, btn.dataset.currentStatus === 'true');
            State.setUsers(await fetchUsers());
            UI.renderEmployeesTable();
        }
        if (btn.matches('.redeem-points-btn')) {
            const userId = btn.dataset.userId!;
            const userName = btn.dataset.userName!;
            const currentPoints = btn.dataset.currentPoints!;
            UI.openRedeemPointsModal(userId, userName, currentPoints);
        }
        if (btn.matches('.download-qr-btn')) {
            const manualId = btn.dataset.equipmentManualId;
            const model = btn.dataset.equipmentModel;
            if (!manualId) { UI.showAppNotification('Este equipo no tiene ID Manual para generar QR.', 'warning'); return; }
            const canvas = document.createElement('canvas');
            QRCode.toCanvas(canvas, manualId, { width: 300 }, (error) => {
                if (error) console.error(error);
                const link = document.createElement('a');
                link.download = `QR_${model}_${manualId}.png`;
                link.href = canvas.toDataURL();
                link.click();
            });
        }
    });

    // Delegated listener for adding new options from forms
    document.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const addBtn = target.closest<HTMLButtonElement>('.btn-add-inline');
        if (addBtn) {
            const entityType = addBtn.dataset.entityType as EntityType;
            const context: any = {
                source: 'reportForm', // Default source
            };
            
            // Determine the context more accurately
            if (addBtn.closest('#report-form-modal')) {
                context.source = 'reportForm';
                // If creating a dependency, capture the currently selected company
                if (entityType === 'dependency') {
                    const selectedCompanyId = D.reportCompanySelect.value;
                    if (!selectedCompanyId) {
                        UI.showAppNotification('Seleccione una empresa primero', 'warning');
                        return;
                    }
                    context.selectedCompanyId = selectedCompanyId;
                }
            } else if (addBtn.closest('#entity-form-modal')) {
                context.source = 'entityForm';
                context.originalEntityId = D.entityIdInput.value;
                 if (entityType === 'dependency') {
                    const companySelect = D.entityFormFieldsContainer.querySelector('#equipment-company') as HTMLSelectElement | null;
                    if(companySelect) context.selectedCompanyId = companySelect.value;
                }
            }

            UI.openEntityFormModal(entityType, undefined, context);
        }
    });

    // --- Admin Management Section ---
    D.addCityButton?.addEventListener('click', () => UI.openEntityFormModal('city'));
    D.addCompanyButton?.addEventListener('click', () => UI.openEntityFormModal('company'));
    D.addDependencyButton?.addEventListener('click', () => UI.openEntityFormModal('dependency'));
    D.addEmployeeButton?.addEventListener('click', () => UI.openEntityFormModal('employee'));
    D.addEquipmentButton?.addEventListener('click', () => UI.openEntityFormModal('equipment', undefined, { source: 'entityForm' }, 'empresa'));
    D.tabLinks.forEach(link => link.addEventListener('click', UI.handleTabClick));
    D.deleteAllReportsButton?.addEventListener('click', async () => {
        const confirmed = await UI.showConfirmationModal('¿Está seguro de ELIMINAR TODOS LOS REPORTES? Esta acción es irreversible.', 'ELIMINAR TODO');
        if (confirmed) {
            UI.showLoader('Eliminando todos los reportes...');
            await apiDeleteAllReports();
            await refreshReportsState();
            UI.hideLoader();
        }
    });
    D.adminManagementSection.addEventListener('change', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('#app-settings-container') && target.matches('input[type="checkbox"]')) {
            handleAppSettingChange(e);
        }
    });

    D.adminPhotoUploadInput?.addEventListener('change', async (e) => {
        const input = e.target as HTMLInputElement;
        if (!input.files || input.files.length === 0) return;
        if (!State.contextForPhotoUpdate) return;

        const file = input.files[0];
        const { reportId, photoType } = State.contextForPhotoUpdate;

        UI.showLoader("Subiendo y actualizando foto...");
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                try {
                    const base64Data = reader.result as string;
                    
                    const updateData: any = {};
                    if (photoType === 'internal') {
                        updateData.photo_internal_unit_url = base64Data;
                    } else {
                        updateData.photo_external_unit_url = base64Data;
                    }

                    await withTimeout(
                        updateMaintenanceReport(reportId, updateData),
                        FETCH_TIMEOUT_MS,
                        'actualizar foto'
                    );
                    await updateLocalReport(reportId, updateData);

                    // Actualizar estado en memoria sin refetch completo
                    const reportInState = State.reports.find(r => r.id === reportId);
                    if (reportInState) {
                        if (photoType === 'internal') {
                            reportInState.photo_internal_unit_url = base64Data;
                        } else {
                            reportInState.photo_external_unit_url = base64Data;
                        }
                        const requiresPhotos = reportInState.serviceType === 'Montaje/Instalación';
                        const hasInternal = !!reportInState.photo_internal_unit_url && reportInState.photo_internal_unit_url !== 'PENDING_PHOTO';
                        const hasExternal = !!reportInState.photo_external_unit_url && reportInState.photo_external_unit_url !== 'PENDING_PHOTO';
                        reportInState.arePhotosPending = requiresPhotos ? !(hasInternal && hasExternal) : false;
                    }
                    UI.renderMyReportsTable();
                    UI.renderAdminReportsTable();
                    UI.showAppNotification('Foto actualizada con éxito.', 'success');
                    UI.openViewReportDetailsModal(reportId);
                } catch (error: any) {
                    throw error;
                } finally {
                    UI.hideLoader();
                    State.setContextForPhotoUpdate(null);
                    input.value = '';
                }
            };
            reader.onerror = (error) => {
                throw error;
            };

        } catch (error: any) {
            UI.showAppNotification(`Error al actualizar la foto: ${error.message}`, 'error');
            UI.hideLoader();
            State.setContextForPhotoUpdate(null);
            input.value = '';
        }
    });

    // --- AI Reconciliation ---
    D.aiReconciliationBtn?.addEventListener('click', runAiReconciliation);
    D.downloadZipButton?.addEventListener('click', UI.handleDownloadReportsZip);
    D.downloadMergedPdfButton?.addEventListener('click', UI.handleDownloadReportsMergedPdf);


    // --- Filters ---
    const adminReportsFilterElements = [D.filterReportDateStart, D.filterReportDateEnd, D.filterReportCity, D.filterReportCompany, D.filterReportServiceType, D.filterReportTechnician, D.filterReportCategory, D.filterReportPaid];
    adminReportsFilterElements.forEach(el => el?.addEventListener('change', async () => {
        setAdminReportsToFirstPage();
        await syncAdminReportsDatasetForQuery();
        UI.renderAdminReportsTable();
    }));
    D.adminReportsSearchInput?.addEventListener('input', async () => {
        State.setTableSearchTerm('adminReports', D.adminReportsSearchInput.value);
        setAdminReportsToFirstPage();
        await syncAdminReportsDatasetForQuery();
        UI.renderAdminReportsTable();
    });
    D.adminReportsSearchClearButton?.addEventListener('click', async () => {
        D.adminReportsSearchInput.value = '';
        State.setTableSearchTerm('adminReports', '');
        setAdminReportsToFirstPage();
        await syncAdminReportsDatasetForQuery();
        UI.renderAdminReportsTable();
    });
    
    const adminOrdersFilterElements = [D.filterOrderDateStart, D.filterOrderDateEnd, D.filterOrderStatus, D.filterOrderType, D.filterOrderTechnician];
    adminOrdersFilterElements.forEach(el => el?.addEventListener('change', UI.renderAdminOrdersList));
    D.adminOrdersSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('adminOrders', D.adminOrdersSearchInput.value); UI.renderAdminOrdersList(); });
    D.adminOrdersSearchClearButton?.addEventListener('click', () => { D.adminOrdersSearchInput.value = ''; State.setTableSearchTerm('adminOrders', ''); UI.renderAdminOrdersList(); });

    D.toggleFiltersBtn?.addEventListener('click', () => D.adminFiltersCollapsibleArea.classList.toggle('active'));
    D.toggleOrderFiltersBtn?.addEventListener('click', () => D.adminOrderFiltersCollapsibleArea.classList.toggle('active'));

    // Other tables searches
    D.myReportsSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('myReports', D.myReportsSearchInput.value); UI.renderMyReportsTable(); });
    D.myReportsSearchClearButton?.addEventListener('click', () => { D.myReportsSearchInput.value = ''; State.setTableSearchTerm('myReports', ''); UI.renderMyReportsTable(); });
    D.adminEquipmentSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('adminEquipment', D.adminEquipmentSearchInput.value); UI.renderAdminEquipmentTable(); });
    D.adminEquipmentSearchClearButton?.addEventListener('click', () => { D.adminEquipmentSearchInput.value = ''; State.setTableSearchTerm('adminEquipment', ''); UI.renderAdminEquipmentTable(); });

    // Dynamic item quantity update
    D.reportInstallationItemsTableBody.addEventListener('change', async (e) => {
        const target = e.target as HTMLInputElement;
        if (target.classList.contains('quantity-input')) {
            const orderItemId = target.dataset.orderItemId;
            if (orderItemId) {
                try {
                    UI.showLoader('Actualizando cantidad...');
                    const newQuantity = parseInt(target.value, 10);
                    await updateOrderItemQuantity(orderItemId, newQuantity);
                    // Update state to reflect change without full reload
                    const orderId = D.reportOrderIdHidden.value;
                    const order = State.allServiceOrders.find(o => o.id === orderId) || State.assignedOrders.find(o => o.id === orderId);
                    if (order && order.items) {
                        const item = order.items.find(i => i.id === orderItemId);
                        if (item) item.quantity = newQuantity;
                    }
                    await cacheAllData('orders', State.allServiceOrders);
                } catch (error) {
                    console.error('Failed to update quantity', error);
                    UI.showAppNotification('No se pudo actualizar la cantidad.', 'error');
                } finally {
                    UI.hideLoader();
                }
            }
        }
    });

     // Order Actions
    D.startReportFromOrderButton?.addEventListener('click', async (e) => {
        const orderId = (e.currentTarget as HTMLButtonElement).dataset.orderId;
        // Check both worker's assigned orders and all orders (for admin)
        const order = State.assignedOrders.find(o => o.id === orderId) || State.allServiceOrders.find(o => o.id === orderId);
        
        if (order) {
            D.orderDetailsModal.style.display = 'none';

            // Determine category by trying to match client name with a known company
            let determinedCategory: 'empresa' | 'residencial' = 'residencial'; // Default
            const clientName = order.clientDetails?.name;
            if (clientName) {
                const matchedCompany = State.companies.find(c => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());
                if (matchedCompany) {
                    determinedCategory = 'empresa';
                }
            }

            await UI.openReportFormModal({ 
                category: determinedCategory,
                isFromOrder: true,
                serviceType: order.order_type || undefined,
                order: order,
             });
        }
    });
}
