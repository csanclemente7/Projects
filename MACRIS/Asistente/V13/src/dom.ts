
// Layout & Screens
export const loadingOverlay = document.getElementById('loading-overlay');
export const loginScreen = document.getElementById('login-screen');
export const appScreen = document.getElementById('app-screen');
export const bottomNav = document.getElementById('bottom-nav');
export const currentUserDisplay = document.getElementById('current-user-display');
export const adminManagementSection = document.getElementById('admin-management-section');
export const adminFiltersCollapsibleArea = document.getElementById('admin-filters-collapsible');
export const adminOrderFiltersCollapsibleArea = document.getElementById('admin-order-filters-collapsible');

// Forms
export const loginForm = document.getElementById('login-form') as HTMLFormElement;
export const adminPasswordForm = document.getElementById('admin-password-form') as HTMLFormElement;
export const changePasswordForm = document.getElementById('change-password-form') as HTMLFormElement;
export const maintenanceReportForm = document.getElementById('maintenance-report-form') as HTMLFormElement;
export const entityForm = document.getElementById('entity-form') as HTMLFormElement;
export const editReportAssignmentForm = document.getElementById('edit-report-assignment-form') as HTMLFormElement;
export const redeemPointsForm = document.getElementById('redeem-points-form') as HTMLFormElement;

// Inputs
// FIX: usernameInput is a select element for picking workers.
export const usernameInput = document.getElementById('username') as HTMLSelectElement;
export const passwordInput = document.getElementById('password') as HTMLInputElement;
export const adminPasswordInput = document.getElementById('admin-password-input') as HTMLInputElement;
export const currentPasswordInput = document.getElementById('current-password') as HTMLInputElement;
export const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
export const confirmNewPasswordInput = document.getElementById('confirm-new-password') as HTMLInputElement;
export const globalSearch = document.getElementById('global-search') as HTMLInputElement;
export const dateStart = document.getElementById('date-start') as HTMLInputElement;
export const dateEnd = document.getElementById('date-end') as HTMLInputElement;
export const myReportsSearchInput = document.getElementById('my-reports-search') as HTMLInputElement;
export const myReportsSearchClearButton = document.getElementById('my-reports-search-clear');
export const adminReportsSearchInput = document.getElementById('admin-reports-search') as HTMLInputElement;
export const adminReportsSearchClearButton = document.getElementById('admin-reports-search-clear');
export const adminOrdersSearchInput = document.getElementById('admin-orders-search') as HTMLInputElement;
export const adminOrdersSearchClearButton = document.getElementById('admin-orders-search-clear');
export const adminEquipmentSearchInput = document.getElementById('admin-equipment-search') as HTMLInputElement;
export const adminEquipmentSearchClearButton = document.getElementById('admin-equipment-search-clear');
export const equipmentSelectionSearchInput = document.getElementById('equipment-selection-search') as HTMLInputElement;

// Selects
export const filterCompany = document.getElementById('filter-company') as HTMLSelectElement;
export const filterTech = document.getElementById('filter-tech') as HTMLSelectElement;
export const filterEqType = document.getElementById('filter-eq-type') as HTMLSelectElement;
export const filterPaid = document.getElementById('filter-paid') as HTMLSelectElement;

// Form Controls
export const reportIdInput = document.getElementById('report-id-hidden') as HTMLInputElement;
export const reportEquipmentIdHidden = document.getElementById('report-equipment-id-hidden') as HTMLInputElement;
export const reportOrderIdHidden = document.getElementById('report-order-id-hidden') as HTMLInputElement;
export const reportServiceTypeSelect = document.getElementById('report-service-type') as HTMLSelectElement;
export const reportCompanySelect = document.getElementById('report-company') as HTMLSelectElement;
export const reportCompanySelectResidencial = document.getElementById('report-company') as HTMLSelectElement; // Added missing residential alias
export const reportDependencySelect = document.getElementById('report-dependency') as HTMLSelectElement;
export const reportCitySelectResidencial = document.getElementById('report-city-residencial') as HTMLSelectElement;
export const reportCitySelectEmpresa = document.getElementById('report-city-empresa') as HTMLSelectElement;
export const reportClientNameInput = document.getElementById('report-client-name') as HTMLInputElement;
export const reportAddressInput = document.getElementById('report-address') as HTMLInputElement;
export const reportEquipmentModelInput = document.getElementById('report-equipment-model') as HTMLInputElement;
export const reportEquipmentBrandInput = document.getElementById('report-equipment-brand') as HTMLInputElement;
export const reportEquipmentTypeSelect = document.getElementById('report-equipment-type') as HTMLSelectElement;
export const reportEquipmentRefrigerantSelect = document.getElementById('report-equipment-refrigerant') as HTMLSelectElement;
export const reportEquipmentCapacityInput = document.getElementById('report-equipment-capacity') as HTMLInputElement;
export const reportObservationsTextarea = document.getElementById('report-observations') as HTMLTextAreaElement;
export const reportPressureInput = document.getElementById('report-pressure') as HTMLInputElement;
export const reportAmperageInput = document.getElementById('report-amperage') as HTMLInputElement;
export const reportLocationResidencialContainer = document.getElementById('report-location-residencial');
export const reportInstallationItemsTableBody = document.querySelector('#report-installation-items-table tbody') as HTMLElement;

