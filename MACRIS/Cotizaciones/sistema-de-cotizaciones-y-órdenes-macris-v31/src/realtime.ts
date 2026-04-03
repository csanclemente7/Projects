import { supabaseQuotes, supabaseOrders } from "./supabase";
import * as API from "./api";
import * as State from "./state";
import * as UI from "./ui";

let quoteReloadTimeout: any = null;
let orderReloadTimeout: any = null;
let clientReloadTimeout: any = null;
let itemReloadTimeout: any = null;

export function setupRealtimeSubscriptions() {
    console.log("Setting up Supabase Realtime subscriptions...");
    
    supabaseQuotes.channel("public:quotes")
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
            }, 500);
        }).subscribe();

    supabaseOrders.channel("public:orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
             if (orderReloadTimeout) clearTimeout(orderReloadTimeout);
             orderReloadTimeout = setTimeout(async () => {
                try {
                    const newOrders = await API.getOrdersFromSupabase();
                    State.setOrders(newOrders);
                    const ordersPage = document.querySelector("#page-orders");
                    if (ordersPage && ordersPage.classList.contains("active")) {
                        UI.renderOrdersList();
                    }
                } catch (e) {
                    console.error("Realtime update fetch failed:", e);
                }
             }, 500);
        }).subscribe();

    supabaseQuotes.channel("public:clients")
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
            }, 500);
        }).subscribe();

    supabaseQuotes.channel("public:items")
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
            }, 500);
        }).subscribe();
}
