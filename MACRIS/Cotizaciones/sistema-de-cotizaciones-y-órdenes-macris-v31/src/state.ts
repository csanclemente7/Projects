import { jsPDF } from 'jspdf';
import type { Item, Client, Quote, PdfTemplate, Order, Technician, ServiceType, Sede } from './types';
import * as API from './api';
import { getQuoteAuthors as fetchQuoteAuthors, getOrderAuthors as fetchOrderAuthors, saveQuoteAuthors, saveOrderAuthors } from './user-data';

// --- Default Texts ---
const DEFAULT_COMPANY_NAME = 'Macris Refrigeración Y Climatización';
const DEFAULT_COMPANY_ADDRESS_1 = 'Calle 9 # 13 - 71';
const DEFAULT_COMPANY_ADDRESS_2 = 'Buga Valle Del Cauca';
const DEFAULT_COMPANY_WEBSITE = 'www.macrisrefrigeracion.com';
const DEFAULT_COMPANY_PHONE = 'Celular: 3167721984';
const DEFAULT_COMPANY_EMAIL = 'E-mail: w.sanclemente@hotmail.com';

const DEFAULT_TERMS_WITHOUT_VAT = `Un año de garantía en instalación de aires acondicionados nuevos.
Insumos que se ahorren se descuenta del valor a cobrar.
Esta cotización NO incluye IVA.
Validez de la oferta: 15 días`;

const DEFAULT_TERMS_WITH_VAT = `Un año de garantía en instalación de aires acondicionados nuevos.
Insumos que se ahorren se descuenta del valor a cobrar.
Esta cotización incluye IVA.
Validez de la oferta: 15 días`;
    
const DEFAULT_PDF_FOOTER = `Si usted tiene alguna pregunta sobre esta cotización, por favor, contáctenos\n\nGracias por hacer negocios con nosotros!`;


// --- State Variables ---
let items: Item[] = [];
let clients: Client[] = [];
let quotes: Quote[] = [];
let orders: Order[] = [];
let technicians: Technician[] = [];
let serviceTypes: ServiceType[] = [];
let sedes: Sede[] = [];
let openQuotes: Quote[] = [];
let activeQuoteId: string | null = null;
let currentOrder: Order | null = null; // For the order workspace
let filteredCatalogItems: Item[] = [];
let activePdfTemplate: PdfTemplate = 'modern';
let defaultVatRate: number = 19;

// Company & PDF Text Settings
let companyName: string = DEFAULT_COMPANY_NAME;
let companyAddress1: string = DEFAULT_COMPANY_ADDRESS_1;
let companyAddress2: string = DEFAULT_COMPANY_ADDRESS_2;
let companyWebsite: string = DEFAULT_COMPANY_WEBSITE;
let companyPhone: string = DEFAULT_COMPANY_PHONE;
let companyEmail: string = DEFAULT_COMPANY_EMAIL;
let quoteTermsNoVat: string = DEFAULT_TERMS_WITHOUT_VAT;
let quoteTermsWithVat: string = DEFAULT_TERMS_WITH_VAT;
let pdfFooterText: string = DEFAULT_PDF_FOOTER;

let currentPdfDocForDownload: jsPDF | null = null;
let currentPdfFileName: string | null = null;
let pdfOutputPreference: 'preview' | 'download' = 'preview';
let agendaDate: Date = new Date();
let agendaView: 'month' | 'week' | 'day' = 'week';
let activeOrderTab: 'pending' | 'completed' = 'pending';
let quoteAuthors: Record<string, string> = {};
let orderAuthors: Record<string, string> = {};

// --- LocalStorage Keys for Session Persistence ---
const OPEN_QUOTES_KEY = 'macris_session_open_quotes';
const ACTIVE_QUOTE_ID_KEY = 'macris_session_active_quote_id';

