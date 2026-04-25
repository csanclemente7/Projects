import * as D from './dom';
import * as State from './state';
import * as API from './api';
import { generateQuotePDFDoc, generateOrderPDFDoc, generatePreviewPDF, previewPdfInModal, generateBillPDFDoc } from './pdf';
import type { Quote, QuoteItem, Client, Item, PdfTemplate, Order, Technician, OrderItem, ClientInsert, ItemInsert, TechnicianInsert, Sede, Dependency } from './types';
import { formatCurrency, generateId, isMobileDevice, formatTime } from './utils';
import { fetchCities } from './api-reports';
import { getSessionUser } from './user-session';
import { supabaseQuotes, supabaseOrders } from './supabase';
import { isDesktopRuntime } from './runtime';

// --- Modal State ---
let onConfirmCallback: (() => void) | null = null;
let onCancelCallback: (() => void) | null = null;
let currentEditingItemId: string | null = null;
let currentEditingContext: 'quote' | 'order' | null = null;
const expandedClientSedeIds = new Set<string>();
const clientSedeCityFilters = new Map<string, string>();
const expandedSedeDependencyIds = new Set<string>();
const NO_ASIGNADO_TECHNICIAN_ID = '849dac95-99d8-4f43-897e-7565fec32382';
const desktopSyncState = {
    isOnline: navigator.onLine,
    syncing: false,
    pendingCount: 0,
    lastSyncedAt: null as string | null,
};

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char] || char));
}

function formatCreatedTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function formatCreatedDateTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const datePart = date.toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timePart = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
}

function normalizeDisplayName(value?: string | null): string {
    return (value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getOrderDisplayLocation(order: Order, client?: Client | null) {
    const sede = order.sede_id ? State.getSedes().find(s => s.id === order.sede_id) : null;
    const clientName = client?.name || 'Cliente';
    const sedeName = sede?.name || '';
    const shouldShowSede = !!sedeName && normalizeDisplayName(sedeName) !== normalizeDisplayName(clientName);
    const fullName = shouldShowSede ? `${clientName} · ${sedeName}` : clientName;
    const compactClient = clientName.split(' ')[0] || clientName;
    const compactName = shouldShowSede ? `${compactClient} · ${sedeName}` : compactClient;
    const addressParts = [sede?.address || client?.address, sede?.cityName || client?.city].filter(Boolean);

    return {
        clientName,
        compactClient,
        sedeName,
        shouldShowSede,
        fullName,
        compactName,
        addressString: addressParts.length > 0 ? addressParts.join(' - ') : 'Sin dirección',
    };
}

function renderAgendaLocationName(location: ReturnType<typeof getOrderDisplayLocation>, compact = false): string {
    const clientName = compact ? location.compactClient : location.clientName;
    if (!location.shouldShowSede) return escapeHtml(clientName);
    return `${escapeHtml(clientName)} <span class="agenda-sede-separator">·</span> <span class="agenda-sede-name">${escapeHtml(location.sedeName)}</span>`;
}

export function setAdminPortalLink() {
    if (!D.adminPortalBtn) return;
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    D.adminPortalBtn.href = `${normalizedBase}admin/`;
}

export function setCurrentUserBadge() {
    if (!D.currentUserBadge || !D.currentUserName) return;
    const user = getSessionUser();
    const fullName = user.name || user.username || 'Admin';
    const displayName = isMobileDevice() ? fullName.split(' ')[0] || fullName : fullName;
    D.currentUserName.textContent = displayName;
    D.currentUserBadge.title = fullName;
}

// --- Helper function to get next IDs ---
async function getNextQuoteManualId(): Promise<string> {
    const nextIdFromApiStr = await API.getNextQuoteId();
    const nextIdFromApi = parseInt(nextIdFromApiStr, 10);
    const allSavedQuoteIds = State.getQuotes().map(q => parseInt(q.manualId, 10)).filter(id => !isNaN(id));
    const openQuoteIds = State.getOpenQuotes().map(q => parseInt(q.manualId, 10)).filter(id => !isNaN(id));
    const allKnownIds = [...allSavedQuoteIds, ...openQuoteIds];
    const maxKnownId = allKnownIds.length > 0 ? Math.max(...allKnownIds) : 0;
    const finalNextId = Math.max(maxKnownId + 1, nextIdFromApi);
    return finalNextId.toString();
}

async function getNextOrderManualId(): Promise<string> {
    return API.getNextOrderId();
}
async function getNextClientManualIdForUI(): Promise<string> {
    return await API.getNextClientManualId();
}
async function getNextItemManualIdForUI(): Promise<string> {
    return await API.getNextItemManualId();
}

// --- Theme & Font Management ---
export async function loadTheme() {
    const savedTheme = await API.getSetting('theme') as 'light' | 'dark' | null;
    applyTheme(savedTheme || 'light', false);
    const radio = document.querySelector(`input[name="theme"][value="${savedTheme || 'light'}"]`) as HTMLInputElement;
    if (radio) radio.checked = true;
}

export async function applyTheme(theme: 'light' | 'dark', showNotif: boolean = true) {
    document.body.classList.toggle('dark-theme', theme === 'dark');
    try {
        await API.setSetting('theme', theme);
        if (showNotif) showNotification(`Tema cambiado a ${theme === 'light' ? 'Claro' : 'Oscuro'}.`);
    } catch (e: any) {
        if (showNotif) showNotification("Error al guardar el tema.", "error");
    }
}

export async function getCurrentThemeFromDB(): Promise<'light' | 'dark'> {
    return await API.getSetting('theme') as 'light' | 'dark' || 'light';
}

export async function loadFontSize() {
    const savedSize = await API.getSetting('font_size');
    applyFontSize(savedSize ? parseInt(savedSize) : 16, false);
    D.fontSizeSlider.value = savedSize || '16';
}

export async function applyFontSize(size: number, showNotif: boolean = true) {
    document.body.style.setProperty('--base-font-size', `${size}px`);
    D.fontSizeValue.textContent = `${size}px`;
    try {
        await API.setSetting('font_size', String(size));
        if (showNotif) showNotification(`Tamaño de fuente ajustado a ${size}px.`);
    } catch (e: any) {
        if (showNotif) showNotification("Error al guardar el tamaño de fuente.", "error");
    }
}

// --- PDF Template Management ---
export async function loadPdfTemplateSelection() {
    const savedTemplate = await API.getSetting('pdf_template') as PdfTemplate | null;
    State.setInternalPdfTemplate(savedTemplate || 'classic');
    renderPdfTemplateOptions();
}

export async function applyPdfTemplate(template: PdfTemplate) {
    await State.setActivePdfTemplate(template);
    showNotification(`Plantilla de PDF cambiada.`, 'success');
}

export async function handlePreviewPdfTemplate(template: PdfTemplate) {
    try {
        await generatePreviewPDF(template);
    } catch (err: any) {
        showNotification("Error al generar la vista previa del PDF.", "error");
        throw err;
    }
}

function getTemplatePreviewSVG(template: PdfTemplate): string {
    const colors = { classic: { bg: '#fff', header: '#333', text: '#555', border: '#ddd' }, modern: { bg: '#fff', header: '#aaa', text: '#333', border: '#eee' }, sleek: { bg: '#161B22', header: '#00DFFF', text: '#f0f0f0', border: '#333' }, vivid: { bg: '#fff', header: '#00A8C5', text: '#333', border: '#00A8C5' } };
    const c = colors[template];
    return `<svg viewBox="0 0 100 141" fill="none" xmlns="http://www.w3.org/2000/svg" style="border:1px solid ${c.border}; border-radius: 2px;"><rect width="100" height="141" fill="${c.bg}"/><rect x="10" y="10" width="${template === 'vivid' ? 80 : 30}" height="15" fill="${c.header}"/><rect x="10" y="35" width="50" height="5" fill="${c.text}" opacity="0.7"/><rect x="10" y="45" width="60" height="3" fill="${c.text}" opacity="0.5"/><rect x="10" y="60" width="80" height="2" fill="${c.text}" opacity="0.2"/><rect x="10" y="65" width="80" height="2" fill="${c.text}" opacity="0.2"/><rect x="10" y="70" width="80" height="2" fill="${c.text}" opacity="0.2"/><rect x="10" y="75" width="80" height="2" fill="${c.text}" opacity="0.2"/><rect x="10" y="120" width="30" height="3" fill="${c.text}" opacity="0.5"/><rect x="10" y="125" width="35" height="2" fill="${c.text}" opacity="0.3"/></svg>`;
}

export function renderPdfTemplateOptions() {
    const templates: { id: PdfTemplate, name: string }[] = [{ id: 'classic', name: 'Clásico' }, { id: 'modern', name: 'Moderno' }, { id: 'sleek', name: 'Elegante' }, { id: 'vivid', name: 'Vívido' }];
    D.pdfTemplateOptionsContainer.innerHTML = templates.map(t => `<label class="template-option" for="template-${t.id}"><input type="radio" name="pdf-template" id="template-${t.id}" value="${t.id}" ${State.getActivePdfTemplate() === t.id ? 'checked' : ''}><div class="template-preview-box">${getTemplatePreviewSVG(t.id)}</div><div class="template-option-footer"><span>${t.name}</span><button class="btn btn-secondary preview-pdf-btn" data-template="${t.id}" title="Previsualizar PDF"><i class="fas fa-eye"></i></button></div></label>`).join('');
}

export async function loadPdfOutputPreference() {
    const savedPreference = await API.getSetting('pdf_output_preference') as 'preview' | 'download' | null;
    const preference = savedPreference || 'preview';
    State.setInternalPdfOutputPreference(preference);
    const radio = document.querySelector(`input[name="pdf-output"][value="${preference}"]`) as HTMLInputElement;
    if (radio) radio.checked = true;
}

export async function applyPdfOutputPreference(preference: 'preview' | 'download') {
    await State.setPdfOutputPreference(preference);
    showNotification(`El PDF se ${preference === 'preview' ? 'mostrará en vista previa' : 'descargará automáticamente'}.`, 'success');
}

export async function loadCompanyAndQuoteTexts() {
    const [
        termsNoVat, termsWithVat, footerText,
        companyName, companyAddress1, companyAddress2,
        companyWebsite, companyPhone, companyEmail
    ] = await Promise.all([
        API.getSetting('quote_terms_no_vat'),
        API.getSetting('quote_terms_with_vat'),
        API.getSetting('pdf_footer_text'),
        API.getSetting('company_name'),
        API.getSetting('company_address1'),
        API.getSetting('company_address2'),
        API.getSetting('company_website'),
        API.getSetting('company_phone'),
        API.getSetting('company_email'),
    ]);

    // Set state without saving back to DB
    State.setInternalQuoteTermsNoVat(termsNoVat ?? State.getQuoteTermsNoVat());
    State.setInternalQuoteTermsWithVat(termsWithVat ?? State.getQuoteTermsWithVat());
    State.setInternalPdfFooterText(footerText ?? State.getPdfFooterText());
    State.setInternalCompanyName(companyName ?? State.getCompanyName());
    State.setInternalCompanyAddress1(companyAddress1 ?? State.getCompanyAddress1());
    State.setInternalCompanyAddress2(companyAddress2 ?? State.getCompanyAddress2());
    State.setInternalCompanyWebsite(companyWebsite ?? State.getCompanyWebsite());
    State.setInternalCompanyPhone(companyPhone ?? State.getCompanyPhone());
    State.setInternalCompanyEmail(companyEmail ?? State.getCompanyEmail());

    // Populate settings textareas
    if (D.termsNoVatSetting) D.termsNoVatSetting.value = State.getQuoteTermsNoVat();
    if (D.termsWithVatSetting) D.termsWithVatSetting.value = State.getQuoteTermsWithVat();
    if (D.pdfFooterTextSetting) D.pdfFooterTextSetting.value = State.getPdfFooterText();
    if (D.companyNameSetting) D.companyNameSetting.value = State.getCompanyName();
    if (D.companyAddress1Setting) D.companyAddress1Setting.value = State.getCompanyAddress1();
    if (D.companyAddress2Setting) D.companyAddress2Setting.value = State.getCompanyAddress2();
    if (D.companyWebsiteSetting) D.companyWebsiteSetting.value = State.getCompanyWebsite();
    if (D.companyPhoneSetting) D.companyPhoneSetting.value = State.getCompanyPhone();
    if (D.companyEmailSetting) D.companyEmailSetting.value = State.getCompanyEmail();
}

// --- Main Render Functions ---
export function renderAllLists() {
    renderClientsList();
    renderCatalogItemsList();
    renderOrdersList();
    renderTechniciansList();
    renderSavedQuotesPageList();
    if (document.querySelector('#page-agenda.active')) renderAgendaPage();
}

export let currentSelectedOrderTypes: string[] = [];
export function renderOrderTypeOptions() {
    // La renderización tradicional se reemplaza por renderOrderTypeDropdown
}

export function renderQuote(quote: Quote | null) {
    const workspace = D.appContainer.querySelector('#page-quotes .quote-workspace') as HTMLElement;
    if (!quote) {
        workspace.style.display = 'none';
        D.deleteCurrentQuoteBtn.style.display = 'none';
        return;
    }
    workspace.style.display = 'flex';
    D.deleteCurrentQuoteBtn.style.display = State.getQuotes().some(q => q.id === quote.id) ? 'inline-flex' : 'none';
    if (D.duplicateQuoteBtn) D.duplicateQuoteBtn.style.display = State.getQuotes().some(q => q.id === quote.id) ? 'inline-flex' : 'none';
    D.quoteIdDisplay.textContent = `#${quote.manualId}`;
    (D.quoteDateInput as any)._flatpickr.setDate(quote.date, false);
    D.vatToggleSwitch.checked = quote.taxRate > 0;
    D.quoteTermsTextarea.value = quote.terms;
    D.quoteInternalNotesTextarea.value = quote.internal_notes || '';
    const client = State.getClients().find(c => c.id === quote.clientId);
    D.clientSearchInput.value = client ? `[${client.manualId}] ${client.name}` : '';
    renderClientDetails(quote.clientId, 'quote');
    D.editClientBtn.style.display = quote.clientId ? 'inline-flex' : 'none';
    D.quoteItemsTableBody.innerHTML = '';
    quote.items.forEach(item => D.quoteItemsTableBody.appendChild(createItemRow(item)));
    renderQuoteAnnexPreviews(quote);
    updateQuoteSummary();
}

function createNewQuoteTabElement(): HTMLDivElement {
    const tab = document.createElement('div');
    tab.className = 'quote-tab new-quote-tab';
    tab.title = 'Crear una nueva cotización';
    tab.innerHTML = `<i class="fas fa-plus"></i><span>Nueva</span>`;
    return tab;
}

export function renderQuoteTabs() {
    D.quoteTabsBar.innerHTML = '';
    State.getOpenQuotes().forEach(quote => {
        const tab = document.createElement('div');
        tab.className = 'quote-tab';
        tab.dataset.id = quote.id;
        const client = State.getClients().find(c => c.id === quote.clientId);
        tab.innerHTML = `<span>${client ? client.name.split(' ')[0] : `Coti #${quote.manualId}`}</span><span class="close-tab-btn">&times;</span>`;
        if (quote.id === State.getActiveQuoteId()) tab.classList.add('active');
        D.quoteTabsBar.appendChild(tab);
    });
    D.quoteTabsBar.appendChild(createNewQuoteTabElement());
}

// --- Navigation & Workspace Cleanup ---
/**
 * Cleans up transient UI state in the quote workspace, like search results.
 * Preserves the actual quote data being edited.
 */
function cleanupQuoteWorkspace() {
    D.clientSearchInput.value = '';
    D.itemSearchInput.value = '';
    D.clientSearchResultsContainer.innerHTML = '';
    D.clientSearchResultsContainer.style.display = 'none';
    D.itemSearchResultsContainer.innerHTML = '';
    D.itemSearchResultsContainer.style.display = 'none';
}

/**
 * Completely resets the order workspace state and form. This is a destructive
 * cleanup intended to be used when navigating away from the order editor to
 * prevent UI state from bleeding into other pages.
 */
function cleanupOrderWorkspace() {
    State.setCurrentOrder(null);
    D.orderWorkspaceTitle.textContent = 'Nueva Orden de Servicio';
    D.orderClientSearchInput.value = '';
    D.orderClientCityInput.value = '';
    D.orderClientDetails.innerHTML = '<p>Ningún cliente seleccionado</p>';
    D.orderEditClientBtn.style.display = 'none';
    if (D.orderDateInput && (D.orderDateInput as any)._flatpickr) {
        (D.orderDateInput as any)._flatpickr.clear();
    }
    D.orderTimeInput.value = '';
    D.orderDurationHoursInput.value = '';
    D.orderDurationMinutesInput.value = '';
    if (D.orderDifficultySelect) D.orderDifficultySelect.value = '';
    if (D.orderDurationHint) D.orderDurationHint.innerText = '';
    D.orderTypeSelect.value = '';
    D.orderStatusSelect.value = 'pending';
    D.orderNotesTextarea.value = '';
    D.orderServicesTableBody.innerHTML = '';
    D.orderMaterialsTableBody.innerHTML = '';
    D.orderItemSearchInput.value = '';
    renderTechnicianPills([]);
    updateOrderSummary();
}

export function navigateTo(pageId: string) {
    const currentPageId = document.querySelector('.page.active')?.id;
    const isAgendaActive = document.getElementById('page-agenda')?.classList.contains('active');

    // --- MODAL HANDLING ---
    if (pageId === 'page-orders' && document.getElementById('page-order-workspace')?.classList.contains('page-as-modal')) {
        // If we are in the order modal over the agenda and hit 'Volver'
        document.getElementById('page-order-workspace')?.classList.remove('page-as-modal', 'active');
        // Do not proceed with full navigation, stay on Agenda
        return;
    }

    // --- CLEANUP PHASE ---
    // This phase happens *before* any page is shown or hidden.
    // It guarantees that when we leave a page, its state is reset as required.
    if (currentPageId === 'page-order-workspace' && pageId !== 'page-order-workspace') {
        cleanupOrderWorkspace();
    }
    if (currentPageId === 'page-quotes' && pageId !== 'page-quotes') {
        cleanupQuoteWorkspace();
    }

    // --- VISIBILITY PHASE ---
    // Hide ALL pages first. This is the most important step to prevent mixing UIs.
    D.pageContainers.forEach(container => {
        if (pageId === 'page-order-workspace' && isAgendaActive) {
            // If opening workspace as modal, keep agenda active
            if (container.id !== 'page-order-workspace' && container.id !== 'page-agenda') {
                container.classList.remove('active');
            }
        } else {
            container.classList.remove('active');
            container.classList.remove('page-as-modal');
        }
    });

    // Show the target page.
    const newPage = document.getElementById(pageId);
    if (newPage) {
        newPage.classList.add('active');
        if (pageId === 'page-order-workspace' && isAgendaActive) {
            newPage.classList.add('page-as-modal');
        }
    }

    // --- SIDENAV HIGHLIGHTING ---
    // The "Orders" nav link should be active for both the list and the editor.
    const navLinkPageId = pageId === 'page-order-workspace' ? 'page-orders' : pageId;
    D.mainNavLinks.forEach(link => {
        link.classList.toggle('active', (link as HTMLElement).dataset.page === navLinkPageId);
    });

    // --- RE-RENDER/REFRESH PHASE ---
    // After the new page is visible, refresh its content if necessary.
    if (['page-orders', 'page-saved-quotes', 'page-clients', 'page-items', 'page-technicians'].includes(pageId)) {
        renderAllLists();
    } else if (pageId === 'page-agenda') {
        renderAgendaPage();
        // Auto-scroll to today's date in week view when the page is first loaded
        setTimeout(() => {
            const agendaContent = D.agendaPage.querySelector('#agenda-page-content');
            const todayElement = agendaContent?.querySelector('.day-header.today');
            if (todayElement) {
                todayElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 200); // Small delay to ensure render is complete
    }
    else if (pageId === 'page-quotes') {
        // Re-rendering the quote ensures that if we came from another page, the quote workspace
        // is correctly displayed with the active quote's data, creating a clean view.
        renderQuote(State.getActiveQuote());
    }
}


// --- Quote Tab Interactivity ---
export async function createNewQuote(clickedPlusTab?: HTMLElement) {
    const newQuote: Quote = {
        id: generateId(), created_at: new Date().toISOString(), manualId: 'Borrador',
        date: new Date().toISOString(), clientId: null, taxRate: 0, terms: State.getQuoteTermsNoVat(), items: [],
    };
    State.addOpenQuote(newQuote);
    State.setActiveQuoteId(newQuote.id);
    renderQuoteTabs();
    renderQuote(newQuote);
}

export function switchQuoteTab(quoteId: string) {
    State.setActiveQuoteId(quoteId);
    renderQuote(State.getActiveQuote());
    D.quoteTabsBar.querySelectorAll('.quote-tab').forEach(tab => {
        tab.classList.toggle('active', (tab as HTMLElement).dataset.id === quoteId);
    });
}

export async function closeQuoteTab(quoteId: string) {
    const openQuotes = State.getOpenQuotes();
    const activeId = State.getActiveQuoteId();
    const closingTabIndex = openQuotes.findIndex(q => q.id === quoteId);
    State.removeOpenQuote(quoteId);
    const remainingQuotes = State.getOpenQuotes();

    D.quoteTabsBar.querySelector(`.quote-tab[data-id="${quoteId}"]`)?.remove();

    if (remainingQuotes.length === 0) {
        await createNewQuote();
    } else if (activeId === quoteId) {
        const nextIndex = Math.max(0, closingTabIndex - 1);
        switchQuoteTab(remainingQuotes[nextIndex].id);
    }
}

export function handleRemoveItemFromQuote(itemId: string) {
    const quote = State.getActiveQuote();
    if (!quote) return;
    quote.items = quote.items.filter(i => i.id !== itemId);
    State.updateActiveQuote(quote);
    renderQuote(quote);
}

// --- Save/Generate Handlers ---
export async function handleSaveQuote(): Promise<boolean> {
    const quote = State.getActiveQuote();
    if (!quote || !quote.clientId) {
        showNotification("Por favor, seleccione un cliente.", "error");
        return false;
    }

    const isNewQuote = !State.getQuotes().some(q => q.id === quote.id);
    const btn = D.saveQuoteBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando...`;

    try {
        if (quote.manualId === 'Borrador') {
            quote.manualId = await getNextQuoteManualId();
        }
        const savedQuote = await API.saveQuote(quote);
        State.setQuotes([...State.getQuotes().filter(q => q.id !== savedQuote.id), savedQuote]);
        State.updateActiveQuote(savedQuote);
        if (isNewQuote) {
            const authorName = getSessionUser().name || 'Admin';
            void State.setQuoteAuthor(savedQuote.id, authorName).catch(error => {
                console.error('Failed to save quote author metadata:', error);
            });
        }
        renderQuote(savedQuote);
        renderQuoteTabs();
        showNotification(`Cotización #${savedQuote.manualId} guardada.`, 'success');
        return true;
    } catch (e: any) {
        showNotification("Error al guardar la cotización.", "error");
        return false;
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

export async function handleGeneratePdf() {
    const quote = State.getActiveQuote();
    if (!quote || !quote.clientId) {
        showNotification("Por favor, seleccione un cliente.", "error");
        return;
    }

    const btn = D.generatePdfBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    D.saveQuoteBtn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparando...`;

    try {
        if (!await handleSaveQuote()) {
            throw new Error("No se pudo guardar la cotización antes de generar el PDF.");
        }
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generando PDF...`;
        const doc = await generateQuotePDFDoc(State.getActiveQuote()!);
        const preference = isMobileDevice() ? 'download' : State.getPdfOutputPreference();
        if (preference === 'download') {
            doc.save(State.getCurrentPdfFileName() || 'Cotizacion.pdf');
        } else {
            State.setCurrentPdfDocForDownload(doc);
            previewPdfInModal(doc);
        }
    } catch (err: any) {
        showNotification(`Error al generar el PDF: ${err.message}`, 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        D.saveQuoteBtn.disabled = false;
        btn.innerHTML = originalText;
    }
}

export async function handleGeneratePdfFromList(quoteId: string, btn: HTMLButtonElement) {
    const quote = State.getQuotes().find(q => q.id === quoteId);
    if (!quote) return;
    
    // Check client
    const client = State.getClients().find(c => c.id === quote.clientId);
    if (!client) {
        showNotification("Debe asignar un cliente a esta cotización.", "error");
        return;
    }

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

    try {
        const doc = await generateQuotePDFDoc(quote);
        const preference = isMobileDevice() ? 'download' : State.getPdfOutputPreference();
        if (preference === 'download') {
            doc.save(State.getCurrentPdfFileName() || 'Cotizacion.pdf');
        } else {
            State.setCurrentPdfDocForDownload(doc);
            // State is already set by generateQuotePDFDoc
            previewPdfInModal(doc);
        }
    } catch (err: any) {
        showNotification(`Error al generar el PDF: ${err.message}`, 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

export async function handleGenerateBillFromList(quoteId: string, btn: HTMLButtonElement) {
    const quote = State.getQuotes().find(q => q.id === quoteId);
    if (!quote) return;
    
    const client = State.getClients().find(c => c.id === quote.clientId);
    if (!client) {
        showNotification("Debe asignar un cliente a esta cotización.", "error");
        return;
    }

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

    try {
        const doc = await generateBillPDFDoc(quote);
        const preference = isMobileDevice() ? 'download' : State.getPdfOutputPreference();
        if (preference === 'download') {
            doc.save(`Cuenta de Cobro No. ${quote.manualId} ${client.name.toUpperCase()}.pdf`);
        } else {
            State.setCurrentPdfDocForDownload(doc);
            State.setCurrentPdfFileName(`Cuenta de Cobro No. ${quote.manualId} ${client.name.toUpperCase()}.pdf`);
            previewPdfInModal(doc);
        }
    } catch (err: any) {
        console.error("Error generating bill pdf:", err);
        showNotification("Error al generar la cuenta de cobro.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

export async function handleGenerateOrderPdf() {
    const order = State.getCurrentOrder();
    if (!order || !order.clientId) {
        showNotification("Por favor, seleccione un cliente.", "error");
        return;
    }

    const btn = D.generateOrderPdfBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    D.saveOrderBtn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Preparando...`;

    try {
        if (!await handleSaveOrder()) {
            throw new Error("No se pudo guardar la orden antes de generar el PDF.");
        }
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Generando PDF...`;
        const doc = await generateOrderPDFDoc(State.getCurrentOrder()!);
        const preference = isMobileDevice() ? 'download' : State.getPdfOutputPreference();
        if (preference === 'download') {
            doc.save(State.getCurrentPdfFileName() || 'OrdenDeServicio.pdf');
        } else {
            State.setCurrentPdfDocForDownload(doc);
            previewPdfInModal(doc);
        }
    } catch (err: any) {
        showNotification(`Error: ${err.message}`, "error");
    } finally {
        btn.disabled = false;
        D.saveOrderBtn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- Load/Delete Actions ---
export function loadQuote(quoteId: string) {
    if (State.getOpenQuotes().some(q => q.id === quoteId)) {
        switchQuoteTab(quoteId);
    } else {
        const quote = State.getQuotes().find(q => q.id === quoteId);
        if (quote) {
            State.addOpenQuote(JSON.parse(JSON.stringify(quote)));
            renderQuoteTabs();
            switchQuoteTab(quote.id);
        }
    }
    navigateTo('page-quotes');
}

export function handleDeleteQuote(quoteId: string) {
    const quote = State.getQuotes().find(q => q.id === quoteId) || State.getOpenQuotes().find(q => q.id === quoteId);
    if (!quote) return;
    showConfirmationModal('Confirmar Eliminación', `¿Desea eliminar la cotización #${quote.manualId}?`, async () => {
        try {
            await API.deleteQuote(quoteId);
            State.setQuotes(State.getQuotes().filter(q => q.id !== quoteId));
            renderSavedQuotesPageList();
            if (State.getOpenQuotes().some(q => q.id === quoteId)) {
                await closeQuoteTab(quoteId);
            }
            showNotification(`Cotización #${quote.manualId} eliminada.`, 'success');
        } catch (e: any) {
            showNotification('Error al eliminar la cotización.', 'error');
        }
    });
}

export async function handleDuplicateQuote(quoteId: string, openAfter: boolean = true, triggerBtn?: HTMLButtonElement | null) {
    const originalQuote = State.getQuotes().find(q => q.id === quoteId) || State.getOpenQuotes().find(q => q.id === quoteId);
    if (!originalQuote) return;

    let originalBtnText = '';
    if (triggerBtn) {
        originalBtnText = triggerBtn.innerHTML;
        triggerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duplicando...';
        triggerBtn.disabled = true;
    }

    try {
        const newQuoteId = await API.getNextQuoteId();
        const duplicatedQuote = {
            ...originalQuote,
            id: generateId(),
            manualId: newQuoteId,
            date: new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
            items: originalQuote.items.map(item => ({ ...item, id: generateId() }))
        };
        const savedQuote = await API.saveQuote(duplicatedQuote as any);
        State.setQuotes([...State.getQuotes(), savedQuote]);

        const authorName = getSessionUser().name || 'Admin';
        await State.setQuoteAuthor(savedQuote.id, authorName);

        State.addOpenQuote(savedQuote);
        renderQuoteTabs();

        if (openAfter) {
            switchQuoteTab(savedQuote.id);
            navigateTo('page-quotes');
        } else {
            if (document.querySelector('#page-saved-quotes.active')) {
                renderSavedQuotesPageList();
                setTimeout(() => {
                    const row = document.querySelector(`.saved-quotes-table tr[data-id="${savedQuote.id}"]`);
                    if (row) {
                        const r = row as HTMLElement;
                        r.style.transition = 'all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)';
                        r.style.backgroundColor = '#9ae6b4'; // Vibrant light green
                        r.style.boxShadow = '0 4px 15px rgba(72, 187, 120, 0.4)';
                        r.style.transform = 'scale(1.01)';
                        r.style.zIndex = '10';
                        r.style.position = 'relative';

                        setTimeout(() => {
                            r.style.backgroundColor = '';
                            r.style.boxShadow = '';
                            r.style.transform = '';
                            r.style.zIndex = '';
                            r.style.position = '';
                        }, 2500);
                    }
                }, 50);
            }
        }

        if (triggerBtn) {
            triggerBtn.innerHTML = originalBtnText;
            triggerBtn.disabled = false;
        }

        showNotification(`Cotización #${originalQuote.manualId} duplicada exitosamente como #${newQuoteId}`, 'success');
    } catch (e) {
        if (triggerBtn) {
            triggerBtn.innerHTML = originalBtnText;
            triggerBtn.disabled = false;
        }
        showNotification('Error al duplicar la cotización.', 'error');
    }
}

// --- Search UIs (Generic) ---
export function setupItemSearch(input: HTMLInputElement, results: HTMLDivElement, context: 'quote' | 'order') {
    let currentFocus = -1;
    input.addEventListener('input', () => {
        currentFocus = -1;
        const term = input.value.toLowerCase();
        results.style.display = 'none';
        if (term.length < 1) return;
        const items = State.getItems().filter(i => i.name.toLowerCase().includes(term) || i.manualId.toLowerCase().includes(term)).slice(0, 5);
        if (items.length > 0) {
            results.innerHTML = items.map(i => `<div class="search-result-item" data-id="${i.id}"><span class="item-code">[${i.manualId}]</span> ${i.name} <span class="item-price">${formatCurrency(i.price)}</span></div>`).join('');
            results.style.display = 'block';
        }
    });

    input.addEventListener('keydown', (e) => {
        let x = results.querySelectorAll('.search-result-item');
        if (!x || x.length === 0 || results.style.display === 'none') return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus++;
            addActive(x);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus--;
            addActive(x);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1) {
                (x[currentFocus] as HTMLElement).click();
            } else if (x.length > 0) {
                (x[0] as HTMLElement).click();
            }
        }
    });

    function addActive(x: NodeListOf<Element>) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add('search-active');
        (x[currentFocus] as HTMLElement).scrollIntoView({ block: "nearest" });
    }

    function removeActive(x: NodeListOf<Element>) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove('search-active');
        }
    }

    results.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const itemDiv = target.closest('.search-result-item');
        if (!itemDiv) return;
        const itemId = (itemDiv as HTMLElement).dataset.id;
        const item = State.getItems().find(i => i.id === itemId);
        if (item) {
            context === 'quote' ? addItemToQuote(item) : addItemToOrder(item);
            input.value = '';
            results.style.display = 'none';
            currentFocus = -1;

            // Automatically focus Quantity input of the newly added item row
            setTimeout(() => {
                const tbodyId = context === 'quote' ? 'quote-items-tbody' : 'order-items-tbody';
                const rows = document.querySelectorAll(`#${tbodyId} .draggable-row`);
                if (rows.length > 0) {
                    const lastRow = rows[rows.length - 1];
                    const qtyInput = lastRow.querySelector('.item-qty') as HTMLInputElement;
                    if (qtyInput) {
                        qtyInput.focus();
                        qtyInput.select();
                    }
                }
            }, 50);
        }
    });
    document.addEventListener('click', (e) => {
        if (!input.parentElement?.contains(e.target as Node)) results.style.display = 'none';
    });
}

export function setupClientSearch(input: HTMLInputElement, results: HTMLDivElement, context: 'quote' | 'order') {
    let currentFocus = -1;
    input.addEventListener('input', () => {
        currentFocus = -1;
        const term = input.value.toLowerCase();
        results.style.display = 'none';
        if (term.length < 1) return;
        const clients = State.getClients().filter(c => 
            (c.category === 'empresa' || c.category === 'residencial') &&
            (c.name.toLowerCase().includes(term) || c.manualId.toLowerCase().includes(term))
        ).slice(0, 5);
        if (clients.length > 0) {
            results.innerHTML = clients.map(c => `<div class="search-result-item" data-id="${c.id}"><span class="client-id">[${c.manualId}]</span> ${c.name}</div>`).join('');
            results.style.display = 'block';
        }
    });

    input.addEventListener('keydown', (e) => {
        let x = results.querySelectorAll('.search-result-item');
        if (!x || x.length === 0 || results.style.display === 'none') return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus++;
            addActive(x);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus--;
            addActive(x);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1) {
                (x[currentFocus] as HTMLElement).click();
            } else if (x.length > 0) {
                (x[0] as HTMLElement).click();
            }
        }
    });

    function addActive(x: NodeListOf<Element>) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add('search-active');
        (x[currentFocus] as HTMLElement).scrollIntoView({ block: "nearest" });
    }

    function removeActive(x: NodeListOf<Element>) {
        for (let i = 0; i < x.length; i++) {
            x[i].classList.remove('search-active');
        }
    }

    results.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const clientDiv = target.closest('.search-result-item');
        if (!clientDiv) return;
        const clientId = (clientDiv as HTMLElement).dataset.id;
        const client = State.getClients().find(c => c.id === clientId);
        if (client) {
            if (context === 'quote') {
                const quote = State.getActiveQuote();
                if (quote) {
                    quote.clientId = client.id;
                    State.updateActiveQuote(quote);
                    const tabSpan = D.quoteTabsBar.querySelector(`.quote-tab.active[data-id="${quote.id}"] span:first-child`);
                    if (tabSpan) tabSpan.textContent = client.name.split(' ')[0];
                    D.editClientBtn.style.display = 'inline-flex';
                    renderQuote(quote);
                }
            } else {
                const order = State.getCurrentOrder();
                if (order) {
                    order.clientId = client.id;
                    renderOrderWorkspace(order);
                }
            }
            results.style.display = 'none';
            currentFocus = -1;
        }
    });
    document.addEventListener('click', (e) => {
        if (!input.parentElement?.contains(e.target as Node)) results.style.display = 'none';
    });
}

