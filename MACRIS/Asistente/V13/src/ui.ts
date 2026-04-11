import * as D from './dom';
import * as State from './state';
import { formatDate, formatTime, fuzzyNormalize } from './utils';
import { processAiRequest, AiResult, processImageForReport, DigitizedReportData } from './ai';
import { getWidgetConfig, setWidgetConfig, updateDashboardData } from './dashboard';
import { fetchReportDetails, fetchAllReports, fetchReportsForWorker, fetchAllReportsForExport, fetchUniqueNamesFromSnapshots, saveMaintenanceReport, updateMaintenanceReport } from './api';
import { generateReportPDF, generateReportsPDF } from './lib/pdf-generator';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { EntityType, Report, Equipment, Order, City, Company, Dependency, User } from './types';
import type { ChatHistoryEntry } from './state';

// State local para rastrear qué reporte se está visualizando
let currentViewedReportId: string | null = null;

// Configuración de campos disponibles para Excel
const EXCEL_FIELDS = [
    { key: 'timestamp', label: 'Fecha', formatter: (v: string) => formatDate(v, false) },
    { key: 'id', label: 'ID Reporte', formatter: (v: string) => v.substring(0,8) },
    { key: 'client', label: 'Cliente / Empresa', getter: (r: Report) => r.equipmentSnapshot.category === 'residencial' ? r.equipmentSnapshot.client_name : r.equipmentSnapshot.companyName },
    { key: 'dependency', label: 'Sede / Dependencia', getter: (r: Report) => r.equipmentSnapshot.dependencyName || 'N/A' },
    { key: 'city', label: 'Ciudad', getter: (r: Report) => State.cities.find(c => c.id === r.cityId)?.name || 'N/A' },
    { key: 'serviceType', label: 'Tipo de Servicio' },
    { key: 'brand', label: 'Marca Equipo', getter: (r: Report) => r.equipmentSnapshot.brand },
    { key: 'model', label: 'Modelo Equipo', getter: (r: Report) => r.equipmentSnapshot.model },
    { key: 'type', label: 'Tipo Equipo', getter: (r: Report) => r.equipmentSnapshot.type },
    { key: 'capacity', label: 'Capacidad', getter: (r: Report) => r.equipmentSnapshot.capacity || 'N/A' },
    { key: 'refrigerant', label: 'Refrigerante', getter: (r: Report) => r.equipmentSnapshot.refrigerant || 'N/A' },
    { key: 'pressure', label: 'Presión (PSI)' },
    { key: 'amperage', label: 'Amperaje (A)' },
    { key: 'workerName', label: 'Técnico' },
    { key: 'is_paid', label: 'Estado Pago', formatter: (v: boolean) => v ? 'Pagado' : 'Pendiente' },
    { key: 'observations', label: 'Observaciones' }
];

// --- Basic UI Setup ---

export function initUI() {
    setupManualFilters();
    setupChat();
    setupExports();
    setupModalListeners();
    renderReports();
    setupMobileDrawers();
}

function setupModalListeners() {
    D.downloadSinglePdfBtn?.addEventListener('click', () => {
        if (currentViewedReportId) {
            downloadPDF(currentViewedReportId);
        }
    });

    document.querySelectorAll('.close-button, .close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach((m: any) => m.style.display = 'none');
            currentViewedReportId = null;
        });
    });
}

function setupMobileDrawers() {
    const filterSidebar = document.getElementById('filter-sidebar');
    const aiSidebar = document.getElementById('ai-chat-sidebar');
    const toggleFilterBtn = document.getElementById('toggle-sidebar-mobile');
    const toggleChatBtn = document.getElementById('toggle-chat-mobile');
    const closeBtns = document.querySelectorAll('.close-drawer');

    const overlay = document.createElement('div');
    overlay.className = 'drawer-overlay';
    document.body.appendChild(overlay);

    const closeAll = () => {
        filterSidebar?.classList.remove('open');
        aiSidebar?.classList.remove('open');
        overlay.classList.remove('active');
    };

    toggleFilterBtn?.addEventListener('click', () => { filterSidebar?.classList.add('open'); overlay.classList.add('active'); });
    toggleChatBtn?.addEventListener('click', () => { aiSidebar?.classList.add('open'); overlay.classList.add('active'); });
    closeBtns.forEach(btn => btn.addEventListener('click', closeAll));
    overlay.addEventListener('click', closeAll);

    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const action = (btn as HTMLElement).dataset.action;
            if (action === 'filters') toggleFilterBtn?.click();
            if (action === 'ai') toggleChatBtn?.click();
            if (action === 'reports') closeAll();
        });
    });
}

export function showLoader(m?: string) {
    if (!D.loadingOverlay) return;
    D.loadingOverlay.style.display = 'flex';
    if (m) {
        const p = D.loadingOverlay.querySelector('p');
        if (p) p.textContent = m;
    }
}

export function hideLoader() {
    if (D.loadingOverlay) D.loadingOverlay.style.display = 'none';
}

export function showAppNotification(message: string, type: 'error' | 'success' | 'info' | 'warning' = 'info', duration: number = 4000) {
    const notification = document.createElement('div');
    notification.className = `app-notification ${type}`;
    notification.innerHTML = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, duration);
}

// --- Tab & View Management ---

export function showView(viewId: string) {
    renderReports();
}

export function handleTabClick(e: Event) {
    const target = (e.currentTarget as HTMLElement);
    const viewId = target.dataset.viewId;
    if (!viewId) return;
    renderReports();
}

export function populateBottomNav(role: string) {}

// --- Data Population ---

export function populateDropdown(el: HTMLSelectElement, data: any[], selectedId?: string) {
    if (!el) return;
    const defaultText = el.id === 'filter-city' ? 'Todas las Ciudades' : 'Todos';
    el.innerHTML = `<option value="">${defaultText}</option>`;
    data.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        if (String(item.id) === String(selectedId)) opt.selected = true;
        el.appendChild(opt);
    });
}

export function populateFilterDropdowns() {
    populateAdminFilterDropdowns();
    populateAdminOrderFilterDropdowns();
}

export function populateAdminFilterDropdowns() {
    // 0. Ciudades
    const filterCityEl = document.getElementById('filter-city') as HTMLSelectElement;
    if (filterCityEl) populateDropdown(filterCityEl, State.cities, State.filters.cityId);

    // 1. Empresas oficiales
    const allOfficialCompanies = State.companies.map(c => ({ id: c.id, name: c.name }));
    
    // 2. Nombres dinámicos precargados (Incluye CONFANDI TULUA)
    const dynamicOptions = State.historicalCompanyNames
        .filter(name => !allOfficialCompanies.some(c => c.name.toLowerCase().trim() === name.toLowerCase().trim()))
        .map(name => ({ 
            id: name, 
            name: `${name} (Detección)` 
        }));

    const unifiedClientList = [...allOfficialCompanies, ...dynamicOptions].sort((a, b) => a.name.localeCompare(b.name));
    
    if (D.filterCompany) populateDropdown(D.filterCompany, unifiedClientList);
    
    // Técnicos
    const activeTechIds = new Set(State.reports.map(r => r.workerId).filter(id => !!id));
    const activeTechs = State.users.filter(u => u.role === 'worker' && activeTechIds.has(u.id));
    if (D.filterTech) populateDropdown(D.filterTech, activeTechs, State.filters.techId);

    // Tipos de servicio
    const filterServiceTypeEl = document.getElementById('filter-service-type') as HTMLSelectElement;
    if (filterServiceTypeEl) {
        const sTypes = State.serviceTypes.map(st => ({ id: st.name, name: st.name }));
        populateDropdown(filterServiceTypeEl, sTypes, State.filters.serviceType);
    }

    // Tipos de equipo
    const typesInReports = new Set(State.reports.map(r => r.equipmentSnapshot.type).filter(t => !!t));
    const activeEqTypes = State.equipmentTypes.filter(et => typesInReports.has(et.name));
    if (D.filterEqType) populateDropdown(D.filterEqType, activeEqTypes, State.filters.eqType);

    // Estado Pago
    if (D.filterPaid) {
        D.filterPaid.value = String(State.filters.paid);
    }
}

export function populateAdminOrderFilterDropdowns() {
    const workers = State.users.filter(u => u.role === 'worker');
    if (D.filterOrderTechnician) {
        populateDropdown(D.filterOrderTechnician, workers.map(w => ({ id: w.id, name: w.name || w.username })));
    }
}

// --- Rendering Functions ---

export function renderReports() {
    renderAdminReportsTable();
}