// --- Private Session Management ---
function saveSessionState() {
    try {
        localStorage.setItem(OPEN_QUOTES_KEY, JSON.stringify(openQuotes));
        localStorage.setItem(ACTIVE_QUOTE_ID_KEY, activeQuoteId || '');
    } catch (e) {
        console.error("Error saving session state to localStorage", e);
    }
}


// --- Getters ---
export const getItems = () => items;
export const getClients = () => clients;
export const getQuotes = () => quotes;
export const getOrders = () => orders;
export const getTechnicians = () => technicians;
export const getServiceTypes = () => serviceTypes;
export const getSedes = () => sedes;
export const getOpenQuotes = () => openQuotes;
export const getActiveQuoteId = () => activeQuoteId;
export const getActiveQuote = (): Quote | null => {
    if (!activeQuoteId) return null;
    return openQuotes.find(q => q.id === activeQuoteId) || null;
};
export const getCurrentOrder = () => currentOrder;
export const getFilteredCatalogItems = () => filteredCatalogItems;
export const getActivePdfTemplate = () => activePdfTemplate;
export const getDefaultVatRate = () => defaultVatRate;

// Company & PDF Text Getters
export const getCompanyName = () => companyName;
export const getCompanyAddress1 = () => companyAddress1;
export const getCompanyAddress2 = () => companyAddress2;
export const getCompanyWebsite = () => companyWebsite;
export const getCompanyPhone = () => companyPhone;
export const getCompanyEmail = () => companyEmail;
export const getQuoteTermsNoVat = () => quoteTermsNoVat;
export const getQuoteTermsWithVat = () => quoteTermsWithVat;
export const getPdfFooterText = () => pdfFooterText;

export const getCurrentPdfDocForDownload = () => currentPdfDocForDownload;
export const getCurrentPdfFileName = () => currentPdfFileName;
export const getPdfOutputPreference = () => pdfOutputPreference;
export const getAgendaDate = () => agendaDate;
export const getAgendaView = () => agendaView;
export const getActiveOrderTab = () => activeOrderTab;
export const getQuoteAuthor = (quoteId: string) => quoteAuthors[quoteId] || 'Admin';
export const getQuoteAuthors = () => quoteAuthors;
export const getOrderAuthor = (orderId: string) => orderAuthors[orderId] || 'Admin';
export const getOrderAuthors = () => orderAuthors;


// --- Setters & Updaters ---
export function setItems(newItems: Item[]) {
    items = newItems;
}

export function setClients(newClients: Client[]) {
    clients = newClients;
}

export function setQuotes(newQuotes: Quote[]) {
    quotes = newQuotes;
}

export function setOrders(newOrders: Order[]) {
    orders = newOrders;
}

export function setTechnicians(newTechnicians: Technician[]) {
    technicians = newTechnicians;
}

export function setServiceTypes(newServiceTypes: ServiceType[]) {
    serviceTypes = newServiceTypes;
}

export function setSedes(newSedes: Sede[]) {
    sedes = newSedes;
}

export function addOpenQuote(quote: Quote) {
    if (!openQuotes.some(q => q.id === quote.id)) {
        openQuotes.push(quote);
        saveSessionState();
    }
}

export function removeOpenQuote(quoteId: string) {
    openQuotes = openQuotes.filter(q => q.id !== quoteId);
    saveSessionState();
}

export function setOpenQuotes(newOpenQuotes: Quote[]) {
    openQuotes = newOpenQuotes;
    saveSessionState();
}

export function setActiveQuoteId(quoteId: string | null) {
    activeQuoteId = quoteId;
    saveSessionState();
}

export function setCurrentOrder(order: Order | null) {
    currentOrder = order;
}

export function setAgendaDate(newDate: Date) {
    agendaDate = newDate;
}

export function setAgendaView(view: 'month' | 'week' | 'day') {
    agendaView = view;
}

export function setActiveOrderTab(tab: 'pending' | 'completed') {
    activeOrderTab = tab;
}

