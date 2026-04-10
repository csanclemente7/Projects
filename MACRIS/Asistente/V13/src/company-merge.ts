import * as State from './state';
import * as UI from './ui';
import { supabaseOrders, fetchCompanies, fetchDependencies, fetchEquipment, fetchAllReports, fetchUniqueNamesFromSnapshots } from './api';
import { normalizeString, fuzzyNormalize } from './utils';
import type { Company, Dependency } from './types';

type CompanyStats = {
    reports: number;
    equipment: number;
    dependencies: number;
};

type DuplicateCandidate = {
    companyA: Company;
    companyB: Company;
    similarity: number;
    statsA?: CompanyStats;
    statsB?: CompanyStats;
};

type DuplicateGroup = {
    ids: string[];
    preferredTargetId?: string;
    preferredTargetName?: string;
};

const MIN_SIMILARITY = 0.8;

const EXPLANATION_HTML = `
    <strong>Fase 1: Detección Inteligente</strong><br>
    - Normalización: quita tildes, pasa a minúsculas y elimina espacios extra.<br>
    - Levenshtein: calcula cuántos cambios de letras se necesitan para igualar nombres.<br>
    - Si la similitud es mayor al 80%, se marca como posible duplicado.<br>
    - Peso de datos: cuenta Reportes, Equipos y Dependencias para sugerir el Target.<br><br>
    <strong>Fase 2: Fusión Estructural</strong><br>
    - Dependencias: si el nombre coincide, migra equipos y reportes y elimina la duplicada.<br>
    - Equipos: actualiza el company_id al Target.<br>
    - Reportes: reasigna company_id, dependency_id y actualiza el snapshot.<br>
    - Órdenes: reasigna clientId al Target.<br>
    - Limpieza final: elimina la empresa duplicada si queda en cero.
`;

let isBusy = false;
let duplicateGroups: DuplicateGroup[] = [];
let duplicateGroupIndex = 0;
let statsByCompany = new Map<string, CompanyStats>();

export function initCompanyMerge() {
    const openBtn = document.getElementById('company-merge-btn');
    const modal = document.getElementById('company-merge-modal');
    const closeBtn = document.getElementById('close-company-merge-modal');
    const scanBtn = document.getElementById('company-merge-scan') as HTMLButtonElement | null;

    openBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'flex';
    });

    closeBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
    });

    scanBtn?.addEventListener('click', async () => {
        await scanForDuplicates();
    });

}

function setBusyState(next: boolean) {
    isBusy = next;
    const scanBtn = document.getElementById('company-merge-scan') as HTMLButtonElement | null;
    if (scanBtn) scanBtn.disabled = next;
}



function clearDashboard() {
    const container = document.getElementById('company-merge-dashboard-container');
    if (container) {
        container.innerHTML = '';
    }
}



function setProgressVisible(visible: boolean) {
    const progress = document.getElementById('company-merge-progress');
    const bar = document.getElementById('company-merge-progress-bar') as HTMLElement | null;
    if (progress) progress.style.display = visible ? 'block' : 'none';
    if (bar && !visible) bar.style.width = '0%';
}

function updateProgress(current: number, total: number, label: string) {
    const textEl = document.getElementById('company-merge-progress-text');
    const bar = document.getElementById('company-merge-progress-bar') as HTMLElement | null;
    if (textEl) textEl.textContent = `${label} (${current}/${total})`;
    if (bar) {
        const safeTotal = total > 0 ? total : 1;
        const pct = Math.min(100, Math.round((current / safeTotal) * 100));
        bar.style.width = `${pct}%`;
    }
}

