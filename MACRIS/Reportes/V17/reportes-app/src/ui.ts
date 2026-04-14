
import * as D from './dom';
import { formatDate, formatTime, resizeCanvas, withTimeout } from './utils';
import * as State from './state';
import { calculateSchedule } from './lib/schedule-calculator';
// FIX: Add missing import for PDF generation, required by handleDownloadReportsZip.
import SignaturePad from 'signature_pad';
import { EntityType, Equipment, Order, Report, User, MaintenanceTableKey, EquipmentType, RefrigerantType, City, Company, Dependency } from './types';
// FIX: Changed import from 'fetchReports' to 'fetchAllReports' and 'fetchReportsForWorker'
import { updateMaintenanceReport, fetchAllReports, fetchReportsForWorker, saveEntity, fetchCities, supabaseOrders, supabaseClients } from './api';
import { getAllFromStore, updateLocalReport } from './lib/local-db';
import { FormAutosave } from './form-autosave';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory } from '@capacitor/filesystem'; // <-- AÑADE ESTA LÍNEA
import { FileOpener } from '@awesome-cordova-plugins/file-opener';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
const REQUEST_TIMEOUT_MS = 12000;

let signaturePad: SignaturePad | null = null;
let activeConfirmationResolve: ((value: boolean) => void) | null = null;
let plateCameraStream: MediaStream | null = null;
let photoCaptureStream: MediaStream | null = null;

function normalizeSearchText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function resetModalScroll(modal?: HTMLElement | null) {
    if (!modal) return;
    const scrollTarget = modal.querySelector('.modal-content') as HTMLElement | null;
    const target = scrollTarget || modal;
    target.scrollTop = 0;
    if (typeof target.scrollTo === 'function') {
        target.scrollTo({ top: 0, behavior: 'auto' });
    }
}

/**
 * Checks if a city exists by name (case-insensitive) and creates it via the API if it doesn't.
 * Refreshes the local state with the new list of cities afterwards.
 * @param cityName The name of the city to get or create.
 * @returns The City object (either existing or newly created), or null if creation fails.
 */
async function getOrCreateCityByName(cityName: string): Promise<City | null> {
    if (!cityName || !cityName.trim()) {
        return null;
    }
    const trimmedCityName = cityName.trim();

    // 1. Check if city exists (case-insensitive)
    let existingCity = State.cities.find(c => c.name.toLowerCase() === trimmedCityName.toLowerCase());

    if (existingCity) {
        return existingCity;
    }

    // 2. If not, create it
    console.log(`City "${trimmedCityName}" not found. Creating it.`);
    showAppNotification(`La ciudad "${trimmedCityName}" no existía. Se ha creado automáticamente.`, 'info');

    try {
        const formData = new FormData();
        formData.append('name', trimmedCityName);

        const { data: newCity, error } = await saveEntity('city', '', formData);

        if (error) {
            throw error;
        }

        // 3. Refresh state and return new city
        const allCities = await fetchCities();
        State.setCities(allCities);

        // Find the newly created city in the refreshed list
        const finalNewCity = allCities.find(c => c.id === newCity.id);
        return finalNewCity || null;

    } catch (error) {
        console.error("Failed to create new city:", error);
        showAppNotification(`Error al crear la ciudad "${trimmedCityName}".`, 'error');
        return null;
    }
}

/**
 * Checks if the maintenance report form is valid, ignoring the signature.
 * It uses the form's built-in HTML5 validation and adds custom checks for non-input elements like photos.
 * @returns {boolean} True if the form is valid, false otherwise.
 */
function isReportFormValidWithoutSignature(): boolean {
    if (!D.maintenanceReportForm) return false;

    // Use the form's built-in validation for all elements with `required` attribute.
    // This is efficient and respects the dynamic `required` attributes set elsewhere.
    if (!D.maintenanceReportForm.checkValidity()) {
        return false;
    }

    // Add custom validation for things not covered by standard input attributes.
    const serviceType = D.reportServiceTypeSelect.value;
    const isInstallation = serviceType === 'Montaje/Instalación';

    // For installations, photos are mandatory.
    if (isInstallation) {
        // This validation is now handled with a confirmation modal before submission
        // But for the button state, we can still check it.
        // if (!State.currentReportPhotoInternalBase64 || !State.currentReportPhotoExternalBase64) {
        //     return false; // This would make the button disabled. We want it enabled but as a warning.
        // }
    }

    return true;
}

/**
 * Updates the appearance and text of the main "Save Report" button
 * based on form validity and signature status.
 */
export function updateSaveReportButtonState() {
    if (!D.saveReportButton) return;

    const isFormValid = isReportFormValidWithoutSignature();
    const hasSignature = !!State.currentReportSignatureDataUrl && State.currentReportSignatureDataUrl !== 'PENDING_SIGNATURE';

    if (isFormValid && !hasSignature) {
        D.saveReportButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Guardar Sin Firma';
        D.saveReportButton.classList.remove('btn-primary');
        D.saveReportButton.classList.add('btn-warning');
        D.saveReportButton.title = "El reporte se guardará, pero quedará marcado como pendiente de firma.";
    } else {
        // Default state: either form is invalid, or form is valid and has a signature.
        D.saveReportButton.innerHTML = '<i class="fas fa-save"></i> Guardar Reporte';
        D.saveReportButton.classList.remove('btn-warning');
        D.saveReportButton.classList.add('btn-primary');
        D.saveReportButton.title = "";
    }
}


// FIX: Moved showView definition before its usage in populateBottomNav
export function showView(sectionId: string) {
    if (!D.allSections) return;
    D.allSections.forEach(section => {
        section.style.display = section.id === sectionId ? 'block' : 'none';
    });

    if (sectionId === 'worker-main-section') {
        applyAppSettingsToWorkerUI();
    }
}

export const populateDropdown = (
    selectElement: HTMLSelectElement,
    items: { id: string; name: string }[],
    selectedId?: string | null,
    placeholder: string = 'Seleccione...',
    addOtherOption: boolean = false
) => {
    if (!selectElement) return;
    const currentVal = selectElement.value;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;

    // Deduplicate items based on a normalized name (ignoring case, accents, and extra spaces)
    const seen = new Set<string>();
    const uniqueItems = items.filter(item => {
        const normalized = item.name.trim()
            .replace(/\s+/g, ' ')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });

    uniqueItems.sort((a, b) => a.name.localeCompare(b.name)).forEach(item => {
        const option = new Option(item.name, item.id);
        selectElement.appendChild(option);
    });
    if (addOtherOption) {
        const option = new Option('Otra', 'otra');
        selectElement.appendChild(option);
    }
    selectElement.value = selectedId || currentVal || '';
};

export const populateStringDropdown = (selectElement: HTMLSelectElement, items: string[], selectedValue?: string) => {
    if (!selectElement) return;
    const currentVal = selectElement.value;
    selectElement.innerHTML = '<option value="">Todos</option>';
    [...items].sort().forEach(item => {
        const option = new Option(item, item);
        selectElement.appendChild(option);
    });
    selectElement.value = selectedValue || currentVal || '';
};

/**
 * Updates the City and Sede dropdowns based on the selected Company.
 * @param selectedCompanyId The ID of the currently selected company.
 */
export function updateLocationDropdownsFromCompany(selectedCompanyId: string) {
    const company = State.companies.find(c => c.id === selectedCompanyId);

    if (company) {
        // Find sedes for this company
        const filteredSedes = State.sedes.filter(s => s.companyId === selectedCompanyId);

        if (filteredSedes.length > 0) {
            // Get unique cities from those sedes
            const uniqueCityIds = Array.from(new Set(filteredSedes.map(s => s.cityId).filter(id => id)));
            const availableCities = State.cities.filter(city => uniqueCityIds.includes(city.id));
            populateDropdown(D.reportCitySelectEmpresa, availableCities, undefined, 'Seleccione...', false);
            D.reportCitySelectEmpresa.disabled = false;

            D.reportSedeSelect.innerHTML = '<option value="">Seleccione una ciudad...</option>';
            D.reportSedeSelect.disabled = true;
            const sedeFormGroup = D.reportSedeSelect.closest('.form-group') as HTMLElement;
            if (sedeFormGroup) sedeFormGroup.style.display = '';

            D.reportDependencySelect.innerHTML = '<option value="">Seleccione una sede...</option>';
            D.reportDependencySelect.disabled = true;
        } else {
            // Company has NO SEDES
            populateDropdown(D.reportCitySelectEmpresa, State.cities, undefined, 'Seleccione...', false);
            D.reportCitySelectEmpresa.disabled = false;

            D.reportSedeSelect.innerHTML = '<option value="">Sin sedes disponibles</option>';
            D.reportSedeSelect.disabled = true;
            const sedeFormGroup = D.reportSedeSelect.closest('.form-group') as HTMLElement;
            if (sedeFormGroup) sedeFormGroup.style.display = 'none';

            // Allow selecting dependencies directly for this company
            const filteredDependencies = State.dependencies.filter(d => d.companyId === selectedCompanyId);
            populateDropdown(D.reportDependencySelect, filteredDependencies);
            D.reportDependencySelect.disabled = false;
        }

    } else {
        // Reset if no company is selected
        D.reportCitySelectEmpresa.innerHTML = '<option value="">Seleccione una empresa...</option>';
        D.reportCitySelectEmpresa.disabled = true;
        D.reportSedeSelect.innerHTML = '<option value="">Seleccione una empresa...</option>';
        D.reportSedeSelect.disabled = true;
        const sedeFormGroup = D.reportSedeSelect.closest('.form-group') as HTMLElement;
        if (sedeFormGroup) sedeFormGroup.style.display = '';
        D.reportDependencySelect.innerHTML = '<option value="">Seleccione una sede...</option>';
        D.reportDependencySelect.disabled = true;
    }
}

/**
 * Updates the Sede dropdown based on the selected City and Company.
 * @param selectedCityId The ID of the currently selected city.
 */
export function handleCitySelectionChange(selectedCityId: string) {
    const selectedCompanyId = D.reportCompanySelect?.value;

    if (selectedCityId && selectedCompanyId) {
        const companySedes = State.sedes.filter(s => s.companyId === selectedCompanyId);
        if (companySedes.length === 0) return; // Do nothing if it's a sede-less company, let Dependency remain populated

        // Filter sedes by chosen company and chosen city
        const filteredSedes = companySedes.filter(s => s.cityId === selectedCityId);
        populateDropdown(D.reportSedeSelect, filteredSedes, undefined, 'Seleccione...');
        D.reportSedeSelect.disabled = false;

        D.reportDependencySelect.innerHTML = '<option value="">Seleccione una sede...</option>';
        D.reportDependencySelect.disabled = true;
    } else {
        const companySedes = State.sedes.filter(s => s.companyId === selectedCompanyId);
        if (companySedes.length === 0) return; // Do nothing if it's a sede-less company

        D.reportSedeSelect.innerHTML = '<option value="">Seleccione una ciudad...</option>';
        D.reportSedeSelect.disabled = true;
        D.reportDependencySelect.innerHTML = '<option value="">Seleccione una sede...</option>';
        D.reportDependencySelect.disabled = true;
    }
}

/**
 * Updates the Dependency dropdown based on the selected Sede.
 * @param selectedSedeId The ID of the currently selected sede.
 */
export function handleSedeSelectionChange(selectedSedeId: string) {
    if (selectedSedeId) {
        // Filter and populate dependencies based on Sede
        const filteredDependencies = State.dependencies.filter(d => d.companyId === selectedSedeId);
        populateDropdown(D.reportDependencySelect, filteredDependencies);
        D.reportDependencySelect.disabled = false;
    } else {
        D.reportDependencySelect.innerHTML = '<option value="">Seleccione una sede...</option>';
        D.reportDependencySelect.disabled = true;
    }
}

function setReportCompanySearchMode(isSelected: boolean) {
    const searchField = D.reportCompanySearchContainer?.querySelector('.company-search-field') as HTMLElement | null;
    if (searchField) {
        searchField.style.display = isSelected ? 'none' : 'flex';
    }
    if (D.reportCompanySelectedBadge) {
        D.reportCompanySelectedBadge.style.display = isSelected ? 'flex' : 'none';
    }
}

export function clearReportCompanySelection() {
    if (D.reportCompanySelect) D.reportCompanySelect.value = '';
    if (D.reportCompanySearchInput) D.reportCompanySearchInput.value = '';
    if (D.reportCompanySearchResults) D.reportCompanySearchResults.innerHTML = '';
    if (D.reportCompanyBadgeName) D.reportCompanyBadgeName.textContent = '';
    setReportCompanySearchMode(false);
    updateLocationDropdownsFromCompany('');
    updateSaveReportButtonState();
}

export function setReportCompanySelection(companyId: string, options: { skipUpdate?: boolean } = {}) {
    const company = State.companies.find(c => c.id === companyId);
    if (!company) {
        clearReportCompanySelection();
        return;
    }

    D.reportCompanySelect.value = companyId;
    if (D.reportCompanyBadgeName) D.reportCompanyBadgeName.textContent = company.name;
    if (D.reportCompanySearchInput) D.reportCompanySearchInput.value = company.name;
    if (D.reportCompanySearchResults) D.reportCompanySearchResults.innerHTML = '';
    setReportCompanySearchMode(true);

    if (!options.skipUpdate) {
        updateLocationDropdownsFromCompany(companyId);
    }
    updateSaveReportButtonState();
}

export function renderCompanySearchResults() {
    if (!D.reportCompanySearchInput || !D.reportCompanySearchResults) return;
    if (D.reportCompanySelectedBadge?.style.display !== 'none') return;

    const rawSearchTerm = D.reportCompanySearchInput.value.trim();
    const searchTerm = normalizeSearchText(rawSearchTerm);
    if (!searchTerm) {
        D.reportCompanySearchResults.innerHTML = '';
        return;
    }

    const searchTokens = searchTerm.split(' ').filter(Boolean);

    const results = State.companies
        .map(company => {
            const cityName = State.cities.find(city => city.id === company.cityId)?.name || 'Sin ciudad';
            const normalizedCompanyName = normalizeSearchText(company.name);
            const normalizedCityName = normalizeSearchText(cityName);
            const searchableText = `${normalizedCompanyName} ${normalizedCityName}`.trim();

            const matchesAllTokens = searchTokens.every(token => searchableText.includes(token));
            if (!matchesAllTokens) {
                return null;
            }

            let score = 0;
            if (normalizedCompanyName === searchTerm) score += 1000;
            if (normalizedCompanyName.startsWith(searchTerm)) score += 400;
            if (normalizedCompanyName.includes(searchTerm)) score += 250;
            if (normalizedCityName.includes(searchTerm)) score += 150;
            score += searchTokens.filter(token => normalizedCompanyName.includes(token)).length * 40;
            score += searchTokens.filter(token => normalizedCityName.includes(token)).length * 25;

            return {
                company,
                cityName,
                score,
            };
        })
        .filter((result): result is { company: Company; cityName: string; score: number } => result !== null);

    if (results.length === 0) {
        D.reportCompanySearchResults.innerHTML = '<div class="company-search-result empty">No se encontraron empresas.</div>';
        return;
    }

    D.reportCompanySearchResults.innerHTML = results
        .sort((a, b) => b.score - a.score || a.company.name.localeCompare(b.company.name) || a.cityName.localeCompare(b.cityName))
        .slice(0, 20)
        .map(({ company, cityName }) => {
            return `
                <div class="company-search-result" data-company-id="${company.id}">
                    <strong>${company.name}</strong>
                    <span>${cityName}</span>
                </div>
            `;
        }).join('');
}

// --- UI Helpers ---

export function showLoader(message: string = 'Cargando...') {
    if (D.loadingOverlay) {
        const messageElement = D.loadingOverlay.querySelector('p');
        if (messageElement) {
            messageElement.textContent = message;
        }
        D.loadingOverlay.style.display = 'flex';
    }
}

export function hideLoader() {
    if (D.loadingOverlay) {
        D.loadingOverlay.style.display = 'none';
    }
}

export function showAppNotification(message: string, type: 'error' | 'success' | 'info' | 'warning' = 'info', duration: number = 3000) {
    if (!D.notificationArea) {
        console.error("Notification area not found in DOM. Fallback to alert.");
        alert(message); // Be careful with complex HTML messages here
        return;
    }

    const notificationDiv = document.createElement('div');
    notificationDiv.classList.add('app-notification', type);

    const iconElement = document.createElement('i');
    iconElement.classList.add('fas');
    if (type === 'error') iconElement.classList.add('fa-times-circle');
    else if (type === 'success') iconElement.classList.add('fa-check-circle');
    else if (type === 'warning') iconElement.classList.add('fa-exclamation-triangle');
    else iconElement.classList.add('fa-info-circle');

    const messageContainer = document.createElement('div');
    // CRITICAL FIX: Use innerHTML to render formatted messages with <br>, <strong>, etc.
    messageContainer.innerHTML = message;

    notificationDiv.appendChild(iconElement);
    notificationDiv.appendChild(messageContainer);
    D.notificationArea.appendChild(notificationDiv);

    // This is a trick to ensure the enter animation plays
    void notificationDiv.offsetHeight;

    setTimeout(() => {
        notificationDiv.classList.add('removing');
        notificationDiv.addEventListener('animationend', () => {
            if (notificationDiv.parentElement) {
                notificationDiv.remove();
            }
        });
    }, duration);
}


export function populateLoginWorkerSelect() {
    if (!D.usernameInput) return;

    D.usernameInput.innerHTML = '<option value="">Seleccione su nombre...</option>';

    const activeWorkers = State.users
        .filter(u => u.role === 'worker' && u.isActive)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (activeWorkers.length === 0) {
        D.usernameInput.innerHTML = '<option value="">No hay técnicos activos</option>';
        D.usernameInput.disabled = true;
    } else {
        activeWorkers.forEach(worker => {
            const option = document.createElement('option');
            option.value = worker.id;
            option.textContent = worker.name || worker.username;
            D.usernameInput.appendChild(option);
        });
        D.usernameInput.disabled = false;
    }
}

export function updateUserPointsDisplay(points?: number | null) {
    if (D.userPointsDisplay) {
        if (typeof points === 'number') {
            D.userPointsDisplay.innerHTML = `<i class="fas fa-star" style="color: #ffc107;"></i> ${points}`;
            D.userPointsDisplay.title = `${points} Puntos`;
            D.userPointsDisplay.style.display = 'none'; // Force hide as requested by the user
        } else {
            D.userPointsDisplay.style.display = 'none';
        }
    }
}

