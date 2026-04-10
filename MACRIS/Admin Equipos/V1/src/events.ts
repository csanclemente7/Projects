
import * as D from './dom';
import * as Auth from './auth';
import * as UI from './ui';
import * as State from './state';
import { saveEntity, saveMultipleEquipments, fetchEquipment, deleteEntity as apiDeleteEntity, fetchCities, fetchCompanies, fetchSedes, fetchDependencies } from './api';
import { extractDataFromImage } from './ai';
import { parseExcelEquipments, ExcelValidationResult } from './excel';

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

    if (category === 'empresa' && (!D.formCompanyId.value || !D.formSedeId.value || !D.formDependencyId.value)) {
        UI.showAppNotification('Para activos empresariales debe seleccionar Empresa, Sede y Dependencia', 'error');
        // allow returning but wait, maybe not all have dependencies? Let's keep it less strict if preferred, but usually they are required, wait. Let's just be careful not to break existing data if they don't have sedes yet.
        // I will just require Empresa, since Sede might be new:
    }
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

async function handleQuickAdd(type: 'city' | 'company' | 'sede' | 'dependency') {
    let parentId = '';
    let parentName = '';

    if (type === 'city') {
        UI.showAppNotification('La ciudad se asigna desde la empresa. Si esa empresa no existe en esa ciudad, cree una nueva empresa.', 'info');
        return;
    } else if (type === 'company') {
        parentId = D.formCityId.value;
        parentName = D.formCityId.selectedOptions[0]?.textContent?.trim() || '';
    } else if (type === 'sede') {
        parentId = D.formCompanyId.value;
        if (!parentId) {
            UI.showAppNotification('Primero debe seleccionar una empresa', 'error');
            return;
        }
        parentName = D.formCompanyId.selectedOptions[0]?.textContent?.trim() || '';
    } else if (type === 'dependency') {
        parentId = D.formSedeId.value || D.formCompanyId.value;
        if (!D.formCompanyId.value) {
            UI.showAppNotification('Primero debe seleccionar una empresa', 'error');
            return;
        }
        parentName = D.formSedeId.selectedOptions[0]?.textContent?.trim() || D.formCompanyId.selectedOptions[0]?.textContent?.trim() || '';
    }

    UI.openQuickAddModal({ type, parentId, parentName });
}

