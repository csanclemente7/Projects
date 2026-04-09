import * as D from './dom';
import * as State from './state';
import * as UI from './ui';
import { buildAccessMessage, buildCompanyAccessCode, getBogotaTodayKey, normalizeAccessCode, shiftDateKey } from './utils';
import { fetchAllEquipment, fetchEquipmentForCompany, fetchReportsForCompany, validateAdminPassword } from './api';

const CLIENT_SESSION_KEY = 'client_portal_session';
const ADMIN_SESSION_KEY = 'client_portal_admin_session';

type ClientTab = 'reports' | 'equipment';
type AdminTab = 'companies' | 'equipment';

function showClientTab(tab: ClientTab) {
  if (D.reportsSection) D.reportsSection.style.display = tab === 'reports' ? 'block' : 'none';
  if (D.equipmentSection) D.equipmentSection.style.display = tab === 'equipment' ? 'block' : 'none';
  D.clientTabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.clientTab === tab);
  });
}

function showAdminTab(tab: AdminTab) {
  if (D.adminCompaniesSection) D.adminCompaniesSection.style.display = tab === 'companies' ? 'block' : 'none';
  if (D.adminEquipmentSection) D.adminEquipmentSection.style.display = tab === 'equipment' ? 'block' : 'none';
  D.adminTabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.adminTab === tab);
  });
}

function resolveCompanyFromAccessCode(accessCode: string) {
  const normalizedInput = normalizeAccessCode(accessCode);
  if (!normalizedInput) return null;

  return State.companies.find(company => {
    const fullCode = normalizeAccessCode(buildCompanyAccessCode(company.name, company.id));
    const fullId = normalizeAccessCode(company.id);
    return normalizedInput === fullCode || normalizedInput === fullId;
  }) || null;
}

async function loginClient(accessCode: string, persist = true): Promise<boolean> {
  const company = resolveCompanyFromAccessCode(accessCode);
  if (!company) {
    if (D.clientLoginError) D.clientLoginError.textContent = 'Código invalido. Verifique el enlace.';
    return false;
  }

  D.clientLoginError.textContent = '';
  UI.showLoader('Cargando datos...');
  let success = false;

  try {
    State.setCurrentCompany(company);
    State.setCurrentAccessCode(accessCode);
    const [reports, equipmentList] = await Promise.all([
      fetchReportsForCompany(company.id),
      fetchEquipmentForCompany(company.id),
    ]);
    State.setReports(reports);
    State.setEquipmentList(equipmentList);
    State.resetReportsPagination();
    State.resetEquipmentPagination();

    if (persist) {
      localStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify({
        companyId: company.id,
        accessCode,
      }));
    }

    if (D.currentCompanyName) {
      D.currentCompanyName.textContent = company.name;
    }

    UI.showScreen('app');
    UI.renderReportsTable();
    UI.renderEquipmentTable();
    showClientTab('reports');
    success = true;
  } catch (error) {
    console.error('Login error:', error);
    UI.showAppNotification('No se pudieron cargar los datos.', 'error');
  } finally {
    UI.hideLoader();
  }

  return success;
}

function logoutClient() {
  State.setCurrentCompany(null);
  State.setCurrentAccessCode(null);
  State.setEquipmentList([]);
  State.setEquipmentSearchTerm('');
  State.setReports([]);
  State.setReportsSearchTerm('');
  State.resetReportsDateRange();
  if (D.reportsSearchInput) D.reportsSearchInput.value = '';
  if (D.reportsDateStartInput) D.reportsDateStartInput.value = '';
  if (D.reportsDateEndInput) D.reportsDateEndInput.value = '';
  if (D.reportsDateStartInput) D.reportsDateStartInput.max = '';
  if (D.reportsDateEndInput) D.reportsDateEndInput.min = '';
  if (D.equipmentSearchInput) D.equipmentSearchInput.value = '';
  localStorage.removeItem(CLIENT_SESSION_KEY);
  UI.showScreen('login');
}

