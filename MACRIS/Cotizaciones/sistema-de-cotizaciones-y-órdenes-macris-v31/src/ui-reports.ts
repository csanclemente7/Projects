import * as DOM from './dom';
import { fetchReportsBatch, fetchAllExportableReports, fetchCities, fetchCompanies, fetchDependencies, SUPABASE_REPORT_BATCH, updateReportPaymentStatus, deleteReport, updateFullReport } from './api-reports';
import { generateZipExport, generateExcelExport, generateMergedPdfExport, getMergedPdfBlob } from './exporter';
import { generateReportPDF } from './pdf-reports';
import type { Report, City, Company, Dependency } from './reports-types';
import { supabaseOrders } from './supabase';
import * as UI from './ui';

let currentReports: Report[] = [];
let selectedReportIds: Set<string> = new Set();
let currentPage = 1;
let pageSize = 10;
let totalRecords = 0;
let highlightedReportIds: Set<string> = new Set();

// Reference Data
let cachedCities: City[] = [];
let cachedCompanies: Company[] = [];
let cachedDependencies: Dependency[] = [];

export async function initReportsUI() {
    setupEventListeners();
    await loadReferenceData();
    // No cargamos listado al init directo, solo cuando entremos a la pestaña, o podríamos pre-cargarlo.
}

export async function onSwitchToReportsPage() {
    if (currentReports.length === 0) {
        await resetAndLoadReports();
    }
}

async function loadReferenceData() {
    // Para simplificar, traemos datos maestros 1 vez
    cachedCities = await fetchCities();
    cachedCompanies = await fetchCompanies();
    cachedDependencies = await fetchDependencies();
}

function setupEventListeners() {
    DOM.reportsSearchInput.addEventListener('input', debounce(async () => {
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
        await resetAndLoadReports();
    });

    DOM.reportsDateTo.addEventListener('change', async () => {
        await resetAndLoadReports();
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

    DOM.reportsSelectAll.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        const checkboxes = DOM.reportsTbody.querySelectorAll('.report-checkbox') as NodeListOf<HTMLInputElement>;
        
        checkboxes.forEach(cb => {
            cb.checked = checked;
            if (checked) {
                selectedReportIds.add(cb.value);
            } else {
                selectedReportIds.delete(cb.value);
            }
        });
    });

    DOM.reportsTbody.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target && target.classList.contains('report-checkbox')) {
            if (target.checked) {
                selectedReportIds.add(target.value);
            } else {
                selectedReportIds.delete(target.value);
            }
            updateSelectAllCheckbox();
        }
    });

    // Delegación para botones de PDF individuales
    DOM.reportsTbody.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
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

        const btnView = target.closest('.btn-view-report') as HTMLButtonElement;
        if (btnView) {
            const reportId = btnView.getAttribute('data-id');
            const report = currentReports.find(r => r.id === reportId);
            if (report) {
                showReportDetailsModal(report);
            }
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
        if (selectedReportIds.size === 0) {
            alert('Debes seleccionar al menos un reporte para compartir.');
            return;
        }
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

    if (selectedReportIds.size > 0) {
        // En base a lo que se ha bajado en cache
        reportsToExport = currentReports.filter(r => selectedReportIds.has(r.id));
    } else {
        const searchInput = DOM.reportsSearchInput.value.trim();
        const dateFrom = DOM.reportsDateFrom.value;
        const dateTo = DOM.reportsDateTo.value;
        const confirmMsg = searchInput || (dateFrom || dateTo)
            ? "No has seleccionado reportes. ¿Deseas incluir TODOS los reportes filtrados (incluso los no mostrados)?" 
            : "No has seleccionado reportes. ¿Deseas procesar TODOS los reportes históricos?";
        
        const confirmed = await new Promise(resolve => {
            UI.showConfirmationModal('Selección de Reportes', confirmMsg, () => resolve(true), () => resolve(false));
        });

        if (confirmed) {
            DOM.reportsExportExcelBtn.disabled = true;
            DOM.reportsExportZipBtn.disabled = true;
            DOM.reportsExportMergedBtn.disabled = true;
            DOM.reportsExportWhatsappBtn.disabled = true;
            const filters = {
                searchTerm: searchInput,
                dateFrom: dateFrom,
                dateTo: dateTo
            };
            reportsToExport = await fetchAllExportableReports(filters);
            
            DOM.reportsExportExcelBtn.disabled = false;
            DOM.reportsExportZipBtn.disabled = false;
            DOM.reportsExportMergedBtn.disabled = false;
            DOM.reportsExportWhatsappBtn.disabled = false;
        } else {
            return;
        }
    }

    if (reportsToExport.length === 0) {
        alert("No se encontraron reportes.");
        return;
    }

    // Set buttons visually to loading
    const activeBtn = type === 'excel' ? DOM.reportsExportExcelBtn : 
                      type === 'zip' ? DOM.reportsExportZipBtn : 
                      type === 'whatsapp' ? DOM.reportsExportWhatsappBtn : DOM.reportsExportMergedBtn;
    
    const oldText = activeBtn.innerHTML;
    activeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
    activeBtn.disabled = true;

    try {
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
        alert("Ocurrió un error en el proceso.");
    } finally {
        activeBtn.innerHTML = oldText;
        activeBtn.disabled = false;
    }
}