function addItemToQuote(item: Item) {
    const quote = State.getActiveQuote();
    if (!quote) return;
    const quoteItem: QuoteItem = { id: generateId(), created_at: new Date().toISOString(), quoteId: quote.id, itemId: item.id, manualId: item.manualId, description: item.name, quantity: 1, price: item.price };
    quote.items.push(quoteItem);
    State.updateActiveQuote(quote);
    renderQuote(quote);
}

function addItemToOrder(item: Item) {
    const order = State.getCurrentOrder();
    if (!order) return;
    const orderItem: OrderItem = { id: generateId(), created_at: new Date().toISOString(), orderId: order.id, itemId: item.id, manualId: item.manualId, description: item.name, quantity: 1, price: item.price, completed_quantity: 0 };
    order.items.push(orderItem);
    order.order_type = inferOrderTypesFromItems(order.items, order.order_type || '');
    renderOrderWorkspace(order);
}

export function renderClientDetails(clientId: string | null, context: 'quote' | 'order', currentCityFilter: string | null = null) {
    const container = context === 'quote' ? D.clientDetailsContainer : D.orderClientDetails;
    const sedeContainer = context === 'quote' ? D.quoteSedeContainer : D.orderSedeContainer;
    const sedeSelect = context === 'quote' ? D.quoteSedeSelect : D.orderSedeSelect;
    const cityContainer = context === 'quote' ? D.quoteCityContainer : D.orderCityContainer;
    const citySelect = context === 'quote' ? D.quoteCitySelect : D.orderCitySelect;
    
    let currentSedeId: string | null = null;
    if (context === 'quote') {
        currentSedeId = State.getActiveQuote()?.sede_id || null;
    } else {
        currentSedeId = State.getCurrentOrder()?.sede_id || null;
    }

    if (!clientId) {
        container.innerHTML = '<p>Ningún cliente seleccionado</p>';
        sedeContainer.style.display = 'none';
        if (cityContainer) cityContainer.style.display = 'none';
        return;
    }
    const client = State.getClients().find(c => c.id === clientId);
    if (client) {
        container.innerHTML = `<p><i class="fas fa-user-tie"></i> <strong>Contacto:</strong> ${client.contactPerson || 'N/A'}</p><p><i class="fas fa-map-marker-alt"></i> <strong>Dirección:</strong> ${client.address || 'N/A'}</p><p><i class="fas fa-phone"></i> <strong>Teléfono:</strong> ${client.phone || 'N/A'}</p><p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${client.email || 'N/A'}</p>`;
        
        if (client.category === 'empresa') {
            const sedes = State.getSedes().filter(s => s.client_id === clientId);
            
            if (sedes.length === 0) {
                // No sedes registered - just show the company info
                if (cityContainer) cityContainer.style.display = 'none';
                sedeContainer.style.display = 'none';
            } else if (sedes.length === 1) {
                // Only one sede - hide selectors, show sede info inline, auto-assign
                if (cityContainer) cityContainer.style.display = 'none';
                sedeContainer.style.display = 'none';
                
                const sede = sedes[0];
                container.innerHTML = `<p><i class="fas fa-building"></i> <strong>Sede:</strong> ${sede.name}</p>
                    <p><i class="fas fa-user-tie"></i> <strong>Contacto:</strong> ${sede.contact_person || client.contactPerson || 'N/A'}</p>
                    <p><i class="fas fa-map-marker-alt"></i> <strong>Dirección:</strong> ${sede.address || client.address || 'N/A'}</p>
                    <p><i class="fas fa-city"></i> <strong>Ciudad:</strong> ${sede.cityName || client.city || 'N/A'}</p>
                    <p><i class="fas fa-phone"></i> <strong>Teléfono:</strong> ${sede.phone || client.phone || 'N/A'}</p>
                    <p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${client.email || 'N/A'}</p>`;
                
                // Auto-assign the only sede
                if (!currentSedeId || currentSedeId !== sede.id) {
                    setTimeout(() => {
                        if (context === 'quote') {
                            const quote = State.getActiveQuote();
                            if (quote && quote.sede_id !== sede.id) { 
                                quote.sede_id = sede.id; 
                                State.updateActiveQuote(quote); 
                            }
                        } else {
                            const order = State.getCurrentOrder();
                            if (order && order.sede_id !== sede.id) { 
                                order.sede_id = sede.id; 
                                if (D.orderClientCityInput) {
                                    const clientT = State.getClients().find(c => c.id === order.clientId);
                                    D.orderClientCityInput.value = sede.cityName || clientT?.city || '';
                                }
                            }
                        }
                    }, 0);
                }
            } else {
                // Multiple sedes - show cascading city -> sede selectors
                if (cityContainer) cityContainer.style.display = 'block';
                sedeContainer.style.display = 'block';
                sedeSelect.disabled = false;
                
                const validCities = sedes.filter(s => s.city_id).map(s => ({ id: s.city_id!, name: s.cityName || 'Ciudad desconocida' }));
                const uniqueCitiesMap = new Map();
                validCities.forEach(c => uniqueCitiesMap.set(c.id, c.name));
                
                if (citySelect) {
                    citySelect.innerHTML = '<option value="">Seleccione una ciudad...</option>' + 
                        Array.from(uniqueCitiesMap.entries()).map(([id, name]) => `<option value="${id}" ${id === currentCityFilter ? 'selected' : ''}>${name}</option>`).join('');
                }

                const filteredSedes = currentCityFilter ? sedes.filter(s => s.city_id === currentCityFilter) : sedes;
                
                sedeSelect.innerHTML = '<option value="">Seleccione una sede...</option>' + 
                    filteredSedes.map(s => `<option value="${s.id}" ${s.id === currentSedeId ? 'selected' : ''}>${s.name} ${s.cityName && !currentCityFilter ? `(${s.cityName})` : ''}</option>`).join('');

                if (currentSedeId) {
                    const selectedSede = sedes.find(s => s.id === currentSedeId);
                    if (selectedSede) {
                        container.innerHTML = `<p><i class="fas fa-building"></i> <strong>Sede:</strong> ${selectedSede.name}</p>
                            <p><i class="fas fa-user-tie"></i> <strong>Contacto:</strong> ${selectedSede.contact_person || client.contactPerson || 'N/A'}</p>
                            <p><i class="fas fa-map-marker-alt"></i> <strong>Dirección:</strong> ${selectedSede.address || client.address || 'N/A'}</p>
                            <p><i class="fas fa-city"></i> <strong>Ciudad:</strong> ${selectedSede.cityName || client.city || 'N/A'}</p>
                            <p><i class="fas fa-phone"></i> <strong>Teléfono:</strong> ${selectedSede.phone || client.phone || 'N/A'}</p>
                            <p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${client.email || 'N/A'}</p>`;
                    }
                }
            }
        } else {
            if (cityContainer) cityContainer.style.display = 'none';
            sedeContainer.style.display = 'none';
            if (citySelect) citySelect.innerHTML = '<option value="">Seleccione una ciudad...</option>';
            sedeSelect.innerHTML = '<option value="">Seleccione una sede...</option>';
            
            if (currentSedeId) {
                setTimeout(() => {
                    if (context === 'quote') {
                        const quote = State.getActiveQuote();
                        if (quote && quote.sede_id !== null) { 
                            quote.sede_id = null; 
                            State.updateActiveQuote(quote); 
                        }
                    } else {
                        const order = State.getCurrentOrder();
                        if (order && order.sede_id !== null) { 
                            order.sede_id = null; 
                        }
                    }
                }, 0);
            }
        }
    } else {
        container.innerHTML = '<p>Cliente no encontrado.</p>';
        if (cityContainer) cityContainer.style.display = 'none';
        sedeContainer.style.display = 'none';
        if (citySelect) citySelect.innerHTML = '<option value="">Seleccione una ciudad...</option>';
        sedeSelect.innerHTML = '<option value="">Seleccione una sede (Opcional)...</option>';
    }
}

// --- Management Page List Rendering ---
function getClientSedes(clientId: string): Sede[] {
    return State.getSedes()
        .filter(s => s.client_id === clientId)
        .sort((a, b) => (a.cityName || '').localeCompare(b.cityName || '') || a.name.localeCompare(b.name));
}

function getSedeDependencies(sede: Sede): Dependency[] {
    return State.getDependencies()
        .filter(dependency => dependency.sede_id === sede.id || dependency.company_id === sede.id || dependency.client_id === sede.id)
        .sort((a, b) => a.name.localeCompare(b.name));
}

