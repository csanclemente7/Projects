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
        await handleUserMessage('Buscar duplicadas');
    });

}

function setBusyState(next: boolean) {
    isBusy = next;
    const scanBtn = document.getElementById('company-merge-scan') as HTMLButtonElement | null;
    if (scanBtn) scanBtn.disabled = next;
}

function clearChat() {
    const chatFlow = document.getElementById('company-merge-flow');
    if (!chatFlow) return;
    chatFlow.innerHTML = `
        <div class="message ai">
            Haz clic en "Buscar duplicadas" para detectar empresas similares.
            <br>Luego confirma la sugerencia de Macris AI para unificar.
        </div>
    `;
    duplicateGroups = [];
    duplicateGroupIndex = 0;
    statsByCompany = new Map<string, CompanyStats>();
    clearGroupContainer();
    setProgressVisible(false);
}

async function handleUserMessage(text: string) {
    const command = text.toLowerCase();
    appendMessage(text, 'user');

    if (isBusy) {
        appendMessage('Estoy procesando una solicitud. Espera un momento...', 'ai');
        return;
    }

    if (command.includes('como funciona') || command.includes('explica')) {
        appendHtmlMessage(EXPLANATION_HTML, 'ai');
        return;
    }

    if (command.includes('duplicad') || command.includes('buscar') || command.includes('unificar')) {
        await scanForDuplicates();
        return;
    }

    appendMessage('Para iniciar, haz clic en "Buscar duplicadas".', 'ai');
}

function appendMessage(text: string, role: 'user' | 'ai' | 'thinking') {
    const chatFlow = document.getElementById('company-merge-flow');
    if (!chatFlow) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.textContent = text;
    chatFlow.appendChild(msgDiv);
    chatFlow.scrollTop = chatFlow.scrollHeight;
}

function appendHtmlMessage(html: string, role: 'user' | 'ai' | 'thinking') {
    const chatFlow = document.getElementById('company-merge-flow');
    if (!chatFlow) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = html;
    chatFlow.appendChild(msgDiv);
    chatFlow.scrollTop = chatFlow.scrollHeight;
}

function appendNode(node: HTMLElement) {
    const chatFlow = document.getElementById('company-merge-flow');
    if (!chatFlow) return;
    chatFlow.appendChild(node);
    chatFlow.scrollTop = chatFlow.scrollHeight;
}

function ensureGroupContainer(): HTMLElement | null {
    const chatFlow = document.getElementById('company-merge-flow');
    if (!chatFlow) return null;
    let container = document.getElementById('company-merge-group-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'company-merge-group-container';
        chatFlow.appendChild(container);
    }
    return container;
}

function clearGroupContainer() {
    const container = document.getElementById('company-merge-group-container');
    if (container) container.remove();
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
        clearGroupContainer();
        duplicateGroups = [];
        duplicateGroupIndex = 0;
        let companies = State.companies;
        if (!companies || companies.length === 0) {
            companies = await fetchCompanies();
            State.setCompanies(companies);
        }

        if (companies.length < 2) {
            appendMessage('No hay suficientes empresas para comparar.', 'ai');
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
            appendMessage('No encontré empresas duplicadas con similitud superior al 80%.', 'ai');
            setProgressVisible(false);
            setBusyState(false);
            return;
        }

        appendMessage(`Detecté ${candidates.length} posibles duplicados. Calculando peso de datos...`, 'ai');

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
            appendMessage('No encontré grupos claros de duplicados. Revisa manualmente.', 'ai');
            return;
        }

        renderDuplicateGroup(duplicateGroupIndex);
        appendMessage('Listo. Navega por fases con Anterior / Siguiente.', 'ai');
    } catch (error: any) {
        console.error('Scan error:', error);
        appendMessage('Ocurrió un error al analizar duplicados.', 'ai');
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
            clearGroupContainer();
            appendMessage('No quedan grupos pendientes de unificación.', 'ai');
            return;
        }
        const ids = collectGroupCompanyIds(duplicateGroups);
        statsByCompany = await buildCompanyStatsMap(ids);
        duplicateGroupIndex = Math.min(duplicateGroupIndex, duplicateGroups.length - 1);
        renderDuplicateGroup(duplicateGroupIndex);
    } catch (error: any) {
        console.error('Refresh groups error:', error);
        appendMessage('No se pudieron actualizar los grupos. Puedes reintentar.', 'ai');
    } finally {
        setProgressVisible(false);
        setBusyState(false);
    }
}