async function changePage(newPage: number) {
    State.setCurrentPage(newPage);
    const miniLoader = document.getElementById('table-loader-mini');
    if (miniLoader) miniLoader.style.display = 'block';
    try {
        const result = await fetchAllReports(newPage, State.itemsPerPage, State.filters);
        State.setReports(result.reports, result.total);
        renderAdminReportsTable();
        populateAdminFilterDropdowns();
    } catch (e) {
        console.error("Pagination Error:", e);
    } finally {
        if (miniLoader) miniLoader.style.display = 'none';
    }
}

export function renderActiveFilterChips() {
    const container = document.getElementById('active-filters-container');
    if (!container) return;
    container.innerHTML = '';

    const addChip = (key: keyof State.FilterState, label: string, value: string) => {
        const chip = document.createElement('div');
        chip.className = 'filter-chip';
        chip.innerHTML = `
            <span>${label}: ${value}</span>
            <button data-key="${key}"><i class="fas fa-times-circle"></i></button>
        `;
        chip.querySelector('button')?.addEventListener('click', () => {
            if (key === 'companyId') {
                State.updateFilter(key as any, [] as string[]);
                renderSelectedCompaniesChips();
            } else {
                State.updateFilter(key as any, '');
            }
            const inputId = key === 'global' ? 'global-search' : 
                          key === 'cityId' ? 'filter-city' : 
                          key === 'techId' ? 'filter-tech' : 
                          key === 'serviceType' ? 'filter-service-type' : 
                          key === 'eqType' ? 'filter-eq-type' : 
                          key === 'paid' ? 'filter-paid' : '';
            const input = document.getElementById(inputId) as any;
            if (input) input.value = '';
            changePage(0);
        });
        container.appendChild(chip);
    };

    if (State.filters.global) addChip('global', 'Búsqueda', State.filters.global);
    if (State.filters.dateStart) addChip('dateStart', 'Desde', State.filters.dateStart);
    if (State.filters.dateEnd) addChip('dateEnd', 'Hasta', State.filters.dateEnd);
    if (State.filters.cityId) {
        const city = State.cities.find(c => c.id === State.filters.cityId);
        addChip('cityId', 'Ciudad', city ? city.name : 'N/A');
    }
    
    if (State.filters.companyId && Array.isArray(State.filters.companyId) && State.filters.companyId.length > 0) {
        addChip('companyId', 'Empresas', `${State.filters.companyId.length} seleccionadas`);
    }
    
    if (State.filters.techId) {
        const tech = State.users.find(u => u.id === State.filters.techId);
        addChip('techId', 'Técnico', tech ? (tech.name || tech.username) : 'N/A');
    }

    if (State.filters.serviceType) addChip('serviceType', 'Servicio', State.filters.serviceType);
    if (State.filters.eqType) addChip('eqType', 'Equipo', State.filters.eqType);
    if (State.filters.paid !== '') addChip('paid', 'Pago', State.filters.paid === 'true' ? 'Pagados' : 'Pendientes');
}

function renderSelectedCompaniesChips() {
    const list = document.getElementById('selected-companies-list');
    if (!list) return;
    list.innerHTML = '';
    
    const selectedIds = State.filters.companyId as string[];
    selectedIds.forEach(id => {
        const company = State.companies.find(c => c.id === id);
        const name = company ? company.name : id;
        
        const chip = document.createElement('div');
        chip.className = 'mini-chip';
        chip.innerHTML = `
            <span>${name}</span>
            <button data-id="${id}"><i class="fas fa-times"></i></button>
        `;
        chip.querySelector('button')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const newSelection = selectedIds.filter(val => val !== id);
            State.updateFilter('companyId', newSelection);
            renderSelectedCompaniesChips();
            changePage(0);
        });
        list.appendChild(chip);
    });
}