function renderSedeDependenciesDropdown(client: Client, sede: Sede, dependencies: Dependency[]): string {
    if (!expandedSedeDependencyIds.has(sede.id)) return '';

    const content = dependencies.length === 0 ? `
        <div class="sede-dependencies-empty">
            Esta sede no tiene dependencias registradas.
        </div>` : `
        <div class="sede-dependencies-list">
            ${dependencies.map(dependency => `
                <div class="sede-dependency-item">
                    <span><i class="fas fa-sitemap"></i> ${escapeHtml(dependency.name)}</span>
                    <div class="sede-dependency-actions">
                        <button class="btn btn-sm btn-secondary edit-dependency-btn" data-id="${escapeHtml(dependency.id)}" data-parent-id="${escapeHtml(client.id)}" data-sede-id="${escapeHtml(sede.id)}">
                            Editar
                        </button>
                        <button class="btn btn-sm btn-danger delete-dependency-btn" data-id="${escapeHtml(dependency.id)}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>`).join('')}
        </div>`;

    return `
        <div class="sede-dependencies-dropdown">
            <div class="sede-dependencies-header">
                <strong>${escapeHtml(sede.name)}</strong>
                <button class="btn btn-sm add-dependency-sede-btn" data-parent-id="${escapeHtml(client.id)}" data-sede-id="${escapeHtml(sede.id)}">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            ${content}
        </div>`;
}

function renderClientSedesRow(client: Client, sedes: Sede[]): string {
    const selectedCityId = clientSedeCityFilters.get(client.id) || '';
    const uniqueCities = Array.from(new Map(
        sedes.map(sede => [
            sede.city_id || '__no_city__',
            sede.cityName || 'Sin ciudad definida'
        ])
    ).entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const filteredSedes = selectedCityId
        ? sedes.filter(sede => (sede.city_id || '__no_city__') === selectedCityId)
        : sedes;

    const emptyState = `
        <div class="client-sedes-empty">
            Esta empresa no tiene sedes registradas.
            <button class="btn btn-sm add-sede-client-btn" data-id="${escapeHtml(client.id)}">
                <i class="fas fa-plus"></i> Añadir sede
            </button>
        </div>`;

    const filteredEmptyState = `
        <div class="client-sedes-empty">
            No hay sedes registradas para la ciudad seleccionada.
        </div>`;

    const filterHtml = sedes.length > 0 ? `
        <div class="client-sedes-filter">
            <label for="client-sedes-city-${escapeHtml(client.id)}">Ciudad</label>
            <select id="client-sedes-city-${escapeHtml(client.id)}" class="client-sedes-city-filter" data-id="${escapeHtml(client.id)}">
                <option value="">Todas las ciudades (${sedes.length})</option>
                ${uniqueCities.map(([cityId, cityName]) => {
                    const count = sedes.filter(sede => (sede.city_id || '__no_city__') === cityId).length;
                    return `<option value="${escapeHtml(cityId)}" ${cityId === selectedCityId ? 'selected' : ''}>${escapeHtml(cityName)} (${count})</option>`;
                }).join('')}
            </select>
        </div>` : '';

    const sedesList = sedes.length === 0 ? emptyState : filteredSedes.length === 0 ? filteredEmptyState : `
        <div class="client-sedes-grid">
            ${filteredSedes.map(sede => `
                ${(() => {
                    const dependencies = getSedeDependencies(sede);
                    const isDependencyExpanded = expandedSedeDependencyIds.has(sede.id);
                    return `
                <div class="client-sede-item">
                    <div class="client-sede-main">
                        <strong>${escapeHtml(sede.name)}</strong>
                        <span>${escapeHtml(sede.cityName || 'Ciudad sin definir')}</span>
                        <small class="client-sede-id">ID: ${escapeHtml(sede.id)}</small>
                    </div>
                    <div class="client-sede-meta">
                        <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(sede.address || 'Sin direccion')}</span>
                        <span><i class="fas fa-user-tie"></i> ${escapeHtml(sede.contact_person || 'Sin encargado')}</span>
                        <span><i class="fas fa-phone"></i> ${escapeHtml(sede.phone || 'Sin telefono')}</span>
                    </div>
                    <button class="btn btn-sm btn-secondary edit-sede-btn" data-id="${escapeHtml(sede.id)}" data-parent-id="${escapeHtml(client.id)}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <div class="client-sede-actions">
                        <button class="btn btn-sm view-dependencies-sede-btn" data-id="${escapeHtml(sede.id)}">
                            <i class="fas ${isDependencyExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                            ${dependencies.length} ${dependencies.length === 1 ? 'dependencia' : 'dependencias'}
                        </button>
                        <button class="btn btn-sm add-dependency-sede-btn" data-parent-id="${escapeHtml(client.id)}" data-sede-id="${escapeHtml(sede.id)}">
                            <i class="fas fa-plus"></i> Crear dependencia
                        </button>
                    </div>
                    ${renderSedeDependenciesDropdown(client, sede, dependencies)}
                </div>`;
                })()}`).join('')}
        </div>`;

    return `
        <tr class="client-sedes-row">
            <td colspan="6">
                <div class="client-sedes-panel">
                    <div class="client-sedes-header">
                        <strong>Sedes de ${escapeHtml(client.name)}</strong>
                        <button class="btn btn-sm add-sede-client-btn" data-id="${escapeHtml(client.id)}">
                            <i class="fas fa-plus"></i> Añadir sede
                        </button>
                    </div>
                    ${filterHtml}
                    ${sedesList}
                </div>
            </td>
        </tr>`;
}

export function renderClientsList() {
    D.clientCountBadge.textContent = State.getClients().length.toString();
    const term = D.clientListSearchInput.value.toLowerCase();
    const clients = State.getClients().filter(c => c.name?.toLowerCase().includes(term) || c.contactPerson?.toLowerCase().includes(term) || c.manualId?.toLowerCase().includes(term));
    let html = `<table class="management-table clients-management-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Sedes</th><th>Contacto</th><th>Teléfono</th><th class="actions">Acciones</th></tr></thead><tbody>`;
    if (clients.length > 0) {
        html += clients.sort((a, b) => (parseInt(b.manualId) || 0) - (parseInt(a.manualId) || 0)).map(c => {
            const sedes = c.category === 'empresa' ? getClientSedes(c.id) : [];
            const isExpanded = expandedClientSedeIds.has(c.id);
            const typeLabel = c.category === 'empresa' ? 'Empresa' : 'Residencial';
            const typeIcon = c.category === 'empresa' ? 'fa-building' : 'fa-home';
            const typeClass = c.category === 'empresa' ? 'empresa' : 'residencial';
            const row = `
                <tr class="${isExpanded ? 'client-row-expanded' : ''}">
                    <td>
                        <strong>${escapeHtml(c.name)}</strong><br>
                        <small>ID: ${escapeHtml(c.manualId)}</small>
                        ${c.email ? `<br><small>${escapeHtml(c.email)}</small>` : ''}
                    </td>
                    <td><span class="client-type-badge ${typeClass}"><i class="fas ${typeIcon}"></i> ${typeLabel}</span></td>
                    <td>
                        ${c.category === 'empresa' ? `
                            <button class="btn btn-sm view-sedes-client-btn" data-id="${escapeHtml(c.id)}" title="${isExpanded ? 'Ocultar sedes' : 'Ver sedes'}">
                                <i class="fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i>
                                ${sedes.length} ${sedes.length === 1 ? 'sede' : 'sedes'}
                            </button>` : '<span class="muted-text">No aplica</span>'}
                    </td>
                    <td>${escapeHtml(c.contactPerson || '-')}</td>
                    <td>${escapeHtml(c.phone || '-')}</td>
                    <td class="actions">
                        <button class="btn btn-icon-only btn-secondary edit-btn" data-id="${escapeHtml(c.id)}" title="Editar"><i class="fas fa-edit"></i></button>
                        ${c.category === 'empresa' ? `<button class="btn btn-icon-only add-sede-client-btn" data-id="${escapeHtml(c.id)}" title="Añadir Sede" style="background-color: #f1f8ff; border: 1px solid #c8e1ff; color: #0366d6; margin: 0 4px;"><i class="fas fa-building"></i></button>` : ''}
                        <button class="btn btn-icon-only toggle-category-btn" data-id="${escapeHtml(c.id)}" title="Cambiar a ${c.category === 'empresa' ? 'Residencial' : 'Empresa'}" style="background-color: ${c.category === 'empresa' ? '#fff3cd' : '#d4edda'}; border: 1px solid ${c.category === 'empresa' ? '#ffeeba' : '#c3e6cb'}; color: ${c.category === 'empresa' ? '#856404' : '#155724'}; margin: 0 4px;"><i class="fas ${c.category === 'empresa' ? 'fa-home' : 'fa-building'}"></i></button>
                        <button class="btn btn-icon-only btn-danger delete-btn" data-id="${escapeHtml(c.id)}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            return row + (isExpanded ? renderClientSedesRow(c, sedes) : '');
        }).join('');
    } else {
        html += `<tr><td colspan="6" style="text-align: center; padding: 20px;">No hay clientes.</td></tr>`;
    }
    D.clientsListContainer.innerHTML = html + `</tbody></table>`;
}

export function toggleClientSedes(clientId: string) {
    if (expandedClientSedeIds.has(clientId)) {
        expandedClientSedeIds.delete(clientId);
    } else {
        expandedClientSedeIds.add(clientId);
    }
    renderClientsList();
}

export function setClientSedesCityFilter(clientId: string, cityId: string) {
    if (cityId) {
        clientSedeCityFilters.set(clientId, cityId);
    } else {
        clientSedeCityFilters.delete(clientId);
    }
    expandedClientSedeIds.add(clientId);
    renderClientsList();
}

export function toggleSedeDependencies(sedeId: string) {
    if (expandedSedeDependencyIds.has(sedeId)) {
        expandedSedeDependencyIds.delete(sedeId);
    } else {
        expandedSedeDependencyIds.clear();
        expandedSedeDependencyIds.add(sedeId);
    }
    renderClientsList();
}

export function renderCatalogItemsList() {
    D.itemCountBadge.textContent = State.getItems().length.toString();
    const term = D.itemListSearchInput.value.toLowerCase();
    const items = State.getItems().filter(i => i.name?.toLowerCase().includes(term) || i.manualId?.toLowerCase().includes(term));
    let html = `<table class="management-table"><thead><tr><th>Nombre / Descripción</th><th>Código</th><th>Precio</th><th class="actions">Acciones</th></tr></thead><tbody>`;
    if (items.length > 0) {
        html += items.sort((a, b) => (parseInt(b.manualId) || 0) - (parseInt(a.manualId) || 0)).map(i => `<tr><td><strong>${i.name}</strong><br><small>Precio: ${formatCurrency(i.price)}</small></td><td>${i.manualId}</td><td>${formatCurrency(i.price)}</td><td class="actions"><button class="btn btn-icon-only btn-secondary edit-btn" data-id="${i.id}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-icon-only btn-danger delete-btn" data-id="${i.id}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    } else {
        html += `<tr><td colspan="4" style="text-align: center; padding: 20px;">No hay insumos.</td></tr>`;
    }
    D.itemsListContainer.innerHTML = html + `</tbody></table>`;
}

export function getAuthorColor(author: string): string {
    if (!author || author === 'N/A') return 'var(--color-text-secondary)';
    const colors = ['#0284c7', '#16a34a', '#ea580c', '#7c3aed', '#e11d48', '#0d9488', '#ca8a04', '#0f766e', '#be123c', '#4338ca'];
    let hash = 0;
    for (let i = 0; i < author.length; i++) {
        hash = author.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
}

export function renderSavedQuotesPageList() {
    D.savedQuotesCountBadge.textContent = State.getQuotes().length.toString();
    const term = D.savedQuotesSearchInput.value.toLowerCase();
    const quotes = State.getQuotes().filter(q => {
        const client = State.getClients().find(c => c.id === q.clientId);
        return q.manualId.toLowerCase().includes(term) || client?.name.toLowerCase().includes(term);
    });
    let html = `<table class="management-table saved-quotes-table"><thead><tr><th>Detalles</th><th>Cliente</th><th>Fecha</th><th>Total</th><th class="actions">Acciones</th></tr></thead><tbody>`;
    if (quotes.length === 0) {
        html += `<tr><td colspan="5" style="text-align:center;padding:20px;">No se encontraron cotizaciones.</td></tr>`;
    } else {
        html += quotes.sort((a, b) => parseInt(b.manualId) - parseInt(a.manualId)).map(q => {
            const client = State.getClients().find(c => c.id === q.clientId)?.name || 'N/A';
            const [year, month, day] = q.date.split('-');
            const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            const date = dateObj.toLocaleDateString('es-CO');
            const createdTime = formatCreatedTime(q.created_at || q.date);
            const total = q.items.reduce((s, i) => s + i.quantity * i.price, 0) * (1 + q.taxRate / 100);
            const author = State.getQuoteAuthor(q.id);
            const authorColor = getAuthorColor(author);
            return `<tr data-id="${q.id}" title="Haz clic para abrir esta cotización"><td style="cursor:pointer;"><strong>${client}</strong><br><small>#${q.manualId} &bull; ${date}</small><br><small class="quote-author">Por: <span style="color: ${authorColor}; font-weight: 600;">${author}</span> &bull; ${createdTime}</small></td><td>${client}</td><td>${date}</td><td>${formatCurrency(total)}</td><td class="actions" style="white-space: nowrap;"><button class="btn btn-secondary edit-quote-btn" data-id="${q.id}" title="Editar Cotización"><i class="fas fa-edit"></i> Editar cotización</button> <button class="btn btn-primary create-order-btn" data-id="${q.id}" title="Crear Orden"><i class="fas fa-clipboard-check"></i> Crear orden</button> <button class="btn btn-duplicate copy-quote-btn" data-id="${q.id}" title="Duplicar"><i class="fas fa-copy"></i> Duplicar</button> <button class="btn btn-icon-only btn-info generate-pdf-list-btn" data-id="${q.id}" title="Generar PDF"><i class="fas fa-file-pdf"></i></button> <button class="btn btn-icon-only generate-bill-list-btn" data-id="${q.id}" title="Generar Cuenta de Cobro" style="background-color: white; color: #28a745; border: 1px solid #28a745;"><i class="fas fa-file-invoice-dollar"></i></button> <button class="btn btn-icon-only btn-danger delete-btn" data-id="${q.id}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`;
        }).join('');
    }
    D.savedQuotesPageContainer.innerHTML = html + `</tbody></table>`;
}

// --- Inter-DOM Drag & Drop Variables ---
let draggedRow: HTMLTableRowElement | null = null;
let reorderingContext: 'quote' | 'order' | 'order-service' | null = null;

function setupDragAndDropEvents(tr: HTMLTableRowElement, context: 'quote' | 'order' | 'order-service') {
    tr.addEventListener('dragstart', (e) => {
        // Ignorar el arrastre si se seleccionó un área de texto o input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
            e.preventDefault();
            return;
        }
        draggedRow = tr;
        reorderingContext = context;
        setTimeout(() => tr.classList.add('is-dragging'), 0);
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', tr.dataset.itemId || '');
        }
    });

    tr.addEventListener('dragend', () => {
        draggedRow = null;
        reorderingContext = null;
        tr.classList.remove('is-dragging');
        tr.draggable = false; // Disable dragging after drop

        // Al terminar de arrastrar debemos sincronizar el nuevo orden contra el State
        syncItemsOrderFromDOM(context === 'order-service' ? 'order' : context);
    });

    tr.addEventListener('dragover', (e) => {
        e.preventDefault(); // Permitir drop
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }

        const tbody = tr.parentElement;
        if (!tbody || !draggedRow || draggedRow === tr || reorderingContext !== context) return;

        const bounding = tr.getBoundingClientRect();
        const offset = e.clientY - bounding.top;
        if (offset > bounding.height / 2) {
            tr.after(draggedRow);
        } else {
            tr.before(draggedRow);
        }
    });
}

function syncItemsOrderFromDOM(context: 'quote' | 'order') {
    if (context === 'quote') {
        const activeQuote = State.getActiveQuote();
        if (!activeQuote) return;

        const newOrder = Array.from(document.querySelectorAll('#items-tbody .draggable-row')).map(row => (row as HTMLElement).dataset.itemId);
        // Reordenar items locales a nivel State basándose en el DOM
        activeQuote.items.sort((a, b) => {
            const indexA = newOrder.indexOf(a.id);
            const indexB = newOrder.indexOf(b.id);
            if (indexA === -1 || indexB === -1) return 0;
            return indexA - indexB;
        });
        updateQuoteSummary();
    } else {
        const activeOrder = State.getCurrentOrder();
        if (!activeOrder) return;

        const newOrder = Array.from(document.querySelectorAll('#order-items-tbody .draggable-row')).map(row => (row as HTMLElement).dataset.itemId);
        activeOrder.items.sort((a, b) => {
            const indexA = newOrder.indexOf(a.id);
            const indexB = newOrder.indexOf(b.id);
            if (indexA === -1 || indexB === -1) return 0;
            return indexA - indexB;
        });
        updateOrderSummary();
    }
}

// --- UI Helpers ---
function createItemRow(item: QuoteItem | OrderItem, context: 'quote' | 'order' | 'order-service' = 'quote'): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id;
    // Se habilita el attribute de arrastre solo cuando se interactúa con el ícono (ver abajo)
    // tr.draggable = true;
    tr.classList.add('item-row', 'draggable-row');
    setupDragAndDropEvents(tr, context);

    const formattedPrice = formatCurrency(item.price);
    const formattedTotal = formatCurrency(item.quantity * item.price);

    let priceColumns = '';
    if (context === 'quote') {
        priceColumns = `<td class="col-price" data-label="Vlr. Unitario"><input type="text" class="item-price" value="${formattedPrice}"><div class="item-value-mobile-view" data-field="price"><span class="mobile-view-text">${formattedPrice}</span><i class="fas fa-pencil-alt edit-indicator"></i></div></td><td class="col-total item-total" data-label="Vlr. Total">${formattedTotal}</td>`;
    }

    let qtyColumn = '';
    if (context === 'quote') {
        qtyColumn = `<td class="col-qty" data-label="Cant."><input type="number" class="item-qty" value="${item.quantity}" min="0"><div class="item-value-mobile-view" data-field="quantity"><span class="mobile-view-text">${item.quantity}</span><i class="fas fa-pencil-alt edit-indicator"></i></div></td>`;
    } else {
        const completed = (item as any).completed_quantity || 0;
        const total = item.quantity || 0;
        let progressColor = "var(--color-text-secondary)";
        if (completed > 0 && completed < total) progressColor = "#e67e22";
        else if (completed >= total && total > 0) progressColor = "var(--color-primary)";
        let avanceHtml = '';
        if (context === 'order') {
            avanceHtml = `<div style="font-size: 0.75rem; color: ${progressColor}; margin-top: 4px; font-weight: 500;">Avance: ${completed} / ${total}</div>`;
        }
        qtyColumn = `<td class="col-qty" data-label="Cant.">
            <input type="number" class="item-qty" value="${total}" min="0">
            <div class="item-value-mobile-view" data-field="quantity"><span class="mobile-view-text">${total}</span><i class="fas fa-pencil-alt edit-indicator"></i></div>
            ${avanceHtml}
        </td>`;
    }

    tr.innerHTML = `<td class="col-desc" data-label="Descripción">
        <div class="drag-handle-wrapper"><i class="fas fa-bars drag-handle-icon"></i></div>
        <textarea class="item-desc" rows="1">${item.description}</textarea>
        <div class="item-desc-mobile-wrapper"><div class="item-desc-mobile-view"><span class="mobile-view-text">${item.description}</span><i class="fas fa-pencil-alt edit-indicator"></i></div><button class="btn btn-danger btn-icon-only delete-item-btn delete-item-btn-mobile" title="Eliminar ítem"><i class="fas fa-trash"></i></button></div>
    </td>
    ${qtyColumn}${priceColumns}<td class="col-actions" data-label="Acción"><button class="btn btn-danger btn-icon-only delete-item-btn delete-item-btn-desktop"><i class="fas fa-trash"></i></button></td>`;

    if (context === 'quote') {
        const priceInput = tr.querySelector('.item-price') as HTMLInputElement;
        priceInput.addEventListener('input', () => { priceInput.value = formatCurrency(parseFloat(priceInput.value.replace(/[^0-9]+/g, "")) || 0); });
    }

    const dragHandle = tr.querySelector('.drag-handle-wrapper') as HTMLElement;
    if (dragHandle) {
        const enableDrag = () => { tr.draggable = true; };
        const disableDrag = () => { tr.draggable = false; };
        dragHandle.addEventListener('mousedown', enableDrag);
        dragHandle.addEventListener('touchstart', enableDrag, { passive: true });
        dragHandle.addEventListener('mouseup', disableDrag);
        dragHandle.addEventListener('mouseleave', disableDrag);
        dragHandle.addEventListener('touchend', disableDrag);
    }
    
    // Auto-expand textarea for both quote and order contexts
    const descTextarea = tr.querySelector('.item-desc') as HTMLTextAreaElement;
    if (descTextarea) {
        descTextarea.style.overflow = 'hidden'; // Prevent scrollbar flash
        const resizeTextarea = () => {
            descTextarea.style.height = 'auto';
            descTextarea.style.height = descTextarea.scrollHeight + 'px';
        };
        descTextarea.addEventListener('input', resizeTextarea);
        // Ligero retraso para permitir inserción en el DOM antes de medir altura
        setTimeout(resizeTextarea, 0);
    }
    // Auto-focus back to search input when user hits Enter on quantity
    const qtyInput = tr.querySelector('.item-qty') as HTMLInputElement;
    if (qtyInput) {
        qtyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const searchInputId = context === 'quote' ? 'item-search' : 'order-item-search';
                const searchInput = document.getElementById(searchInputId) as HTMLInputElement;
                if (searchInput) {
                    searchInput.focus();
                }
            }
        });
    }

    return tr;
}

export function updateQuoteSummary() {
    const quote = State.getActiveQuote();
    if (!quote) return;
    const subtotal = quote.items.reduce((s, i) => s + (i.quantity * i.price), 0);
    const tax = subtotal * (quote.taxRate / 100);
    D.summarySubtotal.textContent = formatCurrency(subtotal);
    D.summaryTaxAmount.textContent = formatCurrency(tax);
    D.summaryTotal.textContent = formatCurrency(subtotal + tax);
}

export function updateItemRowTotal(row: HTMLTableRowElement) {
    const qtyInput = row.querySelector('.item-qty') as HTMLInputElement;
    const priceInput = row.querySelector('.item-price') as HTMLInputElement;
    const totalCell = row.querySelector('.item-total') as HTMLTableCellElement;
    if (!qtyInput || !priceInput || !totalCell) return;

    const qty = parseFloat(qtyInput.value) || 0;
    const price = parseFloat(priceInput.value.replace(/[^0-9]+/g, "")) || 0;
    totalCell.textContent = formatCurrency(qty * price);
}

export function showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') {
    const div = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : type === 'info' ? 'fa-info-circle' : 'fa-exclamation-triangle';
    div.className = `notification ${type}`;
    div.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    D.notificationArea.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// --- VAT Management ---
export async function loadVatRate() {
    const rate = await API.getSetting('vat_rate');
    const vat = rate ? parseFloat(rate) : 19;
    State.setInternalDefaultVatRate(vat);
    if (D.vatRateSettingInput) D.vatRateSettingInput.value = String(vat);
}
export function handleVatToggle() {
    const quote = State.getActiveQuote();
    if (!quote) return;
    const includesVat = D.vatToggleSwitch.checked;
    quote.taxRate = includesVat ? State.getDefaultVatRate() : 0;
    quote.terms = includesVat ? State.getQuoteTermsWithVat() : State.getQuoteTermsNoVat();
    D.quoteTermsTextarea.value = quote.terms;
    D.quoteInternalNotesTextarea.value = quote.internal_notes || '';
    updateQuoteSummary();
}

