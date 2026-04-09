import * as D from './dom';
import * as State from './state';
import { formatDate, buildCompanyAccessCode, buildCompanyAccessLink, normalizeAccessCode, normalizeSearchTerm, slugify, toBogotaDateKey } from './utils';
import { fetchReportDetails } from './api';
import { buildReportPdfFilename, generateReportPDF, generateReportsBundlePDF } from './lib/pdf-generator';
import { normalizeSignatureImage } from './lib/signature-utils';
import type { Equipment, Order, Report } from './types';

export function showLoader(message = 'Cargando...') {
  if (!D.loadingOverlay) return;
  const label = D.loadingOverlay.querySelector('p');
  if (label) label.textContent = message;
  D.loadingOverlay.style.display = 'flex';
}

export function hideLoader() {
  if (!D.loadingOverlay) return;
  D.loadingOverlay.style.display = 'none';
}

export function showAppNotification(message: string, type: 'error' | 'success' | 'info' | 'warning' = 'info', duration = 5000) {
  if (!D.notificationArea) return;
  const notification = document.createElement('div');
  notification.className = `app-notification ${type}`;
  notification.innerHTML = `<i class="fas ${iconForType(type)}"></i><div>${message}</div>`;
  D.notificationArea.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, duration);
}

function iconForType(type: string) {
  switch (type) {
    case 'success': return 'fa-check-circle';
    case 'error': return 'fa-times-circle';
    case 'warning': return 'fa-exclamation-triangle';
    default: return 'fa-info-circle';
  }
}

export function showScreen(screen: 'login' | 'app' | 'admin') {
  if (D.loginScreen) D.loginScreen.style.display = screen === 'login' ? 'block' : 'none';
  if (D.appScreen) D.appScreen.style.display = screen === 'app' ? 'block' : 'none';
  if (D.adminScreen) D.adminScreen.style.display = screen === 'admin' ? 'block' : 'none';
}

function getFilteredReports() {
  const searchTerm = normalizeSearchTerm(State.reportsSearchTerm);
  const searchTermCompact = normalizeAccessCode(State.reportsSearchTerm);
  const { start, end } = State.reportsDateRange;
  const hasDateFilter = Boolean(start || end);

  const filtered = State.reports.filter(report => {
    const equipmentId = report.equipmentSnapshot.manualId || '';
    const equipmentDbId = report.equipmentSnapshot.id || '';
    const equipmentName = `${report.equipmentSnapshot.brand || ''} ${report.equipmentSnapshot.model || ''}`.trim();
    const dependency = report.equipmentSnapshot.dependencyName || '';

    const searchString = [
      report.id,
      equipmentId,
      equipmentDbId,
      equipmentName,
      report.serviceType,
      report.workerName,
      dependency,
      report.observations,
      formatDate(report.timestamp),
    ].join(' ').toLowerCase();

    const normalizedString = normalizeSearchTerm(searchString);
    const compactString = normalizeAccessCode(searchString);
    const matchesSearch = normalizedString.includes(searchTerm) || compactString.includes(searchTermCompact);
    if (!matchesSearch) return false;

    if (!hasDateFilter) return true;
    const reportDateKey = toBogotaDateKey(report.timestamp);
    if (!reportDateKey) return false;
    if (start && reportDateKey < start) return false;
    if (end && reportDateKey > end) return false;
    return true;
  });

  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return filtered;
}

function updateReportsCount(count: number) {
  if (!D.reportsCount) return;
  const label = count === 1 ? 'reporte' : 'reportes';
  D.reportsCount.textContent = `${count} ${label}`;
}

