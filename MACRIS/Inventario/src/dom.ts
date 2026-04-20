// ----------------------------------------------------------------
// DOM Element References
// ----------------------------------------------------------------

// Loader
export const loader       = document.getElementById('loader') as HTMLDivElement;
export const loaderText   = document.getElementById('loader-text') as HTMLParagraphElement;

// App shell
export const app          = document.getElementById('app') as HTMLDivElement;

// Alerts
export const alertBanner      = document.getElementById('alert-banner') as HTMLDivElement;
export const alertBannerText  = document.getElementById('alert-banner-text') as HTMLSpanElement;
export const alertBannerBtn   = document.getElementById('alert-banner-btn') as HTMLButtonElement;
export const lowStockBadgeSidebar  = document.getElementById('low-stock-badge-sidebar') as HTMLDivElement;
export const lowStockCountSidebar  = document.getElementById('low-stock-count-sidebar') as HTMLSpanElement;
export const lowStockBadgeMobile   = document.getElementById('low-stock-badge-mobile') as HTMLDivElement;
export const lowStockCountMobile   = document.getElementById('low-stock-count-mobile') as HTMLSpanElement;
export const lowStockPanel    = document.getElementById('low-stock-panel') as HTMLDivElement;
export const lowStockList     = document.getElementById('low-stock-list') as HTMLDivElement;

// KPIs
export const kpiTotalItems      = document.getElementById('kpi-total-items') as HTMLParagraphElement;
export const kpiLowStock        = document.getElementById('kpi-low-stock') as HTMLParagraphElement;
export const kpiOutOfStock      = document.getElementById('kpi-out-of-stock') as HTMLParagraphElement;
export const kpiProfitMonth     = document.getElementById('kpi-profit-month') as HTMLParagraphElement;
export const kpiInvValue        = document.getElementById('kpi-inv-value') as HTMLParagraphElement;
export const kpiMovementsToday  = document.getElementById('kpi-movements-today') as HTMLParagraphElement;

// Tables
export const recentMovementsBody  = document.getElementById('recent-movements-body') as HTMLTableSectionElement;
export const inventoryTableBody   = document.getElementById('inventory-table-body') as HTMLTableSectionElement;
export const movementsTableBody   = document.getElementById('movements-table-body') as HTMLTableSectionElement;
export const movementsSummary     = document.getElementById('movements-summary') as HTMLDivElement;
export const gestionTableBody     = document.getElementById('gestion-table-body') as HTMLTableSectionElement;

// Filters — inventory
export const inventorySearch      = document.getElementById('inventory-search') as HTMLInputElement;
export const inventoryFilterTabs  = document.getElementById('inventory-filter-tabs') as HTMLDivElement;

// Filters — movements
export const movementsSearch      = document.getElementById('movements-search') as HTMLInputElement;
export const movementFilterTabs   = document.getElementById('movement-filter-tabs') as HTMLDivElement;
export const dateFrom             = document.getElementById('date-from') as HTMLInputElement;
export const dateTo               = document.getElementById('date-to') as HTMLInputElement;
export const btnClearDates        = document.getElementById('btn-clear-dates') as HTMLButtonElement;

// Filters — gestion
export const gestionSearch        = document.getElementById('gestion-search') as HTMLInputElement;
export const showInactiveToggle   = document.getElementById('show-inactive-toggle') as HTMLInputElement;

// Buttons
export const btnQuickMovement = document.getElementById('btn-quick-movement') as HTMLButtonElement;
export const btnNewMovement   = document.getElementById('btn-new-movement') as HTMLButtonElement;
export const btnAddItem       = document.getElementById('btn-add-item') as HTMLButtonElement;

// Modal
export const modalOverlay   = document.getElementById('modal-overlay') as HTMLDivElement;
export const modalContainer = document.getElementById('modal-container') as HTMLDivElement;
export const modalTitle     = document.getElementById('modal-title') as HTMLHeadingElement;
export const modalBody      = document.getElementById('modal-body') as HTMLDivElement;
export const modalFooter    = document.getElementById('modal-footer') as HTMLDivElement;
export const modalConfirm   = document.getElementById('modal-confirm') as HTMLButtonElement;
export const modalCancel    = document.getElementById('modal-cancel') as HTMLButtonElement;
export const modalClose     = document.getElementById('modal-close') as HTMLButtonElement;

// Nav
export const navItems       = document.querySelectorAll('[data-section]') as NodeListOf<HTMLElement>;
export const pageTitleMobile = document.getElementById('page-title-mobile') as HTMLSpanElement;

// Notification area
export const notificationArea = document.getElementById('notification-area') as HTMLDivElement;