export function renderAdminReportsTable() {
    const tbody = document.querySelector('#reports-table tbody') as HTMLElement;
    if (!tbody) return;
    State.applyFilters();
    renderActiveFilterChips();

    const reportsToRender = State.filteredReports;
    const resultsCountEl = document.getElementById('results-count');
    if (resultsCountEl) {
        const start = (State.currentPage * State.itemsPerPage) + 1;
        const end = Math.min((State.currentPage + 1) * State.itemsPerPage, State.totalReportsCount);
        resultsCountEl.textContent = State.totalReportsCount > 0 
            ? `Mostrando ${start}-${end} de ${State.totalReportsCount} reportes`
            : 'No se encontraron reportes';
    }
    tbody.innerHTML = reportsToRender.length === 0 
        ? '<tr><td colspan="7" style="text-align:center; padding: 40px; color: var(--text-dim);">No hay reportes disponibles.</td></tr>'
        : reportsToRender.map(r => {
            const client = r.equipmentSnapshot.category === 'residencial' ? r.equipmentSnapshot.client_name : r.equipmentSnapshot.companyName;
            return `
                <tr>
                    <td data-label="Fecha">${formatDate(r.timestamp, false)}</td>
                    <td data-label="Empresa / Cliente"><strong>${client || 'N/A'}</strong></td>
                    <td data-label="Servicio">${r.serviceType || 'N/A'}</td>
                    <td data-label="Equipo">${r.equipmentSnapshot.brand} ${r.equipmentSnapshot.model}</td>
                    <td data-label="Técnico">${r.workerName}</td>
                    <td data-label="Estado"><span class="status-badge ${r.is_paid ? 'paid' : 'pending'}">${r.is_paid ? 'Pagado' : 'Pendiente'}</span></td>
                    <td class="actions-cell">
                        <button class="btn btn-secondary btn-compact view-btn" data-id="${r.id}"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-primary btn-compact pdf-btn" data-id="${r.id}"><i class="fas fa-file-pdf"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    tbody.querySelectorAll('.view-btn').forEach(btn => btn.addEventListener('click', () => openViewReportDetailsModal((btn as HTMLElement).dataset.id!)));
    tbody.querySelectorAll('.pdf-btn').forEach(btn => btn.addEventListener('click', () => downloadPDF((btn as HTMLElement).dataset.id!)));
    renderPaginationUI();
}

function renderPaginationUI() {
    const dataView = document.querySelector('.data-view');
    if (!dataView) return;
    let paginationEl = document.getElementById('table-pagination');
    if (!paginationEl) {
        paginationEl = document.createElement('div');
        paginationEl.id = 'table-pagination';
        paginationEl.className = 'pagination-controls';
        dataView.appendChild(paginationEl);
    }
    const totalPages = Math.ceil(State.totalReportsCount / State.itemsPerPage);
    if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
    const hasNext = State.currentPage < totalPages - 1;
    const hasPrev = State.currentPage > 0;
    paginationEl.innerHTML = `
        <div class="pagination-info">Página ${State.currentPage + 1} de ${totalPages}</div>
        <div class="pagination-buttons">
            <button class="btn btn-secondary btn-compact" id="prev-page" ${!hasPrev ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Anterior</button>
            <button class="btn btn-secondary btn-compact" id="next-page" ${!hasNext ? 'disabled' : ''}>Siguiente <i class="fas fa-chevron-right"></i></button>
        </div>
    `;
    document.getElementById('prev-page')?.addEventListener('click', () => changePage(State.currentPage - 1));
    document.getElementById('next-page')?.addEventListener('click', () => changePage(State.currentPage + 1));
}

export function renderCitiesTable() {}
export function renderCompaniesTable() {}
export function renderDependenciesTable() {}
export function renderAdminEquipmentTable() {}
export function renderEmployeesTable() {}
export function renderAssignedOrdersList() {}
export function renderAdminOrdersList() {}

// --- Chat AI Implementation ---

function setupChat() {
    const aiInput = document.getElementById('ai-input') as HTMLTextAreaElement;
    const sendBtn = document.getElementById('send-ai-btn');
    const chatFlow = document.getElementById('chat-messages');
    if (!aiInput || !sendBtn || !chatFlow) return;

    const appendMessage = (text: string, role: 'user' | 'ai' | 'thinking') => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        if (role === 'thinking') { 
            msgDiv.innerHTML = `<i class="fas fa-cog fa-spin"></i> Macris AI está analizando...`; 
        } else { 
            msgDiv.textContent = text; 
        }
        chatFlow.appendChild(msgDiv);
        chatFlow.scrollTop = chatFlow.scrollHeight;
        return msgDiv;
    };

    const handleClarification = (options: string[]) => {
        const container = document.createElement('div');
        container.className = 'message ai clarification-container';
        container.style.background = 'transparent';
        container.style.border = 'none';
        container.style.padding = '0';
        container.style.alignSelf = 'flex-start';
        container.style.width = '100%';
        
        const pillsWrapper = document.createElement('div');
        pillsWrapper.className = 'clarification-pills';
        
        const selectedOptions = new Set<string>();

        // Botón "Seleccionar Todas"
        const selectAllPill = document.createElement('div');
        selectAllPill.className = 'pill select-all-pill';
        selectAllPill.innerHTML = '<i class="fas fa-check-double"></i> Seleccionar Todas';
        selectAllPill.style.borderColor = 'var(--success)';
        selectAllPill.style.color = 'var(--success)';
        
        selectAllPill.addEventListener('click', () => {
            const isAdding = selectAllPill.classList.toggle('selected');
            const allPills = pillsWrapper.querySelectorAll('.pill:not(.select-all-pill)');
            
            if (isAdding) {
                selectAllPill.style.background = 'var(--success)';
                selectAllPill.style.color = 'var(--bg-deep)';
                options.forEach(opt => {
                    selectedOptions.add(opt);
                    allPills.forEach(p => { if(p.textContent === opt) p.classList.add('selected'); });
                });
            } else {
                selectAllPill.style.background = 'transparent';
                selectAllPill.style.color = 'var(--success)';
                selectedOptions.clear();
                allPills.forEach(p => p.classList.remove('selected'));
            }
        });

        pillsWrapper.appendChild(selectAllPill);

        options.forEach(opt => {
            const pill = document.createElement('div');
            pill.className = 'pill';
            pill.textContent = opt;
            pill.addEventListener('click', () => {
                const isSelected = pill.classList.toggle('selected');
                if (isSelected) selectedOptions.add(opt);
                else {
                    selectedOptions.delete(opt);
                    selectAllPill.classList.remove('selected');
                    selectAllPill.style.background = 'transparent';
                    selectAllPill.style.color = 'var(--success)';
                }
            });
            pillsWrapper.appendChild(pill);
        });

        const applyBtn = document.createElement('button');
        applyBtn.className = 'apply-ai-btn';
        applyBtn.textContent = 'Aplicar Filtros Seleccionados';
        applyBtn.addEventListener('click', async () => {
            if (selectedOptions.size === 0) {
                showAppNotification('Selecciona al menos una sede', 'warning');
                return;
            }
            
            const filterValues: string[] = [];
            const namesArray = Array.from(selectedOptions);
            
            // Si hay muchas sedes (ej. todas las de Comfandi), usamos el término raíz para búsqueda global
            // y así capturamos el total de 73 reportes.
            const rootTerm = namesArray[0].split(' ')[0].toLowerCase().replace('confandi', 'comfandi'); 

            namesArray.forEach(name => {
                const found = (State.companies as Company[]).find(c => c.name.trim() === name.trim());
                if (found) filterValues.push(found.id);
                filterValues.push(name); 
            });

            State.updateFilters({
                companyId: filterValues,
                global: namesArray.length > 5 ? rootTerm : '' 
            });

            renderSelectedCompaniesChips();
            appendMessage(`Filtros aplicados para: ${namesArray.join(', ')}. Sincronizando resultados...`, 'user');
            
            showLoader('Recuperando reportes...');
            await changePage(0);
            hideLoader();
            container.remove();
        });

        container.appendChild(pillsWrapper);
        container.appendChild(applyBtn);
        chatFlow.appendChild(container);
        chatFlow.scrollTop = chatFlow.scrollHeight;
    };

    sendBtn.addEventListener('click', async () => {
        const textValue = aiInput.value.trim();
        if (!textValue) return;
        aiInput.value = '';
        appendMessage(textValue, 'user');
        const thinking = appendMessage('', 'thinking');
        
        try {
            const currentHistory: ChatHistoryEntry[] = State.chatHistory ? [...State.chatHistory] : [];
            const result: AiResult = await processAiRequest(textValue, currentHistory);
            thinking.remove();
            
            if (result.userMessage) appendMessage(String(result.userMessage), 'ai');
            
            const clarificationOptions = result.clarificationOptions;
            if (result.requiresClarification && clarificationOptions && Array.isArray(clarificationOptions)) {
                handleClarification(clarificationOptions);
            } else if (result.action === 'filter' && result.appliedFilters) {
                const filtersToApply: Partial<State.FilterState> = {};
                if (result.appliedFilters.companyName) {
                    const companyName = result.appliedFilters.companyName;
                    const company = (State.companies as Company[]).find(c => c.name === companyName);
                    filtersToApply.companyId = company ? [company.id, companyName] : [companyName];
                    filtersToApply.global = companyName; 
                }
                if (result.appliedFilters.dateStart) filtersToApply.dateStart = result.appliedFilters.dateStart;
                if (result.appliedFilters.dateEnd) filtersToApply.dateEnd = result.appliedFilters.dateEnd;
                
                State.updateFilters(filtersToApply);
                renderSelectedCompaniesChips();
                await changePage(0);
            } else if (result.action === 'build_dashboard' && result.dashboardConfig) {
                // Ensure we switch to dashboard view
                const btnDashboard = document.getElementById('btn-view-dashboard');
                if (btnDashboard) btnDashboard.click();

                // Apply implicitly any global filter logic if the AI inferred the user wants to filter first 
                if (result.appliedFilters) {
                    const filtersToApply: Partial<State.FilterState> = {};
                    if (result.appliedFilters.companyName) {
                        const companyName = result.appliedFilters.companyName;
                        const company = (State.companies as Company[]).find(c => c.name === companyName);
                        filtersToApply.companyId = company ? [company.id, companyName] : [companyName];
                        filtersToApply.global = companyName; 
                    }
                    if (result.appliedFilters.dateStart) filtersToApply.dateStart = result.appliedFilters.dateStart;
                    if (result.appliedFilters.dateEnd) filtersToApply.dateEnd = result.appliedFilters.dateEnd;
                    State.updateFilters(filtersToApply);
                    renderSelectedCompaniesChips();
                }

                // Handle Widget Configuration
                let currentConfig = getWidgetConfig();
                if (result.dashboardConfig.mode === 'replace') {
                    currentConfig = result.dashboardConfig.widgets; // Use only the ones generated
                } else {
                    // Append only unique ones
                    result.dashboardConfig.widgets.forEach(w => {
                        // Generate dynamic IDs to prevent collision if ID was static
                        w.id = 'w_' + Math.random().toString(36).substr(2, 9);
                        currentConfig.push(w);
                    });
                }
                setWidgetConfig(currentConfig);
                await updateDashboardData();
            }
            
            const userHistory: ChatHistoryEntry = { role: 'user', parts: [{ text: textValue }] };
            const modelHistory: ChatHistoryEntry = { role: 'model', parts: [{ text: String(result.userMessage || '') }] };
            const updatedHistory: ChatHistoryEntry[] = [...currentHistory, userHistory, modelHistory];
            State.setChatHistory(updatedHistory);

        } catch (error) { 
            thinking.remove(); 
            appendMessage("Ocurrió un error al procesar tu solicitud. Intenta con términos más sencillos.", "ai"); 
        }
    });

    aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
}

// --- Manual Filters Setup ---

function setupManualFilters() {
    const filterServiceTypeEl = document.getElementById('filter-service-type') as HTMLSelectElement;
    const filterCityEl = document.getElementById('filter-city') as HTMLSelectElement;
    const filters = [D.globalSearch, D.dateStart, D.dateEnd, filterCityEl, D.filterCompany, D.filterTech, D.filterEqType, D.filterPaid, filterServiceTypeEl];
    
    filters.forEach(el => {
        el?.addEventListener('change', () => {
            if (el === D.globalSearch) State.updateFilter('global', D.globalSearch.value);
            else if (el === D.dateStart) State.updateFilter('dateStart', D.dateStart.value);
            else if (el === D.dateEnd) State.updateFilter('dateEnd', D.dateEnd.value);
            else if (el === filterCityEl) State.updateFilter('cityId', filterCityEl.value);
            else if (el === D.filterCompany) {
                const val = D.filterCompany.value;
                if (val) {
                    const currentSelection = State.filters.companyId as string[];
                    if (!currentSelection.includes(val)) {
                        const newSelection = [...currentSelection, val];
                        State.updateFilter('companyId', newSelection);
                        renderSelectedCompaniesChips();
                    }
                    D.filterCompany.value = '';
                }
            }
            else if (el === D.filterTech) State.updateFilter('techId', D.filterTech.value);
            else if (el === filterServiceTypeEl) State.updateFilter('serviceType', filterServiceTypeEl.value);
            else if (el === D.filterEqType) State.updateFilter('eqType', D.filterEqType.value);
            else if (el === D.filterPaid) State.updateFilter('paid', D.filterPaid.value);
            changePage(0);
        });
    });

    document.getElementById('reset-filters')?.addEventListener('click', () => {
        State.resetFiltersToDefault();
        if (D.globalSearch) D.globalSearch.value = '';
        if (D.dateStart) D.dateStart.value = '';
        if (D.dateEnd) D.dateEnd.value = '';
        if (filterCityEl) filterCityEl.value = '';
        if (D.filterCompany) D.filterCompany.value = '';
        if (D.filterTech) D.filterTech.value = '';
        if (filterServiceTypeEl) filterServiceTypeEl.value = '';
        if (D.filterEqType) D.filterEqType.value = '';
        if (D.filterPaid) D.filterPaid.value = '';
        renderSelectedCompaniesChips();
        changePage(0);
    });
}

// --- Exports ---

export function setupExports() {
    D.exportExcelBtn?.addEventListener('click', () => {
        openExcelExportModal();
    });
    
    D.exportZipBtn?.addEventListener('click', handleDownloadReportsZip);
    D.exportPdfBtn?.addEventListener('click', handleDownloadReportsPdf);

    D.excelSelectAllBtn?.addEventListener('click', () => {
        const checkboxes = D.excelColumnsGrid?.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        D.excelSelectAllBtn!.innerHTML = !allChecked 
            ? '<i class="fas fa-times-circle"></i> Deseleccionar Todo'
            : '<i class="fas fa-check-double"></i> Seleccionar Todo';
    });

    D.confirmExcelExportBtn?.addEventListener('click', handleExcelExport);
}

function openExcelExportModal() {
    if (!D.excelColumnsGrid || !D.excelExportModal) return;
    if (D.excelColumnsGrid.children.length === 0) {
        EXCEL_FIELDS.forEach(field => {
            const label = document.createElement('label');
            label.className = 'column-option';
            label.innerHTML = `
                <input type="checkbox" data-key="${field.key}" checked>
                <span>${field.label}</span>
            `;
            D.excelColumnsGrid!.appendChild(label);
        });
    }
    D.excelExportModal.style.display = 'flex';
}

async function handleExcelExport() {
    const selectedKeys = Array.from(D.excelColumnsGrid!.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => (cb as HTMLInputElement).dataset.key);

    if (selectedKeys.length === 0) {
        showAppNotification('Selecciona al menos una columna.', 'warning');
        return;
    }

    showLoader('Obteniendo TODOS los datos para exportar...');

    try {
        const reportsToExport = await fetchAllReportsForExport(State.filters);
        
        if (reportsToExport.length === 0) {
            showAppNotification('No hay datos para exportar.', 'warning');
            hideLoader();
            return;
        }

        showLoader(`Generando Excel con ${reportsToExport.length} registros...`);

        const activeFields = EXCEL_FIELDS.filter(f => selectedKeys.includes(f.key));
        const data = reportsToExport.map(r => {
            const row: any = {};
            activeFields.forEach(field => {
                let value: any;
                if (field.getter) value = (field.getter as any)(r);
                else value = (r as any)[field.key];
                if (field.formatter) value = (field.formatter as any)(value);
                row[field.label] = value || 'N/A';
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reportes");
        XLSX.writeFile(wb, `Macris_Export_${new Date().getTime()}.xlsx`);
        D.excelExportModal!.style.display = 'none';
        showAppNotification('Excel generado con éxito.', 'success');
    } catch (error) {
        console.error("Excel Export Error:", error);
        showAppNotification('Error al generar el Excel.', 'error');
    } finally {
        hideLoader();
    }
}

// --- Report Details & PDF ---

async function downloadPDF(id: string) {
    const report = State.reports.find(r => r.id === id);
    if (!report) return;
    
    showLoader('Cargando imágenes y generando PDF...');
    try { 
        const details = await fetchReportDetails(id);
        const fullReport = { 
            ...report, 
            clientSignature: details.client_signature, 
            photo_internal_unit_url: details.photo_internal_unit_url,
            photo_external_unit_url: details.photo_external_unit_url 
        };

        await generateReportPDF(
            fullReport, 
            State.cities, 
            State.companies, 
            State.dependencies, 
            formatDate, 
            State.allServiceOrders
        ); 
    } catch (e) {
        console.error("PDF Generation Error:", e);
        showAppNotification('Error al cargar las imágenes del reporte', 'error');
    } finally { 
        hideLoader(); 
    }
}

function setupEditReportMode(report: Report, container: HTMLElement) {
    const isInstallation = report.serviceType === 'Montaje/Instalación';
    
    const workerOptions = State.users.filter(u => u.role === 'worker').map(w => `<option value="${w.id}" ${w.id === report.workerId ? 'selected' : ''}>${w.name || w.username}</option>`).join('');
    const currentServiceType = report.serviceType;
    const serviceTypeOptions = State.serviceTypes.map(st => `<option value="${st.name}" ${st.name === currentServiceType ? 'selected' : ''}>${st.name}</option>`).join('');
    const eqTypeOptions = State.equipmentTypes.map(et => `<option value="${et.name}" ${et.name === report.equipmentSnapshot.type ? 'selected' : ''}>${et.name}</option>`).join('');

    // Ajustar fecha para input datetime-local
    let localDateStr = '';
    try {
        const d = new Date(report.timestamp);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        localDateStr = d.toISOString().slice(0, 16);
    } catch(e) {}

    container.innerHTML = `
        <div class="report-details-container edit-mode">
            <h2 style="color: var(--primary); font-size: 1.4rem; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                Editando Reporte #${report.id.substring(0,8)}
            </h2>
            <form id="edit-report-form" style="display: flex; flex-direction: column; gap: 15px;">
                <div class="report-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Fecha y Hora</label>
                        <input type="datetime-local" class="form-control" name="timestamp" value="${localDateStr}" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Técnico</label>
                        <select class="form-control" name="worker_id" required>${workerOptions}</select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Servicio</label>
                        <select class="form-control" name="service_type" required>${serviceTypeOptions}</select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Estado de Pago</label>
                        <select class="form-control" name="is_paid">
                            <option value="true" ${report.is_paid ? 'selected' : ''}>Pagado</option>
                            <option value="false" ${!report.is_paid ? 'selected' : ''}>Pendiente</option>
                        </select>
                    </div>
                </div>

                <h3 style="font-size: 1rem; color: var(--primary); margin-top: 10px; border-bottom: 1px solid var(--border); padding-bottom: 5px;">Equipo (Snapshot)</h3>
                <div class="report-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Marca</label>
                        <input type="text" class="form-control" name="eq_brand" value="${report.equipmentSnapshot.brand || ''}" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Modelo</label>
                        <input type="text" class="form-control" name="eq_model" value="${report.equipmentSnapshot.model || ''}" required />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Tipo</label>
                        <select class="form-control" name="eq_type" required>
                            <option value="" disabled>Seleccione Tipo</option>
                            ${eqTypeOptions}
                            ${!State.equipmentTypes.some(et => et.name === report.equipmentSnapshot.type) && report.equipmentSnapshot.type ? `<option value="${report.equipmentSnapshot.type}" selected>${report.equipmentSnapshot.type} (Actual)</option>` : ''}
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Capacidad</label>
                        <input type="text" class="form-control" name="eq_capacity" value="${report.equipmentSnapshot.capacity || ''}" />
                    </div>
                </div>

                <h3 style="font-size: 1rem; color: var(--primary); margin-top: 10px; border-bottom: 1px solid var(--border); padding-bottom: 5px;">Mediciones</h3>
                <div class="report-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Presión (PSI)</label>
                        <input type="text" class="form-control" name="pressure" value="${report.pressure || ''}" />
                    </div>
                    <div class="form-group">
                        <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Amperaje (A)</label>
                        <input type="text" class="form-control" name="amperage" value="${report.amperage || ''}" />
                    </div>
                </div>

                <div class="form-group" style="margin-top: 10px;">
                    <label style="font-weight:600; font-size:0.85rem; color:var(--text-dim); margin-bottom:5px; display:block;">Observaciones</label>
                    <textarea class="form-control" name="observations" rows="4">${report.observations || ''}</textarea>
                </div>

                <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px;">
                    <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Cancelar</button>
                    <button type="submit" class="btn btn-primary" id="btn-save-edit">Guardar Cambios</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
        openViewReportDetailsModal(report.id); // Vuelve al modo vista
    });

    document.getElementById('edit-report-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const fm = new FormData(form);

        // Ajustar fecha guardada
        const dtStr = fm.get('timestamp') as string;
        let finalISODate = new Date(dtStr).toISOString();

        const updatedReportData = {
            timestamp: finalISODate,
            worker_id: fm.get('worker_id') as string,
            worker_name: State.users.find(u => u.id === fm.get('worker_id'))?.name || '',
            service_type: fm.get('service_type') as string,
            is_paid: fm.get('is_paid') === 'true',
            pressure: fm.get('pressure') as string || null,
            amperage: fm.get('amperage') as string || null,
            observations: fm.get('observations') as string || null,
            equipment_snapshot: {
                ...report.equipmentSnapshot,
                brand: fm.get('eq_brand') as string,
                model: fm.get('eq_model') as string,
                type: fm.get('eq_type') as string,
                capacity: fm.get('eq_capacity') as string || undefined,
            }
        };

        const btnSave = document.getElementById('btn-save-edit') as HTMLButtonElement;
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';

        try {
            await updateMaintenanceReport(report.id, updatedReportData);
            showAppNotification('Reporte actualizado correctamente.', 'success');
            
            const index = State.reports.findIndex(r => r.id === report.id);
            if (index !== -1) {
                State.reports[index] = {
                    ...State.reports[index],
                    timestamp: updatedReportData.timestamp,
                    workerId: updatedReportData.worker_id,
                    workerName: updatedReportData.worker_name,
                    serviceType: updatedReportData.service_type,
                    is_paid: updatedReportData.is_paid,
                    pressure: updatedReportData.pressure,
                    amperage: updatedReportData.amperage,
                    observations: updatedReportData.observations,
                    equipmentSnapshot: updatedReportData.equipment_snapshot as any
                };
            }
            renderAdminReportsTable();
            openViewReportDetailsModal(report.id);
        } catch (error) {
            console.error(error);
            showAppNotification('Error al actualizar reporte', 'error');
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar Cambios';
        }
    });
}