async function resetAndLoadReports(highlightNew: boolean = false) {
    currentPage = 1;
    // NO vaciamos los seleccionados para permitir que seleccionen en multiples paginas
    // selectedReportIds.clear(); 
    DOM.reportsSelectAll.checked = false;
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
        dateTo: DOM.reportsDateTo.value
    };

    const offset = (currentPage - 1) * pageSize;
    const { data, count } = await fetchReportsBatch(offset, pageSize, filters);

    totalRecords = count;
    currentReports = data;
    
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
    updateSelectAllCheckbox();
    
    DOM.reportsLoadingIndicator.style.display = 'none';
    renderPaginationControls();
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
        DOM.reportsTbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">No se encontraron reportes</td></tr>';
        return;
    }

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
        
        const isChecked = selectedReportIds.has(r.id);
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

        tr.innerHTML = `
            <td><input type="checkbox" class="report-checkbox" value="${r.id}" ${isChecked ? 'checked' : ''}></td>
            <td>${dateStr}</td>
            <td title="${clientOrCompany || ''}">${displayClient}</td>
            <td title="${rawSede}">${displaySede}</td>
            <td>${eqDep}</td>
            <td>${r.serviceType || 'N/A'}</td>
            <td>${eqBrand}</td>
            <td>${eqType}</td>
            <td>${r.workerName}</td>
            <td class="actions" style="display: flex; gap: 6px; align-items: center; justify-content: flex-start;">
                ${isPaidBtn}
                <button class="btn btn-outline btn-view-report" data-id="${r.id}" title="Ver Detalles" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;">
                    <i class="fas fa-eye" style="color: #0275d8;"></i>
                </button>
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
}

function updateSelectAllCheckbox() {
    const checkboxes = DOM.reportsTbody.querySelectorAll('.report-checkbox') as NodeListOf<HTMLInputElement>;
    let allChecked = true;
    let anyChecked = false;
    
    checkboxes.forEach(cb => {
        if (cb.checked) anyChecked = true;
        else allChecked = false;
    });

    if (checkboxes.length === 0) allChecked = false;
    DOM.reportsSelectAll.checked = allChecked;
    // DOM.reportsSelectAll.indeterminate = anyChecked && !allChecked;
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

function showReportDetailsModal(report: Report) {
    const modal = document.getElementById('report-details-modal');
    const body = document.getElementById('report-details-body');
    if (!modal || !body) return;

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
                    <label>Nombre</label>
                    <input type="text" id="report-edit-client-name" class="input" value="${(isRes ? eq.client_name : eq.companyName) || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Dirección</label>
                    <input type="text" id="report-edit-address" class="input" value="${eq.address || ''}">
                </div>
                <div class="report-details-form-row">
                    <label>Dependencia</label>
                    <input type="text" id="report-edit-dependency" class="input" value="${eq.dependencyName || ''}">
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

    modal.classList.add('active');

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
        backBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
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
                    renderReportRows(currentReports);
                    UI.showNotification("Reporte actualizado correctamente", "success");
                    modal.classList.remove('active');
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

    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        const newClose = closeBtn.cloneNode(true);
        closeBtn.parentNode?.replaceChild(newClose, closeBtn);
        newClose.addEventListener('click', () => {
             modal.classList.remove('active');
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
