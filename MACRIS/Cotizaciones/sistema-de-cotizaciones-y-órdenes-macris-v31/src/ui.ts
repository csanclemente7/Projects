import * as D from './dom';
import * as State from './state';
import * as API from './api';
import { generateQuotePDFDoc, generateOrderPDFDoc, generatePreviewPDF, previewPdfInModal } from './pdf';
import type { Quote, QuoteItem, Client, Item, PdfTemplate, Order, Technician, OrderItem, ClientInsert, ItemInsert, TechnicianInsert } from './types';
import { formatCurrency, generateId, isMobileDevice, formatTime } from './utils';
import { getSessionUser } from './user-session';

// --- Modal State ---
let onConfirmCallback: (() => void) | null = null;
let onCancelCallback: (() => void) | null = null;
let currentEditingItemId: string | null = null;
let currentEditingContext: 'quote' | 'order' | null = null;
const NO_ASIGNADO_TECHNICIAN_ID = '849dac95-99d8-4f43-897e-7565fec32382';

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
        if(showNotif) showNotification(`Tema cambiado a ${theme === 'light' ? 'Claro' : 'Oscuro'}.`);
    } catch(e: any) {
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
    } catch(e: any) {
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

export function renderOrderTypeOptions() {
    const serviceTypes = State.getServiceTypes();
    if (D.orderTypeSelect) {
        D.orderTypeSelect.innerHTML = '<option value="">Seleccione un tipo...</option>';
        serviceTypes.sort((a, b) => a.name.localeCompare(b.name)).forEach(type => {
            const option = document.createElement('option');
            option.value = type.name;
            option.textContent = type.name;
            D.orderTypeSelect.appendChild(option);
        });
    }
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
    D.quoteIdDisplay.textContent = `#${quote.manualId}`;
    (D.quoteDateInput as any)._flatpickr.setDate(quote.date, false);
    D.vatToggleSwitch.checked = quote.taxRate > 0;
    D.quoteTermsTextarea.value = quote.terms;
    const client = State.getClients().find(c => c.id === quote.clientId);
    D.clientSearchInput.value = client ? `[${client.manualId}] ${client.name}` : '';
    renderClientDetails(quote.clientId, 'quote');
    D.editClientBtn.style.display = quote.clientId ? 'inline-flex' : 'none';
    D.quoteItemsTableBody.innerHTML = '';
    quote.items.forEach(item => D.quoteItemsTableBody.appendChild(createItemRow(item)));
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
    D.orderTypeSelect.value = '';
    D.orderStatusSelect.value = 'pending';
    D.orderNotesTextarea.value = '';
    D.orderItemsTableBody.innerHTML = '';
    D.orderVatToggleSwitch.checked = false;
    D.orderItemSearchInput.value = '';
    renderTechnicianPills([]);
    updateOrderSummary();
}

export function navigateTo(pageId: string) {
    const currentPageId = document.querySelector('.page.active')?.id;

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
        container.classList.remove('active');
    });
    
    // Show the target page.
    const newPage = document.getElementById(pageId);
    if (newPage) {
        newPage.classList.add('active');
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
    } else if(pageId === 'page-agenda') {
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
        id: generateId(), created_at: new Date().toISOString(), manualId: await getNextQuoteManualId(),
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
        const savedQuote = await API.saveQuote(quote);
        State.setQuotes([...State.getQuotes().filter(q => q.id !== savedQuote.id), savedQuote]);
        State.updateActiveQuote(savedQuote);
        if (isNewQuote) {
            const authorName = getSessionUser().name || 'Admin';
            await State.setQuoteAuthor(savedQuote.id, authorName);
        }
        renderQuote(savedQuote);
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
        showNotification(`Error: ${err.message}`, "error");
    } finally {
        btn.disabled = false;
        D.saveQuoteBtn.disabled = false;
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

// --- Search UIs (Generic) ---
export function setupItemSearch(input: HTMLInputElement, results: HTMLDivElement, context: 'quote'|'order') {
    input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        results.style.display = 'none';
        if (term.length < 2) return;
        const items = State.getItems().filter(i => i.name.toLowerCase().includes(term) || i.manualId.toLowerCase().includes(term)).slice(0, 5);
        if (items.length > 0) {
            results.innerHTML = items.map(i => `<div class="search-result-item" data-id="${i.id}"><span class="item-code">[${i.manualId}]</span> ${i.name} <span class="item-price">${formatCurrency(i.price)}</span></div>`).join('');
            results.style.display = 'block';
        }
    });
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
        }
    });
    document.addEventListener('click', (e) => {
        if (!input.parentElement?.contains(e.target as Node)) results.style.display = 'none';
    });
}

export function setupClientSearch(input: HTMLInputElement, results: HTMLDivElement, context: 'quote'|'order') {
    input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        results.style.display = 'none';
        if (term.length < 1) return;
        const clients = State.getClients().filter(c => c.name.toLowerCase().includes(term) || c.manualId.toLowerCase().includes(term)).slice(0, 5);
        if (clients.length > 0) {
            results.innerHTML = clients.map(c => `<div class="search-result-item" data-id="${c.id}"><span class="client-id">[${c.manualId}]</span> ${c.name}</div>`).join('');
            results.style.display = 'block';
        }
    });
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
    const orderItem: OrderItem = { id: generateId(), created_at: new Date().toISOString(), orderId: order.id, itemId: item.id, manualId: item.manualId, description: item.name, quantity: 1, price: item.price };
    order.items.push(orderItem);
    renderOrderWorkspace(order);
}