export async function openViewReportDetailsModal(reportId: string) {
    currentViewedReportId = reportId;
    showLoader('Cargando detalles...');
    try {
        const report = State.reports.find(r => r.id === reportId);
        if (!report) return;
        
        const details = await fetchReportDetails(reportId);
        const isInstallation = report.serviceType === 'Montaje/Instalación';
        
        const container = document.getElementById('report-details-body');
        if (!container) return;
        container.innerHTML = `
            <div class="report-details-container">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                    <h2 style="color: var(--primary); font-size: 1.4rem; margin: 0;">
                        Reporte #${report.id.substring(0,8)}
                    </h2>
                    <button class="btn btn-secondary btn-compact" id="btn-edit-report" data-id="${report.id}" style="background: var(--warning); color: white; border: none; font-weight: 600;">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </div>
                
                <div class="report-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div class="detail-item"><strong>Fecha:</strong><br>${formatDate(report.timestamp)}</div>
                    <div class="detail-item"><strong>Técnico:</strong><br>${report.workerName}</div>
                    <div class="detail-item"><strong>Servicio:</strong><br>${report.serviceType}</div>
                    <div class="detail-item"><strong>Equipo:</strong><br>${report.equipmentSnapshot.brand} ${report.equipmentSnapshot.model}</div>
                </div>

                <div style="margin-top: 25px;">
                    <h3 style="font-size: 0.9rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Observaciones</h3>
                    <p style="background: var(--bg-input); padding: 15px; border-radius: 8px; border: 1px solid var(--border); font-size: 0.9rem; line-height: 1.6;">
                        ${report.observations || 'Sin observaciones.'}
                    </p>
                </div>

                ${(isInstallation || details.photo_internal_unit_url || details.photo_external_unit_url) ? `
                    <div style="margin-top: 25px;">
                        <h3 style="font-size: 0.9rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Evidencia Fotográfica</h3>
                        <div class="detail-photos-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="photo-item">
                                <strong style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 5px;">UNIDAD INTERNA</strong>
                                ${details.photo_internal_unit_url && details.photo_internal_unit_url !== 'PENDING_PHOTO' 
                                    ? `<img src="${details.photo_internal_unit_url}" style="width: 100%; border-radius: 8px; border: 1px solid var(--border); object-fit: cover; max-height: 200px; cursor: pointer;" onclick="window.open('${details.photo_internal_unit_url}', '_blank')" />` 
                                    : `<div style="background: var(--bg-input); height: 120px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px dashed var(--danger); color: var(--danger); font-size: 0.8rem; font-weight: 600;">Pendiente</div>`}
                            </div>
                            <div class="photo-item">
                                <strong style="font-size: 0.75rem; color: var(--text-dim); display: block; margin-bottom: 5px;">UNIDAD EXTERNA</strong>
                                ${details.photo_external_unit_url && details.photo_external_unit_url !== 'PENDING_PHOTO' 
                                    ? `<img src="${details.photo_external_unit_url}" style="width: 100%; border-radius: 8px; border: 1px solid var(--border); object-fit: cover; max-height: 200px; cursor: pointer;" onclick="window.open('${details.photo_external_unit_url}', '_blank')" />` 
                                    : `<div style="background: var(--bg-input); height: 120px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px dashed var(--danger); color: var(--danger); font-size: 0.8rem; font-weight: 600;">Pendiente</div>`}
                            </div>
                        </div>
                    </div>
                ` : ''}

                ${details.client_signature ? `
                    <div style="margin-top: 25px;">
                        <h3 style="font-size: 0.9rem; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Firma del Cliente</h3>
                        <div style="background: white; padding: 10px; border-radius: 8px; display: inline-block;">
                            <img src="${details.client_signature}" style="max-height: 100px; display: block;" />
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        document.getElementById('btn-edit-report')?.addEventListener('click', () => {
            setupEditReportMode(report, container);
        });

        if (D.viewReportModal) D.viewReportModal.style.display = 'flex';
    } catch (error) {
        showAppNotification('Error al cargar detalles completos', 'error');
    } finally { hideLoader(); }
}