// --- Settings Actions ---
export async function handleBackup() {
    try {
        const backup = { clients: State.getClients(), items: State.getItems(), quotes: State.getQuotes(), orders: State.getOrders(), maintenance_users: State.getTechnicians() };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `macris_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        showNotification('Copia de seguridad descargada.');
    } catch (e: any) {
        showNotification('Error al crear la copia de seguridad.', 'error');
    }
}
export async function handleRestore(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    showConfirmationModal('Confirmar Restauración', 'Restaurar desde un archivo borrará TODOS los datos actuales. ¿Desea continuar?', async () => {
        showNotification('Restaurando... Por favor espere.', 'info');
        try {
            const backup = JSON.parse(await file.text());
            await API.restoreDataFromBackup(backup);
            showNotification('Restauración completada. La aplicación se recargará.', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } catch (err: any) {
            showNotification(`Error: ${err.message}`, 'error');
        }
    });
    (e.target as HTMLInputElement).value = '';
}
export function handleResetApplication() {
    showConfirmationModal('¡ADVERTENCIA!', 'Está a punto de borrar TODOS los datos. ¿Desea continuar?', async () => {
        try {
            await API.clearAllData();
            showNotification('Aplicación reiniciada. Recargando...', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } catch (e: any) {
            showNotification("Error al reiniciar la aplicación.", "error");
        }
    });
}

// --- Modal Logic ---
export function openDescriptionEditModal(itemId: string, context: 'quote' | 'order') {
    currentEditingItemId = itemId;
    currentEditingContext = context;
    const item = (context === 'quote' ? State.getActiveQuote()?.items : State.getCurrentOrder()?.items)?.find(i => i.id === itemId);
    if (item) {
        D.descriptionEditTextarea.value = item.description;
        D.descriptionEditModal.classList.add('active');
    }
}
export function handleDescriptionFormSubmit(e: Event) {
    e.preventDefault();
    if (!currentEditingItemId || !currentEditingContext) return;
    const items = currentEditingContext === 'quote' ? State.getActiveQuote()?.items : State.getCurrentOrder()?.items;
    const item = items?.find(i => i.id === currentEditingItemId);
    if (item) {
        item.description = D.descriptionEditTextarea.value;
        if (currentEditingContext === 'quote') renderQuote(State.getActiveQuote());
        else renderOrderWorkspace(State.getCurrentOrder());
    }
    closeAllModals();
}
export function openValueEditModal(itemId: string, field: 'quantity' | 'price', context: 'quote' | 'order') {
    currentEditingItemId = itemId;
    currentEditingContext = context;
    const item = (context === 'quote' ? State.getActiveQuote()?.items : State.getCurrentOrder()?.items)?.find(i => i.id === itemId);
    if (item) {
        D.valueEditForm.dataset.field = field;
        D.valueModalTitle.textContent = field === 'quantity' ? 'Editar Cantidad' : 'Editar Precio Unitario';
        D.valueModalLabel.textContent = field === 'quantity' ? 'Cantidad' : 'Precio Unitario';
        D.valueEditInput.type = 'number';
        D.valueEditInput.value = String(item[field]);
        D.valueEditModal.classList.add('active');
    }
}
export function handleValueEditFormSubmit(e: Event) {
    e.preventDefault();
    if (!currentEditingItemId || !currentEditingContext) return;
    const items = currentEditingContext === 'quote' ? State.getActiveQuote()?.items : State.getCurrentOrder()?.items;
    const item = items?.find(i => i.id === currentEditingItemId);
    if (item) {
        const field = D.valueEditForm.dataset.field as 'quantity' | 'price';
        item[field] = parseFloat(D.valueEditInput.value) || 0;
        if (currentEditingContext === 'quote') {
            renderQuote(State.getActiveQuote());
        } else {
            renderOrderWorkspace(State.getCurrentOrder());
        }
    }
    closeAllModals();
}

export async function openEntityModal(type: 'client' | 'item' | 'technician' | 'sede' | 'dependency', id: string | null = null, parentId: string | null = null, sedeId: string | null = null) {
    D.modalForm.dataset.type = type;
    D.modalForm.dataset.id = id || '';
    let fieldsHtml = '', title = '';

    if (type === 'client') {
        const client = id ? State.getClients().find(c => c.id === id) : null;
        title = client ? 'Editar Cliente' : 'Nuevo Cliente';
        const manualId = client ? client.manualId : await getNextClientManualIdForUI();
        fieldsHtml = `<div class="form-group"><label>Categoría</label><select name="category" required class="form-control" ><option value="residencial" ${client && client.category === 'residencial' ? 'selected' : ''}>Residencial</option><option value="empresa" ${client && client.category === 'empresa' ? 'selected' : ''}>Empresa</option></select></div>
        
        <div class="form-group"><label>ID</label><input name="manualId" value="${manualId}" readonly></div><div class="form-group"><label>Nombre</label><input name="name" value="${client?.name || ''}" required></div><div class="form-group"><label>Encargado</label><input name="contactPerson" value="${client?.contactPerson || ''}"></div><div class="form-group"><label>Dirección</label><input name="address" value="${client?.address || ''}"></div><div class="form-group"><label>Ciudad</label><input name="city" value="${client?.city || ''}"></div><div class="form-group"><label>Teléfono</label><input name="phone" value="${client?.phone || ''}"></div><div class="form-group"><label>Email</label><input name="email" type="email" value="${client?.email || ''}"></div>`;
    } else if (type === 'item') {
        const item = id ? State.getItems().find(i => i.id === id) : null;
        title = item ? 'Editar Insumo' : 'Nuevo Insumo';
        const manualId = item ? item.manualId : await getNextItemManualIdForUI();
        fieldsHtml = `<div class="form-group"><label>Código</label><input name="manualId" value="${manualId}" readonly></div><div class="form-group"><label>Nombre</label><input name="name" value="${item?.name || ''}" required></div><div class="form-group"><label>Precio</label><input name="price" type="number" step="any" value="${item?.price || 0}" required></div>`;
    } else if (type === 'sede') {
        const sede = id ? State.getSedes().find(s => s.id === id) : null;
        title = sede ? 'Editar Sede' : 'Nueva Sede';
        let companySelectHtml;
        const targetCompanyId = sede ? sede.client_id : parentId;
        if (targetCompanyId) {
            companySelectHtml = `<input type="hidden" name="companyId" value="${targetCompanyId}">`;
        } else {
            const empresas = State.getClients().filter(c => c.category === 'empresa');
            const options = empresas.map(c => `<option value="${c.id}">${c.name} (ID: ${c.manualId})</option>`).join('');
            companySelectHtml = `<div class="form-group"><label>Empresa a la que pertenece</label><select name="companyId" required class="form-control">${options}</select></div>`;
        }
        const cities = await fetchCities();
        const citySelectOptions = '<option value="">Seleccione una ciudad...</option>' + 
            cities.map(c => `<option value="${c.id}" ${sede && sede.city_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('');

        fieldsHtml = `${companySelectHtml}
        <div class="form-group"><label>Nombre de Sede</label><input name="name" value="${sede?.name || ''}" required placeholder="Ej. Principal, Sucursal Norte..."></div>
        <div class="form-group"><label>Encargado</label><input name="contactPerson" value="${sede?.contact_person || ''}"></div>
        <div class="form-group"><label>Dirección</label><input name="address" value="${sede?.address || ''}"></div>
        <div class="form-group"><label>Ciudad</label><select name="city" required class="form-control">${citySelectOptions}</select></div>
        <div class="form-group"><label>Teléfono</label><input name="phone" value="${sede?.phone || ''}"></div>
        ${sede ? `<div class="modal-danger-zone"><button type="button" class="btn btn-danger delete-sede-modal-btn" data-id="${escapeHtml(sede.id)}"><i class="fas fa-trash"></i> Eliminar sede</button></div>` : ''}`;
    } else if (type === 'dependency') {
        const dependency = id ? State.getDependencies().find(d => d.id === id) : null;
        const targetSedeId = dependency?.sede_id || sedeId || null;
        const targetSede = targetSedeId ? State.getSedes().find(s => s.id === targetSedeId) : null;
        const targetCompanyId = dependency?.client_id || parentId || targetSede?.client_id || null;
        const targetCompany = targetCompanyId ? State.getClients().find(c => c.id === targetCompanyId) : null;

        title = dependency ? 'Editar Dependencia' : 'Nueva Dependencia';
        fieldsHtml = `
        <input type="hidden" name="companyId" value="${escapeHtml(targetCompanyId || '')}">
        <input type="hidden" name="sedeId" value="${escapeHtml(targetSedeId || '')}">
        <div class="form-group"><label>Empresa</label><input value="${escapeHtml(targetCompany?.name || 'Empresa no encontrada')}" readonly></div>
        <div class="form-group"><label>Sede</label><input value="${escapeHtml(targetSede?.name || 'Sede no encontrada')}" readonly></div>
        <div class="form-group"><label>Nombre de Dependencia</label><input name="name" value="${escapeHtml(dependency?.name || '')}" required placeholder="Ej. Urgencias, Farmacia, Sala 1..."></div>`;
    } else { // technician
        const tech = id ? State.getTechnicians().find(t => t.id === id) : null;
        title = tech ? 'Editar Técnico' : 'Nuevo Técnico';
        fieldsHtml = `<div class="form-group"><label>Nombre</label><input name="name" value="${tech?.name || ''}" required></div><div class="form-group"><label>Cédula</label><input type="text" name="cedula" value="${tech?.cedula || ''}" required></div><div class="form-group"><label class="switch-label" style="display:inline-block; margin-right: 10px;">Activo</label><label class="switch"><input type="checkbox" name="is_active" ${tech?.is_active ?? true ? 'checked' : ''}><span class="slider round"></span></label></div>`;
    }
    D.modalTitle.textContent = title;
    D.modalFieldsContainer.innerHTML = fieldsHtml;
    
    // Add color logic for category select
    if (type === 'client') {
        setTimeout(() => {
            const selectCat = document.querySelector('select[name="category"]') as HTMLSelectElement;
            if (selectCat) {
                const updateColor = () => {
                    if (selectCat.value === 'empresa') {
                        selectCat.style.backgroundColor = '#e0f2fe';
                        selectCat.style.color = '#0369a1';
                    } else {
                        selectCat.style.backgroundColor = '#dcfce7';
                        selectCat.style.color = '#15803d';
                    }
                    selectCat.style.fontWeight = 'bold';
                };
                selectCat.addEventListener('change', updateColor);
                updateColor();
            }
        }, 50);
    }

    D.entityModal.classList.add('active');
}

export async function handleModalFormSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const type = form.dataset.type as 'client' | 'item' | 'technician' | 'sede' | 'dependency';
    const id = form.dataset.id;
    const data = new FormData(form);

    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

    try {
        if (type === 'client') {
            const clientData: ClientInsert = { id: id || generateId(), category: data.get('category') as 'empresa' | 'residencial', manualId: data.get('manualId') as string, name: data.get('name') as string, contactPerson: data.get('contactPerson') as string || null, address: data.get('address') as string || null, city: data.get('city') as string || null, phone: data.get('phone') as string || null, email: data.get('email') as string || null };
            const saved = await API.upsertClient(clientData); State.setClients([...State.getClients().filter(c => c.id !== saved.id), saved]);

            renderClientsList();

            if (!id) { // This was a "create new" action, so link it
                if (D.orderWorkspacePage.classList.contains('active')) {
                    const order = State.getCurrentOrder();
                    if (order) {
                        order.clientId = saved.id;
                    }
                } else if (document.getElementById('page-quotes')?.classList.contains('active')) {
                    const quote = State.getActiveQuote();
                    if (quote) {
                        quote.clientId = saved.id;
                        State.updateActiveQuote(quote);
                    }
                }
            }

            // Always re-render the active workspace to show updated details
            if (D.orderWorkspacePage.classList.contains('active')) {
                renderOrderWorkspace(State.getCurrentOrder());
            }
            if (document.getElementById('page-quotes')?.classList.contains('active')) {
                renderQuote(State.getActiveQuote());
            }

        } else if (type === 'sede') {
            const companyId = data.get('companyId') as string;
            const saved = await API.upsertSedeFull(id || generateId(), data.get('name') as string, companyId, data.get('address') as string, data.get('city') as string || null, data.get('phone') as string, data.get('contactPerson') as string);
            State.setSedes([...State.getSedes().filter(s => s.id !== saved.id), saved]);
            expandedClientSedeIds.add(companyId);
            renderClientsList();
            if (D.orderWorkspacePage.classList.contains('active')) {
                renderOrderWorkspace(State.getCurrentOrder());
            } else if (document.getElementById('page-quotes')?.classList.contains('active')) {
                renderQuote(State.getActiveQuote());
            }
        } else if (type === 'dependency') {
            const companyId = data.get('companyId') as string;
            const sedeId = data.get('sedeId') as string || null;
            if (!companyId || !sedeId) throw new Error('La dependencia debe estar asociada a una empresa y una sede.');
            const saved = await API.upsertDependencyFull(id || generateId(), data.get('name') as string, companyId, sedeId);
            State.setDependencies([...State.getDependencies().filter(d => d.id !== saved.id), saved]);
            expandedClientSedeIds.add(companyId);
            expandedSedeDependencyIds.add(sedeId);
            renderClientsList();
        } else if (type === 'item') {
            const itemData: ItemInsert = { id: id || generateId(), manualId: data.get('manualId') as string, name: data.get('name') as string, price: parseFloat(data.get('price') as string) };
            const saved = await API.upsertItem(itemData); State.setItems([...State.getItems().filter(i => i.id !== saved.id), saved]);
            renderCatalogItemsList();
            if (D.orderWorkspacePage.classList.contains('active')) {
                renderOrderWorkspace(State.getCurrentOrder());
            } else if (document.getElementById('page-quotes')?.classList.contains('active')) {
                renderQuote(State.getActiveQuote());
            }
        } else if (type === 'technician') {
            const cedulaValue = data.get('cedula') as string;
            const techData: TechnicianInsert = {
                id: id || generateId(),
                name: data.get('name') as string,
                is_active: (form.querySelector('input[name="is_active"]') as HTMLInputElement).checked,
                cedula: cedulaValue || null,
                password: cedulaValue || null,
                username: cedulaValue || null,
            };

            if (!id) { // Only for new technicians, set the default role.
                techData.role = 'worker';
            }

            const saved = await API.upsertTechnician(techData);
            State.setTechnicians([...State.getTechnicians().filter(t => t.id !== saved.id), saved]);
            renderTechniciansList();
        }
        showNotification(`${type} ${id ? 'actualizado' : 'creado'}.`, 'success');
        closeAllModals();
    } catch (err: any) {
        showNotification(`Error: ${err.message}`, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

export function handleEditClientClick() {
    const id = State.getActiveQuote()?.clientId;
    if (id) openEntityModal('client', id);
    else showNotification("Seleccione un cliente para editar.", "error");
}

export function handleEditClientClickOrder() {
    const order = State.getCurrentOrder();
    if (order && order.clientId) {
        openEntityModal('client', order.clientId);
    } else {
        showNotification("Seleccione un cliente para editar.", "error");
    }
}

export function closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
    State.setCurrentPdfDocForDownload(null);
    State.setCurrentPdfFileName(null);
    closeConfirmationModal();
}

export function showConfirmationModal(title: string, text: string, onConfirm: () => void, onCancel?: () => void) {
    D.confirmationModalTitle.textContent = title;
    D.confirmationModalText.textContent = text;
    onConfirmCallback = onConfirm;
    onCancelCallback = onCancel || null;
    D.confirmationModal.classList.add('active');
}
export function closeConfirmationModal() {
    D.confirmationModal.classList.remove('active');
    if (onCancelCallback) {
        onCancelCallback();
    }
    onConfirmCallback = null;
    onCancelCallback = null;
}
export function handleConfirmAction() {
    if (onConfirmCallback) {
        onConfirmCallback();
    }
    D.confirmationModal.classList.remove('active');
    onConfirmCallback = null;
    onCancelCallback = null;
}

// --- Mass Delete Handlers (Disabled for safety) ---
export function handleDeleteAllClients() { showNotification('Función deshabilitada por seguridad.', 'error'); }
export function handleDeleteAllItems() { showNotification('Función deshabilitada por seguridad.', 'error'); }
export function handleDeleteAllSavedQuotes() { showNotification('Función deshabilitada por seguridad.', 'error'); }

// --- Single Delete Handlers ---
export async function handleToggleClientCategory(id: string) {
    const client = State.getClients().find(c => c.id === id);
    if (!client) return;
    try {
        const newCategory = client.category === 'empresa' ? 'residencial' : 'empresa';
        const btn = document.querySelector(`.toggle-category-btn[data-id="${id}"]`) as HTMLButtonElement;
        if (btn) btn.disabled = true;
        
        await API.upsertClient({ ...client, category: newCategory });
        client.category = newCategory;
        
        const clients = State.getClients();
        const index = clients.findIndex(c => c.id === id);
        if (index !== -1) {
            clients[index] = client;
            State.setClients(clients);
        }
        
        renderClientsList();
        showNotification(`Categoría cambiada a ${newCategory === 'empresa' ? 'Empresa' : 'Residencial'}.`, 'success');
    } catch (e: any) {
        showNotification('Error al cambiar la categoría.', 'error');
        const btn = document.querySelector(`.toggle-category-btn[data-id="${id}"]`) as HTMLButtonElement;
        if (btn) btn.disabled = false;
    }
}

export function handleDeleteClient(id: string) {
    showConfirmationModal('Eliminar Cliente', '¿Desea eliminar este cliente?', async () => {
        try {
            await API.deleteClient(id);
            State.setClients(State.getClients().filter(c => c.id !== id));
            renderClientsList();
            showNotification('Cliente eliminado.', 'success');
        } catch (e: any) { showNotification('Error al eliminar el cliente.', 'error'); }
    });
}
export function handleDeleteItem(id: string) {
    showConfirmationModal('Eliminar Insumo', '¿Desea eliminar este insumo?', async () => {
        try {
            await API.deleteItem(id);
            State.setItems(State.getItems().filter(i => i.id !== id));
            renderCatalogItemsList();
            showNotification('Insumo eliminado.', 'success');
        } catch (e: any) { showNotification('Error al eliminar el insumo.', 'error'); }
    });
}

export function handleDeleteDependency(id: string) {
    const dependency = State.getDependencies().find(d => d.id === id);
    showConfirmationModal('Eliminar Dependencia', `¿Desea eliminar la dependencia "${dependency?.name || 'seleccionada'}"?`, async () => {
        try {
            await API.deleteDependency(id);
            State.setDependencies(State.getDependencies().filter(d => d.id !== id));
            renderClientsList();
            showNotification('Dependencia eliminada.', 'success');
        } catch (e: any) {
            showNotification('Error al eliminar la dependencia.', 'error');
        }
    });
}

export function handleDeleteSede(id: string) {
    const sede = State.getSedes().find(s => s.id === id);
    showConfirmationModal('Eliminar Sede', `¿Desea eliminar la sede "${sede?.name || 'seleccionada'}"?`, async () => {
        try {
            await API.deleteSede(id);
            State.setSedes(State.getSedes().filter(s => s.id !== id));
            State.setDependencies(State.getDependencies().filter(d => d.sede_id !== id && d.company_id !== id));
            expandedSedeDependencyIds.delete(id);
            if (sede?.client_id) {
                expandedClientSedeIds.add(sede.client_id);
            }
            renderClientsList();
            if (D.orderWorkspacePage.classList.contains('active')) {
                const order = State.getCurrentOrder();
                if (order?.sede_id === id) order.sede_id = null;
                renderOrderWorkspace(order);
            } else if (document.getElementById('page-quotes')?.classList.contains('active')) {
                const quote = State.getActiveQuote();
                if (quote?.sede_id === id) {
                    quote.sede_id = null;
                    State.updateActiveQuote(quote);
                }
                renderQuote(State.getActiveQuote());
            }
            showNotification('Sede eliminada.', 'success');
        } catch (e: any) {
            showNotification('Error al eliminar la sede.', 'error');
        }
    });
}

// --- Loader & Connection Status ---
export function hideLoader() {
    const loader = document.getElementById('loader-overlay');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => loader.style.display = 'none', 500);
    }
}
export function updateConnectionStatus(isOnline: boolean) {
    const statusEl = document.getElementById('connection-status');
    const textEl = statusEl?.querySelector('.status-text');
    if (!statusEl || !textEl) return;

    desktopSyncState.isOnline = isOnline;
    renderDesktopConnectionState();

    // Disable/Enable buttons based on online status
    const buttons = document.querySelectorAll<HTMLButtonElement>('#save-quote-btn, #save-order-btn, #delete-current-quote-btn, #generate-pdf-btn, #generate-order-pdf-btn, #backup-btn, #reset-app-btn, .edit-btn, .delete-btn');
    if (!isDesktopRuntime()) {
        buttons.forEach(btn => { if (btn) btn.disabled = !isOnline; });
    }
}

function renderDesktopConnectionState() {
    const statusEl = document.getElementById('connection-status');
    const textEl = statusEl?.querySelector('.status-text');
    if (!statusEl || !textEl || !D.syncStatusDetail) return;

    statusEl.classList.remove('offline', 'syncing');

    if (desktopSyncState.syncing) {
        statusEl.classList.add('syncing');
        textEl.textContent = 'Sincronizando';
    } else if (desktopSyncState.isOnline) {
        textEl.textContent = 'En línea';
    } else {
        statusEl.classList.add('offline');
        textEl.textContent = 'Sin conexión';
    }

    if (!isDesktopRuntime()) {
        D.syncStatusDetail.textContent = '';
        return;
    }

    if (desktopSyncState.syncing) {
        D.syncStatusDetail.textContent = desktopSyncState.pendingCount > 0
            ? `Sincronizando ${desktopSyncState.pendingCount} cambio(s)...`
            : 'Sincronizando cambios locales...';
        return;
    }

    if (!desktopSyncState.isOnline && desktopSyncState.pendingCount > 0) {
        D.syncStatusDetail.textContent = `${desktopSyncState.pendingCount} cambio(s) pendientes`;
        return;
    }

    if (desktopSyncState.isOnline && desktopSyncState.pendingCount > 0) {
        D.syncStatusDetail.textContent = `${desktopSyncState.pendingCount} cambio(s) por enviar`;
        return;
    }

    if (desktopSyncState.lastSyncedAt) {
        const syncLabel = new Date(desktopSyncState.lastSyncedAt).toLocaleString('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        D.syncStatusDetail.textContent = `Últ. sync ${syncLabel}`;
        return;
    }

    D.syncStatusDetail.textContent = 'Sin cambios pendientes';
}

export function updateDesktopSyncIndicator(partial: {
    syncing?: boolean;
    pendingCount?: number;
    lastSyncedAt?: string | null;
}) {
    if (typeof partial.syncing === 'boolean') desktopSyncState.syncing = partial.syncing;
    if (typeof partial.pendingCount === 'number') desktopSyncState.pendingCount = partial.pendingCount;
    if (partial.lastSyncedAt !== undefined) desktopSyncState.lastSyncedAt = partial.lastSyncedAt;
    renderDesktopConnectionState();
}

// --- Orders ---
export function renderOrdersList() {
    const allOrders = State.getOrders();
    const term = D.orderListSearchInput.value.toLowerCase();

    const pendingStatuses: Order['status'][] = ['pending', 'scheduled', 'in_progress'];
    const completedStatuses: Order['status'][] = ['completed', 'cancelled'];

    const pendingOrders = allOrders.filter(o => pendingStatuses.includes(o.status));
    const completedOrders = allOrders.filter(o => completedStatuses.includes(o.status));

    // Update tab UI with counts
    const ordersPage = document.getElementById('page-orders');
    if (ordersPage) {
        const pendingTab = ordersPage.querySelector('.tab-link[data-tab="pending"]');
        if (pendingTab) pendingTab.innerHTML = `Pendientes <span class="tab-count-badge">${pendingOrders.length}</span>`;

        const completedTab = ordersPage.querySelector('.tab-link[data-tab="completed"]');
        if (completedTab) completedTab.innerHTML = `Completadas <span class="tab-count-badge">${completedOrders.length}</span>`;
    }

    const activeTab = State.getActiveOrderTab();
    const ordersToDisplay = activeTab === 'pending' ? pendingOrders : completedOrders;

    D.orderCountBadge.textContent = ordersToDisplay.length.toString();

    const filteredOrders = ordersToDisplay.filter(order => {
        const client = State.getClients().find(c => c.id === order.clientId);
        const location = getOrderDisplayLocation(order, client);
        return order.manualId.toLowerCase().includes(term) || location.fullName.toLowerCase().includes(term);
    });

    const statusText = { pending: 'Pendiente', scheduled: 'Programada', in_progress: 'En Progreso', completed: 'Completada', cancelled: 'Cancelada' };

    let html = `<table class="management-table orders-table"><thead><tr><th class="desktop-cell">ID</th><th class="desktop-cell">Cliente</th><th class="desktop-cell">Fecha de Servicio</th><th class="desktop-cell">Hora</th><th class="desktop-cell">Duración</th><th class="desktop-cell">Técnicos</th><th class="desktop-cell">Estado</th><th class="desktop-cell actions">Acciones</th><th class="order-card-cell"></th></tr></thead><tbody>`;
    if (filteredOrders.length === 0) {
        html += `<tr><td colspan="9" style="text-align:center;padding:20px;">No se encontraron órdenes.</td></tr>`;
    } else {
        html += filteredOrders.sort((a, b) => parseInt(b.manualId) - parseInt(a.manualId)).map(order => {
            const client = State.getClients().find(c => c.id === order.clientId);
            const location = getOrderDisplayLocation(order, client);
            const technicians = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));
            const serviceDate = new Date(order.service_date.replace(/-/g, '/')).toLocaleDateString('es-CO');
            const duration = order.estimated_duration ? `${order.estimated_duration.toFixed(1)}h` : '-';
            const author = State.getOrderAuthor(order.id);
            const createdAt = formatCreatedDateTime(order.created_at);

            return `
                <tr>
                    <td class="desktop-cell">${order.manualId}</td>
                    <td class="desktop-cell"><strong>${location.fullName}</strong><br><small class="order-author">Creada por: <span style="color: ${getAuthorColor(author)}; font-weight: 500;">${author}</span> &bull; ${createdAt}</small></td>
                    <td class="desktop-cell">${serviceDate}</td>
                    <td class="desktop-cell">${order.service_time || '-'}</td>
                    <td class="desktop-cell">${duration}</td>
                    <td class="desktop-cell">${technicians.map(t => t.name?.split(' ')[0]).join(', ')}</td>
                    <td class="desktop-cell"><span class="status-badge ${order.status}">${statusText[order.status]}</span></td>
                    <td class="desktop-cell actions">
                        <button class="btn btn-icon-only btn-secondary edit-btn" data-id="${order.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-icon-only btn-danger delete-btn" data-id="${order.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                    <td class="order-card-cell">
                        <div class="card-header">
                            <div class="card-title">
                                <span>#${order.manualId}</span>
                                <span class="status-badge ${order.status}">${statusText[order.status]}</span>
                            </div>
                            <div class="card-subtitle">${location.fullName}<br><small class="order-author">Creada por: <span style="color: ${getAuthorColor(author)}; font-weight: 500;">${author}</span> &bull; ${createdAt}</small></div>
                        </div>
                        <div class="card-body">
                            <div class="card-info-item"><i class="fas fa-calendar-alt"></i> ${serviceDate}</div>
                            <div class="card-info-item"><i class="fas fa-clock"></i> ${order.service_time || 'N/A'}</div>
                            <div class="card-info-item"><i class="fas fa-hourglass-half"></i> ${duration}</div>
                        </div>
                        <div class="card-footer">
                            <i class="fas fa-hard-hat"></i>
                            <span>${technicians.map(t => t.name).join(', ') || 'Sin técnicos'}</span>
                        </div>
                         <div class="actions" style="margin-top: 10px; justify-content: flex-end;">
                            <button class="btn btn-icon-only btn-secondary edit-btn" data-id="${order.id}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-icon-only btn-danger delete-btn" data-id="${order.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }
    D.ordersListContainer.innerHTML = html + `</tbody></table>`;
}

export function openOrderSourceModal() {
    D.orderSourceQuoteSearchInput.style.display = 'none';
    D.orderSourceQuoteSearchInput.value = '';
    D.orderSourceQuoteSearchResults.innerHTML = '';
    D.orderSourceModal.classList.add('active');
}

export function setupOrderSourceSearch() {
    const input = D.orderSourceQuoteSearchInput;
    const results = D.orderSourceQuoteSearchResults;
    input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        results.innerHTML = '';
        if (term.length < 1) return;
        const quotes = State.getQuotes().filter(q => {
            const client = State.getClients().find(c => c.id === q.clientId);
            return q.manualId.toLowerCase().includes(term) || client?.name.toLowerCase().includes(term);
        }).slice(0, 5);
        if (quotes.length > 0) {
            results.innerHTML = quotes.map(q => `<div class="search-result-item" data-id="${q.id}"><span class="item-code">[#${q.manualId}]</span> ${State.getClients().find(c => c.id === q.clientId)?.name}</div>`).join('');
        } else {
            results.innerHTML = `<div class="search-result-item-empty">No se encontraron cotizaciones.</div>`;
        }
    });
    results.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const resultDiv = target.closest('.search-result-item');
        if (!resultDiv) return;
        const quoteId = (resultDiv as HTMLElement).dataset.id;
        if (quoteId) {
            await navigateToOrderWorkspace(null, quoteId);
            closeAllModals();
        }
    });
}