export function populateBottomNav(role: 'admin' | 'worker') {
    if (!D.bottomNav) return;
    D.bottomNav.innerHTML = '';

    let navItemsConfig: { id: string; title: string; icon: string; sectionId: string }[] = [];

    if (role === 'admin') {
        navItemsConfig = [
            { id: 'nav-admin-orders', title: 'Órdenes', icon: 'fa-route', sectionId: 'admin-orders-section' },
            { id: 'nav-admin-reports', title: 'Reportes', icon: 'fa-file-invoice', sectionId: 'admin-reports-section' },
            { id: 'nav-admin-schedule', title: 'Cronograma', icon: 'fa-calendar-alt', sectionId: 'admin-schedule-section' },
            { id: 'nav-admin-equipment', title: 'Equipos', icon: 'fa-cogs', sectionId: 'admin-equipment-section' },
            { id: 'nav-admin-management', title: 'Gestión', icon: 'fa-sitemap', sectionId: 'admin-management-section' },
        ];
    } else if (role === 'worker') {
        navItemsConfig = [
            { id: 'nav-worker-orders', title: 'Órdenes', icon: 'fa-clipboard-list', sectionId: 'worker-orders-section' },
            { id: 'nav-worker-main', title: 'Nuevo Reporte', icon: 'fa-edit', sectionId: 'worker-main-section' },
            { id: 'nav-worker-my-reports', title: 'Mis Reportes', icon: 'fa-history', sectionId: 'worker-my-reports-section' },
        ];
    }

    navItemsConfig.forEach(item => {
        const button = document.createElement('button');
        button.classList.add('nav-item');
        button.dataset.sectionId = item.sectionId;
        button.id = item.id;
        button.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.title}</span>`;
        button.addEventListener('click', () => {
            showView(item.sectionId);
            if (D.appHeaderTitle) {
                D.appHeaderTitle.innerHTML = `<i class="fas ${item.icon}"></i> ${item.title}`;
            }
            document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Call render function based on sectionId
            switch (item.sectionId) {
                case 'worker-orders-section':
                    renderAssignedOrdersList();
                    break;
                case 'worker-my-reports-section':
                    renderMyReportsTable();
                    break;
                case 'admin-orders-section':
                    renderAdminOrdersList();
                    break;
                case 'admin-reports-section':
                    renderAdminReportsTable();
                    break;
                case 'admin-schedule-section':
                    renderAdminScheduleTable();
                    break;
                case 'admin-equipment-section':
                    renderAdminEquipmentTable();
                    break;
                case 'admin-management-section':
                    const activeTab = D.adminManagementSection.querySelector('.tab-link.active');
                    if (activeTab) {
                        const tabId = activeTab.getAttribute('data-tab');
                        switch (tabId) {
                            case 'cities-tab': renderCitiesTable(); break;
                            case 'companies-tab': renderCompaniesTable(); break;
                            case 'dependencies-tab': renderDependenciesTable(); break;
                            case 'employees-tab': renderEmployeesTable(); break;
                            case 'settings-tab': renderAppSettings(); break;
                        }
                    } else {
                        const firstTab = D.adminManagementSection.querySelector('.tab-link');
                        if (firstTab) {
                            firstTab.classList.add('active');
                            const firstTabContent = D.adminManagementSection.querySelector('.tab-content');
                            if (firstTabContent) firstTabContent.classList.add('active');
                        }
                        renderCitiesTable();
                    }
                    break;
            }
        });
        D.bottomNav.appendChild(button);
    });
}

function applyAppSettingsToWorkerUI() {
    D.scanQrCameraButton.style.display = State.appSettings['show_qr_camera_button'] ? 'inline-flex' : 'none';
    D.searchByIdButton.style.display = State.appSettings['show_search_by_id_button'] ? 'inline-flex' : 'none';
    D.scanQrFromFileButton.style.display = State.appSettings['show_qr_file_button'] ? 'inline-block' : 'none';
}

// --- Generic Modals ---
export function showConfirmationModal(message: string, confirmText: string = 'Confirmar'): Promise<boolean> {
    if (!D.confirmationModal || !D.confirmationMessage || !D.confirmActionButton) {
        return Promise.resolve(false);
    }

    D.confirmationMessage.textContent = message;
    D.confirmActionButton.textContent = confirmText;
    D.confirmationModal.style.display = 'flex';
    resetModalScroll(D.confirmationModal);

    return new Promise((resolve) => {
        activeConfirmationResolve = resolve;
        D.confirmActionButton.onclick = () => resolveConfirmation(true);
        D.cancelActionButton.onclick = () => resolveConfirmation(false);
    });
}

export function resolveConfirmation(value: boolean) {
    if (activeConfirmationResolve) {
        activeConfirmationResolve(value);
    }
    if (D.confirmationModal) {
        D.confirmationModal.style.display = 'none';
    }
    activeConfirmationResolve = null;
    if (D.confirmActionButton) D.confirmActionButton.onclick = null;
    if (D.cancelActionButton) D.cancelActionButton.onclick = null;
}

export function openImagePreviewModal(src: string) {
    if (D.imagePreviewModal && D.imagePreviewContent) {
        D.imagePreviewContent.src = src;
        D.imagePreviewModal.style.display = 'flex';
        resetModalScroll(D.imagePreviewModal);
    }
}

// --- Admin Management Section ---
export function handleTabClick(e: MouseEvent) {
    const targetLink = (e.currentTarget as HTMLElement);
    const tabId = targetLink.getAttribute('data-tab');
    if (!tabId) return;

    if (D.tabLinks) D.tabLinks.forEach(link => link.classList.remove('active'));
    if (D.tabContents) D.tabContents.forEach(content => content.classList.remove('active'));

    targetLink.classList.add('active');
    const content = document.getElementById(tabId);
    if (content) content.classList.add('active');

    // Call render function for the selected tab
    switch (tabId) {
        case 'cities-tab': renderCitiesTable(); break;
        case 'companies-tab': renderCompaniesTable(); break;
        case 'dependencies-tab': renderDependenciesTable(); break;
        case 'employees-tab': renderEmployeesTable(); break;
        case 'settings-tab': renderAppSettings(); break;
    }
}


// --- Report Form Modal Logic ---

function resetPhotoPreviews() {
    if (D.photoInternalUnitPreview) {
        D.photoInternalUnitPreview.src = '#';
        D.photoInternalUnitPreview.style.display = 'none';
    }
    if (D.photoInternalUnitPlaceholder) {
        D.photoInternalUnitPlaceholder.style.display = 'block';
    }
    if (D.photoExternalUnitPreview) {
        D.photoExternalUnitPreview.src = '#';
        D.photoExternalUnitPreview.style.display = 'none';
    }
    if (D.photoExternalUnitPlaceholder) {
        D.photoExternalUnitPlaceholder.style.display = 'block';
    }
    State.setCurrentReportPhotoInternalBase64(null);
    State.setCurrentReportPhotoExternalBase64(null);
}

function setPhotoPreviewStyles(img: HTMLImageElement) {
    img.style.maxWidth = '70%';
    img.style.maxHeight = '35vh';
    img.style.objectFit = 'contain';
    img.style.borderRadius = '8px';
    img.style.margin = '0 auto';
    img.style.display = 'block';
}

export async function openReportFormModal(options: { report?: Report; equipment?: Partial<Equipment>; category?: 'empresa' | 'residencial', isFromOrder?: boolean; serviceType?: string; order?: Order, orderItemId?: string } = {}) {
    const { report, equipment, category, isFromOrder, serviceType, order, orderItemId } = options;

    if (!D.maintenanceReportForm || !State.currentUser) return;

    // Reset and setup form
    D.maintenanceReportForm.reset();
    D.reportIdInput.value = report ? report.id : '';
    D.reportOrderIdHidden.value = order?.id || '';
    if (D.reportOrderItemIdHidden) {
        D.reportOrderItemIdHidden.value = orderItemId || '';
    }
    D.saveReportButton.innerHTML = report ? '<i class="fas fa-save"></i> Actualizar Reporte' : '<i class="fas fa-save"></i> Guardar Reporte';
    D.aiScanPlateButton.style.display = report ? 'none' : 'block';
    D.aiScanPlateButton.disabled = !navigator.onLine; // Disable button if offline

    if (!report && !equipment && !order) {
        if (FormAutosave.restoreDraft()) {
            showAppNotification('Borrador previo recuperado automáticamente.', 'info');

            // Especial para categoría "Empresa": Restaurar la UI de búsquedas anidadas
            if (D.reportCompanySelect && D.reportCompanySelect.value !== '') {
                setReportCompanySelection(D.reportCompanySelect.value, { skipUpdate: false });

                // setReportCompanySelection asíncronamente refresca dependencias a través de updateLocationDropdownsFromCompany
                // Llamamos a restoreDraft nuevamente para repoblar la dependencia/equipo seleccionada tras recrearse los `<option>`
                setTimeout(() => {
                    FormAutosave.restoreDraft();
                }, 50);
            }
        }
    }
    if (D.aiScanOfflineWarning) {
        D.aiScanOfflineWarning.style.display = navigator.onLine ? 'none' : 'block';
    }
    D.reportServiceTypeSelect.disabled = !!report && !isFromOrder;

    // Reset signature pad & photos
    resetPhotoPreviews();

    // Explicitly reset signature state and UI for ALL opens, then repopulate if editing.
    State.setCurrentReportSignatureDataUrl(null);
    D.signaturePreviewImage.src = '#';
    D.signaturePreviewImage.style.display = 'none';
    D.signaturePlaceholderText.style.display = 'block';
    if (signaturePad) {
        signaturePad.clear();
    }
    State.setIsSignaturePadDirty(false); // Also reset dirty flag

    const selectedCategory = report?.equipmentSnapshot?.category || equipment?.category || category;

    // Show/hide location fields based on category
    if (selectedCategory === 'residencial') {
        D.reportLocationEmpresaContainer.style.display = 'none';
        D.reportLocationResidencialContainer.style.display = 'block';
        // Remove empresa requirements
        D.reportCompanySelect.removeAttribute('required');
        D.reportDependencySelect.removeAttribute('required');
        // Add residencial requirements
        D.reportClientNameInput.setAttribute('required', 'true');
        D.reportAddressInput.setAttribute('required', 'true');
        D.reportCitySelectResidencial.setAttribute('required', 'true');
    } else { // 'empresa' or default
        D.reportLocationEmpresaContainer.style.display = 'block';
        D.reportLocationResidencialContainer.style.display = 'none';
        // Add empresa requirements
        D.reportCompanySelect.setAttribute('required', 'true');
        D.reportDependencySelect.setAttribute('required', 'true');
        // Remove residencial requirements
        D.reportClientNameInput.removeAttribute('required');
        D.reportAddressInput.removeAttribute('required');
        D.reportCitySelectResidencial.removeAttribute('required');
    }

    // Populate form with data
    const snapshot = report?.equipmentSnapshot;
    const targetEquipment = report ? null : equipment; // Only use equipment if creating new report

    const isWorker = State.currentUser?.role === 'worker';

    // NEW LOGIC FOR LOCATION DROPDOWNS
    // Populate ALL companies and cities
    populateDropdown(D.reportCompanySelect, State.companies);
    populateDropdown(D.reportCitySelectEmpresa, State.cities); // It's disabled, but needs options for value setting
    populateDropdown(D.reportCitySelectResidencial, State.cities, undefined, 'Seleccione...', isWorker);
    clearReportCompanySelection();

    // Hide city creation button for workers
    const addCityButtonResidencial = D.reportCitySelectResidencial.closest('.input-with-button')?.querySelector('.btn-add-inline[data-entity-type="city"]');
    if (addCityButtonResidencial) {
        (addCityButtonResidencial as HTMLElement).style.display = isWorker ? 'none' : 'inline-flex';
    }


    // Populate client/location data based on precedence: report > order > equipment
    if (report) {
        const cityIdToSelect = report.cityId;
        if (selectedCategory === 'residencial') {
            D.reportClientNameInput.value = report.equipmentSnapshot.client_name || '';
            D.reportAddressInput.value = report.equipmentSnapshot.address || '';
            if (cityIdToSelect) D.reportCitySelectResidencial.value = cityIdToSelect;
        } else { // empresa
            const companyIdToSelect = report.companyId;
            const sedeIdToSelect = report.sedeId;
            const dependencyIdToSelect = report.dependencyId;
            if (companyIdToSelect) {
                setReportCompanySelection(companyIdToSelect, { skipUpdate: true });
                updateLocationDropdownsFromCompany(companyIdToSelect);
                if (sedeIdToSelect) {
                    D.reportSedeSelect.value = sedeIdToSelect;
                    handleSedeSelectionChange(sedeIdToSelect);
                    if (dependencyIdToSelect) {
                        D.reportDependencySelect.value = dependencyIdToSelect;
                    }
                }
            }
        }
    } else if (order && order.clientDetails) {
        const cityNameFromOrder = order.clientDetails.city;
        let city: City | null = null;
        if (cityNameFromOrder) {
            showLoader('Verificando ciudad...');
            try {
                city = await getOrCreateCityByName(cityNameFromOrder);
                // Now that cities might have been updated, repopulate all city dropdowns
                if (city) {
                    populateDropdown(D.reportCitySelectResidencial, State.cities, city.id, 'Seleccione...', isWorker);
                    // D.reportCitySelectEmpresa is disabled, but let's update its options anyway
                    populateDropdown(D.reportCitySelectEmpresa, State.cities);
                }
            } finally {
                hideLoader();
            }
        }

        if (selectedCategory === 'empresa') {
            const clientName = order.clientDetails.name;
            const matchedCompany = State.companies.find(c => c.name.trim().toLowerCase() === clientName.trim().toLowerCase());
            if (matchedCompany) {
                setReportCompanySelection(matchedCompany.id, { skipUpdate: true });
                // This populates dependencies and sets city from company record.
                updateLocationDropdownsFromCompany(matchedCompany.id);
                // Pre-select Sede if order has it
                if (order.sede_id) {
                    const matchedSede = State.sedes.find(s => s.id === order.sede_id);
                    if (matchedSede && matchedSede.cityId) {
                        D.reportCitySelectEmpresa.value = matchedSede.cityId;
                        handleCitySelectionChange(matchedSede.cityId);
                    }
                    D.reportSedeSelect.value = order.sede_id;
                    handleSedeSelectionChange(order.sede_id);
                }
            }
            // Now, override the city with the one from the order, if it was found/created and no sede was selected.
            if (city && !order.sede_id) {
                D.reportCitySelectEmpresa.value = city.id;
            }
        } else { // residencial
            D.reportClientNameInput.value = order.clientDetails.name || '';
            D.reportAddressInput.value = order.clientDetails.address || '';
            // The city is already populated and selected from the `getOrCreateCityByName` call above
            if (city) {
                D.reportCitySelectResidencial.value = city.id;
            }
        }
    } else if (targetEquipment) {
        const cityIdToSelect = targetEquipment.cityId;
        if (selectedCategory === 'residencial') {
            D.reportClientNameInput.value = targetEquipment.client_name || '';
            D.reportAddressInput.value = targetEquipment.address || '';
            if (cityIdToSelect) D.reportCitySelectResidencial.value = cityIdToSelect;
        } else { // empresa
            let companyIdToSelect = targetEquipment.client_id || targetEquipment.companyId;
            const sedeIdToSelect = targetEquipment.sedeId;
            const dependencyIdToSelect = targetEquipment.dependencyId;

            if (companyIdToSelect && !State.companies.find(c => c.id === companyIdToSelect)) {
                if (targetEquipment.companyName) {
                    const matched = State.companies.find(c => c.name === targetEquipment.companyName);
                    if (matched) companyIdToSelect = matched.id;
                }
            }

            if (companyIdToSelect) {
                setReportCompanySelection(companyIdToSelect, { skipUpdate: true });
                updateLocationDropdownsFromCompany(companyIdToSelect);
                if (sedeIdToSelect) {
                    const matchedSede = State.sedes.find(s => s.id === sedeIdToSelect);
                    if (matchedSede && matchedSede.cityId) {
                        D.reportCitySelectEmpresa.value = matchedSede.cityId;
                        handleCitySelectionChange(matchedSede.cityId);
                    }
                    D.reportSedeSelect.value = sedeIdToSelect;
                    handleSedeSelectionChange(sedeIdToSelect);
                    if (dependencyIdToSelect) {
                        D.reportDependencySelect.value = dependencyIdToSelect;
                    }
                }
            }
        }
    }


    D.reportEquipmentModelInput.value = snapshot?.model || targetEquipment?.model || '';
    D.reportEquipmentBrandInput.value = snapshot?.brand || targetEquipment?.brand || '';
    D.reportEquipmentCapacityInput.value = snapshot?.capacity || targetEquipment?.capacity || '';
    D.reportEquipmentIdHidden.value = snapshot?.id || targetEquipment?.id || 'MANUAL_NO_ID';

    // Populate dropdowns for equipment type and refrigerant
    populateDropdown(D.reportEquipmentTypeSelect, State.equipmentTypes, targetEquipment?.equipment_type_id);
    populateDropdown(D.reportEquipmentRefrigerantSelect, State.refrigerantTypes, targetEquipment?.refrigerant_type_id);

    // If editing a report, select based on the snapshot's name
    if (snapshot) {
        const typeIdFromSnapshot = State.equipmentTypes.find(t => t.name === snapshot.type)?.id;
        if (typeIdFromSnapshot) D.reportEquipmentTypeSelect.value = typeIdFromSnapshot;

        const refrigerantIdFromSnapshot = State.refrigerantTypes.find(t => t.name === snapshot.refrigerant)?.id;
        if (refrigerantIdFromSnapshot) D.reportEquipmentRefrigerantSelect.value = refrigerantIdFromSnapshot;
    }

    if (D.reportServiceTypeSelect) {
        D.reportServiceTypeSelect.innerHTML = '';
        let hasOtro = false;
        State.serviceTypes.forEach(st => {
            const option = new Option(st.name, st.name);
            D.reportServiceTypeSelect.appendChild(option);
            if (st.name === 'Otro') hasOtro = true;
        });
        if (!hasOtro) {
            const option = new Option('Otro', 'Otro');
            D.reportServiceTypeSelect.appendChild(option);
        }
    }

    const finalServiceType = serviceType || report?.serviceType;
    if (finalServiceType) {
        if (finalServiceType.startsWith('Otro')) {
            D.reportServiceTypeSelect.value = 'Otro';
            D.reportServiceTypeOtherInput.value = finalServiceType.replace(/^Otro:\s*/, '').trim();
            if (D.reportServiceTypeOtherInput.value === 'Otro') D.reportServiceTypeOtherInput.value = '';
        } else {
            D.reportServiceTypeSelect.value = finalServiceType;
            D.reportServiceTypeOtherInput.value = '';
        }
    } else if (!report) {
        // Default to 'Mantenimiento Preventivo' for new reports
        D.reportServiceTypeSelect.value = 'Mantenimiento Preventivo';
        D.reportServiceTypeOtherInput.value = '';
    }

    toggleReportFormFields(D.reportServiceTypeSelect.value);

    D.reportPressureInput.value = report?.pressure || '';
    D.reportAmperageInput.value = report?.amperage || '';
    D.reportObservationsTextarea.value = report?.observations || '';
    D.reportWorkerNameInput.value = State.currentUser.name || State.currentUser.username;

    // Set signature if editing
    if (report?.clientSignature && report.clientSignature !== "PENDING_SIGNATURE") {
        State.setCurrentReportSignatureDataUrl(report.clientSignature);
        D.signaturePreviewImage.src = report.clientSignature;
        D.signaturePreviewImage.style.display = 'block';
        D.signaturePlaceholderText.style.display = 'none';
    }

    // Set installation photos if editing
    if (report?.photo_internal_unit_url && report.photo_internal_unit_url !== 'PENDING_PHOTO') {
        State.setCurrentReportPhotoInternalBase64(report.photo_internal_unit_url);
        D.photoInternalUnitPreview.src = report.photo_internal_unit_url;
        setPhotoPreviewStyles(D.photoInternalUnitPreview);
        D.photoInternalUnitPlaceholder.style.display = 'none';
    }
    if (report?.photo_external_unit_url && report.photo_external_unit_url !== 'PENDING_PHOTO') {
        State.setCurrentReportPhotoExternalBase64(report.photo_external_unit_url);
        D.photoExternalUnitPreview.src = report.photo_external_unit_url;
        setPhotoPreviewStyles(D.photoExternalUnitPreview);
        D.photoExternalUnitPlaceholder.style.display = 'none';
    }

    // Populate installation items if opening from an order
    if (order?.items && order.order_type === 'Montaje/Instalación') {
        D.reportInstallationItemsTableBody.innerHTML = '';
        order.items.forEach(item => {
            const row = D.reportInstallationItemsTableBody.insertRow();
            row.innerHTML = `
                <td>${item.description}</td>
                <td class="quantity-col">
                    <input type="number" class="quantity-input" value="${item.quantity}" min="0" data-order-item-id="${item.id}">
                </td>
            `;
        });
    } else {
        D.reportInstallationItemsTableBody.innerHTML = '<tr><td colspan="2">No hay items para esta orden.</td></tr>';
    }

    updateSaveReportButtonState(); // Set initial button state
    D.reportFormModal.style.display = 'flex';
    resetModalScroll(D.reportFormModal);
}

export function closeReportFormModal() {
    if (D.reportFormModal) {
        D.reportFormModal.style.display = 'none';
        State.setOrderToReportOn(null); // Clear any lingering order context
    }
}

export function toggleReportFormFields(serviceType: string) {
    const isInstallation = serviceType === 'Montaje/Instalación' || serviceType === 'Otro';

    if (serviceType === 'Otro') {
        D.reportServiceTypeOtherContainer.style.display = 'block';
        D.reportServiceTypeOtherInput.setAttribute('required', 'true');
    } else {
        D.reportServiceTypeOtherContainer.style.display = 'none';
        D.reportServiceTypeOtherInput.removeAttribute('required');
    }


    // Hide/show entire sections that are mutually exclusive
    D.reportEquipmentFieldsContainer.style.display = isInstallation ? 'none' : 'block';
    D.reportInstallationItemsContainer.style.display = isInstallation ? 'block' : 'none';
    D.reportInstallationPhotosContainer.style.display = isInstallation ? 'block' : 'none';

    // Keep the "Mediciones y Observaciones" container visible for both
    D.reportMeasurementsContainer.style.display = 'block';

    // But hide specific measurement fields for installation reports
    const pressureGroup = D.reportPressureInput.parentElement;
    const amperageGroup = D.reportAmperageInput.parentElement;
    if (pressureGroup) pressureGroup.style.display = isInstallation ? 'none' : 'block';
    if (amperageGroup) amperageGroup.style.display = isInstallation ? 'none' : 'block';

    // Also, adjust the title of the section for clarity
    const measurementsHeader = D.reportMeasurementsContainer.querySelector('h4');
    if (measurementsHeader) {
        measurementsHeader.textContent = isInstallation ? 'Observaciones Adicionales' : 'Mediciones y Observaciones';
    }

    // Toggle required attributes for equipment fields (not needed for installations)
    const requiredInputs = D.reportEquipmentFieldsContainer.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[required], select[required]');
    requiredInputs.forEach(input => {
        if (isInstallation) {
            input.removeAttribute('required');
        } else {
            input.setAttribute('required', 'true');
        }
    });
}


// --- Signature Pad ---
export function initSignaturePad() {
    if (!D.signatureCanvas) return;
    signaturePad = new SignaturePad(D.signatureCanvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)'
    });

    signaturePad.addEventListener("beginStroke", () => {
        State.setIsSignaturePadDirty(true);
    });

    D.saveSignatureButton?.addEventListener('click', saveSignature);
    D.clearSignatureButton?.addEventListener('click', clearSignature);
}

export function handleResizeSignatureCanvas() {
    if (signaturePad && D.signatureCanvas) {
        resizeCanvas(D.signatureCanvas);
        signaturePad.clear(); // Resizing clears the canvas, so clear the data too
        if (State.currentReportSignatureDataUrl) {
            // If there was a signature, it's now cleared, so update state
            State.setCurrentReportSignatureDataUrl(null);
        }
    }
}

async function saveSignature() {
    if (!signaturePad || !State.currentUser) return;

    const reportId = State.reportIdForSignatureUpdate;
    const isEditingExistingReport = !!reportId;
    const isClearingSignature = signaturePad.isEmpty() && State.isSignaturePadDirty;

    // --- LOGIC FOR A NEW, UNSAVED REPORT ---
    if (!isEditingExistingReport) {
        if (isClearingSignature) {
            State.setCurrentReportSignatureDataUrl(null);
        } else if (!signaturePad.isEmpty()) {
            State.setCurrentReportSignatureDataUrl(signaturePad.toDataURL('image/png'));
        }

        // Update UI for the main report form
        if (D.signaturePreviewImage && D.signaturePlaceholderText) {
            const dataUrl = State.currentReportSignatureDataUrl;
            D.signaturePreviewImage.src = dataUrl || '#';
            D.signaturePreviewImage.style.display = dataUrl ? 'block' : 'none';
            D.signaturePlaceholderText.style.display = dataUrl ? 'none' : 'block';
        }
        closeSignatureModal();
        updateSaveReportButtonState();
        return;
    }

    // --- LOGIC FOR EDITING AN EXISTING REPORT (ONLINE/OFFLINE) ---
    if (isClearingSignature) {
        const confirmed = await showConfirmationModal("¿Está seguro de que desea eliminar la firma de este reporte?", "Eliminar Firma");
        if (!confirmed) return;
    }

    const dataUrl = isClearingSignature ? "PENDING_SIGNATURE" : signaturePad.toDataURL('image/png');
    const isSignaturePending = dataUrl === "PENDING_SIGNATURE";
    const updateData = { clientSignature: dataUrl, isSignaturePending };
    const dbUpdateData = { client_signature: dataUrl };
    const loaderMessage = isClearingSignature ? 'Eliminando firma...' : 'Actualizando firma...';

    showLoader(loaderMessage);
    try {
        // Optimistic check: if offline, go directly to local update.
        if (!navigator.onLine) throw new Error('Offline');

        // --- TRY ONLINE ---
        await withTimeout(
            updateMaintenanceReport(reportId, dbUpdateData),
            REQUEST_TIMEOUT_MS,
            'actualizar firma'
        );

        // --- ONLINE SUCCESS ---
        await updateLocalReport(reportId, updateData);
        const reportInState = State.reports.find(r => r.id === reportId);
        if (reportInState) {
            reportInState.clientSignature = dataUrl;
            reportInState.isSignaturePending = isSignaturePending;
        }
        renderMyReportsTable();
        if (State.currentUser.role === 'admin') renderAdminReportsTable();
        showAppNotification('Firma actualizada con éxito.', 'success');
        hideLoader();

    } catch (err: any) {
        // --- CATCH AND FALLBACK ---
        const isNetworkError = err.message === 'Offline' || err.message.includes('Failed to fetch');
        if (isNetworkError) {
            console.warn(`Online signature update failed for report ${reportId}. Falling back to local update.`, err);
            try {
                // --- OFFLINE LOGIC ---
                await updateLocalReport(reportId, updateData);

                const reportInState = State.reports.find(r => r.id === reportId);
                if (reportInState) {
                    reportInState.clientSignature = dataUrl;
                    reportInState.isSignaturePending = isSignaturePending;
                }

                renderMyReportsTable();
                if (State.currentUser.role === 'admin') renderAdminReportsTable();
                showAppNotification('Firma actualizada localmente.', 'info');
            } catch (localErr: any) {
                showAppNotification(`Error al actualizar firma local: ${localErr.message}`, 'error');
            } finally {
                hideLoader();
            }
        } else {
            // --- OTHER (NON-NETWORK) ERROR ---
            hideLoader();
            showAppNotification(`Error al actualizar firma: ${err.message}`, 'error');
            console.error('Non-network error during signature update:', err);
        }
    }

    closeSignatureModal();
}


export function clearSignature() {
    if (signaturePad) {
        signaturePad.clear();
        State.setIsSignaturePadDirty(true);
    }
}

export function openSignatureModal(reportIdToUpdate?: string) {
    let existingSignature: string | null = null;
    let signaturePending = false;
    if (reportIdToUpdate) {
        const report = State.reports.find(r => r.id === reportIdToUpdate);
        if (report) {
            const pendingStatus = getPendingStatus(report);
            signaturePending = pendingStatus.signaturePending;
            if (!signaturePending) {
                existingSignature = report.clientSignature || null;
            }
        }
    } else if (State.currentReportSignatureDataUrl) {
        signaturePending = State.currentReportSignatureDataUrl === 'PENDING_SIGNATURE';
        if (!signaturePending) {
            existingSignature = State.currentReportSignatureDataUrl;
        }
    } else {
        signaturePending = true;
    }

    if (reportIdToUpdate) {
        State.setReportIdForSignatureUpdate(reportIdToUpdate);
    }
    if (D.signatureModal) {
        D.signatureModal.style.display = 'flex';
        resetModalScroll(D.signatureModal);
        handleResizeSignatureCanvas();
        clearSignature();
        State.setIsSignaturePadDirty(false);

        if (D.signatureModalPreviewImage && D.signatureModalPreviewPlaceholder) {
            if (existingSignature) {
                D.signatureModalPreviewImage.src = existingSignature;
                D.signatureModalPreviewImage.style.display = 'block';
                D.signatureModalPreviewPlaceholder.style.display = 'none';
                if (D.signatureModalPreviewTitle) {
                    D.signatureModalPreviewTitle.style.display = 'block';
                    D.signatureModalPreviewTitle.textContent = 'Firma actual';
                }
            } else {
                D.signatureModalPreviewImage.src = '#';
                D.signatureModalPreviewImage.style.display = 'none';
                D.signatureModalPreviewPlaceholder.textContent = signaturePending ? 'Firma pendiente. Haga firmar.' : 'No hay firma guardada.';
                D.signatureModalPreviewPlaceholder.style.color = signaturePending ? 'var(--color-warning)' : 'var(--color-text-secondary)';
                D.signatureModalPreviewPlaceholder.style.display = 'inline';
                if (D.signatureModalPreviewTitle) {
                    D.signatureModalPreviewTitle.style.display = signaturePending ? 'none' : 'block';
                    D.signatureModalPreviewTitle.textContent = 'Firma actual';
                }
            }
        }
    }
}

export function closeSignatureModal() {
    if (D.signatureModal) D.signatureModal.style.display = 'none';
    State.setReportIdForSignatureUpdate(null);
}

// --- AI Plate Scan ---

export function openPlateScanModal(targetForm: 'report' | 'equipment') {
    if (!D.plateVideoElement || !D.plateScanModal) return;

    State.setAiScanTargetForm(targetForm);

    D.plateScanModal.style.display = 'flex';
    resetModalScroll(D.plateScanModal);
    D.plateScanFeedback.textContent = 'Apuntando a la cámara...';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            plateCameraStream = stream;
            D.plateVideoElement.srcObject = stream;
            D.plateVideoElement.setAttribute("playsinline", "true");
            D.plateVideoElement.play();
            D.plateScanFeedback.textContent = 'Apunta a la placa del equipo y captura.';
        })
        .catch(err => {
            console.error("Error al acceder a la cámara:", err);
            D.plateScanFeedback.textContent = 'Error al acceder a la cámara.';
            showAppNotification('No se pudo acceder a la cámara. Verifique los permisos.', 'error');
            closePlateScanModal();
        });
}

export function closePlateScanModal() {
    if (plateCameraStream) {
        plateCameraStream.getTracks().forEach(track => track.stop());
        plateCameraStream = null;
    }
    if (D.plateScanModal) D.plateScanModal.style.display = 'none';
    if (D.plateVideoElement) D.plateVideoElement.srcObject = null;
}

export function handlePlatePictureTaken() {
    if (!D.plateVideoElement || D.plateVideoElement.readyState !== D.plateVideoElement.HAVE_ENOUGH_DATA) {
        showAppNotification('El video de la cámara no está listo.', 'warning');
        return;
    }

    const canvas = D.plateHiddenCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = D.plateVideoElement.videoWidth;
    canvas.height = D.plateVideoElement.videoHeight;
    ctx.drawImage(D.plateVideoElement, 0, 0, canvas.width, canvas.height);

    const base64Image = canvas.toDataURL('image/jpeg', 0.9);
    closePlateScanModal();
    showLoader('Analizando imagen con IA...');
    import('./ai').then(({ extractDataFromImage }) => {
        return extractDataFromImage(base64Image);
    }).catch(err => {
        console.error('Error cargando modulo IA:', err);
        showAppNotification('No se pudo cargar el análisis por IA', 'error');
    }).finally(() => {
        hideLoader();
    });
}

// FIX: Add missing AI Reconciliation Modal functions
// --- AI Reconciliation Modal ---
export function closeAiReconciliationModal() {
    if (D.aiReconciliationModal) {
        D.aiReconciliationModal.style.display = 'none';
    }
}

export function showAiReconciliationResults(matches: any[]) {
    if (!D.aiReconciliationModal || !D.aiReconciliationResults) return;

    if (matches.length === 0) {
        D.aiReconciliationResults.innerHTML = '<p>No se encontraron coincidencias claras.</p>';
    } else {
        D.aiReconciliationResults.innerHTML = matches.map(match => {
            const order = State.allServiceOrders.find(o => o.id === match.orderId);
            const report = State.reports.find(r => r.id === match.reportId);
            if (!order || !report) return ''; // Should not happen

            const confidenceMap = {
                alta: { text: 'Alta', class: 'confidence-high' },
                media: { text: 'Media', class: 'confidence-medium' },
                baja: { text: 'Baja', class: 'confidence-low' },
            };
            const confidenceInfo = confidenceMap[match.confidence as keyof typeof confidenceMap] || { text: match.confidence, class: '' };

            const reportClient = report.equipmentSnapshot.category === 'residencial' ? report.equipmentSnapshot.client_name : report.equipmentSnapshot.companyName;

            return `
                <div class="reconciliation-card">
                    <div class="reconciliation-header">
                        <span class="confidence-badge ${confidenceInfo.class}">${confidenceInfo.text}</span>
                        <button class="action-btn link-report-btn btn-primary" data-order-id="${order.id}" data-report-id="${report.id}" title="Vincular este reporte con la orden">
                            <i class="fas fa-link"></i> Vincular
                        </button>
                    </div>
                    <p class="reconciliation-reason"><strong>Razón:</strong> ${match.reason}</p>
                    <div class="reconciliation-details">
                        <div class="detail-column">
                            <h4><i class="fas fa-route"></i> Orden #${order.manualId || order.id.substring(0, 8)}</h4>
                            <p><strong>Cliente:</strong> ${order.clientDetails?.name}</p>
                            <p><strong>Fecha:</strong> ${formatDate(order.service_date, false)}</p>
                            <p><strong>Técnicos:</strong> ${order.assignedTechnicians?.map(t => t.name).join(', ') || 'N/A'}</p>
                        </div>
                        <div class="detail-column">
                            <h4><i class="fas fa-file-alt"></i> Reporte #${report.id.substring(0, 8)}</h4>
                            <p><strong>Cliente:</strong> ${reportClient}</p>
                            <p><strong>Fecha:</strong> ${formatDate(report.timestamp)}</p>
                            <p><strong>Técnico:</strong> ${report.workerName}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    D.aiReconciliationModal.style.display = 'flex';
    resetModalScroll(D.aiReconciliationModal);
}


// --- Installation Photo Capture ---
export async function triggerPhotoCapture(type: 'internal' | 'external', source: 'CAMERA' | 'PHOTOS') {
    const isCapacitor = !!Capacitor.isNativePlatform();

    if (isCapacitor) {
        try {
            await Camera.requestPermissions();
            const photo = await Camera.getPhoto({
                quality: 75,
                width: 1280,
                resultType: CameraResultType.DataUrl,
                source: source === 'CAMERA' ? CameraSource.Camera : CameraSource.Photos,
                correctOrientation: true,
            });
            if (photo?.dataUrl) {
                applyCapturedPhoto(photo.dataUrl, type);
                showAppNotification('Foto capturada correctamente.', 'success');
            }
            return;
        } catch (err) {
            console.warn("Capacitor camera/photos failed, falling back to web methods", err);
        }
    }

    // Web Fallback
    if (source === 'PHOTOS') {
        const inputId = type === 'internal' ? 'upload-internal-unit-input' : 'upload-external-unit-input';
        document.getElementById(inputId)?.click();
    } else {
        openPhotoCaptureModal(type);
    }
}

export async function openPhotoCaptureModal(type: 'internal' | 'external') {
    if (!D.photoCaptureModal || !D.photoCaptureVideo) return;

    State.setCurrentPhotoCaptureType(type);
    D.photoCaptureModal.setAttribute('data-photo-type', type);

    D.photoCaptureTitle.innerHTML = `<i class="fas fa-camera-retro"></i> Capturar Foto (${type === 'internal' ? 'U. Interna' : 'U. Externa'})`;
    D.photoCaptureModal.style.display = 'flex';
    resetModalScroll(D.photoCaptureModal);
    if (D.photoCaptureFeedback) D.photoCaptureFeedback.textContent = 'Activando cámara...';

    // Cleanup previous stream
    if (photoCaptureStream) {
        photoCaptureStream.getTracks().forEach((track) => track.stop());
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        photoCaptureStream = stream;

        const video = D.photoCaptureVideo;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        await video.play();

        await new Promise<void>((resolve, reject) => {
            let checks = 0;
            const interval = setInterval(() => {
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                    clearInterval(interval);
                    resolve();
                }
                if (++checks > 30) {
                    clearInterval(interval);
                    reject(new Error('Video no inicializó correctamente.'));
                }
            }, 100);
        });

        if (D.photoCaptureFeedback) D.photoCaptureFeedback.textContent = 'Apunta y captura la foto.';
    } catch (webErr) {
        console.error('getUserMedia falló:', webErr);
        showAppNotification('No se pudo acceder a la cámara en el navegador web.', 'error');
        closePhotoCaptureModal();
    }
}
export function closePhotoCaptureModal() {
    if (photoCaptureStream) {
        photoCaptureStream.getTracks().forEach(track => track.stop());
        photoCaptureStream = null;
    }
    if (D.photoCaptureModal) D.photoCaptureModal.style.display = 'none';
    if (D.photoCaptureVideo) D.photoCaptureVideo.srcObject = null;
    State.setCurrentPhotoCaptureType(null);
}