let confirmationResolver: ((val: boolean) => void) | null = null;
export async function showConfirmationModal(message: string, actionLabel: string): Promise<boolean> {
    const modal = document.getElementById('confirmation-modal');
    const msgEl = document.getElementById('confirmation-message');
    const btn = document.getElementById('confirm-action-btn');
    if (!modal || !msgEl || !btn) return false;
    msgEl.textContent = message;
    btn.textContent = actionLabel;
    modal.style.display = 'flex';
    return new Promise(resolve => { confirmationResolver = resolve; });
}

export function resolveConfirmation(val: boolean) {
    const modal = document.getElementById('confirmation-modal');
    if (modal) modal.style.display = 'none';
    if (confirmationResolver) { confirmationResolver(val); confirmationResolver = null; }
}

export function openEntityFormModal(type: EntityType, id?: string, context?: any, initialCategory?: string) {
    State.setEntityFormContext(context);
    if (D.entityIdInput) D.entityIdInput.value = id || '';
    if (D.entityForm) D.entityForm.style.display = 'flex'; 
}

export function handleCancelEntityForm() { closeEntityFormModal(); }
export function closeEntityFormModal() { if (D.entityForm) D.entityForm.style.display = 'none'; }
export function closeRedeemPointsModal() { if (D.redeemPointsModal) D.redeemPointsModal.style.display = 'none'; }
export function closeEditReportAssignmentModal() { if (D.editReportAssignmentModal) D.editReportAssignmentModal.style.display = 'none'; }
export function closeAiReconciliationModal() { if (D.aiReconciliationModal) D.aiReconciliationModal.style.display = 'none'; }
export function closeCategorySelectionModal() { if (D.categorySelectionModal) D.categorySelectionModal.style.display = 'none'; }
export function closeEquipmentSelectionModal() { if (D.equipmentSelectionModal) D.equipmentSelectionModal.style.display = 'none'; }
export function closeSignatureModal() { if (D.signatureModal) D.signatureModal.style.display = 'none'; }
export function closePlateScanModal() { if (D.plateScanModal) D.plateScanModal.style.display = 'none'; }
export function closePhotoCaptureModal() { if (D.photoCaptureModal) D.photoCaptureModal.style.display = 'none'; }

export function toggleAssignmentFields() {}
export function handleAssignmentCompanyChange() {}
export function updateLocationDropdownsFromCompany(companyId: string) {
    if (D.reportDependencySelect) {
        const filteredDependencies = State.dependencies.filter(d => d.companyId === companyId);
        populateDropdown(D.reportDependencySelect, filteredDependencies);
    }
}

export function openCategorySelectionModal(action: 'manual' | 'search') {
    State.manualReportCreationState.nextAction = action;
    if (D.categorySelectionModal) D.categorySelectionModal.style.display = 'flex';
}

