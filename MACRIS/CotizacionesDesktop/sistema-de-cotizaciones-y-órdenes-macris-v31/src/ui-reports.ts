import * as DOM from './dom';
import { fetchReportsBatch, fetchAllExportableReports, fetchReportsByIds, fetchCities, fetchCompanies, fetchDependencies, fetchReportTechnicians, SUPABASE_REPORT_BATCH, updateReportPaymentStatus, deleteReport, updateFullReport } from './api-reports';
import { generateZipExport, generateExcelExport, generateMergedPdfExport, getMergedPdfBlob } from './exporter';
import { generateReportPDF } from './pdf-reports';
import type { Report, City, Company, Dependency } from './reports-types';
import { supabaseOrders } from './supabase';
import * as UI from './ui';
import { isDesktopRuntime } from './runtime';

let currentReports: Report[] = [];
let currentPage = 1;
let pageSize = 10;
let totalRecords = 0;
let highlightedReportIds: Set<string> = new Set();
let selectionModeEnabled = false;
let selectedReportIds: Set<string> = new Set();
let selectedReportsCache: Map<string, Report> = new Map();

// Reference Data
let cachedCities: City[] = [];
let cachedCompanies: Company[] = [];
let cachedDependencies: Dependency[] = [];
let cachedTechnicians: string[] = [];

function renderReportsUnavailableState(message: string) {
    currentReports = [];
    totalRecords = 0;
    DOM.reportsTbody.innerHTML = `<tr><td colspan="${selectionModeEnabled ? 10 : 9}" style="text-align: center;">${escapeHtml(message)}</td></tr>`;
    if (DOM.reportsTotalCount) DOM.reportsTotalCount.textContent = '0';
    if (DOM.reportsPageInfo) DOM.reportsPageInfo.textContent = 'Página 1 de 1';
    updateSelectionCountLabel();
    updateSelectAllVisibleState();
    DOM.reportsLoadingIndicator.style.display = 'none';
    DOM.reportsFirstPageBtn.disabled = true;
    DOM.reportsPrevPageBtn.disabled = true;
    DOM.reportsNextPageBtn.disabled = true;
    DOM.reportsLastPageBtn.disabled = true;
}

function setFilterActiveState(control: HTMLInputElement | HTMLSelectElement) {
    const hasValue = control.value.trim() !== '';
    control.classList.toggle('is-active-filter', hasValue);
    control.closest('.reports-filter')?.classList.toggle('has-active-filter', hasValue);
}

function refreshReportsFilterActiveState() {
    [
        DOM.reportsSearchInput,
        DOM.reportsDateFrom,
        DOM.reportsDateTo,
        DOM.reportsServiceTypeFilter,
        DOM.reportsTechFilter,
        DOM.reportsCityFilter
    ].forEach(setFilterActiveState);
}

function populateSelectOptions(select: HTMLSelectElement, options: Array<{ value: string; label: string }>, defaultLabel: string) {
    const previousValue = select.value;
    select.innerHTML = `<option value="">${defaultLabel}</option>${options.map(option => (
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
    )).join('')}`;

    if (previousValue && options.some(option => option.value === previousValue)) {
        select.value = previousValue;
    } else {
        select.value = '';
    }
}

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char] || char));
}

function getReportServiceTypeColor(type: string | undefined): string {
    if (!type) return 'var(--color-text-secondary)';
    const lowerType = type.toLowerCase();

    if (lowerType.includes('preventivo')) return '#007bff';
    if (lowerType.includes('montaje') || lowerType.includes('instalación') || lowerType.includes('instalacion')) return '#fd7e14';
    if (lowerType.includes('correctivo')) return '#dc3545';
    if (lowerType.includes('desmonte')) return '#6f42c1';
    if (lowerType.includes('mano de obra')) return '#20c997';
    return 'var(--color-accent-primary)';
}

function renderReportServiceType(serviceType: string | null | undefined): string {
    const serviceTypes = (serviceType || '').split(' • ').map(type => type.trim()).filter(Boolean);
    if (serviceTypes.length === 0) return '<span class="report-service-type-empty">N/A</span>';

    return serviceTypes.map(type => (
        `<span class="report-service-type-text" style="color: ${getReportServiceTypeColor(type)};">${escapeHtml(type)}</span>`
    )).join('<span class="report-service-type-separator"> • </span>');
}