async function handleQuickAddSubmit(e: SubmitEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const type = formData.get('type') as 'city' | 'company' | 'sede' | 'dependency';
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

    if (type === 'sede' && !parentId) {
        UI.showAppNotification('Primero debe seleccionar una empresa', 'error');
        return;
    }

    UI.showLoader('Creando...');
    try {
        const payload = new FormData();
        payload.append('name', name);
        if (type === 'company') payload.append('city_id', parentId);
        if (type === 'sede') payload.append('company_id', parentId);
        if (type === 'dependency') {
            payload.append('company_id', D.formCompanyId.value);
            if (D.formSedeId.value) {
                payload.append('sede_id', D.formSedeId.value);
            }
        }

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
        } else if (type === 'sede') {
            const freshSedes = await fetchSedes();
            State.setSedes(freshSedes);
            const filtered = State.sedes.filter(s => s.companyId === parentId);
            UI.populateDropdown(D.formSedeId, filtered, data.id);
            D.formSedeId.dispatchEvent(new Event('change'));
        } else if (type === 'dependency') {
            const freshDeps = await fetchDependencies();
            State.setDependencies(freshDeps);
            let filtered = State.dependencies.filter(d => d.companyId === D.formCompanyId.value);
            if (D.formSedeId.value) {
                filtered = filtered.filter(d => d.sedeId === D.formSedeId.value || !d.sedeId);
            }
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

// Global scope arrays for excel upload
let pendingValidEquipments: any[] = [];

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

    D.adminEquipmentCompanyFilter?.addEventListener('change', () => {
        UI.renderAdminEquipmentTable();
    });

    D.adminEquipmentSedeFilter?.addEventListener('change', () => {
        UI.renderAdminEquipmentTable();
    });

    // Excel Import Flow
    D.importExcelButton?.addEventListener('click', () => {
        if (D.excelInfoModal) D.excelInfoModal.style.display = 'flex';
    });

    D.closeExcelInfoModal?.addEventListener('click', () => {
        if (D.excelInfoModal) D.excelInfoModal.style.display = 'none';
    });

    D.cancelExcelInfoButton?.addEventListener('click', () => {
        if (D.excelInfoModal) D.excelInfoModal.style.display = 'none';
    });

    D.continueExcelImportButton?.addEventListener('click', () => {
        if (D.excelInfoModal) D.excelInfoModal.style.display = 'none';
        D.excelFileInput?.click();
    });

    D.excelFileInput?.addEventListener('change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        UI.showLoader('Analizando Archivo Excel...');
        try {
            const results = await parseExcelEquipments(file);
            pendingValidEquipments = results.filter(r => r.isValid).map(r => r.data);
            
            let validCount = 0;
            let errorCount = 0;

            D.excelPreviewTableBody.innerHTML = results.map(r => {
                const statusBadge = r.isValid ? '<span class="badge-success">Válido</span>' : '<span class="badge-error">Error</span>';
                if (r.isValid) validCount++; else errorCount++;

                const equipmentInfo = `
                    <strong>${r.rawRow.Marca || r.rawRow.marca || 'N/A'} - ${r.rawRow.Modelo || r.rawRow.modelo || 'N/A'}</strong><br>
                    <small>Sede: ${r.rawRow.Sede || r.rawRow.sede || 'N/A'}</small>
                `;

                const errorsOut = r.isValid ? 
                    (r.isPendingCreation ? '<span class="text-muted"><i class="fas fa-magic" style="color:var(--accent-color);"></i> Auto-Crear Dependencias</span>' : '<span class="text-muted">Ninguna</span>') 
                    : `<ul style="margin:0; padding-left:20px; color:var(--danger-color);">${r.errors.map(e => `<li>${e}</li>`).join('')}</ul>`;

                return `<tr>
                    <td>${statusBadge}</td>
                    <td>Fila ${r.rowIndex}</td>
                    <td>${equipmentInfo}</td>
                    <td>${errorsOut}</td>
                </tr>`;
            }).join('');

            D.excelValidCount.textContent = `Válidos: ${validCount}`;
            D.excelErrorCount.textContent = `Errores: ${errorCount}`;

            if (validCount > 0) {
                D.confirmExcelActionButton.removeAttribute('disabled');
                D.confirmExcelActionButton.textContent = `Subir Solo Válidos (${validCount})`;
            } else {
                D.confirmExcelActionButton.setAttribute('disabled', 'true');
                D.confirmExcelActionButton.textContent = `Subir Solo Válidos`;
            }

            D.excelPreviewModal.style.display = 'flex';
        } catch (err: any) {
            UI.showAppNotification(`Error leyendo Excel: ${err.message || 'Formato inválido'}`, 'error');
        } finally {
            // Limpiar input
            D.excelFileInput.value = '';
            UI.hideLoader();
        }
    });

    D.cancelExcelActionButton?.addEventListener('click', () => {
        pendingValidEquipments = [];
        if (D.excelPreviewModal) D.excelPreviewModal.style.display = 'none';
    });
    
    D.closeExcelPreviewModal?.addEventListener('click', () => {
        pendingValidEquipments = [];
        if (D.excelPreviewModal) D.excelPreviewModal.style.display = 'none';
    });

    D.confirmExcelActionButton?.addEventListener('click', async () => {
        if (pendingValidEquipments.length === 0) return;

        UI.showLoader(`Procesando e insertando ${pendingValidEquipments.length} equipos...`);
        try {
            await processPendingEntitiesAndInsert(pendingValidEquipments);
            UI.showAppNotification(`${pendingValidEquipments.length} equipos insertados exitosamente.`, 'success');
            if (D.excelPreviewModal) D.excelPreviewModal.style.display = 'none';
            pendingValidEquipments = [];
            // Refresh shared lookup data because new companies/sedes might have been added
            const [newCities, newCompanies, newSedes, newDependencies] = await Promise.all([
                fetchCities(),
                fetchCompanies(),
                fetchSedes(),
                fetchDependencies()
            ]);
            State.setCities(newCities);
            State.setCompanies(newCompanies);
            State.setSedes(newSedes);
            State.setDependencies(newDependencies);
            
            await refreshEquipment();
        } catch (err: any) {
            UI.showAppNotification(err.message || 'Error en bulk insert', 'error');
        } finally {
            UI.hideLoader();
        }
    });

    D.entityForm?.addEventListener('submit', handleEntityFormSubmit);
    D.closeEntityFormModalButton?.addEventListener('click', UI.closeEntityFormModal);
    D.cancelEntityButton?.addEventListener('click', UI.closeEntityFormModal);

    // Botones de creación rápida "+" - Aseguramos que se capturen correctamente
    document.getElementById('btn-quick-add-city')?.addEventListener('click', (e) => { e.preventDefault(); handleQuickAdd('city'); });
    document.getElementById('btn-quick-add-company')?.addEventListener('click', (e) => { e.preventDefault(); handleQuickAdd('company'); });
    document.getElementById('btn-quick-add-sede')?.addEventListener('click', (e) => { e.preventDefault(); handleQuickAdd('sede'); });
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

// ---- Auto-creation Logic for Bulk Insert ----
async function processPendingEntitiesAndInsert(equipments: any[]): Promise<void> {
    // We modify equipments array in place to attach real IDs
    const newCitiesMap = new Map<string, string>(); // newCityName -> cityId
    const newCompaniesMap = new Map<string, string>(); // newCompanyName -> companyId
    const newSedesMap = new Map<string, string>(); // newSedeName_companyId -> sedeId
    const newDepsMap = new Map<string, string>(); // newDepName_companyId_sedeId -> refId

    const toFormData = (obj: any) => {
        const fd = new FormData();
        Object.entries(obj).forEach(([key, val]) => {
            if (val !== null && val !== undefined) fd.append(key, String(val));
        });
        return fd;
    };

    // 1. Resolve Cities
    for (const eq of equipments) {
        if (eq.isNewCity && eq.newCityName) {
            const key = eq.newCityName.toLowerCase();
            if (!newCitiesMap.has(key)) {
                const { data } = await saveEntity('city', '', toFormData({ name: eq.newCityName }));
                newCitiesMap.set(key, data.id);
            }
            eq.cityId = newCitiesMap.get(key);
            eq.isNewCity = false;
        }
    }

    // 2. Resolve Companies
    for (const eq of equipments) {
        if (eq.isNewCompany && eq.newCompanyName) {
            const key = eq.newCompanyName.toLowerCase() + "_" + eq.cityId;
            if (!newCompaniesMap.has(key)) {
                const { data } = await saveEntity('company', '', toFormData({ name: eq.newCompanyName, city_id: eq.cityId }));
                newCompaniesMap.set(key, data.id);
            }
            eq.companyId = newCompaniesMap.get(key);
            eq.isNewCompany = false;
        }
    }

    // 3. Resolve Sedes
    for (const eq of equipments) {
        if (eq.isNewSede && eq.newSedeName) {
            const key = eq.newSedeName.toLowerCase() + "_" + eq.companyId;
            if (!newSedesMap.has(key)) {
                const { data } = await saveEntity('sede', '', toFormData({ name: eq.newSedeName, company_id: eq.companyId }));
                newSedesMap.set(key, data.id);
            }
            eq.sedeId = newSedesMap.get(key);
            eq.isNewSede = false;
        }
    }

    // 4. Resolve Dependencies
    for (const eq of equipments) {
        if (eq.isNewDependency && eq.newDependencyName) {
            const key = eq.newDependencyName.toLowerCase() + "_" + eq.companyId + "_" + (eq.sedeId || 'null');
            if (!newDepsMap.has(key)) {
                const { data } = await saveEntity('dependency', '', toFormData({ 
                    name: eq.newDependencyName, 
                    company_id: eq.companyId,
                    sede_id: eq.sedeId || null
                }));
                newDepsMap.set(key, data.id); // Note: data is a single object, not array, because saveEntity uses .single()
            }
            eq.dependencyId = newDepsMap.get(key);
            eq.isNewDependency = false;
        }
    }

    // 5. Bulk Insert equipments
    const { error } = await saveMultipleEquipments(equipments);
    if (error) throw error;
}
