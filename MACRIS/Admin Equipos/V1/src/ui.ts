
import * as D from './dom';
import { formatDate } from './utils';
import * as State from './state';
import { Equipment } from './types';
import { saveEntity, fetchEquipment, deleteEntity } from './api';

// FIX: Added global variable to track the camera stream for the plate scanner and prevent undefined reference errors
let plateCameraStream: MediaStream | null = null;

export function showLoader(message: string = 'Cargando...') {
    if (D.loadingOverlay) {
        const p = D.loadingOverlay.querySelector('p');
        if (p) p.textContent = message;
        D.loadingOverlay.style.display = 'flex';
    }
}

export function hideLoader() {
    if (D.loadingOverlay) D.loadingOverlay.style.display = 'none';
}

export function showAppNotification(message: string, type: 'error' | 'success' | 'info' | 'warning' = 'info', duration: number = 3000) {
    if (!D.notificationArea) return;
    const div = document.createElement('div');
    div.classList.add('app-notification', type);
    div.innerHTML = `<div>${message}</div>`;
    D.notificationArea.appendChild(div);
    setTimeout(() => {
        div.classList.add('removing');
        div.addEventListener('animationend', () => div.remove());
    }, duration);
}

export function showConfirmationModal(message: string): Promise<boolean> {
    if (!D.confirmationModal) return Promise.resolve(false);
    D.confirmationMessage.textContent = message;
    D.confirmationModal.style.display = 'flex';
    return new Promise(resolve => {
        D.confirmActionButton.onclick = () => { D.confirmationModal.style.display = 'none'; resolve(true); };
        D.cancelActionButton.onclick = () => { D.confirmationModal.style.display = 'none'; resolve(false); };
    });
}

export function showInfoModal(message: string, title: string = 'Aviso') {
    if (!D.infoModal) return;
    D.infoModalTitle.textContent = title;
    D.infoModalMessage.textContent = message;
    D.infoModal.style.display = 'flex';
}

export function closeInfoModal() {
    if (D.infoModal) D.infoModal.style.display = 'none';
}

type QuickAddType = 'city' | 'company' | 'dependency';

const QUICK_ADD_COPY: Record<QuickAddType, { title: string; nameLabel: string; placeholder: string; parentLabel?: string }> = {
    city: {
        title: 'Agregar Ciudad',
        nameLabel: 'Nombre de la ciudad',
        placeholder: 'Ej: Medellin',
    },
    company: {
        title: 'Agregar Empresa',
        nameLabel: 'Nombre de la empresa',
        placeholder: 'Ej: Macris',
        parentLabel: 'Ciudad',
    },
    dependency: {
        title: 'Agregar Dependencia',
        nameLabel: 'Nombre de la dependencia',
        placeholder: 'Ej: Sede Norte',
        parentLabel: 'Empresa seleccionada',
    },
};

export function openQuickAddModal(options: { type: QuickAddType; parentId?: string; parentName?: string }) {
    if (!D.quickAddModal) return;
    const copy = QUICK_ADD_COPY[options.type];
    D.quickAddTitle.innerHTML = `<i class="fas fa-plus-circle"></i> ${copy.title}`;
    D.quickAddTypeInput.value = options.type;
    D.quickAddNameLabel.textContent = copy.nameLabel;
    D.quickAddNameInput.placeholder = copy.placeholder;
    D.quickAddNameInput.value = '';
    if (D.btnQuickAddParentCity) D.btnQuickAddParentCity.style.display = 'none';

    if (options.type === 'city') {
        D.quickAddParentGroup.style.display = 'none';
        D.quickAddParentIdInput.value = '';
        D.quickAddParentName.value = '';
        D.quickAddParentSelect.classList.add('visually-hidden');
        D.quickAddParentSelect.style.display = 'none';
    } else {
        D.quickAddParentGroup.style.display = 'block';
        D.quickAddParentLabel.textContent = copy.parentLabel || 'Seleccionado';
        if (options.type === 'company') {
            D.quickAddParentName.value = '';
            D.quickAddParentName.classList.add('visually-hidden');
            D.quickAddParentName.style.display = 'none';
            D.quickAddParentSelect.classList.remove('visually-hidden');
            D.quickAddParentSelect.style.display = 'block';
            populateDropdown(D.quickAddParentSelect, State.cities, options.parentId || '', 'Seleccione ciudad...');
            D.quickAddParentIdInput.value = D.quickAddParentSelect.value || options.parentId || '';
            D.quickAddParentSelect.onchange = () => {
                D.quickAddParentIdInput.value = D.quickAddParentSelect.value;
            };
            if (D.btnQuickAddParentCity) D.btnQuickAddParentCity.style.display = 'inline-flex';
        } else {
            D.quickAddParentIdInput.value = options.parentId || '';
            D.quickAddParentName.value = options.parentName || '';
            D.quickAddParentName.classList.remove('visually-hidden');
            D.quickAddParentName.style.display = 'block';
            D.quickAddParentSelect.classList.add('visually-hidden');
            D.quickAddParentSelect.style.display = 'none';
        }
    }

    D.quickAddModal.style.display = 'flex';
    setTimeout(() => D.quickAddNameInput?.focus(), 0);
}