export async function handlePhotoCaptured() {
    const video = D.photoCaptureVideo;
    if (!video || !photoCaptureStream) {
        showAppNotification('Cámara no inicializada.', 'error');
        return;
    }

    // 🔹 Leer tipo antes de cerrar el modal
    const modalType = D.photoCaptureModal?.getAttribute('data-photo-type') as 'internal' | 'external';
    const captureType = modalType || State.currentPhotoCaptureType || 'internal';

    // Asegurarse de que haya datos válidos
    if (video.videoWidth === 0 || video.videoHeight === 0) {
        showAppNotification('Esperando a que la cámara esté lista...', 'info');
        await new Promise(res => setTimeout(res, 500));
    }

    const canvas = D.photoCaptureHiddenCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        showAppNotification('Error al inicializar el lienzo.', 'error');
        return;
    }

    const rawWidth = video.videoWidth;
    const rawHeight = video.videoHeight;
    if (rawWidth === 0 || rawHeight === 0) {
        showAppNotification('No se detectó imagen válida.', 'error');
        return;
    }

    // P5: Limitar dimensiones para reducir peso en memoria (~60% menos en base64)
    const MAX_PHOTO_DIM = 1024;
    const scale = Math.min(MAX_PHOTO_DIM / rawWidth, MAX_PHOTO_DIM / rawHeight, 1);
    const width = Math.round(rawWidth * scale);
    const height = Math.round(rawHeight * scale);

    canvas.width = width;
    canvas.height = height;

    try {
        ctx.drawImage(video, 0, 0, width, height);
    } catch (err) {
        console.error('Error al dibujar frame:', err);
        showAppNotification('No se pudo capturar la imagen.', 'error');
        return;
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.70);

    // Guardar contexto
    const context = State.contextForPhotoUpdate;

    // Cerrar modal
    closePhotoCaptureModal();

    await processPhotoDataUrl(dataUrl, captureType, context);
}