// Edit Assignment Form
export const editReportAssignmentReportId = document.getElementById('edit-report-assignment-id-hidden') as HTMLInputElement;
export const editCategoryEmpresaRadio = document.getElementById('edit-category-empresa') as HTMLInputElement;
export const editCategoryResidencialRadio = document.getElementById('edit-category-residencial') as HTMLInputElement;
export const editReportCompanySelect = document.getElementById('edit-report-company') as HTMLSelectElement;
export const editReportDependencySelect = document.getElementById('edit-report-dependency') as HTMLSelectElement;
export const editReportClientNameInput = document.getElementById('edit-report-client-name') as HTMLInputElement;
export const editReportClientAddressInput = document.getElementById('edit-report-client-address') as HTMLInputElement;
export const editReportClientCitySelect = document.getElementById('edit-report-client-city') as HTMLSelectElement;
export const editReportDependencyWarning = document.getElementById('edit-report-dependency-warning');
export const saveEditReportAssignmentButton = document.getElementById('save-edit-report-assignment-btn') as HTMLButtonElement;

// Entity Form
export const entityIdInput = document.getElementById('entity-id-hidden') as HTMLInputElement;
export const entityFormFieldsContainer = document.getElementById('entity-form-fields-container');

// Buttons
export const logoutBtn = document.getElementById('logout-btn');
export const logoutButton = document.getElementById('logout-btn'); // Alias
export const adminLoginButton = document.getElementById('admin-login-btn');
export const exportExcelBtn = document.getElementById('export-excel-btn');
export const exportZipBtn = document.getElementById('export-zip-btn');
export const exportPdfBtn = document.getElementById('export-pdf-btn');
export const resetFilters = document.getElementById('reset-filters');
export const changePasswordActionButton = document.getElementById('change-password-action-btn');
export const cancelChangePasswordButton = document.getElementById('cancel-change-password-btn');
export const toggleFullscreenButton = document.getElementById('toggle-fullscreen-btn');
export const createManualReportButton = document.getElementById('create-manual-report-btn');
export const searchByIdButton = document.getElementById('search-by-id-btn');
export const toggleMyReportsViewButton = document.getElementById('toggle-my-reports-view-btn') as HTMLButtonElement;
export const selectCategoryEmpresaButton = document.getElementById('select-category-empresa-btn');
export const selectCategoryResidencialButton = document.getElementById('select-category-residencial-btn');
export const createNewEquipmentFromSelectionBtn = document.getElementById('create-new-equipment-from-selection-btn');
export const continueWithoutEquipmentButton = document.getElementById('continue-without-equipment-btn');
export const openSignatureModalButton = document.getElementById('open-signature-modal-btn');
export const aiScanPlateButton = document.getElementById('ai-scan-plate-btn');
export const takePictureButton = document.getElementById('take-picture-btn');
export const takeInternalUnitPhotoButton = document.getElementById('take-internal-photo-btn');
export const takeExternalUnitPhotoButton = document.getElementById('take-external-photo-btn');
export const capturePhotoButton = document.getElementById('capture-photo-btn');
export const aiReconciliationBtn = document.getElementById('ai-reconciliation-btn');
export const downloadZipButton = document.getElementById('download-zip-btn');
export const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
export const toggleOrderFiltersBtn = document.getElementById('toggle-order-filters-btn');
export const addCityButton = document.getElementById('add-city-btn');
export const addCompanyButton = document.getElementById('add-company-btn');
export const addDependencyButton = document.getElementById('add-dependency-btn');
export const addEmployeeButton = document.getElementById('add-employee-btn');
export const addEquipmentButton = document.getElementById('add-equipment-btn');
export const deleteAllReportsButton = document.getElementById('delete-all-reports-btn');
export const startReportFromOrderButton = document.getElementById('start-report-from-order-btn');
export const cancelReportButton = document.getElementById('cancel-report-btn');
export const cancelEntityButton = document.getElementById('cancel-entity-btn');
export const confirmActionButton = document.getElementById('confirm-action-btn');
export const cancelActionButton = document.getElementById('cancel-action-btn');
export const cancelCategorySelectionButton = document.getElementById('cancel-category-selection-btn');
export const cancelEquipmentSelectionButton = document.getElementById('cancel-equipment-selection-btn');
export const cancelRedeemPointsButton = document.getElementById('cancel-redeem-points-btn');
export const cancelEditReportAssignmentButton = document.getElementById('cancel-edit-assignment-btn');
export const closeAdminPasswordModal = document.getElementById('close-admin-password-modal');
export const closeChangePasswordModal = document.getElementById('close-change-password-modal');
export const closeReportFormModalButton = document.getElementById('close-report-form-modal');
export const closeEntityFormModalButton = document.getElementById('close-entity-form-modal');
export const closeViewReportDetailsModalButton = document.getElementById('close-view-report-modal');
export const closeViewReportButton = document.getElementById('close-view-report-btn');
export const closeImagePreviewModalButton = document.getElementById('close-image-preview-modal');
export const closeConfirmationModalButton = document.getElementById('close-confirmation-modal');
export const closeCategorySelectionModalButton = document.getElementById('close-category-selection-modal');
export const closeEquipmentSelectionModalButton = document.getElementById('close-equipment-selection-modal');
export const closeOrderDetailsModalButton = document.getElementById('close-order-details-modal');
export const closeOrderDetailsButton = document.getElementById('close-order-details-btn');
export const closeAiReconciliationModal = document.getElementById('close-ai-reconciliation-modal');
export const closeAiReconciliationBtn = document.getElementById('close-ai-reconciliation-btn');
export const closeRedeemPointsModal = document.getElementById('close-redeem-points-modal');
export const closeEditReportAssignmentModal = document.getElementById('close-edit-assignment-modal');
export const closeSignatureModalButton = document.getElementById('close-signature-modal');
export const closePlateScanModal = document.getElementById('close-plate-scan-modal');
export const cancelPlateScanButton = document.getElementById('cancel-plate-scan-btn');
export const closePhotoCaptureModalButton = document.getElementById('close-photo-capture-modal');
export const cancelPhotoCaptureButton = document.getElementById('cancel-photo-capture-btn');
export const downloadSinglePdfBtn = document.getElementById('download-single-pdf');

