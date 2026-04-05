import { supabaseQuotes, supabaseOrders } from "./supabase";
import * as API from "./api";
import * as State from "./state";
import * as UI from "./ui";

let orderReloadTimeout: any = null;
let quoteReloadTimeout: any = null;
let clientReloadTimeout: any = null;
let itemReloadTimeout: any = null;

export function setupRealtimeSubscriptions() {
    console.log("Setting up Supabase Realtime subscriptions...");
    
    // ==========================================
    // QUOTES & SAVED QUOTES SYNC
    // ==========================================
    supabaseQuotes.channel("quotes-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "quotes" }, () => {
            if (quoteReloadTimeout) clearTimeout(quoteReloadTimeout);
            quoteReloadTimeout = setTimeout(async () => {
                try {
                    const newQuotes = await API.getQuotesFromSupabase();
                    State.setQuotes(newQuotes);
                    const savedQuotesPage = document.querySelector("#page-saved-quotes");
                    if (savedQuotesPage && savedQuotesPage.classList.contains("active")) {
                        UI.renderSavedQuotesPageList();
                    }
                } catch (e) {
                    console.error("Realtime update fetch failed:", e);
                }
            }, 800);
        }).subscribe((status) => console.log("Quotes Sync Status:", status));

    // ==========================================
    // ORDERS & AGENDA SYNC (connected to Reportes DB)
    // ==========================================
    const reloadOrders = () => {
        if (orderReloadTimeout) clearTimeout(orderReloadTimeout);
        // We use a slightly longer debounce (1.5s) to allow the Reportes app to finish 
        // ALL of its sequence of HTTP requests (update items + update order status).
        orderReloadTimeout = setTimeout(async () => {
            try {
                console.log("Realtime: Fetching new orders state from Supabase...");
                const newOrders = await API.getOrdersFromSupabase();
                State.setOrders(newOrders);
                
                // Re-render UI if Active
                const ordersPage = document.querySelector("#page-orders");
                if (ordersPage && ordersPage.classList.contains("active")) {
                    UI.renderOrdersList();
                }
                const agendaPage = document.querySelector("#page-agenda");
                if (agendaPage && agendaPage.classList.contains("active")) {
                    UI.renderAgendaPage();
                }
            } catch (e) {
                console.error("Realtime update fetch failed:", e);
            }
        }, 1500);
    };

    supabaseOrders.channel("orders-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, reloadOrders)
        .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, reloadOrders)
        .on("postgres_changes", { event: "*", schema: "public", table: "order_technicians" }, reloadOrders)
        .subscribe((status) => console.log("Orders Sync Status:", status));

    // ==========================================
    // CLIENTS SYNC
    // ==========================================
    supabaseQuotes.channel("clients-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => {
            if (clientReloadTimeout) clearTimeout(clientReloadTimeout);
            clientReloadTimeout = setTimeout(async () => {
                try {
                    const newClients = await API.getClientsFromSupabase();
                    State.setClients(newClients);
                    const clientsPage = document.querySelector("#page-clients");
                    if (clientsPage && clientsPage.classList.contains("active")) {
                        UI.renderClientsList();
                    }
                } catch (e) {}
            }, 800);
        }).subscribe();

    // ==========================================
    // ITEMS CATALOG SYNC
    // ==========================================
    supabaseQuotes.channel("items-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
            if (itemReloadTimeout) clearTimeout(itemReloadTimeout);
            itemReloadTimeout = setTimeout(async () => {
                try {
                    const newItems = await API.getItemsFromSupabase();
                    State.setItems(newItems);
                    const dbPage = document.querySelector("#page-database");
                    if (dbPage && dbPage.classList.contains("active")) {
                        UI.renderCatalogItemsList();
                    }
                } catch (e) {}
            }, 800);
        }).subscribe();
}
