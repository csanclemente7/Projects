// --- DOM Elements ---
export const loginScreen = document.getElementById('login-screen') as HTMLDivElement;
export const appScreen = document.getElementById('app-screen') as HTMLDivElement;
export const loginForm = document.getElementById('login-form') as HTMLFormElement;
export const usernameInput = document.getElementById('username') as HTMLSelectElement;
export const passwordInput = document.getElementById('password') as HTMLInputElement;
export const loginError = document.getElementById('login-error') as HTMLParagraphElement;
export const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
export const currentUserDisplay = document.getElementById('current-user-display') as HTMLSpanElement;
export const userPointsDisplay = document.getElementById('user-points-display') as HTMLSpanElement;

export const adminLoginButton = document.getElementById('admin-login-button') as HTMLButtonElement;


export const appHeaderTitle = document.querySelector('#app-screen header h1') as HTMLElement;
export const bottomNav = document.getElementById('bottom-nav') as HTMLElement;
export const allSections = document.querySelectorAll('#app-screen main .data-section') as NodeListOf<HTMLElement>;

// Worker Section Elements
export const workerOrdersSection = document.getElementById('worker-orders-section') as HTMLElement;
export const workerOrdersListContainer = document.getElementById('worker-orders-list-container') as HTMLDivElement;
export const scanQrCameraButton = document.getElementById('scan-qr-camera-button') as HTMLButtonElement;
export const scanQrFromFileButton = document.getElementById('scan-qr-file-button') as HTMLButtonElement;
export const qrFileInput = document.getElementById('qr-file-input') as HTMLInputElement;
export const createManualReportButton = document.getElementById('create-manual-report-button') as HTMLButtonElement;
export const searchByIdButton = document.getElementById('search-by-id-button') as HTMLButtonElement;

