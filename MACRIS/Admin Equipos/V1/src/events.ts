
import * as D from './dom';
import * as Auth from './auth';
import * as UI from './ui';
import * as State from './state';
import { saveEntity, fetchEquipment, deleteEntity as apiDeleteEntity, fetchCities, fetchCompanies, fetchDependencies } from './api';
import { extractDataFromImage } from './ai';

async function refreshEquipment() {
    UI.showLoader('Sincronizando...');
    try {
        const list = await fetchEquipment();
        State.setEquipmentList(list);
        UI.renderAdminEquipmentTable();
    } finally {
        UI.hideLoader();
    }
}

async function handleEntityFormSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const id = formData.get('id') as string;
    const category = formData.get('category') as string;

    if (category === 'empresa' && !D.formCompanyId.value) {
        UI.showAppNotification('Primero debe seleccionar una empresa', 'error');
        return;
    }

    if (D.formCityId) {
        formData.set('city_id', D.formCityId.value);
    }

    UI.showLoader('Guardando cambios...');
    try {
        const { error } = await saveEntity('equipment', id, formData);
        if (error) throw error;
        
        UI.showAppNotification('Equipo guardado correctamente', 'success');
        UI.closeEntityFormModal();
        await refreshEquipment();
    } catch (err: any) {
        const message = err?.message || 'Error al guardar el equipo';
        const details = err?.details || '';
        const combined = `${message} ${details}`.toLowerCase();
        const isDuplicateManualId = combined.includes('maintenance_equipment_manual_id_key')
            || (combined.includes('duplicate key') && combined.includes('manual_id'));
        if (isDuplicateManualId) {
            const manualId = (formData.get('manual_id') as string || '').trim();
            const displayId = manualId ? `"${manualId}"` : 'ingresado';
            UI.showInfoModal(`El ID manual ${displayId} ya existe. Use otro ID manual para este equipo.`, 'ID Manual Duplicado');
            return;
        }
        UI.showAppNotification(message, 'error');
    } finally {
        UI.hideLoader();
    }
}

async function handleDelete(id: string) {
    const confirm = await UI.showConfirmationModal('¿Está seguro de eliminar este equipo de forma permanente?');
    if (!confirm) return;

    UI.showLoader('Eliminando...');
    try {
        await apiDeleteEntity('equipment', id);
        UI.showAppNotification('Equipo eliminado', 'success');
        await refreshEquipment();
    } catch (err) {
        UI.showAppNotification('Error al eliminar', 'error');
    } finally {
        UI.hideLoader();
    }
}

async function handleQuickAdd(type: 'city' | 'company' | 'dependency') {
    let parentId = '';
    let parentName = '';

    if (type === 'city') {
        UI.showAppNotification('La ciudad se asigna desde la empresa. Si esa empresa no existe en esa ciudad, cree una nueva empresa.', 'info');
        return;
    } else if (type === 'company') {
        parentId = D.formCityId.value;
        parentName = D.formCityId.selectedOptions[0]?.textContent?.trim() || '';
    } else if (type === 'dependency') {
        parentId = D.formCompanyId.value;
        if (!parentId) {
            UI.showAppNotification('Primero debe seleccionar una empresa', 'error');
            return;
        }
        parentName = D.formCompanyId.selectedOptions[0]?.textContent?.trim() || '';
    }

    UI.openQuickAddModal({ type, parentId, parentName });
}