export function openEquipmentSelectionModal() { if (D.equipmentSelectionModal) D.equipmentSelectionModal.style.display = 'flex'; }
export function renderEquipmentSelectionResults() {}
export function handleCreateNewEquipmentFromSelection() {}
export function handleContinueWithoutEquipment() {}
export function handleEquipmentSelection(equipment: Equipment) {}

export function toggleReportFormFields(serviceType: string) {}
export function updateSaveReportButtonState() {}

export function openSignatureModal(reportId?: string) { if (D.signatureModal) D.signatureModal.style.display = 'flex'; }
export function openPlateScanModal(context: string) { if (D.plateScanModal) D.plateScanModal.style.display = 'flex'; }
export function handlePlatePictureTaken() {}
export function openPhotoCaptureModal(type: 'internal' | 'external') { if (D.photoCaptureModal) D.photoCaptureModal.style.display = 'flex'; }
export function handlePhotoCaptured() {}
export function openOrderDetailsModal(orderId: string) { if (D.orderDetailsModal) D.orderDetailsModal.style.display = 'none'; }

export async function handleDownloadReportsPdf() {
    showLoader('Obteniendo TODOS los reportes filtrados...');

    try {
        const reportsToExport = await fetchAllReportsForExport(State.filters);

        if (reportsToExport.length === 0) {
            showAppNotification('No hay reportes para exportar con los filtros actuales.', 'warning');
            return;
        }

        if (reportsToExport.length > 50) {
            const confirmed = await showConfirmationModal(
                `Estás por generar un PDF con ${reportsToExport.length} reportes. Este proceso puede tardar un momento dependiendo de tu conexión. ¿Deseas continuar?`,
                'Generar PDF'
            );
            if (!confirmed) return;
        }

        const fullReports: Report[] = [];
        for (let i = 0; i < reportsToExport.length; i++) {
            const report = reportsToExport[i];
            showLoader(`Procesando reporte ${i + 1} de ${reportsToExport.length}...`);
            const details = await fetchReportDetails(report.id);
            fullReports.push({
                ...report,
                clientSignature: details.client_signature,
                photo_internal_unit_url: details.photo_internal_unit_url,
                photo_external_unit_url: details.photo_external_unit_url
            });
        }

        showLoader('Generando PDF unificado...');
        const pdfBlob = await generateReportsPDF(
            fullReports,
            State.cities,
            State.companies,
            State.dependencies,
            formatDate,
            State.allServiceOrders
        );

        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reportes_Macris_${new Date().getTime()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showAppNotification('PDF generado y descargado con éxito.', 'success');
    } catch (error) {
        console.error("Error generating PDF:", error);
        showAppNotification('Ocurrió un error al intentar generar el PDF.', 'error');
    } finally {
        hideLoader();
    }
}

export async function handleDownloadReportsZip() {
    showLoader('Obteniendo TODOS los reportes filtrados...');
    
    const reportsToExport = await fetchAllReportsForExport(State.filters);
    
    if (reportsToExport.length === 0) {
        showAppNotification('No hay reportes para exportar con los filtros actuales.', 'warning');
        hideLoader();
        return;
    }

    if (reportsToExport.length > 50) {
        const confirmed = await showConfirmationModal(`Estás por generar ${reportsToExport.length} PDFs. Este proceso puede tardar un momento dependiendo de tu conexión. ¿Deseas continuar?`, 'Generar ZIP');
        if (!confirmed) { hideLoader(); return; }
    }

    showLoader(`Generando archivo ZIP... (0/${reportsToExport.length} reportes)`);
    
    try {
        const zip = new JSZip();
        const folder = zip.folder("Reportes_Mantenimiento_Macris");

        for (let i = 0; i < reportsToExport.length; i++) {
            const report = reportsToExport[i];
            showLoader(`Procesando reporte ${i + 1} de ${reportsToExport.length}...`);
            const details = await fetchReportDetails(report.id);
            const fullReport = { 
                ...report, 
                clientSignature: details.client_signature, 
                photo_internal_unit_url: details.photo_internal_unit_url,
                photo_external_unit_url: details.photo_external_unit_url 
            };

            const pdfBlob = await generateReportPDF(
                fullReport, State.cities, State.companies, State.dependencies, formatDate, State.allServiceOrders, 'blob'
            ) as Blob;

            const clientName = report.equipmentSnapshot.category === 'residencial' ? report.equipmentSnapshot.client_name : report.equipmentSnapshot.companyName;
            const sanitizedClientName = (clientName || 'General').replace(/[/\\?%*:|"<>]/g, '-');
            const fileName = `Reporte_${sanitizedClientName}_${report.id.substring(0, 8)}.pdf`;
            folder?.file(fileName, pdfBlob);
        }

        showLoader('Comprimiendo y preparando descarga...');
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Pack_Reportes_Macris_${new Date().getTime()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showAppNotification('ZIP generado y descargado con éxito.', 'success');
    } catch (error) {
        console.error("Error generating ZIP:", error);
        showAppNotification('Ocurrió un error al intentar generar el ZIP.', 'error');
    } finally {
        hideLoader();
    }
}

export function openRedeemPointsModal(userId: string, userName: string, currentPoints: string) {
    if (D.redeemPointsModal) {
        if (D.redeemPointsUserId) D.redeemPointsUserId.value = userId;
        D.redeemPointsModal.style.display = 'flex';
    }
}

export function renderMyReportsTable() { renderAdminReportsTable(); }
export function updateUserPointsDisplay(p: any) {}
export function populateLoginWorkerSelect() {}
export function openReportFormModal(o: any) {}
export function closeReportFormModal() {}
export function openModal(id: string) {
    const m = document.getElementById(id);
    if(m) m.style.display = 'flex';
}
export function closeModal(id: string) {
    const m = document.getElementById(id);
    if(m) m.style.display = 'none';
}

// --- Digitize Feature ---

let pendingDigitizedDataList: DigitizedReportData[] = [];

export function closeDigitizeReviewModal() {
    if (D.digitizeReviewModal) D.digitizeReviewModal.style.display = 'none';
    if (D.digitalizarInput) D.digitalizarInput.value = '';
    pendingDigitizedDataList = [];
}

export async function handleDigitizarUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    pendingDigitizedDataList = [];

    showLoader(`Procesando ${files.length} foto(s) con Macris AI...`);
    try {
        for (const file of files) {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = error => reject(error);
            });
            const results = await processImageForReport(base64, file.type);

            for (const result of results) {
                if (result.signatureBox && result.signatureBox.length === 4) {
                    try {
                        const [ymin, xmin, ymax, xmax] = result.signatureBox;
                        if (ymin >= 0 && xmin >= 0 && ymax > ymin && xmax > xmin) {
                            const img = new Image();
                            await new Promise((res, rej) => {
                                img.onload = res;
                                img.onerror = rej;
                                img.src = base64;
                            });
                            const canvas = document.createElement('canvas');
                            const cX = (xmin / 1000) * img.width;
                            const cY = (ymin / 1000) * img.height;
                            const cW = ((xmax - xmin) / 1000) * img.width;
                            const cH = ((ymax - ymin) / 1000) * img.height;
                            
                            canvas.width = cW;
                            canvas.height = cH;
                            const ctx = canvas.getContext('2d');
                            if (ctx) {
                                ctx.fillStyle = "#ffffff";
                                ctx.fillRect(0, 0, cW, cH);
                                ctx.drawImage(img, cX, cY, cW, cH, 0, 0, cW, cH);
                                result.croppedSignatureBase64 = canvas.toDataURL('image/jpeg', 0.9);
                            }
                        }
                    } catch (e) {
                        console.warn('Error al recortar la firma de la imagen:', e);
                    }
                }
                pendingDigitizedDataList.push(result);
            }
        }

        renderDigitizeReviewForm();
        if (D.digitizeReviewModal) D.digitizeReviewModal.style.display = 'flex';
    } catch (err: any) {
        showAppNotification(`Error al digitalizar: ${err.message}`, 'error');
        console.error(err);
    } finally {
        hideLoader();
    }
}

function renderDigitizeReviewForm() {
    if (!D.digitizeReviewForm) return;
    D.digitizeReviewForm.innerHTML = '';

    const total = pendingDigitizedDataList.length;
    let currentSlide = 0;

    if (total > 1) {
        const carouselHeader = `
            <style>
                @keyframes pageTurnNext {
                    0% { transform: perspective(1000px) rotateY(15deg) translateX(30px) scale(0.95); opacity: 0; }
                    100% { transform: perspective(1000px) rotateY(0deg) translateX(0) scale(1); opacity: 1; }
                }
                @keyframes pageTurnPrev {
                    0% { transform: perspective(1000px) rotateY(-15deg) translateX(-30px) scale(0.95); opacity: 0; }
                    100% { transform: perspective(1000px) rotateY(0deg) translateX(0) scale(1); opacity: 1; }
                }
                .page-turn-next { animation: pageTurnNext 0.35s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; }
                .page-turn-prev { animation: pageTurnPrev 0.35s cubic-bezier(0.25, 0.8, 0.25, 1) forwards; }
            </style>
            <div style="position: sticky; top: -1px; z-index: 20; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: var(--bg-deep); padding: 10px; border-radius: 8px; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
                <button type="button" class="btn btn-secondary btn-compact" id="dig-prev-btn" disabled><i class="fas fa-arrow-left"></i> Anterior</button>
                <span style="font-weight: 600; color: var(--text-light);" id="dig-counter">Reporte 1 de ${total}</span>
                <button type="button" class="btn btn-secondary btn-compact" id="dig-next-btn">Siguiente <i class="fas fa-arrow-right"></i></button>
            </div>
        `;
        D.digitizeReviewForm.insertAdjacentHTML('beforeend', carouselHeader);
    }

    pendingDigitizedDataList.forEach((data, index) => {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        const localTimestamp = now.toISOString().slice(0, 16);

        const displayStyle = index === 0 ? 'block' : 'none';

        const itemHtml = `
            <div class="digitize-review-item dig-slide" id="dig-slide-${index}" style="display: ${displayStyle}; border: 1px solid var(--border); padding: 20px; border-radius: 12px; background: var(--bg-deep); margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <div style="margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
                    <h4 style="color: var(--secondary); margin: 0;">Detalles del Reporte</h4>
                </div>
                <div id="digitize-report-content-${index}" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Fecha y Hora</label>
                        <input type="datetime-local" class="input dark" id="dig-timestamp-${index}" value="${localTimestamp}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Técnico</label>
                        <input type="text" class="input dark" id="dig-worker-${index}" value="${data.workerName}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Empresa</label>
                        <input type="text" class="input dark" id="dig-company-${index}" value="${data.companyName}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Sede/Dependencia</label>
                        <input type="text" class="input dark" id="dig-dependency-${index}" value="${data.dependency}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Ciudad</label>
                        <input type="text" class="input dark" id="dig-city-${index}" value="${data.city}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Servicio</label>
                        <input type="text" class="input dark" id="dig-service-${index}" value="${data.serviceType}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Marca Eq.</label>
                        <input type="text" class="input dark" id="dig-brand-${index}" value="${data.equipmentBrand}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Modelo Eq.</label>
                        <input type="text" class="input dark" id="dig-model-${index}" value="${data.equipmentModel}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Tipo Eq.</label>
                        <input type="text" class="input dark" id="dig-type-${index}" value="${data.equipmentType}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Capacidad</label>
                        <input type="text" class="input dark" id="dig-capacity-${index}" value="${data.capacity}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Presión</label>
                        <input type="text" class="input dark" id="dig-pressure-${index}" value="${data.pressure}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Amperaje</label>
                        <input type="text" class="input dark" id="dig-amperaje-${index}" value="${data.amperage}" style="width: 100%; box-sizing: border-box;" />
                    </div>
                    <div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: var(--text-muted);">Observaciones</label>
                        <textarea class="input dark" id="dig-obs-${index}" rows="2" style="width: 100%; box-sizing: border-box; resize: vertical;">${data.observations}</textarea>
                    </div>
                </div>
            </div>
        `;
        D.digitizeReviewForm?.insertAdjacentHTML('beforeend', itemHtml);
    });

    if (total > 1) {
        const prevBtn = document.getElementById('dig-prev-btn') as HTMLButtonElement;
        const nextBtn = document.getElementById('dig-next-btn') as HTMLButtonElement;
        const counter = document.getElementById('dig-counter');

        const updateSlider = (direction: 'next' | 'prev' | 'none') => {
            document.querySelectorAll('.dig-slide').forEach((slide, idx) => {
                const el = slide as HTMLElement;
                if (idx === currentSlide) {
                    el.style.display = 'block';
                    el.classList.remove('page-turn-next', 'page-turn-prev');
                    // Forzar reflujo para reiniciar la animación
                    void el.offsetWidth;
                    if (direction === 'next') el.classList.add('page-turn-next');
                    if (direction === 'prev') el.classList.add('page-turn-prev');
                } else {
                    el.style.display = 'none';
                }
            });
            if (counter) counter.innerText = `Reporte ${currentSlide + 1} de ${total}`;
            if (prevBtn) prevBtn.disabled = currentSlide === 0;
            if (nextBtn) nextBtn.disabled = currentSlide === total - 1;
        };

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentSlide > 0) {
                    currentSlide--;
                    updateSlider('prev');
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentSlide < total - 1) {
                    currentSlide++;
                    updateSlider('next');
                }
            });
        }
    }
}

