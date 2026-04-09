import '../index.css';
import * as State from './state';
import * as D from './dom';
import * as UI from './ui';
import { fetchCities, fetchCompanies } from './api';
import { initQrScanner } from './lib/qr-scanner';
import { setupEventListeners, restoreClientSession, restoreSessionsFromStorage, restoreAdminSessionFromStorage, openAdminPortal } from './events';
import { formatDate, normalizeAccessCode, normalizeSearchTerm } from './utils';

type QrScanContext = 'reports' | 'equipment';

let qrScanContext: QrScanContext = 'reports';
let qrScanContextOverride: QrScanContext | null = null;

function applyScanContext(fallback: QrScanContext) {
  if (qrScanContextOverride) {
    qrScanContext = qrScanContextOverride;
    qrScanContextOverride = null;
    return;
  }
  qrScanContext = fallback;
}

function countMatchingReports(searchValue: string): number {
  const searchTerm = normalizeSearchTerm(searchValue);
  const searchTermCompact = normalizeAccessCode(searchValue);
  if (!searchTerm && !searchTermCompact) return 0;

  return State.reports.filter(report => {
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
    return normalizedString.includes(searchTerm) || compactString.includes(searchTermCompact);
  }).length;
}

function countMatchingEquipment(searchValue: string): number {
  const searchTerm = normalizeSearchTerm(searchValue);
  const searchTermCompact = normalizeAccessCode(searchValue);
  if (!searchTerm && !searchTermCompact) return 0;

  return State.equipmentList.filter(equipment => {
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
  }).length;
}

function showScanResultNotification(context: QrScanContext, searchValue: string) {
  if (context === 'reports') {
    const count = countMatchingReports(searchValue);
    if (count > 0) {
      const label = count === 1 ? 'reporte' : 'reportes';
      const verb = count === 1 ? 'Se encontro' : 'Se encontraron';
      const hint = count === 1
        ? 'Abre el reporte desde la tabla para ver los detalles.'
        : 'Usa la tabla de reportes para navegar entre ellos.';
      UI.showAppNotification(`${verb} ${count} ${label} asociados. ${hint}`, 'success', 6000);
      return;
    }
    UI.showAppNotification('No se encontraron reportes asociados a este QR. Valida el código o intenta otro.', 'warning', 6000);
    return;
  }

  const count = countMatchingEquipment(searchValue);
  if (count > 0) {
    const label = count === 1 ? 'equipo' : 'equipos';
    const verb = count === 1 ? 'Se encontro' : 'Se encontraron';
    const hint = count === 1
      ? 'Usa la tabla de equipos para verlo y abrir sus reportes.'
      : 'Usa la tabla de equipos para navegar entre ellos.';
    UI.showAppNotification(`${verb} ${count} ${label}. ${hint}`, 'success', 6000);
    return;
  }
  UI.showAppNotification('No se encontraron equipos asociados a este QR. Valida el código o intenta otro.', 'warning', 6000);
}

async function bootstrap() {
  UI.showLoader('Cargando empresas...');
  try {
    const [cities, companies] = await Promise.all([fetchCities(), fetchCompanies()]);
    State.setCities(cities);
    State.setCompanies(companies);

    const params = new URLSearchParams(window.location.search);
    const accessCode = params.get('empresa') || params.get('company') || params.get('cliente') || params.get('client');
    const openAdmin = params.get('admin') === '1';

    setupEventListeners();

    initQrScanner({
      scanQrCameraButton: D.scanQrCameraButton,
      scanQrFromFileButton: D.scanQrFileButton,
      qrFileInput: D.qrFileInput,
      cameraScanModal: D.cameraScanModal,
      closeCameraScanModalButton: D.closeCameraScanModalButton,
      qrVideoElement: D.qrVideoElement,
      qrHiddenCanvasElement: D.qrHiddenCanvasElement,
      cancelCameraScanButton: D.cancelCameraScanButton,
      cameraScanFeedback: D.cameraScanFeedback,
      showLoader: UI.showLoader,
      hideLoader: UI.hideLoader,
      showAppNotification: UI.showAppNotification,
      handleQrCodeResult: (data) => {
        const manualId = data.trim();
        if (!manualId) {
          UI.showAppNotification('El código QR esta vacio.', 'warning');
          return;
        }
        D.reportsSearchInput.value = manualId;
        D.reportsSearchInput.dispatchEvent(new Event('input'));
        if (D.equipmentSearchInput) {
          D.equipmentSearchInput.value = manualId;
          D.equipmentSearchInput.dispatchEvent(new Event('input'));
        }
        showScanResultNotification(qrScanContext, manualId);
      },
    });

    const setReportScanContext = () => applyScanContext('reports');
    D.scanQrCameraButton?.addEventListener('click', setReportScanContext);
    D.scanQrFileButton?.addEventListener('click', setReportScanContext);

    const triggerCameraScan = () => {
      qrScanContextOverride = 'equipment';
      D.scanQrCameraButton?.click();
    };
    const triggerFileScan = () => {
      qrScanContextOverride = 'equipment';
      D.scanQrFileButton?.click();
    };
    D.equipmentScanQrCameraButton?.addEventListener('click', triggerCameraScan);
    D.equipmentScanQrFileButton?.addEventListener('click', triggerFileScan);

    if (openAdmin) {
      restoreAdminSessionFromStorage();
      openAdminPortal();
    } else if (accessCode) {
      await restoreClientSession(accessCode);
    } else {
      const restored = await restoreSessionsFromStorage();
      if (!restored) {
        UI.showScreen('login');
      }
    }
  } catch (error) {
    console.error('Bootstrap error:', error);
    UI.showAppNotification('No se pudo iniciar el portal.', 'error');
  } finally {
    UI.hideLoader();
  }
}

bootstrap().catch(console.error);



