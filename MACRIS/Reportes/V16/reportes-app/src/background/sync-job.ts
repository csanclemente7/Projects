import { synchronizeQueueHeadless } from '../lib/background-sync';

export default async function backgroundSyncTask() {
    console.log('[BackgroundRunner] Ejecutando sincronización automática en modo HEADLESS...');

    try {
        await synchronizeQueueHeadless();
        console.log('[BackgroundRunner] Sincronización HEADLESS completada.');
    } catch (err) {
        console.error('[BackgroundRunner] Error durante sync headless:', err);
    }

    return { result: 'success' };
}