function sleepFrame() {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function stripAccents(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function sanitizeCompanyName(value: string): string {
    if (!value) return '';
    return stripAccents(value).replace(/\s+/g, ' ').trim();
}

function resolveTargetName(group: DuplicateGroup, target: Company): string {
    const baseName = sanitizeCompanyName(target.name);
    const preferred = sanitizeCompanyName(group.preferredTargetName || '');
    return preferred || baseName;
}

function updateMergeTargetLabels(container: HTMLElement, nextName: string) {
    container.querySelectorAll('[data-role="merge-target-label"]').forEach(label => {
        label.textContent = nextName;
    });
}

async function ensureTargetName(target: Company, preferredName: string): Promise<string> {
    const fallback = sanitizeCompanyName(target.name);
    const finalName = sanitizeCompanyName(preferredName) || fallback;
    if (!finalName || finalName === target.name) return target.name;

    await assertSupabase(
        supabaseOrders.from('maintenance_companies')
            .update({ name: finalName })
            .eq('id', target.id)
    );

    target.name = finalName;
    const stateCompany = State.companies.find(c => c.id === target.id);
    if (stateCompany) stateCompany.name = finalName;
    return finalName;
}

async function scanForDuplicates() {
    setBusyState(true);
    setProgressVisible(true);

    try {
        clearDashboard();
        duplicateGroups = [];
        let companies = State.companies;
        if (!companies || companies.length === 0) {
            companies = await fetchCompanies();
            State.setCompanies(companies);
        }

        if (companies.length < 2) {
            UI.showAppNotification('No hay suficientes empresas para comparar.', 'info');
            setProgressVisible(false);
            setBusyState(false);
            return;
        }

        const normalized = companies.map(c => ({
            company: c,
            norm: fuzzyNormalize(c.name)
        }));

        const totalPairs = (companies.length * (companies.length - 1)) / 2;
        let checked = 0;
        const candidates: DuplicateCandidate[] = [];

        updateProgress(0, totalPairs, 'Analizando nombres');

        for (let i = 0; i < normalized.length; i++) {
            for (let j = i + 1; j < normalized.length; j++) {
                const a = normalized[i];
                const b = normalized[j];
                const maxLen = Math.max(a.norm.length, b.norm.length);
                if (maxLen === 0) continue;
                const lengthGap = Math.abs(a.norm.length - b.norm.length) / maxLen;
                if (lengthGap > (1 - MIN_SIMILARITY)) {
                    checked++;
                    continue;
                }
                const similarity = calcSimilarity(a.norm, b.norm);
                if (similarity >= MIN_SIMILARITY) {
                    candidates.push({ companyA: a.company, companyB: b.company, similarity });
                }
                checked++;
                if (checked % 120 === 0) {
                    updateProgress(checked, totalPairs, 'Analizando nombres');
                    await sleepFrame();
                }
            }
        }

        updateProgress(totalPairs, totalPairs, 'Análisis completado');
        await sleepFrame();

        if (candidates.length === 0) {
            clearDashboard();
            const container = document.getElementById('company-merge-dashboard-container');
            if(container) container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 40px; font-size: 0.95rem;"><i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5; color: var(--success);"></i><br>No se encontraron duplicados en la base de datos. ¡Todo limpio!</div>`;
            setProgressVisible(false);
            setBusyState(false);
            return;
        }

        updateProgress(totalPairs, totalPairs, `Calculando peso de datos...`);

        const companyIds = Array.from(new Set(
            candidates.flatMap(c => [c.companyA.id, c.companyB.id])
        ));
        statsByCompany = await buildCompanyStatsMap(companyIds);

        candidates.forEach(candidate => {
            candidate.statsA = statsByCompany.get(candidate.companyA.id) || { reports: 0, equipment: 0, dependencies: 0 };
            candidate.statsB = statsByCompany.get(candidate.companyB.id) || { reports: 0, equipment: 0, dependencies: 0 };
        });

        setProgressVisible(false);

        duplicateGroups = buildDuplicateGroups(candidates, statsByCompany);
        duplicateGroupIndex = 0;

        if (duplicateGroups.length === 0) {
            UI.showAppNotification('No encontré grupos claros de duplicados. Revisa manualmente.', 'info');
            return;
        }

        renderDuplicateGroup(duplicateGroupIndex);
        UI.showAppNotification(`Búsqueda completa. Mostrando 1 de ${duplicateGroups.length} grupos.`, 'success');
    } catch (error: any) {
        console.error('Scan error:', error);
        UI.showAppNotification('Ocurrió un error al analizar duplicados.', 'error');
    } finally {
        setProgressVisible(false);
        setBusyState(false);
    }
}

async function getCompanyStats(companyId: string, cache: Map<string, CompanyStats>): Promise<CompanyStats> {
    const cached = cache.get(companyId);
    if (cached) return cached;

    const [reportsRes, equipmentRes, depsRes] = await Promise.all([
        supabaseOrders.from('maintenance_reports').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabaseOrders.from('maintenance_equipment').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
        supabaseOrders.from('maintenance_dependencies').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
    ]);

    if (reportsRes.error) throw reportsRes.error;
    if (equipmentRes.error) throw equipmentRes.error;
    if (depsRes.error) throw depsRes.error;

    const stats: CompanyStats = {
        reports: reportsRes.count || 0,
        equipment: equipmentRes.count || 0,
        dependencies: depsRes.count || 0
    };
    cache.set(companyId, stats);
    return stats;
}

async function buildCompanyStatsMap(companyIds: string[]): Promise<Map<string, CompanyStats>> {
    const statsMap = new Map<string, CompanyStats>();
    companyIds.forEach(id => statsMap.set(id, { reports: 0, equipment: 0, dependencies: 0 }));

    if (companyIds.length === 0) return statsMap;

    updateProgress(1, 3, 'Peso de datos: Reportes');
    const reportCounts = await fetchCountsByCompany('maintenance_reports', 'company_id', companyIds);
    reportCounts.forEach((count, id) => {
        const stats = statsMap.get(id);
        if (stats) stats.reports = count;
    });

    updateProgress(2, 3, 'Peso de datos: Equipos');
    const equipmentCounts = await fetchCountsByCompany('maintenance_equipment', 'company_id', companyIds);
    equipmentCounts.forEach((count, id) => {
        const stats = statsMap.get(id);
        if (stats) stats.equipment = count;
    });

    updateProgress(3, 3, 'Peso de datos: Dependencias');
    const dependencyCounts = await fetchCountsByCompany('maintenance_dependencies', 'company_id', companyIds);
    dependencyCounts.forEach((count, id) => {
        const stats = statsMap.get(id);
        if (stats) stats.dependencies = count;
    });

    await sleepFrame();
    return statsMap;
}

async function fetchCountsByCompany(
    table: 'maintenance_reports' | 'maintenance_equipment' | 'maintenance_dependencies',
    column: 'company_id',
    companyIds: string[]
): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (companyIds.length === 0) return counts;

    const chunkSize = 200;
    const pageSize = 1000;

    for (let i = 0; i < companyIds.length; i += chunkSize) {
        const chunk = companyIds.slice(i, i + chunkSize);
        let from = 0;
        while (true) {
            const { data, error } = await supabaseOrders
                .from(table)
                .select(`${column}, id`)
                .in(column, chunk)
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);
            if (error) throw error;
            const rows = (data || []) as Array<{ [key: string]: any }>;
            rows.forEach(row => {
                const id = row[column];
                if (!id) return;
                counts.set(id, (counts.get(id) || 0) + 1);
            });
            if (rows.length < pageSize) break;
            from += pageSize;
        }
    }

    return counts;
}

function buildDuplicateGroups(candidates: DuplicateCandidate[], statsMap: Map<string, CompanyStats>): DuplicateGroup[] {
    const ids = new Set<string>();
    candidates.forEach(c => {
        ids.add(c.companyA.id);
        ids.add(c.companyB.id);
    });

    const parent = new Map<string, string>();
    ids.forEach(id => parent.set(id, id));

    const find = (id: string): string => {
        const p = parent.get(id) || id;
        if (p === id) return p;
        const root = find(p);
        parent.set(id, root);
        return root;
    };

    const union = (a: string, b: string) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent.set(rootB, rootA);
    };

    candidates.forEach(c => union(c.companyA.id, c.companyB.id));

    const groupsMap = new Map<string, Set<string>>();
    ids.forEach(id => {
        const root = find(id);
        if (!groupsMap.has(root)) groupsMap.set(root, new Set());
        groupsMap.get(root)!.add(id);
    });

    const groups = Array.from(groupsMap.values())
        .map(set => ({ ids: Array.from(set) }))
        .filter(group => group.ids.length >= 2);

    groups.sort((a, b) => {
        const sizeDiff = b.ids.length - a.ids.length;
        if (sizeDiff !== 0) return sizeDiff;
        return calcGroupScore(b, statsMap) - calcGroupScore(a, statsMap);
    });

    return groups;
}

function calcGroupScore(group: DuplicateGroup, statsMap: Map<string, CompanyStats>): number {
    return group.ids.reduce((sum, id) => sum + calcCompanyScore(statsMap.get(id)), 0);
}

function calcCompanyScore(stats?: CompanyStats): number {
    if (!stats) return 0;
    return stats.reports * 100000 + stats.equipment * 100 + stats.dependencies;
}

function pickTargetFromGroup(companies: Company[], statsMap: Map<string, CompanyStats>): Company {
    let target = companies[0];
    let bestScore = -1;
    companies.forEach(company => {
        const score = calcCompanyScore(statsMap.get(company.id));
        if (score > bestScore) {
            bestScore = score;
            target = company;
        } else if (score === bestScore) {
            if (company.name.length > target.name.length) target = company;
        }
    });
    return target;
}

function syncGroupsWithState() {
    const liveIds = new Set(State.companies.map(c => c.id));
    duplicateGroups = duplicateGroups
        .map(group => {
            const ids = group.ids.filter(id => liveIds.has(id));
            const preferredTargetId = group.preferredTargetId && ids.includes(group.preferredTargetId)
                ? group.preferredTargetId
                : undefined;
            const preferredTargetName = preferredTargetId ? group.preferredTargetName : undefined;
            return { ids, preferredTargetId, preferredTargetName };
        })
        .filter(group => group.ids.length >= 2);
    if (duplicateGroupIndex >= duplicateGroups.length) {
        duplicateGroupIndex = Math.max(0, duplicateGroups.length - 1);
    }
}

function collectGroupCompanyIds(groups: DuplicateGroup[]): string[] {
    const ids = new Set<string>();
    groups.forEach(group => group.ids.forEach(id => ids.add(id)));
    return Array.from(ids);
}

async function refreshGroupsAfterMerge() {
    setBusyState(true);
    setProgressVisible(true);
    try {
        syncGroupsWithState();
        if (duplicateGroups.length === 0) {
            clearDashboard();
            const container = document.getElementById('company-merge-dashboard-container');
            if(container) container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 40px; font-size: 0.95rem;"><i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5; color: var(--success);"></i><br>No quedan grupos pendientes de unificación. Base de datos depurada.</div>`;
            return;
        }
        const ids = collectGroupCompanyIds(duplicateGroups);
        statsByCompany = await buildCompanyStatsMap(ids);
        duplicateGroupIndex = Math.min(duplicateGroupIndex, duplicateGroups.length - 1);
        renderDuplicateGroup(duplicateGroupIndex);
    } catch (error: any) {
        console.error('Refresh groups error:', error);
        UI.showAppNotification('Error actualizando el dashboard. Escanea nuevamente.', 'error');
    } finally {
        setProgressVisible(false);
        setBusyState(false);
    }
}

function renderDuplicateGroup(index: number, keepSearchQuery?: string) {
    if (duplicateGroups.length === 0) return;
    const container = document.getElementById('company-merge-dashboard-container');
    if (!container) return;

    duplicateGroupIndex = Math.max(0, Math.min(index, duplicateGroups.length - 1));
    const group = duplicateGroups[duplicateGroupIndex];
    const companyMap = new Map(State.companies.map(c => [c.id, c]));
    const companies = group.ids.map(id => companyMap.get(id)).filter(Boolean) as Company[];

    if (companies.length < 2) {
        syncGroupsWithState();
        if (duplicateGroups.length === 0) {
            clearDashboard();
            if(container) container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 40px; font-size: 0.95rem;"><i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5; color: var(--success);"></i><br>No quedan grupos pendientes de unificación.</div>`;
            return;
        }
        renderDuplicateGroup(duplicateGroupIndex);
        return;
    }

    container.innerHTML = '';
    
    // Header Navigation
    const headerDiv = document.createElement('div');
    headerDiv.innerHTML = `
        <div style="background: var(--bg-card); padding: 15px; border-radius: 8px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
                <span style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">Fase ${duplicateGroupIndex + 1} de ${duplicateGroups.length}</span>
                <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 5px;">Revisa las empresas y elige cuál conservar.</div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary merge-prev-btn" ${duplicateGroupIndex === 0 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Anterior</button>
                <button class="btn btn-secondary merge-next-btn" ${duplicateGroupIndex === duplicateGroups.length - 1 ? 'disabled' : ''}>Siguiente <i class="fas fa-chevron-right"></i></button>
            </div>
        </div>
    `;
    container.appendChild(headerDiv);

    const getCityName = (cityId?: string | null) => {
        if (!cityId) return '';
        const c = State.cities.find(city => city.id === cityId);
        return c ? ` - <span style="opacity: 0.7;">${c.name}</span>` : '';
    };

    const preferredTarget = group.preferredTargetId ? companyMap.get(group.preferredTargetId) : undefined;
    const target = preferredTarget || pickTargetFromGroup(companies, statsByCompany);
    group.preferredTargetId = target.id;
    const targetName = group.preferredTargetName || target.name;
    group.preferredTargetName = targetName;
    const targetOptions = companies.map(c => `<option value="${c.id}" ${c.id === target.id ? 'selected' : ''}>${c.name}${c.cityId ? ` - ${State.cities.find(city => city.id === c.cityId)?.name || ''}` : ''}</option>`).join('');
    
    const sourceCompanies = companies.filter(c => c.id !== target.id);
    const sourceRows = sourceCompanies.map(c => {
        const stats = statsByCompany.get(c.id) || { reports: 0, equipment: 0, dependencies: 0 };
        return `
            <div style="background: rgba(255,165,0,0.05); border: 1px solid rgba(255,165,0,0.3); padding: 12px; border-radius: 8px; position: relative;">
                <div style="position: absolute; top: -10px; right: 10px; background: var(--bg-body); padding: 0 5px; font-size: 0.65rem; color: #ff9800; border: 1px solid rgba(255,165,0,0.3); border-radius: 4px;">Se descartará</div>
                <div style="font-weight: 600; font-size: 0.95rem; color: #ffad33;">${c.name}${getCityName(c.cityId)}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 4px;">
                    <i class="fas fa-file-alt"></i> ${stats.reports} Rep · <i class="fas fa-tools"></i> ${stats.equipment} Eq · <i class="fas fa-building"></i> ${stats.dependencies} Dep
                </div>
            </div>
        `;
    }).join('');

    const canMergeAll = sourceCompanies.length > 0;

    const groupWrapper = document.createElement('div');
    groupWrapper.className = 'dashboard-merge-group';
    groupWrapper.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px;';
    
    groupWrapper.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed var(--border); padding-bottom: 15px; margin-bottom: 20px;">
            <div style="font-weight: 700; color: var(--primary); text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.5px;">
                <i class="fas fa-random"></i> GRUPO ACTUAL &mdash; ${companies.length} Empresas Emparejadas
            </div>
            <button class="btn btn-success btn-compact merge-all-btn" ${canMergeAll ? '' : 'disabled'} style="font-weight: bold; background: var(--primary); border:none; padding: 8px 15px;"><i class="fas fa-layer-group"></i> Unificar todas -> Principal</button>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <!-- SECCIÓN IZQUIERDA: TARJETA PRINCIPAL (TARGET) -->
            <div>
                <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; color: var(--primary); margin-bottom: 10px;"><i class="fas fa-check-circle"></i> Destino Oficial</div>
                <div style="background: rgba(var(--color-primary-rgb, 10,199,212), 0.05); border: 2px solid var(--primary); padding: 15px; border-radius: 8px; position: relative; height: 100%;">
                    <div style="margin-top: 5px;">
                        <label style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Empresa Base Conservada</label>
                        <select class="merge-target-select" style="margin-top: 5px; width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: white; padding: 10px; border-radius: 6px; font-weight: bold; font-size: 0.85rem;">
                            ${targetOptions}
                        </select>
                    </div>
                    <div style="margin-top: 15px;">
                        <label style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700;">Nombre Unificado Refinado</label>
                        <input class="merge-target-name-input" type="text" value="${targetName}" style="margin-top: 5px; width: 100%; background: var(--bg-input); border: 1px solid var(--border); padding: 10px; border-radius: 6px; font-weight: bold; color: var(--primary); font-size: 0.85rem;" />
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 15px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px;">
                        <i class="fas fa-info-circle"></i> Las dependencias similares (>82%) de los carteles derechos pasarán orgánicamente a este destino.
                    </div>
                </div>
            </div>

            <!-- SECCIÓN DERECHA: EMPRESAS FUENTE (SE DESCARTAN) -->
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; color: #ffad33;"><i class="fas fa-arrow-down"></i> Empresas Analizadas a Destruir</span>
                </div>
                
                <div style="margin-bottom: 15px; position: relative;">
                    <div style="display: flex; gap: 8px;">
                        <span style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); padding: 8px 12px; border-radius: 6px; display:flex; align-items: center; color: var(--text-dim);"><i class="fas fa-search"></i></span>
                        <input type="text" class="manual-add-search" value="${keepSearchQuery || ''}" placeholder="Buscar y agregar otra empresa repetida manualmente..." style="flex:1; font-size:0.85rem; background: var(--bg-input); border: 1px solid var(--border); color: white; padding: 8px 12px; border-radius: 6px;" />
                    </div>
                    <div class="manual-add-results" style="display:none; position: absolute; top: 100%; left: 0; width: 100%; background: var(--bg-card); border: 1px solid var(--border); max-height: 200px; overflow-y: auto; overflow-x: hidden; border-radius: 6px; margin-top: 5px; z-index: 10; box-shadow: 0 5px 15px rgba(0,0,0,0.3);"></div>
                </div>

                <div style="display: grid; gap: 12px;">
                    ${sourceRows || '<div style="font-size: 0.8rem; color: var(--text-dim); text-align: center; padding: 20px; border: 1px dashed var(--border); border-radius: 8px;">No hay otras empresas para unificar.</div>'}
                </div>
            </div>
        </div>
    `;

    // Event Listeners for this group
    const targetSelect = groupWrapper.querySelector('.merge-target-select') as HTMLSelectElement | null;
    const targetNameInput = groupWrapper.querySelector('.merge-target-name-input') as HTMLInputElement | null;
    const mergeAllBtn = groupWrapper.querySelector('.merge-all-btn') as HTMLButtonElement | null;

    const setTargetName = (nextName: string, forceUpdateUi: boolean = false) => {
        const cleaned = sanitizeCompanyName(nextName);
        const resolved = cleaned || sanitizeCompanyName(target.name);
        group.preferredTargetName = resolved;
        if (forceUpdateUi && targetNameInput && targetNameInput.value !== resolved) {
            targetNameInput.value = resolved;
        }
    };

    targetSelect?.addEventListener('change', () => {
        if (!targetSelect || isBusy) return;
        group.preferredTargetId = targetSelect.value;
        const selected = companyMap.get(targetSelect.value);
        group.preferredTargetName = selected ? sanitizeCompanyName(selected.name) : undefined;
        renderDuplicateGroup(duplicateGroupIndex);
    });

    targetNameInput?.addEventListener('input', () => {
        if (!targetNameInput || isBusy) return;
        setTargetName(targetNameInput.value, false);
    });
    
    targetNameInput?.addEventListener('blur', () => {
        if (!targetNameInput || isBusy) return;
        setTargetName(targetNameInput.value, true);
    });

    // Lógica para agregar manualmente
    const searchInput = groupWrapper.querySelector('.manual-add-search') as HTMLInputElement | null;
    const resultsDiv = groupWrapper.querySelector('.manual-add-results') as HTMLDivElement | null;

    searchInput?.addEventListener('input', () => {
        if (!searchInput || !resultsDiv || isBusy) return;
        const q = searchInput.value.toLowerCase().trim();
        if (q.length < 3) {
            resultsDiv.style.display = 'none';
            return;
        }

        const matches = State.companies.filter(c => 
            !group.ids.includes(c.id) && c.name.toLowerCase().includes(q)
        ).slice(0, 10); // Límite de 10 sugerencias

        if (matches.length === 0) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = '<div style="padding: 12px; font-size: 0.8rem; color: var(--text-dim); text-align: center;">No hay coincidencias en la base de datos</div>';
            return;
        }

        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = matches.map(c => `
            <div class="manual-add-item" data-id="${c.id}" style="padding: 10px 15px; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; color: var(--text); display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;">
                <span style="font-weight: 500;">${c.name}${getCityName(c.cityId)}</span>
                <span style="color: var(--success); font-size: 0.75rem; background: rgba(46, 213, 115, 0.1); padding: 3px 8px; border-radius: 10px;"><i class="fas fa-plus"></i> Añadir</span>
            </div>
        `).join('');

        resultsDiv.querySelectorAll('.manual-add-item').forEach(item => {
            // Efecto Hover simple
            (item as HTMLElement).onmouseover = () => { (item as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; };
            (item as HTMLElement).onmouseout = () => { (item as HTMLElement).style.background = 'transparent'; };

            item.addEventListener('click', async (e) => {
                const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
                if (id && !group.ids.includes(id)) {
                    setBusyState(true);
                    try {
                        const newStats = await buildCompanyStatsMap([id]);
                        statsByCompany.set(id, newStats.get(id) || { reports: 0, equipment: 0, dependencies: 0 });
                        group.ids.push(id);
                        
                        // Guardar query actual y re-renderizar
                        const currentQ = searchInput ? searchInput.value : undefined;
                        renderDuplicateGroup(duplicateGroupIndex, currentQ);
                    } catch (err) {
                        UI.showAppNotification('Error obteniendo datos de empresa.', 'error');
                    } finally {
                        setBusyState(false);
                    }
                }
            });
        });
    });

    // Cerrar buscador manual al hacer clic afuera
    document.addEventListener('click', (e) => {
        if (!groupWrapper.contains(e.target as Node) && resultsDiv) {
            resultsDiv.style.display = 'none';
            if (searchInput) searchInput.value = '';
        }
    });

    mergeAllBtn?.addEventListener('click', async () => {
        if (isBusy) return;
        const currentTargetName = resolveTargetName(group, target);
        const sources = companies.filter(c => c.id !== target.id);
        if (sources.length === 0) {
            UI.showAppNotification('No hay empresas descartables en este grupo.', 'info');
            return;
        }
        const confirmed = await UI.showConfirmationModal(
            `¿Desea absorber ${sources.length} empresas repetidas y convertirlas en 1 sola empresa llamada: "${currentTargetName}"? Esta acción es irreversible.`,
            'Proceder con la Fusión'
        );
        if (!confirmed) return;

        try {
            const finalTargetName = await ensureTargetName(target, currentTargetName);
            setBusyState(true);
            setProgressVisible(true);
            updateProgress(0, sources.length, 'Unificando empresas');

            for (let i = 0; i < sources.length; i++) {
                updateProgress(i + 1, sources.length, `Unificando ${sources[i].name}...`);
                await mergeCompanies(target, sources[i], {
                    manageBusy: false,
                    manageProgress: false,
                    refreshAfter: false,
                    notifyAfter: false
                });
                await sleepFrame();
            }

            await refreshLocalState();
            
            // ÉXITO VISUAL TEMPORAL
            if (container) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--success); padding: 60px 20px;">
                        <i class="fas fa-check-circle" style="font-size: 4rem; margin-bottom: 20px; animation: popIn 0.5s ease;"></i>
                        <h2 style="margin-bottom: 10px; color: var(--success);">¡Unificación Exitosa!</h2>
                        <p style="color: var(--text-dim); font-size: 0.95rem;">Las empresas han sido fusionadas exitosamente bajo <strong>${finalTargetName}</strong>.</p>
                        <p style="color: var(--text-dim); font-size: 0.8rem; margin-top:15px; opacity: 0.7;">Pasando a la siguiente fase...</p>
                    </div>
                `;
            }
            
            UI.showAppNotification(`Grupo fusionado correctamente en ${finalTargetName}.`, 'success');
            
            // Pausa de 1.5 segundos para apreciar el mensaje
            await new Promise(resolve => setTimeout(resolve, 1500));

            await refreshGroupsAfterMerge();
        } catch (error: any) {
            console.error('Merge error:', error);
            UI.showAppNotification(`Error al procesar el grupo: ${error.message}`, 'error');
        } finally {
            setProgressVisible(false);
            setBusyState(false);
        }
    });

    container.appendChild(groupWrapper);

    const prevBtn = headerDiv.querySelector('.merge-prev-btn') as HTMLButtonElement | null;
    const nextBtn = headerDiv.querySelector('.merge-next-btn') as HTMLButtonElement | null;

    prevBtn?.addEventListener('click', () => {
        if (isBusy) return;
        renderDuplicateGroup(duplicateGroupIndex - 1);
    });
    nextBtn?.addEventListener('click', () => {
        if (isBusy) return;
        renderDuplicateGroup(duplicateGroupIndex + 1);
    });

    // Auto-focus y reactivación del search si hay query persistida
    if (keepSearchQuery && searchInput) {
        searchInput.focus();
        // Disparamos el evento input para abrir la lista
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        // Ponemos el cursor al final del texto
        setTimeout(() => { searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length; }, 10);
    }
}

type MergeOptions = {
    manageBusy?: boolean;
    manageProgress?: boolean;
    refreshAfter?: boolean;
    notifyAfter?: boolean;
};

async function mergeCompanies(
    target: Company,
    source: Company,
    options: MergeOptions = {}
) {
    const manageBusy = options.manageBusy !== false;
    const manageProgress = options.manageProgress !== false;
    const refreshAfter = options.refreshAfter !== false;
    const notifyAfter = options.notifyAfter !== false;
    const progress = (current: number, total: number, label: string) => {
        if (manageProgress) updateProgress(current, total, label);
    };

    if (manageBusy) setBusyState(true);
    if (manageProgress) setProgressVisible(true);

    try {
        const totalSteps = 6;
        progress(1, totalSteps, 'Preparando dependencias');

        const allDependencies = await fetchDependencies();
        const targetDeps = allDependencies.filter(d => d.companyId === target.id);
        const sourceDeps = allDependencies.filter(d => d.companyId === source.id);

        const dependencyMap = new Map<string, Dependency>();
        targetDeps.forEach(dep => dependencyMap.set(normalizeString(dep.name), dep));

        const dependencyIdMap = new Map<string, string>();
        const dependencyNameMap = new Map<string, string>();

        // Recolectar ALL reports (manejo de más de 1000 en caso de empresas gigantes)
        let allSourceReports: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            const { data: pageResp, error: repErr } = await supabaseOrders
                .from('maintenance_reports')
                .select('id, equipment_snapshot, dependency_id')
                .eq('company_id', source.id)
                .range(from, from + pageSize - 1);
            if (repErr) throw repErr;
            if (!pageResp || pageResp.length === 0) break;
            allSourceReports = allSourceReports.concat(pageResp);
            if (pageResp.length < pageSize) break;
            from += pageSize;
        }

        progress(2, totalSteps, 'Transferencia de dependencias');
        for (const dep of sourceDeps) {
            const normalizedSource = normalizeString(dep.name);
            let match = dependencyMap.get(normalizedSource);

            // Búsqueda difusa para dependencias similares
            if (!match) {
                let bestSim = 0;
                let bestDep: Dependency | null = null;
                for (const tDep of targetDeps) {
                    const sim = calcSimilarity(normalizedSource, normalizeString(tDep.name));
                    if (sim > bestSim) {
                        bestSim = sim;
                        bestDep = tDep;
                    }
                }
                // Si la coincidencia es superior al 82%, asumimos que es un typo de la misma área
                if (bestSim >= 0.82) {
                    match = bestDep || undefined;
                }
            }

            if (match) {
                await assertSupabase(
                    supabaseOrders.from('maintenance_equipment')
                        .update({ dependency_id: match.id, company_id: target.id })
                        .eq('dependency_id', dep.id)
                );

                await assertSupabase(
                    supabaseOrders.from('maintenance_reports')
                        .update({ dependency_id: match.id, company_id: target.id })
                        .eq('dependency_id', dep.id)
                );

                await assertSupabase(
                    supabaseOrders.from('maintenance_dependencies')
                        .delete()
                        .eq('id', dep.id)
                );

                dependencyIdMap.set(dep.id, match.id);
                dependencyNameMap.set(dep.id, match.name);
            } else {
                await assertSupabase(
                    supabaseOrders.from('maintenance_dependencies')
                        .update({ company_id: target.id })
                        .eq('id', dep.id)
                );
                dependencyIdMap.set(dep.id, dep.id);
                dependencyNameMap.set(dep.id, dep.name);
            }
        }

        progress(3, totalSteps, 'Migrando equipos');
        await assertSupabase(
            supabaseOrders.from('maintenance_equipment')
                .update({ company_id: target.id })
                .eq('company_id', source.id)
        );

        progress(4, totalSteps, 'Reasignando reportes');
        const reportsList = allSourceReports;
        if (reportsList.length > 0) {
            progress(0, reportsList.length, 'Actualizando snapshots');
            for (let i = 0; i < reportsList.length; i++) {
                const report = reportsList[i];
                const nextDependencyId = report.dependency_id && dependencyIdMap.has(report.dependency_id)
                    ? dependencyIdMap.get(report.dependency_id)
                    : report.dependency_id;

                const snapshot = report.equipment_snapshot && typeof report.equipment_snapshot === 'object'
                    ? report.equipment_snapshot
                    : {};
                const nextSnapshot = { ...snapshot, companyName: target.name };
                if (report.dependency_id && dependencyNameMap.has(report.dependency_id)) {
                    nextSnapshot.dependencyName = dependencyNameMap.get(report.dependency_id);
                }

                await assertSupabase(
                    supabaseOrders.from('maintenance_reports')
                        .update({
                            company_id: target.id,
                            dependency_id: nextDependencyId || null,
                            equipment_snapshot: nextSnapshot
                        })
                        .eq('id', report.id)
                );

                if ((i + 1) % 10 === 0 || i === reportsList.length - 1) {
                    progress(i + 1, reportsList.length, 'Actualizando snapshots');
                    await sleepFrame();
                }
            }
        }

        progress(5, totalSteps, 'Reasignando órdenes');
        await assertSupabase(
            supabaseOrders.from('orders')
                .update({ clientId: target.id })
                .eq('clientId', source.id)
        );

        progress(6, totalSteps, 'Limpieza final');
        // Un último empuje a cualquier dependency/equipment/report rezagado (fallback agresivo)
        await supabaseOrders.from('maintenance_equipment').update({ company_id: target.id }).eq('company_id', source.id);
        await supabaseOrders.from('maintenance_dependencies').update({ company_id: target.id }).eq('company_id', source.id);
        await supabaseOrders.from('maintenance_reports').update({ company_id: target.id }).eq('company_id', source.id);
        
        // Esperamos 1.5s para que supabase termine commits
        await new Promise(r => setTimeout(r, 1500));

        const cleanupStats = await getCompanyStats(source.id, new Map());
        if (cleanupStats.reports === 0 && cleanupStats.equipment === 0 && cleanupStats.dependencies === 0) {
            await assertSupabase(
                supabaseOrders.from('maintenance_companies')
                    .delete()
                    .eq('id', source.id)
            );
        } else {
            // Intento secundario asíncrono
            const errorMsg = `No se logró eliminar "${source.name}". Quedan atados: ${cleanupStats.reports} Reportes, ${cleanupStats.equipment} Equipos, ${cleanupStats.dependencies} Deps. Refresca y escanea de nuevo.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        if (refreshAfter) {
            await refreshLocalState();
        }
        if (notifyAfter) {
            UI.showAppNotification('Empresas unificadas con éxito.', 'success');
        }
    } finally {
        if (manageProgress) setProgressVisible(false);
        if (manageBusy) setBusyState(false);
    }
}

async function refreshLocalState() {
    const [companies, dependencies, equipment, reportsResult, historicalNames] = await Promise.all([
        fetchCompanies(),
        fetchDependencies(),
        fetchEquipment(),
        fetchAllReports(State.currentPage, State.itemsPerPage, State.filters),
        fetchUniqueNamesFromSnapshots()
    ]);

    State.setCompanies(companies);
    State.setDependencies(dependencies);
    State.setEquipmentList(equipment);
    State.setReports(reportsResult.reports, reportsResult.total);
    State.setHistoricalCompanyNames(historicalNames);
    UI.populateFilterDropdowns();
    UI.renderAdminReportsTable();
}

function calcSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    const distance = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const v0 = new Array(b.length + 1).fill(0);
    const v1 = new Array(b.length + 1).fill(0);

    for (let i = 0; i < v0.length; i++) v0[i] = i;

    for (let i = 0; i < a.length; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1;
            v1[j + 1] = Math.min(
                v1[j] + 1,
                v0[j + 1] + 1,
                v0[j] + cost
            );
        }
        for (let j = 0; j < v0.length; j++) v0[j] = v1[j];
    }
    return v1[b.length];
}

async function assertSupabase(promise: Promise<{ error: any }>) {
    const { error } = await promise;
    if (error) throw error;
}