export function renderClientDetails(clientId: string | null, context: 'quote'|'order') {
    const container = context === 'quote' ? D.clientDetailsContainer : D.orderClientDetails;
    if (!clientId) {
        container.innerHTML = '<p>Ningún cliente seleccionado</p>';
        return;
    }
    const client = State.getClients().find(c => c.id === clientId);
    if (client) {
        container.innerHTML = `<p><i class="fas fa-user-tie"></i> <strong>Contacto:</strong> ${client.contactPerson||'N/A'}</p><p><i class="fas fa-map-marker-alt"></i> <strong>Dirección:</strong> ${client.address||'N/A'}</p><p><i class="fas fa-phone"></i> <strong>Teléfono:</strong> ${client.phone||'N/A'}</p><p><i class="fas fa-envelope"></i> <strong>Email:</strong> ${client.email||'N/A'}</p>`;
    } else {
        container.innerHTML = '<p>Cliente no encontrado.</p>';
    }
}

// --- Management Page List Rendering ---
export function renderClientsList() {
    D.clientCountBadge.textContent = State.getClients().length.toString();
    const term = D.clientListSearchInput.value.toLowerCase();
    const clients = State.getClients().filter(c => c.name?.toLowerCase().includes(term) || c.contactPerson?.toLowerCase().includes(term) || c.manualId?.toLowerCase().includes(term));
    let html = `<table class="management-table"><thead><tr><th>Nombre</th><th>Contacto</th><th>Teléfono</th><th>Email</th><th class="actions">Acciones</th></tr></thead><tbody>`;
    if (clients.length > 0) {
        html += clients.sort((a,b) => (parseInt(b.manualId) || 0) - (parseInt(a.manualId) || 0)).map(c => `<tr><td><strong>${c.name}</strong><br><small>ID: ${c.manualId}</small></td><td>${c.contactPerson||'-'}</td><td>${c.phone||'-'}</td><td>${c.email||'-'}</td><td class="actions"><button class="btn btn-icon-only btn-secondary edit-btn" data-id="${c.id}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-icon-only btn-danger delete-btn" data-id="${c.id}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`).join('');
    } else {
        html += `<tr><td colspan="5" style="text-align: center; padding: 20px;">No hay clientes.</td></tr>`;
    }
    D.clientsListContainer.innerHTML = html + `</tbody></table>`;
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
        html += quotes.sort((a,b) => parseInt(b.manualId) - parseInt(a.manualId)).map(q => {
            const client = State.getClients().find(c => c.id === q.clientId)?.name || 'N/A';
            const date = new Date(q.date).toLocaleDateString('es-CO');
            const createdTime = formatCreatedTime(q.created_at || q.date);
            const total = q.items.reduce((s, i) => s + i.quantity * i.price, 0) * (1 + q.taxRate / 100);
            const author = State.getQuoteAuthor(q.id);
            const authorColor = getAuthorColor(author);
            return `<tr data-id="${q.id}" title="Haz clic para abrir esta cotización"><td style="cursor:pointer;"><strong>${client}</strong><br><small>#${q.manualId} &bull; ${date}</small><br><small class="quote-author">Por: <span style="color: ${authorColor}; font-weight: 600;">${author}</span> &bull; ${createdTime}</small></td><td>${client}</td><td>${date}</td><td>${formatCurrency(total)}</td><td class="actions" style="white-space: nowrap;"><button class="btn btn-secondary edit-quote-btn" data-id="${q.id}" title="Editar Cotización"><i class="fas fa-edit"></i> Editar cotización</button> <button class="btn btn-primary create-order-btn" data-id="${q.id}" title="Crear Orden"><i class="fas fa-clipboard-check"></i> Crear orden</button><button class="btn btn-icon-only btn-danger delete-btn" data-id="${q.id}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`;
        }).join('');
    }
    D.savedQuotesPageContainer.innerHTML = html + `</tbody></table>`;
}

// --- UI Helpers ---
function createItemRow(item: QuoteItem | OrderItem): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.dataset.itemId = item.id;
    const formattedPrice = formatCurrency(item.price);
    const formattedTotal = formatCurrency(item.quantity * item.price);
    tr.innerHTML = `<td class="col-desc" data-label="Descripción"><textarea class="item-desc" rows="2">${item.description}</textarea><div class="item-desc-mobile-wrapper"><div class="item-desc-mobile-view"><span class="mobile-view-text">${item.description}</span><i class="fas fa-pencil-alt edit-indicator"></i></div><button class="btn btn-danger btn-icon-only delete-item-btn delete-item-btn-mobile" title="Eliminar ítem"><i class="fas fa-trash"></i></button></div></td><td class="col-qty" data-label="Cant."><input type="number" class="item-qty" value="${item.quantity}" min="0"><div class="item-value-mobile-view" data-field="quantity"><span class="mobile-view-text">${item.quantity}</span><i class="fas fa-pencil-alt edit-indicator"></i></div></td><td class="col-price" data-label="Vlr. Unitario"><input type="text" class="item-price" value="${formattedPrice}"><div class="item-value-mobile-view" data-field="price"><span class="mobile-view-text">${formattedPrice}</span><i class="fas fa-pencil-alt edit-indicator"></i></div></td><td class="col-total item-total" data-label="Vlr. Total">${formattedTotal}</td><td class="col-actions" data-label="Acción"><button class="btn btn-danger btn-icon-only delete-item-btn delete-item-btn-desktop"><i class="fas fa-trash"></i></button></td>`;
    const priceInput = tr.querySelector('.item-price') as HTMLInputElement;
    priceInput.addEventListener('input', () => { priceInput.value = formatCurrency(parseFloat(priceInput.value.replace(/[^0-9]+/g,"")) || 0); });
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
    const qty = parseFloat((row.querySelector('.item-qty') as HTMLInputElement).value) || 0;
    const price = parseFloat((row.querySelector('.item-price') as HTMLInputElement).value.replace(/[^0-9]+/g,"")) || 0;
    (row.querySelector('.item-total') as HTMLTableCellElement).textContent = formatCurrency(qty * price);
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
        } catch(e: any) {
            showNotification("Error al reiniciar la aplicación.", "error");
        }
    });
}