function normalizeObservationText(value: string | null | undefined): string {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function reportObservationsNeedAlert(observations: string | null | undefined): boolean {
    const text = normalizeObservationText(observations);
    if (!text) return false;

    const ignorePatterns = [
        /\bno presenta(?:\s+\w+){0,3}\s+(?:danos?|fugas?|fallas?|defectos?)\b/,
        /\bsin fugas?\b/,
        /\bsin danos?\b/,
        /\bsin fallas?\b/,
        /\bno presenta(?:\s+\w+){0,3}\s+(?:falla|fallo)\b/,
        /\bno se evidencia(?:\s+\w+){0,3}\s+(?:dano|danos|fuga|fugas|falla|fallas)\b/,
        /\bno requiere(?:\s+\w+){0,2}\s+(?:reparacion|arreglo|correccion)\b/,
        /\ben buen estado\b/,
        /\boperando normal(?:mente)?\b/,
        /\bfuncionando normal(?:mente)?\b/,
        /\btrabajando normal(?:mente)?\b/,
    ];

    if (ignorePatterns.some(pattern => pattern.test(text))) {
        return false;
    }

    const directAlertPatterns = [
        /\bdanos?\b/,
        /\bdanad[oa]s?\b/,
        /\bdefectuos[oa]s?\b/,
        /\bfallas?\b/,
        /\bfall[oa]\b/,
        /\bfugas?\b/,
        /\bfalta\s+(?:de\s+)?(?:gas|refrigerante)\b/,
        /\bsin\s+(?:gas|refrigerante)\b/,
        /\bperdida\s+de\s+(?:gas|refrigerante)\b/,
        /\bpierde\s+(?:gas|refrigerante)\b/,
        /\bescape\s+de\s+(?:gas|refrigerante)\b/,
        /\bproblema(?:s)?\b/,
        /\bmal\s+estado\b/,
        /\bno\s+(?:funciona|opera|enciende|arranca|enfria|trabaja)\b/,
        /\bdejo\s+de\s+(?:funcionar|enfriar|operar)\b/,
        /\bpresenta\s+(?:dano|danos|falla|fallas|fuga|fugas|defecto|defectos)\b/,
        /\bse\s+encuentra\s+(?:danad[oa]|defectuos[oa]|averiad[oa])\b/,
        /\barreglar\b/,
        /\barreglo\b/,
        /\brepar(?:ar|acion|aciones|ado|ada)\b/,
        /\baveri(?:a|ado|ada)\b/,
        /\brequiere\s+(?:revision|reparacion|arreglo|correccion)\b/,
        /\bcorreccion\s+de\s+(?:gas|fuga|flares?)\b/,
        /\brecarga(?:\s+\w+){0,3}\s+(?:de\s+)?(?:gas|refrigerante)\b/,
    ];

    if (directAlertPatterns.some(pattern => pattern.test(text))) {
        return true;
    }

    const correctiveActionPatterns = [
        /\bcorrig(?:e|io|ieron)\b/,
        /\bcorreccion\b/,
        /\brepar(?:ar|acion|aciones|ado|ada)\b/,
        /\barreglar\b/,
        /\barreglo\b/,
        /\brecarga\b/,
        /\brecargo\b/,
        /\breemplaz(?:o|a|ado|ada)\b/,
        /\bcambio\s+de\b/,
        /\bajuste\b/,
    ];

    const correctiveTargetPatterns = [
        /\bgas\b/,
        /\brefrigerante\b/,
        /\bfuga\b/,
        /\bflares?\b/,
        /\bcompresor\b/,
        /\bcapacitor\b/,
        /\bvalvulas?\b/,
        /\bserpentin\b/,
        /\bmotor(?:es)?\b/,
        /\btarjeta\b/,
        /\bcontactora\b/,
        /\bfiltro\s+secador\b/,
    ];

    const hasCorrectiveAction = correctiveActionPatterns.some(pattern => pattern.test(text));
    const hasCorrectiveTarget = correctiveTargetPatterns.some(pattern => pattern.test(text));

    return hasCorrectiveAction && hasCorrectiveTarget;
}

function renderReportServiceTypeCell(serviceType: string | null | undefined, observations: string | null | undefined): string {
    const showAlert = reportObservationsNeedAlert(observations);

    return `
        <span class="report-service-type-cell">
            <span class="report-service-type-content">${renderReportServiceType(serviceType)}</span>
            ${showAlert ? `
                <span class="report-observation-alert" title="Observaciones con posible novedad o corrección técnica">
                    <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                </span>
            ` : ''}
        </span>
    `;
}

function syncSelectedReportCache(reports: Report[]) {
    reports.forEach(report => selectedReportsCache.set(report.id, report));
}

function updateSelectionCountLabel() {
    if (!DOM.reportsSelectedCount) return;

    if (!selectionModeEnabled) {
        DOM.reportsSelectedCount.hidden = true;
        DOM.reportsSelectedCount.textContent = '0 seleccionados';
        return;
    }

    DOM.reportsSelectedCount.hidden = false;
    DOM.reportsSelectedCount.textContent = `${selectedReportIds.size} seleccionados`;
}

function updateSelectAllVisibleState() {
    if (!DOM.reportsSelectAllVisible) return;

    const visibleIds = currentReports.map(report => report.id);
    const selectedVisibleCount = visibleIds.filter(id => selectedReportIds.has(id)).length;

    DOM.reportsSelectAllVisible.disabled = !selectionModeEnabled || visibleIds.length === 0;
    DOM.reportsSelectAllVisible.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
    DOM.reportsSelectAllVisible.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < visibleIds.length;
}

function refreshSelectionUi() {
    const table = document.getElementById('reports-data-table');
    table?.classList.toggle('selection-mode', selectionModeEnabled);

    if (DOM.reportsSelectionHeader) {
        DOM.reportsSelectionHeader.hidden = !selectionModeEnabled;
    }

    if (DOM.reportsSelectionToggleBtn) {
        DOM.reportsSelectionToggleBtn.classList.toggle('active', selectionModeEnabled);
        DOM.reportsSelectionToggleBtn.setAttribute('aria-pressed', selectionModeEnabled ? 'true' : 'false');
        DOM.reportsSelectionToggleBtn.title = selectionModeEnabled
            ? 'Desactivar selección manual'
            : 'Activar selección manual';
    }

    updateSelectionCountLabel();
    updateSelectAllVisibleState();
}

function clearReportSelection() {
    selectedReportIds.clear();
    selectedReportsCache.clear();
    updateSelectionCountLabel();
    updateSelectAllVisibleState();
}

function toggleSelectionMode() {
    selectionModeEnabled = !selectionModeEnabled;

    if (!selectionModeEnabled) {
        clearReportSelection();
    } else {
        syncSelectedReportCache(currentReports);
    }

    refreshSelectionUi();
    renderReportRows(currentReports);
}

function setReportSelected(report: Report, shouldSelect: boolean) {
    if (shouldSelect) {
        selectedReportIds.add(report.id);
        selectedReportsCache.set(report.id, report);
    } else {
        selectedReportIds.delete(report.id);
        selectedReportsCache.delete(report.id);
    }

    updateSelectionCountLabel();
    updateSelectAllVisibleState();
}

async function resolveSelectedReportsForExport(): Promise<Report[]> {
    const selectedIds = Array.from(selectedReportIds);
    if (selectedIds.length === 0) return [];

    const missingIds = selectedIds.filter(id => !selectedReportsCache.has(id));
    if (missingIds.length > 0) {
        const recoveredReports = await fetchReportsByIds(missingIds);
        recoveredReports.forEach(report => selectedReportsCache.set(report.id, report));
    }

    return selectedIds
        .map(id => selectedReportsCache.get(id))
        .filter((report): report is Report => Boolean(report));
}

export async function initReportsUI() {
    setupEventListeners();
    try {
        await loadReferenceData();
    } catch (error) {
        if (!isDesktopRuntime()) throw error;
        console.warn('Desktop mode: reports reference data unavailable.', error);
        renderReportsUnavailableState('Reportes requiere conexión por ahora.');
    }
    refreshReportsFilterActiveState();
    // No cargamos listado al init directo, solo cuando entremos a la pestaña, o podríamos pre-cargarlo.
}

export async function onSwitchToReportsPage() {
    if (isDesktopRuntime() && !navigator.onLine) {
        renderReportsUnavailableState('Reportes requiere conexión por ahora.');
        return;
    }
    if (currentReports.length === 0) {
        await resetAndLoadReports();
    }
}

async function loadReferenceData() {
    // Para simplificar, traemos datos maestros 1 vez
    const [cities, companies, dependencies, technicians] = await Promise.all([
        fetchCities(),
        fetchCompanies(),
        fetchDependencies(),
        fetchReportTechnicians()
    ]);

    cachedCities = cities;
    cachedCompanies = companies;
    cachedDependencies = dependencies;
    cachedTechnicians = technicians;

    populateSelectOptions(
        DOM.reportsCityFilter,
        cachedCities
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map(city => ({ value: city.id, label: city.name })),
        'Todas'
    );
    populateSelectOptions(
        DOM.reportsTechFilter,
        cachedTechnicians.map(name => ({ value: name, label: name })),
        'Todos'
    );

    refreshReportsFilterActiveState();
}

function setupEventListeners() {
    DOM.reportsSelectionToggleBtn.addEventListener('click', () => {
        toggleSelectionMode();
    });

    DOM.reportsSearchInput.addEventListener('input', debounce(async () => {
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
    }, 500));

    DOM.reportsRefreshBtn.addEventListener('click', async () => {
        const icon = DOM.reportsRefreshBtn.querySelector('i');
        if (icon) icon.classList.add('fa-spin');
        DOM.reportsRefreshBtn.disabled = true;
        
        await resetAndLoadReports(true);
        
        if (icon) icon.classList.remove('fa-spin');
        DOM.reportsRefreshBtn.disabled = false;
    });

    DOM.reportsDateFrom.addEventListener('change', async () => {
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
    });

    DOM.reportsDateTo.addEventListener('change', async () => {
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
    });

    DOM.reportsServiceTypeFilter.addEventListener('change', async () => {
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
    });

    DOM.reportsTechFilter.addEventListener('change', async () => {
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
    });

    DOM.reportsCityFilter.addEventListener('change', async () => {
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
    });

    DOM.reportsClearFiltersBtn.addEventListener('click', async () => {
        DOM.reportsSearchInput.value = '';
        DOM.reportsDateFrom.value = '';
        DOM.reportsDateTo.value = '';
        DOM.reportsServiceTypeFilter.value = '';
        DOM.reportsTechFilter.value = '';
        DOM.reportsCityFilter.value = '';
        refreshReportsFilterActiveState();
        await resetAndLoadReports();
        DOM.reportsSearchInput.focus();
    });

    DOM.reportsPageSize.addEventListener('change', async (e) => {
        pageSize = parseInt((e.target as HTMLSelectElement).value, 10);
        await resetAndLoadReports();
    });

    DOM.reportsFirstPageBtn.addEventListener('click', async () => {
        if (currentPage > 1) await loadPage(1);
    });

    DOM.reportsPrevPageBtn.addEventListener('click', async () => {
        if (currentPage > 1) await loadPage(currentPage - 1);
    });

    DOM.reportsNextPageBtn.addEventListener('click', async () => {
        const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
        if (currentPage < totalPages) await loadPage(currentPage + 1);
    });

    DOM.reportsLastPageBtn.addEventListener('click', async () => {
        const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
        if (currentPage < totalPages) await loadPage(totalPages);
    });

    DOM.reportsSelectAllVisible.addEventListener('change', () => {
        if (!selectionModeEnabled) return;

        const shouldSelectVisible = DOM.reportsSelectAllVisible.checked;
        currentReports.forEach(report => {
            if (shouldSelectVisible) {
                selectedReportIds.add(report.id);
                selectedReportsCache.set(report.id, report);
            } else {
                selectedReportIds.delete(report.id);
                selectedReportsCache.delete(report.id);
            }
        });

        updateSelectionCountLabel();
        updateSelectAllVisibleState();
        renderReportRows(currentReports);
    });

    // Delegación para botones de PDF individuales
    DOM.reportsTbody.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const checkbox = target.closest('.report-select-checkbox') as HTMLInputElement | null;
        if (checkbox) {
            const reportId = checkbox.getAttribute('data-id');
            const report = currentReports.find(r => r.id === reportId);
            if (report) {
                setReportSelected(report, checkbox.checked);
                const row = checkbox.closest('tr[data-report-id]');
                row?.classList.toggle('report-selected-row', checkbox.checked);
            }
            return;
        }

        const btn = target.closest('.btn-download-pdf') as HTMLButtonElement;
        
        if (btn) {
            const reportId = btn.getAttribute('data-id');
            const report = currentReports.find(r => r.id === reportId);
            if (report) {
                const oldText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                btn.disabled = true;

                try {
                    const blob = await generateReportPDF(report, cachedCities, cachedCompanies, cachedDependencies, 'blob');
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    // En caso de querer descarga directa: saveFileLocal(blob, `...pdf`);
                } catch (error) {
                    console.error("Error generating individual PDF:", error);
                    alert("Error al generar PDF.");
                } finally {
                    btn.innerHTML = oldText;
                    btn.disabled = false;
                }
            }
        }

        // Click en la fila (no en botones de acción)
        const row = (target as HTMLElement).closest('tr[data-report-id]') as HTMLElement;
        if (row && !(target as HTMLElement).closest('.actions') && !(target as HTMLElement).closest('.reports-selection-cell')) {
            const reportId = row.getAttribute('data-report-id');
            const report = currentReports.find(r => r.id === reportId);
            if (report) showReportDetailsModal(report);
        }

        const btnTogglePaid = target.closest('.btn-toggle-paid') as HTMLButtonElement;
        if (btnTogglePaid) {
            const reportId = btnTogglePaid.getAttribute('data-id');
            const report = currentReports.find(r => r.id === reportId);
            if (report && reportId) {
                // Toggle optimistic UI
                report.is_paid = !report.is_paid;
                
                // Keep the icon inside, update styles
                const icon = btnTogglePaid.querySelector('i');
                const paidColor = report.is_paid ? '#28a745' : '#ffc107';
                btnTogglePaid.style.borderColor = paidColor;
                btnTogglePaid.style.color = paidColor;
                btnTogglePaid.title = report.is_paid ? 'Marcar como No Pagado' : 'Marcar como Pagado';
                
                if (icon) {
                    icon.className = 'fas fa-dollar-sign'; // Just ensuring
                }

                btnTogglePaid.disabled = true;
                const success = await updateReportPaymentStatus(reportId, report.is_paid);
                btnTogglePaid.disabled = false;
                
                if (!success) {
                    // Revert UI if it failed
                    report.is_paid = !report.is_paid;
                    const fallbackColor = report.is_paid ? '#28a745' : '#ffc107';
                    btnTogglePaid.style.borderColor = fallbackColor;
                    btnTogglePaid.style.color = fallbackColor;
                    btnTogglePaid.title = report.is_paid ? 'Marcar como No Pagado' : 'Marcar como Pagado';
                    alert("Error al actualizar estado de pago");
                }
            }
        }

        const btnDelete = target.closest('.btn-delete-report') as HTMLButtonElement;
        if (btnDelete) {
            const reportId = btnDelete.getAttribute('data-id');
            if (reportId) {
                UI.showConfirmationModal('Eliminar Reporte', '¿Estás seguro de que deseas eliminar este reporte? Esta acción no se puede deshacer.', async () => {
                    try {
                        btnDelete.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                        btnDelete.disabled = true;
                        
                        const success = await deleteReport(reportId);
                        if (success) {
                            selectedReportIds.delete(reportId);
                            selectedReportsCache.delete(reportId);
                            updateSelectionCountLabel();
                            await resetAndLoadReports();
                        } else {
                            throw new Error("API returned false");
                        }
                    } catch (error) {
                        console.error("Error al eliminar el reporte:", error);
                        alert("No se pudo eliminar el reporte. Inténtalo nuevamente.");
                        btnDelete.innerHTML = '<i class="fas fa-trash-alt"></i>';
                        btnDelete.disabled = false;
                    }
                });
            }
        }
    });

    // Exporter Buttons
    DOM.reportsExportExcelBtn.addEventListener('click', async () => await handleExport('excel'));
    DOM.reportsExportZipBtn.addEventListener('click', async () => await handleExport('zip'));
    DOM.reportsExportMergedBtn.addEventListener('click', async () => await handleExport('pdf'));
    
    DOM.reportsExportWhatsappBtn.addEventListener('click', () => {
        DOM.shareOptionsModal.classList.add('active');
    });

    DOM.shareWhatsappBtn.addEventListener('click', async () => {
        DOM.shareOptionsModal.classList.remove('active');
        await handleExport('whatsapp');
    });

    DOM.shareGmailBtn.addEventListener('click', async () => {
        DOM.shareOptionsModal.classList.remove('active');
        await handleExport('gmail');
    });

    DOM.shareOutlookBtn.addEventListener('click', async () => {
        DOM.shareOptionsModal.classList.remove('active');
        await handleExport('outlook');
    });
}

