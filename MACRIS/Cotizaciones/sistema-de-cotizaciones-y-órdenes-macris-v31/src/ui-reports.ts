import * as DOM from './dom';
import { fetchReportsBatch, fetchAllExportableReports, fetchCities, fetchCompanies, fetchDependencies, SUPABASE_REPORT_BATCH, updateReportPaymentStatus } from './api-reports';
import { generateZipExport, generateExcelExport, generateMergedPdfExport, getMergedPdfBlob } from './exporter';
import { generateReportPDF } from './pdf-reports';
import type { Report, City, Company, Dependency } from './reports-types';
import { supabaseOrders } from './supabase';

let currentReports: Report[] = [];
let selectedReportIds: Set<string> = new Set();
let currentPage = 1;
let pageSize = 10;
let totalRecords = 0;

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
        
        if (confirm(confirmMsg)) {
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

async function resetAndLoadReports() {
    currentPage = 1;
    // NO vaciamos los seleccionados para permitir que seleccionen en multiples paginas
    // selectedReportIds.clear(); 
    DOM.reportsSelectAll.checked = false;
    await loadPage(1);
}

async function loadPage(page: number) {
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
        DOM.reportsTbody.innerHTML = '<tr><td colspan="8" style="text-align: center;">No se encontraron reportes</td></tr>';
        return;
    }

    reports.forEach(r => {
        const tr = document.createElement('tr');
        
        const isChecked = selectedReportIds.has(r.id);
        const dateStr = new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(r.timestamp));
        const clientOrCompany = r.equipmentSnapshot.category === 'residencial' 
            ? r.equipmentSnapshot.client_name 
            : r.equipmentSnapshot.companyName;

        const displayClient = clientOrCompany && clientOrCompany.length > 25 
            ? clientOrCompany.substring(0, 25) + '...' 
            : (clientOrCompany || 'N/A');

        const paidColor = r.is_paid ? '#28a745' : '#ffc107'; 
        const isPaidBtn = `<button class="btn btn-outline btn-toggle-paid" data-id="${r.id}" title="${r.is_paid ? 'Marcar como No Pagado' : 'Marcar como Pagado'}" style="border-width: 2px; border-color: ${paidColor}; color: ${paidColor}; padding: 0.25rem 0.5rem; font-size: 0.85rem;">
            <i class="fas fa-dollar-sign"></i>
        </button>`;

        const eqBrand = r.equipmentSnapshot.brand || 'N/A';
        const eqType = r.equipmentSnapshot.type || 'N/A';
        const eqDep = r.equipmentSnapshot.dependencyName || 'N/A';

        tr.innerHTML = `
            <td><input type="checkbox" class="report-checkbox" value="${r.id}" ${isChecked ? 'checked' : ''}></td>
            <td>${dateStr}</td>
            <td title="${clientOrCompany || ''}">${displayClient}</td>
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
    const clientName = isRes ? eq.client_name : eq.companyName;

    let itemsHtml = '';
    if (report.itemsSnapshot && report.itemsSnapshot.length > 0) {
        itemsHtml = `<ul>` + report.itemsSnapshot.map(i => `<li>${i.quantity}x ${i.description}</li>`).join('') + `</ul>`;
    } else {
        itemsHtml = '<p>No se registraron insumos.</p>';
    }

    body.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
                <h4>Información General</h4>
                <p><strong>Fecha:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
                <p><strong>Tipo Servicio:</strong> ${report.serviceType}</p>
                <p><strong>Técnico:</strong> ${report.workerName}</p>
                <p><strong>Estado:</strong> ${report.is_paid ? 'Pagado' : 'No pagado'}</p>
            </div>
            <div>
                <h4>Datos del Cliente/Empresa</h4>
                <p><strong>Nombre:</strong> ${clientName || 'N/A'}</p>
                <p><strong>Dirección:</strong> ${eq.address || 'N/A'}</p>
                <p><strong>Dependencia:</strong> ${eq.dependencyName || 'N/A'}</p>
            </div>
        </div>
        <hr>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
                <h4>Equipo Intervenido</h4>
                <p><strong>Marca:</strong> ${eq.brand || 'N/A'}</p>
                <p><strong>Modelo:</strong> ${eq.model || 'N/A'}</p>
                <p><strong>Tipo:</strong> ${eq.type || 'N/A'}</p>
                <p><strong>Capacidad:</strong> ${eq.capacity || 'N/A'}</p>
                <p><strong>Refrigerante:</strong> ${eq.refrigerant || 'N/A'}</p>
            </div>
            <div>
                <h4>Mediciones</h4>
                <p><strong>Presión:</strong> ${report.pressure || 'N/A'}</p>
                <p><strong>Amperaje:</strong> ${report.amperage || 'N/A'}</p>
            </div>
        </div>
        <hr>
        <div>
            <h4>Observaciones</h4>
            <p>${report.observations || 'Sin observaciones'}</p>
        </div>
        <hr>
        <div>
            <h4>Insumos Utilizados</h4>
            ${itemsHtml}
        </div>
    `;

    modal.classList.add('active');

    const closeBtn = modal.querySelector('.close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        }, { once: true });
    }
}
