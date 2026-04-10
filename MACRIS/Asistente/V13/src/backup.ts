import { supabaseOrders, supabaseClients } from './api.js';

const RESTORE_PASSWORD = "macris_admin_backup";

type BackupData = {
    version: string;
    timestamp: string;
    tables: {
        clients: any[];
        maintenance_companies: any[];
        maintenance_cities: any[];
        maintenance_dependencies: any[];
        maintenance_equipment: any[];
        maintenance_reports: any[];
        orders: any[];
        order_items: any[];
    };
};

// --- Funciones Auxiliares Paginación (Fetch) ---
async function fetchAllRows(supabaseClient: any, tableName: string) {
    let allData: any[] = [];
    let page = 0;
    const limit = 100; // Reducido de 1000 a 100 para evitar timeout por columnas muy pesadas (firmas base64)
    let hasMore = true;

    while (hasMore) {
        const from = page * limit;
        const to = from + limit - 1;
        
        // El .order('id') es CRÍTICO para Supabase. Sin él, la paginación con .range() 
        // hace full table scans cada vez y causa "statement timeout".
        const { data, error } = await supabaseClient
            .from(tableName)
            .select('*')
            .order('id')
            .range(from, to);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            allData = allData.concat(data);
            page++;
            if (data.length < limit) {
                hasMore = false;
            }
        } else {
            hasMore = false;
        }
    }
    return allData;
}

// --- Funciones Auxiliares Paginación (Upsert) ---
async function upsertInBatches(supabaseClient: any, tableName: string, rows: any[], updateProgress: (msg: string) => void) {
    if (!rows || rows.length === 0) return;
    const batchSize = 1000;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        updateProgress(`Restaurando ${tableName} (${i + batch.length}/${rows.length})...`);
        const { error } = await supabaseClient.from(tableName).upsert(batch);
        if (error) {
            console.error(`Error restaurando ${tableName}:`, error);
            throw new Error(`Error en ${tableName}: ${error.message}`);
        }
    }
}