async function handleExport(type: string) {
    let reportsToExport: Report[] = [];

    const searchInput = DOM.reportsSearchInput.value.trim();
    const dateFrom = DOM.reportsDateFrom.value;
    const dateTo = DOM.reportsDateTo.value;
    const serviceType = DOM.reportsServiceTypeFilter.value;
    const technicianName = DOM.reportsTechFilter.value;
    const cityId = DOM.reportsCityFilter.value;

    DOM.reportsExportExcelBtn.disabled = true;
    DOM.reportsExportZipBtn.disabled = true;
    DOM.reportsExportMergedBtn.disabled = true;
    DOM.reportsExportWhatsappBtn.disabled = true;

    const activeBtn = type === 'excel' ? DOM.reportsExportExcelBtn : 
                      type === 'zip' ? DOM.reportsExportZipBtn : 
                      type === 'whatsapp' ? DOM.reportsExportWhatsappBtn : DOM.reportsExportMergedBtn;
    
    const oldText = activeBtn.innerHTML;
    activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    activeBtn.disabled = true;

    try {
        if (selectionModeEnabled) {
            if (selectedReportIds.size === 0) {
                UI.showNotification('Selecciona al menos un reporte o desactiva el modo selección para exportar todos.', 'warning');
                return;
            }

            reportsToExport = await resolveSelectedReportsForExport();
        } else {
            reportsToExport = await fetchAllExportableReports({ searchTerm: searchInput, dateFrom, dateTo, serviceType, technicianName, cityId });
        }

        if (reportsToExport.length === 0) {
            UI.showNotification(
                selectionModeEnabled
                    ? 'No fue posible recuperar los reportes seleccionados. Actualiza la lista e inténtalo de nuevo.'
                    : 'No se encontraron reportes con los filtros actuales.',
                'error'
            );
            return;
        }

        if (type === 'excel') {
            await generateExcelExport(reportsToExport, cachedCities);
        } else if (type === 'zip') {
            await generateZipExport(reportsToExport, cachedCities, cachedCompanies, cachedDependencies);
        } else if (type === 'pdf') {
            await generateMergedPdfExport(reportsToExport, cachedCities, cachedCompanies, cachedDependencies);
        } else if (['whatsapp', 'gmail', 'outlook'].includes(type)) {
            let blob: Blob | null = null;
            let filename = `Reporte_${new Date().toISOString().split('T')[0]}.pdf`;
            
            if (reportsToExport.length === 1) {
                blob = await generateReportPDF(reportsToExport[0], cachedCities, cachedCompanies, cachedDependencies, 'blob');
                filename = `Reporte_${reportsToExport[0].id.substring(0,8)}.pdf`;
            } else {
                blob = await getMergedPdfBlob(reportsToExport, cachedCities, cachedCompanies, cachedDependencies);
                filename = `Reportes_Unificados_${new Date().toISOString().split('T')[0]}.pdf`;
            }

            if (!blob) throw new Error("No se pudo generar el documento pdf.");

            const file = new File([blob], filename, { type: 'application/pdf' });
            
            const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

            if (type === 'whatsapp' && isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Reporte(s) de Servicio',
                    text: 'Te remito el/los reporte(s) de servicio técnico adjuntos.',
                    files: [file]
                });
            } else if (type === 'whatsapp') {
                // WhatsApp de escritorio: Subir a Supabase temporalmente y mandar link público
                const uniqueFilename = `reporte_${Date.now()}_${Math.random().toString(36).substring(2,8)}.pdf`;
                const { error: uploadError } = await supabaseOrders.storage.from('temp_reports').upload(uniqueFilename, file, { cacheControl: '3600', upsert: false });
                
                if (uploadError) {
                    throw new Error("No se pudo subir el archivo temporalmente. " + uploadError.message);
                }

                const { data: { publicUrl } } = supabaseOrders.storage.from('temp_reports').getPublicUrl(uniqueFilename);

                const msgText = encodeURIComponent(`Hola, envío el/los reporte(s) de servicio.\n\nPuedes visualizar y descargar el archivo aquí (Expira en 24h):\n${publicUrl}`);
                window.open(`https://wa.me/?text=${msgText}`, '_blank');
            } else {
                // Flujo estándar para correos (descarga directa)
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                    
                    const msgText = encodeURIComponent('Adjunto el/los reporte(s) de servicio técnico correspondientes.');
                    const subject = encodeURIComponent(`Reportes de Servicio Macris - ${new Date().toLocaleDateString()}`);

                    if (type === 'gmail') {
                        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${msgText}`, '_blank');
                    } else if (type === 'outlook') {
                        window.open(`https://outlook.office.com/mail/deeplink/compose?subject=${subject}&body=${msgText}`, '_blank');
                    }
                }, 100);
            }
        }
    } catch (e) {
        console.error("Procesamiento Error:", e);
        UI.showNotification(
            type === 'pdf'
                ? 'No fue posible unir los PDFs seleccionados. Intenta actualizar la lista y repetir la acción.'
                : 'Ocurrió un error durante la exportación.',
            'error'
        );
    } finally {
        DOM.reportsExportExcelBtn.disabled = false;
        DOM.reportsExportZipBtn.disabled = false;
        DOM.reportsExportMergedBtn.disabled = false;
        DOM.reportsExportWhatsappBtn.disabled = false;
        activeBtn.innerHTML = oldText;
        activeBtn.disabled = false;
    }
}