export function renderReportsTable() {
  if (!D.reportsTableBody) return;

  const searchRaw = State.reportsSearchTerm.trim();
  const normalizedSearch = normalizeAccessCode(searchRaw);
  const looksLikeEquipmentId = normalizedSearch.length >= 4 && (/\d/.test(normalizedSearch) || /-/.test(searchRaw));
  const reports = getFilteredReports();
  const hasSearchFilter = Boolean(searchRaw);
  const hasDateFilter = Boolean(State.reportsDateRange.start || State.reportsDateRange.end);

  updateReportsCount(reports.length);

  const { currentPage, itemsPerPage } = State.reportsPagination;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = reports.slice(startIndex, startIndex + itemsPerPage);

  if (paginated.length === 0) {
    D.reportsTableBody.innerHTML = '<tr><td colspan="7">No se encontraron reportes con los filtros actuales.</td></tr>';
  } else {
    D.reportsTableBody.innerHTML = paginated.map(report => {
      const equipmentId = report.equipmentSnapshot.manualId || 'S/ID';
      const equipmentName = `${report.equipmentSnapshot.brand || ''} ${report.equipmentSnapshot.model || ''}`.trim() || 'N/A';
      const dependency = report.equipmentSnapshot.dependencyName || 'N/A';
      return `
        <tr class="clickable-row" data-report-id="${report.id}">
          <td data-label="Fecha">${formatDate(report.timestamp)}</td>
          <td data-label="ID Reporte">${report.id.substring(0, 8)}...</td>
          <td data-label="ID Equipo">${equipmentId}</td>
          <td data-label="Equipo">${equipmentName}</td>
          <td data-label="Servicio">${report.serviceType}</td>
          <td data-label="Dependencia">${dependency}</td>
          <td data-label="Acciones">
            <button class="btn btn-secondary btn-icon-only view-report-btn" data-report-id="${report.id}" title="Ver detalles">
              <i class="fas fa-eye"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  if (D.reportsEmptyState) {
    if (reports.length === 0 && (hasSearchFilter || hasDateFilter)) {
      const matchedEquipment = State.equipmentList.find(item => {
        const manualId = normalizeAccessCode(item.manualId || '');
        const equipmentId = normalizeAccessCode(item.id || '');
        return (manualId && manualId === normalizedSearch) || (equipmentId && equipmentId === normalizedSearch);
      });
      if (hasSearchFilter && hasDateFilter) {
        D.reportsEmptyState.textContent = matchedEquipment
          ? 'Este equipo no tiene reportes en el rango seleccionado.'
          : 'No se encontraron reportes con los filtros actuales.';
      } else if (hasDateFilter) {
        D.reportsEmptyState.textContent = 'No se encontraron reportes en el rango seleccionado.';
      } else if (matchedEquipment) {
        D.reportsEmptyState.textContent = 'Este equipo no tiene reportes registrados aun.';
      } else if (looksLikeEquipmentId) {
        D.reportsEmptyState.textContent = 'No se encontro el equipo. Valida el QR o ingresa el código manual.';
      } else {
        D.reportsEmptyState.textContent = 'No se encontraron reportes con ese filtro.';
      }
      D.reportsEmptyState.style.display = 'block';
    } else {
      D.reportsEmptyState.style.display = 'none';
    }
  }

  renderPagination(reports.length);
}

export function renderEquipmentTable() {
  if (!D.equipmentTableBody) return;

  const searchTerm = normalizeSearchTerm(State.equipmentSearchTerm);
  const searchTermCompact = normalizeAccessCode(State.equipmentSearchTerm);
  const equipmentItems = State.equipmentList.filter(equipment => {
    const manualId = equipment.manualId || '';
    const equipmentName = `${equipment.brand || ''} ${equipment.model || ''}`.trim();
    const dependency = equipment.dependencyName || '';
    const typeName = equipment.type || '';

    const searchString = [
      equipment.id,
      manualId,
      equipmentName,
      typeName,
      dependency,
    ].join(' ').toLowerCase();

    const normalizedString = normalizeSearchTerm(searchString);
    const compactString = normalizeAccessCode(searchString);
    return normalizedString.includes(searchTerm) || compactString.includes(searchTermCompact);
  });

  equipmentItems.sort((a, b) => (a.manualId || '').localeCompare(b.manualId || ''));

  const { currentPage, itemsPerPage } = State.equipmentPagination;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = equipmentItems.slice(startIndex, startIndex + itemsPerPage);

  if (paginated.length === 0) {
    D.equipmentTableBody.innerHTML = '<tr><td colspan="6">No se encontraron equipos con los filtros actuales.</td></tr>';
  } else {
    D.equipmentTableBody.innerHTML = paginated.map(equipment => {
      const manualId = equipment.manualId || 'S/ID';
      const equipmentName = `${equipment.brand || ''} ${equipment.model || ''}`.trim() || 'N/A';
      const dependency = equipment.dependencyName || 'N/A';
      const typeName = equipment.type || 'N/A';
      const reportCount = countReportsForEquipment(equipment);
      const searchKey = (equipment.manualId || equipment.id || '').trim();
      const buttonDisabled = !searchKey ? 'disabled' : '';
      return `
        <tr class="clickable-row" data-search-key="${searchKey}">
          <td data-label="ID Equipo">${manualId}</td>
          <td data-label="Equipo">${equipmentName}</td>
          <td data-label="Tipo">${typeName}</td>
          <td data-label="Dependencia">${dependency}</td>
          <td data-label="Reportes"><span class="count-pill">${reportCount}</span></td>
          <td data-label="Acciones">
            <button class="btn btn-secondary btn-icon-only view-equipment-reports-btn" data-search-key="${searchKey}" title="Ver reportes" ${buttonDisabled}>
              <i class="fas fa-list"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderEquipmentPagination(equipmentItems.length);
}

function renderPagination(totalItems: number) {
  if (!D.reportsPagination) return;

  const { currentPage, itemsPerPage } = State.reportsPagination;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const nav = document.createElement('div');
  nav.className = 'page-navigation';

  const createButton = (label: string, page: number, disabled: boolean) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-icon-only';
    btn.disabled = disabled;
    btn.innerHTML = label;
    btn.addEventListener('click', () => {
      State.reportsPagination.currentPage = page;
      renderReportsTable();
    });
    return btn;
  };

  nav.appendChild(createButton('<i class="fas fa-angle-left"></i>', Math.max(1, currentPage - 1), currentPage === 1));
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Pagina ${currentPage} de ${totalPages}`;
  nav.appendChild(info);
  nav.appendChild(createButton('<i class="fas fa-angle-right"></i>', Math.min(totalPages, currentPage + 1), currentPage === totalPages));

  D.reportsPagination.innerHTML = '';
  D.reportsPagination.appendChild(nav);
}

function renderEquipmentPagination(totalItems: number) {
  if (!D.equipmentPagination) return;

  const { currentPage, itemsPerPage } = State.equipmentPagination;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const nav = document.createElement('div');
  nav.className = 'page-navigation';

  const createButton = (label: string, page: number, disabled: boolean) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-icon-only';
    btn.disabled = disabled;
    btn.innerHTML = label;
    btn.addEventListener('click', () => {
      State.equipmentPagination.currentPage = page;
      renderEquipmentTable();
    });
    return btn;
  };

  nav.appendChild(createButton('<i class="fas fa-angle-left"></i>', Math.max(1, currentPage - 1), currentPage === 1));
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Pagina ${currentPage} de ${totalPages}`;
  nav.appendChild(info);
  nav.appendChild(createButton('<i class="fas fa-angle-right"></i>', Math.min(totalPages, currentPage + 1), currentPage === totalPages));

  D.equipmentPagination.innerHTML = '';
  D.equipmentPagination.appendChild(nav);
}

function renderAdminEquipmentPagination(totalItems: number) {
  if (!D.adminEquipmentPagination) return;

  const { currentPage, itemsPerPage } = State.adminEquipmentPagination;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const nav = document.createElement('div');
  nav.className = 'page-navigation';

  const createButton = (label: string, page: number, disabled: boolean) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-icon-only';
    btn.disabled = disabled;
    btn.innerHTML = label;
    btn.addEventListener('click', () => {
      State.adminEquipmentPagination.currentPage = page;
      renderAdminEquipmentTable();
    });
    return btn;
  };

  nav.appendChild(createButton('<i class="fas fa-angle-left"></i>', Math.max(1, currentPage - 1), currentPage === 1));
  const info = document.createElement('span');
  info.className = 'page-info';
  info.textContent = `Pagina ${currentPage} de ${totalPages}`;
  nav.appendChild(info);
  nav.appendChild(createButton('<i class="fas fa-angle-right"></i>', Math.min(totalPages, currentPage + 1), currentPage === totalPages));

  D.adminEquipmentPagination.innerHTML = '';
  D.adminEquipmentPagination.appendChild(nav);
}

function countReportsForEquipment(equipment: Equipment) {
  const manualId = equipment.manualId?.toLowerCase() || '';
  const equipmentId = equipment.id || '';
  return State.reports.filter(report => {
    const reportManualId = report.equipmentSnapshot.manualId?.toLowerCase() || '';
    const reportEquipmentId = report.equipmentSnapshot.id || '';
    return (manualId && reportManualId === manualId) || (equipmentId && reportEquipmentId === equipmentId);
  }).length;
}

export function renderAdminCompaniesTable() {
  if (!D.adminCompaniesTableBody) return;

  const searchTerm = State.adminCompanySearchTerm.toLowerCase();
  const companies = State.companies.filter(company => company.name.toLowerCase().includes(searchTerm));

  if (companies.length === 0) {
    D.adminCompaniesTableBody.innerHTML = '<tr><td colspan="4">No se encontraron empresas.</td></tr>';
    return;
  }

  D.adminCompaniesTableBody.innerHTML = companies.map(company => {
    const accessCode = buildCompanyAccessCode(company.name, company.id);
    const cityName = State.cities.find(city => city.id === company.cityId)?.name || 'N/A';
    const accessLink = buildCompanyAccessLink(company.name, company.id);
    return `
      <tr>
        <td data-label="Empresa">${company.name}</td>
        <td data-label="Ciudad">${cityName}</td>
        <td data-label="Código"><span class="access-code" data-action="copy-code" data-code="${accessCode}" title="Copiar código">${accessCode}</span></td>
        <td data-label="Acciones">
          <div class="admin-actions">
            <button class="btn btn-secondary btn-icon-only" data-action="copy-message" data-link="${accessLink}" data-code="${accessCode}" data-company="${company.name}" title="Copiar mensaje"><i class="fas fa-copy"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="mailto" data-link="${accessLink}" data-code="${accessCode}" data-company="${company.name}" title="Enviar por correo"><i class="fas fa-envelope"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="gmail" data-link="${accessLink}" data-code="${accessCode}" data-company="${company.name}" title="Gmail"><i class="fab fa-google"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="copy-code" data-code="${accessCode}" title="Copiar código"><i class="fas fa-key"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="copy-link" data-link="${accessLink}" title="Copiar link"><i class="fas fa-link"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="open-link" data-link="${accessLink}" title="Abrir portal"><i class="fas fa-external-link-alt"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="share-whatsapp" data-link="${accessLink}" data-code="${accessCode}" data-company="${company.name}" title="Compartir WhatsApp"><i class="fab fa-whatsapp"></i></button>
            <button class="btn btn-secondary btn-icon-only" data-action="share-native" data-link="${accessLink}" data-code="${accessCode}" data-company="${company.name}" title="Compartir"><i class="fas fa-share-alt"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

export function renderAdminEquipmentTable() {
  if (!D.adminEquipmentTableBody) return;

  const searchTerm = normalizeSearchTerm(State.adminEquipmentSearchTerm);
  const searchTermCompact = normalizeAccessCode(State.adminEquipmentSearchTerm);
  const equipmentItems = State.adminEquipmentList.filter(equipment => {
    const manualId = equipment.manualId || '';
    const equipmentName = `${equipment.brand || ''} ${equipment.model || ''}`.trim();
    const typeName = equipment.type || '';
    const companyName = equipment.companyName || '';
    const dependency = equipment.dependencyName || '';

    const searchString = [
      equipment.id,
      manualId,
      equipmentName,
      typeName,
      companyName,
      dependency,
    ].join(' ').toLowerCase();

    const normalizedString = normalizeSearchTerm(searchString);
    const compactString = normalizeAccessCode(searchString);
    return normalizedString.includes(searchTerm) || compactString.includes(searchTermCompact);
  });

  equipmentItems.sort((a, b) => (a.manualId || '').localeCompare(b.manualId || ''));

  const { currentPage, itemsPerPage } = State.adminEquipmentPagination;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginated = equipmentItems.slice(startIndex, startIndex + itemsPerPage);

  if (paginated.length === 0) {
    D.adminEquipmentTableBody.innerHTML = '<tr><td colspan="6">No se encontraron equipos.</td></tr>';
  } else {
    D.adminEquipmentTableBody.innerHTML = paginated.map(equipment => {
      const manualId = equipment.manualId || 'S/ID';
      const equipmentName = `${equipment.brand || ''} ${equipment.model || ''}`.trim() || 'N/A';
      const typeName = equipment.type || 'N/A';
      const companyName = equipment.companyName || State.companies.find(c => c.id === equipment.companyId)?.name || 'N/A';
      const dependency = equipment.dependencyName || 'N/A';
      const buttonDisabled = equipment.manualId ? '' : 'disabled';
      return `
        <tr>
          <td data-label="ID Equipo">${manualId}</td>
          <td data-label="Equipo">${equipmentName}</td>
          <td data-label="Tipo">${typeName}</td>
          <td data-label="Empresa">${companyName}</td>
          <td data-label="Dependencia">${dependency}</td>
          <td data-label="Acciones">
            <button class="btn btn-secondary btn-icon-only" data-action="copy-equipment-id" data-id="${equipment.manualId || ''}" title="Copiar ID" ${buttonDisabled}>
              <i class="fas fa-key"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderAdminEquipmentPagination(equipmentItems.length);
}

export async function openReportDetailsModal(reportId: string) {
  if (!D.reportDetailsModal || !D.reportDetailsContent) return;

  const report = State.reports.find(r => r.id === reportId);
  if (!report) return;

  if (report.clientSignature === undefined) {
    try {
      const details = await fetchReportDetails(reportId);
      report.clientSignature = details.client_signature;
      report.photo_internal_unit_url = details.photo_internal_unit_url;
      report.photo_external_unit_url = details.photo_external_unit_url;
    } catch (error) {
      console.error('Error fetching report details:', error);
    }
  }

  if (report.clientSignature && report.clientSignature !== 'PENDING_SIGNATURE') {
    report.clientSignature = await normalizeSignatureImage(report.clientSignature);
  }

  D.reportDetailsContent.innerHTML = buildReportDetailsHtml(report);
  D.reportDetailsModal.dataset.reportId = reportId;
  D.reportDetailsModal.style.display = 'flex';
}

export function closeReportDetailsModal() {
  if (D.reportDetailsModal) D.reportDetailsModal.style.display = 'none';
}

async function confirmDownloadAllReports(totalReports: number): Promise<boolean> {
  if (
    !D.reportsDownloadConfirmModal
    || !D.reportsDownloadConfirmText
    || !D.reportsDownloadConfirmButton
    || !D.reportsDownloadCancelButton
  ) {
    return window.confirm(`No hay filtros activos. ¿Deseas descargar los ${totalReports} reportes en un solo PDF?`);
  }

  D.reportsDownloadConfirmText.textContent = `No hay filtros activos. ¿Deseas descargar los ${totalReports} reportes en un solo PDF?`;
  D.reportsDownloadConfirmModal.style.display = 'flex';

  return new Promise((resolve) => {
    const closeModal = (result: boolean) => {
      D.reportsDownloadConfirmModal.style.display = 'none';
      resolve(result);
    };

    const handleConfirm = () => {
      cleanup();
      closeModal(true);
    };

    const handleCancel = () => {
      cleanup();
      closeModal(false);
    };

    const handleBackdrop = (event: MouseEvent) => {
      if (event.target === D.reportsDownloadConfirmModal) {
        handleCancel();
      }
    };

    const cleanup = () => {
      D.reportsDownloadConfirmButton.removeEventListener('click', handleConfirm);
      D.reportsDownloadCancelButton.removeEventListener('click', handleCancel);
      D.closeReportsDownloadConfirmButton?.removeEventListener('click', handleCancel);
      D.reportsDownloadConfirmModal.removeEventListener('click', handleBackdrop);
    };

    D.reportsDownloadConfirmButton.addEventListener('click', handleConfirm);
    D.reportsDownloadCancelButton.addEventListener('click', handleCancel);
    D.closeReportsDownloadConfirmButton?.addEventListener('click', handleCancel);
    D.reportsDownloadConfirmModal.addEventListener('click', handleBackdrop);
  });
}

export async function downloadReportPdf(reportId: string) {
  const report = State.reports.find(r => r.id === reportId);
  if (!report) return;

  const ordersForPdf: Order[] = [];
  const isMobile = window.matchMedia('(max-width: 768px)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const outputType = isMobile ? 'blob' : 'open';

  try {
    const result = await generateReportPDF(
      report,
      State.cities,
      State.companies,
      [],
      formatDate,
      ordersForPdf,
      outputType
    );

    if (outputType === 'blob' && result instanceof Blob) {
      const filename = buildReportPdfFilename(report, ordersForPdf);
      const url = URL.createObjectURL(result);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    console.error('Error downloading PDF:', error);
    showAppNotification('No se pudo descargar el PDF.', 'error');
  }
}

function buildReportsBundleFilename(dateRange: { start: string; end: string }) {
  const baseName = slugify(State.currentCompany?.name || 'reportes') || 'reportes';
  let rangeLabel = '';
  if (dateRange.start && dateRange.end) {
    rangeLabel = `_${dateRange.start}_al_${dateRange.end}`;
  } else if (dateRange.start) {
    rangeLabel = `_desde_${dateRange.start}`;
  } else if (dateRange.end) {
    rangeLabel = `_hasta_${dateRange.end}`;
  }
  return `Reportes_${baseName}${rangeLabel}.pdf`;
}

async function hydrateReportAssets(report: Report) {
  if (report.clientSignature === undefined) {
    try {
      const details = await fetchReportDetails(report.id);
      report.clientSignature = details.client_signature;
      report.photo_internal_unit_url = details.photo_internal_unit_url;
      report.photo_external_unit_url = details.photo_external_unit_url;
    } catch (error) {
      console.error('Error fetching report details:', error);
    }
  }

  if (report.clientSignature && report.clientSignature !== 'PENDING_SIGNATURE') {
    report.clientSignature = await normalizeSignatureImage(report.clientSignature);
  }
}

export async function downloadFilteredReportsPdf() {
  const reports = getFilteredReports();
  const hasSearchFilter = Boolean(State.reportsSearchTerm.trim());
  const hasDateFilter = Boolean(State.reportsDateRange.start || State.reportsDateRange.end);
  const hasFilters = hasSearchFilter || hasDateFilter;

  if (reports.length === 0) {
    showAppNotification('No hay reportes para descargar con los filtros actuales.', 'warning');
    return;
  }

  if (!hasFilters) {
    const confirmDownload = await confirmDownloadAllReports(reports.length);
    if (!confirmDownload) return;
  }

  const isMobile = window.matchMedia('(max-width: 768px)').matches || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const outputType = isMobile ? 'blob' : 'open';
  const filename = buildReportsBundleFilename(State.reportsDateRange);

  const totalReports = reports.length;
  showLoader(`Procesando 0 de ${totalReports} reportes...`);
  try {
    for (let i = 0; i < reports.length; i += 1) {
      showLoader(`Procesando ${i + 1} de ${totalReports} reportes...`);
      const report = reports[i];
      await hydrateReportAssets(report);
    }

    const result = await generateReportsBundlePDF(
      reports,
      State.cities,
      State.companies,
      [],
      formatDate,
      [],
      outputType,
      filename,
      (current, total) => {
        showLoader(`Generando PDF ${current} de ${total} reportes...`);
      }
    );

    if (outputType === 'blob' && result instanceof Blob) {
      const url = URL.createObjectURL(result);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    console.error('Error downloading PDF bundle:', error);
    showAppNotification('No se pudo descargar el PDF.', 'error');
  } finally {
    hideLoader();
  }
}

function buildReportDetailsHtml(report: Report): string {
  const equipment = report.equipmentSnapshot;
  const itemsList = report.itemsSnapshot && report.itemsSnapshot.length > 0
    ? `<ul>${report.itemsSnapshot.map(item => `<li>${item.description} x ${item.quantity}</li>`).join('')}</ul>`
    : '<p>Sin items registrados.</p>';

  const photos = report.photo_internal_unit_url || report.photo_external_unit_url
    ? `
      <div class="report-images">
        ${report.photo_internal_unit_url ? `<div><p>Unidad interna</p><img src="${report.photo_internal_unit_url}" alt="Unidad interna"></div>` : ''}
        ${report.photo_external_unit_url ? `<div><p>Unidad externa</p><img src="${report.photo_external_unit_url}" alt="Unidad externa"></div>` : ''}
      </div>
    `
    : '<p>Sin fotos registradas.</p>';

  const signature = report.clientSignature && report.clientSignature !== 'PENDING_SIGNATURE'
    ? `<img class="report-signature-image" src="${report.clientSignature}" alt="Firma cliente">`
    : '<p>Firma pendiente.</p>';

  return `
    <div class="report-summary">
      <div class="report-kv">
        <span class="label">Fecha</span>
        <span class="value">${formatDate(report.timestamp)}</span>
      </div>
      <div class="report-kv">
        <span class="label">ID Reporte</span>
        <span class="value">${report.id}</span>
      </div>
      <div class="report-kv">
        <span class="label">Técnico</span>
        <span class="value">${report.workerName}</span>
      </div>
      <div class="report-kv">
        <span class="label">Servicio</span>
        <span class="value">${report.serviceType}</span>
      </div>
    </div>
    <div class="report-grid">
      <div class="report-section compact">
        <h4>Equipo</h4>
        <div class="report-kv">
          <span class="label">ID Equipo</span>
          <span class="value">${equipment.manualId || 'S/ID'}</span>
        </div>
        <div class="report-kv">
          <span class="label">Marca</span>
          <span class="value">${equipment.brand || 'N/A'}</span>
        </div>
        <div class="report-kv">
          <span class="label">Modelo</span>
          <span class="value">${equipment.model || 'N/A'}</span>
        </div>
        <div class="report-kv">
          <span class="label">Tipo</span>
          <span class="value">${equipment.type || 'N/A'}</span>
        </div>
      </div>
      <div class="report-section compact">
        <h4>Mediciones</h4>
        <div class="report-kv">
          <span class="label">Presion</span>
          <span class="value">${report.pressure || 'N/A'}</span>
        </div>
        <div class="report-kv">
          <span class="label">Amperaje</span>
          <span class="value">${report.amperage || 'N/A'}</span>
        </div>
        <div class="report-kv">
          <span class="label">Capacidad</span>
          <span class="value">${equipment.capacity || 'N/A'}</span>
        </div>
        <div class="report-kv">
          <span class="label">Refrigerante</span>
          <span class="value">${equipment.refrigerant || 'N/A'}</span>
        </div>
      </div>
    </div>
    <div class="report-section compact">
      <h4>Observaciones</h4>
      <p>${report.observations || 'Sin observaciones.'}</p>
    </div>
    <div class="report-section compact">
      <h4>Items de instalacion</h4>
      ${itemsList}
    </div>
    <div class="report-section compact">
      <h4>Fotos</h4>
      ${photos}
    </div>
    <div class="report-section compact">
      <h4>Firma</h4>
      ${signature}
    </div>
  `;
}