export async function navigateToOrderWorkspace(orderId: string | null, fromQuoteId: string | null = null, defaultDate: string = '') {
    let order: Order | null;
    if (orderId) {
        order = State.getOrders().find(o => o.id === orderId) || null;
        if (order) order = JSON.parse(JSON.stringify(order)); // Deep copy
    } else {
        order = {
            id: generateId(),
            created_at: new Date().toISOString(),
            manualId: 'Borrador',
            quoteId: null,
            clientId: '',
            status: 'pending',
            service_date: defaultDate,
            service_time: null,
            order_type: '',
            notes: '',
            items: [],
            technicianIds: [NO_ASIGNADO_TECHNICIAN_ID],
            taxRate: State.getDefaultVatRate(),
            estimated_duration: 0,
            image_urls: [],
            sede_id: null,
        };

        if (fromQuoteId) {
            const quote = State.getQuotes().find(q => q.id === fromQuoteId);
            if (quote) {
                order.quoteId = quote.id;
                order.clientId = quote.clientId || '';
                order.sede_id = quote.sede_id || null;
                order.items = quote.items.map(qi => ({
                    id: generateId(),
                    orderId: order!.id,
                    itemId: qi.itemId,
                    manualId: qi.manualId,
                    description: qi.description,
                    quantity: qi.quantity,
                    completed_quantity: 0,
                    price: qi.price,
                    created_at: new Date().toISOString()
                }));
                order.order_type = inferOrderTypesFromItems(order.items, '');
                order.notes = quote.internal_notes || '';
                order.image_urls = quote.image_urls ? quote.image_urls.map(url => `QUOTE_IMG::${url}`) : [];
            }
        }
    }

    State.setCurrentOrder(order);
    renderOrderWorkspace(order);
    navigateTo('page-order-workspace');
    if (D.orderWorkspacePage) {
        D.orderWorkspacePage.scrollTop = 0;
    }
}

export function renderOrderWorkspace(order: Order | null) {
    if (!order) {
        // This is a defensive cleanup. If renderOrderWorkspace is ever called
        // with a null order, it ensures the UI is reset to a clean state.
        cleanupOrderWorkspace();
        return;
    }

    D.orderWorkspaceTitle.textContent = (order.manualId && order.manualId !== 'Borrador') ? `Editar Orden #${order.manualId}` : 'Nueva Orden de Servicio';

    const client = State.getClients().find(c => c.id === order.clientId);
    D.orderClientSearchInput.value = client ? `[${client.manualId}] ${client.name}` : '';
    renderClientDetails(order.clientId, 'order');
    D.orderEditClientBtn.style.display = order.clientId ? 'inline-flex' : 'none';
    const currentSede = order.sede_id ? State.getSedes().find(s => s.id === order.sede_id) : null;
    D.orderClientCityInput.value = currentSede?.cityName || client?.city || '';

    D.orderTimeInput.value = order.service_time || '';

    currentSelectedOrderTypes = order.order_type ? order.order_type.split(' • ').map(s => s.trim()).filter(s => s) : [];

    // Check for custom types
    const knownTypes = State.getServiceTypes().map(t => t.name);
    const customValues = currentSelectedOrderTypes.filter(t => !knownTypes.includes(t) && t !== 'Otro');

    if (customValues.length > 0 || currentSelectedOrderTypes.includes('Otro')) {
        currentSelectedOrderTypes = currentSelectedOrderTypes.filter(t => knownTypes.includes(t));
        if (!currentSelectedOrderTypes.includes('Otro')) currentSelectedOrderTypes.push('Otro');
        D.orderTypeCustomInput.value = customValues.join(' • ');
        D.orderTypeCustomInput.style.display = 'block';
    } else {
        D.orderTypeCustomInput.value = '';
        D.orderTypeCustomInput.style.display = 'none';
    }
    renderOrderTypePills();
    D.orderStatusSelect.value = order.status;
    D.orderNotesTextarea.value = order.notes || '';
    renderOrderAnnexPreviews(order);

    const hours = Math.floor(order.estimated_duration || 0);
    const minutes = Math.round(((order.estimated_duration || 0) - hours) * 60);
    D.orderDurationHoursInput.value = String(hours);
    D.orderDurationMinutesInput.value = String(minutes);

    if (D.orderDifficultySelect) D.orderDifficultySelect.value = "";
    if (D.orderDurationHint) {
        D.orderDurationHint.innerText = order.estimated_duration ? `Duración manual/previa: ${hours} hora${hours !== 1 ? 's' : ''}` : '';
    }

    renderTechnicianPills(order.technicianIds);
    D.orderServicesTableBody.innerHTML = '';
    D.orderMaterialsTableBody.innerHTML = '';

    const currentTypes = order.order_type ? order.order_type.split(' • ').map(s => s.trim()) : [];
    order.items.forEach(item => {
        if (isServiceItem(item.description) || currentTypes.includes(item.description)) {
            D.orderServicesTableBody.appendChild(createItemRow(item, 'order-service'));
        } else {
            D.orderMaterialsTableBody.appendChild(createItemRow(item, 'order'));
        }
    });

    // Update flatpickr last so that any synchronously triggered handleOrderDetailsChange
    // reads the fully initialized correct DOM values.
    if (order.service_date) {
        (D.orderDateInput as any)._flatpickr.setDate(order.service_date, false);
    } else {
        (D.orderDateInput as any)._flatpickr.clear();
    }
    updateOrderSummary();
}

export function inferOrderTypesFromItems(items: Array<{description: string}>, currentTypesStr: string): string {
    const predefinedTypes = State.getServiceTypes().map(t => t.name);
    let inferredTypes = new Set(currentTypesStr ? currentTypesStr.split(' • ').map(s => s.trim()).filter(s => s) : []);

    items.forEach(item => {
        const desc = (item.description || '').toLowerCase();
        
        if (desc.includes('instal') || desc.includes('montaje')) {
            const match = predefinedTypes.find(t => t.toLowerCase().includes('montaje') || t.toLowerCase().includes('instal'));
            if (match) inferredTypes.add(match);
            else inferredTypes.add('Montaje/Instalación');
        }
        else if (desc.includes('reparaci') || desc.includes('correctivo')) {
            const match = predefinedTypes.find(t => t.toLowerCase().includes('correctivo') || t.toLowerCase().includes('reparaci'));
            if (match) inferredTypes.add(match);
            else inferredTypes.add('Mantenimiento Correctivo');
        }
        else if (desc.includes('mantenimiento') || desc.includes('preventivo')) {
            const match = predefinedTypes.find(t => t.toLowerCase().includes('preventivo') || t.toLowerCase().includes('mantenimiento'));
            if (match) inferredTypes.add(match);
            else inferredTypes.add('Mantenimiento Preventivo');
        }
        else if (desc.includes('desmonte')) {
            const match = predefinedTypes.find(t => t.toLowerCase().includes('desmonte'));
            if (match) inferredTypes.add(match);
            else inferredTypes.add('Desmonte');
        }
        else if (desc.includes('revis') || desc.includes('diagn') || desc.includes('revisión') || desc.includes('diagnóstico')) {
            const match = predefinedTypes.find(t => t.toLowerCase().includes('revis') || t.toLowerCase().includes('diagn'));
            if (match) inferredTypes.add(match);
            else inferredTypes.add('Revisión/Diagnóstico');
        }
    });

    return Array.from(inferredTypes).join(' • ');
}

export function handleRemoveItemFromOrder(itemId: string) {
    const order = State.getCurrentOrder();
    if (!order) return;
    order.items = order.items.filter(i => i.id !== itemId);
    renderOrderWorkspace(order);
}

export function syncOrderServicesFromTypes(syncOtro: boolean = true) {
    const order = State.getCurrentOrder();
    if (!order) return;

    let finalOrderTypeArr = currentSelectedOrderTypes.filter(t => t !== 'Otro');
    if (syncOtro && currentSelectedOrderTypes.includes('Otro') && D.orderTypeCustomInput.value.trim()) {
        finalOrderTypeArr = finalOrderTypeArr.concat(D.orderTypeCustomInput.value.trim().split(' • ').map(s => s.trim()).filter(s => s));
    }

    const predefinedTypes = State.getServiceTypes().map(t => t.name);

    // Filter out items that are predefined types but no longer selected
    order.items = order.items.filter(item => {
        if (predefinedTypes.includes(item.description) && !finalOrderTypeArr.includes(item.description)) {
            return false; // Remove this service because it was unchecked
        }
        if (item.manualId === 'AUTO_SYNC' && !finalOrderTypeArr.includes(item.description)) {
            return false; // Auto-synced custom type no longer typed
        }
        return true;
    });

    finalOrderTypeArr.forEach(serviceName => {
        const existingItem = order.items.find(i => i.description === serviceName);
        if (existingItem) return; // Ya existe

        // When order was created from a quote, skip AUTO_SYNC if a quote-copied item
        // already semantically represents this service type (keyword match).
        if (order.quoteId) {
            const keywords = serviceName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const coveredByQuoteItem = order.items.some(i =>
                i.manualId !== 'AUTO_SYNC' &&
                isServiceItem(i.description) &&
                keywords.length > 0 &&
                keywords.some(kw => i.description.toLowerCase().includes(kw))
            );
            if (coveredByQuoteItem) return;
        }

        const isMontaje = serviceName === 'Montaje/instalación';

        let relatedPrice = 0;
        let qtyToUse = 1;

        if (isMontaje) {
            // Buscar cuántos equipos hay cotizados si es un montaje
            const quoteRows = D.quoteItemsTableBody.querySelectorAll('tr');
            let totalTeams = 0;
            quoteRows.forEach(row => {
                const desc = (row.querySelector('.item-desc') as HTMLTextAreaElement).value.toLowerCase();
                const qtyStr = (row.querySelector('.item-qty') as HTMLInputElement).value;
                const qtyPart = parseFloat(qtyStr);
                if (desc.includes('equipo') || desc.includes('aire') || desc.includes('minisplit')) {
                    if (!isNaN(qtyPart)) {
                        totalTeams += qtyPart;
                    }
                }
            });
            if (totalTeams > 0) {
                qtyToUse = totalTeams;
            }
        }

        const newItem: OrderItem = {
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            orderId: order.id || '',
            itemId: null,
            description: serviceName,
            quantity: qtyToUse,
            price: relatedPrice,
            completed_quantity: 0,
            manualId: 'AUTO_SYNC'
        };

        order.items.push(newItem);
    });

    // Redraw ONLY the services table
    D.orderServicesTableBody.innerHTML = '';
    D.orderMaterialsTableBody.innerHTML = '';
    order.items.forEach(item => {
        if (isServiceItem(item.description) || predefinedTypes.includes(item.description) || finalOrderTypeArr.includes(item.description)) {
            D.orderServicesTableBody.appendChild(createItemRow(item, 'order-service'));
        } else {
            D.orderMaterialsTableBody.appendChild(createItemRow(item, 'order'));
        }
    });
    updateOrderSummary();
}

export async function handleSaveOrder(): Promise<boolean> {
    const order = State.getCurrentOrder();
    if (!order || !order.clientId) {
        showNotification("Por favor, seleccione un cliente.", "error");
        return false;
    }

    const isNewOrder = !State.getOrders().some(o => o.id === order.id);

    if (!order.service_date || order.service_date.trim() === '') {
        showNotification("Por favor, seleccione la fecha del servicio.", "error");
        D.orderDateInput.focus();
        return false;
    }

    let finalOrderTypeArr = currentSelectedOrderTypes.filter(t => t !== 'Otro');
    if (currentSelectedOrderTypes.includes('Otro') && D.orderTypeCustomInput.value.trim()) {
        finalOrderTypeArr = finalOrderTypeArr.concat(D.orderTypeCustomInput.value.trim().split(' • ').map(s => s.trim()).filter(s => s));
    }
    order.order_type = finalOrderTypeArr.join(' • ') as any;

    if (!order.order_type) {
        showNotification("Por favor, seleccione un tipo de servicio.", "error");
        D.orderTypeSelect.focus();
        return false;
    }
    const cityFromInput = D.orderClientCityInput.value.trim();
    if (!cityFromInput) {
        showNotification("Por favor, ingrese la ciudad del servicio.", "error");
        D.orderClientCityInput.focus();
        return false;
    }
    if (!order.service_time || order.service_time.trim() === '') {
        showNotification("Por favor, seleccione la hora de inicio del servicio.", "error");
        D.orderTimeInput.focus();
        return false;
    }
    if (!order.technicianIds || order.technicianIds.length === 0) {
        showNotification("Por favor, asigne al menos un técnico a la orden.", "error");
        D.technicianSelector.focus();
        return false;
    }

    // Logic to update client's city if it's not set (only for residencial clients)
    const client = State.getClients().find(c => c.id === order.clientId);
    if (client && client.category === 'residencial' && !client.city && cityFromInput) {
        const updatedClientData = { ...client, city: cityFromInput };
        try {
            if (isDesktopRuntime() && !navigator.onLine) {
                State.setClients([...State.getClients().filter(c => c.id !== updatedClientData.id), updatedClientData]);
                showNotification(`Ciudad '${cityFromInput}' actualizada localmente para ${client.name}.`, 'info');
            } else {
                const savedClient = await API.upsertClient(updatedClientData);
                State.setClients([...State.getClients().filter(c => c.id !== savedClient.id), savedClient]);
                showNotification(`Ciudad '${cityFromInput}' guardada para el cliente ${client.name}.`, 'info');
            }
        } catch (e: any) {
            showNotification('No se pudo guardar la ciudad en la ficha del cliente.', 'warning');
        }
    }


    const performSave = async (): Promise<boolean> => {
        // Ensure empty time string becomes null
        if (order.service_time === '') {
            order.service_time = null;
        }

        const btn = D.saveOrderBtn;
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando...`;

        try {
            if (order.manualId === 'Borrador') {
                order.manualId = await getNextOrderManualId();
            }
            const savedOrder = await API.saveOrder(order);
            State.setOrders([...State.getOrders().filter(o => o.id !== savedOrder.id), savedOrder]);
            State.setCurrentOrder(savedOrder);
            if (isNewOrder) {
                const authorName = getSessionUser().name || 'Admin';
                void State.setOrderAuthor(savedOrder.id, authorName).catch(error => {
                    console.error('Failed to save order author metadata:', error);
                });
            }
            renderOrderWorkspace(savedOrder);
            renderAgendaPage(); // Update agenda after saving
            showNotification(`Orden #${savedOrder.manualId} guardada.`, 'success');
            closeAllModals();
            D.backToOrdersListBtn?.click();
            return true;
        } catch (e: any) {
            showNotification(`Error al guardar: ${e.message}`, "error");
            return false;
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    const isOnlyNoAsignado = order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID;

    if (isOnlyNoAsignado) {
        return new Promise(resolve => {
            showConfirmationModal(
                'Confirmar Guardado',
                'La orden no tiene un técnico real asignado. ¿Está seguro de que desea guardarla así?',
                async () => {
                    const result = await performSave();
                    resolve(result);
                },
                () => { // onCancel
                    resolve(false);
                }
            );
        });
    }

    return performSave();
}

export function handleDeleteOrder(id: string) {
    const order = State.getOrders().find(o => o.id === id);
    if (!order) return;
    showConfirmationModal('Eliminar Orden', `¿Desea eliminar la orden #${order.manualId}?`, async () => {
        try {
            await API.deleteOrder(id);
            State.setOrders(State.getOrders().filter(o => o.id !== id));
            renderOrdersList();
            renderAgendaPage();
            showNotification(`Orden #${order.manualId} eliminada.`, 'success');
        } catch (e: any) {
            showNotification('Error al eliminar la orden.', 'error');
        }
    });
}

export function updateOrderSummary() {
    // Order summary removed, keeping empty function to satisfy exports.
}

export function handleOrderVatToggle() {
    // VAT toggle removed from orders
}

export function handleOrderItemChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    const row = target.closest('tr');
    if (!row || !row.dataset.itemId) return;

    const orderItemId = row.dataset.itemId;
    const order = State.getCurrentOrder();
    if (!order) return;
    const orderItem = order.items.find(i => i.id === orderItemId);
    if (!orderItem) return;

    if (target.matches('.item-qty')) {
        orderItem.quantity = parseFloat(target.value) || 0;
    } else if (target.matches('.item-price')) {
        orderItem.price = parseFloat(target.value.replace(/[^0-9]+/g, "")) || 0;
    } else if (target.matches('.item-desc')) {
        orderItem.description = target.value;
        const newTypes = inferOrderTypesFromItems(order.items, order.order_type || '');
        if (newTypes !== order.order_type) {
            order.order_type = newTypes as any;
            currentSelectedOrderTypes.length = 0;
            if (newTypes) currentSelectedOrderTypes.push(...newTypes.split(' • ').map(s => s.trim()).filter(s => s));
            renderOrderTypePills();
            handleOrderDetailsChange();
        }
    }

    updateOrderSummary();
    updateItemRowTotal(row);
}

export function handleOrderDifficultyChange() {
    if (!D.orderDifficultySelect || !D.orderDurationHint) return;
    const difficulty = D.orderDifficultySelect.value;
    const isMontaje = currentSelectedOrderTypes.includes('Montaje/instalación');

    let hours = 0;
    if (difficulty === 'facil') {
        hours = isMontaje ? 4 : 1;
    } else if (difficulty === 'medio') {
        hours = isMontaje ? 6 : 2;
    } else if (difficulty === 'dificil') {
        hours = isMontaje ? 9 : 3;
    }

    if (difficulty) {
        D.orderDurationHoursInput.value = String(hours);
        D.orderDurationMinutesInput.value = '0';
        D.orderDurationHint.innerText = `Duración estimada asignada: ${hours} hora${hours !== 1 ? 's' : ''}`;
    } else {
        D.orderDurationHoursInput.value = '0';
        D.orderDurationMinutesInput.value = '0';
        D.orderDurationHint.innerText = '';
    }
}

export function handleOrderDetailsChange() {
    const order = State.getCurrentOrder();
    if (!order) return;

    let finalOrderTypeArr = currentSelectedOrderTypes.filter(t => t !== 'Otro');
    if (currentSelectedOrderTypes.includes('Otro') && D.orderTypeCustomInput.value.trim()) {
        finalOrderTypeArr = finalOrderTypeArr.concat(D.orderTypeCustomInput.value.trim().split(' • ').map(s => s.trim()).filter(s => s));
    }
    order.order_type = finalOrderTypeArr.join(' • ') as any;

    order.status = D.orderStatusSelect.value as Order['status'];
    order.notes = D.orderNotesTextarea.value;
    order.service_date = (D.orderDateInput as any)._flatpickr.input.value;
    order.service_time = D.orderTimeInput.value || null; // Ensure empty string becomes null
    const hours = parseFloat(D.orderDurationHoursInput.value) || 0;
    const minutes = parseFloat(D.orderDurationMinutesInput.value) || 0;
    order.estimated_duration = hours + (minutes / 60);
    validateTechnicianAssignments();
    if (D.technicianSelector.classList.contains('open')) renderTechnicianDropdown();

    // Auto-sync services as the user edits order details (like typing "Otro")
    syncOrderServicesFromTypes(true);
}

