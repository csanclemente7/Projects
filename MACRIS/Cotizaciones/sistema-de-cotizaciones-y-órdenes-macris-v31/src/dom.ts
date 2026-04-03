// Main Layout
export const appContainer = document.getElementById('app-container') as HTMLDivElement;
export const mainContentArea = document.getElementById('main-content-area') as HTMLElement;
export const mobileNavBar = document.getElementById('mobile-nav-bar') as HTMLElement;
export const currentUserBadge = document.getElementById('current-user-badge') as HTMLDivElement;
export const currentUserName = document.getElementById('current-user-name') as HTMLSpanElement;
export const currentUserLogout = document.getElementById('current-user-logout') as HTMLButtonElement;

// Auth
export const loginOverlay = document.getElementById('login-overlay') as HTMLDivElement;
export const loginForm = document.getElementById('login-form') as HTMLFormElement;
export const usernameInput = document.getElementById('username-input') as HTMLInputElement;
export const passwordInput = document.getElementById('password-input') as HTMLInputElement;
export const loginErrorMsg = document.getElementById('login-error-msg') as HTMLParagraphElement;
export const adminPortalLink = document.getElementById('admin-portal-link') as HTMLAnchorElement;
export const userRecoveryOpen = document.getElementById('user-recovery-open') as HTMLButtonElement;
export const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;


// Navigation
export const mainNavLinks = document.querySelectorAll('.nav-link');
export const pageContainers = document.querySelectorAll('#main-content-area .page');

// Page: Quotes
export const deleteCurrentQuoteBtn = document.getElementById('delete-current-quote-btn') as HTMLButtonElement;
export const saveQuoteBtn = document.getElementById('save-quote-btn') as HTMLButtonElement;
export const generatePdfBtn = document.getElementById('generate-pdf-btn') as HTMLButtonElement;
export const duplicateQuoteBtn = document.getElementById('duplicate-quote-btn') as HTMLButtonElement;
export const quoteTabsBar = document.getElementById('quote-tabs-bar') as HTMLDivElement;
export const quoteIdDisplay = document.getElementById('quote-id-display') as HTMLSpanElement;
export const quoteDateInput = document.getElementById('quote-date') as HTMLInputElement;
export const clientSearchInput = document.getElementById('client-search') as HTMLInputElement;
export const clientSearchResultsContainer = document.getElementById('client-search-results') as HTMLDivElement;
export const addClientBtn = document.getElementById('add-client-btn') as HTMLButtonElement;
export const editClientBtn = document.getElementById('edit-client-btn') as HTMLButtonElement;
export const clientDetailsContainer = document.getElementById('client-details') as HTMLDivElement;
export const quoteItemsTableBody = document.getElementById('quote-items-tbody') as HTMLTableSectionElement;
export const itemSearchInput = document.getElementById('item-search') as HTMLInputElement;
export const itemSearchResultsContainer = document.getElementById('item-search-results') as HTMLDivElement;
export const addNewItemQuotePageBtn = document.getElementById('add-new-item-quote-page-btn') as HTMLButtonElement;
export const summarySubtotal = document.getElementById('summary-subtotal') as HTMLSpanElement;
export const vatToggleSwitch = document.getElementById('vat-toggle-switch') as HTMLInputElement;
export const summaryTaxAmount = document.getElementById('summary-tax-amount') as HTMLSpanElement;
export const summaryTotal = document.getElementById('summary-total') as HTMLSpanElement;
export const quoteTermsTextarea = document.getElementById('quote-terms-textarea') as HTMLTextAreaElement;

// Page: Orders List
export const ordersListContainer = document.getElementById('orders-list-container') as HTMLDivElement;
export const orderListSearchInput = document.getElementById('order-list-search') as HTMLInputElement;
export const addNewOrderPageBtn = document.getElementById('add-new-order-page-btn') as HTMLButtonElement;
export const orderCountBadge = document.getElementById('order-count-badge') as HTMLSpanElement;