export async function handlePhotoUploadWeb(file: File) {
    // Rely exclusively on the accurately updated State from the file upload flow
    const captureType = State.currentPhotoCaptureType || 'internal';
    const context = State.contextForPhotoUpdate;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = D.photoCaptureHiddenCanvas;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                showAppNotification('Error interno.', 'error');
                return;
            }

            // P5: Limitar dimensiones para reducir peso en memoria
            const MAX_DIM = 1024;
            let width = img.width;
            let height = img.height;
            const scale = Math.min(MAX_DIM / width, MAX_DIM / height, 1);
            width = Math.round(width * scale);
            height = Math.round(height * scale);

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.70);

            closePhotoCaptureModal();
            await processPhotoDataUrl(dataUrl, captureType, context);
        };
        img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
}

async function processPhotoDataUrl(dataUrl: string, captureType: 'internal' | 'external', context: any) {
    // 🔹 Si estamos editando un reporte existente
    if (context && context.reportId) {
        try {
            const { reportId, photoType } = context;
            const isOnline = navigator.onLine;

            // Datos para Supabase (solo columnas existentes)
            const updatePayload = photoType === 'internal'
                ? { photo_internal_unit_url: dataUrl }
                : { photo_external_unit_url: dataUrl };

            // Calcular bandera local de fotos pendientes sin enviarla al backend (no hay columna)
            let arePhotosPendingFlag: boolean | undefined;
            const reportForFlags = State.reports.find(r => r.id === reportId);
            if (reportForFlags) {
                const requiresPhotos = reportForFlags.serviceType === 'Montaje/Instalación';
                const nextInternal = photoType === 'internal' ? dataUrl : reportForFlags.photo_internal_unit_url;
                const nextExternal = photoType === 'external' ? dataUrl : reportForFlags.photo_external_unit_url;
                arePhotosPendingFlag = requiresPhotos
                    ? !(nextInternal && nextExternal && nextInternal !== 'PENDING_PHOTO' && nextExternal !== 'PENDING_PHOTO')
                    : false;
            }

            // Actualización online/offline
            const localUpdate: Partial<Report> = {
                ...updatePayload,
                ...(arePhotosPendingFlag !== undefined ? { arePhotosPending: arePhotosPendingFlag } : {}),
            };

            if (isOnline) {
                await withTimeout(
                    updateMaintenanceReport(reportId, updatePayload),
                    REQUEST_TIMEOUT_MS,
                    'actualizar foto'
                );
                await updateLocalReport(reportId, localUpdate); // Mantener cache local coherente para modo offline
                showAppNotification('Foto actualizada correctamente.', 'success');
            } else {
                await updateLocalReport(reportId, localUpdate);
                showAppNotification('Foto guardada localmente (sin conexión).', 'info');
            }

            // Actualizar UI del reporte abierto
            const report = State.reports.find(r => r.id === reportId);
            if (report) {
                if (photoType === 'internal') report.photo_internal_unit_url = dataUrl;
                else report.photo_external_unit_url = dataUrl;
                if (arePhotosPendingFlag !== undefined) {
                    report.arePhotosPending = arePhotosPendingFlag;
                }
            }

            // Refrescar vista del modal (si sigue abierto)
            openViewReportDetailsModal(reportId);
            renderMyReportsTable();

            // Limpiar contexto
            State.setContextForPhotoUpdate(null);
        } catch (err) {
            console.error('Error al actualizar foto del reporte:', err);
            showAppNotification('Error al guardar la foto en el reporte.', 'error');
        }
    } else {
        // 🔹 Si es un reporte nuevo (modo formulario)
        applyCapturedPhoto(dataUrl, captureType);
    }
}



// Reutilizable: aplica la foto capturada a UI y estado
function applyCapturedPhoto(dataUrl: string, type: 'internal' | 'external') {
    if (type === 'internal') {
        State.setCurrentReportPhotoInternalBase64(dataUrl);
        D.photoInternalUnitPreview.src = dataUrl;
        setPhotoPreviewStyles(D.photoInternalUnitPreview);
        D.photoInternalUnitPlaceholder.style.display = 'none';
    } else {
        State.setCurrentReportPhotoExternalBase64(dataUrl);
        D.photoExternalUnitPreview.src = dataUrl;
        setPhotoPreviewStyles(D.photoExternalUnitPreview);
        D.photoExternalUnitPlaceholder.style.display = 'none';
    }

    updateSaveReportButtonState();
}





// --- View Report Details Modal ---
export async function openViewReportDetailsModal(reportId: string) {
    let report = State.reports.find(r => r.id === reportId);
    if (!report || !D.viewReportDetailsModal) return;

    // Lazy load de campos pesados si faltan
    if (report.clientSignature === undefined) {
        showLoader('Cargando fotos y firma...');
        try {
            const api = await import('./api');
            const details = await api.fetchReportDetails(reportId);
            report.clientSignature = details.client_signature;
            report.photo_internal_unit_url = details.photo_internal_unit_url;
            report.photo_external_unit_url = details.photo_external_unit_url;
        } catch (e) {
            console.error('Error cargando detalles', e);
        } finally {
            hideLoader();
        }
    }

    let idValue = report.id;
    const ordersForPdf = State.currentUser?.role === 'admin' ? State.allServiceOrders : State.assignedOrders;
    if (report.orderId) {
        const linkedOrder = ordersForPdf.find(o => o.id === report.orderId);
        if (linkedOrder && linkedOrder.manualId) {
            idValue = linkedOrder.manualId;
        }
    }

    D.viewReportIdDisplay.textContent = `ID: ${idValue}`;

    // Clear previous content
    D.viewReportDetailsContent.innerHTML = '';

    const details = [
        { label: 'Fecha', value: formatDate(report.timestamp) },
        { label: 'Técnico', value: report.workerName },
        { label: 'Tipo de Servicio', value: report.serviceType },
    ];

    if (report.equipmentSnapshot.category === 'residencial') {
        details.push({ label: 'Cliente', value: report.equipmentSnapshot.client_name || 'N/A' });
        details.push({ label: 'Dirección', value: report.equipmentSnapshot.address || 'N/A' });
    } else {
        details.push({ label: 'Empresa', value: report.equipmentSnapshot.companyName || 'N/A' });
        details.push({ label: 'Sede', value: report.equipmentSnapshot.sedeName || 'N/A' });
        details.push({ label: 'Dependencia', value: report.equipmentSnapshot.dependencyName || 'N/A' });
    }
    const city = State.cities.find(c => c.id === report.cityId)?.name;
    details.push({ label: 'Ciudad', value: city || 'N/A' });

    if (report.serviceType !== 'Montaje/Instalación') {
        details.push(...[
            { label: 'Equipo ID', value: report.equipmentSnapshot.manualId || 'N/A' },
            { label: 'Marca', value: report.equipmentSnapshot.brand },
            { label: 'Modelo', value: report.equipmentSnapshot.model },
            { label: 'Tipo', value: report.equipmentSnapshot.type },
            { label: 'Capacidad', value: report.equipmentSnapshot.capacity || 'N/A' },
            { label: 'Refrigerante', value: report.equipmentSnapshot.refrigerant || 'N/A' },
            { label: 'Presión (PSI)', value: report.pressure || 'N/A' },
            { label: 'Amperaje (A)', value: report.amperage || 'N/A' },
        ]);
    }

    details.forEach(d => {
        const detailEl = document.createElement('div');
        detailEl.className = 'detail-item';
        detailEl.innerHTML = `<strong>${d.label}:</strong> <span>${d.value}</span>`;
        D.viewReportDetailsContent.appendChild(detailEl);
    });

    const obsEl = document.createElement('div');
    obsEl.style.gridColumn = '1 / -1';
    obsEl.innerHTML = `<strong>Observaciones:</strong> <span>${report.observations || 'Sin observaciones.'}</span>`;
    D.viewReportDetailsContent.appendChild(obsEl);

    if (report.serviceType === 'Montaje/Instalación' && report.itemsSnapshot && report.itemsSnapshot.length > 0) {
        const itemsEl = document.createElement('div');
        itemsEl.style.gridColumn = '1 / -1';
        itemsEl.innerHTML = `<strong>Items Utilizados:</strong>`;
        const list = document.createElement('ul');
        list.style.paddingLeft = '20px';
        list.style.marginTop = '5px';
        report.itemsSnapshot.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.quantity} x ${item.description}`;
            list.appendChild(li);
        });
        itemsEl.appendChild(list);
        D.viewReportDetailsContent.appendChild(itemsEl);
    }

    // Add signature image if available
    const sigContainer = document.createElement('div');
    if (report.clientSignature && report.clientSignature !== "PENDING_SIGNATURE") {
        sigContainer.innerHTML = `
            <strong>Firma del Cliente:</strong>
            <img src="${report.clientSignature}" alt="Firma" id="view-report-signature-image" />
        `;
    } else {
        sigContainer.innerHTML = `<strong>Firma del Cliente:</strong> <span style="color: var(--color-warning); font-weight: bold;">Firma Pendiente</span>`;
    }
    D.viewReportDetailsContent.appendChild(sigContainer);


    // Add installation photos
    if (report.serviceType === 'Montaje/Instalación') {
        const photoContainer = document.createElement('div');
        photoContainer.style.gridColumn = '1 / -1';
        photoContainer.innerHTML = `<strong>Fotos de Instalación:</strong>`;
        const photoFlex = document.createElement('div');
        photoFlex.style.display = 'flex';
        photoFlex.style.gap = '15px';
        photoFlex.style.marginTop = '5px';
        photoFlex.style.alignItems = 'flex-start';

        const createPhotoHTML = (
            photoUrl: string | null,
            label: string,
            photoType: 'internal' | 'external'
        ): string => {
            let contentHTML = '';
            const canEdit = State.currentUser?.role === 'admin' || (State.currentUser?.role === 'worker' && report.workerId === State.currentUser.id);

            if (photoUrl && photoUrl !== 'PENDING_PHOTO') {
                contentHTML = `
                    <img src="${photoUrl}" class="photo-preview" onclick="this.closest('.modal').querySelector('.modal-content').scrollTop = 0; document.getElementById('image-preview-content').src='${photoUrl}'; document.getElementById('image-preview-modal').style.display='flex';" />
                `;
            } else {
                contentHTML = `<div class="photo-placeholder" style="width: 150px; height: 150px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border: 2px dashed var(--color-border-medium); border-radius: var(--border-radius-sharp); background-color: var(--color-bg-light);">
                    <i class="fas fa-camera-slash fa-2x" style="color: var(--color-warning);"></i>
                    <span style="font-size: 0.8rem; color: var(--color-text-secondary); margin-top: 10px;">Foto Pendiente</span>
                </div>`;
            }

            const buttonText = (photoUrl && photoUrl !== 'PENDING_PHOTO') ? 'Editar Foto' : 'Agregar Foto';
            const buttonClass = (photoUrl && photoUrl !== 'PENDING_PHOTO') ? 'btn-secondary' : 'btn-warning';

            let editButtonHTML = '';
            if (canEdit) {
                editButtonHTML = `<button class="btn btn-compact ${buttonClass}" data-action="edit-photo" data-report-id="${report.id}" data-photo-type="${photoType}" style="margin-top: 8px; width: 100%;">${buttonText}</button>`;
            }

            return `
                <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                    <span style="font-size: 0.9rem; font-weight: 500; color: var(--color-text-primary); margin-bottom: 5px;">${label}</span>
                    ${contentHTML}
                    ${editButtonHTML}
                </div>`;
        };

        photoFlex.innerHTML += createPhotoHTML(report.photo_internal_unit_url, 'U. Interna', 'internal');
        photoFlex.innerHTML += createPhotoHTML(report.photo_external_unit_url, 'U. Externa', 'external');

        photoContainer.appendChild(photoFlex);
        D.viewReportDetailsContent.appendChild(photoContainer);
    }


    D.downloadReportPdfButton.onclick = async () => {
        showLoader('Generando PDF...');
        try {
            const isNative = Capacitor.isNativePlatform();
            const { generateReportPDF } = await import('./lib/pdf-generator');
            const pdfOutput = await generateReportPDF(
                report,
                State.cities,
                State.companies,
                State.dependencies,
                formatDate,
                State.allServiceOrders,
                isNative ? 'open' : 'blob'
            );

            if (isNative && typeof pdfOutput === 'string') {
                try {
                    await FileOpener.open(pdfOutput, 'application/pdf');
                    showAppNotification('Reporte abierto en el visor del sistema.', 'success');
                } catch (openError) {
                    console.error('Error al abrir el PDF con FileOpener', openError);
                    showAppNotification('No se pudo abrir el PDF con el visor del sistema.', 'error');
                }
            } else if (!isNative && pdfOutput instanceof Blob) {
                const url = URL.createObjectURL(pdfOutput);
                const a = document.createElement('a');
                a.href = url;

                const clientName = report.equipmentSnapshot.category === 'residencial'
                    ? report.equipmentSnapshot.client_name
                    : report.equipmentSnapshot.companyName;
                const filenameId = report.orderId ? report.orderId : report.id.substring(0, 8);

                a.download = `Reporte_${clientName?.replace(/\s/g, '_') || 'General'}_${filenameId}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 100);

                showAppNotification('Descarga de PDF iniciada correctamente.', 'success');
            } else {
                throw new Error('La generación del PDF no devolvió un formato válido.');
            }
        } catch (e: any) {
            console.error("Fallo en la generación o visualización del PDF", e);
            showAppNotification('Error al generar o mostrar el PDF.', 'error');
        } finally {
            hideLoader();
        }

    };



    const canEditSignature = State.currentUser?.role === 'worker' && report.workerId === State.currentUser.id;
    D.editSignatureFromViewButton.style.display = canEditSignature ? 'inline-flex' : 'none';

    if (canEditSignature) {
        const isUnsigned = !report.clientSignature || report.clientSignature === "PENDING_SIGNATURE";
        D.editSignatureFromViewButton.innerHTML = `<i class="fas fa-signature"></i> ${isUnsigned ? 'Agregar Firma' : 'Editar Firma'}`;
        if (isUnsigned) {
            D.editSignatureFromViewButton.classList.add('btn-warning');
            D.editSignatureFromViewButton.classList.remove('btn-primary');
        } else {
            D.editSignatureFromViewButton.classList.remove('btn-warning');
            D.editSignatureFromViewButton.classList.add('btn-primary');
        }
        D.editSignatureFromViewButton.onclick = () => {
            D.viewReportDetailsModal.style.display = 'none';
            openSignatureModal(report.id);
        };
    } else {
        D.editSignatureFromViewButton.onclick = null;
    }

    const canEditLocation = (State.currentUser?.role === 'admin' || (State.currentUser?.role === 'worker' && report.workerId === State.currentUser.id));
    D.editReportLocationButton.style.display = canEditLocation ? 'inline-flex' : 'none';

    if (canEditLocation) {
        D.editReportLocationButton.onclick = () => {
            D.viewReportDetailsModal.style.display = 'none';
            openEditReportAssignmentModal(report.id);
        };
    } else {
        D.editReportLocationButton.onclick = null;
    }


    D.viewReportDetailsModal.style.display = 'flex';
    resetModalScroll(D.viewReportDetailsModal);
}

// --- Edit Report Assignment Modal (Unified) ---