// --- Technicians ---
export function renderTechniciansList() {
    const allTechnicians = State.getTechnicians();
    const visibleTechnicians = allTechnicians.filter(t => t.role !== 'admin');

    D.technicianCountBadge.textContent = visibleTechnicians.length.toString();
    const term = D.technicianListSearchInput.value.toLowerCase();
    const filteredTechs = visibleTechnicians.filter(t => t.name?.toLowerCase().includes(term) || t.cedula?.toLowerCase().includes(term));

    let html = `<table class="management-table"><thead><tr><th>Nombre</th><th>Cédula</th><th>Activo</th><th class="actions">Acciones</th></tr></thead><tbody>`;
    if (filteredTechs.length > 0) {
        html += filteredTechs.map(t => `
            <tr>
                <td><strong>${t.name || 'N/A'}</strong><br><small>${t.cedula || 'Sin Cédula'}</small></td>
                <td>${t.cedula || 'N/A'}</td>
                <td>${t.is_active ? 'Sí' : 'No'}</td>
                <td class="actions">
                    <button class="btn btn-icon-only btn-secondary edit-btn" data-id="${t.id}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-icon-only btn-danger delete-btn" data-id="${t.id}" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    } else {
        html += `<tr><td colspan="4" style="text-align: center; padding: 20px;">No hay técnicos.</td></tr>`;
    }
    D.techniciansListContainer.innerHTML = html + `</tbody></table>`;
}

export function handleDeleteTechnician(id: string) {
    const tech = State.getTechnicians().find(t => t.id === id);
    if (!tech) return;
    showConfirmationModal('Eliminar Técnico', `¿Desea eliminar a ${tech.name}?`, async () => {
        try {
            await API.deleteTechnician(id);
            State.setTechnicians(State.getTechnicians().filter(t => t.id !== id));
            renderTechniciansList();
            showNotification('Técnico eliminado.', 'success');
        } catch (e: any) { showNotification('Error al eliminar el técnico.', 'error'); }
    });
}

export function setupCustomTechnicianSelector() {
    D.technicianSelector.addEventListener('click', () => {
        const isOpen = D.technicianSelector.classList.toggle('open');
        D.technicianDropdown.classList.toggle('open', isOpen);
        if (isOpen) {
            renderTechnicianDropdown();
        }
    });

    D.technicianDropdown.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest<HTMLElement>('.technician-dropdown-item');
        if (!item || !item.dataset.id) return;

        const techId = item.dataset.id;
        const order = State.getCurrentOrder();
        if (!order) return;

        const index = order.technicianIds.indexOf(techId);

        if (index > -1) { // Logic for unselecting a technician
            order.technicianIds.splice(index, 1);
        } else { // Logic for selecting a new technician
            if (techId === NO_ASIGNADO_TECHNICIAN_ID) {
                // If "No asignado" is selected, it becomes the only one.
                order.technicianIds = [NO_ASIGNADO_TECHNICIAN_ID];
            } else {
                // If a real technician is selected, first remove "No asignado" if it exists.
                order.technicianIds = order.technicianIds.filter(id => id !== NO_ASIGNADO_TECHNICIAN_ID);
                // Then, add the new real technician.
                order.technicianIds.push(techId);
            }
        }

        renderTechnicianPills(order.technicianIds);
        renderTechnicianDropdown(); // Re-render to update selected state
    });

    document.addEventListener('click', (e) => {
        if (!D.technicianSelector.contains(e.target as Node)) {
            D.technicianSelector.classList.remove('open');
            D.technicianDropdown.classList.remove('open');
        }
    });
}

// --- Custom Order Type Selector ---
export function setupCustomOrderTypeSelector() {
    D.orderTypeSelector.addEventListener('click', () => {
        const isOpen = D.orderTypeSelector.classList.toggle('open');
        D.orderTypeDropdown.classList.toggle('open', isOpen);
        if (isOpen) {
            renderOrderTypeDropdown();
        }
    });

    D.orderTypeDropdown.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest<HTMLElement>('.order-type-dropdown-item');
        if (!item || !item.dataset.type) return;

        const typeName = item.dataset.type;

        const index = currentSelectedOrderTypes.indexOf(typeName);

        if (index > -1) {
            currentSelectedOrderTypes.splice(index, 1);
        } else {
            currentSelectedOrderTypes.push(typeName);
        }

        if (currentSelectedOrderTypes.includes('Otro')) {
            D.orderTypeCustomInput.style.display = 'block';
        } else {
            D.orderTypeCustomInput.style.display = 'none';
        }

        renderOrderTypePills();
        renderOrderTypeDropdown();
        handleOrderDetailsChange(); // <-- Added synchronization
        syncOrderServicesFromTypes(false);
    });

    D.orderTypeCustomInput.addEventListener('input', () => {
        handleOrderDetailsChange(); // <-- Synchronize on custom input change
    });

    document.addEventListener('click', (e) => {
        if (!D.orderTypeSelector.contains(e.target as Node)) {
            D.orderTypeSelector.classList.remove('open');
            D.orderTypeDropdown.classList.remove('open');
        }
    });
}

export function renderOrderTypePills() {
    D.orderTypeSelectedPills.innerHTML = '';
    if (currentSelectedOrderTypes.length === 0) {
        D.orderTypeSelectedPills.appendChild(D.orderTypeSelectorPlaceholder);
        D.orderTypeSelectorPlaceholder.style.display = 'inline';
        return;
    }

    D.orderTypeSelectorPlaceholder.style.display = 'none';
    currentSelectedOrderTypes.forEach(typeName => {
        const pill = document.createElement('div');
        pill.className = 'pill';
        pill.innerHTML = `<span>${typeName}</span><button class="pill-remove-btn" data-type="${typeName}" title="Quitar">&times;</button>`;
        pill.querySelector('.pill-remove-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = currentSelectedOrderTypes.indexOf(typeName);
            if (index > -1) currentSelectedOrderTypes.splice(index, 1);

            if (currentSelectedOrderTypes.includes('Otro')) {
                D.orderTypeCustomInput.style.display = 'block';
            } else {
                D.orderTypeCustomInput.style.display = 'none';
            }

            renderOrderTypePills();
            renderOrderTypeDropdown();
            handleOrderDetailsChange();
            syncOrderServicesFromTypes(false);
        });
        D.orderTypeSelectedPills.appendChild(pill);
    });
}

function renderOrderTypeDropdown() {
    const serviceTypes = State.getServiceTypes().sort((a, b) => a.name.localeCompare(b.name));
    const allOptions = [...serviceTypes.map(t => t.name), 'Otro'];
    const options = [...new Set(allOptions)];

    D.orderTypeDropdown.innerHTML = options.map(opt => {
        const isSelected = currentSelectedOrderTypes.includes(opt);
        return `
            <div class="order-type-dropdown-item technician-dropdown-item ${isSelected ? 'selected' : ''}" data-type="${opt}">
                <div class="tech-info">
                    <span class="tech-name">${opt}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTechnicianPills(ids: string[]) {
    D.technicianSelectedPills.innerHTML = '';
    if (ids.length === 0) {
        D.technicianSelectedPills.appendChild(D.technicianSelectorPlaceholder);
        D.technicianSelectorPlaceholder.style.display = 'inline';
        return;
    }

    D.technicianSelectorPlaceholder.style.display = 'none';
    ids.forEach(id => {
        const tech = State.getTechnicians().find(t => t.id === id);
        if (tech) {
            const pill = document.createElement('div');
            pill.className = 'pill';
            const { conflict, message } = checkTechnicianConflict(id);
            if (conflict) pill.classList.add('conflict');
            pill.innerHTML = `<span>${tech.name}</span><button class="pill-remove-btn" data-id="${id}" title="Quitar">&times;</button>`;
            pill.querySelector('.pill-remove-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                const order = State.getCurrentOrder();
                if (order) {
                    order.technicianIds = order.technicianIds.filter(techId => techId !== id);
                    renderTechnicianPills(order.technicianIds);
                    renderTechnicianDropdown();
                }
            });
            D.technicianSelectedPills.appendChild(pill);
        }
    });
}

function renderTechnicianDropdown() {
    const order = State.getCurrentOrder();
    if (!order) return;

    const visibleTechnicians = State.getTechnicians().filter(t => t.is_active && t.role !== 'admin');

    D.technicianDropdown.innerHTML = visibleTechnicians.map(tech => {
        const isSelected = order.technicianIds.includes(tech.id);
        const { conflict, message } = checkTechnicianConflict(tech.id);

        return `
            <div class="technician-dropdown-item ${isSelected ? 'selected' : ''} ${conflict ? 'conflict' : ''}" data-id="${tech.id}">
                <span>${tech.name}</span>
                ${conflict ? `<span class="tech-conflict-label">${message}</span>` : ''}
            </div>
        `;
    }).join('');
}

function validateTechnicianAssignments() {
    const order = State.getCurrentOrder();
    if (order) renderTechnicianPills(order.technicianIds);
}

function checkTechnicianConflict(technicianId: string, orderToCheck?: Order): { conflict: boolean, message: string } {
    const currentOrder = orderToCheck || State.getCurrentOrder();
    if (!currentOrder || !currentOrder.service_date || !currentOrder.service_time || !currentOrder.estimated_duration) {
        return { conflict: false, message: '' };
    }

    const allOrders = State.getOrders();
    const currentStart = new Date(`${currentOrder.service_date}T${currentOrder.service_time}`);
    const currentEnd = new Date(currentStart.getTime() + (currentOrder.estimated_duration * 60 * 60 * 1000));

    for (const order of allOrders) {
        if (order.id === currentOrder.id || !order.technicianIds.includes(technicianId) || !order.service_date || !order.service_time || !order.estimated_duration) {
            continue;
        }

        const otherStart = new Date(`${order.service_date}T${order.service_time}`);
        const otherEnd = new Date(otherStart.getTime() + (order.estimated_duration * 60 * 60 * 1000));

        if (currentStart < otherEnd && currentEnd > otherStart) {
            return { conflict: true, message: `Ocupado #${order.manualId}` };
        }
    }

    return { conflict: false, message: '' };
}

// --- Agenda/Calendar ---

export const isServiceItem = (desc: string) => /mantenimiento|montaje|instalaci[oó]n|desmonte|mano de obra|servicio/i.test(desc);

type AgendaServiceSummary = {
    name: string;
    quantity: number;
};

function getServiceTypeColor(type: string | undefined): string {
    if (!type) return '';
    const lowerType = type.toLowerCase();
    let color = 'var(--color-text-secondary)';

    if (lowerType.includes('preventivo')) {
        color = '#007bff'; // blue
    } else if (lowerType.includes('montaje') || lowerType.includes('instalación') || lowerType.includes('instalacion')) {
        color = '#fd7e14'; // orange
    } else if (lowerType.includes('correctivo')) {
        color = '#dc3545'; // red
    } else if (lowerType.includes('desmonte')) {
        color = '#6f42c1'; // purple
    } else if (lowerType.includes('mano de obra')) {
        color = '#20c997'; // teal
    } else {
        color = 'var(--color-accent-primary)'; // default teal-ish
    }

    return color;
}

function getOrderTypeNames(order: Order): string[] {
    return order.order_type ? order.order_type.split(' • ').map((s: string) => s.trim()).filter(Boolean) : [];
}

function findMatchingAgendaServiceName(description: string, serviceNames: string[]): string | null {
    const normalizedDescription = normalizeDisplayName(description);
    const exactMatch = serviceNames.find(name => normalizeDisplayName(name) === normalizedDescription);
    if (exactMatch) return exactMatch;

    const containsMatch = serviceNames.find(name => {
        const normalizedName = normalizeDisplayName(name);
        return normalizedName && (normalizedDescription.includes(normalizedName) || normalizedName.includes(normalizedDescription));
    });
    if (containsMatch) return containsMatch;

    const keywordGroups = [
        ['preventivo'],
        ['correctivo', 'reparaci'],
        ['montaje', 'instalaci', 'instalacion'],
        ['desmonte'],
        ['mano de obra'],
        ['revis', 'diagn'],
    ];

    return serviceNames.find(name => {
        const normalizedName = normalizeDisplayName(name);
        return keywordGroups.some(group =>
            group.some(keyword => normalizedDescription.includes(keyword)) &&
            group.some(keyword => normalizedName.includes(keyword))
        );
    }) || null;
}

function getAgendaServiceSummaries(order: Order): AgendaServiceSummary[] {
    const serviceNames = getOrderTypeNames(order);
    const summaries = new Map<string, AgendaServiceSummary>();

    const ensureSummary = (name: string) => {
        const key = normalizeDisplayName(name);
        if (!summaries.has(key)) {
            summaries.set(key, { name, quantity: 0 });
        }
        return summaries.get(key)!;
    };

    serviceNames.forEach(name => ensureSummary(name));

    (order.items || []).forEach(item => {
        const description = (item.description || '').trim();
        if (!description) return;

        const matchedName = findMatchingAgendaServiceName(description, serviceNames);
        if (!matchedName && !isServiceItem(description)) return;

        const summary = ensureSummary(matchedName || description);
        const quantity = Number(item.quantity);
        summary.quantity += Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
    });

    if (summaries.size === 0) {
        summaries.set('servicio', { name: 'Servicio', quantity: 1 });
    }

    return Array.from(summaries.values()).map(summary => ({
        ...summary,
        quantity: summary.quantity > 0 ? summary.quantity : 1,
    }));
}

function formatAgendaServiceQuantity(quantity: number): string {
    return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2).replace(/\.?0+$/, '');
}

function renderAgendaServiceBadges(order: Order, options: { truncate?: number; inline?: boolean } = {}): string {
    const inlineClass = options.inline ? ' inline' : '';
    const services = getAgendaServiceSummaries(order);

    return `<span class="agenda-service-badges${inlineClass}">${services.map(service => {
        const color = getServiceTypeColor(service.name);
        const label = options.truncate ? service.name.substring(0, options.truncate) : service.name;
        const quantityHtml = service.quantity > 1
            ? `<span class="agenda-service-qty-badge">${formatAgendaServiceQuantity(service.quantity)}</span>`
            : '';

        return `<span class="agenda-service-with-qty" style="--agenda-service-color: ${color};"><span class="agenda-service-badge">${escapeHtml(label)}</span>${quantityHtml}</span>`;
    }).join('')}</span>`;
}

function getAgendaServiceTitle(order: Order): string {
    return getAgendaServiceSummaries(order)
        .map(service => service.quantity > 1 ? `${service.name} x${formatAgendaServiceQuantity(service.quantity)}` : service.name)
        .join(' • ');
}

/**
 * Gets the date for the Monday of the week that contains the given date.
 * @param d The date to find the week for.
 * @returns A new Date object set to midnight on Monday of that week.
 */
function getMonday(d: Date): Date {
    const date = new Date(d);
    const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = day === 0 ? 6 : day - 1; // How many days to subtract to get to Monday
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

export function handleAgendaNavPrev() {
    const date = State.getAgendaDate();
    const view = State.getAgendaView();
    if (view === 'month') {
        date.setMonth(date.getMonth() - 1, 1); // Set to day 1 to avoid month skipping issues
    } else if (view === 'week') {
        date.setDate(date.getDate() - 7);
    } else {
        date.setDate(date.getDate() - 1);
    }
    State.setAgendaDate(new Date(date));
    renderAgendaPage();
}

export function handleAgendaNavNext() {
    const date = State.getAgendaDate();
    const view = State.getAgendaView();
    if (view === 'month') {
        date.setMonth(date.getMonth() + 1, 1); // Set to day 1 to avoid month skipping issues
    } else if (view === 'week') {
        date.setDate(date.getDate() + 7);
    } else {
        date.setDate(date.getDate() - 1);
    }
    State.setAgendaDate(new Date(date));
    renderAgendaPage();
}

export async function handleAgendaManualRefresh(buttonEl: HTMLButtonElement) {
    buttonEl.classList.add('spinning');
    buttonEl.disabled = true;

    try {
        const { getOrdersFromSupabase } = await import('./api');
        const newOrders = await getOrdersFromSupabase();
        const State = await import('./state');
        State.setOrders(newOrders);
        renderAgendaPage();
        const notification = (window as any).UI?.showNotification || showNotification;
        notification('Agenda sincronizada con el servidor', 'success');
    } catch (e) {
        console.error("Manual agenda fetch failed:", e);
        const notification = (window as any).UI?.showNotification || showNotification;
        notification('Error al sincronizar la agenda', 'error');
    } finally {
        buttonEl.classList.remove('spinning');
        buttonEl.disabled = false;
    }
}

async function runManualRefresh(
    buttonEl: HTMLButtonElement,
    task: () => Promise<void>,
    successMessage: string,
    errorMessage: string,
) {
    buttonEl.classList.add('spinning');
    buttonEl.disabled = true;

    try {
        await task();
        showNotification(successMessage, 'success');
    } catch (error) {
        console.error(errorMessage, error);
        showNotification(errorMessage, 'error');
    } finally {
        buttonEl.classList.remove('spinning');
        buttonEl.disabled = false;
    }
}

export async function handleSavedQuotesManualRefresh(buttonEl: HTMLButtonElement) {
    await runManualRefresh(
        buttonEl,
        async () => {
            const [newQuotes, newClients] = await Promise.all([
                API.getQuotesFromSupabase(),
                API.getClientsFromSupabase(),
            ]);
            State.setClients(newClients);
            State.setQuotes(newQuotes);
            renderSavedQuotesPageList();
        },
        'Cotizaciones sincronizadas con el servidor',
        'Error al sincronizar las cotizaciones',
    );
}

export async function handleOrdersManualRefresh(buttonEl: HTMLButtonElement) {
    await runManualRefresh(
        buttonEl,
        async () => {
            const [newOrders, newClients, newTechnicians] = await Promise.all([
                API.getOrdersFromSupabase(),
                API.getClientsFromSupabase(),
                API.getTechniciansFromSupabase(),
            ]);
            State.setClients(newClients);
            State.setTechnicians(newTechnicians);
            State.setOrders(newOrders);
            renderOrdersList();
        },
        'Órdenes sincronizadas con el servidor',
        'Error al sincronizar las órdenes',
    );
}

export async function handleClientsManualRefresh(buttonEl: HTMLButtonElement) {
    await runManualRefresh(
        buttonEl,
        async () => {
            const [newClients, newSedes, newDependencies] = await Promise.all([
                API.getClientsFromSupabase(),
                API.fetchSedes(),
                API.fetchDependencies(),
            ]);
            State.setClients(newClients);
            State.setSedes(newSedes);
            State.setDependencies(newDependencies);
            renderClientsList();
        },
        'Clientes sincronizados con el servidor',
        'Error al sincronizar los clientes',
    );
}

export async function handleItemsManualRefresh(buttonEl: HTMLButtonElement) {
    await runManualRefresh(
        buttonEl,
        async () => {
            const newItems = await API.getItemsFromSupabase();
            State.setItems(newItems);
            State.setFilteredCatalogItems(newItems);
            renderCatalogItemsList();
        },
        'Insumos sincronizados con el servidor',
        'Error al sincronizar los insumos',
    );
}

export async function handleTechniciansManualRefresh(buttonEl: HTMLButtonElement) {
    await runManualRefresh(
        buttonEl,
        async () => {
            const newTechnicians = await API.getTechniciansFromSupabase();
            State.setTechnicians(newTechnicians);
            renderTechniciansList();
        },
        'Técnicos sincronizados con el servidor',
        'Error al sincronizar los técnicos',
    );
}

export function handleAgendaViewChange(view: 'month' | 'week' | 'day') {
    State.setAgendaView(view);
    if (D.agendaViewSwitcher) {
        D.agendaViewSwitcher.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });
    }
    renderAgendaPage();
}

export function renderAgendaPage() {
    if (!D.agendaPage.classList.contains('active')) return;
    const view = State.getAgendaView();
    D.agendaContainer.className = 'agenda-container'; // Reset classes
    D.agendaContainer.classList.add(`${view}-view`);
    updateAgendaTitle();
    switch (view) {
        case 'month':
            renderMonthView();
            break;
        case 'week':
            renderWeekView();
            break;
        case 'day':
            renderDayView();
            break;
    }
}

function updateAgendaTitle() {
    const date = State.getAgendaDate();
    const view = State.getAgendaView();
    let title = '';
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    if (view === 'month') {
        title = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    } else if (view === 'week') {
        const startOfWeek = getMonday(date);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const startMonth = monthNames[startOfWeek.getMonth()];
        const endMonth = monthNames[endOfWeek.getMonth()];

        if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
            title = `${startOfWeek.getDate()} - ${endOfWeek.getDate()} de ${startMonth}, ${startOfWeek.getFullYear()}`;
        } else if (startOfWeek.getFullYear() === endOfWeek.getFullYear()) {
            title = `${startOfWeek.getDate()} de ${startMonth} - ${endOfWeek.getDate()} de ${endMonth}, ${endOfWeek.getFullYear()}`;
        } else {
            title = `${startOfWeek.getDate()} de ${startMonth}, ${startOfWeek.getFullYear()} - ${endOfWeek.getDate()} de ${endMonth}, ${endOfWeek.getFullYear()}`;
        }
    } else { // day
        title = `${dayNames[date.getDay()]}, ${date.getDate()} de ${monthNames[date.getMonth()]}, ${date.getFullYear()}`;
    }
    D.agendaTitle.textContent = title;
}

function renderMonthView() {
    const date = State.getAgendaDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Start calendar on Sunday
    let currentDay = new Date(firstDayOfMonth);
    currentDay.setDate(currentDay.getDate() - firstDayOfMonth.getDay());

    const orders = State.getOrders();

    const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    let html = weekdays.map(day => `<div class="calendar-header-cell">${day}</div>`).join('');

    for (let i = 0; i < 42; i++) { // Render 6 weeks to have a consistent grid
        const isOtherMonth = currentDay.getMonth() !== month;
        const isToday = currentDay.getTime() === today.getTime();
        const dateString = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, '0')}-${String(currentDay.getDate()).padStart(2, '0')}`;

        const dailyOrders = orders.filter(o => o.service_date && o.service_date.startsWith(dateString));

        let busyClass = '';
        if (dailyOrders.length >= 7) {
            busyClass = 'busy-day-high';
        } else if (dailyOrders.length >= 5) {
            busyClass = 'busy-day-medium';
        }

        html += `<div class="calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${busyClass}" data-date="${dateString}">`;
        html += `<div class="day-number">${currentDay.getDate()}</div>`;
        html += `<div class="day-orders">`;
        dailyOrders.forEach(order => {
            const client = State.getClients().find(c => c.id === order.clientId);
            const location = getOrderDisplayLocation(order, client);
            const serviceTypeHtml = renderAgendaServiceBadges(order, { truncate: 15, inline: true });
            const serviceTitle = getAgendaServiceTitle(order);
            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const techWarningIcon = needsTech ? `<i class="fas fa-user-slash" style="color: var(--color-warning); margin-right: 3px;" title="Sin técnico asignado"></i>` : '';

            const pillTitle = `#${order.manualId} - ${location.fullName}\n${location.addressString}\nTipo: ${serviceTitle}`;
            const formattedTime = formatTime(order.service_time) || '';

            html += `<div class="agenda-order-pill status-${order.status}" data-order-id="${order.id}" title="${escapeHtml(pillTitle)}">${techWarningIcon}${formattedTime} ${renderAgendaLocationName(location, true)} <span style="margin-left: 3px;">${serviceTypeHtml}</span></div>`;
        });
        html += `</div></div>`;

        currentDay.setDate(currentDay.getDate() + 1);
        if (i > 27 && currentDay.getMonth() !== month && currentDay.getDay() === 0) break; // Stop after 5 or 6 weeks if next week is entirely in next month
    }

    D.agendaContainer.innerHTML = html;

    // Click on any pill → open panel (pills no longer navigate directly to workspace)
    D.agendaContainer.querySelectorAll('.agenda-order-pill').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const pill = e.currentTarget as HTMLElement;
            const dayCell = pill.closest('.calendar-day') as HTMLElement | null;
            const dateStr = dayCell?.dataset.date;
            if (dateStr) openAgendaDayPanel(dateStr);
        });
    });

    // Click anywhere on the day cell → open panel
    D.agendaContainer.querySelectorAll('.calendar-day').forEach(el => {
        el.addEventListener('click', () => {
            const dateStr = (el as HTMLElement).dataset.date;
            if (dateStr) openAgendaDayPanel(dateStr);
        });
    });
}


function renderTimelineView(days: Date[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startHour = 7;
    const endHour = 20;
    const orders = State.getOrders();

    let headerHtml = `<div class="time-gutter header-gutter"></div>`;
    let bodyHtml = `<div class="time-gutter">`;
    for (let h = startHour; h <= endHour; h++) {
        bodyHtml += `<div class="time-gutter-slot">${h}:00</div>`;
    }
    bodyHtml += `</div>`;

    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    let dayColumnsHtml = '';
    days.forEach(day => {
        const isToday = day.getTime() === today.getTime();
        const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;

        const dailyOrders = orders.filter(o => o.service_date && o.service_date.startsWith(dateString));

        const timedOrders = dailyOrders.filter(o => o.service_time);
        const allDayOrders = dailyOrders.filter(o => !o.service_time);


        let allDayHtml = '';
        allDayOrders.forEach(order => {
            const client = State.getClients().find(c => c.id === order.clientId);
            const location = getOrderDisplayLocation(order, client);
            const serviceTypeHtml = renderAgendaServiceBadges(order, { truncate: 15, inline: true });
            const serviceTitle = getAgendaServiceTitle(order);

            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const techWarningIcon = needsTech ? `<i class="fas fa-user-slash" style="color: var(--color-warning); margin-right: 3px;" title="Sin técnico asignado"></i>` : '';

            const pillTitle = `#${order.manualId} - ${location.fullName}\n${location.addressString}\nTipo: ${serviceTitle}`;
            const formattedTime = formatTime(order.service_time) || '';

            allDayHtml += `<div class="agenda-order-pill status-${order.status}" data-order-id="${order.id}" title="${escapeHtml(pillTitle)}">${techWarningIcon}${formattedTime} ${renderAgendaLocationName(location, true)} <span style="margin-left: 3px;">${serviceTypeHtml}</span></div>`;
        });

        headerHtml += `<div class="header-day ${isToday ? 'today' : ''}">
            <div class="header-day-allday">${allDayHtml}</div>
            <div>
                <span class="day-name">${dayNames[day.getDay()]}</span>
                <span class="day-date">${day.getDate()}</span>
            </div>
        </div>`;

        // --- Event Layout Algorithm ---
        const timedOrdersForLayout = timedOrders.map(o => {
            const [h, m] = o.service_time!.split(':').map(Number);
            const startMinutes = h * 60 + m;
            return {
                ...o,
                startMinutes: startMinutes,
                endMinutes: startMinutes + (o.estimated_duration || 1) * 60, // default 1 hr
            };
        }).sort((a, b) => a.startMinutes - b.startMinutes);

        const columns: { events: any[] }[] = [];
        for (const event of timedOrdersForLayout) {
            let placed = false;
            for (const column of columns) {
                const lastEventInColumn = column.events[column.events.length - 1];
                if (event.startMinutes >= lastEventInColumn.endMinutes) {
                    column.events.push(event);
                    (event as any).layout = { col: columns.indexOf(column) };
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                const newCol = { events: [event] };
                columns.push(newCol);
                (event as any).layout = { col: columns.length - 1 };
            }
        }
        const totalCols = Math.max(1, columns.length);

        const MIN_EVENT_WIDTH_PX = 140;
        const dayColumnMinWidth = Math.max(120, totalCols * MIN_EVENT_WIDTH_PX);
        // --- End Algorithm ---

        let timedOrdersHtml = '';
        timedOrdersForLayout.forEach(order => {
            const [hour, minute] = order.service_time!.split(':').map(Number);
            const top = ((hour - startHour) + (minute / 60)) * 50; // 50px per hour
            const height = (order.estimated_duration || 1) * 50;

            const { col } = (order as any).layout;
            const width = 100 / totalCols;
            const left = col * width;

            const client = State.getClients().find(c => c.id === order.clientId);
            const location = getOrderDisplayLocation(order, client);
            const techs = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));
            const formattedTime = formatTime(order.service_time);

            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const techWarningIcon = needsTech ? `<i class="fas fa-user-slash" style="color: var(--color-warning);" title="Sin técnico asignado"></i> ` : '';

            const addressHtml = location.addressString !== 'Sin dirección' ? `<span class="event-address">${location.addressString}</span>` : '';


            const serviceTypeHtml = renderAgendaServiceBadges(order, { truncate: 15 });

            timedOrdersHtml += `<div class="order-event status-${order.status}" style="top: ${top}px; height: ${height}px; left: ${left}%; width: calc(${width}% - 2px);" data-order-id="${order.id}">
                <strong class="event-title">${techWarningIcon}${renderAgendaLocationName(location)}</strong>
                ${addressHtml}
                <span class="event-time">${formattedTime} - #${order.manualId}</span>
                <span class="event-type">${serviceTypeHtml}</span>
                <em class="event-techs">${techs.map((t: any) => t.name?.split(' ')[0]).join(', ')}</em>
            </div>`;
        });
        dayColumnsHtml += `<div class="day-column" style="min-width: ${dayColumnMinWidth}px;">${timedOrdersHtml}</div>`;
    });

    let hourLinesHtml = '';
    for (let h = startHour; h <= endHour; h++) {
        hourLinesHtml += `<div class="hour-line"></div>`;
    }

    D.agendaContainer.innerHTML = `
        <div class="timeline-header">${headerHtml}</div>
        <div class="timeline-body">
            ${bodyHtml}
            <div class="day-columns-container">
                <div class="hour-lines-container">${hourLinesHtml}</div>
                ${dayColumnsHtml}
            </div>
        </div>
    `;

    D.agendaContainer.querySelectorAll('.order-event, .agenda-order-pill').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) openAgendaEditOrderModal(orderId);
        });
    });
}