// Page: Order Workspace
export const orderWorkspacePage = document.getElementById('page-order-workspace') as HTMLDivElement;
export const orderWorkspaceTitle = document.getElementById('order-workspace-title') as HTMLHeadingElement;
export const backToOrdersListBtn = document.getElementById('back-to-orders-list-btn') as HTMLButtonElement;
export const orderDateInput = document.getElementById('order-date') as HTMLInputElement;
export const orderTimeInput = document.getElementById('order-time') as HTMLInputElement;
export const orderDurationHoursInput = document.getElementById('order-duration-hours') as HTMLInputElement;
export const orderDurationMinutesInput = document.getElementById('order-duration-minutes') as HTMLInputElement;
export const technicianSelector = document.getElementById('technician-selector') as HTMLDivElement;
export const technicianSelectedPills = document.getElementById('technician-selected-pills') as HTMLDivElement;
export const technicianDropdown = document.getElementById('technician-dropdown') as HTMLDivElement;
export const technicianSelectorPlaceholder = document.querySelector('.custom-select-placeholder') as HTMLSpanElement;
export const orderClientSearchInput = document.getElementById('order-client-search') as HTMLInputElement;
export const orderClientSearchResults = document.getElementById('order-client-search-results') as HTMLDivElement;
export const orderAddClientBtn = document.getElementById('order-add-client-btn') as HTMLButtonElement;
export const orderEditClientBtn = document.getElementById('order-edit-client-btn') as HTMLButtonElement;
export const orderClientDetails = document.getElementById('order-client-details') as HTMLDivElement;
export const orderClientCityInput = document.getElementById('order-client-city') as HTMLInputElement;
export const orderItemsTableBody = document.getElementById('order-items-tbody') as HTMLTableSectionElement;
export const orderItemSearchInput = document.getElementById('order-item-search') as HTMLInputElement;
export const orderItemSearchResults = document.getElementById('order-item-search-results') as HTMLDivElement;
export const orderAddNewItemBtn = document.getElementById('order-add-new-item-btn') as HTMLButtonElement;
export const orderTypeSelect = document.getElementById('order-type') as HTMLSelectElement;
export const orderTypeCustomInput = document.getElementById('order-type-custom') as HTMLInputElement;
export const orderStatusSelect = document.getElementById('order-status') as HTMLSelectElement;
export const orderNotesTextarea = document.getElementById('order-notes') as HTMLTextAreaElement;
export const saveOrderBtn = document.getElementById('save-order-btn') as HTMLButtonElement;
export const generateOrderPdfBtn = document.getElementById('generate-order-pdf-btn') as HTMLButtonElement;
// Order Summary DOM Elements removed

// Page: Agenda
export const agendaPage = document.getElementById('page-agenda') as HTMLDivElement;
export const agendaContainer = document.getElementById('agenda-container') as HTMLDivElement;
export const agendaTitle = document.getElementById('agenda-title') as HTMLHeadingElement;
export const agendaPrevBtn = document.getElementById('agenda-prev-btn') as HTMLButtonElement;
export const agendaNextBtn = document.getElementById('agenda-next-btn') as HTMLButtonElement;
export const agendaViewSwitcher = document.getElementById('agenda-view-switcher') as HTMLDivElement;

// Page: Saved Quotes
export const savedQuotesPageContainer = document.getElementById('saved-quotes-page-container') as HTMLDivElement;
export const savedQuotesSearchInput = document.getElementById('saved-quotes-search') as HTMLInputElement;
export const deleteAllQuotesBtn = document.getElementById('delete-all-quotes-btn') as HTMLButtonElement;
export const savedQuotesCountBadge = document.getElementById('saved-quotes-count-badge') as HTMLSpanElement;


// Page: Clients
export const clientsListContainer = document.getElementById('clients-list-container') as HTMLDivElement;
export const clientListSearchInput = document.getElementById('client-list-search') as HTMLInputElement;
export const addNewClientPageBtn = document.getElementById('add-new-client-page-btn') as HTMLButtonElement;
export const deleteAllClientsBtn = document.getElementById('delete-all-clients-btn') as HTMLButtonElement;
export const clientCountBadge = document.getElementById('client-count-badge') as HTMLSpanElement;

// Page: Items
export const itemsListContainer = document.getElementById('items-list-container') as HTMLDivElement;
export const itemListSearchInput = document.getElementById('item-list-search') as HTMLInputElement;
export const addNewItemPageBtn = document.getElementById('add-new-item-page-btn') as HTMLButtonElement;
export const deleteAllItemsBtn = document.getElementById('delete-all-items-btn') as HTMLButtonElement;
export const itemCountBadge = document.getElementById('item-count-badge') as HTMLSpanElement;

// Page: Technicians
export const techniciansListContainer = document.getElementById('technicians-list-container') as HTMLDivElement;
export const technicianListSearchInput = document.getElementById('technician-list-search') as HTMLInputElement;
export const addNewTechnicianPageBtn = document.getElementById('add-new-technician-page-btn') as HTMLButtonElement;
export const technicianCountBadge = document.getElementById('technician-count-badge') as HTMLSpanElement;