export async function handleDigitizeSave() {
    showLoader('Guardando reportes digitalizados...');
    try {
        for (let i = 0; i < pendingDigitizedDataList.length; i++) {
            const timestampValue = (document.getElementById(`dig-timestamp-${i}`) as HTMLInputElement)?.value || '';
            const workerName = (document.getElementById(`dig-worker-${i}`) as HTMLInputElement)?.value || '';
            const companyName = (document.getElementById(`dig-company-${i}`) as HTMLInputElement)?.value || '';
            const dependencyName = (document.getElementById(`dig-dependency-${i}`) as HTMLInputElement)?.value || '';
            const cityValue = (document.getElementById(`dig-city-${i}`) as HTMLInputElement)?.value || '';
            const serviceType = (document.getElementById(`dig-service-${i}`) as HTMLInputElement)?.value || '';
            const brand = (document.getElementById(`dig-brand-${i}`) as HTMLInputElement)?.value || '';
            const model = (document.getElementById(`dig-model-${i}`) as HTMLInputElement)?.value || '';
            const typeValue = (document.getElementById(`dig-type-${i}`) as HTMLInputElement)?.value || '';
            const capacity = (document.getElementById(`dig-capacity-${i}`) as HTMLInputElement)?.value || '';
            const pressure = (document.getElementById(`dig-pressure-${i}`) as HTMLInputElement)?.value || '';
            const amperage = (document.getElementById(`dig-amperage-${i}`) as HTMLInputElement)?.value || '';
            const obs = (document.getElementById(`dig-obs-${i}`) as HTMLTextAreaElement)?.value || '';

            let companyId = null;
            let cityId = null;
            
            const matchedCompany = State.companies.find(c => c.name.toLowerCase().trim() === companyName.toLowerCase().trim());
            if (matchedCompany) companyId = matchedCompany.id;
            
            const matchedCity = State.cities.find(c => c.name.toLowerCase().trim() === cityValue.toLowerCase().trim());
            if (matchedCity) cityId = matchedCity.id;

            const equipmentSnapshot = {
                category: 'empresa',
                companyName: companyName,
                dependencyName: dependencyName !== 'N/A' ? dependencyName : 'General',
                brand: brand !== 'N/A' ? brand : 'Desconocida',
                model: model !== 'N/A' ? model : 'Desconocido',
                type: typeValue !== 'N/A' ? typeValue : 'Desconocido',
                capacity: capacity !== 'N/A' ? capacity : '',
            };

            const matchedWorker = State.users.find(u => u.name?.toLowerCase().trim() === workerName.toLowerCase().trim());
            const finalWorkerId = matchedWorker ? matchedWorker.id : State.currentUser?.id;
            const finalWorkerName = matchedWorker ? matchedWorker.name : (workerName !== 'N/A' ? workerName : State.currentUser?.name);

            const dataObj = pendingDigitizedDataList[i];
            
            const reportData = {
                timestamp: timestampValue ? new Date(timestampValue).toISOString() : new Date().toISOString(),
                service_type: serviceType !== 'N/A' ? serviceType : 'Mantenimiento Preventivo',
                observations: obs !== 'N/A' ? obs : '',
                equipment_snapshot: equipmentSnapshot,
                company_id: companyId || null,
                city_id: cityId || null,
                dependency_id: null,
                order_id: null,
                worker_id: finalWorkerId || '',
                worker_name: finalWorkerName || '',
                pressure: pressure !== 'N/A' ? pressure : '',
                amperage: amperage !== 'N/A' ? amperage : '',
                is_paid: false,
                client_signature: dataObj.croppedSignatureBase64 || null
            };

            await saveMaintenanceReport(reportData);
        }

        if (State.currentUser?.role === 'admin') {
            const result = await fetchAllReports(State.currentPage, State.itemsPerPage, State.filters);
            State.setReports(result.reports, result.total);
            renderAdminReportsTable();
        } else if (State.currentUser) {
            const result = await fetchReportsForWorker(State.currentUser.id);
            State.setReports(result.reports, result.total);
            renderMyReportsTable();
        }

        showAppNotification('Reportes digitalizados con éxito.', 'success');
        closeDigitizeReviewModal();
    } catch (err: any) {
        showAppNotification(`Error al guardar: ${err.message}`, 'error');
        console.error(err);
    } finally {
        hideLoader();
    }
}