export function closeQuickAddModal() {
    if (D.quickAddModal) D.quickAddModal.style.display = 'none';
}

export function openQuickAddCityModal() {
    if (!D.quickAddCityModal) return;
    if (D.quickAddCityNameInput) D.quickAddCityNameInput.value = '';
    D.quickAddCityModal.style.display = 'flex';
    setTimeout(() => D.quickAddCityNameInput?.focus(), 0);
}

export function closeQuickAddCityModal() {
    if (D.quickAddCityModal) D.quickAddCityModal.style.display = 'none';
}

export const populateDropdown = (
    selectElement: HTMLSelectElement, 
    items: { id: string; name: string }[], 
    selectedId?: string | null,
    placeholder: string = 'Seleccione...'
) => {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    items.sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
        const option = new Option(item.name, item.id);
        if (item.id === selectedId) option.selected = true;
        selectElement.appendChild(option);
    });
};

export function updateAdminEquipmentFilters() {
    if (!D.adminEquipmentCompanyFilter || !D.adminEquipmentSedeFilter) return;

    const equipments = State.equipmentList;
    const currentCompanyId = D.adminEquipmentCompanyFilter.value;
    const currentSedeId = D.adminEquipmentSedeFilter.value;

    const uniqueCompanyIds = new Set(equipments.map(e => e.companyId).filter(id => !!id));
    const activeCompanies = State.companies.filter(c => uniqueCompanyIds.has(c.id)).sort((a,b) => a.name.localeCompare(b.name));
    
    D.adminEquipmentCompanyFilter.innerHTML = '<option value="">Todas las empresas</option>';
    activeCompanies.forEach(c => {
        const option = new Option(c.name, c.id);
        if (c.id === currentCompanyId) option.selected = true;
        D.adminEquipmentCompanyFilter.appendChild(option);
    });

    const effectiveCompanyId = D.adminEquipmentCompanyFilter.value;
    const equipmentsForSede = effectiveCompanyId ? equipments.filter(e => e.companyId === effectiveCompanyId) : equipments;
    const uniqueSedeIds = new Set(equipmentsForSede.map(e => e.sedeId).filter(id => !!id));
    const activeSedes = State.sedes.filter(s => uniqueSedeIds.has(s.id)).sort((a,b) => a.name.localeCompare(b.name));

    let sedeFound = false;
    D.adminEquipmentSedeFilter.innerHTML = '<option value="">Todas las sedes</option>';
    
    // Si no hay empresa seleccionada, deshabilitar selector de sedes
    if (!effectiveCompanyId) {
        D.adminEquipmentSedeFilter.disabled = true;
    } else {
        D.adminEquipmentSedeFilter.disabled = false;
        activeSedes.forEach(s => {
            const option = new Option(s.name, s.id);
            if (s.id === currentSedeId) {
                option.selected = true;
                sedeFound = true;
            }
            D.adminEquipmentSedeFilter.appendChild(option);
        });
    }

    // Si la sede actual ya no es válida para la nueva empresa seleccionada, la limpiamos a "Todas"
    if (!sedeFound && currentSedeId) {
        D.adminEquipmentSedeFilter.value = '';
    }
}