export function openAdminPortal() {
  UI.showScreen('admin');
  if (State.adminSessionActive) {
    if (D.adminContent) D.adminContent.style.display = 'block';
    if (D.adminLoginCard) D.adminLoginCard.style.display = 'none';
    UI.renderAdminCompaniesTable();
    loadAdminEquipmentData();
    showAdminTab('companies');
  } else {
    if (D.adminContent) D.adminContent.style.display = 'none';
    if (D.adminLoginCard) D.adminLoginCard.style.display = 'block';
    if (D.adminLoginError) D.adminLoginError.textContent = '';
    if (D.adminPinInput) D.adminPinInput.value = '';
    if (D.adminPinInput) {
      setTimeout(() => D.adminPinInput?.focus(), 0);
    }
  }
}

function closeAdminPortal() {
  UI.showScreen('login');
}

function logoutAdmin() {
  State.setAdminSessionActive(false);
  State.setAdminEquipmentList([]);
  State.setAdminEquipmentSearchTerm('');
  State.resetAdminEquipmentPagination();
  localStorage.removeItem(ADMIN_SESSION_KEY);
  if (D.adminContent) D.adminContent.style.display = 'none';
  if (D.adminLoginCard) D.adminLoginCard.style.display = 'block';
  if (D.adminLoginError) D.adminLoginError.textContent = '';
  if (D.adminPinInput) D.adminPinInput.value = '';
  if (D.adminEquipmentSearch) D.adminEquipmentSearch.value = '';
}

async function handleAdminLogin(pin: string) {
  if (!pin) return false;
  UI.showLoader('Validando acceso...');

  try {
    const isValid = await validateAdminPassword(pin);
    if (!isValid) return false;

    State.setAdminSessionActive(true);
    localStorage.setItem(ADMIN_SESSION_KEY, 'true');
    return true;
  } catch (error) {
    console.error('Admin login error:', error);
    return false;
  } finally {
    UI.hideLoader();
  }
}

export function restoreAdminSessionFromStorage() {
  if (localStorage.getItem(ADMIN_SESSION_KEY) === 'true') {
    State.setAdminSessionActive(true);
  }
}

async function loadAdminEquipmentData(force = false) {
  if (!State.adminSessionActive) return;
  if (!force && State.adminEquipmentList.length > 0) {
    UI.renderAdminEquipmentTable();
    return;
  }

  UI.showLoader('Cargando equipos...');
  try {
    const equipment = await fetchAllEquipment();
    State.setAdminEquipmentList(equipment);
    State.resetAdminEquipmentPagination();
    UI.renderAdminEquipmentTable();
  } catch (error) {
    console.error('Error loading admin equipment:', error);
    UI.showAppNotification('No se pudieron cargar los equipos.', 'error');
  } finally {
    UI.hideLoader();
  }
}

function handleAdminActionClick(target: HTMLElement) {
  const action = target.closest<HTMLElement>('[data-action]');
  if (!action) return;

  const actionType = action.dataset.action;
  const equipmentId = action.dataset.id || '';
  const link = action.dataset.link || '';
  const code = action.dataset.code || '';
  const company = action.dataset.company || 'empresa';
  const message = buildAccessMessage(company, link, code);
  const shareText = message.body;
  const shareTextWithSubject = `Asunto: ${message.subject}\n\n${message.body}`;

  if (actionType === 'copy-equipment-id' && equipmentId) {
    navigator.clipboard.writeText(equipmentId).then(() => {
      UI.showAppNotification('ID copiado.', 'success');
    }).catch(() => {
      window.prompt('Copia el ID:', equipmentId);
    });
  }

  if (actionType === 'copy-code' && code) {
    navigator.clipboard.writeText(code).then(() => {
      UI.showAppNotification('Código copiado.', 'success');
    }).catch(() => {
      window.prompt('Copia el código:', code);
    });
  }

  if (actionType === 'copy-link' && link) {
    navigator.clipboard.writeText(link).then(() => {
      UI.showAppNotification('Link copiado.', 'success');
    }).catch(() => {
      window.prompt('Copia el link:', link);
    });
  }

  if (actionType === 'copy-message') {
    navigator.clipboard.writeText(shareTextWithSubject).then(() => {
      UI.showAppNotification('Mensaje copiado.', 'success');
    }).catch(() => {
      window.prompt('Copia el mensaje:', shareTextWithSubject);
    });
  }

  if (actionType === 'mailto') {
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
    window.location.href = mailtoUrl;
  }

  if (actionType === 'gmail') {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=&su=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
    window.open(gmailUrl, '_blank');
  }

  if (actionType === 'open-link' && link) {
    window.open(link, '_blank');
  }

  if (actionType === 'share-whatsapp' && link) {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(whatsappUrl, '_blank');
  }

  if (actionType === 'share-native') {
    if (navigator.share) {
      navigator.share({
        title: message.subject,
        text: message.body,
        url: link,
      }).catch(() => {
        UI.showAppNotification('No se pudo abrir el menu de compartir.', 'warning');
      });
    } else {
      navigator.clipboard.writeText(shareTextWithSubject).then(() => {
        UI.showAppNotification('Mensaje copiado para compartir.', 'success');
      }).catch(() => {
        window.prompt('Copia el mensaje:', shareTextWithSubject);
      });
    }
  }
}