// Page: Settings
export const themeOptionsContainer = document.getElementById('theme-options-container') as HTMLDivElement;
export const fontSizeSlider = document.getElementById('font-size-slider') as HTMLInputElement;
export const fontSizeValue = document.getElementById('font-size-value') as HTMLSpanElement;
export const vatRateSettingInput = document.getElementById('vat-rate-setting') as HTMLInputElement;
export const pdfTemplateOptionsContainer = document.getElementById('pdf-template-options-container') as HTMLDivElement;
export const pdfOutputOptionsContainer = document.getElementById('pdf-output-options-container') as HTMLDivElement;
export const backupBtn = document.getElementById('backup-btn') as HTMLButtonElement;
export const restoreInput = document.getElementById('restore-input') as HTMLInputElement;
export const resetAppBtn = document.getElementById('reset-app-btn') as HTMLButtonElement;
export const changePasswordForm = document.getElementById('change-password-form') as HTMLFormElement;
export const currentPasswordInput = document.getElementById('current-password') as HTMLInputElement;
export const newPasswordInput = document.getElementById('new-password') as HTMLInputElement;
export const confirmPasswordInput = document.getElementById('confirm-password') as HTMLInputElement;
export const changePasswordBtn = document.getElementById('change-password-btn') as HTMLButtonElement;
export const termsNoVatSetting = document.getElementById('terms-no-vat-setting') as HTMLTextAreaElement;
export const termsWithVatSetting = document.getElementById('terms-with-vat-setting') as HTMLTextAreaElement;
export const pdfFooterTextSetting = document.getElementById('pdf-footer-text-setting') as HTMLTextAreaElement;
export const saveTextsBtn = document.getElementById('save-texts-btn') as HTMLButtonElement;
export const companyNameSetting = document.getElementById('company-name-setting') as HTMLInputElement;
export const companyAddress1Setting = document.getElementById('company-address1-setting') as HTMLInputElement;
export const companyAddress2Setting = document.getElementById('company-address2-setting') as HTMLInputElement;
export const companyWebsiteSetting = document.getElementById('company-website-setting') as HTMLInputElement;
export const companyPhoneSetting = document.getElementById('company-phone-setting') as HTMLInputElement;
export const companyEmailSetting = document.getElementById('company-email-setting') as HTMLInputElement;
export const saveCompanyDataBtn = document.getElementById('save-company-data-btn') as HTMLButtonElement;
export const adminPortalBtn = document.getElementById('admin-portal-btn') as HTMLAnchorElement;



// Modal
export const entityModal = document.getElementById('entity-modal') as HTMLDivElement;
export const modalTitle = document.getElementById('modal-title') as HTMLHeadingElement;
export const modalForm = document.getElementById('modal-form') as HTMLFormElement;
export const modalFieldsContainer = document.getElementById('modal-fields') as HTMLDivElement;
export const closeModalBtns = document.querySelectorAll('.close-modal-btn');
export const cancelModalBtns = document.querySelectorAll('.cancel-modal-btn');

// Order Source Modal
export const orderSourceModal = document.getElementById('order-source-modal') as HTMLDivElement;
export const createOrderFromQuoteBtn = document.getElementById('create-order-from-quote-btn') as HTMLButtonElement;
export const createOrderManuallyBtn = document.getElementById('create-order-manually-btn') as HTMLButtonElement;
export const orderSourceQuoteSearchInput = document.getElementById('order-source-quote-search') as HTMLInputElement;
export const orderSourceQuoteSearchResults = document.getElementById('order-source-quote-search-results') as HTMLDivElement;


// Description Edit Modal
export const descriptionEditModal = document.getElementById('description-edit-modal') as HTMLDivElement;
export const descriptionEditForm = document.getElementById('description-edit-form') as HTMLFormElement;
export const descriptionEditTextarea = document.getElementById('description-edit-textarea') as HTMLTextAreaElement;

// Value Edit Modal
export const valueEditModal = document.getElementById('value-edit-modal') as HTMLDivElement;
export const valueEditForm = document.getElementById('value-edit-form') as HTMLFormElement;
export const valueModalTitle = document.getElementById('value-modal-title') as HTMLHeadingElement;
export const valueModalLabel = document.getElementById('value-modal-label') as HTMLLabelElement;
export const valueEditInput = document.getElementById('value-edit-input') as HTMLInputElement;