function renderDuplicateGroup(index: number) {
    if (duplicateGroups.length === 0) return;
    const container = ensureGroupContainer();
    if (!container) return;

    duplicateGroupIndex = Math.max(0, Math.min(index, duplicateGroups.length - 1));
    const group = duplicateGroups[duplicateGroupIndex];
    const companyMap = new Map(State.companies.map(c => [c.id, c]));
    const cityMap = new Map(State.cities.map(city => [city.id, city.name]));
    const companies = group.ids.map(id => companyMap.get(id)).filter(Boolean) as Company[];

    if (companies.length < 2) {
        syncGroupsWithState();
        if (duplicateGroups.length === 0) {
            clearGroupContainer();
            appendMessage('No quedan grupos pendientes de unificación.', 'ai');
            return;
        }
        renderDuplicateGroup(duplicateGroupIndex);
        return;
    }

    const preferredTarget = group.preferredTargetId ? companyMap.get(group.preferredTargetId) : undefined;
    const target = preferredTarget || pickTargetFromGroup(companies, statsByCompany);
    group.preferredTargetId = target.id;
    const targetName = resolveTargetName(group, target);
    group.preferredTargetName = targetName;
    const targetOptions = companies.map(c => `<option value="${c.id}" ${c.id === target.id ? 'selected' : ''}>${c.name}</option>`).join('');
    const companyRows = companies.map(c => {
        const stats = statsByCompany.get(c.id) || { reports: 0, equipment: 0, dependencies: 0 };
        return `
            <div style="background: var(--bg-input); border: 1px solid var(--border); padding: 8px; border-radius: 8px;">
                <div style="font-weight: 600;">${c.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-dim);">
                    Reportes: ${stats.reports} · Equipos: ${stats.equipment} · Dependencias: ${stats.dependencies}
                </div>
            </div>
        `;
    }).join('');

    const mergeRows = companies
        .filter(c => c.id !== target.id)
        .map(c => `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--bg-input); border: 1px solid var(--border); padding: 8px; border-radius: 8px;">
                <div style="font-size: 0.8rem;">
                    Unificar <strong>${c.name}</strong> <span style="color: var(--text-dim);">(${cityMap.get(c.cityId) || 'N/A'})</span> -> <span data-role="merge-target-label">${targetName}</span>
                </div>
                <button class="btn btn-success btn-compact merge-company-btn" data-source-id="${c.id}" data-target-id="${target.id}">Unificar</button>
            </div>
        `).join('');

    const canMergeAll = companies.some(c => c.id !== target.id);

    container.innerHTML = `
        <div class="message ai">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                <div style="font-weight: 700; color: var(--primary); text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.8px;">
                    Fase ${duplicateGroupIndex + 1}/${duplicateGroups.length}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-success btn-compact merge-all-btn" ${canMergeAll ? '' : 'disabled'}>Unificar todas</button>
                    <button class="btn btn-secondary btn-compact merge-prev-btn" ${duplicateGroupIndex === 0 ? 'disabled' : ''}>Anterior</button>
                    <button class="btn btn-secondary btn-compact merge-next-btn" ${duplicateGroupIndex === duplicateGroups.length - 1 ? 'disabled' : ''}>Siguiente</button>
                </div>
            </div>
            <div style="margin-top: 10px; font-size: 0.75rem; color: var(--text-dim);">
                Empresas detectadas en este grupo: ${companies.length}
            </div>
            <div style="margin-top: 12px; display: grid; gap: 8px;">
                ${companyRows}
            </div>
            <div style="margin-top: 12px;">
                <label style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px;">Target</label>
                <select class="merge-target-select" style="margin-top: 6px; width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: white; padding: 10px 12px; border-radius: 6px; font-family: inherit; font-size: 0.85rem;">
                    ${targetOptions}
                </select>
            </div>
            <div style="margin-top: 12px;">
                <label style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.6px;">Nombre principal (sin tildes)</label>
                <input class="merge-target-name-input" type="text" value="${targetName}" style="margin-top: 6px; width: 100%; background: var(--bg-input); border: 1px solid var(--border); color: white; padding: 10px 12px; border-radius: 6px; font-family: inherit; font-size: 0.85rem;" />
            </div>
            <div style="margin-top: 12px; display: grid; gap: 8px;">
                ${mergeRows || '<div style="font-size: 0.8rem; color: var(--text-dim);">No hay otras empresas para unificar en este grupo.</div>'}
            </div>
        </div>
    `;

    const prevBtn = container.querySelector('.merge-prev-btn') as HTMLButtonElement | null;
    const nextBtn = container.querySelector('.merge-next-btn') as HTMLButtonElement | null;
    const targetSelect = container.querySelector('.merge-target-select') as HTMLSelectElement | null;
    const targetNameInput = container.querySelector('.merge-target-name-input') as HTMLInputElement | null;
    const mergeButtons = Array.from(container.querySelectorAll('.merge-company-btn')) as HTMLButtonElement[];
    const mergeAllBtn = container.querySelector('.merge-all-btn') as HTMLButtonElement | null;

    const setTargetName = (nextName: string) => {
        const cleaned = sanitizeCompanyName(nextName);
        const resolved = cleaned || sanitizeCompanyName(target.name);
        group.preferredTargetName = resolved;
        if (targetNameInput && targetNameInput.value !== resolved) {
            targetNameInput.value = resolved;
        }
        updateMergeTargetLabels(container, resolved);
    };

    prevBtn?.addEventListener('click', () => {
        if (isBusy) return;
        renderDuplicateGroup(duplicateGroupIndex - 1);
    });
    nextBtn?.addEventListener('click', () => {
        if (isBusy) return;
        renderDuplicateGroup(duplicateGroupIndex + 1);
    });

    targetSelect?.addEventListener('change', () => {
        if (!targetSelect || isBusy) return;
        group.preferredTargetId = targetSelect.value;
        const selected = companyMap.get(targetSelect.value);
        group.preferredTargetName = selected ? sanitizeCompanyName(selected.name) : undefined;
        renderDuplicateGroup(duplicateGroupIndex);
    });

    targetNameInput?.addEventListener('input', () => {
        if (!targetNameInput || isBusy) return;
        setTargetName(targetNameInput.value);
    });

    mergeAllBtn?.addEventListener('click', async () => {
        if (isBusy) return;
        const targetName = resolveTargetName(group, target);
        const sources = companies.filter(c => c.id !== target.id);
        if (sources.length === 0) {
            UI.showAppNotification('No hay empresas para unificar en este grupo.', 'info');
            return;
        }
        const confirmed = await UI.showConfirmationModal(
            `¿Desea unificar ${sources.length} empresas dentro de "${targetName}"? Esta acción es irreversible.`,
            'Unificar todas'
        );
        if (!confirmed) return;

        try {
            const finalTargetName = await ensureTargetName(target, targetName);
            setBusyState(true);
            setProgressVisible(true);
            updateProgress(0, sources.length, 'Unificando empresas');
            appendMessage(`Iniciando fusión masiva: ${sources.length} empresas -> ${finalTargetName}.`, 'ai');

            for (let i = 0; i < sources.length; i++) {
                updateProgress(i + 1, sources.length, `Unificando ${sources[i].name}`);
                await mergeCompanies(target, sources[i], {
                    manageBusy: false,
                    manageProgress: false,
                    refreshAfter: false,
                    notifyAfter: false
                });
                await sleepFrame();
            }

            await refreshLocalState();
            await refreshGroupsAfterMerge();
            appendMessage(`Fusión masiva completada: ${sources.length} empresas -> ${finalTargetName}.`, 'ai');
            UI.showAppNotification('Empresas unificadas con éxito.', 'success');
        } catch (error: any) {
            console.error('Merge all error:', error);
            UI.showAppNotification(`Error al unificar todas: ${error.message}`, 'error');
        } finally {
            setProgressVisible(false);
            setBusyState(false);
        }
    });

    mergeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const sourceId = btn.dataset.sourceId;
            const targetId = btn.dataset.targetId;
            if (!sourceId || !targetId || sourceId === targetId) return;
            if (isBusy) return;
            const targetCompany = companyMap.get(targetId);
            const sourceCompany = companyMap.get(sourceId);
            if (!targetCompany || !sourceCompany) {
                UI.showAppNotification('No se encontró la empresa seleccionada.', 'warning');
                return;
            }
            const targetName = resolveTargetName(group, targetCompany);
            const confirmed = await UI.showConfirmationModal(
                `¿Desea unificar "${sourceCompany.name}" dentro de "${targetName}"? Esta acción es irreversible.`,
                'Unificar'
            );
            if (!confirmed) return;
            try {
                const finalTargetName = await ensureTargetName(targetCompany, targetName);
                await mergeCompanies(targetCompany, sourceCompany);
                appendMessage(`Fusión completada: ${sourceCompany.name} -> ${finalTargetName}.`, 'ai');
                await refreshGroupsAfterMerge();
            } catch (error: any) {
                console.error('Merge error:', error);
                UI.showAppNotification(`Error al unificar: ${error.message}`, 'error');
            }
        });
    });
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

        const { data: sourceReports, error: reportsError } = await supabaseOrders
            .from('maintenance_reports')
            .select('id, equipment_snapshot, dependency_id')
            .eq('company_id', source.id);
        if (reportsError) throw reportsError;

        progress(2, totalSteps, 'Transferencia de dependencias');
        for (const dep of sourceDeps) {
            const normalizedName = normalizeString(dep.name);
            const match = dependencyMap.get(normalizedName);
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
        const reportsList = (sourceReports || []) as any[];
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
        const cleanupStats = await getCompanyStats(source.id, new Map());
        if (cleanupStats.reports === 0 && cleanupStats.equipment === 0 && cleanupStats.dependencies === 0) {
            await assertSupabase(
                supabaseOrders.from('maintenance_companies')
                    .delete()
                    .eq('id', source.id)
            );
        } else {
            UI.showAppNotification(
                `No se eliminó "${source.name}" porque aún tiene registros asociados.`,
                'warning'
            );
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