// My Reports Table
export const myReportsTableBody = document.getElementById('my-reports-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const myReportsSearchInput = document.getElementById('my-reports-search') as HTMLInputElement;
export const myReportsSearchClearButton = document.getElementById('my-reports-search-clear') as HTMLButtonElement;
export const myReportsPaginationContainer = document.getElementById('my-reports-pagination') as HTMLDivElement;
export const toggleMyReportsViewButton = document.getElementById('toggle-my-reports-view-button') as HTMLButtonElement;


// Admin Section Elements
export const adminOrdersSection = document.getElementById('admin-orders-section') as HTMLElement;
export const adminOrdersListContainer = document.getElementById('admin-orders-list-container') as HTMLDivElement;
export const toggleOrderFiltersBtn = document.getElementById('toggle-order-filters-btn') as HTMLButtonElement;
export const adminOrderFiltersCollapsibleArea = document.getElementById('admin-order-filters-collapsible-area') as HTMLDivElement;
export const filterOrderDateStart = document.getElementById('filter-order-date-start') as HTMLInputElement;
export const filterOrderDateEnd = document.getElementById('filter-order-date-end') as HTMLInputElement;
export const filterOrderStatus = document.getElementById('filter-order-status') as HTMLSelectElement;
export const filterOrderType = document.getElementById('filter-order-type') as HTMLSelectElement;
export const filterOrderTechnician = document.getElementById('filter-order-technician') as HTMLSelectElement;
export const adminOrdersSearchInput = document.getElementById('admin-orders-search') as HTMLInputElement;
export const adminOrdersSearchClearButton = document.getElementById('admin-orders-search-clear') as HTMLButtonElement;
export const adminOrdersPaginationContainer = document.getElementById('admin-orders-pagination') as HTMLDivElement;
export const aiReconciliationBtn = document.getElementById('ai-reconciliation-btn') as HTMLButtonElement;

export const downloadZipButton = document.getElementById('download-zip-button') as HTMLButtonElement;
export const downloadMergedPdfButton = document.getElementById('download-merged-pdf-button') as HTMLButtonElement;
export const deleteAllReportsButton = document.getElementById('delete-all-reports-button') as HTMLButtonElement;
export const adminReportsTableBody = document.getElementById('admin-reports-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const adminReportsSearchInput = document.getElementById('admin-reports-search') as HTMLInputElement;
export const adminReportsSearchClearButton = document.getElementById('admin-reports-search-clear') as HTMLButtonElement;
export const adminReportsPaginationContainer = document.getElementById('admin-reports-pagination') as HTMLDivElement;
export const filterReportDateStart = document.getElementById('filter-report-date-start') as HTMLInputElement;
export const filterReportDateEnd = document.getElementById('filter-report-date-end') as HTMLInputElement;
export let filterReportCity = document.getElementById('filter-report-city') as HTMLSelectElement;
export let filterReportCompany = document.getElementById('filter-report-company') as HTMLSelectElement;
export const filterReportServiceType = document.getElementById('filter-report-service-type') as HTMLSelectElement;
export let filterReportTechnician = document.getElementById('filter-report-technician') as HTMLSelectElement;
export const filterReportCategory = document.getElementById('filter-report-category') as HTMLSelectElement;
export const filterReportPaid = document.getElementById('filter-report-paid') as HTMLSelectElement;
export const toggleFiltersBtn = document.getElementById('toggle-filters-btn') as HTMLButtonElement;
export const adminFiltersCollapsibleArea = document.getElementById('admin-filters-collapsible-area') as HTMLDivElement;

export const adminScheduleTableBody = document.getElementById('admin-schedule-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const adminSchedulePaginationContainer = document.getElementById('admin-schedule-pagination') as HTMLDivElement;

export const addEquipmentButton = document.getElementById('add-equipment-button') as HTMLButtonElement;
export const adminEquipmentTableBody = document.getElementById('admin-equipment-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const adminEquipmentSearchInput = document.getElementById('admin-equipment-search') as HTMLInputElement;
export const adminEquipmentSearchClearButton = document.getElementById('admin-equipment-search-clear') as HTMLButtonElement;
export const adminEquipmentPaginationContainer = document.getElementById('admin-equipment-pagination') as HTMLDivElement;

// Admin Management Tab Controls
export const adminManagementSection = document.getElementById('admin-management-section') as HTMLElement;
export const tabLinks = adminManagementSection.querySelectorAll('.tabs .tab-link');
export const tabContents = adminManagementSection.querySelectorAll('.tab-content');

export const addCityButton = document.getElementById('add-city-button') as HTMLButtonElement;
export const citiesTableBody = document.getElementById('cities-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const addCompanyButton = document.getElementById('add-company-button') as HTMLButtonElement;
export const companiesTableBody = document.getElementById('companies-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const addDependencyButton = document.getElementById('add-dependency-button') as HTMLButtonElement;
export const dependenciesTableBody = document.getElementById('dependencies-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const addEmployeeButton = document.getElementById('add-employee-button') as HTMLButtonElement;
export const employeesTableBody = document.getElementById('employees-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const appSettingsContainer = document.getElementById('app-settings-container') as HTMLDivElement;


// Report Form Modal Elements
export const reportFormModal = document.getElementById('report-form-modal') as HTMLDivElement;
export const closeReportFormModalButton = document.getElementById('close-report-form-modal') as HTMLSpanElement;
export const maintenanceReportForm = document.getElementById('maintenance-report-form') as HTMLFormElement;
export const reportIdInput = document.getElementById('report-id') as HTMLInputElement; // For editing
export const reportEquipmentIdHidden = document.getElementById('report-equipment-id-hidden') as HTMLInputElement;
export const reportOrderIdHidden = document.getElementById('report-order-id-hidden') as HTMLInputElement;
export const reportOrderItemIdHidden = document.getElementById('report-order-item-id-hidden') as HTMLInputElement;
export const reportServiceTypeSelect = document.getElementById('report-service-type') as HTMLSelectElement;
export const reportServiceTypeOtherContainer = document.getElementById('report-service-type-other-container') as HTMLDivElement;
export const reportServiceTypeOtherInput = document.getElementById('report-service-type-other') as HTMLInputElement;
export const aiScanPlateButton = document.getElementById('ai-scan-plate-button') as HTMLButtonElement;
export const reportCitySelectEmpresa = document.getElementById('report-city-empresa') as HTMLSelectElement;
export const reportCitySelectResidencial = document.getElementById('report-city-residencial') as HTMLSelectElement;
export let reportCompanySelect = document.getElementById('report-company') as HTMLSelectElement;
export const reportCompanySearchContainer = document.getElementById('report-company-search-container') as HTMLDivElement;
export const reportCompanySearchInput = document.getElementById('report-company-search') as HTMLInputElement;
export const reportCompanySearchResults = document.getElementById('report-company-search-results') as HTMLDivElement;
export const reportCompanySelectedBadge = document.getElementById('report-company-selected-badge') as HTMLDivElement;
export const reportCompanyBadgeName = document.querySelector('#report-company-selected-badge .company-badge-name') as HTMLSpanElement;
export const reportCompanyBadgeClearButton = document.getElementById('report-company-badge-clear') as HTMLButtonElement;
export let reportDependencySelect = document.getElementById('report-dependency') as HTMLSelectElement;
export const reportEquipmentModelInput = document.getElementById('report-equipment-model') as HTMLInputElement;
export const reportEquipmentBrandInput = document.getElementById('report-equipment-brand') as HTMLInputElement;
export const reportEquipmentTypeSelect = document.getElementById('report-equipment-type') as HTMLSelectElement;
export const reportEquipmentCapacityInput = document.getElementById('report-equipment-capacity') as HTMLInputElement;
export const reportEquipmentRefrigerantSelect = document.getElementById('report-equipment-refrigerant') as HTMLSelectElement;
export const reportPressureInput = document.getElementById('report-pressure') as HTMLInputElement;
export const reportAmperageInput = document.getElementById('report-amperage') as HTMLInputElement;
export const reportObservationsTextarea = document.getElementById('report-observations') as HTMLTextAreaElement;
export const openSignatureModalButton = document.getElementById('open-signature-modal-button') as HTMLButtonElement;
export const signaturePreviewContainer = document.getElementById('signature-preview-container') as HTMLDivElement;
export const signaturePreviewImage = document.getElementById('signature-preview-image') as HTMLImageElement;
export const signatureModalPreviewTitle = document.getElementById('signature-modal-preview-title') as HTMLParagraphElement;
export const signatureModalPreviewImage = document.getElementById('signature-modal-preview-image') as HTMLImageElement;
export const signatureModalPreviewPlaceholder = document.getElementById('signature-modal-preview-placeholder') as HTMLSpanElement;
export const signaturePlaceholderText = document.getElementById('signature-placeholder-text') as HTMLSpanElement;
export const reportWorkerNameInput = document.getElementById('report-worker-name') as HTMLInputElement;
export const saveReportButton = document.getElementById('save-report-button') as HTMLButtonElement;
export const cancelReportButton = document.getElementById('cancel-report-button') as HTMLButtonElement;
export const reportLocationEmpresaContainer = document.getElementById('report-location-empresa-container') as HTMLDivElement;
export const reportLocationResidencialContainer = document.getElementById('report-location-residencial-container') as HTMLDivElement;
export const reportAddressInput = document.getElementById('report-address') as HTMLInputElement;
export const reportClientNameInput = document.getElementById('report-client-name') as HTMLInputElement;
export const reportInstallationItemsContainer = document.getElementById('report-installation-items-container') as HTMLDivElement;
export const reportInstallationItemsTableBody = document.getElementById('report-installation-items-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const reportEquipmentFieldsContainer = document.getElementById('report-equipment-fields-container') as HTMLDivElement;
export const reportInstallationPhotosContainer = document.getElementById('report-installation-photos-container') as HTMLDivElement;
export const reportMeasurementsContainer = document.getElementById('report-measurements-container') as HTMLDivElement;

// reportInstallationPhotosContainer elements (new)
export const takeInternalUnitPhotoButton = document.getElementById('take-internal-unit-photo-button') as HTMLButtonElement;
export const uploadInternalUnitPhotoButton = document.getElementById('upload-internal-unit-photo-button') as HTMLButtonElement;
export const uploadInternalUnitInput = document.getElementById('upload-internal-unit-input') as HTMLInputElement;
export const photoInternalUnitPreview = document.getElementById('photo-internal-unit-preview') as HTMLImageElement;
export const photoInternalUnitPlaceholder = document.getElementById('photo-internal-unit-placeholder') as HTMLDivElement;
export const takeExternalUnitPhotoButton = document.getElementById('take-external-unit-photo-button') as HTMLButtonElement;
export const uploadExternalUnitPhotoButton = document.getElementById('upload-external-unit-photo-button') as HTMLButtonElement;
export const uploadExternalUnitInput = document.getElementById('upload-external-unit-input') as HTMLInputElement;
export const photoExternalUnitPreview = document.getElementById('photo-external-unit-preview') as HTMLImageElement;
export const photoExternalUnitPlaceholder = document.getElementById('photo-external-unit-placeholder') as HTMLDivElement;


// Signature Modal Elements
export const signatureModal = document.getElementById('signature-modal') as HTMLDivElement;
export const closeSignatureModalButton = document.getElementById('close-signature-modal') as HTMLSpanElement;
export const signatureCanvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
export const saveSignatureButton = document.getElementById('save-signature-button') as HTMLButtonElement;
export const clearSignatureButton = document.getElementById('clear-signature-button') as HTMLButtonElement;


// Camera Scan Modal Elements
export const cameraScanModal = document.getElementById('camera-scan-modal') as HTMLDivElement;
export const closeCameraScanModalButton = document.getElementById('close-camera-scan-modal') as HTMLSpanElement;
export const qrVideoElement = document.getElementById('qr-video') as HTMLVideoElement;
export const qrHiddenCanvasElement = document.getElementById('qr-canvas-hidden') as HTMLCanvasElement;
export const cancelCameraScanButton = document.getElementById('cancel-camera-scan-button') as HTMLButtonElement;
export const cameraScanFeedback = document.getElementById('camera-scan-feedback') as HTMLParagraphElement;

// Plate Scan Modal (AI) Elements
export const plateScanModal = document.getElementById('plate-scan-modal') as HTMLDivElement;
export const closePlateScanModal = document.getElementById('close-plate-scan-modal') as HTMLSpanElement;
export const plateVideoElement = document.getElementById('plate-video') as HTMLVideoElement;
export const plateHiddenCanvasElement = document.getElementById('plate-canvas-hidden') as HTMLCanvasElement;
export const takePictureButton = document.getElementById('take-picture-button') as HTMLButtonElement;
export const cancelPlateScanButton = document.getElementById('cancel-plate-scan-button') as HTMLButtonElement;
export const plateScanFeedback = document.getElementById('plate-scan-feedback') as HTMLParagraphElement;
export const aiScanOfflineWarning = document.getElementById('ai-scan-offline-warning') as HTMLParagraphElement;

// Photo Capture Modal (for installation photos)
export const photoCaptureModal = document.getElementById('photo-capture-modal') as HTMLDivElement;
export const closePhotoCaptureModalButton = document.getElementById('close-photo-capture-modal') as HTMLSpanElement;
export const photoCaptureTitle = document.getElementById('photo-capture-title') as HTMLHeadingElement;
export const photoCaptureVideo = document.getElementById('photo-capture-video') as HTMLVideoElement;
export const photoCaptureHiddenCanvas = document.getElementById('photo-capture-canvas-hidden') as HTMLCanvasElement;
export const photoCaptureFeedback = document.getElementById('photo-capture-feedback') as HTMLParagraphElement;
export const cancelPhotoCaptureButton = document.getElementById('cancel-photo-capture-button') as HTMLButtonElement;
export const capturePhotoButton = document.getElementById('capture-photo-button') as HTMLButtonElement;
export const photoCaptureUploadInput = document.getElementById('photo-capture-upload-input') as HTMLInputElement;
export const photoCaptureUploadButton = document.getElementById('photo-capture-upload-button') as HTMLButtonElement;


// Entity Form Modal Elements
export const entityFormModal = document.getElementById('entity-form-modal') as HTMLDivElement;
export const closeEntityFormModalButton = document.getElementById('close-entity-form-modal') as HTMLSpanElement;
export const entityFormTitle = document.getElementById('entity-form-title') as HTMLHeadingElement;
export const entityForm = document.getElementById('entity-form') as HTMLFormElement;
export const entityIdInput = document.getElementById('entity-id') as HTMLInputElement;
export const entityTypeInput = document.getElementById('entity-type') as HTMLInputElement;
export const entityFormFieldsContainer = document.getElementById('entity-form-fields-container') as HTMLDivElement;
export const saveEntityButton = document.getElementById('save-entity-button') as HTMLButtonElement;
export const cancelEntityButton = document.getElementById('cancel-entity-button') as HTMLButtonElement;

// View Report Details Modal
export const viewReportDetailsModal = document.getElementById('view-report-details-modal') as HTMLDivElement;
export const closeViewReportDetailsModalButton = document.getElementById('close-view-report-details-modal') as HTMLSpanElement;
export const viewReportIdDisplay = document.getElementById('view-report-id-display') as HTMLSpanElement;
export const viewReportDetailsContent = document.getElementById('view-report-details-content') as HTMLDivElement;
export const downloadReportPdfButton = document.getElementById('download-report-pdf-button') as HTMLButtonElement;
export const closeViewReportButton = document.getElementById('close-view-report-button') as HTMLButtonElement;
export const editReportLocationButton = document.getElementById('edit-report-location-button') as HTMLButtonElement;
export const editSignatureFromViewButton = document.getElementById('edit-signature-from-view-button') as HTMLButtonElement;

// Edit Report Assignment Modal (Unified)
export const editReportAssignmentModal = document.getElementById('edit-report-assignment-modal') as HTMLDivElement;
export const closeEditReportAssignmentModal = document.getElementById('close-edit-report-assignment-modal') as HTMLSpanElement;
export const editReportAssignmentForm = document.getElementById('edit-report-assignment-form') as HTMLFormElement;
export const editReportAssignmentReportId = document.getElementById('edit-report-assignment-report-id') as HTMLInputElement;
export const editCategoryEmpresaRadio = document.getElementById('edit-category-empresa-radio') as HTMLInputElement;
export const editCategoryResidencialRadio = document.getElementById('edit-category-residencial-radio') as HTMLInputElement;
export const editAssignmentEmpresaFields = document.getElementById('edit-assignment-empresa-fields') as HTMLDivElement;
export const editAssignmentResidencialFields = document.getElementById('edit-assignment-residencial-fields') as HTMLDivElement;
export const editReportCompanySelect = document.getElementById('edit-report-company') as HTMLSelectElement;
export const editReportCityInput = document.getElementById('edit-report-city') as HTMLInputElement;
export const editReportDependencySelect = document.getElementById('edit-report-dependency') as HTMLSelectElement;
export const editReportDependencyWarning = document.getElementById('edit-report-dependency-warning') as HTMLParagraphElement;
export const editReportClientNameInput = document.getElementById('edit-report-client-name') as HTMLInputElement;
export const editReportClientAddressInput = document.getElementById('edit-report-client-address') as HTMLInputElement;
export const editReportClientCitySelect = document.getElementById('edit-report-client-city') as HTMLSelectElement;
export const cancelEditReportAssignmentButton = document.getElementById('cancel-edit-report-assignment-button') as HTMLButtonElement;
export const saveEditReportAssignmentButton = document.getElementById('save-edit-report-assignment-button') as HTMLButtonElement;


// Order Details Modal
export const orderDetailsModal = document.getElementById('order-details-modal') as HTMLDivElement;
export const closeOrderDetailsModalButton = document.getElementById('close-order-details-modal') as HTMLSpanElement;
export const closeOrderDetailsButton = document.getElementById('close-order-details-button') as HTMLButtonElement;
export const orderManualIdHeader = document.getElementById('order-manual-id-header') as HTMLSpanElement;
export const orderClientName = document.getElementById('order-client-name') as HTMLSpanElement;
export const orderClientAddress = document.getElementById('order-client-address') as HTMLSpanElement;
export const orderClientCity = document.getElementById('order-client-city') as HTMLSpanElement;
export const orderClientPhone = document.getElementById('order-client-phone') as HTMLSpanElement;
export const orderClientEmail = document.getElementById('order-client-email') as HTMLSpanElement;
export const orderServiceDate = document.getElementById('order-service-date') as HTMLSpanElement;
export const orderType = document.getElementById('order-type') as HTMLSpanElement;
export const orderNotes = document.getElementById('order-notes') as HTMLSpanElement;
export const orderImagesContainer = document.getElementById('order-images-container') as HTMLDivElement;
export const orderServicesTableBody = document.getElementById('order-services-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const orderMaterialsTableBody = document.getElementById('order-materials-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const orderServicesEmpty = document.getElementById('order-services-empty') as HTMLDivElement;
export const orderMaterialsEmpty = document.getElementById('order-materials-empty') as HTMLDivElement;
export const orderAssignedTechniciansList = document.getElementById('order-assigned-technicians-list') as HTMLDivElement;
export const startReportFromOrderButton = document.getElementById('start-report-from-order-button') as HTMLButtonElement;

// Admin Login Modal
export const adminPasswordModal = document.getElementById('admin-password-modal') as HTMLDivElement;
export const closeAdminPasswordModal = document.getElementById('close-admin-password-modal') as HTMLSpanElement;
export const adminPasswordForm = document.getElementById('admin-password-form') as HTMLFormElement;
export const adminPasswordInput = document.getElementById('admin-password-input') as HTMLInputElement;
export const adminPasswordError = document.getElementById('admin-password-error') as HTMLParagraphElement;

// Change Password Button in Header
export const changePasswordActionButton = document.getElementById('change-password-action-button') as HTMLButtonElement;

// Change Password Modal
export const changePasswordModal = document.getElementById('change-password-modal') as HTMLDivElement;
export const closeChangePasswordModal = document.getElementById('close-change-password-modal') as HTMLSpanElement;
export const changePasswordForm = document.getElementById('change-password-form') as HTMLFormElement;
export const currentPasswordInput = document.getElementById('current-password-input') as HTMLInputElement;
export const newPasswordInput = document.getElementById('new-password-input') as HTMLInputElement;
export const confirmNewPasswordInput = document.getElementById('confirm-new-password-input') as HTMLInputElement;
export const savePasswordButton = document.getElementById('save-password-button') as HTMLButtonElement;
export const cancelChangePasswordButton = document.getElementById('cancel-change-password-button') as HTMLButtonElement;
export const changePasswordError = document.getElementById('change-password-error') as HTMLParagraphElement;


// Shared Modals (Reused from previous app structure)
export const confirmationModal = document.getElementById('confirmation-modal') as HTMLDivElement;
export const confirmationMessage = document.getElementById('confirmation-message') as HTMLParagraphElement;
export const confirmActionButton = document.getElementById('confirm-action-button') as HTMLButtonElement;
export const cancelActionButton = document.getElementById('cancel-action-button') as HTMLButtonElement;
export const closeConfirmationModalButton = document.getElementById('close-confirmation-modal-button') as HTMLButtonElement;

export const imagePreviewModal = document.getElementById('image-preview-modal') as HTMLDivElement;
export const imagePreviewContent = document.getElementById('image-preview-content') as HTMLImageElement;
export const closeImagePreviewModalButton = document.getElementById('close-image-preview-modal') as HTMLButtonElement;

// Category Selection Modal
export const categorySelectionModal = document.getElementById('category-selection-modal') as HTMLDivElement;
export const closeCategorySelectionModalButton = document.getElementById('close-category-selection-modal') as HTMLSpanElement;
export const selectCategoryEmpresaButton = document.getElementById('select-category-empresa') as HTMLButtonElement;
export const selectCategoryResidencialButton = document.getElementById('select-category-residencial') as HTMLButtonElement;
export const cancelCategorySelectionButton = document.getElementById('cancel-category-selection-button') as HTMLButtonElement;

// Equipment Selection Modal
export const equipmentSelectionModal = document.getElementById('equipment-selection-modal') as HTMLDivElement;
export const closeEquipmentSelectionModalButton = document.getElementById('close-equipment-selection-modal') as HTMLSpanElement;
export const equipmentSelectionSearchInput = document.getElementById('equipment-selection-search-input') as HTMLInputElement;
export const equipmentSelectionSearchResults = document.getElementById('equipment-selection-search-results') as HTMLDivElement;
export const createNewEquipmentFromSelectionBtn = document.getElementById('create-new-equipment-from-selection-btn') as HTMLButtonElement;
export const continueWithoutEquipmentButton = document.getElementById('continue-without-equipment-button') as HTMLButtonElement;
export const cancelEquipmentSelectionButton = document.getElementById('cancel-equipment-selection-button') as HTMLButtonElement;

// AI Reconciliation Modal
export const aiReconciliationModal = document.getElementById('ai-reconciliation-modal') as HTMLDivElement;
export const closeAiReconciliationModal = document.getElementById('close-ai-reconciliation-modal') as HTMLSpanElement;
export const aiReconciliationResults = document.getElementById('ai-reconciliation-results') as HTMLDivElement;
export const closeAiReconciliationBtn = document.getElementById('close-ai-reconciliation-btn') as HTMLButtonElement;

// Redeem Points Modal
export const redeemPointsModal = document.getElementById('redeem-points-modal') as HTMLDivElement;
export const closeRedeemPointsModal = document.getElementById('close-redeem-points-modal') as HTMLSpanElement;
export const redeemPointsForm = document.getElementById('redeem-points-form') as HTMLFormElement;
export const redeemPointsUserId = document.getElementById('redeem-points-user-id') as HTMLInputElement;
export const redeemPointsEmployeeName = document.getElementById('redeem-points-employee-name') as HTMLSpanElement;
export const redeemPointsCurrentPoints = document.getElementById('redeem-points-current-points') as HTMLSpanElement;
export const pointsToRedeemInput = document.getElementById('points-to-redeem') as HTMLInputElement;
export const cancelRedeemPointsButton = document.getElementById('cancel-redeem-points-button') as HTMLButtonElement;
export const confirmRedeemPointsButton = document.getElementById('confirm-redeem-points-button') as HTMLButtonElement;
export const redeemPointsError = document.getElementById('redeem-points-error') as HTMLParagraphElement;

export const adminPhotoUploadInput = document.getElementById('admin-photo-upload-input') as HTMLInputElement;
export const notificationArea = document.getElementById('app-notification-area') as HTMLDivElement;
export const toggleFullscreenButton = document.getElementById('toggle-fullscreen-button') as HTMLButtonElement;
export const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