function renderListWeekView() {
    D.agendaContainer.innerHTML = ''; // Clear container
    const date = State.getAgendaDate();
    const startOfWeek = getMonday(date);

    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        weekDays.push(day);
    }

    const orders = State.getOrders();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayNames   = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const monthNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

    let html = '<div class="list-week-view">';

    weekDays.forEach(day => {
        const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const dailyOrders = orders
            .filter(o => o.service_date && o.service_date.startsWith(dateString))
            .sort((a, b) => (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

        const isToday    = day.getTime() === today.getTime();
        const isTomorrow = day.getTime() === tomorrow.getTime();
        const numOrders  = dailyOrders.length;

        // --- Day Saturation Logic ---
        let saturationClass = '';
        let saturationLabel = '';
        if (numOrders >= 7) {
            saturationClass = 'day-saturated-heavy';
            saturationLabel = ' <span class="saturation-label" style="font-size: 0.8rem; font-weight: 500; color: #dc3545; margin-left: 10px; background-color: rgba(220,53,69,0.1); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(220,53,69,0.2);">Día saturado</span>';
        } else if (numOrders >= 3) {
            saturationClass = 'day-saturated-medium';
        }

        const dayLabelBadge = isToday
            ? '<span class="day-label-badge">Hoy</span>'
            : isTomorrow
            ? '<span class="day-label-badge">Mañana</span>'
            : '';

        const orderCountBadge = numOrders > 0
            ? `<span class="day-order-count">${numOrders} orden${numOrders > 1 ? 'es' : ''}</span>`
            : '';

        html += `
            <div class="day-section ${saturationClass}">
                <div class="day-header ${isToday ? 'today' : ''}">
                    <div class="day-header-left">
                        ${dayNames[day.getDay()]} ${day.getDate()} ${monthNames[day.getMonth()]}${dayLabelBadge}${saturationLabel}
                    </div>
                    ${orderCountBadge}
                </div>
                <div class="day-orders-list">
        `;

        if (dailyOrders.length > 0) {
            dailyOrders.forEach(order => {
                const client = State.getClients().find(c => c.id === order.clientId);
                const location = getOrderDisplayLocation(order, client);
                const techs = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));
                const formattedTime = formatTime(order.service_time);
                const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
                const techWarningIcon = needsTech ? ` <i class="fas fa-user-slash" style="color: var(--color-warning);" title="Sin técnico asignado"></i>` : '';

                const addressHtml = location.addressString !== 'Sin dirección' ? `<div class="order-address-mobile"><i class="fas fa-map-marker-alt"></i> ${location.addressString}</div>` : '';

                let pillsHtml = '';
                const displayTechs = techs.filter(t => t.id !== NO_ASIGNADO_TECHNICIAN_ID);
                if (displayTechs.length > 0) {
                    pillsHtml = `<span style="font-size: 0.9rem; font-weight: 500; color: #10b981;">${displayTechs.map(t => t.name?.split(' ')[0]).join(', ')}</span>`;
                } else {
                    pillsHtml = `<span style="font-size: 0.9rem; font-weight: 500; color: var(--color-text-light);">No asignado</span>`;
                }

                const serviceTypeHtml = renderAgendaServiceBadges(order);

                html += `
                    <div class="order-item order-item-two-col" data-order-id="${order.id}" style="display: flex; justify-content: space-between; align-items: flex-start; cursor: default;">
                        <div class="order-item-main" style="display: flex; gap: 15px; flex-grow: 1;">
                            <div class="order-status-dot status-${order.status}"></div>
                            <div class="order-time">${formattedTime || 'Todo Día'}</div>
                            <div class="order-details" style="flex-grow: 1;">
                                <div class="order-client">${renderAgendaLocationName(location)} (#${order.manualId})${techWarningIcon}</div>
                                ${addressHtml}
                                <div class="order-type-mobile">${serviceTypeHtml}</div>
                                
                                <div style="margin-top: 10px; max-width: 320px;">
                                    <span style="font-size: 0.75rem; color: var(--color-text-light); margin-bottom: 2px; display: block;">Técnicos Asignados</span>
                                    <div class="custom-select-container agenda-tech-trigger" data-order-id="${order.id}" tabindex="0" style="min-height: 38px; padding: 5px 30px 5px 8px; border: 1px solid var(--color-primary); border-radius: 6px; position: relative; cursor: pointer; background: transparent;">
                                        <div class="technician-selected-pills" style="display: flex; flex-wrap: wrap; gap: 4px; pointer-events: none;">
                                            ${pillsHtml}
                                        </div>
                                        <i class="fas fa-chevron-down custom-select-arrow" style="position: absolute; right: 10px; top: 11px; color: var(--color-text-light); pointer-events: none;"></i>
                                    </div>
                                </div>
                            </div>
                            
                            ${order.notes ? `
                            <div class="order-notes-preview" style="flex-grow: 1; border-left: 2px solid var(--color-border); padding-left: 15px; margin-left: 15px; color: var(--color-text-light); font-size: 0.85rem; max-height: 85px; overflow-y: auto; align-self: stretch;">
                                <div style="font-weight: 600; font-size: 0.70rem; text-transform: uppercase; margin-bottom: 2px; color: var(--color-text-light);">Restricciones / Observaciones</div>
                                <div style="white-space: pre-wrap; word-break: break-word;">${order.notes}</div>
                            </div>
                            ` : ''}
                        </div>
                        <div class="order-item-actions agenda-item-actions" style="margin-left: auto; padding-left: 15px; display: flex; gap: 8px;">
                            <!-- White button fix -->
                            <button class="btn edit-order-btn" data-order-id="${order.id}" style="background-color: white; border: 1px solid var(--color-border); color: var(--color-text); padding: 5px 10px; font-size: 0.9rem;" title="Editar">
                                <i class="fas fa-edit" style="pointer-events:none; color: var(--color-primary);"></i>
                            </button>
                            ${order.status !== 'completed' && order.status !== 'cancelled' ? `
                            <button class="btn mark-completed-btn" data-order-id="${order.id}" style="background-color: white; border: 1px solid var(--color-border); color: #6c757d; padding: 5px 10px; font-size: 0.9rem;" title="Marcar como Finalizado / Realizado">
                                <i class="fas fa-check-circle" style="pointer-events:none;"></i>
                            </button>
                            ` : ''}
                            <button class="btn delete-order-btn" data-order-id="${order.id}" style="background-color: white; border: 1px solid var(--color-border); color: var(--color-danger); padding: 5px 10px; font-size: 0.9rem;" title="Eliminar">
                                <i class="fas fa-trash" style="pointer-events:none;"></i>
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div class="no-orders-msg">No hay servicios programados.</div>';
        }

        html += `
                <div class="day-add-action">
                    <button class="add-order-day-btn" data-date="${dateString}" title="Agendar orden este día">
                        <i class="fas fa-plus" style="pointer-events:none;"></i> Nueva orden
                    </button>
                </div>
        `;

        html += `</div></div>`;
    });

    html += '</div>';

    D.agendaContainer.innerHTML = html;

    D.agendaContainer.querySelectorAll('.edit-order-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) openAgendaEditOrderModal(orderId);
        });
    });

    D.agendaContainer.querySelectorAll('.delete-order-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) {
                showConfirmationModal(
                    'Eliminar Orden',
                    '¿Está seguro de que desea eliminar esta orden?',
                    async () => {
                        try {
                            await API.deleteOrder(orderId);
                            const orders = State.getOrders().filter(o => o.id !== orderId);
                            State.setOrders(orders);
                            renderAgendaPage();
                            showNotification('Orden eliminada exitosamente', 'success');
                        } catch (error: any) {
                            showNotification(`Error al eliminar: ${error.message}`, 'error');
                        }
                    }
                );
            }
        });
    });

    D.agendaContainer.querySelectorAll('.mark-completed-btn').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) {
                showConfirmationModal(
                    'Marcar como Realizado',
                    '¿Está seguro de que desea aplicar el estado de completado a este trabajo?',
                    async () => {
                        try {
                            const orderToUpdate = State.getOrders().find(o => o.id === orderId);
                            if (!orderToUpdate) return;
                            
                            const updatedOrder = await API.saveOrder({ ...orderToUpdate, status: 'completed' });
                            showNotification('Trabajo marcado como realizado', 'success');
                            
                            const orders = State.getOrders().map(o => o.id === orderId ? updatedOrder : o);
                            State.setOrders(orders);
                            renderAgendaPage();
                        } catch (error: any) {
                            showNotification(`Error al actualizar estado: ${error.message}`, 'error');
                        }
                    }
                );
            }
        });
    });

    D.agendaContainer.querySelectorAll('.add-order-day-btn').forEach(el => {
        el.addEventListener('click', async (e) => {
            const dateStr = (e.currentTarget as HTMLElement).dataset.date;
            if (dateStr) {
                closeAllModals();
                await navigateToOrderWorkspace(null, null, dateStr);
            }
        });
    });

    D.agendaContainer.querySelectorAll('.agenda-tech-trigger').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) openAgendaTechDropdown(orderId, e.currentTarget as HTMLElement);
        });
    });
}

function renderWeekView() {
    renderListWeekView();
}

function renderDayView() {
    const date = State.getAgendaDate();
    date.setHours(0, 0, 0, 0);
    renderTimelineView([date]);
}

export async function handleChangePassword(e: Event) {
    e.preventDefault();
    const currentPassword = D.currentPasswordInput.value;
    const newPassword = D.newPasswordInput.value;
    const confirmPassword = D.confirmPasswordInput.value;

    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('Por favor, complete todos los campos.', 'error');
        return;
    }

    if (newPassword.length < 6) {
        showNotification('La nueva clave debe tener al menos 6 caracteres.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showNotification('Las nuevas claves no coinciden.', 'error');
        D.newPasswordInput.focus();
        return;
    }

    const btn = D.changePasswordBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Guardando...`;

    try {
        const storedPassword = await API.getSetting('app_password') || 'wilson1423';

        if (currentPassword !== storedPassword) {
            showNotification('La clave actual es incorrecta.', 'error');
            D.currentPasswordInput.focus();
            D.currentPasswordInput.select();
            return;
        }

        await API.setSetting('app_password', newPassword);
        showNotification('Clave actualizada correctamente.', 'success');
        D.changePasswordForm.reset();

    } catch (error: any) {
        showNotification(`Error al cambiar la clave: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

export function openAgendaTechDropdown(orderId: string, triggerEl: HTMLElement, forceOpen: boolean = false) {
    let agendaTechDropdown = document.getElementById('agenda-tech-dropdown') as HTMLDivElement;

    if (!forceOpen && agendaTechDropdown && agendaTechDropdown.style.display === 'block' && agendaTechDropdown.dataset.activeOrderId === orderId) {
        agendaTechDropdown.style.display = 'none';
        agendaTechDropdown.dataset.activeOrderId = '';
        return;
    }

    const order = State.getOrders().find(o => o.id === orderId);
    if (!order) return;

    if (!agendaTechDropdown) {
        const dropdownHtml = `<div id="agenda-tech-dropdown" class="custom-select-dropdown search-results-popover" style="display: none; position: absolute; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 250px;"></div>`;
        document.body.insertAdjacentHTML('beforeend', dropdownHtml);
        agendaTechDropdown = document.getElementById('agenda-tech-dropdown') as HTMLDivElement;
    }

    const visibleTechnicians = State.getTechnicians()
        .filter(t => t.is_active && t.role !== 'admin' && !(t.name ?? '').toLowerCase().includes('admin(dev)'))
        .sort((a, b) => {
            if (a.id === NO_ASIGNADO_TECHNICIAN_ID) return -1;
            if (b.id === NO_ASIGNADO_TECHNICIAN_ID) return 1;
            return (a.name ?? '').localeCompare(b.name ?? '');
        });

    agendaTechDropdown.innerHTML = visibleTechnicians.map(tech => {
        const isSelected = order.technicianIds.includes(tech.id);
        const { conflict, message } = checkTechnicianConflict(tech.id, order);

        return `
            <div class="technician-dropdown-item ${isSelected ? 'selected' : ''} ${conflict ? 'conflict' : ''}" data-tech-id="${tech.id}" style="padding: 10px 15px; border-bottom: 1px solid var(--color-border); cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: ${isSelected ? 'var(--color-bg-light)' : 'transparent'};">
                <span style="${isSelected ? 'font-weight: bold; color: #10b981;' : ''}">${tech.name} ${isSelected ? '<i class="fas fa-check" style="color: #10b981; margin-left:5px;"></i>' : ''}</span>
                ${conflict ? `<span class="tech-conflict-label" style="font-size: 0.7rem; color: white; background: var(--color-danger); padding: 2px 5px; border-radius: 4px;">${message}</span>` : ''}
            </div>
        `;
    }).join('');

    // clone node to clear past event listeners
    const newDropdown = agendaTechDropdown.cloneNode(true) as HTMLDivElement;
    agendaTechDropdown.parentNode?.replaceChild(newDropdown, agendaTechDropdown);
    const dropdown = newDropdown;
    dropdown.dataset.activeOrderId = orderId;

    // Add click listeners
    dropdown.querySelectorAll('.technician-dropdown-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.stopPropagation();
            const techId = (e.currentTarget as HTMLElement).dataset.techId;
            if (!techId) return;

            // Toggle technician
            let newIds = [...order.technicianIds];
            if (newIds.includes(techId)) {
                newIds = newIds.filter(id => id !== techId);
            } else {
                if (techId === NO_ASIGNADO_TECHNICIAN_ID) {
                    newIds = [NO_ASIGNADO_TECHNICIAN_ID];
                } else {
                    newIds = newIds.filter(id => id !== NO_ASIGNADO_TECHNICIAN_ID);
                    newIds.push(techId);
                }
            }
            if (newIds.length === 0) newIds = [NO_ASIGNADO_TECHNICIAN_ID];
            order.technicianIds = newIds;

            const shouldClose = techId === NO_ASIGNADO_TECHNICIAN_ID || newIds.filter(id => id !== NO_ASIGNADO_TECHNICIAN_ID).length >= 2;

            if (shouldClose) {
                dropdown.style.display = 'none';
                const activeDoc = document as any;
                if (activeDoc._agendaClickHandler) {
                    document.removeEventListener('click', activeDoc._agendaClickHandler);
                    window.removeEventListener('scroll', activeDoc._agendaClickHandler, true);
                    activeDoc._agendaClickHandler = null;
                }
            } else {
                // Re-render UI locally for instant feedback
                openAgendaTechDropdown(orderId, triggerEl, true);
            }

            // Use processing indicator
            const freshTriggerEl = (document.querySelector('.agenda-tech-trigger[data-order-id="' + orderId + '"]') as HTMLElement) || triggerEl;
            const originalHtml = freshTriggerEl.innerHTML;
            freshTriggerEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 5px; color: var(--color-primary);"></i> Procesando...';

            try {
                // Auto-save logic
                const savedOrder = await API.saveOrder(order);
                const orders = [...State.getOrders()];
                const idx = orders.findIndex(o => o.id === savedOrder.id);
                if (idx !== -1) orders[idx] = savedOrder;
                State.setOrders(orders);

                // Re-render the list week view after state update
                renderListWeekView();
            } catch (e) {
                console.error(e);
                freshTriggerEl.innerHTML = originalHtml;
            }
        });
    });

    // Positioning
    const rect = triggerEl.getBoundingClientRect();
    dropdown.style.display = 'block';
    dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
    dropdown.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;

    // Auto-close logic
    const activeDoc = document as any;
    const closeDropdown = (e: Event) => {
        if (e.type === 'scroll' && dropdown.contains(e.target as Node)) return;
        if (e.type === 'click' && (dropdown.contains(e.target as Node) || triggerEl.contains(e.target as Node))) return;

        dropdown.style.display = 'none';
        document.removeEventListener('click', closeDropdown);
        window.removeEventListener('scroll', closeDropdown, true);
        activeDoc._agendaClickHandler = null;
    };

    // Remove past listeners and add new one
    if (activeDoc._agendaClickHandler) {
        document.removeEventListener('click', activeDoc._agendaClickHandler);
        window.removeEventListener('scroll', activeDoc._agendaClickHandler, true);
    }
    activeDoc._agendaClickHandler = closeDropdown;

    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
        window.addEventListener('scroll', closeDropdown, true);
    }, 10);
}


// -----------------------------------------------------------------------
// Agenda Day Panel — slide-in panel showing orders for a selected day
// -----------------------------------------------------------------------
const PANEL_DAY_NAMES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const PANEL_MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export async function openAgendaDayPanel(dateStr: string) {
    const panelOverlay = document.getElementById('agenda-panel-overlay')!;
    const panel        = document.getElementById('agenda-day-panel')!;
    const header       = document.getElementById('agenda-panel-header')!;
    const body         = document.getElementById('agenda-panel-body')!;

    const [y, m, d] = dateStr.split('-').map(Number);
    const date   = new Date(y, m - 1, d);
    const todayStr = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; })();
    const dayLabel = dateStr === todayStr ? 'Hoy' : PANEL_DAY_NAMES[date.getDay()];

    const orders = State.getOrders()
        .filter(o => o.service_date && o.service_date.startsWith(dateStr))
        .sort((a, b) => (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

    header.innerHTML = `
        <div>
            <h3>${dayLabel}, ${d} ${PANEL_MONTH_NAMES[m - 1]} ${y}</h3>
            <p>${orders.length} orden${orders.length !== 1 ? 'es' : ''} agendada${orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="adp-close-btn" id="agenda-panel-close-btn" title="Cerrar">
            <i class="fas fa-times"></i>
        </button>
    `;
    document.getElementById('agenda-panel-close-btn')!.addEventListener('click', closeAgendaDayPanel);

    if (orders.length === 0) {
        body.innerHTML = `<div style="text-align:center; padding: 40px 16px; color: var(--color-text-secondary);">
            <i class="fas fa-calendar-day" style="font-size:2rem; opacity:0.4; display:block; margin-bottom:10px;"></i>
            No hay órdenes para este día
        </div>`;
    } else {
        body.innerHTML = orders.map(order => {
            const client   = State.getClients().find(c => c.id === order.clientId);
            const location = getOrderDisplayLocation(order, client);
            const time     = formatTime(order.service_time) || 'Todo el día';
            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const warnIcon  = needsTech ? `<i class="fas fa-user-slash" style="color:var(--color-warning);"></i> ` : '';
            const typeLabel = order.order_type || '';
            return `
            <div class="adp-order-card" data-order-id="${order.id}">
                <div class="adp-status-dot status-${order.status}"></div>
                <div class="adp-info">
                    <div class="adp-client">${warnIcon}${escapeHtml(location.fullName)} <span style="font-weight:400;color:var(--color-text-secondary);">#${order.manualId}</span></div>
                    <div class="adp-meta">
                        <span><i class="fas fa-clock" style="opacity:.6;"></i> ${time}</span>
                        ${typeLabel ? `<span><i class="fas fa-tag" style="opacity:.6;"></i> ${escapeHtml(typeLabel)}</span>` : ''}
                        ${location.addressString !== 'Sin dirección' ? `<span><i class="fas fa-map-marker-alt" style="opacity:.6;"></i> ${escapeHtml(location.addressString)}</span>` : ''}
                    </div>
                </div>
                <button class="adp-edit-btn" data-order-id="${order.id}" title="Editar orden">
                    <i class="fas fa-edit" style="pointer-events:none;"></i>
                </button>
            </div>`;
        }).join('');
    }

    // "+ Nueva orden" button at the bottom
    body.insertAdjacentHTML('beforeend', `
        <button class="adp-add-order-btn" id="adp-add-order-btn" data-date="${dateStr}">
            <i class="fas fa-plus"></i> Nueva orden
        </button>
    `);

    // Wire up edit buttons
    body.querySelectorAll('.adp-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) {
                closeAgendaDayPanel();
                openAgendaEditOrderModal(orderId);
            }
        });
    });

    // Clicking the card (not the button) also opens edit
    body.querySelectorAll('.adp-order-card').forEach(card => {
        card.addEventListener('click', () => {
            const orderId = (card as HTMLElement).dataset.orderId;
            if (orderId) {
                closeAgendaDayPanel();
                openAgendaEditOrderModal(orderId);
            }
        });
    });

    // "+ Nueva orden"
    document.getElementById('adp-add-order-btn')?.addEventListener('click', async () => {
        closeAgendaDayPanel();
        await navigateToOrderWorkspace(null, null, dateStr);
    });

    panelOverlay.addEventListener('click', closeAgendaDayPanel);
    panelOverlay.classList.add('open');
    panel.classList.add('open');
}

export function closeAgendaDayPanel() {
    document.getElementById('agenda-panel-overlay')!.classList.remove('open');
    document.getElementById('agenda-day-panel')!.classList.remove('open');
}

export function openAgendaEditOrderModal(orderId: string) {
    const order = State.getOrders().find(o => o.id === orderId);
    if (!order) return;

    const client = State.getClients().find(c => c.id === order.clientId);

    // ── Header: order number + status badge ──────────────────────────
    (document.getElementById('aep-order-number') as HTMLElement).textContent = `#${order.manualId}`;
    const statusBadge = document.getElementById('aep-status-badge') as HTMLElement;
    const statusMeta: Record<string, [string, string]> = {
        pending:     ['Pendiente',   '#6c757d'],
        scheduled:   ['Programada',  '#0dcaf0'],
        in_progress: ['En Progreso', '#fd7e14'],
        completed:   ['Completada',  '#198754'],
        cancelled:   ['Cancelada',   '#dc3545'],
    };
    const [statusLabel, statusColor] = statusMeta[order.status] ?? ['—', '#999'];
    statusBadge.textContent = statusLabel;
    statusBadge.style.cssText = `background:${statusColor}22; color:${statusColor}; border:1px solid ${statusColor}55;`;

    // ── Client fields ─────────────────────────────────────────────────
    if (client) {
        (document.getElementById('agenda-edit-client-name') as HTMLInputElement).value = client.name || '';
        (document.getElementById('agenda-edit-client-phone') as HTMLInputElement).value = (client as any).phone || '';
        (document.getElementById('agenda-edit-client-city') as HTMLInputElement).value = client.city || '';
        (document.getElementById('agenda-edit-client-address') as HTMLInputElement).value = client.address || '';
    }

    // Service fields and all form values are now set AFTER the form clone below,
    // so that they operate on newForm's live elements (cloneNode drops JS-set states).

    // ── Technicians: assigned chips + add dropdown ────────────────────
    const allTechs = State.getTechnicians()
        .filter(t => t.is_active && t.role !== 'admin' && !(t.name ?? '').toLowerCase().includes('admin(dev)'))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

    const localTechIds: string[] = order.technicianIds.filter(id => id !== NO_ASIGNADO_TECHNICIAN_ID);

    const renderTechChips = () => {
        const techChipsEl = document.getElementById('aep-tech-chips') as HTMLElement;
        if (!techChipsEl) return;
        const assigned = allTechs.filter(t => localTechIds.includes(t.id));
        if (assigned.length === 0) {
            techChipsEl.innerHTML = `<span style="font-size:0.82rem; color:var(--color-text-secondary); padding:4px 0;">Sin técnico asignado</span>`;
        } else {
            techChipsEl.innerHTML = assigned.map(t =>
                `<span class="aep-tech-chip" data-tech-id="${t.id}">
                    ${escapeHtml(t.name ?? '—')}
                    <button type="button" class="aep-tech-chip-remove" data-tech-id="${t.id}" title="Quitar"><i class="fas fa-times"></i></button>
                </span>`
            ).join('');
            techChipsEl.querySelectorAll('.aep-tech-chip-remove').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = (e.currentTarget as HTMLElement).dataset.techId!;
                    const i = localTechIds.indexOf(id);
                    if (i > -1) localTechIds.splice(i, 1);
                    renderTechChips();
                    closeTechPicker();
                });
            });
        }
    };
    renderTechChips();

    // Tech picker dropdown
    let techPickerEl: HTMLElement | null = null;
    const closeTechPicker = () => { techPickerEl?.remove(); techPickerEl = null; };
    const addTechBtn = document.getElementById('aep-add-tech-btn') as HTMLElement;
    const newAddTechBtn = addTechBtn.cloneNode(true) as HTMLElement;
    addTechBtn.parentNode?.replaceChild(newAddTechBtn, addTechBtn);

    newAddTechBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (techPickerEl) { closeTechPicker(); return; }
        const unassigned = allTechs.filter(t => !localTechIds.includes(t.id));
        if (unassigned.length === 0) return;
        techPickerEl = document.createElement('div');
        techPickerEl.className = 'aep-tech-picker';
        techPickerEl.innerHTML = unassigned.map(t =>
            `<div class="aep-tech-picker-item" data-tech-id="${t.id}">${escapeHtml(t.name ?? '—')}</div>`
        ).join('');
        techPickerEl.querySelectorAll('.aep-tech-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                localTechIds.push((item as HTMLElement).dataset.techId!);
                renderTechChips();
                closeTechPicker();
            });
        });
        newAddTechBtn.parentElement!.insertBefore(techPickerEl, newAddTechBtn.nextSibling);
        setTimeout(() => document.addEventListener('click', closeTechPicker, { once: true }), 10);
    });

    // ── Items: inline editable rows ───────────────────────────────────
    const localItems: { id?: string; description: string; quantity: number; }[] =
        (order.items || []).map(i => ({ id: i.id, description: i.description, quantity: i.quantity }));

    const renderItems = () => {
        // Always query live so it works correctly after the form clone below
        const el = document.getElementById('aep-items-list') as HTMLElement;
        if (!el) return;
        el.innerHTML = localItems.length === 0
            ? `<p style="color:var(--color-text-secondary); font-size:0.85rem; margin:0 0 4px; text-align:center; padding:6px 0;">Sin ítems registrados</p>`
            : localItems.map((item, idx) => `
                <div class="aep-item-row" data-idx="${idx}">
                    <input type="text" class="form-control aep-item-desc" placeholder="Descripción" value="${escapeHtml(item.description)}" data-idx="${idx}">
                    <input type="number" class="form-control aep-item-qty" placeholder="Cant." value="${item.quantity}" min="1" step="1" data-idx="${idx}">
                    <button type="button" class="aep-item-remove-btn" data-idx="${idx}" title="Eliminar"><i class="fas fa-times"></i></button>
                </div>`).join('');

        el.querySelectorAll('.aep-item-desc').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt((e.target as HTMLElement).dataset.idx!);
                localItems[idx].description = (e.target as HTMLInputElement).value;
            });
        });
        el.querySelectorAll('.aep-item-qty').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = parseInt((e.target as HTMLElement).dataset.idx!);
                localItems[idx].quantity = parseFloat((e.target as HTMLInputElement).value) || 1;
            });
        });
        el.querySelectorAll('.aep-item-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt((e.currentTarget as HTMLElement).dataset.idx!);
                localItems.splice(idx, 1);
                renderItems();
            });
        });
    };
    renderItems();

    // ── Form submit ───────────────────────────────────────────────────
    // Clone the form to clear accumulated submit listeners from previous opens.
    // Photos section is outside the form so it is never affected by this clone.
    const form = document.getElementById('agenda-edit-order-form') as HTMLFormElement;
    const newForm = form.cloneNode(true) as HTMLFormElement;
    form.parentNode?.replaceChild(newForm, form);

    // After clone: re-populate every dynamic value and re-render interactive sections.
    // cloneNode copies HTML structure but does NOT guarantee JS-set .value / .selected
    // properties are preserved, and it never copies event listeners.

    // Re-set all plain field values
    (newForm.querySelector('#agenda-edit-order-id')    as HTMLInputElement).value   = order.id;
    (newForm.querySelector('#agenda-edit-service-date') as HTMLInputElement).value  = order.service_date;
    (newForm.querySelector('#agenda-edit-service-time') as HTMLInputElement).value  = order.service_time || '';
    (newForm.querySelector('#agenda-edit-status')       as HTMLSelectElement).value = order.status;
    (newForm.querySelector('#agenda-edit-notes')        as HTMLTextAreaElement).value = order.notes || '';
    if (client) {
        (newForm.querySelector('#agenda-edit-client-name')    as HTMLInputElement).value = client.name || '';
        (newForm.querySelector('#agenda-edit-client-phone')   as HTMLInputElement).value = (client as any).phone || '';
        (newForm.querySelector('#agenda-edit-client-city')    as HTMLInputElement).value = client.city || '';
        (newForm.querySelector('#agenda-edit-client-address') as HTMLInputElement).value = client.address || '';
    }

    // Re-populate service type select with correct selection
    const newServiceTypeSelect = newForm.querySelector('#agenda-edit-type') as HTMLSelectElement;
    newServiceTypeSelect.innerHTML = State.getServiceTypes().map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    const orderTypeKey = (order.order_type || '').trim().toLowerCase();
    const matchedOpt = Array.from(newServiceTypeSelect.options).find(o => o.value.trim().toLowerCase() === orderTypeKey);
    if (matchedOpt) {
        newServiceTypeSelect.value = matchedOpt.value;
    } else if (order.order_type) {
        newServiceTypeSelect.insertAdjacentHTML('beforeend', `<option value="${order.order_type}">${order.order_type}</option>`);
        newServiceTypeSelect.value = order.order_type;
    }

    // Re-render tech chips and items with fresh event listeners on newForm's elements
    renderTechChips();
    renderItems();

    // ── Photos / Attachments (outside form — never cloned) ────────────
    const photosGrid = document.getElementById('aep-photos-grid') as HTMLElement;
    const localImagePaths: string[] = [...(order.image_urls ?? [])];
    const blobUrlCache: Record<string, string> = {};

    const renderPhotos = () => {
        if (localImagePaths.length === 0) {
            photosGrid.innerHTML = `<p style="color:var(--color-text-secondary); font-size:0.82rem; margin:0 0 6px;">Sin fotos adjuntas</p>`;
            return;
        }
        photosGrid.innerHTML = localImagePaths.map((_, i) =>
            `<div class="aep-photo-cell" data-photo-idx="${i}"
                  style="aspect-ratio:1; background:var(--color-bg-dark); border-radius:6px;
                         display:flex; align-items:center; justify-content:center; overflow:hidden;">
                <i class="fas fa-spinner fa-spin" style="color:var(--color-text-secondary);"></i>
             </div>`
        ).join('');

        localImagePaths.forEach((path, i) => {
            const cell = photosGrid.querySelector(`[data-photo-idx="${i}"]`) as HTMLElement;
            if (!cell) return;

            const showImage = (src: string) => {
                cell.innerHTML = `<img src="${src}" alt="foto"
                    style="width:100%;height:100%;object-fit:cover;border-radius:6px;cursor:pointer;">`;
                cell.querySelector('img')?.addEventListener('click', () => {
                    (document.getElementById('image-viewer-img') as HTMLImageElement).src = src;
                    (document.getElementById('image-viewer-modal') as HTMLElement).style.display = 'flex';
                });
            };

            if (blobUrlCache[path]) {
                showImage(blobUrlCache[path]);
                return;
            }
            supabaseOrders.storage.from('order-images').download(path)
                .then(({ data, error }) => {
                    if (error || !data) {
                        console.error('[AEP] photo download error:', path, error);
                        cell.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:red;"><i class="fas fa-exclamation-circle"></i></div>`;
                        return;
                    }
                    const url = URL.createObjectURL(data);
                    blobUrlCache[path] = url;
                    showImage(url);
                });
        });
    };
    renderPhotos();

    const uploadLabel = document.getElementById('aep-upload-label') as HTMLElement;
    const uploadInput = document.getElementById('aep-photo-upload') as HTMLInputElement;
    const newUploadInput = uploadInput.cloneNode(true) as HTMLInputElement;
    uploadInput.parentNode?.replaceChild(newUploadInput, uploadInput);

    newUploadInput.addEventListener('change', async () => {
        const files = newUploadInput.files;
        if (!files || files.length === 0) return;
        uploadLabel.classList.add('uploading');
        uploadLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';

        for (let i = 0; i < files.length; i++) {
            try {
                const compressed = await compressImage(files[i]);
                const fileName = `public/ORDER_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                const { data, error } = await supabaseOrders.storage.from('order-images').upload(fileName, compressed, { contentType: 'image/jpeg' });
                if (error) { showNotification('Error al subir imagen', 'error'); continue; }
                if (data?.path) {
                    blobUrlCache[data.path] = URL.createObjectURL(compressed);
                    localImagePaths.push(data.path);
                }
            } catch { showNotification('Error al comprimir imagen', 'error'); }
        }
        renderPhotos();
        newUploadInput.value = '';
        uploadLabel.classList.remove('uploading');
        uploadLabel.innerHTML = '<i class="fas fa-camera"></i> Adjuntar foto';
    });

    // Re-wire add-item btn after clone (renderItems uses live getElementById so this works correctly)
    const clonedAddItemBtn = newForm.querySelector('#aep-add-item-btn') as HTMLElement;
    clonedAddItemBtn?.addEventListener('click', () => {
        localItems.push({ description: '', quantity: 1 });
        renderItems();
        const inputs = document.getElementById('aep-items-list')?.querySelectorAll('.aep-item-desc');
        if (inputs) (inputs[inputs.length - 1] as HTMLInputElement)?.focus();
    });

    // Re-wire add-tech btn after clone (original listener was on the old form, now removed from DOM)
    const clonedAddTechBtn = newForm.querySelector('#aep-add-tech-btn') as HTMLElement;
    clonedAddTechBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (techPickerEl) { closeTechPicker(); return; }
        const unassigned = allTechs.filter(t => !localTechIds.includes(t.id));
        if (unassigned.length === 0) return;
        techPickerEl = document.createElement('div');
        techPickerEl.className = 'aep-tech-picker';
        techPickerEl.innerHTML = unassigned.map(t =>
            `<div class="aep-tech-picker-item" data-tech-id="${t.id}">${escapeHtml(t.name ?? '—')}</div>`
        ).join('');
        techPickerEl.querySelectorAll('.aep-tech-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                localTechIds.push((item as HTMLElement).dataset.techId!);
                renderTechChips();
                closeTechPicker();
            });
        });
        clonedAddTechBtn.parentElement!.insertBefore(techPickerEl, clonedAddTechBtn.nextSibling);
        setTimeout(() => document.addEventListener('click', closeTechPicker, { once: true }), 10);
    });

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        closeTechPicker();

        const submitBtn = document.querySelector('.aep-footer .btn-primary') as HTMLButtonElement;
        const origLabel = submitBtn?.innerHTML ?? '';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }

        try {
            // Client update
            let clientUpdated = false;
            if (client) {
                const newName    = (document.getElementById('agenda-edit-client-name') as HTMLInputElement).value;
                const newPhone   = (document.getElementById('agenda-edit-client-phone') as HTMLInputElement).value;
                const newCity    = (document.getElementById('agenda-edit-client-city') as HTMLInputElement).value;
                const newAddress = (document.getElementById('agenda-edit-client-address') as HTMLInputElement).value;
                if (client.name !== newName || (client as any).phone !== newPhone || client.city !== newCity || client.address !== newAddress) {
                    const saved = await API.upsertClient({ ...client, name: newName, phone: newPhone, city: newCity, address: newAddress } as any);
                    const clients = [...State.getClients()];
                    const ci = clients.findIndex(c => c.id === saved.id);
                    if (ci !== -1) clients[ci] = saved;
                    State.setClients(clients);
                    clientUpdated = true;
                }
            }

            const newTechIds = localTechIds.length > 0 ? [...localTechIds] : [NO_ASIGNADO_TECHNICIAN_ID];
            const newItems = localItems
                .filter(i => i.description.trim() !== '')
                .map(i => ({ ...order.items.find(oi => oi.id === i.id), description: i.description, quantity: i.quantity, orderId: order.id })) as any[];

            const updatedOrder = {
                ...order,
                service_date:   (document.getElementById('agenda-edit-service-date') as HTMLInputElement).value,
                service_time:   (document.getElementById('agenda-edit-service-time') as HTMLInputElement).value || null,
                status:         (document.getElementById('agenda-edit-status') as HTMLSelectElement).value as any,
                order_type:     (document.getElementById('agenda-edit-type') as HTMLSelectElement).value,
                notes:          (document.getElementById('agenda-edit-notes') as HTMLTextAreaElement).value,
                technicianIds:  newTechIds,
                items:          newItems,
                image_urls:     localImagePaths,
            };

            const savedOrder = await API.saveOrder(updatedOrder);
            const orders = [...State.getOrders()];
            const idx = orders.findIndex(o => o.id === savedOrder.id);
            if (idx !== -1) orders[idx] = savedOrder;
            State.setOrders(orders);

            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origLabel; }
            closeAgendaEditPanel();
            renderAgendaPage();
            showNotification(
                clientUpdated ? `Orden #${order.manualId} y Cliente actualizados` : `Orden #${order.manualId} actualizada correctamente`,
                'success'
            );
        } catch (err: any) {
            showNotification(`Error al guardar: ${err.message}`, 'error');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = origLabel; }
        }
    });

    // Footer buttons (outside form — same DOM elements every time, clone to clear old listeners)
    ['agenda-edit-full-workspace-btn', 'agenda-edit-close-btn', 'agenda-edit-cancel-btn'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const fresh = el.cloneNode(true) as HTMLElement;
        el.parentNode?.replaceChild(fresh, el);
        if (id === 'agenda-edit-full-workspace-btn') {
            fresh.addEventListener('click', () => { closeAgendaEditPanel(); navigateToOrderWorkspace(order.id, null); });
        } else {
            fresh.addEventListener('click', closeAgendaEditPanel);
        }
    });
    const overlay = document.getElementById('agenda-edit-overlay')!;
    const freshOverlay = overlay.cloneNode(false) as HTMLElement;
    overlay.parentNode?.replaceChild(freshOverlay, overlay);
    freshOverlay.addEventListener('click', closeAgendaEditPanel);

    openAgendaEditPanel();
}