async function handleQuickAddSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const type = formData.get('type') as 'city' | 'company' | 'dependency';
    const name = (formData.get('name') as string)?.trim();
    const parentId = (formData.get('parentId') as string) || '';

    if (!name) {
        UI.showAppNotification('Ingrese un nombre válido', 'warning');
        D.quickAddNameInput?.focus();
        return;
    }

    if (type === 'company' && !parentId) {
        UI.showAppNotification('Primero debe seleccionar una ciudad', 'error');
        return;
    }
    if (type === 'dependency' && !parentId) {
        UI.showAppNotification('Primero debe seleccionar una empresa', 'error');
        return;
    }

    UI.showLoader('Creando...');
    try {
        const payload = new FormData();
        payload.append('name', name);
        if (type === 'company') payload.append('city_id', parentId);
        if (type === 'dependency') payload.append('company_id', parentId);

        const { data, error } = await saveEntity(type, '', payload);
        if (error) throw error;

        UI.showAppNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} creada`, 'success');
        UI.closeQuickAddModal();

        // Refrescar estado y dropdowns localmente
        if (type === 'city') {
            const freshCities = await fetchCities();
            State.setCities(freshCities);
            UI.populateDropdown(D.formCityId, State.cities, data.id);
        } else if (type === 'company') {
            const freshCompanies = await fetchCompanies();
            State.setCompanies(freshCompanies);
            UI.populateDropdown(D.formCompanyId, State.companies, data.id);
            D.formCompanyId.dispatchEvent(new Event('change'));
        } else if (type === 'dependency') {
            const freshDeps = await fetchDependencies();
            State.setDependencies(freshDeps);
            const filtered = State.dependencies.filter(d => d.companyId === parentId);
            UI.populateDropdown(D.formDependencyId, filtered, data.id);
        }

    } catch (err: any) {
        UI.showAppNotification(err.message, 'error');
    } finally {
        UI.hideLoader();
    }
}

async function handleQuickAddCitySubmit(e: SubmitEvent) {
    e.preventDefault();
    const name = D.quickAddCityNameInput?.value.trim() || '';
    if (!name) {
        UI.showAppNotification('Ingrese un nombre válido', 'warning');
        D.quickAddCityNameInput?.focus();
        return;
    }

    UI.showLoader('Creando ciudad...');
    try {
        const payload = new FormData();
        payload.append('name', name);
        const { data, error } = await saveEntity('city', '', payload);
        if (error) throw error;

        const freshCities = await fetchCities();
        State.setCities(freshCities);

        if (D.quickAddParentSelect) {
            UI.populateDropdown(D.quickAddParentSelect, State.cities, data.id, 'Seleccione ciudad...');
            D.quickAddParentIdInput.value = data.id;
        }
        if (D.formCityId) {
            UI.populateDropdown(D.formCityId, State.cities, data.id);
        }

        UI.showAppNotification('Ciudad creada', 'success');
        UI.closeQuickAddCityModal();
    } catch (err: any) {
        const message = err?.message || 'Error al crear ciudad';
        UI.showAppNotification(message, 'error');
        const lower = message.toLowerCase();
        const isDuplicate = lower.includes('ya existe') || lower.includes('duplicate');
        if (isDuplicate) {
            UI.closeQuickAddCityModal();
            if (D.quickAddParentSelect) {
                D.quickAddParentSelect.classList.remove('field-attention');
                D.quickAddParentSelect.classList.add('field-attention');
                D.quickAddParentSelect.scrollIntoView({ block: 'center' });
                D.quickAddParentSelect.focus();
                const onAnimationEnd = () => {
                    D.quickAddParentSelect.classList.remove('field-attention');
                    D.quickAddParentSelect.removeEventListener('animationend', onAnimationEnd);
                };
                D.quickAddParentSelect.addEventListener('animationend', onAnimationEnd);
            }
        }
    } finally {
        UI.hideLoader();
    }
}

export function setupEventListeners() {
    // Manejo de Login Mejorado
    D.adminPasswordFormLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const passInput = D.adminPassInput;
        const errorMsg = D.loginError;
        const passwordEntered = passInput.value.trim();
        
        const adminUser = State.users.find(u => u.username === 'admin' || u.role === 'admin');
        
        if (adminUser && passwordEntered === adminUser.password) {
            if (errorMsg) errorMsg.textContent = '';
            Auth.startAppSession();
        } else if (!adminUser && passwordEntered === 'admin123') {
            if (errorMsg) errorMsg.textContent = '';
            Auth.startAppSession();
        } else {
            if (errorMsg) errorMsg.textContent = 'Acceso denegado. Verifique la contraseña del admin de reportes.';
            passInput.value = '';
            passInput.focus();
        }
    });

    D.logoutButton?.addEventListener('click', Auth.handleLogout);

    // Acciones de Equipos
    D.addEquipmentButton?.addEventListener('click', () => UI.openEquipmentForm());
    
    D.adminEquipmentSearchInput?.addEventListener('input', (e) => {
        State.setTableSearchTerm('adminEquipment', (e.target as HTMLInputElement).value);
        UI.renderAdminEquipmentTable();
    });

    D.entityForm?.addEventListener('submit', handleEntityFormSubmit);
    D.closeEntityFormModalButton?.addEventListener('click', UI.closeEntityFormModal);
    D.cancelEntityButton?.addEventListener('click', UI.closeEntityFormModal);

    // Botones de creación rápida "+" - Aseguramos que se capturen correctamente
    document.getElementById('btn-quick-add-city')?.addEventListener('click', (e) => { e.preventDefault(); handleQuickAdd('city'); });
    document.getElementById('btn-quick-add-company')?.addEventListener('click', (e) => { e.preventDefault(); handleQuickAdd('company'); });
    document.getElementById('btn-quick-add-dependency')?.addEventListener('click', (e) => { e.preventDefault(); handleQuickAdd('dependency'); });
    D.quickAddForm?.addEventListener('submit', handleQuickAddSubmit);
    D.closeQuickAddModalButton?.addEventListener('click', UI.closeQuickAddModal);
    D.cancelQuickAddButton?.addEventListener('click', UI.closeQuickAddModal);
    D.btnQuickAddParentCity?.addEventListener('click', (e) => { e.preventDefault(); UI.openQuickAddCityModal(); });
    D.quickAddCityForm?.addEventListener('submit', handleQuickAddCitySubmit);
    D.closeQuickAddCityModalButton?.addEventListener('click', UI.closeQuickAddCityModal);
    D.cancelQuickAddCityButton?.addEventListener('click', UI.closeQuickAddCityModal);
    D.closeInfoModalButton?.addEventListener('click', UI.closeInfoModal);
    D.infoModalOkButton?.addEventListener('click', UI.closeInfoModal);

    // Escaneo de Placa con IA
    D.aiScanPlateButton?.addEventListener('click', () => {
        State.setAiScanTargetForm('equipment');
        UI.openPlateScanModal();
    });

    D.takePictureButton?.addEventListener('click', async () => {
        const video = D.plateVideoElement;
        const canvas = D.plateHiddenCanvasElement;
        if (!video || !canvas) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg');
        
        UI.closePlateScanModal();
        UI.showLoader('IA analizando placa...');
        await extractDataFromImage(base64);
        UI.hideLoader();
    });

    D.cancelPlateScanButton?.addEventListener('click', UI.closePlateScanModal);
    D.closePlateScanModal?.addEventListener('click', UI.closePlateScanModal);

    // Delegación para botones de la tabla
    document.body.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const editBtn = target.closest<HTMLButtonElement>('.edit-equipment-btn');
        if (editBtn) {
            UI.openEquipmentForm(editBtn.dataset.id);
            return;
        }
        const delBtn = target.closest<HTMLButtonElement>('.delete-entity-btn');
        if (delBtn) {
            handleDelete(delBtn.dataset.id!);
            return;
        }
    });
}
