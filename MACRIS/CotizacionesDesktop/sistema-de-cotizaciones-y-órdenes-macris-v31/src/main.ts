import { getActiveQuote, getOpenQuotes, loadState, loadSessionState } from './state';
import * as UI from './ui';
import { setupEventListeners } from './events';
import { setupRealtimeSubscriptions } from './realtime';
import { initReportsUI } from './ui-reports';
import { isDesktopRuntime } from './runtime';
import { getPendingSyncCount, syncDesktopPendingMutations } from './sync';
import { getDesktopLastSyncAt, initDesktopPersistence } from './db';

export async function main() {
    try {
        UI.setAdminPortalLink();
        UI.setCurrentUserBadge();
        if (isDesktopRuntime()) {
            await initDesktopPersistence();
        }
        // 1. Setup Online/Offline listeners for UI feedback
        window.addEventListener('online', () => {
            UI.updateConnectionStatus(true);
            syncDesktopPendingMutations(true).catch(error => {
                console.error('Desktop sync on reconnect failed:', error);
            });
        });
        window.addEventListener('offline', () => UI.updateConnectionStatus(false));
        window.addEventListener('macris:pending-sync-changed', (event: Event) => {
            const detail = (event as CustomEvent<{ count?: number }>).detail;
            UI.updateDesktopSyncIndicator({ pendingCount: detail?.count ?? 0 });
        });
        window.addEventListener('macris:last-sync-changed', (event: Event) => {
            const detail = (event as CustomEvent<{ lastSyncedAt?: string | null }>).detail;
            UI.updateDesktopSyncIndicator({ lastSyncedAt: detail?.lastSyncedAt ?? null });
        });
        UI.updateConnectionStatus(navigator.onLine);
        UI.updateDesktopSyncIndicator({
            pendingCount: getPendingSyncCount(),
            lastSyncedAt: getDesktopLastSyncAt(),
        });

        // 2. Load and apply visual settings (theme, font size, etc.)
        await UI.loadTheme();
        await UI.loadFontSize();
        await UI.loadVatRate();
        await UI.loadCompanyAndQuoteTexts();
        await UI.loadPdfTemplateSelection();
        await UI.loadPdfOutputPreference();
        
        // 3. Load all business data directly from Supabase into the state
        const loadResult = await loadState();
        
        // 3.1 Setup Realtime listeners for DB changes
        if (!isDesktopRuntime()) {
            setupRealtimeSubscriptions();
        }

        // Inicializar Reportes
        try {
            await initReportsUI();
        } catch (error) {
            if (!isDesktopRuntime()) throw error;
            console.warn('Desktop mode: reports module unavailable during startup.', error);
        }

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

        if (isDesktopRuntime() && loadResult.usedCatalogCache) {
            const cachedAt = loadResult.catalogCacheTimestamp
                ? new Date(loadResult.catalogCacheTimestamp).toLocaleString('es-CO')
                : 'fecha desconocida';
            UI.showNotification(`Modo desktop: catalogos cargados desde cache local (${cachedAt}).`, 'warning');
        }
        if (isDesktopRuntime() && loadResult.usedRecordCache) {
            UI.showNotification('Modo desktop: cotizaciones y ordenes cargadas desde almacenamiento local.', 'warning');
        } else if (isDesktopRuntime() && loadResult.remoteDataUnavailable) {
            UI.showNotification('Modo desktop: la aplicacion inicio con datos remotos parciales.', 'warning');
        }
        if (isDesktopRuntime()) {
            const pendingCount = getPendingSyncCount();
            if (pendingCount > 0 && !navigator.onLine) {
                UI.showNotification(`Modo desktop: hay ${pendingCount} cambio(s) pendientes por sincronizar.`, 'warning');
            } else if (pendingCount > 0 && navigator.onLine) {
                await syncDesktopPendingMutations(true);
            }
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
