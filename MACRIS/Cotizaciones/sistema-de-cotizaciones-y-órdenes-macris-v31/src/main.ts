import { getActiveQuote, getOpenQuotes, loadState, loadSessionState } from './state';
import * as UI from './ui';
import { setupEventListeners } from './events';
import { initReportsUI } from './ui-reports';

export async function main() {
    try {
        UI.setAdminPortalLink();
        UI.setCurrentUserBadge();
        // 1. Setup Online/Offline listeners for UI feedback
        window.addEventListener('online', () => UI.updateConnectionStatus(true));
        window.addEventListener('offline', () => UI.updateConnectionStatus(false));
        UI.updateConnectionStatus(navigator.onLine);

        // 2. Load and apply visual settings (theme, font size, etc.)
        await UI.loadTheme();
        await UI.loadFontSize();
        await UI.loadVatRate();
        await UI.loadCompanyAndQuoteTexts();
        await UI.loadPdfTemplateSelection();
        await UI.loadPdfOutputPreference();
        
        // 3. Load all business data directly from Supabase into the state
        await loadState();

        // Inicializar Reportes
        await initReportsUI();

        // 4. Setup all event listeners for interactivity (initializes Flatpickr, etc.)
        setupEventListeners();
        
        // 5. Render the main application UI parts that don't depend on active quote
        UI.renderOrderTypeOptions(); // Populate order types dropdown
        UI.renderAllLists();
        UI.renderPdfTemplateOptions();
        
        // 6. Load the last session state (open tabs and active tab) from localStorage
        loadSessionState();

        // 7. Restore the quote workspace UI or create a new quote
        if (getOpenQuotes().length === 0) {
            await UI.createNewQuote();
        } else {
            UI.renderQuoteTabs();
            UI.renderQuote(getActiveQuote());
        }

        console.log("App de Cotizaciones Macris inicializada en modo ONLINE.");

    } catch (error: any) {
        console.error("Error fatal al inicializar la aplicación:", error);
        UI.showNotification(`Error crítico: ${error.message}. Verifique la consola.`, "error");
    } finally {
        // Hide the loader regardless of success or failure
        UI.hideLoader();
    }
}