// PDF Preview Modal
export const pdfPreviewModal = document.getElementById('pdf-preview-modal') as HTMLDivElement;
export const pdfIframe = document.getElementById('pdf-iframe') as HTMLIFrameElement;
export const downloadPdfBtn = document.getElementById('download-pdf-btn') as HTMLButtonElement;

// Confirmation Modal
export const confirmationModal = document.getElementById('confirmation-modal') as HTMLDivElement;
export const confirmationModalTitle = document.getElementById('confirmation-modal-title') as HTMLHeadingElement;
export const confirmationModalText = document.getElementById('confirmation-modal-text') as HTMLParagraphElement;
export const confirmationModalConfirmBtn = document.getElementById('confirmation-modal-confirm-btn') as HTMLButtonElement;
export const confirmationModalCancelBtn = document.getElementById('confirmation-modal-cancel-btn') as HTMLButtonElement;

// User Recovery Modal
export const userRecoveryModal = document.getElementById('user-recovery-modal') as HTMLDivElement;
export const userRecoveryClose = document.getElementById('user-recovery-close') as HTMLSpanElement;
export const recoveryUsernameInput = document.getElementById('recovery-username') as HTMLInputElement;
export const recoveryUserEmail = document.getElementById('recovery-user-email') as HTMLSpanElement;
export const recoveryUserSendBtn = document.getElementById('recovery-user-send') as HTMLButtonElement;
export const recoveryUserStepSend = document.getElementById('user-recovery-step-send') as HTMLDivElement;
export const recoveryUserStepVerify = document.getElementById('user-recovery-step-verify') as HTMLDivElement;
export const recoveryUserCodeInput = document.getElementById('recovery-user-code') as HTMLInputElement;
export const recoveryUserPasswordInput = document.getElementById('recovery-user-password') as HTMLInputElement;
export const recoveryUserConfirmInput = document.getElementById('recovery-user-confirm') as HTMLInputElement;
export const recoveryUserVerifyBtn = document.getElementById('recovery-user-verify') as HTMLButtonElement;
export const recoveryUserError = document.getElementById('recovery-user-error') as HTMLParagraphElement;

// Notifications
export const notificationArea = document.getElementById('notification-area') as HTMLDivElement;

export const agendaTechDropdown = document.getElementById('agenda-tech-dropdown') as HTMLDivElement;

// Reports Page exports
export const reportsSearchInput = document.getElementById('reports-search') as HTMLInputElement;
export const reportsDateFrom = document.getElementById('reports-date-from') as HTMLInputElement;
export const reportsDateTo = document.getElementById('reports-date-to') as HTMLInputElement;
export const reportsPageSize = document.getElementById('reports-page-size') as HTMLSelectElement;
export const reportsFirstPageBtn = document.getElementById('reports-first-page-btn') as HTMLButtonElement;
export const reportsPrevPageBtn = document.getElementById('reports-prev-page-btn') as HTMLButtonElement;
export const reportsNextPageBtn = document.getElementById('reports-next-page-btn') as HTMLButtonElement;
export const reportsLastPageBtn = document.getElementById('reports-last-page-btn') as HTMLButtonElement;
export const reportsSelectAll = document.getElementById('reports-select-all') as HTMLInputElement;
export const reportsTbody = document.getElementById('reports-tbody') as HTMLTableSectionElement;
export const reportsExportExcelBtn = document.getElementById('reports-export-excel-btn') as HTMLButtonElement;
export const reportsExportZipBtn = document.getElementById('reports-export-zip-btn') as HTMLButtonElement;
export const reportsExportMergedBtn = document.getElementById('reports-export-merged-btn') as HTMLButtonElement;
export const reportsExportWhatsappBtn = document.getElementById('reports-export-whatsapp-btn') as HTMLButtonElement;
export const shareOptionsModal = document.getElementById('share-options-modal') as HTMLDivElement;
export const shareWhatsappBtn = document.getElementById('share-whatsapp-btn') as HTMLButtonElement;
export const shareGmailBtn = document.getElementById('share-gmail-btn') as HTMLButtonElement;
export const shareOutlookBtn = document.getElementById('share-outlook-btn') as HTMLButtonElement;
export const reportsLoadingIndicator = document.getElementById('reports-loading-indicator') as HTMLDivElement;
export const reportsPageInfo = document.getElementById('reports-page-info') as HTMLSpanElement;