async function resetAndLoadReports(highlightNew: boolean = false) {
    if (isDesktopRuntime() && !navigator.onLine) {
        renderReportsUnavailableState('Reportes requiere conexión por ahora.');
        return;
    }
    currentPage = 1;
    await loadPage(1, highlightNew);
}

async function loadPage(page: number, highlightNew: boolean = false) {
    const prevIds = new Set(currentReports.map(r => r.id));
    currentPage = page;
    DOM.reportsLoadingIndicator.style.display = 'inline-block';
    
    DOM.reportsFirstPageBtn.disabled = true;
    DOM.reportsPrevPageBtn.disabled = true;
    DOM.reportsNextPageBtn.disabled = true;
    DOM.reportsLastPageBtn.disabled = true;

    const filters = {
        searchTerm: DOM.reportsSearchInput.value.trim(),
        dateFrom: DOM.reportsDateFrom.value,
        dateTo: DOM.reportsDateTo.value,
        serviceType: DOM.reportsServiceTypeFilter.value,
        technicianName: DOM.reportsTechFilter.value,
        cityId: DOM.reportsCityFilter.value
    };

    const offset = (currentPage - 1) * pageSize;
    try {
        const { data, count } = await fetchReportsBatch(offset, pageSize, filters);

        totalRecords = count;
        currentReports = data;
        syncSelectedReportCache(data);

        if (highlightNew && prevIds.size > 0) {
            currentReports.forEach(r => {
                if (!prevIds.has(r.id)) {
                    highlightedReportIds.add(r.id);
                    setTimeout(() => highlightedReportIds.delete(r.id), 10000);
                }
            });
        }

        DOM.reportsTbody.innerHTML = '';
        renderReportRows(data);

        if (DOM.reportsTotalCount) {
            DOM.reportsTotalCount.textContent = totalRecords.toString();
        }

        DOM.reportsLoadingIndicator.style.display = 'none';
        renderPaginationControls();
    } catch (error) {
        DOM.reportsLoadingIndicator.style.display = 'none';
        if (!isDesktopRuntime()) throw error;
        console.warn('Desktop mode: reports page load unavailable.', error);
        renderReportsUnavailableState('Reportes requiere conexión por ahora.');
    }
}