export function setQuoteAuthors(newAuthors: Record<string, string>) {
    quoteAuthors = newAuthors;
}

export async function setQuoteAuthor(quoteId: string, author: string) {
    if (!quoteId || !author || quoteAuthors[quoteId]) return;
    
    quoteAuthors[quoteId] = author;
    try {
        const latestAuthors = await fetchQuoteAuthors();
        latestAuthors[quoteId] = author;
        Object.assign(quoteAuthors, latestAuthors);
        await saveQuoteAuthors(latestAuthors);
    } catch (error) {
        console.error('Failed to save quote author map:', error);
    }
}

export function setOrderAuthors(newAuthors: Record<string, string>) {
    orderAuthors = newAuthors;
}

export async function setOrderAuthor(orderId: string, author: string) {
    if (!orderId || !author || orderAuthors[orderId]) return;
    
    orderAuthors[orderId] = author;
    try {
        const latestAuthors = await fetchOrderAuthors();
        latestAuthors[orderId] = author;
        Object.assign(orderAuthors, latestAuthors);
        await saveOrderAuthors(latestAuthors);
    } catch (error) {
        console.error('Failed to save order author map:', error);
    }
}


export async function setActivePdfTemplate(template: PdfTemplate) {
    activePdfTemplate = template;
    try {
        await API.setSetting('pdf_template', template);
    } catch (e: any) {
        console.error("Failed to save PDF template setting:", e.message || e);
    }
}

export function setInternalPdfTemplate(template: PdfTemplate) {
    activePdfTemplate = template;
}

export async function setDefaultVatRate(rate: number) {
    defaultVatRate = rate;
    try {
        await API.setSetting('vat_rate', String(rate));
    } catch (e: any) {
        console.error("Failed to save VAT rate setting:", e.message || e);
    }
}

export function setInternalDefaultVatRate(rate: number) {
    defaultVatRate = rate;
}

// --- Setters for Company and PDF Text (with DB persistence) ---
async function _setAndPersistSetting(key: string, value: string, stateUpdater: (val: string) => void) {
    stateUpdater(value);
    try {
        await API.setSetting(key, value);
    } catch (e: any) {
        console.error(`Failed to save setting "${key}":`, e.message || e);
        throw e; // Re-throw to be caught by UI
    }
}

export const setCompanyName = (name: string) => _setAndPersistSetting('company_name', name, val => companyName = val);
export const setCompanyAddress1 = (address: string) => _setAndPersistSetting('company_address1', address, val => companyAddress1 = val);
export const setCompanyAddress2 = (address: string) => _setAndPersistSetting('company_address2', address, val => companyAddress2 = val);
export const setCompanyWebsite = (website: string) => _setAndPersistSetting('company_website', website, val => companyWebsite = val);
export const setCompanyPhone = (phone: string) => _setAndPersistSetting('company_phone', phone, val => companyPhone = val);
export const setCompanyEmail = (email: string) => _setAndPersistSetting('company_email', email, val => companyEmail = val);
export const setQuoteTermsNoVat = (terms: string) => _setAndPersistSetting('quote_terms_no_vat', terms, val => quoteTermsNoVat = val);
export const setQuoteTermsWithVat = (terms: string) => _setAndPersistSetting('quote_terms_with_vat', terms, val => quoteTermsWithVat = val);
export const setPdfFooterText = (text: string) => _setAndPersistSetting('pdf_footer_text', text, val => pdfFooterText = val);

// --- Internal Setters (for initial load, no DB write) ---
export const setInternalCompanyName = (name: string) => companyName = name;
export const setInternalCompanyAddress1 = (address: string) => companyAddress1 = address;
export const setInternalCompanyAddress2 = (address: string) => companyAddress2 = address;
export const setInternalCompanyWebsite = (website: string) => companyWebsite = website;
export const setInternalCompanyPhone = (phone: string) => companyPhone = phone;
export const setInternalCompanyEmail = (email: string) => companyEmail = email;
export const setInternalQuoteTermsNoVat = (terms: string) => quoteTermsNoVat = terms;
export const setInternalQuoteTermsWithVat = (terms: string) => quoteTermsWithVat = terms;
export const setInternalPdfFooterText = (text: string) => pdfFooterText = text;