export function toggleAssignmentFields() {
    const isEmpresa = D.editCategoryEmpresaRadio.checked;

    D.editAssignmentEmpresaFields.style.display = isEmpresa ? 'block' : 'none';
    D.editAssignmentResidencialFields.style.display = isEmpresa ? 'none' : 'block';

    // Toggle required attributes for validation
    D.editReportCompanySelect.required = isEmpresa;
    D.editReportDependencySelect.required = isEmpresa;

    D.editReportClientNameInput.required = !isEmpresa;
    D.editReportClientAddressInput.required = !isEmpresa;
    D.editReportClientCitySelect.required = !isEmpresa;

    if (isEmpresa) {
        handleAssignmentCompanyChange();
    } else {
        D.editReportDependencyWarning.style.display = 'none';
    }
}

export function handleAssignmentCompanyChange() {
    State.editLocationState.newDependencyNameToCreate = null;
    D.editReportDependencyWarning.style.display = 'none';
    D.saveEditReportAssignmentButton.disabled = false;

    D.editReportCitySelect.innerHTML = '<option value="">Primero seleccione una empresa</option>';
    D.editReportCitySelect.disabled = true;
    D.editReportSedeSelect.innerHTML = '<option value="">Primero seleccione una ciudad</option>';
    D.editReportSedeSelect.disabled = true;
    D.editReportDependencySelect.innerHTML = '';
    D.editReportDependencySelect.disabled = true;
    D.editReportDependencySelect.required = true;

    const newCompanyId = D.editReportCompanySelect.value;
    if (!newCompanyId) return;

    const sedesForCompany = State.sedes.filter(s => s.clientId === newCompanyId);
    const uniqueCityIds = Array.from(new Set(sedesForCompany.map(s => s.cityId).filter(Boolean)));
    const availableCities = State.cities.filter(c => uniqueCityIds.includes(c.id));

    if (availableCities.length > 0) {
        populateDropdown(D.editReportCitySelect, availableCities, undefined, 'Seleccione...');
        D.editReportCitySelect.disabled = false;

        if (availableCities.length === 1) {
            D.editReportCitySelect.value = availableCities[0].id;
            handleAssignmentCityChange();
        }
    } else {
        D.editReportCitySelect.innerHTML = '<option value="">Sin ciudades registradas</option>';
    }
}

export function handleAssignmentCityChange() {
    State.editLocationState.newDependencyNameToCreate = null;
    D.editReportDependencyWarning.style.display = 'none';
    D.saveEditReportAssignmentButton.disabled = false;

    D.editReportSedeSelect.innerHTML = '<option value="">Primero seleccione una ciudad</option>';
    D.editReportSedeSelect.disabled = true;
    D.editReportDependencySelect.innerHTML = '';
    D.editReportDependencySelect.disabled = true;

    const selectedCompanyId = D.editReportCompanySelect.value;
    const selectedCityId = D.editReportCitySelect.value;

    if (!selectedCompanyId || !selectedCityId) return;

    const availableSedes = State.sedes.filter(s =>
        s.clientId === selectedCompanyId &&
        s.cityId === selectedCityId
    );

    if (availableSedes.length > 0) {
        populateDropdown(D.editReportSedeSelect, availableSedes, undefined, 'Seleccione...', false);
        D.editReportSedeSelect.disabled = false;

        if (availableSedes.length === 1) {
            D.editReportSedeSelect.value = availableSedes[0].id;
            handleAssignmentSedeChange();
        }
    } else {
        D.editReportSedeSelect.innerHTML = '<option value="">Sin sedes registradas</option>';
    }
}

export function handleAssignmentSedeChange() {
    State.editLocationState.newDependencyNameToCreate = null;
    D.editReportDependencyWarning.style.display = 'none';
    D.saveEditReportAssignmentButton.disabled = false;

    D.editReportDependencySelect.innerHTML = '';
    D.editReportDependencySelect.disabled = true;

    const selectedSedeId = D.editReportSedeSelect.value;
    if (!selectedSedeId) return;

    const availableDependencies = State.dependencies.filter(d => d.companyId === selectedSedeId);

    if (availableDependencies.length > 0) {
        populateDropdown(D.editReportDependencySelect, availableDependencies, undefined, 'Seleccione...', false);
        D.editReportDependencySelect.disabled = false;
    } else {
        D.editReportDependencySelect.innerHTML = '<option value="">Sin dependencias (Debe crear una)</option>';
    }

    const originalReport = State.editLocationState.originalReport;
    if (!originalReport) return;

    const originalDependencyName = originalReport.equipmentSnapshot.dependencyName;
    if (originalDependencyName) {
        const existingDependency = availableDependencies.find(d => d.name.trim().toLowerCase() === originalDependencyName.trim().toLowerCase());
        if (existingDependency) {
            D.editReportDependencySelect.value = existingDependency.id;
        } else {
            State.editLocationState.newDependencyNameToCreate = originalDependencyName;
            D.editReportDependencyWarning.innerHTML = `La dependencia "<b>${originalDependencyName}</b>" no existe para esta sede. Se creará una nueva al guardar.<br>Si no desea crearla, seleccione una dependencia existente.`;
            D.editReportDependencyWarning.style.display = 'block';
            D.editReportDependencySelect.required = false;
        }
    }
}

export function openEditReportAssignmentModal(reportId: string) {
    const report = State.reports.find(r => r.id === reportId);
    if (!report || !D.editReportAssignmentModal) return;

    State.setEditLocationState({
        originalReport: report,
        newDependencyNameToCreate: null
    });

    D.editReportAssignmentForm.reset();
    D.editReportAssignmentReportId.value = reportId;

    let actualClientId = report.clientId;
    let actualSedeId = report.companyId; // companyId is the legacy ID for maintenance_companies (Sedes)
    let actualCityId = report.cityId;

    if (!actualClientId && actualSedeId) {
        const sede = State.sedes.find(s => s.id === actualSedeId);
        if (sede) actualClientId = sede.clientId;
    }

    populateDropdown(D.editReportCompanySelect, State.companies, actualClientId || undefined);

    if (actualClientId) {
        handleAssignmentCompanyChange();
        if (actualCityId) {
            D.editReportCitySelect.value = actualCityId;
            handleAssignmentCityChange();
            if (actualSedeId) {
                D.editReportSedeSelect.value = actualSedeId;
                handleAssignmentSedeChange();
                if (report.dependencyId) {
                    D.editReportDependencySelect.value = report.dependencyId;
                }
            }
        }
    }

    D.editReportClientNameInput.value = report.equipmentSnapshot.client_name || '';
    D.editReportClientAddressInput.value = report.equipmentSnapshot.address || '';
    populateDropdown(D.editReportClientCitySelect, State.cities, report.cityId);

    const currentCategory = report.equipmentSnapshot.category || 'empresa';
    if (currentCategory === 'residencial') {
        D.editCategoryResidencialRadio.checked = true;
    } else {
        D.editCategoryEmpresaRadio.checked = true;
    }

    toggleAssignmentFields();

    D.editReportAssignmentModal.style.display = 'flex';
    resetModalScroll(D.editReportAssignmentModal);
}

export function closeEditReportAssignmentModal() {
    if (D.editReportAssignmentModal) {
        D.editReportAssignmentModal.style.display = 'none';
    }
    State.setEditLocationState({
        originalReport: null,
        newDependencyNameToCreate: null
    });
}


// --- Pagination ---
function renderPagination<T>(
    tableKey: MaintenanceTableKey,
    container: HTMLElement,
    paginatedItems: T[],
    totalItems: number,
    renderFn: () => void
) {
    if (!container) return;
    const paginationState = State.tablePaginationStates[tableKey];
    const totalPages = Math.ceil(totalItems / paginationState.itemsPerPage);
    container.innerHTML = '';

    if (totalItems <= paginationState.itemsPerPage && totalPages <= 1) return; // Hide if not needed

    const wrapper = document.createElement('div');
    wrapper.className = 'pagination-controls';

    // Page navigation buttons
    const nav = document.createElement('div');
    nav.className = 'page-navigation';

    const createButton = (content: string, page: number, isDisabled = false, isIcon = false) => {
        const button = document.createElement('button');
        button.innerHTML = content;
        button.className = `btn btn-secondary btn-pagination ${isIcon ? 'btn-icon-only' : ''}`;
        button.disabled = isDisabled;
        button.addEventListener('click', () => {
            paginationState.currentPage = page;
            renderFn();
        });
        return button;
    };

    nav.appendChild(createButton('<i class="fas fa-angle-double-left"></i>', 1, paginationState.currentPage === 1, true));
    nav.appendChild(createButton('<i class="fas fa-angle-left"></i>', paginationState.currentPage - 1, paginationState.currentPage === 1, true));

    // Page info
    const pageInfo = document.createElement('span');
    pageInfo.className = 'page-info';
    pageInfo.textContent = `Página ${paginationState.currentPage} de ${totalPages}`;
    nav.appendChild(pageInfo);

    nav.appendChild(createButton('<i class="fas fa-angle-right"></i>', paginationState.currentPage + 1, paginationState.currentPage === totalPages, true));
    nav.appendChild(createButton('<i class="fas fa-angle-double-right"></i>', totalPages, paginationState.currentPage === totalPages, true));

    // Items per page selector
    const itemsPerPageSelector = document.createElement('div');
    itemsPerPageSelector.className = 'items-per-page-selector';
    const itemsPerPageOptions = tableKey === 'adminOrders' ? [6, 12, 18, 24] : [10, 25, 50, 100];
    let selectHTML = `<label for="items-per-page-${tableKey}">Por Pág:</label><select id="items-per-page-${tableKey}">`;
    itemsPerPageOptions.forEach(num => {
        selectHTML += `<option value="${num}" ${paginationState.itemsPerPage === num ? 'selected' : ''}>${num}</option>`;
    });
    selectHTML += '</select>';
    itemsPerPageSelector.innerHTML = selectHTML;

    itemsPerPageSelector.querySelector('select')?.addEventListener('change', (e) => {
        paginationState.itemsPerPage = Number((e.target as HTMLSelectElement).value);
        paginationState.currentPage = 1; // Reset to first page
        renderFn();
    });

    wrapper.appendChild(itemsPerPageSelector);
    wrapper.appendChild(nav);
    container.appendChild(wrapper);
}



// --- Table Rendering ---

function getPaginatedData<T>(tableKey: MaintenanceTableKey, data: T[]): T[] {
    const paginationState = State.tablePaginationStates[tableKey];
    const totalPages = Math.max(1, Math.ceil(data.length / paginationState.itemsPerPage));
    paginationState.currentPage = Math.min(Math.max(paginationState.currentPage, 1), totalPages);
    const { currentPage, itemsPerPage } = paginationState;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
}

// Derive pending flags defensively to handle cached/local data without flags
function getPendingStatus(report: Report) {
    const hasSignature = !!report.clientSignature && report.clientSignature !== 'PENDING_SIGNATURE';
    const requiresPhotos = report.serviceType === 'Montaje/Instalación';
    const hasInternalPhoto = !!report.photo_internal_unit_url && report.photo_internal_unit_url !== 'PENDING_PHOTO';
    const hasExternalPhoto = !!report.photo_external_unit_url && report.photo_external_unit_url !== 'PENDING_PHOTO';

    const signaturePending = report.isSignaturePending !== undefined ? report.isSignaturePending : !hasSignature;
    const photosPending = report.arePhotosPending !== undefined
        ? report.arePhotosPending
        : (requiresPhotos ? !(hasInternalPhoto && hasExternalPhoto) : false);

    return {
        signaturePending,
        photosPending,
        isPending: signaturePending || photosPending,
    };
}

export async function renderMyReportsTable() {
    if (!D.myReportsTableBody || !State.currentUser) return;

    // Get reports from the sync queue to identify them
    const queuedReports = await getAllFromStore('reports_queue');
    const queuedReportIds = new Set(queuedReports.map(r => r.id));


    const searchTerm = State.tableSearchTerms.myReports.toLowerCase();

    // 1. Filter reports for the current user
    let userReports = State.reports.filter(r => r.workerId === State.currentUser?.id);

    // 2. Filter by date if 'showAllMyReports' is false
    if (!State.showAllMyReports) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 4);
        cutoff.setHours(0, 0, 0, 0);
        userReports = userReports.filter(report => new Date(report.timestamp) >= cutoff);
    }

    // 3. Filter by search term
    const filteredReports = userReports.filter(report => {
        const clientName = report.equipmentSnapshot.category === 'residencial'
            ? report.equipmentSnapshot.client_name
            : report.equipmentSnapshot.companyName;

        const searchString = [
            report.id,
            clientName,
            report.serviceType,
            report.equipmentSnapshot.model,
            report.equipmentSnapshot.brand,
            report.observations,
            formatDate(report.timestamp),
        ].join(' ').toLowerCase();

        return searchString.includes(searchTerm);
    });

    // 4. Sort: pending reports first, then by date descending (usando banderas)
    filteredReports.sort((a, b) => {
        const aStatus = getPendingStatus(a);
        const bStatus = getPendingStatus(b);
        if (aStatus.isPending && !bStatus.isPending) return -1;
        if (!aStatus.isPending && bStatus.isPending) return 1;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });


    const paginatedReports = getPaginatedData('myReports', filteredReports);

    D.myReportsTableBody.innerHTML = paginatedReports.map(report => {
        const clientName = report.equipmentSnapshot.category === 'residencial'
            ? (report.equipmentSnapshot.client_name || 'N/A')
            : (report.equipmentSnapshot.companyName || 'N/A');
        const equipmentName = `${report.equipmentSnapshot.brand || ''} ${report.equipmentSnapshot.model || ''}`.trim() || 'N/A - Instalación';
        const isQueued = queuedReportIds.has(report.id);
        const { signaturePending, photosPending, isPending } = getPendingStatus(report);
        const rowClass = isPending ? 'report-unsigned' : '';
        let pendingIndicators = '';
        if (isQueued) {
            pendingIndicators += '<i class="fas fa-cloud-upload-alt" style="color: var(--color-warning);" title="Pendiente de Sincronización"></i> ';
        }
        if (signaturePending) {
            pendingIndicators += '<i class="fas fa-exclamation-triangle" style="color: var(--color-danger);" title="Firma Pendiente"></i> ';
        }
        if (photosPending) {
            pendingIndicators += '<i class="fas fa-camera-slash" style="color: var(--color-warning);" title="Fotos Pendientes"></i> ';
        }
        const signatureButtonClass = signaturePending ? 'btn-warning' : 'btn-accent';
        const signatureButtonText = signaturePending ? 'Agregar Firma' : 'Gestionar Firma';


        return `
            <tr class="clickable-row ${rowClass}" data-report-id="${report.id}">
                <td data-label="Fecha">${pendingIndicators}${formatDate(report.timestamp)}</td>
                <td data-label="ID Reporte" style="display: none;">${report.id.substring(0, 8)}...</td>
                <td data-label="Tipo Servicio">${report.serviceType}</td>
                <td data-label="Equipo">${equipmentName}</td>
                <td data-label="Empresa/Cliente">${clientName}</td>
                <td data-label="Dependencia">${report.equipmentSnapshot.dependencyName || 'N/A'}</td>
                <td data-label="Acciones">
                    <button class="action-btn view-report-btn btn-secondary" data-report-id="${report.id}" title="Ver Detalles"><i class="fas fa-eye"></i><span class="btn-label">Ver</span></button>
                    <button class="action-btn edit-signature-btn ${signatureButtonClass}" data-report-id="${report.id}" title="${signatureButtonText}"><i class="fas fa-signature"></i><span class="btn-label">Firma</span></button>
                    ${photosPending ? `<button class="action-btn add-photos-btn btn-warning" data-report-id="${report.id}" title="Agregar fotos pendientes"><i class="fas fa-camera"></i><span class="btn-label">Agregar Fotos</span></button>` : ''}
                </td>
            </tr>
        `;
    }).join('');

    // Event delegation for clickable rows
    D.myReportsTableBody.querySelectorAll<HTMLTableRowElement>('tr[data-report-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            // Clicks on buttons inside the row are handled by the global event listener, so we ignore them here.
            if ((e.target as HTMLElement).closest('button')) {
                return;
            }
            const reportId = row.dataset.reportId;
            if (reportId) {
                openViewReportDetailsModal(reportId);
            }
        });
    });

    if (paginatedReports.length === 0) {
        D.myReportsTableBody.innerHTML = `<tr><td colspan="6" class="empty-state-td" style="border: none; padding: 50px 10px;"><div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 15px;"><i class="fas fa-file-invoice" style="font-size: 3rem; color: rgba(0, 223, 255, 0.2);"></i> <span class="text-muted" style="font-size: 0.95rem;">No se encontraron reportes que coincidan con su búsqueda.</span></div></td></tr>`;
    }

    renderPagination('myReports', D.myReportsPaginationContainer, paginatedReports, filteredReports.length, renderMyReportsTable);
}


// --- Admin Filter Population ---
export function populateAdminFilterDropdowns() {
    populateDropdown(D.filterReportCity, State.cities, undefined, 'Todas');
    populateDropdown(D.filterReportCompany, State.companies, undefined, 'Todas');
    // FIX: Map worker users to ensure the object passed to populateDropdown has a non-optional `name` property, falling back to username.
    populateDropdown(D.filterReportTechnician, State.users.filter(u => u.role === 'worker').map(u => ({ id: u.id, name: u.name || u.username })), undefined, 'Todos');

    const serviceTypes = [...new Set(State.reports.map(r => r.serviceType))];
    populateStringDropdown(D.filterReportServiceType, serviceTypes);
}

export function populateAdminOrderFilterDropdowns() {
    // FIX: Map worker users to ensure the object passed to populateDropdown has a non-optional `name` property, falling back to username.
    populateDropdown(D.filterOrderTechnician, State.users.filter(u => u.role === 'worker').map(u => ({ id: u.id, name: u.name || u.username })), undefined, 'Todos');
    const serviceOrderTypes = [...new Set(State.allServiceOrders.map(o => o.order_type).filter(Boolean) as string[])];
    populateStringDropdown(D.filterOrderType, serviceOrderTypes);
}