export function renderAdminEquipmentTable() {
    if (!D.adminEquipmentTableBody) return;
    
    updateAdminEquipmentFilters();

    const term = State.tableSearchTerms.adminEquipment.toLowerCase();
    const companyFilterId = D.adminEquipmentCompanyFilter?.value;
    const sedeFilterId = D.adminEquipmentSedeFilter?.value;
    
    const filtered = State.equipmentList.filter(e => {
        const company = State.companies.find(c => c.id === e.companyId)?.name || '';
        const matchesCompany = !companyFilterId || e.companyId === companyFilterId;
        const matchesSede = !sedeFilterId || e.sedeId === sedeFilterId;
        const searchStr = `${e.manualId} ${e.brand} ${e.model} ${e.client_name} ${company}`.toLowerCase();
        return matchesCompany && matchesSede && searchStr.includes(term);
    });

    if (D.adminEquipmentCount) {
        D.adminEquipmentCount.textContent = filtered.length.toString();
    }

    D.adminEquipmentTableBody.innerHTML = filtered.map(e => {
        const city = State.cities.find(c => c.id === e.cityId)?.name || 'N/A';
        const owner = e.category === 'residencial' 
            ? `<span class="text-accent">${e.client_name || 'Sin nombre'}</span>` 
            : `<strong>${State.companies.find(c => c.id === e.companyId)?.name || 'Empresa'}</strong>`;
        const sedeName = State.sedes.find(s => s.id === e.sedeId)?.name || '<span class="text-muted">N/A</span>';
        const depName = State.dependencies.find(d => d.id === e.dependencyId)?.name || '<span class="text-muted">N/A</span>';
        
        return `<tr>
            <td data-label="ID Manual"><code>${e.manualId || 'N/A'}</code></td>
            <td data-label="Marca / Modelo">${e.brand} - ${e.model}</td>
            <td data-label="Tipo">${e.typeName}</td>
            <td data-label="Categoría"><span class="badge-${e.category}">${e.category}</span></td>
            <td data-label="Propietario / Empresa">${owner}</td>
            <td data-label="Sede">${sedeName}</td>
            <td data-label="Dependencia">${depName}</td>
            <td data-label="Ciudad">${city}</td>
            <td data-label="Último Mtto.">${formatDate(e.lastMaintenanceDate, false)}</td>
            <td data-label="Acciones">
                <button class="btn btn-secondary action-btn edit-equipment-btn" data-id="${e.id}"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger action-btn delete-entity-btn" data-type="equipment" data-id="${e.id}"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

export function openEquipmentForm(id?: string) {
    const form = D.entityForm;
    if (!form) return;
    form.reset();
    D.entityIdInput.value = id || '';
    if (D.formCompanySearchInput) D.formCompanySearchInput.value = '';
    if (D.formCompanyResults) D.formCompanyResults.innerHTML = '';
    
    populateDropdown(D.formEquipmentType, State.equipmentTypes);
    populateDropdown(D.formRefrigerantType, State.refrigerantTypes);
    populateDropdown(D.formCityId, State.cities);
    populateDropdown(D.formCompanyId, State.companies);

    const updateUIForCategory = () => {
        const isRes = D.formCategorySelector.value === 'residencial';
        D.formEmpresaFields.style.display = isRes ? 'none' : 'grid';
        D.formResidencialFields.style.display = isRes ? 'grid' : 'none';
        if (D.formCityId) D.formCityId.disabled = !isRes;
        if (!isRes && D.formCompanyId?.value) {
            syncCityForCompany(D.formCompanyId.value);
        }
        if (!isRes && !D.formCompanyId?.value && D.formCityId) {
            D.formCityId.value = '';
        }
    };

    const updateSedes = (companyId: string, selectedSedeId?: string) => {
        if (!D.formSedeId) return;
        const filtered = State.sedes.filter(s => s.companyId === companyId);
        populateDropdown(D.formSedeId, filtered, selectedSedeId, 'Seleccione sede...');
    };

    const updateDependencies = (sedeId: string, companyId: string, selectedDepId?: string) => {
        // Fallback: If sede is selected, filter by sede. If no sede is selected, filter by company (if supported or show all for company)
        // Note: Our types now support sedeId on Dependency. If dependency.sedeId is null, it might just belong to the company globally.
        let filtered = State.dependencies.filter(d => d.companyId === companyId);
        if (sedeId) {
             filtered = filtered.filter(d => d.sedeId === sedeId || !d.sedeId); // allow global dependencies
        }
        populateDropdown(D.formDependencyId, filtered, selectedDepId, 'Seleccione dependencia...');
    };

    const syncCompanySearchInput = () => {
        if (!D.formCompanySearchInput) return;
        const selected = State.companies.find(c => c.id === D.formCompanyId.value);
        D.formCompanySearchInput.value = selected?.name || '';
    };

    const clearCompanyResults = () => {
        if (D.formCompanyResults) D.formCompanyResults.innerHTML = '';
    };

    const renderCompanySearchResults = (term: string) => {
        if (!D.formCompanyResults) return;
        const query = term.trim().toLowerCase();
        if (!query) {
            clearCompanyResults();
            return;
        }

        const matches = State.companies.filter(c => c.name.toLowerCase().includes(query)).slice(0, 15);
        if (matches.length === 0) {
            D.formCompanyResults.innerHTML = '<div class="search-result-item" aria-disabled="true">Sin resultados</div>';
            return;
        }

        D.formCompanyResults.innerHTML = matches.map(company => {
            const cityName = State.cities.find(c => c.id === company.cityId)?.name || 'Sin ciudad';
            return `<div class="search-result-item" data-id="${company.id}" role="option">
                <span class="search-result-item-id">${company.name}</span>
                <span class="search-result-item-location">${cityName}</span>
            </div>`;
        }).join('');
    };

    const syncCityForCompany = (companyId: string) => {
        if (!companyId || !D.formCityId) return;
        const company = State.companies.find(c => c.id === companyId);
        if (company?.cityId) {
            D.formCityId.value = company.cityId;
        }
    };

    D.formCategorySelector.onchange = updateUIForCategory;
    D.formCompanyId.onchange = () => {
        updateSedes(D.formCompanyId.value);
        updateDependencies(D.formSedeId?.value || '', D.formCompanyId.value);
        syncCompanySearchInput();
        syncCityForCompany(D.formCompanyId.value);
    };

    if (D.formSedeId) {
        D.formSedeId.onchange = () => {
            updateDependencies(D.formSedeId.value, D.formCompanyId.value);
        };
    }

    if (D.formCompanySearchInput && D.formCompanyResults) {
        D.formCompanySearchInput.oninput = () => {
            if (D.formCompanyId.value) {
                D.formCompanyId.value = '';
                updateSedes('');
                updateDependencies('', '');
            }
            if (D.formCategorySelector.value === 'empresa' && D.formCityId) {
                D.formCityId.value = '';
            }
            renderCompanySearchResults(D.formCompanySearchInput.value);
        };

        D.formCompanySearchInput.onfocus = () => {
            if (D.formCompanySearchInput.value.trim()) {
                renderCompanySearchResults(D.formCompanySearchInput.value);
            }
        };

        D.formCompanyResults.onclick = (event) => {
            const target = (event.target as HTMLElement).closest<HTMLElement>('.search-result-item');
            const companyId = target?.dataset.id;
            if (!companyId) return;
            D.formCompanyId.value = companyId;
            updateSedes(companyId);
            updateDependencies('', companyId);
            syncCityForCompany(companyId);
            syncCompanySearchInput();
            clearCompanyResults();
        };
    }

    let preselectedSedeId: string | undefined;
    let preselectedDependencyId: string | undefined;

    if (id) {
        const eq = State.equipmentList.find(e => e.id === id);
        if (eq) {
            form.manual_id.value = eq.manualId || '';
            form.brand.value = eq.brand;
            form.model.value = eq.model;
            form.capacity.value = eq.capacity || '';
            form.periodicityMonths.value = eq.periodicityMonths;
            form.lastMaintenanceDate.value = eq.lastMaintenanceDate || '';
            form.category.value = eq.category;
            form.city_id.value = eq.cityId;
            form.client_name.value = eq.client_name || '';
            form.address.value = eq.address || '';
            
            D.formEquipmentType.value = eq.equipment_type_id || '';
            D.formRefrigerantType.value = eq.refrigerant_type_id || '';
            
            if (eq.category === 'empresa') {
                D.formCompanyId.value = eq.companyId || '';
                preselectedSedeId = eq.sedeId || undefined;
                preselectedDependencyId = eq.dependencyId || undefined;
            }
        }
    }

    updateSedes(D.formCompanyId.value, preselectedSedeId);
    updateDependencies(D.formSedeId?.value || '', D.formCompanyId.value, preselectedDependencyId);
    syncCompanySearchInput();
    syncCityForCompany(D.formCompanyId.value);
    updateUIForCategory();
    D.entityFormTitle.textContent = id ? 'Editar Equipo' : 'Registrar Nuevo Equipo';
    D.entityFormModal.style.display = 'flex';
}

export function closeEntityFormModal() {
    if (D.entityFormModal) D.entityFormModal.style.display = 'none';
}

export function openPlateScanModal() {
    if (!D.plateScanModal) return;
    D.plateScanModal.style.display = 'flex';
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
        plateCameraStream = s;
        D.plateVideoElement.srcObject = s;
        D.plateVideoElement.play();
    });
}

export function closePlateScanModal() {
    if (plateCameraStream) {
        plateCameraStream.getTracks().forEach(t => t.stop());
        plateCameraStream = null;
    }
    if (D.plateScanModal) D.plateScanModal.style.display = 'none';
}

export function updateSaveReportButtonState() {}
export function showView(id: string) {}
export function populateLoginWorkerSelect() {}
export function populateBottomNav(role: string) {}
export function updateUserPointsDisplay(p?: number | null) {}
export function populateAdminFilterDropdowns() {}
export function populateAdminOrderFilterDropdowns() {}
export function renderAdminOrdersList() {}
export function showAiReconciliationResults(matches: any[]) {}
export function initSignaturePad() {}