// --- Modal Logic ---
export function openDescriptionEditModal(itemId: string, context: 'quote'|'order') {
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
export function openValueEditModal(itemId: string, field: 'quantity'|'price', context: 'quote'|'order') {
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

export async function openEntityModal(type: 'client' | 'item' | 'technician', id: string | null = null) {
    D.modalForm.dataset.type = type;
    D.modalForm.dataset.id = id || '';
    let fieldsHtml = '', title = '';
    
    if (type === 'client') {
        const client = id ? State.getClients().find(c => c.id === id) : null;
        title = client ? 'Editar Cliente' : 'Nuevo Cliente';
        const manualId = client ? client.manualId : await getNextClientManualIdForUI();
        fieldsHtml = `<div class="form-group"><label>ID</label><input name="manualId" value="${manualId}" readonly></div><div class="form-group"><label>Nombre</label><input name="name" value="${client?.name||''}" required></div><div class="form-group"><label>Encargado</label><input name="contactPerson" value="${client?.contactPerson||''}"></div><div class="form-group"><label>Dirección</label><input name="address" value="${client?.address||''}"></div><div class="form-group"><label>Ciudad</label><input name="city" value="${client?.city||''}"></div><div class="form-group"><label>Teléfono</label><input name="phone" value="${client?.phone||''}"></div><div class="form-group"><label>Email</label><input name="email" type="email" value="${client?.email||''}"></div>`;
    } else if (type === 'item') {
        const item = id ? State.getItems().find(i => i.id === id) : null;
        title = item ? 'Editar Insumo' : 'Nuevo Insumo';
        const manualId = item ? item.manualId : await getNextItemManualIdForUI();
        fieldsHtml = `<div class="form-group"><label>Código</label><input name="manualId" value="${manualId}" readonly></div><div class="form-group"><label>Nombre</label><input name="name" value="${item?.name||''}" required></div><div class="form-group"><label>Precio</label><input name="price" type="number" step="any" value="${item?.price||0}" required></div>`;
    } else { // technician
        const tech = id ? State.getTechnicians().find(t => t.id === id) : null;
        title = tech ? 'Editar Técnico' : 'Nuevo Técnico';
        fieldsHtml = `<div class="form-group"><label>Nombre</label><input name="name" value="${tech?.name||''}" required></div><div class="form-group"><label>Cédula</label><input type="text" name="cedula" value="${tech?.cedula||''}" required></div><div class="form-group"><label class="switch-label" style="display:inline-block; margin-right: 10px;">Activo</label><label class="switch"><input type="checkbox" name="is_active" ${tech?.is_active ?? true ? 'checked' : ''}><span class="slider round"></span></label></div>`;
    }
    D.modalTitle.textContent = title;
    D.modalFieldsContainer.innerHTML = fieldsHtml;
    D.entityModal.classList.add('active');
}

export async function handleModalFormSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const type = form.dataset.type as 'client'|'item'|'technician';
    const id = form.dataset.id;
    const data = new FormData(form);
    
    const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;

    try {
        if (type === 'client') {
            const clientData: ClientInsert = { id: id || generateId(), manualId: data.get('manualId') as string, name: data.get('name') as string, contactPerson: data.get('contactPerson') as string || null, address: data.get('address') as string || null, city: data.get('city') as string || null, phone: data.get('phone') as string || null, email: data.get('email') as string || null };
            const saved = await API.upsertClient(clientData);
            State.setClients([...State.getClients().filter(c => c.id !== saved.id), saved]);
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

        } else if (type === 'item') {
            const itemData: ItemInsert = { id: id || generateId(), manualId: data.get('manualId') as string, name: data.get('name') as string, price: Number(data.get('price')) || 0 };
            const saved = await API.upsertItem(itemData);
            State.setItems([...State.getItems().filter(i => i.id !== saved.id), saved]);
            renderCatalogItemsList();
        } else { // technician
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
export function handleDeleteClient(id: string) {
    showConfirmationModal('Eliminar Cliente', '¿Desea eliminar este cliente?', async () => {
        try {
            await API.deleteClient(id);
            State.setClients(State.getClients().filter(c => c.id !== id));
            renderClientsList();
            showNotification('Cliente eliminado.', 'success');
        } catch(e: any) { showNotification('Error al eliminar el cliente.', 'error'); }
    });
}
export function handleDeleteItem(id: string) {
    showConfirmationModal('Eliminar Insumo', '¿Desea eliminar este insumo?', async () => {
        try {
            await API.deleteItem(id);
            State.setItems(State.getItems().filter(i => i.id !== id));
            renderCatalogItemsList();
            showNotification('Insumo eliminado.', 'success');
        } catch(e: any) { showNotification('Error al eliminar el insumo.', 'error'); }
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
    
    statusEl.classList.remove('offline');
    if (isOnline) {
        textEl.textContent = 'En línea';
    } else {
        statusEl.classList.add('offline');
        textEl.textContent = 'Sin conexión';
    }
    
    // Disable/Enable buttons based on online status
    const buttons = document.querySelectorAll<HTMLButtonElement>('#save-quote-btn, #save-order-btn, #delete-current-quote-btn, #generate-pdf-btn, #generate-order-pdf-btn, #backup-btn, #reset-app-btn, .edit-btn, .delete-btn');
    buttons.forEach(btn => { if (btn) btn.disabled = !isOnline; });
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
        return order.manualId.toLowerCase().includes(term) || client?.name.toLowerCase().includes(term);
    });

    const statusText = { pending: 'Pendiente', scheduled: 'Programada', in_progress: 'En Progreso', completed: 'Completada', cancelled: 'Cancelada' };
    
    let html = `<table class="management-table orders-table"><thead><tr><th class="desktop-cell">ID</th><th class="desktop-cell">Cliente</th><th class="desktop-cell">Fecha de Servicio</th><th class="desktop-cell">Hora</th><th class="desktop-cell">Duración</th><th class="desktop-cell">Técnicos</th><th class="desktop-cell">Estado</th><th class="desktop-cell actions">Acciones</th><th class="order-card-cell"></th></tr></thead><tbody>`;
    if (filteredOrders.length === 0) {
        html += `<tr><td colspan="9" style="text-align:center;padding:20px;">No se encontraron órdenes.</td></tr>`;
    } else {
        html += filteredOrders.sort((a,b) => parseInt(b.manualId) - parseInt(a.manualId)).map(order => {
            const client = State.getClients().find(c => c.id === order.clientId);
            const technicians = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));
            const serviceDate = new Date(order.service_date.replace(/-/g, '/')).toLocaleDateString('es-CO');
            const duration = order.estimated_duration ? `${order.estimated_duration.toFixed(1)}h` : '-';
            const author = State.getOrderAuthor(order.id);
            const createdAt = formatCreatedDateTime(order.created_at);
            
            return `
                <tr>
                    <td class="desktop-cell">${order.manualId}</td>
                    <td class="desktop-cell"><strong>${client?.name || 'N/A'}</strong><br><small class="order-author">Creada por: <span style="color: ${getAuthorColor(author)}; font-weight: 500;">${author}</span> &bull; ${createdAt}</small></td>
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
                            <div class="card-subtitle">${client?.name || 'N/A'}<br><small class="order-author">Creada por: <span style="color: ${getAuthorColor(author)}; font-weight: 500;">${author}</span> &bull; ${createdAt}</small></div>
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
            results.innerHTML = quotes.map(q => `<div class="search-result-item" data-id="${q.id}"><span class="item-code">[#${q.manualId}]</span> ${State.getClients().find(c=>c.id===q.clientId)?.name}</div>`).join('');
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

export async function navigateToOrderWorkspace(orderId: string | null, fromQuoteId: string | null = null) {
    let order: Order | null;
    if (orderId) {
        order = State.getOrders().find(o => o.id === orderId) || null;
        if (order) order = JSON.parse(JSON.stringify(order)); // Deep copy
    } else {
        const manualId = await getNextOrderManualId();
        order = {
            id: generateId(),
            created_at: new Date().toISOString(),
            manualId: manualId,
            quoteId: null,
            clientId: '',
            status: 'pending',
            service_date: '',
            service_time: null,
            order_type: '',
            notes: '',
            items: [],
            technicianIds: [NO_ASIGNADO_TECHNICIAN_ID],
            taxRate: State.getDefaultVatRate(),
            estimated_duration: 0,
        };

        if (fromQuoteId) {
            const quote = State.getQuotes().find(q => q.id === fromQuoteId);
            if (quote) {
                order.quoteId = quote.id;
                order.clientId = quote.clientId || '';
                order.items = quote.items.map(qi => ({
                    id: generateId(),
                    orderId: order!.id,
                    itemId: qi.itemId,
                    manualId: qi.manualId,
                    description: qi.description,
                    quantity: qi.quantity,
                    price: qi.price,
                    created_at: new Date().toISOString()
                }));
            }
        }
    }
    
    State.setCurrentOrder(order);
    renderOrderWorkspace(order);
    navigateTo('page-order-workspace');
}

export function renderOrderWorkspace(order: Order | null) {
    if (!order) {
        // This is a defensive cleanup. If renderOrderWorkspace is ever called
        // with a null order, it ensures the UI is reset to a clean state.
        cleanupOrderWorkspace();
        return;
    }
    
    D.orderWorkspaceTitle.textContent = order.manualId ? `Editar Orden #${order.manualId}` : 'Nueva Orden de Servicio';

    const client = State.getClients().find(c => c.id === order.clientId);
    D.orderClientSearchInput.value = client ? `[${client.manualId}] ${client.name}` : '';
    renderClientDetails(order.clientId, 'order');
    D.orderEditClientBtn.style.display = order.clientId ? 'inline-flex' : 'none';
    D.orderClientCityInput.value = client?.city || '';

    (D.orderDateInput as any)._flatpickr.setDate(order.service_date, false);
    D.orderTimeInput.value = order.service_time || '';
    const optionExists = Array.from(D.orderTypeSelect.options).some(opt => opt.value === order.order_type) && order.order_type !== 'Otro';
    if (order.order_type && !optionExists) {
        D.orderTypeSelect.value = 'Otro';
        D.orderTypeCustomInput.value = order.order_type;
        D.orderTypeCustomInput.style.display = 'block';
        D.orderTypeCustomInput.required = true;
    } else {
        D.orderTypeSelect.value = order.order_type || '';
        D.orderTypeCustomInput.value = '';
        D.orderTypeCustomInput.style.display = 'none';
        D.orderTypeCustomInput.required = false;
    }
    D.orderStatusSelect.value = order.status;
    D.orderNotesTextarea.value = order.notes || '';
    
    const hours = Math.floor(order.estimated_duration || 0);
    const minutes = Math.round(((order.estimated_duration || 0) - hours) * 60);
    D.orderDurationHoursInput.value = String(hours);
    D.orderDurationMinutesInput.value = String(minutes);

    renderTechnicianPills(order.technicianIds);
    D.orderItemsTableBody.innerHTML = '';
    order.items.forEach(item => D.orderItemsTableBody.appendChild(createItemRow(item)));

    updateOrderSummary();
}

export function handleRemoveItemFromOrder(itemId: string) {
    const order = State.getCurrentOrder();
    if (!order) return;
    order.items = order.items.filter(i => i.id !== itemId);
    renderOrderWorkspace(order);
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
    
    // Logic to update client's city if it's not set
    const client = State.getClients().find(c => c.id === order.clientId);
    if (client && !client.city && cityFromInput) {
        try {
            const updatedClientData = { ...client, city: cityFromInput };
            const savedClient = await API.upsertClient(updatedClientData);
            // Update client in local state
            State.setClients([...State.getClients().filter(c => c.id !== savedClient.id), savedClient]);
            showNotification(`Ciudad '${cityFromInput}' guardada para el cliente ${client.name}.`, 'info');
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
            const savedOrder = await API.saveOrder(order);
            State.setOrders([...State.getOrders().filter(o => o.id !== savedOrder.id), savedOrder]);
            State.setCurrentOrder(savedOrder);
            if (isNewOrder) {
                const authorName = getSessionUser().name || 'Admin';
                await State.setOrderAuthor(savedOrder.id, authorName);
            }
            renderOrderWorkspace(savedOrder);
            renderAgendaPage(); // Update agenda after saving
            showNotification(`Orden #${savedOrder.manualId} guardada.`, 'success');
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
        } catch(e: any) {
            showNotification('Error al eliminar la orden.', 'error');
        }
    });
}

export function updateOrderSummary() {
    const order = State.getCurrentOrder();
    if (!order) {
        // If no current order (e.g., after cleanup), reset the summary fields to zero.
        D.orderSummarySubtotal.textContent = formatCurrency(0);
        D.orderSummaryTaxAmount.textContent = formatCurrency(0);
        D.orderSummaryTotal.textContent = formatCurrency(0);
        return;
    }
    const subtotal = order.items.reduce((s, i) => s + (i.quantity * i.price), 0);
    const tax = subtotal * (order.taxRate / 100);
    D.orderSummarySubtotal.textContent = formatCurrency(subtotal);
    D.orderSummaryTaxAmount.textContent = formatCurrency(tax);
    // FIX: The `total` variable was not defined. Calculate from subtotal and tax.
    D.orderSummaryTotal.textContent = formatCurrency(subtotal + tax);
}

export function handleOrderVatToggle() {
    const order = State.getCurrentOrder();
    if (!order) return;
    order.taxRate = D.orderVatToggleSwitch.checked ? State.getDefaultVatRate() : 0;
    updateOrderSummary();
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
        orderItem.price = parseFloat(target.value.replace(/[^0-9]+/g,"")) || 0;
    } else if (target.matches('.item-desc')) {
        orderItem.description = target.value;
    }
    
    updateOrderSummary();
    updateItemRowTotal(row);
}

export function handleOrderDetailsChange() {
    const order = State.getCurrentOrder();
    if (!order) return;
    if (D.orderTypeSelect.value === 'Otro') {
        D.orderTypeCustomInput.style.display = 'block';
        D.orderTypeCustomInput.required = true;
        order.order_type = D.orderTypeCustomInput.value as any;
    } else {
        D.orderTypeCustomInput.style.display = 'none';
        D.orderTypeCustomInput.required = false;
        order.order_type = D.orderTypeSelect.value as any;
    }
    order.status = D.orderStatusSelect.value as Order['status'];
    order.notes = D.orderNotesTextarea.value;
    order.service_date = (D.orderDateInput as any)._flatpickr.input.value;
    order.service_time = D.orderTimeInput.value || null; // Ensure empty string becomes null
    const hours = parseFloat(D.orderDurationHoursInput.value) || 0;
    const minutes = parseFloat(D.orderDurationMinutesInput.value) || 0;
    order.estimated_duration = hours + (minutes / 60);
    validateTechnicianAssignments();
    if (D.technicianSelector.classList.contains('open')) renderTechnicianDropdown();
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
        } catch(e: any) { showNotification('Error al eliminar el técnico.', 'error'); }
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
            if(conflict) pill.classList.add('conflict');
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

function getServiceTypeStyle(type: string | undefined): string {
    if (!type) return '';
    const lowerType = type.toLowerCase();
    let color = 'var(--color-text-secondary)';
    if (lowerType.includes('preventivo')) {
        color = '#007bff'; // blue
    } else if (lowerType.includes('montaje') || lowerType.includes('instalación')) {
        color = '#fd7e14'; // orange
    } else {
        color = 'var(--color-accent-primary)'; // teal (default, neither red nor green)
    }
    return `color: ${color}; text-decoration: underline; font-style: italic;`;
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

export function handleAgendaViewChange(view: 'month' | 'week' | 'day') {
    State.setAgendaView(view);
    if(D.agendaViewSwitcher) {
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
    today.setHours(0,0,0,0);

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

        html += `<div class="calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${busyClass}">`;
        html += `<div class="day-number">${currentDay.getDate()}</div>`;
        html += `<div class="day-orders">`;
        dailyOrders.forEach(order => {
            const client = State.getClients().find(c => c.id === order.clientId);
            const serviceTypeStyle = getServiceTypeStyle(order.order_type);
            const serviceType = order.order_type ? `<span style="${serviceTypeStyle}">(${order.order_type.substring(0, 10)})</span>` : '';
            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const techWarningIcon = needsTech ? `<i class="fas fa-user-slash" style="color: var(--color-warning); margin-right: 3px;" title="Sin técnico asignado"></i>` : '';
            
            const addressParts = [client?.address, client?.city].filter(Boolean);
            const addressString = addressParts.length > 0 ? addressParts.join(' - ') : 'Sin dirección';
            const pillTitle = `#${order.manualId} - ${client?.name}\n${addressString}\nTipo: ${order.order_type}`;
            const formattedTime = formatTime(order.service_time) || '';

            html += `<div class="agenda-order-pill status-${order.status}" data-order-id="${order.id}" title="${pillTitle}">${techWarningIcon}${formattedTime} ${client?.name?.split(' ')[0] || ''} ${serviceType}</div>`;
        });
        html += `</div></div>`;

        currentDay.setDate(currentDay.getDate() + 1);
        if (i > 27 && currentDay.getMonth() !== month && currentDay.getDay() === 0) break; // Stop after 5 or 6 weeks if next week is entirely in next month
    }
    
    D.agendaContainer.innerHTML = html;

    D.agendaContainer.querySelectorAll('.agenda-order-pill').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) openAgendaEditOrderModal(orderId);
        });
    });
}


function renderTimelineView(days: Date[]) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const startHour = 7;
    const endHour = 20;
    const orders = State.getOrders();

    let headerHtml = `<div class="time-gutter header-gutter"></div>`;
    let bodyHtml = `<div class="time-gutter">`;
    for(let h = startHour; h <= endHour; h++) {
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
            const serviceTypeStyle = getServiceTypeStyle(order.order_type);
            const serviceType = order.order_type ? `<span style="${serviceTypeStyle}">(${order.order_type.substring(0, 10)})</span>` : '';
            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const techWarningIcon = needsTech ? `<i class="fas fa-user-slash" style="color: var(--color-warning); margin-right: 3px;" title="Sin técnico asignado"></i>` : '';
            
            const addressParts = [client?.address, client?.city].filter(Boolean);
            const addressString = addressParts.length > 0 ? addressParts.join(' - ') : 'Sin dirección';
            const pillTitle = `#${order.manualId} - ${client?.name}\n${addressString}\nTipo: ${order.order_type}`;
            const formattedTime = formatTime(order.service_time) || '';

            allDayHtml += `<div class="agenda-order-pill status-${order.status}" data-order-id="${order.id}" title="${pillTitle}">${techWarningIcon}${formattedTime} ${client?.name?.split(' ')[0] || ''} ${serviceType}</div>`;
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
            const techs = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));
            const formattedTime = formatTime(order.service_time);
            
            const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
            const techWarningIcon = needsTech ? `<i class="fas fa-user-slash" style="color: var(--color-warning);" title="Sin técnico asignado"></i> ` : '';
            
            const addressParts = [client?.address, client?.city].filter(Boolean);
            const addressString = addressParts.join(' - ');
            const addressHtml = addressString ? `<span class="event-address">${addressString}</span>` : '';


            timedOrdersHtml += `<div class="order-event status-${order.status}" style="top: ${top}px; height: ${height}px; left: ${left}%; width: calc(${width}% - 2px);" data-order-id="${order.id}">
                <strong class="event-title">${techWarningIcon}${client?.name || 'Cliente'}</strong>
                ${addressHtml}
                <span class="event-time">${formattedTime} - #${order.manualId}</span>
                <span class="event-type" style="${getServiceTypeStyle(order.order_type)}">${order.order_type}</span>
                <em class="event-techs">${techs.map(t => t.name?.split(' ')[0]).join(', ')}</em>
            </div>`;
        });
        dayColumnsHtml += `<div class="day-column" style="min-width: ${dayColumnMinWidth}px;">${timedOrdersHtml}</div>`;
    });

    let hourLinesHtml = '';
    for(let h = startHour; h <= endHour; h++) {
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
    const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    let html = '<div class="list-week-view">';

    weekDays.forEach(day => {
        const dateString = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        const dailyOrders = orders
            .filter(o => o.service_date && o.service_date.startsWith(dateString))
            .sort((a, b) => (a.service_time || '00:00').localeCompare(b.service_time || '00:00'));

        const isToday = day.getTime() === today.getTime();
        const numOrders = dailyOrders.length;
        
        // --- Day Saturation Logic ---
        let saturationClass = '';
        let saturationLabel = '';
        if (numOrders >= 7) {
            saturationClass = 'day-saturated-heavy';
            saturationLabel = ' <span class="saturation-label" style="font-size: 0.8rem; font-weight: 500; color: #dc3545; margin-left: 10px; background-color: rgba(220,53,69,0.1); padding: 2px 8px; border-radius: 12px; border: 1px solid rgba(220,53,69,0.2);">Día saturado</span>';
        } else if (numOrders >= 3) {
            saturationClass = 'day-saturated-medium';
        }

        html += `
            <div class="day-section ${saturationClass}">
                <div class="day-header ${isToday ? 'today' : ''}">
                    ${dayNames[day.getDay()]} ${day.getDate()}${saturationLabel}
                </div>
                <div class="day-orders-list">
        `;

        if (dailyOrders.length > 0) {
            dailyOrders.forEach(order => {
                const client = State.getClients().find(c => c.id === order.clientId);
                const techs = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));
                const formattedTime = formatTime(order.service_time);
                const needsTech = order.technicianIds.length === 0 || (order.technicianIds.length === 1 && order.technicianIds[0] === NO_ASIGNADO_TECHNICIAN_ID);
                const techWarningIcon = needsTech ? ` <i class="fas fa-user-slash" style="color: var(--color-warning);" title="Sin técnico asignado"></i>` : '';
                
                const addressParts = [client?.address, client?.city].filter(Boolean);
                const addressString = addressParts.join(' - ');
                const addressHtml = addressString ? `<div class="order-address-mobile"><i class="fas fa-map-marker-alt"></i> ${addressString}</div>` : '';

                let pillsHtml = '';
                const displayTechs = techs.filter(t => t.id !== NO_ASIGNADO_TECHNICIAN_ID);
                if (displayTechs.length > 0) {
                    pillsHtml = `<span style="font-size: 0.9rem; font-weight: 500; color: #10b981;">${displayTechs.map(t => t.name?.split(' ')[0]).join(', ')}</span>`;
                } else {
                    pillsHtml = `<span style="font-size: 0.9rem; font-weight: 500; color: var(--color-text-light);">No asignado</span>`;
                }

                html += `
                    <div class="order-item order-item-two-col" data-order-id="${order.id}" style="display: flex; justify-content: space-between; align-items: flex-start; cursor: default;">
                        <div class="order-item-main" style="display: flex; gap: 15px; flex-grow: 1;">
                            <div class="order-status-dot status-${order.status}"></div>
                            <div class="order-time">${formattedTime || 'Todo Día'}</div>
                            <div class="order-details" style="flex-grow: 1;">
                                <div class="order-client">${client?.name || 'Cliente'} (#${order.manualId})${techWarningIcon}</div>
                                ${addressHtml}
                                <div class="order-type-mobile" style="${getServiceTypeStyle(order.order_type)}">${order.order_type}</div>
                                
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
                        <div class="order-item-actions" style="margin-left: auto; padding-left: 15px;">
                            <!-- White button fix -->
                            <button class="btn edit-order-btn" data-order-id="${order.id}" style="background-color: white; border: 1px solid var(--color-border); color: var(--color-text); padding: 5px 10px; font-size: 0.9rem;">
                                <i class="fas fa-edit" style="pointer-events:none; color: var(--color-primary);"></i> Editar
                            </button>
                        </div>
                    </div>
                `;
            });
        } else {
            html += '<div class="no-orders-msg">No hay servicios programados.</div>';
        }

        html += `</div></div>`;
    });

    html += '</div>';

    D.agendaContainer.innerHTML = html;

    D.agendaContainer.querySelectorAll('.edit-order-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            const orderId = (e.currentTarget as HTMLElement).dataset.orderId;
            if (orderId) openAgendaEditOrderModal(orderId);
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
    date.setHours(0,0,0,0);
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

    const visibleTechnicians = State.getTechnicians().filter(t => t.is_active && t.role !== 'admin');

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
            
            // Re-render UI locally for instant feedback
            openAgendaTechDropdown(orderId, triggerEl, true);
            
            // Auto-save logic
            const savedOrder = await API.saveOrder(order);
            const orders = [...State.getOrders()];
            const idx = orders.findIndex(o => o.id === savedOrder.id);
            if (idx !== -1) orders[idx] = savedOrder;
            State.setOrders(orders);
            
            // Re-render the list week view after state update
            renderListWeekView();
        });
    });

    // Positioning
    const rect = triggerEl.getBoundingClientRect();
    dropdown.style.display = 'block';
    dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
    dropdown.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;
    
    // Auto-close logic
    const activeDoc = document as any;
    const closeDropdown = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node) && !triggerEl.contains(e.target as Node)) {
            dropdown.style.display = 'none';
            document.removeEventListener('click', closeDropdown);
            activeDoc._agendaClickHandler = null;
        }
    };
    
    // Remove past listeners and add new one
    activeDoc._agendaClickHandler && document.removeEventListener('click', activeDoc._agendaClickHandler);
    activeDoc._agendaClickHandler = closeDropdown;
    
    setTimeout(() => {
        document.addEventListener('click', closeDropdown);
    }, 10);
}