// --- Admin Reports Table ---
// FIX: Refactored report filtering logic into a reusable helper function.
function getFilteredAdminReports(): Report[] {
    // Get filter values
    const searchTerm = normalizeSearchText(State.tableSearchTerms.adminReports);
    const startDate = D.filterReportDateStart.value;
    const endDate = D.filterReportDateEnd.value;
    const cityId = D.filterReportCity.value;
    const companyId = D.filterReportCompany.value;
    const serviceType = D.filterReportServiceType.value;
    const technicianId = D.filterReportTechnician.value;
    const category = D.filterReportCategory.value;
    const paidStatus = D.filterReportPaid.value;

    const filteredReports = State.reports.filter(report => {
        // Date filtering
        const reportDate = report.timestamp.substring(0, 10);
        if (startDate && reportDate < startDate) return false;
        if (endDate && reportDate > endDate) return false;

        // Dropdown filters
        if (cityId && report.cityId !== cityId) return false;
        if (companyId && report.companyId !== companyId) return false;
        if (serviceType && report.serviceType !== serviceType) return false;
        if (technicianId && report.workerId !== technicianId) return false;
        if (category && report.equipmentSnapshot.category !== category) return false;

        // Updated paidStatus logic to handle "PENDING_SIGNATURE" as well
        const isPaid = report.is_paid;
        if (paidStatus === 'true' && !isPaid) return false;
        if (paidStatus === 'false' && isPaid) return false;


        // Search term filter
        const clientName = report.equipmentSnapshot.category === 'residencial'
            ? report.equipmentSnapshot.client_name
            : report.equipmentSnapshot.companyName;

        const city = State.cities.find(c => c.id === report.cityId)?.name;

        const searchString = normalizeSearchText([
            report.id,
            report.orderId,
            clientName,
            report.equipmentSnapshot.companyName,
            report.equipmentSnapshot.dependencyName,
            report.equipmentSnapshot.address,
            report.equipmentSnapshot.manualId,
            report.workerName,
            report.serviceType,
            report.equipmentSnapshot.model,
            report.equipmentSnapshot.brand,
            report.equipmentSnapshot.type,
            report.observations,
            city,
            formatDate(report.timestamp),
        ].join(' '));

        return searchString.includes(searchTerm);
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return filteredReports;
}

export function renderAdminReportsTable() {
    if (!D.adminReportsTableBody) return;

    const filteredReports = getFilteredAdminReports();
    const paginatedReports = getPaginatedData('adminReports', filteredReports);
    D.adminReportsTableBody.innerHTML = paginatedReports.map(report => {
        const clientNameFull = report.equipmentSnapshot.category === 'residencial'
            ? (report.equipmentSnapshot.client_name || 'N/A')
            : (report.equipmentSnapshot.companyName || 'N/A');
        const clientNameTruncated = clientNameFull.length > 30 ? clientNameFull.substring(0, 30) + '...' : clientNameFull;

        const city = State.cities.find(c => c.id === report.cityId)?.name || 'N/A';

        const dependencyNameFull = report.equipmentSnapshot.dependencyName || 'N/A';
        const dependencyNameTruncated = dependencyNameFull.length > 30 ? dependencyNameFull.substring(0, 30) + '...' : dependencyNameFull;

        const { isPending } = getPendingStatus(report);
        const paidStatusClass = report.is_paid ? 'paid' : 'unpaid';
        const paidStatusText = report.is_paid ? 'Pagado' : 'No Pagado';
        const togglePaidButtonClass = report.is_paid ? 'btn-success' : 'btn-warning';
        const togglePaidButtonTitle = report.is_paid ? 'Marcar como No Pagado' : 'Marcar como Pagado';
        const rowClass = isPending ? 'report-unsigned' : '';
        return `
            <tr class="${rowClass}">
                <td data-label="Fecha">${formatDate(report.timestamp)}</td>
                <td data-label="Técnico">${report.workerName}</td>
                <td data-label="Tipo">${report.serviceType}</td>
                <td data-label="Equipo">${report.equipmentSnapshot.brand} ${report.equipmentSnapshot.model}</td>
                <td data-label="Empresa/Cliente" title="${clientNameFull}">${clientNameTruncated}</td>
                <td data-label="Dependencia" title="${dependencyNameFull}">${dependencyNameTruncated}</td>
                <td data-label="Ciudad">${city}</td>
                <td data-label="Pagado"><span class="status-badge ${paidStatusClass}">${paidStatusText}</span></td>
                <td data-label="Acciones">
                    <button class="action-btn view-report-btn" data-report-id="${report.id}" title="Ver Detalles"><i class="fas fa-eye"></i></button>
                    <button class="action-btn toggle-paid-status-btn ${togglePaidButtonClass}" data-report-id="${report.id}" data-current-status="${String(report.is_paid)}" title="${togglePaidButtonTitle}"><i class="fas fa-dollar-sign"></i></button>
                    <button class="action-btn delete-report-btn" data-report-id="${report.id}" title="Eliminar Reporte"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    if (paginatedReports.length === 0) {
        D.adminReportsTableBody.innerHTML = '<tr><td colspan="9">No se encontraron reportes con los filtros actuales.</td></tr>';
    }

    renderPagination('adminReports', D.adminReportsPaginationContainer, paginatedReports, filteredReports.length, renderAdminReportsTable);
}

// FIX: Add missing function to handle downloading filtered reports as a ZIP file.
export async function handleDownloadReportsZip() {
    showLoader('Preparando reportes para descargar...');
    try {
        const reportsToDownload = getFilteredAdminReports();
        if (reportsToDownload.length === 0) {
            showAppNotification('No hay reportes en la vista actual para descargar.', 'info');
            return;
        }

        const JSZipModule = await import('jszip');
        const JSZip = JSZipModule.default || JSZipModule;
        const zip = new JSZip();

        showLoader(`Generando ${reportsToDownload.length} PDFs...`);

        const { generateReportPDF } = await import('./lib/pdf-generator');

        // Generate PDFs in parallel
        const pdfPromises = reportsToDownload.map(report =>
            generateReportPDF(report, State.cities, State.companies, State.dependencies, formatDate, State.allServiceOrders, 'blob')
                .then(blob => {
                    if (blob instanceof Blob) {
                        const clientName = report.equipmentSnapshot.category === 'residencial'
                            ? report.equipmentSnapshot.client_name
                            : report.equipmentSnapshot.companyName;

                        let idValue = report.id;
                        if (report.orderId) {
                            const linkedOrder = State.allServiceOrders.find(o => o.id === report.orderId);
                            if (linkedOrder && linkedOrder.manualId) {
                                idValue = linkedOrder.manualId;
                            }
                        }
                        const filenameId = (report.orderId && idValue !== report.id) ? idValue : report.id.substring(0, 8);
                        const filename = `Reporte_${clientName?.replace(/\s/g, '_') || 'General'}_${filenameId}.pdf`;
                        zip.file(filename, blob);
                    }
                })
        );

        await Promise.all(pdfPromises);

        showLoader('Comprimiendo archivos...');

        const zipBlob = await zip.generateAsync({ type: 'blob' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        const date = new Date().toISOString().slice(0, 10);
        link.download = `Reportes_${date}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        showAppNotification('La descarga del archivo ZIP ha comenzado.', 'success');

    } catch (error: any) {
        console.error('Error generating ZIP file:', error);
        showAppNotification(`Error al crear el archivo ZIP: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

export async function handleDownloadReportsMergedPdf() {
    showLoader('Preparando documento unificado...');
    try {
        const reportsToDownload = getFilteredAdminReports();
        if (reportsToDownload.length === 0) {
            showAppNotification('No hay reportes en la vista actual para descargar.', 'info');
            return;
        }

        showLoader(`Consolidando ${reportsToDownload.length} reportes en un solo PDF...`);

        let mergedDoc: any = null;

        // Sequence rather than parallel to keep PDF page order correct and pass the same doc ref
        for (let i = 0; i < reportsToDownload.length; i++) {
            const report = reportsToDownload[i];

            showLoader(`Uniendo reporte ${i + 1} de ${reportsToDownload.length}...`);

            const { generateReportPDF } = await import('./lib/pdf-generator');
            // For the very first iteration, existingDoc will evaluate falsy so it internally instantiates the jsPDF doc
            mergedDoc = await generateReportPDF(
                report,
                State.cities,
                State.companies,
                State.dependencies,
                formatDate,
                State.allServiceOrders,
                'doc',
                mergedDoc
            );
        }

        if (!mergedDoc) throw new Error('No se pudo inicializar el documento PDF.');

        showLoader('Finalizando documento...');
        const mergedPdfBlob = mergedDoc.output('blob');

        const link = document.createElement('a');
        link.href = URL.createObjectURL(mergedPdfBlob);
        const date = new Date().toISOString().slice(0, 10);
        link.download = `Reportes_Consolidados_${date}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 100);

        showAppNotification('La descarga del PDF consolidado ha comenzado.', 'success');

    } catch (error: any) {
        console.error('Error generating merged PDF file:', error);
        showAppNotification(`Error al crear el archivo PDF: ${error.message}`, 'error');
    } finally {
        hideLoader();
    }
}

// --- Admin Schedule Table ---
export function renderAdminScheduleTable() {
    if (!D.adminScheduleTableBody) return;
    const scheduleItems = calculateSchedule(State.equipmentList, State.reports);
    const paginatedItems = getPaginatedData('adminSchedule', scheduleItems);

    D.adminScheduleTableBody.innerHTML = paginatedItems.map(item => {
        const location = item.equipment.category === 'residencial'
            ? (item.equipment.client_name || 'N/A')
            : (`${State.companies.find(c => c.id === item.equipment.companyId)?.name || ''} / ${State.dependencies.find(d => d.id === item.equipment.dependencyId)?.name || ''}`);

        return `
            <tr>
                <td data-label="Equipo (ID/Modelo)">${item.equipment.manualId || 'S/ID'} - ${item.equipment.model}</td>
                <td data-label="Ubicación">${location}</td>
                <td data-label="Último Mtto.">${formatDate(item.lastMaintenanceDate, false)}</td>
                <td data-label="Próximo Mtto.">${formatDate(item.nextDueDate, false)}</td>
                <td data-label="Estado" class="${item.statusColorClass}">${item.statusText}</td>
                <td data-label="Acciones">
                    <button class="action-btn create-report-from-schedule-btn" data-equipment-id="${item.equipment.id}" title="Generar Reporte de Mtto."><i class="fas fa-file-signature"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    if (paginatedItems.length === 0) {
        D.adminScheduleTableBody.innerHTML = '<tr><td colspan="6">No hay mantenimientos programados.</td></tr>';
    }

    renderPagination('adminSchedule', D.adminSchedulePaginationContainer, paginatedItems, scheduleItems.length, renderAdminScheduleTable);
}

// --- Admin Equipment Table ---
export function renderAdminEquipmentTable() {
    if (!D.adminEquipmentTableBody) return;
    const searchTerm = State.tableSearchTerms.adminEquipment.toLowerCase();

    const filteredEquipment = State.equipmentList.filter(eq => {
        const clientOrCompany = eq.category === 'residencial'
            ? (eq.client_name || '')
            : (State.companies.find(c => c.id === eq.companyId)?.name || '');
        const dependency = eq.dependencyId ? State.dependencies.find(d => d.id === eq.dependencyId)?.name || '' : '';
        const city = eq.cityId ? State.cities.find(c => c.id === eq.cityId)?.name || '' : '';

        const searchString = [
            eq.manualId, eq.brand, eq.model, eq.typeName, clientOrCompany, dependency, city
        ].join(' ').toLowerCase();

        return searchString.includes(searchTerm);
    });

    const paginatedEquipment = getPaginatedData('adminEquipment', filteredEquipment);

    D.adminEquipmentTableBody.innerHTML = paginatedEquipment.map(eq => {
        const location = eq.category === 'residencial'
            ? (State.cities.find(c => c.id === eq.cityId)?.name || 'N/A')
            : (State.companies.find(c => c.id === eq.companyId)?.name || 'N/A');
        const dependencyOrClient = eq.category === 'residencial'
            ? (eq.client_name || 'N/A')
            : (State.dependencies.find(d => d.id === eq.dependencyId)?.name || 'N/A');

        return `
            <tr>
                <td data-label="ID Manual">${eq.manualId || 'N/A'}</td>
                <td data-label="Modelo">${eq.model}</td>
                <td data-label="Marca">${eq.brand}</td>
                <td data-label="Tipo">${eq.typeName}</td>
                <td data-label="Categoría">${eq.category}</td>
                <td data-label="Ubicación">${location}</td>
                <td data-label="Dependencia/Cliente">${dependencyOrClient}</td>
                <td data-label="Periodicidad (Meses)">${eq.periodicityMonths}</td>
                <td data-label="Acciones">
                    <button class="action-btn edit-btn" data-type="equipment" data-id="${eq.id}" title="Editar Equipo"><i class="fas fa-edit"></i></button>
                    <button class="action-btn download-qr-btn" data-equipment-manual-id="${eq.manualId}" data-equipment-model="${eq.model}" title="Descargar QR" ${!eq.manualId ? 'disabled' : ''}><i class="fas fa-qrcode"></i></button>
                    <button class="action-btn delete-btn" data-type="equipment" data-id="${eq.id}" title="Eliminar Equipo"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');

    if (paginatedEquipment.length === 0) {
        D.adminEquipmentTableBody.innerHTML = '<tr><td colspan="9">No se encontraron equipos.</td></tr>';
    }

    renderPagination('adminEquipment', D.adminEquipmentPaginationContainer, paginatedEquipment, filteredEquipment.length, renderAdminEquipmentTable);
}

// --- Admin Management Tables ---
export function renderCitiesTable() {
    if (!D.citiesTableBody) return;
    const cities = State.cities;
    D.citiesTableBody.innerHTML = cities.map(city => `
        <tr>
            <td>${city.name}</td>
            <td class="actions-cell">
                <button class="action-btn edit-btn" data-type="city" data-id="${city.id}"><i class="fas fa-edit"></i> Editar</button>
                <button class="action-btn delete-btn" data-type="city" data-id="${city.id}"><i class="fas fa-trash"></i> Eliminar</button>
            </td>
        </tr>
    `).join('');
}

export function renderCompaniesTable() {
    if (!D.companiesTableBody) return;
    const companies = State.companies;
    D.companiesTableBody.innerHTML = companies.map(c => `
        <tr>
            <td>${c.name}</td>
            <td>${State.cities.find(city => city.id === c.cityId)?.name || 'N/A'}</td>
            <td class="actions-cell">
                <button class="action-btn edit-btn" data-type="company" data-id="${c.id}"><i class="fas fa-edit"></i> Editar</button>
                <button class="action-btn delete-btn" data-type="company" data-id="${c.id}"><i class="fas fa-trash"></i> Eliminar</button>
            </td>
        </tr>
    `).join('');
}

export function renderDependenciesTable() {
    if (!D.dependenciesTableBody) return;
    const dependencies = State.dependencies;
    D.dependenciesTableBody.innerHTML = dependencies.map(d => `
        <tr>
            <td>${d.name}</td>
            <td>${State.companies.find(c => c.id === d.companyId)?.name || 'N/A'}</td>
            <td class="actions-cell">
                <button class="action-btn edit-btn" data-type="dependency" data-id="${d.id}"><i class="fas fa-edit"></i> Editar</button>
                <button class="action-btn delete-btn" data-type="dependency" data-id="${d.id}"><i class="fas fa-trash"></i> Eliminar</button>
            </td>
        </tr>
    `).join('');
}

export function renderEmployeesTable() {
    if (!D.employeesTableBody) return;
    const employees = State.users.filter(u => u.role === 'worker');
    D.employeesTableBody.innerHTML = employees.map(e => {
        // FIX: The `data-current-status` attribute requires a string, but was being passed a boolean (`e.isActive`). This has been corrected by converting the boolean to a string. This addresses error on line 2197.
        return `
        <tr>
            <td data-label="Nombre">${e.name || 'N/A'}</td>
            <td data-label="Cédula (Usuario)">${e.cedula || 'N/A'}</td>
            <td data-label="Estado" class="${e.isActive ? 'status-active' : 'status-inactive'}">${e.isActive ? 'Activo' : 'Inactivo'}</td>
            <td data-label="Puntos">${e.points || 0}</td>
            <td data-label="Acciones">
                <button class="action-btn edit-btn" data-type="employee" data-id="${e.id}" title="Editar Empleado"><i class="fas fa-edit"></i></button>
                <button class="action-btn toggle-employee-status-btn ${e.isActive ? 'active' : 'inactive'}" data-user-id="${e.id}" data-current-status="${String(e.isActive)}" title="${e.isActive ? 'Desactivar' : 'Activar'}">${e.isActive ? '<i class="fas fa-user-slash"></i>' : '<i class="fas fa-user-check"></i>'}</button>
                <button class="action-btn redeem-points-btn btn-success" data-user-id="${e.id}" data-user-name="${e.name || 'N/A'}" data-current-points="${e.points || 0}" title="Redimir Puntos"><i class="fas fa-gift"></i></button>
            </td>
        </tr>
    `;
    }).join('');

    if (employees.length === 0) {
        D.employeesTableBody.innerHTML = '<tr><td colspan="5">No hay empleados registrados.</td></tr>';
    }
}

// FIX: Add missing Redeem Points Modal functions
// --- Redeem Points Modal ---
export function openRedeemPointsModal(userId: string, userName: string, currentPoints: string) {
    if (!D.redeemPointsModal || !D.redeemPointsForm) return;

    D.redeemPointsForm.reset();
    D.redeemPointsUserId.value = userId;
    D.redeemPointsEmployeeName.textContent = userName;
    D.redeemPointsCurrentPoints.textContent = currentPoints;
    D.redeemPointsError.textContent = '';

    D.redeemPointsModal.style.display = 'flex';
    resetModalScroll(D.redeemPointsModal);
}

export function closeRedeemPointsModal() {
    if (D.redeemPointsModal) {
        D.redeemPointsModal.style.display = 'none';
    }
}

export function renderAppSettings() {
    if (!D.appSettingsContainer) return;

    const settingsHTML = `
        <div class="setting-item">
            <span class="setting-description">Mostrar botón 'Usar Cámara QR' al técnico</span>
            <label class="switch">
                <input type="checkbox" data-key="show_qr_camera_button" ${State.appSettings['show_qr_camera_button'] ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
        </div>
        <div class="setting-item">
            <span class="setting-description">Mostrar enlace 'Escanear QR desde un archivo' al técnico</span>
             <label class="switch">
                <input type="checkbox" data-key="show_qr_file_button" ${State.appSettings['show_qr_file_button'] ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
        </div>
        <div class="setting-item">
            <span class="setting-description">Mostrar botón 'Buscar Equipo por ID' al técnico</span>
            <label class="switch">
                <input type="checkbox" data-key="show_search_by_id_button" ${State.appSettings['show_search_by_id_button'] ? 'checked' : ''}>
                <span class="slider round"></span>
            </label>
        </div>
    `;
    D.appSettingsContainer.innerHTML = settingsHTML;
}

// --- Order Rendering ---
function createOrderCardHTML(order: Order): string {
    const statusMap = {
        pending: { text: 'Pendiente', class: 'status-pending' },
        en_progreso: { text: 'En Progreso', class: 'status-en_progreso' },
        completed: { text: 'Completada', class: 'status-completed' },
        cancelada: { text: 'Cancelada', class: 'status-cancelada' },
    };
    const statusInfo = statusMap[order.status || 'pending'] || statusMap.pending;

    let progressHTML = '';
    const isServiceItem = (desc: string) => /mano de obra|montaje|instalaci[oó]n|desmonte|mantenimiento/i.test(desc);

    if (order.items && order.items.length > 0) {
        let totalQuantity = 0;
        let completedQuantity = 0;

        let itemsToCount = order.items;
        if (order.items.some(i => isServiceItem(i.description))) {
            itemsToCount = order.items.filter(i => isServiceItem(i.description));
        }

        for (const item of itemsToCount) {
            totalQuantity += item.quantity || 1;
            completedQuantity += item.completed_quantity || 0;
        }

        // Prevent division by zero and cap at 100%
        let progressPercent = 0;
        if (totalQuantity > 0) {
            progressPercent = Math.min(Math.round((completedQuantity / totalQuantity) * 100), 100);
        }

        progressHTML = `
            <div class="summary-progress" style="margin-top: 10px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 3px;">
                    <span><i class="fas fa-tasks"></i> Progreso</span>
                    <span style="font-weight: bold; color: var(--color-accent-primary);">${completedQuantity} / ${totalQuantity} Equipos</span>
                </div>
                <div style="width: 100%; height: 6px; background-color: var(--color-border-light); border-radius: 3px; overflow: hidden;">
                    <div style="width: ${progressPercent}%; height: 100%; background-color: var(--color-accent-primary); transition: width 0.3s ease;"></div>
                </div>
            </div>
        `;
    }

    let serviceNamesString = order.order_type || 'Servicio General';

    if (order.items && order.items.length > 0) {
        const sItems = order.items.filter(i => isServiceItem(i.description));
        if (sItems.length > 0) {
            // Eliminar duplicados y unir con un separador
            serviceNamesString = [...new Set(sItems.map(i => i.description))].join(' • ');
        }
    }

    let addressValue = order.clientDetails?.address || 'N/A';
    let contactValue = order.clientDetails?.phone || 'N/A';
    let cityValue = order.clientDetails?.city ? ` &bull; ${order.clientDetails.city}` : '';
    let cityText = order.clientDetails?.city ? ` • ${order.clientDetails.city}` : '';
    let clientNameValue = order.clientDetails?.name || 'Desconocido';

    if (order.sede_id) {
        const sede = State.sedes.find(s => s.id === order.sede_id);
        if (sede) {
            addressValue = sede.address || order.clientDetails?.address || 'N/A';
            contactValue = sede.phone || sede.contact_person || order.clientDetails?.phone || 'N/A';
            const cityObj = State.cities.find(c => c.id === sede.cityId);
            if (cityObj) {
                cityValue = ` &bull; ${cityObj.name}`;
                cityText = ` • ${cityObj.name}`;
            } else if (order.clientDetails?.city) {
                cityValue = ` &bull; ${order.clientDetails.city}`;
                cityText = ` • ${order.clientDetails.city}`;
            }
            clientNameValue = `${order.clientDetails?.name || 'Desconocido'} - ${sede.name}`;
        }
    }

    return `
        <details class="accordion-card" data-order-id="${order.id}">
            <summary class="order-card-summary">
                <div class="summary-top">
                    <div class="summary-type">
                        <span class="service-type"><i class="fas fa-tools"></i> ${serviceNamesString}</span>
                    </div>
                    <span class="order-status ${statusInfo.class}">${statusInfo.text}</span>
                </div>
                
                ${progressHTML}
                
                <div class="summary-bottom">
                    <div class="summary-datetime">
                        <span><i class="fas fa-calendar-day"></i> ${formatDate(order.service_date, false)}</span>
                        <span><i class="fas fa-clock"></i> ${formatTime(order.service_time)}</span>
                    </div>
                    <i class="fas fa-chevron-down expand-icon"></i>
                </div>
            </summary>
            
            <div class="details-body">

                <div class="order-card-row">
                    <p class="order-card-label"><i class="fas fa-user-tie"></i> Cliente</p>
                    <p class="order-card-value">${clientNameValue}</p>
                </div>
                <div class="order-card-row">
                    <p class="order-card-label"><i class="fas fa-map-marker-alt"></i> Dirección</p>
                    <div class="order-card-value" style="display: flex; align-items: center; gap: 8px;">
                        <span>${addressValue}${cityValue}</span>
                        <button type="button" class="copy-info-btn" data-copy-text="${addressValue}${cityText}" style="background:none; border:none; color:var(--color-accent-primary); cursor:pointer; padding:5px;"><i class="far fa-copy"></i></button>
                    </div>
                </div>
                <div class="order-card-row">
                    <p class="order-card-label"><i class="fas fa-phone-alt"></i> Contacto</p>
                    <div class="order-card-value" style="display: flex; align-items: center; gap: 8px;">
                        <span>${contactValue}</span>
                        <button type="button" class="copy-info-btn" data-copy-text="${contactValue}" style="background:none; border:none; color:var(--color-accent-primary); cursor:pointer; padding:5px;"><i class="far fa-copy"></i></button>
                    </div>
                </div>
                <div class="order-card-row">
                    <p class="order-card-label"><i class="fas fa-users"></i> Técnicos Asignados</p>
                    <p class="order-card-value">${order.assignedTechnicians && order.assignedTechnicians.length > 0 ? order.assignedTechnicians.map((t: any) => t.name).join(', ') : 'Ninguno'}</p>
                </div>
                <div style="margin-top: 15px;">
                    <button class="btn btn-primary btn-full-width open-order-details-btn" data-order-id="${order.id}">
                        <i class="fas fa-search-plus"></i> Ver Detalles / Atender
                    </button>
                </div>
            </div>
        </details>
    `;
}

export function renderAssignedOrdersList() {
    if (!D.workerOrdersListContainer) return;
    const orders = State.assignedOrders
        .filter(o => o.status !== 'completed' && o.status !== 'cancelada')
        .sort((a, b) => new Date(a.service_date!).getTime() - new Date(b.service_date!).getTime());

    if (orders.length === 0) {
        D.workerOrdersListContainer.innerHTML = `
            <div class="tip-banner" style="margin-top: 20px;">
                <div class="tip-icon-container">
                    <i class="fas fa-folder-open"></i>
                </div>
                <span class="tip-text" style="font-size: 0.9rem;">Aún no hay ordenes asignadas</span>
            </div>
        `;
        return;
    }
    D.workerOrdersListContainer.innerHTML = orders.map(createOrderCardHTML).join('');
}


export function renderAdminOrdersList() {
    if (!D.adminOrdersListContainer) return;

    // Get filter values
    const searchTerm = State.tableSearchTerms.adminOrders.toLowerCase();
    const startDate = D.filterOrderDateStart.value;
    const endDate = D.filterOrderDateEnd.value;
    const status = D.filterOrderStatus.value;
    const type = D.filterOrderType.value;
    const technicianId = D.filterOrderTechnician.value;

    const filteredOrders = State.allServiceOrders.filter(order => {
        // Date filtering
        if (order.service_date) {
            const orderDate = order.service_date.substring(0, 10);
            if (startDate && orderDate < startDate) return false;
            if (endDate && orderDate > endDate) return false;
        }

        // Dropdown filters
        if (status && order.status !== status) return false;
        if (type && order.order_type !== type) return false;
        if (technicianId && !order.assignedTechnicians?.some(t => t.id === technicianId)) return false;

        // Search term filter
        const searchString = [
            order.manualId,
            order.clientDetails?.name,
            order.clientDetails?.address,
            order.order_type,
            order.assignedTechnicians?.map(t => t.name).join(' ')
        ].join(' ').toLowerCase();

        return searchString.includes(searchTerm);
    }).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());

    const paginatedOrders = getPaginatedData('adminOrders', filteredOrders);

    if (paginatedOrders.length === 0) {
        D.adminOrdersListContainer.innerHTML = '<p class="text-muted" style="text-align: center;">No se encontraron órdenes con los filtros actuales.</p>';
    } else {
        D.adminOrdersListContainer.innerHTML = paginatedOrders.map(createOrderCardHTML).join('');
    }

    renderPagination('adminOrders', D.adminOrdersPaginationContainer, paginatedOrders, filteredOrders.length, renderAdminOrdersList);
}


// --- Category and Equipment Selection Modals ---

export function openCategorySelectionModal(nextAction: 'manual' | 'search') {
    State.setManualReportCreationState({ category: null, nextAction });

    const repeatBtn = document.getElementById('repeat-client-data-button') as HTMLButtonElement | null;
    if (repeatBtn) {
        const currentUser = State.currentUser;
        const myReports = State.reports.filter(r => r.workerId === currentUser?.id);
        const sortedReports = myReports.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        let hasReportToday = false;
        if (sortedReports.length > 0) {
            const latest = sortedReports[0];
            const latestDate = new Date(latest.timestamp);
            const today = new Date();
            if (latestDate.getDate() === today.getDate() && latestDate.getMonth() === today.getMonth() && latestDate.getFullYear() === today.getFullYear()) {
                hasReportToday = true;
                repeatBtn.dataset.reportId = latest.id;
            }
        }

        repeatBtn.style.display = hasReportToday ? 'block' : 'none';
    }

    if (D.categorySelectionModal) {
        D.categorySelectionModal.style.display = 'flex';
        resetModalScroll(D.categorySelectionModal);
    }
}

export function closeCategorySelectionModal() {
    if (D.categorySelectionModal) D.categorySelectionModal.style.display = 'none';
    State.setManualReportCreationState(null);
}

export function openEquipmentSelectionModal() {
    if (D.equipmentSelectionModal) {
        D.equipmentSelectionSearchInput.value = '';
        renderEquipmentSelectionResults();
        D.equipmentSelectionModal.style.display = 'flex';
        resetModalScroll(D.equipmentSelectionModal);
    }
}

export function closeEquipmentSelectionModal() {
    if (D.equipmentSelectionModal) D.equipmentSelectionModal.style.display = 'none';
}

export function renderEquipmentSelectionResults() {
    const searchTerm = D.equipmentSelectionSearchInput.value.toLowerCase();
    const category = State.manualReportCreationState.category;

    if (!D.equipmentSelectionSearchResults) return;

    const results = State.equipmentList.filter(eq => {
        if (eq.category !== category) return false;
        if (!searchTerm) return true; // Show all if search is empty

        const clientOrCompany = eq.category === 'residencial'
            ? (eq.client_name || '')
            : (State.companies.find(c => c.id === eq.companyId)?.name || '');
        const dependency = eq.dependencyId ? State.dependencies.find(d => d.id === eq.dependencyId)?.name || '' : '';

        const searchString = [
            eq.manualId, eq.brand, eq.model, clientOrCompany, dependency, eq.address
        ].join(' ').toLowerCase();

        return searchString.includes(searchTerm);
    });

    if (results.length === 0 && searchTerm) {
        D.equipmentSelectionSearchResults.innerHTML = '<div class="search-result-item" style="text-align: center; font-style: italic;">No se encontraron equipos.</div>';
    } else {
        D.equipmentSelectionSearchResults.innerHTML = results.slice(0, 50).map(eq => { // Limit to 50 results for performance
            const location = eq.category === 'residencial'
                ? (eq.address || 'Sin dirección')
                : (`${State.companies.find(c => c.id === eq.companyId)?.name || ''} - ${State.dependencies.find(d => d.id === eq.dependencyId)?.name || ''}`);
            return `
                <div class="search-result-item" data-equipment-id="${eq.id}">
                    <div><span class="search-result-item-id">${eq.manualId || 'S/ID'}</span>: ${eq.brand} ${eq.model}</div>
                    <div class="search-result-item-location">${eq.client_name || location}</div>
                </div>
            `;
        }).join('');

        D.equipmentSelectionSearchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const equipmentId = (item as HTMLElement).dataset.equipmentId;
                const selectedEquipment = State.equipmentList.find(eq => eq.id === equipmentId);
                if (selectedEquipment) {
                    handleEquipmentSelection(selectedEquipment);
                }
            });
        });
    }
}