function openAgendaEditPanel() {
    document.getElementById('agenda-edit-overlay')!.classList.add('open');
    document.getElementById('agenda-edit-order-modal')!.classList.add('open');
}

export function closeAgendaEditPanel() {
    document.getElementById('agenda-edit-overlay')!.classList.remove('open');
    document.getElementById('agenda-edit-order-modal')!.classList.remove('open');
}

export function setupQuoteAnnexUpload() {
    const uploadInput = document.getElementById("quote-annex-upload") as HTMLInputElement;
    const uploadBtn = document.querySelector('label[for="quote-annex-upload"]') as HTMLElement;
    if (!uploadInput || !uploadBtn) return;

    uploadInput.addEventListener("change", async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;
        const activeQuote = State.getActiveQuote();
        if (!activeQuote) return;
        if (!activeQuote.image_urls) activeQuote.image_urls = [];

        // UI feedback for processing
        const originalText = uploadBtn.innerHTML;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
        uploadBtn.style.pointerEvents = 'none';
        uploadBtn.style.opacity = '0.7';

        let uploadErrors = [];

        for (let i = 0; i < files.length; i++) {
            try {
                const compressedBlob = await compressImage(files[i]);
                const fileName = "IMG_" + Date.now() + "_" + Math.random().toString(36).substring(7) + ".jpg";
                const { data, error } = await supabaseQuotes.storage.from("quote-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
                if (error) {
                    console.error("Error uploading image:", error);
                    uploadErrors.push(`Error Supabase: ${error.message} - Posible problema con el bucket o RLS`);
                    continue;
                }
                if (data && data.path) {
                    activeQuote.image_urls.push(data.path);
                }
            } catch (err: any) {
                console.error("Error compressing/uploading image:", err);
                uploadErrors.push(`Error local: ${err.message || 'Desconocido'}`);
            }
        }

        // Restore UI
        uploadBtn.innerHTML = originalText;
        uploadBtn.style.pointerEvents = 'auto';
        uploadBtn.style.opacity = '1';

        if (uploadErrors.length > 0) {
            alert(`Hubo un error al subir las fotos:\n\n${uploadErrors.join('\n')}\n\nPor favor, verifica que el bucket "quote-images" exista en Supabase y tenga políticas de acceso configuradas.`);
        }

        State.updateActiveQuote(activeQuote);
        renderQuoteAnnexPreviews(activeQuote);
        uploadInput.value = ""; // Reset input
    });
}

export function getQuoteImageUrl(urlPath: string) {
    return supabaseQuotes.storage.from("quote-images").getPublicUrl(urlPath).data.publicUrl;
}

export function renderQuoteAnnexPreviews(quote: Quote | null) {
    if (!quote) return;
    const container = document.getElementById("quote-annex-preview-container");
    if (!container) return;
    container.innerHTML = "";
    const urls = quote.image_urls || [];
    const previewUrls: (string | null)[] = new Array(urls.length).fill(null);
    urls.forEach((url, index) => {
        const el = document.createElement("div");
        el.className = "quote-annex-preview-item";
        el.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;"><i class="fas fa-spinner fa-spin"></i></div>`;
        container.appendChild(el);

        supabaseQuotes.storage.from("quote-images").download(url).then(({ data, error }) => {
            let objectUrl = "";
            let imgHtml = "";
            if (!error && data) {
                objectUrl = URL.createObjectURL(data);
                previewUrls[index] = objectUrl;
                imgHtml = `<img src="${objectUrl}" alt="Anexo" class="clickable-annex-img" style="cursor: pointer;">`;
            } else {
                console.error(error);
                imgHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:red;"><i class="fas fa-exclamation-circle"></i></div>`;
            }

            el.innerHTML = `${imgHtml}<button class="remove-photo-btn" data-index="${index}"><i class="fas fa-times"></i></button>`;
            const imgEl = el.querySelector('.clickable-annex-img');
            if (imgEl) {
                imgEl.addEventListener('click', () => {
                    openImageViewer(previewUrls, index);
                });
            }
            el.querySelector(".remove-photo-btn")?.addEventListener("click", (e) => {
                e.preventDefault();
                const activeQ = State.getActiveQuote();
                if (!activeQ || !activeQ.image_urls) return;
                activeQ.image_urls.splice(index, 1);
                State.updateActiveQuote(activeQ);
                renderQuoteAnnexPreviews(activeQ);
            });
        });
    });
}

export function setupOrderAnnexUpload() {
    const uploadInput = document.getElementById("order-annex-upload") as HTMLInputElement;
    if (!uploadInput) return;
    uploadInput.addEventListener("change", async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files || files.length === 0) return;
        const activeOrder = State.getCurrentOrder();
        if (!activeOrder) return;
        if (!activeOrder.image_urls) activeOrder.image_urls = [];

        // Show immediate visual feedback
        const container = document.getElementById("order-annex-preview-container");
        if (container) {
            for (let i = 0; i < files.length; i++) {
                const el = document.createElement("div");
                el.className = "quote-annex-preview-item";
                el.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;"><i class="fas fa-spinner fa-spin"></i></div>`;
                container.appendChild(el);
            }
        }

        for (let i = 0; i < files.length; i++) {
            try {
                const compressedBlob = await compressImage(files[i]);
                const fileName = "public/ORDER_" + Date.now() + "_" + Math.random().toString(36).substring(7) + ".jpg";
                // Uses order-images bucket (instructions provided to user to create it)
                const { data, error } = await supabaseOrders.storage.from("order-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
                if (error) {
                    console.error("Error uploading order image:", error);
                    showNotification("Error al cargar imagen en la nube.", "error");
                    continue;
                }
                if (data && data.path) {
                    activeOrder.image_urls.push(data.path);
                }
            } catch (err) {
                console.error("Error compressing image:", err);
                showNotification("Error al comprimir la imagen.", "error");
            }
        }
        State.setCurrentOrder(activeOrder);
        renderOrderAnnexPreviews(activeOrder);
        uploadInput.value = "";
    });
}

export function renderOrderAnnexPreviews(order: Order | null) {
    if (!order) return;
    const container = document.getElementById("order-annex-preview-container");
    if (!container) return;
    container.innerHTML = "";
    const urls = order.image_urls || [];
    const previewUrls: (string | null)[] = new Array(urls.length).fill(null);
    urls.forEach((url, index) => {
        const el = document.createElement("div");
        el.className = "quote-annex-preview-item"; // Re-using styling class
        el.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;"><i class="fas fa-spinner fa-spin"></i></div>`;
        container.appendChild(el);

        let downloadPromise;
        if (url.startsWith('QUOTE_IMG::')) {
            const cleanUrl = url.replace('QUOTE_IMG::', '');
            downloadPromise = supabaseQuotes.storage.from("quote-images").download(cleanUrl);
        } else {
            downloadPromise = supabaseOrders.storage.from("order-images").download(url);
        }

        downloadPromise.then(({ data, error }) => {
            let objectUrl = "";
            let imgHtml = "";
            if (!error && data) {
                objectUrl = URL.createObjectURL(data);
                previewUrls[index] = objectUrl;
                imgHtml = `<img src="${objectUrl}" alt="Anexo Orden" class="clickable-annex-img" style="cursor: pointer;">`;
            } else {
                console.error(error);
                imgHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:red;"><i class="fas fa-exclamation-circle"></i></div>`;
            }

            el.innerHTML = `${imgHtml}<button class="remove-photo-btn" data-index="${index}"><i class="fas fa-times"></i></button>`;
            const imgEl = el.querySelector('.clickable-annex-img');
            if (imgEl) {
                imgEl.addEventListener('click', () => {
                    openImageViewer(previewUrls, index);
                });
            }
            el.querySelector(".remove-photo-btn")?.addEventListener("click", (e) => {
                e.preventDefault();
                const activeOrder = State.getCurrentOrder();
                if (!activeOrder || !activeOrder.image_urls) return;
                activeOrder.image_urls.splice(index, 1);
                State.setCurrentOrder(activeOrder);
                renderOrderAnnexPreviews(activeOrder);
                handleOrderDetailsChange(); // Trigger unsaved changes
            });
        });
    });
}

export function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_WIDTH = 800;
            if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed'));
            }, 'image/jpeg', 0.7);
        };
        img.onerror = (e) => reject(e);
    });
}

export async function handleAddSedeClick(context: 'quote' | 'order', companyId: string) {
    if (!companyId) {
        showNotification('Debe seleccionar primero un cliente tipo Empresa', 'error');
        return;
    }
    openEntityModal('sede', null, companyId);
}








// --- Image Viewer Logic ---
let currentViewerImages: string[] = [];
let currentViewerIndex: number = 0;

export function openImageViewer(imagesUrls: (string | null)[], startIndex: number) {
    const validUrls = imagesUrls.filter(u => u !== null) as string[];
    if (validUrls.length === 0) return;
    
    currentViewerImages = validUrls;
    currentViewerIndex = Math.max(0, Math.min(startIndex, validUrls.length - 1));

    const modal = document.getElementById('image-viewer-modal');
    if (!modal) return;

    updateImageViewer();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function updateImageViewer() {
    const imgEl = document.getElementById('image-viewer-img') as HTMLImageElement;
    const counterEl = document.getElementById('image-viewer-counter');
    if (!imgEl || !counterEl) return;

    imgEl.src = currentViewerImages[currentViewerIndex];
    counterEl.innerText = `${currentViewerIndex + 1} / ${currentViewerImages.length}`;
}

function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('image-viewer-close')?.addEventListener('click', closeImageViewer);
    document.getElementById('image-viewer-prev')?.addEventListener('click', () => {
        if (currentViewerImages.length === 0) return;
        currentViewerIndex = (currentViewerIndex - 1 + currentViewerImages.length) % currentViewerImages.length;
        updateImageViewer();
    });
    document.getElementById('image-viewer-next')?.addEventListener('click', () => {
        if (currentViewerImages.length === 0) return;
        currentViewerIndex = (currentViewerIndex + 1) % currentViewerImages.length;
        updateImageViewer();
    });
});