export async function handleDigitizePdf() {
    showLoader('Generando PDF(s)...');
    try {
        const mockReports: any[] = [];
        for (let i = 0; i < pendingDigitizedDataList.length; i++) {
            const timestampValue = (document.getElementById(`dig-timestamp-${i}`) as HTMLInputElement)?.value || '';
            const workerName = (document.getElementById(`dig-worker-${i}`) as HTMLInputElement)?.value || '';
            const companyName = (document.getElementById(`dig-company-${i}`) as HTMLInputElement)?.value || '';
            const dependencyName = (document.getElementById(`dig-dependency-${i}`) as HTMLInputElement)?.value || '';
            const cityValue = (document.getElementById(`dig-city-${i}`) as HTMLInputElement)?.value || '';
            const serviceType = (document.getElementById(`dig-service-${i}`) as HTMLInputElement)?.value || '';
            const brand = (document.getElementById(`dig-brand-${i}`) as HTMLInputElement)?.value || '';
            const model = (document.getElementById(`dig-model-${i}`) as HTMLInputElement)?.value || '';
            const typeValue = (document.getElementById(`dig-type-${i}`) as HTMLInputElement)?.value || '';
            const capacity = (document.getElementById(`dig-capacity-${i}`) as HTMLInputElement)?.value || '';
            const pressure = (document.getElementById(`dig-pressure-${i}`) as HTMLInputElement)?.value || '';
            const amperage = (document.getElementById(`dig-amperaje-${i}`) as HTMLInputElement)?.value || '';
            const obs = (document.getElementById(`dig-obs-${i}`) as HTMLTextAreaElement)?.value || '';

            const matchedCompany = State.companies.find(c => c.name.toLowerCase().trim() === companyName.toLowerCase().trim());
            const matchedCity = State.cities.find(c => c.name.toLowerCase().trim() === cityValue.toLowerCase().trim());
            const matchedWorker = State.users.find(u => u.name?.toLowerCase().trim() === workerName.toLowerCase().trim());
            
            const finalWorkerId = matchedWorker ? matchedWorker.id : State.currentUser?.id;
            const finalWorkerName = matchedWorker ? matchedWorker.name : (workerName !== 'N/A' ? workerName : State.currentUser?.name);

            const equipmentSnapshot = {
                category: 'empresa',
                companyName: companyName,
                brand: brand !== 'N/A' ? brand : 'Desconocida',
                model: model !== 'N/A' ? model : 'Desconocido',
                type: typeValue !== 'N/A' ? typeValue : 'Desconocido',
                capacity: capacity !== 'N/A' ? capacity : '',
                refrigerant: '',
                dependencyName: dependencyName !== 'N/A' ? dependencyName : 'General',
                manualId: 'S/N'
            };

            const dataObj = pendingDigitizedDataList[i];

            const mockReport = {
                id: `DIG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
                timestamp: timestampValue ? new Date(timestampValue).toISOString() : new Date().toISOString(),
                serviceType: serviceType !== 'N/A' ? serviceType.toLowerCase() : 'preventivo',
                observations: obs !== 'N/A' ? obs : '',
                equipmentSnapshot: equipmentSnapshot,
                companyId: matchedCompany?.id || null,
                cityId: matchedCity?.id || null,
                workerId: finalWorkerId || '',
                workerName: finalWorkerName || '',
                pressure: pressure !== 'N/A' ? pressure : '',
                amperage: amperage !== 'N/A' ? amperage : '',
                isPaid: false,
                clientSignature: dataObj.croppedSignatureBase64 || 'PENDING_SIGNATURE',
                photo_internal_unit_url: null,
                photo_external_unit_url: null,
                itemsSnapshot: []
            };
            mockReports.push(mockReport);
        }

        if (mockReports.length > 0) {
            const pdfBlob = await generateReportsPDF(mockReports as any, State.cities, State.companies, State.dependencies, formatDate, []);
            const url = URL.createObjectURL(pdfBlob);
            const newWindow = window.open(url, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                const link = document.createElement('a');
                link.href = url;
                link.download = `Reportes_Digitalizados_${new Date().getTime()}.pdf`;
                link.click();
            }
        }
    } catch (err: any) {
        showAppNotification(`Error al generar PDFs: ${err.message}`, 'error');
        console.error(err);
    } finally {
        hideLoader();
    }
}

export async function handleDigitizeExcel() {
    showLoader('Generando archivo Excel...');
    try {
        const rows = [];
        for (let i = 0; i < pendingDigitizedDataList.length; i++) {
            const timestampValue = (document.getElementById(`dig-timestamp-${i}`) as HTMLInputElement)?.value;
            const workerName = (document.getElementById(`dig-worker-${i}`) as HTMLInputElement)?.value;
            const companyName = (document.getElementById(`dig-company-${i}`) as HTMLInputElement)?.value;
            const dependencyName = (document.getElementById(`dig-dependency-${i}`) as HTMLInputElement)?.value;
            const city = (document.getElementById(`dig-city-${i}`) as HTMLInputElement)?.value;
            const serviceType = (document.getElementById(`dig-service-${i}`) as HTMLInputElement)?.value;
            const equipmentBrand = (document.getElementById(`dig-brand-${i}`) as HTMLInputElement)?.value;
            const equipmentModel = (document.getElementById(`dig-model-${i}`) as HTMLInputElement)?.value;
            const equipmentType = (document.getElementById(`dig-type-${i}`) as HTMLInputElement)?.value;
            const capacity = (document.getElementById(`dig-capacity-${i}`) as HTMLInputElement)?.value;
            const pressure = (document.getElementById(`dig-pressure-${i}`) as HTMLInputElement)?.value;
            const amperage = (document.getElementById(`dig-amperaje-${i}`) as HTMLInputElement)?.value;
            const obs = (document.getElementById(`dig-obs-${i}`) as HTMLTextAreaElement)?.value;

            // Enriquecer la previsualización del equipo
            const equipmentSnapshot = {
                type: equipmentType !== 'N/A' ? equipmentType : 'Desconocido',
                brand: equipmentBrand !== 'N/A' ? equipmentBrand : 'Sin marca',
                model: equipmentModel !== 'N/A' ? equipmentModel : 'N/A',
                capacity: capacity !== 'N/A' ? capacity : '',
                dependencyName: dependencyName !== 'N/A' ? dependencyName : 'General',
                manualId: 'S/N'
            };

            const dataObj = pendingDigitizedDataList[i];

            rows.push({
                "ID Temp": `DIG-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
                "Fecha y Hora": timestampValue ? new Date(timestampValue).toLocaleString() : new Date().toLocaleString(),
                "Tipo de Servicio": serviceType !== 'N/A' ? serviceType : 'Mantenimiento Preventivo',
                "Técnico": workerName || 'No detectado',
                "Empresa/Cliente": companyName || 'No detectado',
                "Sede/Dependencia": dependencyName || 'General',
                "Ciudad": city || 'No detectado',
                "Equipo (Tipo)": equipmentSnapshot.type,
                "Equipo (Marca)": equipmentSnapshot.brand,
                "Equipo (Modelo)": equipmentSnapshot.model,
                "Capacidad": equipmentSnapshot.capacity,
                "Presión": pressure !== 'N/A' ? pressure : '',
                "Amperaje": amperage !== 'N/A' ? amperage : '',
                "Firma": dataObj.croppedSignatureBase64 ? 'SI' : 'NO',
                "Observaciones": obs !== 'N/A' ? obs : ''
            });
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reportes_Digitalizados");
        XLSX.writeFile(wb, `Digitalizados_${new Date().getTime()}.xlsx`);
        
        showAppNotification('Excel descargado correctamente.', 'success');
    } catch (err: any) {
        showAppNotification(`Error al generar Excel: ${err.message}`, 'error');
        console.error(err);
    } finally {
        hideLoader();
    }
}