export function handleEquipmentSelection(equipment: Equipment) {
    closeEquipmentSelectionModal();
    openReportFormModal({ equipment, category: equipment.category as any });
}

export function handleCreateNewEquipmentFromSelection() {
    openEntityFormModal('equipment', undefined, { source: 'equipmentSelectionModal' }, State.manualReportCreationState.category || 'empresa');
}

export function handleContinueWithoutEquipment() {
    closeEquipmentSelectionModal();
    openReportFormModal({ category: State.manualReportCreationState.category || 'empresa' });
}

function openImageLightbox(urls: string[], startingIndex: number) {
    const validUrls = urls.filter(url => url !== '');
    if (validUrls.length === 0) return;

    let actualIndex = 0;
    let validCount = 0;
    for (let i = 0; i < urls.length; i++) {
        if (i === startingIndex) {
            actualIndex = validCount;
            break;
        }
        if (urls[i] !== '') validCount++;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.95); z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center; touch-action:none;';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = 'position:absolute; top:20px; right:20px; background:rgba(255,255,255,0.1); border:none; color:white; font-size:1.5rem; cursor:pointer; z-index:10; width:45px; height:45px; border-radius:50%; display:flex; align-items:center; justify-content:center;';
    overlay.appendChild(closeBtn);

    const counter = document.createElement('div');
    counter.style.cssText = 'position:absolute; top:30px; left:20px; color:white; font-size:1.1rem; font-weight:bold; z-index:10; font-family:var(--font-family-main); background:rgba(0,0,0,0.5); padding:4px 10px; border-radius:15px;';
    overlay.appendChild(counter);

    const imgContainer = document.createElement('div');
    imgContainer.style.cssText = 'width:100%; height:80%; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative;';

    const imgElement = document.createElement('img');
    imgElement.style.cssText = 'max-width:100%; max-height:100%; object-fit:contain; transition:transform 0.2s ease-out;';
    imgContainer.appendChild(imgElement);

    overlay.appendChild(imgContainer);

    const createNavBtn = (iconClass: string, isLeft: boolean) => {
        const btn = document.createElement('button');
        btn.innerHTML = `<i class="fas ${iconClass}"></i>`;
        btn.style.cssText = `position:absolute; ${isLeft ? 'left:15px' : 'right:15px'}; top:50%; transform:translateY(-50%); background:rgba(255,255,255,0.1); border:none; color:white; font-size:1.5rem; cursor:pointer; z-index:10; width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; display:none; transition:background 0.3s;`;
        btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.2)';
        btn.onmouseout = () => btn.style.background = 'rgba(255,255,255,0.1)';
        return btn;
    };

    const prevBtn = createNavBtn('fa-chevron-left', true);
    const nextBtn = createNavBtn('fa-chevron-right', false);

    overlay.appendChild(prevBtn);
    overlay.appendChild(nextBtn);

    const updateImage = () => {
        imgElement.style.opacity = '0.5';
        setTimeout(() => {
            imgElement.src = validUrls[actualIndex];
            imgElement.style.opacity = '1';
        }, 100);
        counter.textContent = `${actualIndex + 1} / ${validUrls.length}`;
        prevBtn.style.display = validUrls.length > 1 ? 'flex' : 'none';
        nextBtn.style.display = validUrls.length > 1 ? 'flex' : 'none';

        // Visual indicator if at ends
        prevBtn.style.opacity = actualIndex === 0 ? '0.3' : '1';
        nextBtn.style.opacity = actualIndex === validUrls.length - 1 ? '0.3' : '1';
    };

    closeBtn.onclick = () => document.body.removeChild(overlay);

    prevBtn.onclick = (e) => {
        e.stopPropagation();
        if (actualIndex > 0) {
            actualIndex--;
            updateImage();
        }
    };

    nextBtn.onclick = (e) => {
        e.stopPropagation();
        if (actualIndex < validUrls.length - 1) {
            actualIndex++;
            updateImage();
        }
    };

    let touchStartX = 0;
    let touchEndX = 0;

    imgContainer.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    });

    imgContainer.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        const threshold = 40;
        if (touchStartX - touchEndX > threshold && actualIndex < validUrls.length - 1) {
            actualIndex++;
            updateImage();
        } else if (touchEndX - touchStartX > threshold && actualIndex > 0) {
            actualIndex--;
            updateImage();
        }
    });

    updateImage();
    document.body.appendChild(overlay);
}


