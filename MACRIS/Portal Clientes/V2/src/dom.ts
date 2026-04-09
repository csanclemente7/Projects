export const loginScreen = document.getElementById('login-screen') as HTMLDivElement;
export const clientLoginForm = document.getElementById('client-login-form') as HTMLFormElement;
export const clientAccessCodeInput = document.getElementById('client-access-code') as HTMLInputElement;
export const clientLoginError = document.getElementById('client-login-error') as HTMLParagraphElement;
export const openAdminPortalButton = document.getElementById('open-admin-portal') as HTMLButtonElement;

export const clientTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-client-tab]'));
export const adminTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-admin-tab]'));

export const appScreen = document.getElementById('app-screen') as HTMLDivElement;
export const reportsSection = document.getElementById('reports-section') as HTMLDivElement;
export const equipmentSection = document.getElementById('equipment-section') as HTMLDivElement;
export const currentCompanyName = document.getElementById('current-company-name') as HTMLHeadingElement;
export const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
export const scanQrCameraButton = document.getElementById('scan-qr-camera-button') as HTMLButtonElement;
export const scanQrFileButton = document.getElementById('scan-qr-file-button') as HTMLButtonElement;
export const equipmentScanQrCameraButton = document.getElementById('equipment-scan-qr-camera-button') as HTMLButtonElement;
export const equipmentScanQrFileButton = document.getElementById('equipment-scan-qr-file-button') as HTMLButtonElement;
export const qrFileInput = document.getElementById('qr-file-input') as HTMLInputElement;
export const reportsSearchInput = document.getElementById('reports-search') as HTMLInputElement;
export const reportsSearchClearButton = document.getElementById('reports-search-clear') as HTMLButtonElement;
export const reportsCount = document.getElementById('reports-count') as HTMLDivElement;
export const reportsDateStartInput = document.getElementById('reports-date-start') as HTMLInputElement;
export const reportsDateEndInput = document.getElementById('reports-date-end') as HTMLInputElement;
export const reportsDateTodayButton = document.getElementById('reports-date-today') as HTMLButtonElement;
export const reportsDateWeekButton = document.getElementById('reports-date-week') as HTMLButtonElement;
export const reportsDateMonthButton = document.getElementById('reports-date-month') as HTMLButtonElement;
export const reportsDateClearButton = document.getElementById('reports-date-clear') as HTMLButtonElement;
export const downloadReportsPdfButton = document.getElementById('download-reports-pdf') as HTMLButtonElement;
export const reportsEmptyState = document.getElementById('reports-empty-state') as HTMLDivElement;
export const reportsTableBody = document.getElementById('reports-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const reportsPagination = document.getElementById('reports-pagination') as HTMLDivElement;
export const equipmentSearchInput = document.getElementById('equipment-search') as HTMLInputElement;
export const equipmentSearchClearButton = document.getElementById('equipment-search-clear') as HTMLButtonElement;
export const equipmentTableBody = document.getElementById('equipment-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const equipmentPagination = document.getElementById('equipment-pagination') as HTMLDivElement;

export const adminScreen = document.getElementById('admin-screen') as HTMLDivElement;
export const adminLoginCard = document.getElementById('admin-login-card') as HTMLDivElement;
export const adminLoginForm = document.getElementById('admin-login-form') as HTMLFormElement;
export const adminPinInput = document.getElementById('admin-pin-input') as HTMLInputElement;
export const adminLoginError = document.getElementById('admin-login-error') as HTMLParagraphElement;
export const adminContent = document.getElementById('admin-content') as HTMLDivElement;
export const adminCompanySearch = document.getElementById('admin-company-search') as HTMLInputElement;
export const adminCompanySearchClear = document.getElementById('admin-company-search-clear') as HTMLButtonElement;
export const adminCompaniesTableBody = document.getElementById('admin-companies-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const adminCompaniesSection = document.getElementById('admin-companies-section') as HTMLDivElement;
export const adminEquipmentSection = document.getElementById('admin-equipment-section') as HTMLDivElement;
export const adminEquipmentSearch = document.getElementById('admin-equipment-search') as HTMLInputElement;
export const adminEquipmentSearchClear = document.getElementById('admin-equipment-search-clear') as HTMLButtonElement;
export const adminEquipmentTableBody = document.getElementById('admin-equipment-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const adminEquipmentPagination = document.getElementById('admin-equipment-pagination') as HTMLDivElement;
export const adminBackButton = document.getElementById('admin-back-button') as HTMLButtonElement;
export const adminLogoutButton = document.getElementById('admin-logout-button') as HTMLButtonElement;

export const cameraScanModal = document.getElementById('camera-scan-modal') as HTMLDivElement;
export const closeCameraScanModalButton = document.getElementById('close-camera-scan-modal') as HTMLSpanElement;
export const qrVideoElement = document.getElementById('qr-video') as HTMLVideoElement;
export const qrHiddenCanvasElement = document.getElementById('qr-canvas-hidden') as HTMLCanvasElement;
export const cameraScanFeedback = document.getElementById('camera-scan-feedback') as HTMLParagraphElement;
export const cancelCameraScanButton = document.getElementById('cancel-camera-scan') as HTMLButtonElement;

export const reportDetailsModal = document.getElementById('report-details-modal') as HTMLDivElement;
export const closeReportDetailsModalButton = document.getElementById('close-report-details-modal') as HTMLSpanElement;
export const reportDetailsContent = document.getElementById('report-details-content') as HTMLDivElement;
export const downloadReportPdfButton = document.getElementById('download-report-pdf') as HTMLButtonElement;
export const closeReportDetailsButton = document.getElementById('close-report-details') as HTMLButtonElement;

export const reportsDownloadConfirmModal = document.getElementById('reports-download-confirm-modal') as HTMLDivElement;
export const reportsDownloadConfirmText = document.getElementById('reports-download-confirm-text') as HTMLParagraphElement;
export const closeReportsDownloadConfirmButton = document.getElementById('close-reports-download-confirm') as HTMLSpanElement;
export const reportsDownloadCancelButton = document.getElementById('reports-download-cancel') as HTMLButtonElement;
export const reportsDownloadConfirmButton = document.getElementById('reports-download-confirm') as HTMLButtonElement;

export const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
export const notificationArea = document.getElementById('app-notification-area') as HTMLDivElement;
