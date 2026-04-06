
import * as D from './dom';
import * as Auth from './auth';
import * as UI from './ui';
import { toggleFullscreen } from './utils';
import * as State from './state';
import { EntityType, Report, Equipment, Order, Database, Company } from './types';
import { deleteEntity as apiDeleteEntity, deleteReport as apiDeleteReport, saveEntity, deleteAllReports as apiDeleteAllReports, toggleEmployeeStatus, saveMaintenanceReport, updateMaintenanceReport, fetchEquipment, fetchCities, fetchCompanies, fetchDependencies, fetchUsers, toggleReportPaidStatus, updateOrderItemQuantity, updateOrderStatus, updateAppSetting, fetchAllReports, fetchReportsForWorker, awardPointToTechnician, updateUserPoints, fetchEquipmentTypes, fetchRefrigerantTypes } from './api';
import QRCode from 'qrcode';
import { runAiReconciliation } from './ai';

async function refreshReportsState() {
    if (!State.currentUser) return;

    try {
        if (State.currentUser.role === 'admin') {
            const result = await fetchAllReports();
            State.setReports(result.reports, result.total);
        } else {
            const result = await fetchReportsForWorker(State.currentUser.id);
            State.setReports(result.reports, result.total);
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
            case 'dependency': State.setDependencies(await fetchDependencies()); UI.renderDependenciesTable(); break;
            case 'equipment': State.setEquipmentList(await fetchEquipment()); UI.renderAdminEquipmentTable(); break;
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
    const id = formData.get('id') as string;
    const type = formData.get('type') as EntityType;

    try {
        // --- PRE-SUBMISSION DATA MANIPULATION ---
        if (type === 'company') {
            const cityId = formData.get('city_id') as string;
            if (cityId === 'otra') {
                throw new Error('Para la Ciudad ha seleccionado "Otra". Esta opción no es válida para guardar. Por favor, pida a un administrador que agregue la ciudad que necesita.');
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

        // --- API CALL ---
        const { data, error } = await saveEntity(type, id, formData);

        if (error) throw error;
        
        UI.showAppNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} guardado con éxito.`, 'success');

        // --- POST-SUBMISSION DATA REFRESH & UI UPDATE ---
        let shouldCloseCurrentModal = true;
        
        switch(type) {
            case 'city': 
                State.setCities(await fetchCities()); 
                UI.renderCitiesTable(); 
                if (State.entityFormContext?.source === 'reportForm') {
                    UI.populateDropdown(D.reportCitySelectResidencial, State.cities, data.id);
                }
                break;
            case 'company': 
                State.setCompanies(await fetchCompanies()); 
                UI.renderCompaniesTable(); 
                if (State.entityFormContext?.source === 'reportForm') {
                    UI.populateDropdown(D.reportCompanySelect, State.companies, data.id);
                    UI.updateLocationDropdownsFromCompany(data.id);
                } else if (State.entityFormContext?.source === 'entityForm') {
                     // Came from equipment form, re-open it and select the new company
                    const originalEquipmentId = State.entityFormContext.originalEntityId;
                    shouldCloseCurrentModal = false;
                    UI.openEntityFormModal('equipment', originalEquipmentId, { source: 'entityForm' });
                    // We need to wait for the modal to be rendered, then set the value
                    setTimeout(() => {
                        const companySelect = D.entityFormFieldsContainer?.querySelector('#equipment-company') as HTMLSelectElement;
                        if(companySelect) {
                           companySelect.value = data.id;
                           companySelect.dispatchEvent(new Event('change')); // Trigger dependency update
                        }
                    }, 100);
                }
                break;
            case 'dependency': 
                State.setDependencies(await fetchDependencies()); 
                UI.renderDependenciesTable();
                if (State.entityFormContext?.source === 'reportForm' && State.entityFormContext.selectedCompanyId) {
                    const companyId = State.entityFormContext.selectedCompanyId;
                    const filteredDependencies = State.dependencies.filter(d => d.companyId === companyId);
                    UI.populateDropdown(D.reportDependencySelect, filteredDependencies, data.id);
                } else if (State.entityFormContext?.source === 'entityForm') {
                     const originalEquipmentId = State.entityFormContext.originalEntityId;
                     shouldCloseCurrentModal = false;
                     UI.openEntityFormModal('equipment', originalEquipmentId, { source: 'entityForm' });
                     setTimeout(() => {
                        const companySelect = D.entityFormFieldsContainer?.querySelector('#equipment-company') as HTMLSelectElement;
                        const dependencySelect = D.entityFormFieldsContainer?.querySelector('#equipment-dependency') as HTMLSelectElement;
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
                const newEquipmentList = await fetchEquipment();
                State.setEquipmentList(newEquipmentList); 
                UI.renderAdminEquipmentTable();
                
                if (State.entityFormContext?.source === 'equipmentSelectionModal' && !id) {
                    const newEquipment = newEquipmentList.find(eq => eq.id === data.id);
                    if (newEquipment) {
                        shouldCloseCurrentModal = false;
                        UI.handleEquipmentSelection(newEquipment);
                    }
                }
                break;
            case 'equipmentType':
            case 'refrigerant':
                if (State.entityFormContext?.source === 'reportForm') {
                    if (type === 'equipmentType') {
                        State.setEquipmentTypes(await fetchEquipmentTypes());
                        UI.populateDropdown(D.reportEquipmentTypeSelect, State.equipmentTypes, data.id);
                    } else {
                        State.setRefrigerantTypes(await fetchRefrigerantTypes());
                        UI.populateDropdown(D.reportEquipmentRefrigerantSelect, State.refrigerantTypes, data.id);
                    }
                } else if (State.entityFormContext?.source === 'entityForm') {
                    const originalEquipmentId = State.entityFormContext.originalEntityId;
                    if(originalEquipmentId !== undefined){ // Check if it's new or editing
                        if (type === 'equipmentType') State.setEquipmentTypes(await fetchEquipmentTypes());
                        else State.setRefrigerantTypes(await fetchRefrigerantTypes());
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
    const serviceType = D.reportServiceTypeSelect.value;
    const isInstallation = serviceType === 'Montaje/Instalación';
    const isManualEntry = D.reportEquipmentIdHidden.value === 'MANUAL_NO_ID' && !isInstallation;
    const selectedCategory = D.reportLocationResidencialContainer?.style.display === 'block' ? 'residencial' : 'empresa';
    
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

    if (isInstallation && (!State.currentReportPhotoInternalBase64 || !State.currentReportPhotoExternalBase64)) {
        const confirmed = await UI.showConfirmationModal(
            "No ha adjuntado una o más fotos de la instalación. ¿Desea guardar el reporte como 'Fotos Pendientes'?",
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
        const equipmentId = D.reportEquipmentIdHidden.value;
        let equipmentSnapshot: Report['equipmentSnapshot'];

        if (isInstallation) {
             equipmentSnapshot = {
                id: 'INSTALL_NO_ID', manualId: null, model: 'N/A - Instalación', brand: 'N/A - Instalación', type: 'N/A', refrigerant: 'N/A',
                category: selectedCategory,
                address: selectedCategory === 'residencial' ? D.reportAddressInput.value : null,
                client_name: selectedCategory === 'residencial' ? D.reportClientNameInput.value : null,
                companyName: selectedCategory === 'empresa' ? State.companies.find(c => c.id === D.reportCompanySelect.value)?.name : undefined,
                dependencyName: selectedCategory === 'empresa' ? State.dependencies.find(d => d.id === D.reportDependencySelect.value)?.name : undefined,
            };
        } else if (equipmentId && equipmentId !== 'MANUAL_NO_ID') {
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

        const observations = D.reportObservationsTextarea.value.trim();
        let finalObservations = observations;
        if (serviceType === 'Mantenimiento Preventivo' && !observations) {
            finalObservations = 'Se realiza mantenimiento preventivo.';
        }
        
        const itemsSnapshot = isInstallation ? Array.from(D.reportInstallationItemsTableBody.querySelectorAll('tr')).map(row => ({
            description: row.cells[0]?.textContent || '',
            quantity: parseInt((row.cells[1]?.querySelector('input') as HTMLInputElement)?.value || '0', 10)
        })) : null;

        const orderIdValue = D.reportOrderIdHidden.value;
        const reportData: Database['public']['Tables']['maintenance_reports']['Insert'] = {
            timestamp: new Date().toISOString(), service_type: serviceType, observations: finalObservations || null,
            equipment_snapshot: equipmentSnapshot as any, items_snapshot: itemsSnapshot, city_id: cityId,
            company_id: selectedCategory === 'empresa' ? D.reportCompanySelect.value : null,
            dependency_id: selectedCategory === 'empresa' ? D.reportDependencySelect.value : null,
            worker_id: State.currentUser.id, worker_name: State.currentUser.name || State.currentUser.username,
            client_signature: signatureData,
            pressure: D.reportPressureInput.value || null, amperage: D.reportAmperageInput.value || null,
            photo_internal_unit_url: isInstallation ? (State.currentReportPhotoInternalBase64 || 'PENDING_PHOTO') : null,
            photo_external_unit_url: isInstallation ? (State.currentReportPhotoExternalBase64 || 'PENDING_PHOTO') : null,
            order_id: orderIdValue || null,
        };
        
        if (isEditing) {
            await updateMaintenanceReport(D.reportIdInput.value, reportData);
            UI.showAppNotification('Reporte actualizado con éxito.', 'success');
        } else {
            await saveMaintenanceReport(reportData);
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
            await updateOrderStatus(orderIdValue, 'completed');
            State.updateOrderInState(orderIdValue, { status: 'completed' });
            if (State.currentUser.role === 'worker') UI.renderAssignedOrdersList();
            else UI.renderAdminOrdersList();
        }

        await refreshReportsState();
        UI.closeReportFormModal();
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
    if (D.redeemPointsError) D.redeemPointsError.textContent = '';

    const userId = D.redeemPointsUserId.value;
    const pointsToRedeem = parseInt(D.pointsToRedeemInput.value, 10);
    const user = State.users.find(u => u.id === userId);
    
    if (!user) {
        UI.showAppNotification('Error: Usuario no encontrado.', 'error');
        return;
    }

    const currentPoints = user.points || 0;

    if (isNaN(pointsToRedeem) || pointsToRedeem <= 0) {
        if (D.redeemPointsError) D.redeemPointsError.textContent = 'La cantidad a redimir debe ser un número positivo.';
        return;
    }

    if (pointsToRedeem > currentPoints) {
        if (D.redeemPointsError) D.redeemPointsError.textContent = 'No se pueden redimir más puntos de los que tiene el empleado.';
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

    // --- Modals ---
    D.closeReportFormModalButton?.addEventListener('click', UI.closeReportFormModal);
    D.cancelReportButton?.addEventListener('click', UI.closeReportFormModal);
    D.closeEntityFormModalButton?.addEventListener('click', UI.closeEntityFormModal);
    D.cancelEntityButton?.addEventListener('click', UI.handleCancelEntityForm);
    D.closeViewReportDetailsModalButton?.addEventListener('click', () => { if(D.viewReportDetailsModal) D.viewReportDetailsModal.style.display = 'none'; });
    D.closeViewReportButton?.addEventListener('click', () => { if(D.viewReportDetailsModal) D.viewReportDetailsModal.style.display = 'none'; });
    D.closeImagePreviewModalButton?.addEventListener('click', () => { if(D.imagePreviewModal) D.imagePreviewModal.style.display = 'none'; });
    D.closeConfirmationModalButton?.addEventListener('click', () => UI.resolveConfirmation(false));
    D.cancelActionButton?.addEventListener('click', () => UI.resolveConfirmation(false));
    D.confirmActionButton?.addEventListener('click', () => UI.resolveConfirmation(true));
    D.closeCategorySelectionModalButton?.addEventListener('click', UI.closeCategorySelectionModal);
    D.cancelCategorySelectionButton?.addEventListener('click', UI.closeCategorySelectionModal);
    D.closeEquipmentSelectionModalButton?.addEventListener('click', UI.closeEquipmentSelectionModal);
    D.cancelEquipmentSelectionButton?.addEventListener('click', UI.closeEquipmentSelectionModal);
    D.closeOrderDetailsModalButton?.addEventListener('click', () => { if(D.orderDetailsModal) D.orderDetailsModal.style.display = 'none'; });
    D.closeOrderDetailsButton?.addEventListener('click', () => { if(D.orderDetailsModal) D.orderDetailsModal.style.display = 'none'; });
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
            if (D.editReportDependencyWarning) D.editReportDependencyWarning.style.display = 'none';
            if (D.saveEditReportAssignmentButton) D.saveEditReportAssignmentButton.disabled = false;
            if (D.editReportDependencySelect) D.editReportDependencySelect.setAttribute('required', 'true');
        }
    });

    // --- Worker Actions ---
    D.createManualReportButton?.addEventListener('click', () => UI.openCategorySelectionModal('manual'));
    D.searchByIdButton?.addEventListener('click', () => UI.openCategorySelectionModal('search'));
    D.toggleMyReportsViewButton?.addEventListener('click', () => {
        State.setShowAllMyReports(!State.showAllMyReports);
        D.toggleMyReportsViewButton.textContent = State.showAllMyReports ? 'Ver Recientes' : 'Ver Todos';
        UI.renderMyReportsTable();
    });
    
    // --- Category & Equipment Selection ---
    D.selectCategoryEmpresaButton?.addEventListener('click', () => {
        State.manualReportCreationState.category = 'empresa';
        if (State.manualReportCreationState.nextAction === 'search') UI.openEquipmentSelectionModal();
        else UI.openReportFormModal({ category: 'empresa' });
        if (D.categorySelectionModal) D.categorySelectionModal.style.display = 'none';
    });
    D.selectCategoryResidencialButton?.addEventListener('click', () => {
        State.manualReportCreationState.category = 'residencial';
        if (State.manualReportCreationState.nextAction === 'search') UI.openEquipmentSelectionModal();
        else UI.openReportFormModal({ category: 'residencial' });
        if (D.categorySelectionModal) D.categorySelectionModal.style.display = 'none';
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
    D.openSignatureModalButton?.addEventListener('click', () => UI.openSignatureModal());
    D.closeSignatureModalButton?.addEventListener('click', UI.closeSignatureModal);
    D.aiScanPlateButton?.addEventListener('click', () => UI.openPlateScanModal('report'));
    D.closePlateScanModal?.addEventListener('click', UI.closePlateScanModal);
    D.cancelPlateScanButton?.addEventListener('click', UI.closePlateScanModal);
    D.takePictureButton?.addEventListener('click', UI.handlePlatePictureTaken);

    // Photo Capture
    D.takeInternalUnitPhotoButton?.addEventListener('click', () => UI.openPhotoCaptureModal('internal'));
    D.takeExternalUnitPhotoButton?.addEventListener('click', () => UI.openPhotoCaptureModal('external'));
    D.closePhotoCaptureModalButton?.addEventListener('click', UI.closePhotoCaptureModal);
    D.cancelPhotoCaptureButton?.addEventListener('click', UI.closePhotoCaptureModal);
    D.capturePhotoButton?.addEventListener('click', UI.handlePhotoCaptured);
    
    // --- Table/List Event Delegation ---
    document.body.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const btn = target.closest<HTMLButtonElement>('.action-btn, .link-report-btn');
        const card = target.closest<HTMLDivElement>('.order-card');
        const editPhotoBtn = target.closest<HTMLButtonElement>('button[data-action="edit-photo"]');

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


        if (card) {
            const orderId = card.dataset.orderId;
            if (orderId) UI.openOrderDetailsModal(orderId);
            return;
        }

        if (!btn) return;

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
                    context.selectedCompanyId = D.reportCompanySelect.value;
                }
            } else if (addBtn.closest('#entity-form-modal')) {
                context.source = 'entityForm';
                context.originalEntityId = D.entityIdInput.value;
                 if (entityType === 'dependency') {
                    const companySelect = D.entityFormFieldsContainer?.querySelector('#equipment-company') as HTMLSelectElement | null;
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
    
    // SAFE ACCESS to adminManagementSection
    D.adminManagementSection?.addEventListener('change', (e) => {
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

                    await updateMaintenanceReport(reportId, updateData);
                    await refreshReportsState();
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
    D.exportZipBtn?.addEventListener('click', UI.handleDownloadReportsZip);


    // --- Filters ---
    const adminReportsFilterElements = [D.filterReportDateStart, D.filterReportDateEnd, D.filterReportCity, D.filterReportCompany, D.filterReportServiceType, D.filterReportTechnician, D.filterReportCategory, D.filterReportPaid];
    adminReportsFilterElements.forEach(el => el?.addEventListener('change', UI.renderAdminReportsTable));
    D.adminReportsSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('adminReports', D.adminReportsSearchInput.value); UI.renderAdminReportsTable(); });
    D.adminReportsSearchClearButton?.addEventListener('click', () => { if(D.adminReportsSearchInput) D.adminReportsSearchInput.value = ''; State.setTableSearchTerm('adminReports', ''); UI.renderAdminReportsTable(); });
    
    const adminOrdersFilterElements = [D.filterOrderDateStart, D.filterOrderDateEnd, D.filterOrderStatus, D.filterOrderType, D.filterOrderTechnician];
    adminOrdersFilterElements.forEach(el => el?.addEventListener('change', UI.renderAdminOrdersList));
    D.adminOrdersSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('adminOrders', D.adminOrdersSearchInput.value); UI.renderAdminOrdersList(); });
    D.adminOrdersSearchClearButton?.addEventListener('click', () => { if(D.adminOrdersSearchInput) D.adminOrdersSearchInput.value = ''; State.setTableSearchTerm('adminOrders', ''); UI.renderAdminOrdersList(); });

    D.toggleFiltersBtn?.addEventListener('click', () => D.adminFiltersCollapsibleArea?.classList.toggle('active'));
    D.toggleOrderFiltersBtn?.addEventListener('click', () => D.adminOrderFiltersCollapsibleArea?.classList.toggle('active'));

    // Other tables searches
    D.myReportsSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('myReports', D.myReportsSearchInput.value); UI.renderMyReportsTable(); });
    D.myReportsSearchClearButton?.addEventListener('click', () => { if(D.myReportsSearchInput) D.myReportsSearchInput.value = ''; State.setTableSearchTerm('myReports', ''); UI.renderMyReportsTable(); });
    D.adminEquipmentSearchInput?.addEventListener('input', () => { State.setTableSearchTerm('adminEquipment', D.adminEquipmentSearchInput.value); UI.renderAdminEquipmentTable(); });
    D.adminEquipmentSearchClearButton?.addEventListener('click', () => { if(D.adminEquipmentSearchInput) D.adminEquipmentSearchInput.value = ''; State.setTableSearchTerm('adminEquipment', ''); UI.renderAdminEquipmentTable(); });

    // Dynamic item quantity update - SAFE ACCESS
    D.reportInstallationItemsTableBody?.addEventListener('change', async (e) => {
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
            if (D.orderDetailsModal) D.orderDetailsModal.style.display = 'none';

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