// --- Order Details Modal ---
export function openOrderDetailsModal(orderId: string) {
    const order = State.allServiceOrders.find(o => o.id === orderId) || State.assignedOrders.find(o => o.id === orderId);
    if (!order || !D.orderDetailsModal) return;

    D.orderManualIdHeader.textContent = `${order.manualId || order.id.substring(0, 8)}`;

    let clientName = order.clientDetails?.name || 'N/A';
    let clientAddress = order.clientDetails?.address || 'N/A';
    let clientCity = order.clientDetails?.city || 'N/A';
    let clientPhone = order.clientDetails?.phone || 'N/A';
    let clientEmail = order.clientDetails?.email || 'N/A';

    if (order.sede_id) {
        const sede = State.sedes.find(s => s.id === order.sede_id);
        if (sede) {
            clientName = `${order.clientDetails?.name || ''} - Sede ${sede.name}`.trim();
            clientAddress = sede.address || clientAddress;
            if (sede.cityId) {
                const city = State.cities.find(c => c.id === sede.cityId);
                if (city) clientCity = city.name;
            }
            if (sede.contact_person) {
                clientEmail = sede.contact_person; // Mapping contact_person to the 'Contacto/Email' field
            }
            if (sede.phone) {
                clientPhone = sede.phone;
            }
        }
    }

    D.orderClientName.textContent = clientName;
    D.orderClientAddress.textContent = clientAddress;
    D.orderClientCity.textContent = clientCity;
    D.orderClientPhone.textContent = clientPhone;
    D.orderClientEmail.textContent = clientEmail;

    D.orderServiceDate.textContent = `${formatDate(order.service_date, false)} a las ${formatTime(order.service_time)}`;
    D.orderType.textContent = order.order_type || 'N/A';
    D.orderNotes.textContent = order.notes || 'Sin notas.';

    if (D.orderImagesContainer) {
        D.orderImagesContainer.innerHTML = '';
        if (order.image_urls && order.image_urls.length > 0) {
            const currentObjectUrls: string[] = new Array(order.image_urls.length).fill('');
            order.image_urls.forEach((url, index) => {
                const imgWrap = document.createElement('div');
                imgWrap.style.cssText = 'position: relative; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); cursor: pointer;';
                imgWrap.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;"><i class="fas fa-spinner fa-spin"></i></div>`;
                D.orderImagesContainer.appendChild(imgWrap);

                let downloadPromise;
                if (url.startsWith('QUOTE_IMG::')) {
                    const cleanUrl = url.replace('QUOTE_IMG::', '');
                    downloadPromise = supabaseClients.storage.from("quote-images").download(cleanUrl);
                } else if (url.startsWith('http')) {
                    downloadPromise = Promise.resolve({ data: url, error: null, isDirectHttp: true });
                } else {
                    downloadPromise = supabaseOrders.storage.from("order-images").download(url);
                }

                downloadPromise.then((result: any) => {
                    const { data, error, isDirectHttp } = result;
                    let objectUrl = "";
                    let imgHtml = "";

                    if (!error && data) {
                        objectUrl = isDirectHttp ? data : URL.createObjectURL(data);
                        currentObjectUrls[index] = objectUrl;
                        imgHtml = `<img src="${objectUrl}" style="width: 100%; height: 100%; object-fit: cover;" alt="Anexo Orden">`;
                    } else {
                        console.error("Error downloading order annex:", error);
                        imgHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ff4444;"><i class="fas fa-exclamation-triangle"></i></div>`;
                    }

                    imgWrap.innerHTML = imgHtml;

                    if (!error && data) {
                        imgWrap.addEventListener('click', () => {
                            openImageLightbox(currentObjectUrls, index);
                        });
                    }
                });
            });
        } else {
            D.orderImagesContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9em;">Sin fotos adjuntas.</span>';
        }
    }
    const isServiceItem = (desc: string) => /mano de obra|montaje|instalaci[oó]n|desmonte|mantenimiento/i.test(desc);

    const services = order.items?.filter(i => isServiceItem(i.description)) || [];
    const materials = order.items?.filter(i => !isServiceItem(i.description)) || [];

    if (D.orderServicesTableBody && D.orderServicesEmpty) {
        if (services.length > 0) {
            D.orderServicesEmpty.style.display = 'none';
            D.orderServicesTableBody.innerHTML = services.map((item, index) => {
                const completed = item.completed_quantity || 0;
                const isComplete = completed >= item.quantity;
                const isWorker = State.currentUser?.role === 'worker';
                const canReport = (isWorker || (order.assignedTechnicians?.some(t => t.id === State.currentUser?.id))) && !isComplete && order.status !== 'cancelada';

                let actionHtml = '';
                if (canReport) {
                    actionHtml = `<button type="button" class="btn btn-primary report-item-btn" data-order-id="${order.id}" data-item-id="${item.id}" style="width: 100%; padding: 12px; font-weight: 800; font-size: 1.05rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.2);"><i class="fas fa-edit" style="margin-right: 5px;"></i> REPORTAR</button>`;
                } else if (isComplete) {
                    actionHtml = `<div class="status-completed" style="font-size: 1.05rem; padding: 12px; text-align: center; border-radius: 8px; font-weight: bold; width: 100%; box-sizing: border-box; background-color: rgba(12, 232, 143, 0.1); border: 1px solid var(--color-success); color: var(--color-success);">Completado <i class="fas fa-check-circle"></i></div>`;
                }

                return `
                <div class="service-card" style="background-color: var(--color-bg-light); border: 1px solid var(--color-border-light); border-radius: 8px; padding: 15px; display: flex; flex-direction: column; gap: 15px; margin-bottom: 1px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                        <strong style="font-size: 1.15rem; color: var(--color-text-primary); flex: 1;">${item.description}</strong>
                        <div style="text-align: right; min-width: 80px;">
                            <div style="font-size: 1rem; font-weight: bold; color: ${isComplete ? 'var(--color-success)' : 'var(--color-text-primary)'}; margin-bottom: 5px;">${completed} / ${item.quantity}</div>
                            <progress value="${completed}" max="${item.quantity}" style="width: 100%; height: 8px; border-radius: 4px; border: none; background-color: var(--color-bg-medium); color: ${isComplete ? 'var(--color-success)' : 'var(--color-accent-primary)'}; accent-color: ${isComplete ? 'var(--color-success)' : 'var(--color-accent-primary)'};"></progress>
                        </div>
                    </div>
                    <div style="width: 100%;">
                        ${actionHtml}
                    </div>
                </div>
            `}).join('');
        } else {
            D.orderServicesTableBody.innerHTML = '';
            D.orderServicesEmpty.style.display = 'block';
        }
    }

    if (D.orderMaterialsTableBody && D.orderMaterialsEmpty) {
        if (materials.length > 0) {
            D.orderMaterialsEmpty.style.display = 'none';
            D.orderMaterialsTableBody.innerHTML = materials.map((item, index) => `
                <tr data-label="Material #${index + 1}">
                    <td data-label="Material"><strong>#${index + 1}</strong></td>
                    <td data-label="Descripción">${item.description}</td>
                    <td data-label="Cantidad">${item.quantity}</td>
                </tr>
            `).join('');
        } else {
            D.orderMaterialsTableBody.innerHTML = '';
            D.orderMaterialsEmpty.style.display = 'block';
        }
    }

    if (D.orderAssignedTechniciansList) {
        if (order.assignedTechnicians && order.assignedTechnicians.length > 0) {
            D.orderAssignedTechniciansList.innerHTML = order.assignedTechnicians.map(t => `<div class="tech-name"><i class="fas fa-user-cog"></i> ${t.name}</div>`).join('');
        } else {
            D.orderAssignedTechniciansList.innerHTML = '<span class="text-muted">No hay técnicos asignados.</span>';
        }
    }

    if (D.startReportFromOrderButton) {
        D.startReportFromOrderButton.dataset.orderId = order.id;
        let canStartReport = (State.currentUser?.role === 'admin' || order.assignedTechnicians?.some(t => t.id === State.currentUser?.id)) && (order.status !== 'completed' && order.status !== 'cancelada');

        // Hide generic report button if there are specific service items (to force them to use the item-specific buttons)
        const isServiceItem = (desc: string) => /mano de obra|montaje|instalaci[oó]n|desmonte|mantenimiento/i.test(desc);
        const hasServiceItems = order.items && order.items.some(i => isServiceItem(i.description));

        if (hasServiceItems) {
            canStartReport = false;
        }

        D.startReportFromOrderButton.style.display = canStartReport ? 'inline-flex' : 'none';
    }

    D.orderDetailsModal.style.display = 'flex';
    resetModalScroll(D.orderDetailsModal);
}

// --- Entity Form Modal ---
export function openEntityFormModal(type: EntityType, id?: string, context?: any, defaultCategory?: 'empresa' | 'residencial') {
    if (!D.entityFormModal || !D.entityForm) return;

    State.setEntityFormContext(context || null);
    D.entityForm.reset();
    D.entityIdInput.value = id || '';
    D.entityTypeInput.value = type;

    let title = id ? 'Editar' : 'Agregar';
    let fieldsHTML = '';

    const getField = (label: string, name: string, type: string = 'text', value: any = '', required = true, extra: string = '') => `
        <div class="form-group">
            <label for="${name}">${label}</label>
            <input type="${type}" id="${name}" name="${name}" value="${value || ''}" ${required ? 'required' : ''} ${extra}>
        </div>
    `;

    const getSelect = (label: string, name: string, options: { id: string, name: string }[], selectedValue: any = '', required = true, addEmpty = true, extra: string = '') => {
        let optionsHTML = addEmpty ? '<option value="">Seleccione...</option>' : '';
        // FIX: Corrected typo in localeCompare for sorting.
        options.sort((a, b) => a.name.localeCompare(b.name)).forEach(opt => {
            optionsHTML += `<option value="${opt.id}" ${opt.id === selectedValue ? 'selected' : ''}>${opt.name}</option>`;
        });
        return `
            <div class="form-group">
                <label for="${name}">${label}</label>
                <select id="${name}" name="${name}" ${required ? 'required' : ''} ${extra}>${optionsHTML}</select>
            </div>
        `;
    };

    const getSelectWithAdd = (label: string, name: string, options: { id: string, name: string }[], selectedValue: any = '', required = true, addEntityType: EntityType, extra: string = '') => {
        let optionsHTML = '<option value="">Seleccione...</option>';
        options.sort((a, b) => a.name.localeCompare(b.name)).forEach(opt => {
            optionsHTML += `<option value="${opt.id}" ${opt.id === selectedValue ? 'selected' : ''}>${opt.name}</option>`;
        });
        return `
            <div class="form-group">
                <label for="${name}">${label}</label>
                <div class="input-with-button">
                    <select id="${name}" name="${name}" ${required ? 'required' : ''} ${extra}>${optionsHTML}</select>
                    <button type="button" class="btn btn-add-inline" data-entity-type="${addEntityType}" title="Agregar Nuevo"><i class="fas fa-plus"></i></button>
                </div>
            </div>
        `;
    };

    const titleMap: Record<EntityType, string> = {
        city: 'Ciudad',
        company: 'Empresa',
        dependency: 'Dependencia',
        employee: 'Empleado',
        equipment: 'Equipo',
        equipmentType: 'Tipo de Equipo',
        refrigerant: 'Tipo de Refrigerante',
    };

    switch (type) {
        case 'city':
            const city = State.cities.find(c => c.id === id);
            fieldsHTML = getField('Nombre de la Ciudad', 'name', 'text', city?.name);
            break;
        case 'company':
            const company = State.companies.find(c => c.id === id);
            const isWorker = State.currentUser?.role === 'worker';
            const isOnline = navigator.onLine;

            if (isWorker && !isOnline) {
                // Offline worker: Can only select existing city, no "other" or "add new"
                fieldsHTML = getField('Nombre de la Empresa', 'name', 'text', company?.name)
                    + getSelect('Ciudad', 'city_id', State.cities, company?.cityId, true, true);
            } else if (isWorker && isOnline) {
                // Online worker: Can select or choose "other"
                let cityOptionsHTML = '<option value="">Seleccione...</option>';
                State.cities.sort((a, b) => a.name.localeCompare(b.name)).forEach(opt => {
                    cityOptionsHTML += `<option value="${opt.id}" ${opt.id === company?.cityId ? 'selected' : ''}>${opt.name}</option>`;
                });
                cityOptionsHTML += `<option value="otra">Otra</option>`;

                fieldsHTML = getField('Nombre de la Empresa', 'name', 'text', company?.name) + `
                    <div class="form-group">
                        <label for="city_id">Ciudad</label>
                        <select id="city_id" name="city_id" required>${cityOptionsHTML}</select>
                    </div>`;
            } else { // Admin (always has add button)
                fieldsHTML = getField('Nombre de la Empresa', 'name', 'text', company?.name)
                    + getSelectWithAdd('Ciudad', 'city_id', State.cities, company?.cityId, false, 'city');
            }
            break;
        case 'dependency':
            const dependency = State.dependencies.find(d => d.id === id);
            const selectedCompany = (context?.source === 'reportForm' || context?.source === 'entityForm') ? context.selectedCompanyId : dependency?.companyId;
            if (context?.source === 'reportForm' && selectedCompany) {
                const sedeRecord = State.sedes.find(s => s.id === selectedCompany);
                let displayName = '';
                let destLabel = 'Destino';
                if (sedeRecord) {
                    const parentCompany = State.companies.find(c => c.id === sedeRecord?.companyId);
                    displayName = `${parentCompany?.name || ''} - ${sedeRecord.name}`;
                    destLabel = 'Sede Destino';
                } else {
                    const companyRecord = State.companies.find(c => c.id === selectedCompany);
                    if (companyRecord) {
                        displayName = companyRecord.name;
                        destLabel = 'Empresa Destino';
                    }
                }

                fieldsHTML = getField('Nombre de la Dependencia', 'name', 'text', dependency?.name)
                    + `
                    <div class="form-group">
                        <label for="company_id_display">${destLabel}</label>
                        <input type="text" id="company_id_display" value="${displayName}" readonly class="readonly-field">
                        <input type="hidden" id="company_id" name="company_id" value="${selectedCompany}">
                    </div>
                `;
            } else {
                fieldsHTML = getField('Nombre de la Dependencia', 'name', 'text', dependency?.name)
                    + getSelectWithAdd('Sede', 'company_id', State.sedes, selectedCompany, false, 'company');
            }
            break;
        case 'employee':
            const employee = State.users.find(u => u.id === id);
            fieldsHTML = getField('Nombre Completo', 'name', 'text', employee?.name)
                + getField('Cédula', 'cedula', 'text', employee?.cedula, !id) // Cédula required for new, not for edit
                + getField('Contraseña (si desea cambiar)', 'password', 'password', '', false);
            break;
        case 'equipmentType':
        case 'refrigerant':
            fieldsHTML = getField(`Nombre del ${type === 'equipmentType' ? 'Tipo de Equipo' : 'Refrigerante'}`, 'new_value');
            break;
        case 'equipment':
            const equipment = State.equipmentList.find(eq => eq.id === id);
            const currentCategory = equipment?.category || defaultCategory || 'empresa';

            const categorySelector = `
                <div class="form-group">
                    <label>Categoría</label>
                    <div class="radio-group">
                        <label>
                            <input type="radio" name="category" value="empresa" ${currentCategory === 'empresa' ? 'checked' : ''}>
                            Empresa
                        </label>
                        <label>
                            <input type="radio" name="category" value="residencial" ${currentCategory === 'residencial' ? 'checked' : ''}>
                            Residencial
                        </label>
                    </div>
                </div>`;

            const empresaFields = `
                <div id="empresa-fields-container" style="display: ${currentCategory === 'empresa' ? 'block' : 'none'}">
                    ${getSelectWithAdd('Empresa', 'company_id', State.companies, equipment?.companyId, true, 'company', 'id="equipment-company"')}
                    ${getSelectWithAdd('Dependencia', 'dependency_id', State.dependencies, equipment?.dependencyId, true, 'dependency', 'id="equipment-dependency"')}
                </div>
            `;

            const residencialFields = `
                 <div id="residencial-fields-container" style="display: ${currentCategory === 'residencial' ? 'block' : 'none'}">
                     ${getField('Nombre del Cliente', 'client_name', 'text', equipment?.client_name, true)}
                     ${getField('Dirección', 'address', 'text', equipment?.address, true)}
                     ${getSelectWithAdd('Ciudad', 'city_id_residencial', State.cities, equipment?.cityId, true, 'city', 'id="city_id_residencial"')}
                 </div>
            `;

            fieldsHTML = getField('ID Manual (Opcional)', 'manual_id', 'text', equipment?.manualId, false, 'placeholder="Ej: A-101"')
                + getField('Marca', 'brand', 'text', equipment?.brand)
                + getField('Modelo', 'model', 'text', equipment?.model)
                + getSelectWithAdd('Tipo de Equipo', 'equipment_type_id', State.equipmentTypes, equipment?.equipment_type_id, true, 'equipmentType')
                + getSelectWithAdd('Tipo de Refrigerante', 'refrigerant_type_id', State.refrigerantTypes, equipment?.refrigerant_type_id, false, 'refrigerant')
                + getField('Capacidad (Opcional)', 'capacity', 'text', equipment?.capacity, false, 'placeholder="Ej: 12000 BTU"')
                + getField('Periodicidad (Meses)', 'periodicityMonths', 'number', equipment?.periodicityMonths || 6, true, 'min="1"')
                + getField('Fecha Último Mantenimiento (Opcional)', 'lastMaintenanceDate', 'date', equipment?.lastMaintenanceDate, false)
                + categorySelector
                + empresaFields
                + residencialFields;

            setTimeout(() => {
                const applyCategoryState = (isEmpresa: boolean) => {
                    // FIX: Cast querySelector result to HTMLElement to access style property.
                    (D.entityFormFieldsContainer.querySelector('#empresa-fields-container') as HTMLElement)!.style.display = isEmpresa ? 'block' : 'none';
                    // FIX: Cast querySelector result to HTMLElement to access style property.
                    (D.entityFormFieldsContainer.querySelector('#residencial-fields-container') as HTMLElement)!.style.display = isEmpresa ? 'none' : 'block';
                    D.entityFormFieldsContainer.querySelectorAll('#empresa-fields-container select').forEach(s => (s as HTMLSelectElement).required = isEmpresa);
                    D.entityFormFieldsContainer.querySelectorAll('#residencial-fields-container input, #residencial-fields-container select').forEach(el => (el as HTMLInputElement).required = !isEmpresa);
                };

                const radios = D.entityFormFieldsContainer.querySelectorAll('input[name="category"]');
                radios.forEach(radio => radio.addEventListener('change', (e) => {
                    const isEmpresa = (e.target as HTMLInputElement).value === 'empresa';
                    applyCategoryState(isEmpresa);
                }));
                applyCategoryState(currentCategory === 'empresa');

                const companySelect = D.entityFormFieldsContainer.querySelector('#equipment-company') as HTMLSelectElement;
                const dependencySelect = D.entityFormFieldsContainer.querySelector('#equipment-dependency') as HTMLSelectElement;
                if (companySelect && dependencySelect) {
                    const updateDependencies = () => {
                        const companyId = companySelect.value;
                        const filtered = State.dependencies.filter(d => d.companyId === companyId);
                        dependencySelect.innerHTML = '<option value="">Seleccione...</option>';
                        filtered.sort((a, b) => a.name.localeCompare(b.name)).forEach(d => {
                            dependencySelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
                        });
                        dependencySelect.disabled = !companyId;
                    };
                    companySelect.addEventListener('change', updateDependencies);
                    updateDependencies(); // Initial call
                    if (equipment?.dependencyId) dependencySelect.value = equipment.dependencyId;
                }

            }, 0);
            break;
    }

    D.entityFormTitle.textContent = `${title} ${titleMap[type]}`;
    D.entityFormFieldsContainer.innerHTML = fieldsHTML;
    D.entityFormModal.style.display = 'flex';
    resetModalScroll(D.entityFormModal);

    if (type === 'dependency' && context?.source === 'reportForm') {
        setTimeout(() => {
            const nameInput = D.entityFormFieldsContainer.querySelector('#name') as HTMLInputElement | null;
            nameInput?.focus();
        }, 0);
    }
}

// FIX: Add missing function to close the entity form modal.
export function closeEntityFormModal() {
    if (D.entityFormModal) {
        D.entityFormModal.style.display = 'none';
        State.setEntityFormContext(null);
    }
}

// FIX: Add missing handler for the cancel button in the entity form.
export function handleCancelEntityForm() {
    closeEntityFormModal();
}