// Excel Export elements
export const excelExportModal = document.getElementById('excel-export-modal');
export const excelColumnsGrid = document.getElementById('excel-columns-grid');
export const excelSelectAllBtn = document.getElementById('excel-select-all-btn');
export const confirmExcelExportBtn = document.getElementById('confirm-excel-export');

// Modals
export const adminPasswordModal = document.getElementById('admin-password-modal');
export const changePasswordModal = document.getElementById('change-password-modal');
export const viewReportModal = document.getElementById('view-report-modal');
export const viewReportDetailsModal = document.getElementById('view-report-modal'); // Alias
export const imagePreviewModal = document.getElementById('image-preview-modal');
export const categorySelectionModal = document.getElementById('category-selection-modal');
export const equipmentSelectionModal = document.getElementById('equipment-selection-modal');
export const orderDetailsModal = document.getElementById('order-details-modal');
export const redeemPointsModal = document.getElementById('redeem-points-modal');
export const editReportAssignmentModal = document.getElementById('edit-report-assignment-modal');
export const signatureModal = document.getElementById('signature-modal');
export const plateScanModal = document.getElementById('plate-scan-modal');
export const photoCaptureModal = document.getElementById('photo-capture-modal');
/**
 * Fix for error in src/ui.ts on line 391:
 * Property 'aiReconciliationModal' does not exist on type 'typeof import("file:///src/dom")'.
 */
export const aiReconciliationModal = document.getElementById('ai-reconciliation-modal');

// Error & Feedback
export const loginError = document.getElementById('login-error');
export const adminPasswordError = document.getElementById('admin-password-error');
export const changePasswordError = document.getElementById('change-password-error');
export const redeemPointsError = document.getElementById('redeem-points-error');

// Other
export const tabLinks = document.querySelectorAll('.tab-link');
export const filterReportDateStart = document.getElementById('filter-report-date-start') as HTMLInputElement;
export const filterReportDateEnd = document.getElementById('filter-report-date-end') as HTMLInputElement;
export const filterReportCity = document.getElementById('filter-report-city') as HTMLSelectElement;
export const filterReportCompany = document.getElementById('filter-report-company') as HTMLSelectElement;
export const filterReportServiceType = document.getElementById('filter-report-service-type') as HTMLSelectElement;
export const filterReportTechnician = document.getElementById('filter-report-technician') as HTMLSelectElement;
export const filterReportCategory = document.getElementById('filter-report-category') as HTMLSelectElement;
export const filterReportPaid = document.getElementById('filter-report-paid') as HTMLSelectElement;
export const filterOrderDateStart = document.getElementById('filter-order-date-start') as HTMLInputElement;
export const filterOrderDateEnd = document.getElementById('filter-order-date-end') as HTMLInputElement;
export const filterOrderStatus = document.getElementById('filter-order-status') as HTMLSelectElement;
export const filterOrderType = document.getElementById('filter-order-type') as HTMLSelectElement;
export const filterOrderTechnician = document.getElementById('filter-order-technician') as HTMLSelectElement;
export const adminPhotoUploadInput = document.getElementById('admin-photo-upload') as HTMLInputElement;
export const redeemPointsUserId = document.getElementById('redeem-points-user-id') as HTMLInputElement;
export const pointsToRedeemInput = document.getElementById('points-to-redeem') as HTMLInputElement;