export function openAgendaEditOrderModal(orderId: string) {
    const order = State.getOrders().find(o => o.id === orderId);
    if (!order) return;

    const modal = document.getElementById('agenda-edit-order-modal') as HTMLElement;
    if (!modal) return;
    
    // Fill client data
    const client = State.getClients().find(c => c.id === order.clientId);
    if (client) {
        (document.getElementById('agenda-edit-client-name') as HTMLInputElement).value = client.name || '';
        (document.getElementById('agenda-edit-client-phone') as HTMLInputElement).value = client.phone || '';
        (document.getElementById('agenda-edit-client-city') as HTMLInputElement).value = client.city || '';
        (document.getElementById('agenda-edit-client-address') as HTMLInputElement).value = client.address || '';
    }

    // Fill data
    (document.getElementById('agenda-edit-order-id') as HTMLInputElement).value = order.id;
    (document.getElementById('agenda-edit-service-date') as HTMLInputElement).value = order.service_date;
    (document.getElementById('agenda-edit-service-time') as HTMLInputElement).value = order.service_time || '';
    (document.getElementById('agenda-edit-status') as HTMLSelectElement).value = order.status;
    (document.getElementById('agenda-edit-duration') as HTMLInputElement).value = order.estimated_duration ? order.estimated_duration.toString() : '';
    (document.getElementById('agenda-edit-notes') as HTMLTextAreaElement).value = order.notes || '';

    // Populate service type options from DB
    const serviceTypeSelect = document.getElementById('agenda-edit-type') as HTMLSelectElement;
    serviceTypeSelect.innerHTML = State.getServiceTypes().map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    
    // Find matching option (fuzzy/exact match)
    const options = Array.from(serviceTypeSelect.options);
    const targetType = (order.order_type || '').trim().toLowerCase();
    const matchingOption = options.find(opt => opt.value.trim().toLowerCase() === targetType);
    if (matchingOption) {
        serviceTypeSelect.value = matchingOption.value;
    } else if (order.order_type) {
        serviceTypeSelect.insertAdjacentHTML('beforeend', `<option value="${order.order_type}">${order.order_type} (Personalizado)</option>`);
        serviceTypeSelect.value = order.order_type;
    }

    // Clone form to clear previous listeners
    const form = document.getElementById('agenda-edit-order-form') as HTMLFormElement;
    const newForm = form.cloneNode(true) as HTMLFormElement;
    form.parentNode?.replaceChild(newForm, form);

    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Update client info if it was changed
        let clientUpdated = false;
        if (client) {
            const newClientName = (document.getElementById('agenda-edit-client-name') as HTMLInputElement).value;
            const newClientPhone = (document.getElementById('agenda-edit-client-phone') as HTMLInputElement).value;
            const newClientCity = (document.getElementById('agenda-edit-client-city') as HTMLInputElement).value;
            const newClientAddress = (document.getElementById('agenda-edit-client-address') as HTMLInputElement).value;
            
            if (client.name !== newClientName || client.phone !== newClientPhone || client.city !== newClientCity || client.address !== newClientAddress) {
                const updatedClient = {
                    ...client,
                    name: newClientName,
                    phone: newClientPhone,
                    city: newClientCity,
                    address: newClientAddress
                };
                try {
                    const savedClient = await API.upsertClient(updatedClient);
                    const clients = [...State.getClients()];
                    const cIdx = clients.findIndex(c => c.id === savedClient.id);
                    if (cIdx !== -1) clients[cIdx] = savedClient;
                    State.setClients(clients);
                    clientUpdated = true;
                } catch(err) {
                    console.error("Error saving client update", err);
                }
            }
        }

        const newDate = (document.getElementById('agenda-edit-service-date') as HTMLInputElement).value;
        const newTime = (document.getElementById('agenda-edit-service-time') as HTMLInputElement).value || null;
        const newStatus = (document.getElementById('agenda-edit-status') as HTMLSelectElement).value as any;
        const durationStr = (document.getElementById('agenda-edit-duration') as HTMLInputElement).value;
        const newDuration = durationStr ? parseFloat(durationStr) : null;
        const newType = (document.getElementById('agenda-edit-type') as HTMLSelectElement).value;
        const newNotes = (document.getElementById('agenda-edit-notes') as HTMLTextAreaElement).value;
        
        const updatedOrder = {
            ...order,
            service_date: newDate,
            service_time: newTime,
            status: newStatus,
            estimated_duration: newDuration,
            order_type: newType,
            notes: newNotes
        };

        const savedOrder = await API.saveOrder(updatedOrder);
        const orders = [...State.getOrders()];
        const idx = orders.findIndex(o => o.id === savedOrder.id);
        if (idx !== -1) orders[idx] = savedOrder;
        State.setOrders(orders);
        
        modal.style.display = 'none';
        
        renderAgendaPage();
        const msg = clientUpdated ? `Orden #${order.manualId} y Cliente actualizados` : `Orden #${order.manualId} actualizada correctamente`;
        showNotification(msg, 'success');
    });

    document.getElementById('agenda-edit-full-workspace-btn')?.addEventListener('click', () => {
        modal.style.display = 'none';
        navigateToOrderWorkspace(order.id, null);
    });

    modal.style.display = 'flex';
}





