import * as API from './api';
import * as State from './state';
import * as UI from './ui';
import {
    clearDesktopPendingMutation,
    getDesktopLastSyncAt,
    loadDesktopPendingMutations,
    replaceDesktopPendingMutations,
    setDesktopLastSyncAt,
    type DesktopPendingMutation,
} from './db';
import { isDesktopRuntime } from './runtime';

let syncInProgress = false;

function isLikelyNetworkFailure(error: unknown): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return message.includes('failed to fetch') || message.includes('network') || message.includes('fetch');
}

export function getPendingSyncCount(): number {
    if (!isDesktopRuntime()) return 0;
    return loadDesktopPendingMutations().length;
}

export async function syncDesktopPendingMutations(showNotification = true): Promise<number> {
    if (!isDesktopRuntime() || !navigator.onLine || syncInProgress) return 0;

    const pending = loadDesktopPendingMutations().sort((a, b) => {
        const aTime = new Date(a.savedAt).getTime();
        const bTime = new Date(b.savedAt).getTime();
        return aTime - bTime;
    });

    if (pending.length === 0) return 0;

    syncInProgress = true;
    UI.updateDesktopSyncIndicator({
        syncing: true,
        pendingCount: pending.length,
        lastSyncedAt: getDesktopLastSyncAt(),
    });
    let syncedCount = 0;
    const remaining: DesktopPendingMutation[] = [];

    try {
        for (const mutation of pending) {
            try {
                if (mutation.entity === 'quote') {
                    if (mutation.action === 'delete') {
                        await API.removeQuoteFromSupabase(mutation.id);
                        State.setQuotes(State.getQuotes().filter(record => record.id !== mutation.id));
                    } else if (mutation.payload) {
                        const savedQuote = await API.syncQuoteToSupabase(mutation.payload as any);
                        State.setQuotes([
                            ...State.getQuotes().filter(record => record.id !== savedQuote.id),
                            savedQuote,
                        ]);
                    }
                } else if (mutation.entity === 'order') {
                    if (mutation.action === 'delete') {
                        await API.removeOrderFromSupabase(mutation.id);
                        State.setOrders(State.getOrders().filter(record => record.id !== mutation.id));
                    } else if (mutation.payload) {
                        const savedOrder = await API.syncOrderToSupabase(mutation.payload as any);
                        State.setOrders([
                            ...State.getOrders().filter(record => record.id !== savedOrder.id),
                            savedOrder,
                        ]);
                    }
                }

                clearDesktopPendingMutation(mutation.entity, mutation.id);
                syncedCount += 1;
            } catch (error) {
                remaining.push(mutation);
                if (isLikelyNetworkFailure(error)) {
                    remaining.push(...pending.slice(pending.indexOf(mutation) + 1));
                    break;
                }
                console.error('Failed to sync desktop pending mutation:', mutation, error);
            }
        }

        replaceDesktopPendingMutations(remaining);

        if (syncedCount > 0) {
            setDesktopLastSyncAt(new Date().toISOString());
            UI.renderAllLists();
            if (showNotification) {
                UI.showNotification(`${syncedCount} cambio(s) locales sincronizados.`, 'success');
            }
        }

        return syncedCount;
    } finally {
        syncInProgress = false;
        UI.updateDesktopSyncIndicator({
            syncing: false,
            pendingCount: loadDesktopPendingMutations().length,
            lastSyncedAt: getDesktopLastSyncAt(),
        });
    }
}