// --- Exportador Principal ---
export async function exportFullDatabase(updateProgress: (msg: string, percent: number) => void): Promise<void> {
    try {
        updateProgress("Recopilando Cotizaciones (clientes)...", 10);
        const clients = await fetchAllRows(supabaseClients, 'clients');
        
        updateProgress("Recopilando Entidades (ciudades y empresas)...", 20);
        const cities = await fetchAllRows(supabaseOrders, 'maintenance_cities');
        const companies = await fetchAllRows(supabaseOrders, 'maintenance_companies');
        
        updateProgress("Recopilando Sedes y Equipos...", 40);
        const dependencies = await fetchAllRows(supabaseOrders, 'maintenance_dependencies');
        const equipment = await fetchAllRows(supabaseOrders, 'maintenance_equipment');
        
        updateProgress("Recopilando Órdenes de Servicio...", 60);
        const orders = await fetchAllRows(supabaseOrders, 'orders');
        const order_items = await fetchAllRows(supabaseOrders, 'order_items');
        
        updateProgress("Recopilando Reportes Técnicos...", 80);
        const reports = await fetchAllRows(supabaseOrders, 'maintenance_reports');

        updateProgress("Generando archivo maestro...", 95);

        const backup: BackupData = {
            version: "1.0",
            timestamp: new Date().toISOString(),
            tables: {
                clients,
                maintenance_cities: cities,
                maintenance_companies: companies,
                maintenance_dependencies: dependencies,
                maintenance_equipment: equipment,
                orders,
                order_items,
                maintenance_reports: reports
            }
        };

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().split('T')[0];
        a.download = `macris_backup_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        updateProgress("¡Respaldo completado!", 100);
        
    } catch (e: any) {
        updateProgress(`Error: ${e.message}`, 0);
        console.error(e);
        throw e;
    }
}

// --- Restaurador Principal ---
export async function importFullDatabase(file: File, passwordProvided: string, updateProgress: (msg: string, percent: number) => void): Promise<void> {
    if (passwordProvided !== RESTORE_PASSWORD) {
        throw new Error("Contraseña de seguridad incorrecta.");
    }

    updateProgress("Leyendo archivo...", 10);
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const backup: BackupData = JSON.parse(content);

                if (!backup.tables) {
                    throw new Error("El archivo no tiene el formato de respaldo MACRIS válido.");
                }

                updateProgress("Analizando datos...", 20);
                
                // ORDEN DE UPSERTS ES CRITICO POR LAS FOREIGN KEYS
                // 1. Clientes (DB: Clients)
                await upsertInBatches(supabaseClients, 'clients', backup.tables.clients, (m) => updateProgress(m, 30));
                
                // 2. Ciudades y Empresas
                await upsertInBatches(supabaseOrders, 'maintenance_cities', backup.tables.maintenance_cities, (m) => updateProgress(m, 40));
                await upsertInBatches(supabaseOrders, 'maintenance_companies', backup.tables.maintenance_companies, (m) => updateProgress(m, 50));
                
                // 3. Órdenes y Dependencias
                await upsertInBatches(supabaseOrders, 'orders', backup.tables.orders, (m) => updateProgress(m, 60));
                await upsertInBatches(supabaseOrders, 'maintenance_dependencies', backup.tables.maintenance_dependencies, (m) => updateProgress(m, 70));
                
                // 4. Equipos e items de órdenes
                await upsertInBatches(supabaseOrders, 'order_items', backup.tables.order_items, (m) => updateProgress(m, 80));
                await upsertInBatches(supabaseOrders, 'maintenance_equipment', backup.tables.maintenance_equipment, (m) => updateProgress(m, 90));
                
                // 5. Reportes (Dependen de orders, equipment, dependencies, etc)
                await upsertInBatches(supabaseOrders, 'maintenance_reports', backup.tables.maintenance_reports, (m) => updateProgress(m, 95));

                updateProgress("¡Restauración Completada Exitosamente!", 100);
                resolve();
            } catch (err: any) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
        reader.readAsText(file);
    });
}

// --- Integración UI ---
export function initBackupRestore() {
    const backupBtn = document.getElementById('db-backup-btn') as HTMLButtonElement | null;
    const modal = document.getElementById('backup-restore-modal') as HTMLDialogElement | null;
    const closeBtn = document.getElementById('close-backup-modal') as HTMLButtonElement | null;
    const btnDownload = document.getElementById('btn-download-backup') as HTMLButtonElement | null;
    const btnUpload = document.getElementById('btn-upload-backup') as HTMLButtonElement | null;
    const restoreInput = document.getElementById('restore-password-input') as HTMLInputElement | null;
    const fileInput = document.getElementById('restore-file-input') as HTMLInputElement | null;
    
    const progressContainer = document.getElementById('backup-progress-container') as HTMLElement | null;
    const progressText = document.getElementById('backup-status-text') as HTMLElement | null;
    const progressFill = document.getElementById('backup-progress-fill') as HTMLElement | null;

    const statsLoading = document.getElementById('backup-stats-loading') as HTMLElement | null;
    const statsList = document.getElementById('backup-stats-list') as HTMLElement | null;

    const updateProgress = (msg: string, percent: number) => {
        if (progressContainer) progressContainer.style.display = 'flex';
        if (progressText) progressText.textContent = msg;
        if (progressFill) progressFill.style.width = `${percent}%`;
    };

    const loadStats = async () => {
        if (statsLoading && statsList && btnDownload) {
            statsLoading.style.display = 'block';
            statsList.style.display = 'none';
            btnDownload.disabled = true;

            try {
                const getCount = async (client: any, table: string) => {
                    const { count } = await client.from(table).select('id', { count: 'exact', head: true });
                    return count || 0;
                };

                const [clients, companies, deps, equip, orders, items, reports, cities] = await Promise.all([
                    getCount(supabaseClients, 'clients'),
                    getCount(supabaseOrders, 'maintenance_companies'),
                    getCount(supabaseOrders, 'maintenance_dependencies'),
                    getCount(supabaseOrders, 'maintenance_equipment'),
                    getCount(supabaseOrders, 'orders'),
                    getCount(supabaseOrders, 'order_items'),
                    getCount(supabaseOrders, 'maintenance_reports'),
                    getCount(supabaseOrders, 'maintenance_cities')
                ]);

                const itemsHtml = `
                    <li><strong style="color:var(--primary)">${clients}</strong> Cotizaciones (Clientes de Venta)</li>
                    <li><strong style="color:var(--primary)">${companies}</strong> Empresas de Mantenimiento</li>
                    <li><strong style="color:var(--primary)">${deps}</strong> Sedes (Dependencias)</li>
                    <li><strong style="color:var(--primary)">${reports}</strong> Reportes Generados</li>
                    <li><strong style="color:var(--primary)">${orders}</strong> Órdenes de Servicio</li>
                    <li><strong style="color:var(--primary)">${equip}</strong> Equipos Mantenidos</li>
                    <li><strong style="color:var(--primary)">${items}</strong> Ítems en Órdenes</li>
                    <li><strong style="color:var(--primary)">${cities}</strong> Ciudades Configuradas</li>
                `;
                
                statsList.innerHTML = itemsHtml;
                statsLoading.style.display = 'none';
                statsList.style.display = 'grid';
                btnDownload.disabled = false;
            } catch (err: any) {
                statsLoading.textContent = "Error obteniendo recuento: " + err.message;
            }
        }
    };

    backupBtn?.addEventListener('click', () => {
        if (modal) modal.showModal();
        if (progressContainer) progressContainer.style.display = 'none';
        if (restoreInput) restoreInput.value = '';
        loadStats();
    });

    closeBtn?.addEventListener('click', () => {
        if (modal) modal.close();
    });

    btnDownload?.addEventListener('click', async () => {
        btnDownload.disabled = true;
        try {
            await exportFullDatabase(updateProgress);
            alert("Respaldo descargado exitosamente. Guárdalo en un lugar seguro.");
        } catch (e: any) {
            alert("Error al descargar respaldo: " + e.message);
        } finally {
            btnDownload.disabled = false;
        }
    });

    btnUpload?.addEventListener('click', () => {
        const psw = restoreInput?.value;
        if (!psw) {
            alert("Por favor ingresa la clave de seguridad para restaurar.");
            return;
        }
        if (psw !== RESTORE_PASSWORD) {
            alert("Clave incorrecta.");
            return;
        }
        fileInput?.click();
    });

    fileInput?.addEventListener('change', async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const confirmation = confirm(`ATENCIÓN: Estás a punto de reescribir la base de datos de producción con el archivo ${file.name}. ¿Estás completamente seguro? Esta acción no se puede deshacer.`);
        if (!confirmation) {
            fileInput.value = '';
            return;
        }
        
        btnUpload!.disabled = true;
        try {
            await importFullDatabase(file, restoreInput!.value, updateProgress);
            alert("¡Restauración exitosa!");
            if (modal) modal.close();
        } catch (err: any) {
            alert("Error crítico al restaurar: " + err.message);
            updateProgress("Error de restauración", 0);
        } finally {
            fileInput.value = '';
            btnUpload!.disabled = false;
        }
    });
}