export function setupEventListeners() {
  D.clientLoginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!D.clientAccessCodeInput) return;
    loginClient(D.clientAccessCodeInput.value.trim());
  });

  D.logoutButton?.addEventListener('click', logoutClient);
  D.reportsSearchInput?.addEventListener('input', () => {
    State.setReportsSearchTerm(D.reportsSearchInput.value);
    State.resetReportsPagination();
    UI.renderReportsTable();
  });
  D.reportsSearchClearButton?.addEventListener('click', () => {
    D.reportsSearchInput.value = '';
    State.setReportsSearchTerm('');
    State.resetReportsPagination();
    UI.renderReportsTable();
  });

  const syncReportsDateRange = (start: string, end: string) => {
    State.setReportsDateStart(start);
    State.setReportsDateEnd(end);
    if (D.reportsDateStartInput) D.reportsDateStartInput.value = start;
    if (D.reportsDateEndInput) D.reportsDateEndInput.value = end;
    if (D.reportsDateStartInput) D.reportsDateStartInput.max = end || '';
    if (D.reportsDateEndInput) D.reportsDateEndInput.min = start || '';
    State.resetReportsPagination();
    UI.renderReportsTable();
  };

  D.reportsDateStartInput?.addEventListener('change', () => {
    const start = D.reportsDateStartInput.value;
    let end = D.reportsDateEndInput?.value || '';
    if (start && end && start > end) {
      end = start;
    }
    syncReportsDateRange(start, end);
  });

  D.reportsDateEndInput?.addEventListener('change', () => {
    let start = D.reportsDateStartInput?.value || '';
    const end = D.reportsDateEndInput.value;
    if (start && end && end < start) {
      start = end;
    }
    syncReportsDateRange(start, end);
  });

  D.reportsDateClearButton?.addEventListener('click', () => {
    syncReportsDateRange('', '');
  });

  D.reportsDateTodayButton?.addEventListener('click', () => {
    const today = getBogotaTodayKey();
    syncReportsDateRange(today, today);
  });

  D.reportsDateWeekButton?.addEventListener('click', () => {
    const end = getBogotaTodayKey();
    const start = shiftDateKey(end, -6);
    syncReportsDateRange(start, end);
  });

  D.reportsDateMonthButton?.addEventListener('click', () => {
    const end = getBogotaTodayKey();
    const start = `${end.slice(0, 7)}-01`;
    syncReportsDateRange(start, end);
  });

  D.downloadReportsPdfButton?.addEventListener('click', () => {
    UI.downloadFilteredReportsPdf();
  });

  D.clientTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.clientTab === 'equipment' ? 'equipment' : 'reports';
      showClientTab(tab);
    });
  });

  D.equipmentSearchInput?.addEventListener('input', () => {
    State.setEquipmentSearchTerm(D.equipmentSearchInput.value);
    State.resetEquipmentPagination();
    UI.renderEquipmentTable();
  });
  D.equipmentSearchClearButton?.addEventListener('click', () => {
    D.equipmentSearchInput.value = '';
    State.setEquipmentSearchTerm('');
    State.resetEquipmentPagination();
    UI.renderEquipmentTable();
  });

  D.openAdminPortalButton?.addEventListener('click', openAdminPortal);
  D.adminBackButton?.addEventListener('click', closeAdminPortal);
  D.adminLogoutButton?.addEventListener('click', () => {
    logoutAdmin();
    UI.showScreen('admin');
  });

  D.adminLoginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = D.adminPinInput.value.trim();
    if (await handleAdminLogin(pin)) {
      D.adminLoginError.textContent = '';
      D.adminContent.style.display = 'block';
      if (D.adminLoginCard) D.adminLoginCard.style.display = 'none';
      UI.renderAdminCompaniesTable();
      loadAdminEquipmentData(true);
      showAdminTab('companies');
    } else {
      D.adminLoginError.textContent = 'PIN incorrecto.';
    }
  });

  D.adminCompanySearch?.addEventListener('input', () => {
    State.setAdminCompanySearchTerm(D.adminCompanySearch.value);
    UI.renderAdminCompaniesTable();
  });
  D.adminCompanySearchClear?.addEventListener('click', () => {
    D.adminCompanySearch.value = '';
    State.setAdminCompanySearchTerm('');
    UI.renderAdminCompaniesTable();
  });

  D.adminTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.adminTab === 'equipment' ? 'equipment' : 'companies';
      showAdminTab(tab);
    });
  });

  D.adminEquipmentSearch?.addEventListener('input', () => {
    State.setAdminEquipmentSearchTerm(D.adminEquipmentSearch.value);
    State.resetAdminEquipmentPagination();
    UI.renderAdminEquipmentTable();
  });
  D.adminEquipmentSearchClear?.addEventListener('click', () => {
    D.adminEquipmentSearch.value = '';
    State.setAdminEquipmentSearchTerm('');
    State.resetAdminEquipmentPagination();
    UI.renderAdminEquipmentTable();
  });

  D.adminCompaniesTableBody?.addEventListener('click', (event) => {
    handleAdminActionClick(event.target as HTMLElement);
  });
  D.adminEquipmentTableBody?.addEventListener('click', (event) => {
    handleAdminActionClick(event.target as HTMLElement);
  });

  D.reportsTableBody?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('.view-report-btn');
    const row = target.closest<HTMLTableRowElement>('tr[data-report-id]');

    if (btn) {
      const reportId = btn.dataset.reportId;
      if (reportId) UI.openReportDetailsModal(reportId);
      return;
    }

    if (row && !target.closest('button')) {
      const reportId = row.dataset.reportId;
      if (reportId) UI.openReportDetailsModal(reportId);
    }
  });

  D.equipmentTableBody?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('.view-equipment-reports-btn');
    const row = target.closest<HTMLTableRowElement>('tr[data-search-key]');
    const searchKey = btn?.dataset.searchKey || row?.dataset.searchKey;

    if (!searchKey || !D.reportsSearchInput) return;

    D.reportsSearchInput.value = searchKey;
    D.reportsSearchInput.dispatchEvent(new Event('input'));
    showClientTab('reports');
    D.reportsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  D.closeReportDetailsModalButton?.addEventListener('click', UI.closeReportDetailsModal);
  D.closeReportDetailsButton?.addEventListener('click', UI.closeReportDetailsModal);
  D.downloadReportPdfButton?.addEventListener('click', () => {
    const reportId = D.reportDetailsModal?.dataset.reportId;
    if (reportId) UI.downloadReportPdf(reportId);
  });
}

export async function restoreClientSession(accessCode: string): Promise<boolean> {
  if (!accessCode) return false;
  return await loginClient(accessCode, true);
}

export async function restoreSessionsFromStorage(): Promise<boolean> {
  restoreAdminSessionFromStorage();
  const stored = localStorage.getItem(CLIENT_SESSION_KEY);
  if (!stored) return false;
  try {
    const parsed = JSON.parse(stored) as { accessCode?: string };
    if (parsed.accessCode) {
      return await loginClient(parsed.accessCode, true);
    }
  } catch (error) {
    console.error('Error restoring session:', error);
  }
  return false;
}