export function setCurrentPdfDocForDownload(doc: jsPDF | null) {
    currentPdfDocForDownload = doc;
};

export function setCurrentPdfFileName(fileName: string | null) {
    currentPdfFileName = fileName;
}

export async function setPdfOutputPreference(preference: 'preview' | 'download') {
    pdfOutputPreference = preference;
    try {
        await API.setSetting('pdf_output_preference', preference);
    } catch (e: any) {
        console.error("Failed to save PDF output preference setting:", e.message || e);
    }
}

export function setInternalPdfOutputPreference(preference: 'preview' | 'download') {
    pdfOutputPreference = preference;
}


export function updateActiveQuote(updatedQuote: Quote) {
    const index = openQuotes.findIndex(q => q.id === activeQuoteId);
    if (index !== -1) {
        openQuotes[index] = updatedQuote;
        saveSessionState();
    }
}

export function setFilteredCatalogItems(newFilteredItems: Item[]) {
    filteredCatalogItems = newFilteredItems;
}


// --- Initialization ---
export async function loadState() {
    console.log("Loading state from Supabase API.");
    
    // In online-only mode, we always fetch fresh from the API.
    const [loadedItems, loadedClients, loadedQuotes, loadedOrders, loadedTechnicians, loadedServiceTypes, loadedQuoteAuthors, loadedOrderAuthors, loadedSedes] = await Promise.all([
        API.getItemsFromSupabase(),
        API.getClientsFromSupabase(),
        API.getQuotesFromSupabase(),
        API.getOrdersFromSupabase(),
        API.getTechniciansFromSupabase(),
        API.getServiceTypesFromSupabase(),
        fetchQuoteAuthors(),
        fetchOrderAuthors(),
        API.fetchSedes()
    ]);

    setItems(loadedItems);
    setClients(loadedClients);
    setQuotes(loadedQuotes);
    setOrders(loadedOrders);
    setTechnicians(loadedTechnicians);
    setServiceTypes(loadedServiceTypes);
    setSedes(loadedSedes);
    setFilteredCatalogItems([...items]);
    setQuoteAuthors(loadedQuoteAuthors);
    setOrderAuthors(loadedOrderAuthors);
    
    console.log(`State loaded: ${items.length} items, ${clients.length} clients, ${quotes.length} quotes, ${orders.length} orders, ${technicians.length} technicians, ${serviceTypes.length} service types.`);
}

export function loadSessionState() {
    const savedOpenQuotesJson = localStorage.getItem(OPEN_QUOTES_KEY);
    if (savedOpenQuotesJson && savedOpenQuotesJson !== '[]') {
        try {
            const savedOpenQuotes = JSON.parse(savedOpenQuotesJson);
            if (Array.isArray(savedOpenQuotes) && savedOpenQuotes.length > 0) {
                openQuotes = savedOpenQuotes;
            }
        } catch (e) {
            console.error("Error parsing saved open quotes:", e);
            openQuotes = [];
            localStorage.removeItem(OPEN_QUOTES_KEY);
        }
    }

    const savedActiveQuoteId = localStorage.getItem(ACTIVE_QUOTE_ID_KEY);
    if (savedActiveQuoteId && openQuotes.some(q => q.id === savedActiveQuoteId)) {
        activeQuoteId = savedActiveQuoteId;
    } else if (openQuotes.length > 0) {
        activeQuoteId = openQuotes[0].id; // Fallback to the first available tab
    } else {
        activeQuoteId = null;
    }
}