function renderPaginationControls() {
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    DOM.reportsPageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
    
    DOM.reportsFirstPageBtn.disabled = currentPage <= 1;
    DOM.reportsPrevPageBtn.disabled = currentPage <= 1;
    
    DOM.reportsNextPageBtn.disabled = currentPage >= totalPages;
    DOM.reportsLastPageBtn.disabled = currentPage >= totalPages;
}

function renderReportRows(reports: Report[]) {
    if (currentReports.length === 0 && reports.length === 0) {
        const emptyCols = selectionModeEnabled ? 10 : 9;
        DOM.reportsTbody.innerHTML = `<tr><td colspan="${emptyCols}" style="text-align: center;">No se encontraron reportes</td></tr>`;
        updateSelectAllVisibleState();
        return;
    }

    DOM.reportsTbody.innerHTML = '';
    reports.forEach(r => {
        const tr = document.createElement('tr');
        
        // Highlight slight red if missing signature
        if (!r.clientSignature) {
            tr.style.backgroundColor = 'rgba(220, 53, 69, 0.15)'; // Darker light red
        }
        
        // Green highlight for new realtime reports
        if (highlightedReportIds.has(r.id)) {
            tr.classList.add('row-new-highlight');
        }
        
        const dateStr = new Intl.DateTimeFormat('es-CO', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: true 
        }).format(new Date(r.timestamp));

        let clientOrCompany = 'N/A';
        let rawSede = 'N/A';

        if (r.equipmentSnapshot.category === 'residencial') {
            clientOrCompany = r.equipmentSnapshot.client_name || 'N/A';
            rawSede = r.equipmentSnapshot.address || 'N/A';
        } else {
            // Es Empresa
            const hasSedeName = !!r.equipmentSnapshot.sedeName;
            
            if (hasSedeName) {
                // Reporte con Jerarquía Nueva: Tiene Cliente (Padre) y Sede
                clientOrCompany = r.equipmentSnapshot.companyName || 'N/A'; // Nombre del Padre
                rawSede = r.equipmentSnapshot.sedeName || 'N/A'; // Nombre real de la Sede
            } else {
                // Reporte Antiguo (Retrocompatibilidad)
                clientOrCompany = r.equipmentSnapshot.companyName || 'N/A'; // La sede original actúa como cliente
                rawSede = 'N/A'; // Dejamos explícito que es la sede única
            }
        }

        const displayClient = clientOrCompany.length > 25 
            ? clientOrCompany.substring(0, 25) + '...' 
            : clientOrCompany;

        const paidColor = r.is_paid ? '#28a745' : '#ffc107'; 
        const isPaidBtn = `<button class="btn btn-outline btn-toggle-paid" data-id="${r.id}" title="${r.is_paid ? 'Marcar como No Pagado' : 'Marcar como Pagado'}" style="border-width: 2px; border-color: ${paidColor}; color: ${paidColor}; padding: 0.25rem 0.5rem; font-size: 0.85rem;">
            <i class="fas fa-dollar-sign"></i>
        </button>`;

        const eqBrand = r.equipmentSnapshot.brand || 'N/A';
        const eqType = r.equipmentSnapshot.type || 'N/A';
        const eqDep = r.equipmentSnapshot.dependencyName || 'N/A';
        
        const displaySede = rawSede.length > 20 ? rawSede.substring(0, 20) + '...' : rawSede;
        const isSelected = selectedReportIds.has(r.id);

        tr.setAttribute('data-report-id', r.id);
        tr.classList.toggle('report-selected-row', isSelected);
        tr.innerHTML = `
            ${selectionModeEnabled ? `
            <td class="reports-selection-cell">
                <label class="report-select-control" title="Seleccionar reporte">
                    <input type="checkbox" class="report-select-checkbox" data-id="${r.id}" ${isSelected ? 'checked' : ''}>
                </label>
            </td>` : ''}
            <td>${dateStr}</td>
            <td title="${clientOrCompany || ''}">${displayClient}</td>
            <td title="${rawSede}">${displaySede}</td>
            <td>${eqDep}</td>
            <td title="${escapeHtml(r.serviceType || 'N/A')}">${renderReportServiceTypeCell(r.serviceType, r.observations)}</td>
            <td>${eqBrand}</td>
            <td>${eqType}</td>
            <td>${r.workerName}</td>
            <td class="actions" style="display: flex; gap: 6px; align-items: center; justify-content: flex-start;">
                ${isPaidBtn}
                <button class="btn btn-outline btn-download-pdf" data-id="${r.id}" title="Ver PDF Local" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
                    <i class="fas fa-file-pdf" style="color: #d9534f;"></i>
                </button>
                <button class="btn btn-outline btn-delete-report" data-id="${r.id}" title="Eliminar Reporte" style="padding: 0.25rem 0.5rem; font-size: 0.85rem; border-color: #d9534f; color: #d9534f;">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        DOM.reportsTbody.appendChild(tr);
    });

    updateSelectAllVisibleState();
}


// Utils
function debounce(func: Function, wait: number) {
    let timeout: any;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function closeReportDetailsPanel() {
    document.getElementById('report-details-overlay')?.classList.remove('active');
    document.getElementById('report-details-panel')?.classList.remove('active');
}

function showReportDetailsModal(report: Report) {
    const panel = document.getElementById('report-details-panel');
    const overlay = document.getElementById('report-details-overlay');
    const body = document.getElementById('report-details-body');
    if (!panel || !overlay || !body) return;

    // Wire close handlers (replace each time to avoid duplicate listeners)
    const closeBtn = document.getElementById('report-details-close-btn');
    const newCloseBtn = closeBtn?.cloneNode(true) as HTMLElement;
    closeBtn?.parentNode?.replaceChild(newCloseBtn, closeBtn);
    newCloseBtn?.addEventListener('click', closeReportDetailsPanel);
    overlay.onclick = closeReportDetailsPanel;

    const eq = (report.equipmentSnapshot || {}) as any;
    const isRes = eq.category === 'residencial';
    
    // We will render inputs so it's fully editable
    // Insumos editable list
    let itemsHtml = `
        <div id="report-items-container">
            ${(report.itemsSnapshot || []).map((i: any, index: number) => `
                <div class="report-item-row" data-index="${index}" style="display: flex; gap: 10px; margin-bottom: 8px;">
                    <input type="number" class="input item-qty" value="${i.quantity}" style="width: 80px;" min="1">
                    <input type="text" class="input item-desc" value="${i.description}" style="flex: 1;">
                    <button class="btn btn-icon-only-modal btn-remove-item"><i class="fas fa-trash"></i></button>
                </div>
            `).join('')}
        </div>
        <button id="report-add-item-btn" class="btn btn-secondary" style="margin-top: 10px; font-size: 0.85rem;"><i class="fas fa-plus"></i> Agregar Insumo</button>
    `;

    body.innerHTML = `
        <div class="report-details-custom-card" style="margin-bottom: 12px;">
            <h4 class="report-details-custom-title"><i class="fas fa-info-circle"></i> Información General</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div class="report-details-form-row">
                    <label>Tipo Servicio</label>
                    <input type="text" id="report-edit-service-type" class="input" value="${report.serviceType || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Técnico</label>
                    <input type="text" id="report-edit-worker-name" class="input" value="${report.workerName || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Estado de Pago</label>
                    <select id="report-edit-is-paid" class="input">
                        <option value="true" ${report.is_paid ? 'selected' : ''}>Pagado</option>
                        <option value="false" ${!report.is_paid ? 'selected' : ''}>No pagado</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="report-details-custom-card" style="margin-bottom: 12px;">
            <h4 class="report-details-custom-title"><i class="fas fa-building"></i> Datos del Cliente</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div class="report-details-form-row">
                    <label>${isRes ? 'Cliente' : 'Empresa'}</label>
                    <input type="text" id="report-edit-client-name" class="input" value="${(isRes ? eq.client_name : eq.companyName) || ''}">
                </div>
                ${!isRes ? `
                <div class="report-details-form-row">
                    <label>Sede</label>
                    <input type="text" id="report-edit-sede" class="input" value="${eq.sedeName || ''}">
                </div>` : ''}
                <div class="report-details-form-row">
                    <label>Dependencia</label>
                    <input type="text" id="report-edit-dependency" class="input" value="${eq.dependencyName || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Dirección</label>
                    <input type="text" id="report-edit-address" class="input" value="${eq.address || ''}">
                </div>
            </div>
        </div>

        <div class="report-details-custom-card" style="margin-bottom: 12px;">
            <h4 class="report-details-custom-title"><i class="fas fa-tools"></i> Equipo y Mediciones</h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                <div class="report-details-form-row">
                    <label>Marca</label>
                    <input type="text" id="report-edit-brand" class="input" value="${eq.brand || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Modelo</label>
                    <input type="text" id="report-edit-model" class="input" value="${eq.model || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Tipo</label>
                    <input type="text" id="report-edit-type" class="input" value="${eq.type || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Capacidad</label>
                    <input type="text" id="report-edit-capacity" class="input" value="${eq.capacity || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Refrigerante</label>
                    <input type="text" id="report-edit-refrigerant" class="input" value="${eq.refrigerant || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Presión</label>
                    <input type="text" id="report-edit-pressure" class="input" value="${report.pressure || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Amperaje</label>
                    <input type="text" id="report-edit-amperage" class="input" value="${report.amperage || ''}">
                </div>
            </div>
        </div>

        <div class="report-details-custom-card" style="margin-bottom: 12px;">
            <h4 class="report-details-custom-title"><i class="fas fa-clipboard-list"></i> Observaciones</h4>
            <div class="report-details-form-row">
                <textarea id="report-edit-observations" class="input" rows="2" style="resize: vertical;">${report.observations || ''}</textarea>
            </div>
        </div>

        <div class="report-details-custom-card" style="margin-bottom: 12px;">
            <h4 class="report-details-custom-title"><i class="fas fa-box-open"></i> Insumos Utilizados</h4>
            ${itemsHtml}
        </div>

        ${report.photo_internal_unit_url || report.photo_external_unit_url ? `
        <div class="report-details-custom-card" style="margin-bottom: 12px;">
            <h4 class="report-details-custom-title"><i class="fas fa-camera"></i> Fotos de Instalación</h4>
            <div style="display: flex; gap: 15px; margin-top: 10px; flex-wrap: wrap;">
                ${report.photo_internal_unit_url ? `
                <div style="flex: 1; min-width: 200px; text-align: center;">
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">Unidad Interna</p>
                    <a href="${report.photo_internal_unit_url}" target="_blank">
                        <img src="${report.photo_internal_unit_url}" alt="Unidad Interna" style="max-width: 100%; border-radius: 6px; border: 1px solid var(--border-color); object-fit: contain; cursor: pointer;">
                    </a>
                </div>` : ''}
                ${report.photo_external_unit_url ? `
                <div style="flex: 1; min-width: 200px; text-align: center;">
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">Unidad Externa</p>
                    <a href="${report.photo_external_unit_url}" target="_blank">
                        <img src="${report.photo_external_unit_url}" alt="Unidad Externa" style="max-width: 100%; border-radius: 6px; border: 1px solid var(--border-color); object-fit: contain; cursor: pointer;">
                    </a>
                </div>` : ''}
            </div>
        </div>
        ` : ''}

        <div style="display: flex; gap: 15px; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border-color);">
            <button id="report-modal-back-btn" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-arrow-left"></i> Atrás
            </button>
            <button id="report-modal-download-btn" class="btn btn-secondary" style="display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-file-pdf"></i> PDF
            </button>
            <button id="report-modal-save-btn" class="btn btn-primary" style="display: flex; align-items: center; gap: 8px; font-weight: bold; flex-grow: 1; justify-content: center;">
                <i class="fas fa-save"></i> Guardar Cambios
            </button>
        </div>
    `;

    panel.classList.add('active');
    overlay.classList.add('active');

    // Setup logic for adding/removing items
    const itemsContainer = document.getElementById('report-items-container');
    const addItemBtn = document.getElementById('report-add-item-btn');
    if (itemsContainer && addItemBtn) {
        addItemBtn.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'report-item-row';
            row.style.cssText = 'display: flex; gap: 10px; margin-bottom: 8px;';
            row.innerHTML = `
                <input type="number" class="input item-qty" value="1" style="width: 80px;" min="1" placeholder="Cant">
                <input type="text" class="input item-desc" value="" style="flex: 1;" placeholder="Descripción del insumo">
                <button class="btn btn-icon-only-modal btn-remove-item"><i class="fas fa-trash"></i></button>
            `;
            itemsContainer.appendChild(row);
            
            row.querySelector('.btn-remove-item')?.addEventListener('click', () => row.remove());
        });

        itemsContainer.querySelectorAll('.btn-remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                target.closest('.report-item-row')?.remove();
            });
        });
    }

    // Back button and Save logic
    const backBtn = document.getElementById('report-modal-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', closeReportDetailsPanel);
    }

    const saveBtn = document.getElementById('report-modal-save-btn') as HTMLButtonElement;
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            saveBtn.disabled = true;

            try {
                // Gather generic fields
                report.serviceType = (document.getElementById('report-edit-service-type') as HTMLInputElement).value;
                report.workerName = (document.getElementById('report-edit-worker-name') as HTMLInputElement).value;
                report.is_paid = (document.getElementById('report-edit-is-paid') as HTMLSelectElement).value === 'true';
                report.pressure = (document.getElementById('report-edit-pressure') as HTMLInputElement).value;
                report.amperage = (document.getElementById('report-edit-amperage') as HTMLInputElement).value;
                report.observations = (document.getElementById('report-edit-observations') as HTMLTextAreaElement).value;

                // Gather equipment fields
                const newClientName = (document.getElementById('report-edit-client-name') as HTMLInputElement).value;
                if (isRes) eq.client_name = newClientName;
                else eq.companyName = newClientName;

                eq.address = (document.getElementById('report-edit-address') as HTMLInputElement).value;
                eq.dependencyName = (document.getElementById('report-edit-dependency') as HTMLInputElement).value;
                const sedeInput = document.getElementById('report-edit-sede') as HTMLInputElement | null;
                if (sedeInput) eq.sedeName = sedeInput.value;
                eq.brand = (document.getElementById('report-edit-brand') as HTMLInputElement).value;
                eq.model = (document.getElementById('report-edit-model') as HTMLInputElement).value;
                eq.type = (document.getElementById('report-edit-type') as HTMLInputElement).value;
                eq.capacity = (document.getElementById('report-edit-capacity') as HTMLInputElement).value;
                eq.refrigerant = (document.getElementById('report-edit-refrigerant') as HTMLInputElement).value;

                report.equipmentSnapshot = eq;

                // Gather items
                const newItems: any[] = [];
                itemsContainer?.querySelectorAll('.report-item-row').forEach(row => {
                    const qty = (row.querySelector('.item-qty') as HTMLInputElement).value;
                    const desc = (row.querySelector('.item-desc') as HTMLInputElement).value;
                    if (desc.trim() !== '') {
                        newItems.push({ quantity: parseFloat(qty) || 1, description: desc.trim() });
                    }
                });
                report.itemsSnapshot = newItems;

                // Save via API
                const success = await updateFullReport(report.id, {
                    service_type: report.serviceType,
                    worker_name: report.workerName,
                    is_paid: report.is_paid,
                    pressure: report.pressure,
                    amperage: report.amperage,
                    observations: report.observations,
                    equipment_snapshot: eq,
                    items_snapshot: newItems
                });

                if (success) {
                    closeReportDetailsPanel();
                    await resetAndLoadReports();
                    UI.showNotification("Reporte actualizado correctamente", "success");
                } else {
                    throw new Error("Failed to update report");
                }
            } catch (err) {
                console.error("Error saving report details:", err);
                UI.showNotification("Hubo un error al guardar", "error");
            } finally {
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
                saveBtn.disabled = false;
            }
        });
    }

    const downloadBtn = document.getElementById('report-modal-download-btn') as HTMLButtonElement;
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            downloadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
            downloadBtn.disabled = true;
            try {
                const blob = await generateReportPDF(report, cachedCities, cachedCompanies, cachedDependencies, 'blob');
                const url = URL.createObjectURL(blob);
                const file = new File([blob], `Reporte_${report.id.substring(0,8)}.pdf`, { type: 'application/pdf' });
                
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                }, 100);
            } catch (error) {
                console.error("Error generating PDF:", error);
                alert("Error al generar PDF.");
            } finally {
                downloadBtn.innerHTML = '<i class="fas fa-file-pdf"></i> PDF';
                downloadBtn.disabled = false;
            }
        });
    }

}

export async function handleRealtimeReportUpdate(newReportId?: string) {
    if (newReportId) {
        highlightedReportIds.add(newReportId);
        // Remove highlight after animation duration (10s) to prevent re-triggering randomly
        setTimeout(() => {
            highlightedReportIds.delete(newReportId);
        }, 11000); 
    }
    
    const reportsPage = document.querySelector("#page-reports");
    if (reportsPage && reportsPage.classList.contains("active")) {
        // If they are on page 1 and have no active search filters, reload softly
        const searchInput = DOM.reportsSearchInput.value.trim();
        const dateFrom = DOM.reportsDateFrom.value;
        const dateTo = DOM.reportsDateTo.value;
        
        if (currentPage === 1 && !searchInput && !dateFrom && !dateTo) {
            await resetAndLoadReports();
        }
    }
}
