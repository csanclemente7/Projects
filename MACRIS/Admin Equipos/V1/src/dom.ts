
// --- DOM Elements for Equipment Admin App ---
export const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
export const loginScreen = document.getElementById('login-screen') as HTMLDivElement;
export const loginError = document.getElementById('login-error') as HTMLParagraphElement;
export const adminPasswordFormLogin = document.getElementById('admin-password-form-login') as HTMLFormElement;
export const adminPassInput = document.getElementById('admin-pass') as HTMLInputElement;

export const appScreen = document.getElementById('app-screen') as HTMLDivElement;
export const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
export const currentUserDisplay = document.getElementById('current-user-display') as HTMLSpanElement;

// Main Equipment Section
export const adminEquipmentSection = document.getElementById('admin-equipment-section') as HTMLElement;
export const addEquipmentButton = document.getElementById('add-equipment-button') as HTMLButtonElement;
export const adminEquipmentSearchInput = document.getElementById('admin-equipment-search') as HTMLInputElement;
export const adminEquipmentSearchClearButton = document.getElementById('admin-equipment-search-clear') as HTMLButtonElement;
export const adminEquipmentTableBody = document.getElementById('admin-equipment-table')?.getElementsByTagName('tbody')[0] as HTMLTableSectionElement;
export const adminEquipmentPaginationContainer = document.getElementById('admin-equipment-pagination') as HTMLDivElement;

// Equipment Form Modal
export const entityFormModal = document.getElementById('entity-form-modal') as HTMLDivElement;
export const closeEntityFormModalButton = document.getElementById('close-entity-form-modal') as HTMLSpanElement;
export const entityFormTitle = document.getElementById('entity-form-title') as HTMLHeadingElement;
export const aiScanPlateButton = document.getElementById('ai-scan-plate-button') as HTMLButtonElement;
export const entityForm = document.getElementById('entity-form') as HTMLFormElement;
export const entityIdInput = document.getElementById('entity-id') as HTMLInputElement;
export const entityTypeInput = document.getElementById('entity-type') as HTMLInputElement;
export const saveEntityButton = document.getElementById('save-entity-button') as HTMLButtonElement;
export const cancelEntityButton = document.getElementById('cancel-entity-button') as HTMLButtonElement;

// Fields inside Equipment Form
export const formEquipmentType = document.getElementById('form-equipment-type') as HTMLSelectElement;
export const formRefrigerantType = document.getElementById('form-refrigerant-type') as HTMLSelectElement;
export const formCityId = document.getElementById('form-city-id') as HTMLSelectElement;
export const formCategorySelector = document.getElementById('form-category-selector') as HTMLSelectElement;
export const formEmpresaFields = document.getElementById('form-empresa-fields') as HTMLDivElement;
export const formCompanySearchInput = document.getElementById('form-company-search') as HTMLInputElement;
export const formCompanyResults = document.getElementById('form-company-results') as HTMLDivElement;
export const formCompanyId = document.getElementById('form-company-id') as HTMLSelectElement;
export const formDependencyId = document.getElementById('form-dependency-id') as HTMLSelectElement;
export const formResidencialFields = document.getElementById('form-residencial-fields') as HTMLDivElement;

// Quick Add Buttons
export const btnQuickAddCity = document.getElementById('btn-quick-add-city') as HTMLButtonElement;
export const btnQuickAddCompany = document.getElementById('btn-quick-add-company') as HTMLButtonElement;
export const btnQuickAddDependency = document.getElementById('btn-quick-add-dependency') as HTMLButtonElement;

// Quick Add Modal (City/Company/Dependency)
export const quickAddModal = document.getElementById('quick-add-modal') as HTMLDivElement;
export const closeQuickAddModalButton = document.getElementById('close-quick-add-modal') as HTMLSpanElement;
export const quickAddForm = document.getElementById('quick-add-form') as HTMLFormElement;
export const quickAddTitle = document.getElementById('quick-add-title') as HTMLHeadingElement;
export const quickAddTypeInput = document.getElementById('quick-add-type') as HTMLInputElement;
export const quickAddParentIdInput = document.getElementById('quick-add-parent-id') as HTMLInputElement;
export const quickAddParentGroup = document.getElementById('quick-add-parent-group') as HTMLDivElement;
export const quickAddParentLabel = document.getElementById('quick-add-parent-label') as HTMLLabelElement;
export const quickAddParentName = document.getElementById('quick-add-parent-name') as HTMLInputElement;
export const quickAddParentSelect = document.getElementById('quick-add-parent-select') as HTMLSelectElement;
export const btnQuickAddParentCity = document.getElementById('btn-quick-add-parent-city') as HTMLButtonElement;
export const quickAddNameLabel = document.getElementById('quick-add-name-label') as HTMLLabelElement;
export const quickAddNameInput = document.getElementById('quick-add-name') as HTMLInputElement;
export const cancelQuickAddButton = document.getElementById('cancel-quick-add-button') as HTMLButtonElement;

// Quick Add City Modal (from Company Modal)
export const quickAddCityModal = document.getElementById('quick-add-city-modal') as HTMLDivElement;
export const closeQuickAddCityModalButton = document.getElementById('close-quick-add-city-modal') as HTMLSpanElement;
export const quickAddCityForm = document.getElementById('quick-add-city-form') as HTMLFormElement;
export const quickAddCityNameInput = document.getElementById('quick-add-city-name') as HTMLInputElement;
export const cancelQuickAddCityButton = document.getElementById('cancel-quick-add-city-button') as HTMLButtonElement;

// Plate Scan Modal (IA)
export const plateScanModal = document.getElementById('plate-scan-modal') as HTMLDivElement;
export const closePlateScanModal = document.getElementById('close-plate-scan-modal') as HTMLSpanElement;
export const plateVideoElement = document.getElementById('plate-video') as HTMLVideoElement;
export const plateHiddenCanvasElement = document.getElementById('plate-canvas-hidden') as HTMLCanvasElement;
export const plateScanFeedback = document.getElementById('plate-scan-feedback') as HTMLParagraphElement;
export const cancelPlateScanButton = document.getElementById('cancel-plate-scan-button') as HTMLButtonElement;
export const takePictureButton = document.getElementById('take-picture-button') as HTMLButtonElement;

// Container for dynamic fields used in AI scanning
export const entityFormFieldsContainer = document.querySelector('#entity-form .filters-grid') as HTMLDivElement;

// Confirmation Modal
export const confirmationModal = document.getElementById('confirmation-modal') as HTMLDivElement;
export const closeConfirmationModalButton = document.getElementById('close-confirmation-modal-button') as HTMLButtonElement;
export const confirmationMessage = document.getElementById('confirmation-message') as HTMLParagraphElement;
export const cancelActionButton = document.getElementById('cancel-action-button') as HTMLButtonElement;
export const confirmActionButton = document.getElementById('confirm-action-button') as HTMLButtonElement;

// Info Modal
export const infoModal = document.getElementById('info-modal') as HTMLDivElement;
export const closeInfoModalButton = document.getElementById('close-info-modal-button') as HTMLSpanElement;
export const infoModalTitle = document.getElementById('info-modal-title') as HTMLHeadingElement;
export const infoModalMessage = document.getElementById('info-modal-message') as HTMLParagraphElement;
export const infoModalOkButton = document.getElementById('info-modal-ok-button') as HTMLButtonElement;

export const notificationArea = document.getElementById('app-notification-area') as HTMLDivElement;

// Legacy / Compatibility exports
export const usernameInput = null as any;
export const passwordInput = null as any;
export const loginForm = null as any;
export const bottomNav = null as any;
