/**
 * sede-cleanup.ts — Herramienta Supervisada de Limpieza de Sedes
 * 
 * Permite al admin agrupar empresas que realmente son sedes de una empresa central
 * (ej: "MEDIC IPS - SEDE GUACARI" → Sede "Guacarí" de empresa "IPS MEDIC").
 * 
 * Flujo: Escanear → Revisar grupos → Editar nombres → Confirmar → Migrar en cascada.
 */

import * as State from './state';
import * as UI from './ui';
import { supabaseOrders, supabaseClients, fetchCompanies, markCompanyAsResidential, fetchDependencies } from './api';
import { fuzzyNormalize } from './utils';
import type { Company } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

type CompanyStats = {
    reports: number;
    equipment: number;
    dependencies: number;
};

type SedeGroupEntry = {
    companyId: string;
    companyName: string;
    suggestedSedeName: string;
    stats: CompanyStats;
    isTarget: boolean; // true = this will be the central company
    cityName: string;
};

type SedeGroup = {
    centralName: string;
    entries: SedeGroupEntry[];
};

// ─── Module State ────────────────────────────────────────────────────────────

let isBusy = false;
let sedeGroups: SedeGroup[] = [];
let currentGroupIndex = 0;

// ─── Init ────────────────────────────────────────────────────────────────────

export function initSedeCleanup() {
    const openBtn = document.getElementById('sede-cleanup-btn');
    const modal = document.getElementById('sede-cleanup-modal');
    const closeBtn = document.getElementById('close-sede-cleanup-modal');
    const scanBtn = document.getElementById('sede-cleanup-scan') as HTMLButtonElement | null;

    openBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'flex';
    });

    closeBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
    });

    scanBtn?.addEventListener('click', async () => {
        await scanForSedeGroups();
    });
}

// ─── Busy & Progress ─────────────────────────────────────────────────────────

function setBusy(next: boolean) {
    isBusy = next;
    const scanBtn = document.getElementById('sede-cleanup-scan') as HTMLButtonElement | null;
    if (scanBtn) scanBtn.disabled = next;
}

function setProgressVisible(visible: boolean) {
    const progress = document.getElementById('sede-cleanup-progress');
    const bar = document.getElementById('sede-cleanup-progress-bar') as HTMLElement | null;
    if (progress) progress.style.display = visible ? 'block' : 'none';
    if (bar && !visible) bar.style.width = '0%';
}

function updateProgress(current: number, total: number, label: string) {
    const textEl = document.getElementById('sede-cleanup-progress-text');
    const bar = document.getElementById('sede-cleanup-progress-bar') as HTMLElement | null;
    if (textEl) textEl.textContent = `${label} (${current}/${total})`;
    if (bar) {
        const safeTotal = total > 0 ? total : 1;
        bar.style.width = `${Math.min(100, Math.round((current / safeTotal) * 100))}%`;
    }
}

function sleepFrame() {
    return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

// ─── Name Extraction ─────────────────────────────────────────────────────────

const SEDE_KEYWORDS = /\b(sede|suc|sucursal|laboratorio|lab|oficinas?|pac|troncal|sos)\b/gi;
const SEPARATORS = /\s*[-–—·•|/\\]\s*/g;

/**
 * Extrae el nombre de la sede a partir del nombre completo de la empresa.
 * Ej: "MEDIC IPS - SEDE GUACARI" → "Guacarí"
 *     "MEDIC IPS CALI TEQUENDAMA" → "Cali Tequendama"
 *     "Medic laboratorio Cali" → "Laboratorio Cali"
 */
function extractSedeName(fullName: string, centralTokens: string[]): string {
    if (!fullName) return fullName;

    let working = fullName.trim();

    // Quitamos los tokens de la empresa central
    for (const token of centralTokens) {
        // Case-insensitive remove each token word
        const re = new RegExp(`\\b${escapeRegex(token)}\\b`, 'gi');
        working = working.replace(re, '');
    }

    // Limpiar separadores sobrantes
    working = working.replace(SEPARATORS, ' ').trim();
    // Limpiar prefix "SEDE", "SUC" etc. si queda al inicio
    working = working.replace(/^\s*(sede|suc|sucursal)\s*/i, '');
    working = working.trim();

    if (!working) return fullName; // Si no queda nada, usar el nombre original

    // Capitalizar
    return toTitleCase(working);
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, txt =>
        txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
    );
}

/**
 * Dada una lista de nombres de empresas similares, encuentra los tokens "centrales"
 * que aparecen en la mayoría. Ej: ["MEDIC IPS CALI TEQUENDAMA", "MEDIC IPS - SEDE GUACARI"] → ["medic", "ips"]
 */
function findCentralTokens(names: string[]): string[] {
    if (names.length === 0) return [];

    const allTokenSets = names.map(n =>
        n.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(SEPARATORS, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1)
    );

    const tokenCounts = new Map<string, number>();
    allTokenSets.forEach(tokens => {
        const unique = new Set(tokens);
        unique.forEach(t => tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1));
    });

    const threshold = Math.ceil(names.length * 0.6);
    const centralTokens = Array.from(tokenCounts.entries())
        .filter(([_, count]) => count >= threshold)
        .filter(([token]) => !SEDE_KEYWORDS.test(token) && !/^\d+$/.test(token))
        .map(([token]) => token);

    // Reset regex lastIndex since we used 'g' flag
    SEDE_KEYWORDS.lastIndex = 0;

    return centralTokens;
}

function buildCentralName(tokens: string[]): string {
    if (tokens.length === 0) return 'Empresa';
    return tokens.map(t => t.toUpperCase()).join(' ');
}

// ─── Similarity helpers (reused from company-merge logic) ────────────────────

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
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j < v0.length; j++) v0[j] = v1[j];
    }
    return v1[b.length];
}

function calcSimilarity(a: string, b: string): number {
    if (!a && !b) return 1;
    const dist = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

function calcSimilarityAdv(a: string, b: string): number {
    const simLev = calcSimilarity(a, b);
    
    // Token intersection for bag-of-words similarity (Overlap coefficient)
    const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 2 && !SEDE_KEYWORDS.test(t)));
    const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 2 && !SEDE_KEYWORDS.test(t)));
    
    let intersection = 0;
    tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });
    
    const minLen = Math.min(tokensA.size, tokensB.size);
    const overlap = minLen === 0 ? 0 : intersection / minLen;
    
    // If they share at least 2 core words and overlap is high
    if (intersection >= 2 && overlap >= 0.75) return 0.85;

    return Math.max(simLev, overlap * 0.7);
}

// ─── Scan ────────────────────────────────────────────────────────────────────

const MIN_SIMILARITY = 0.72; // Tuned threshold: strict enough to avoid mixing unrelated companies

async function scanForSedeGroups() {
    setBusy(true);
    setProgressVisible(true);
    const container = document.getElementById('sede-cleanup-dashboard');
    if (container) container.innerHTML = '';

    try {
        // 1. Load companies
        let companies = State.companies;
        if (!companies || companies.length === 0) {
            companies = await fetchCompanies();
            State.setCompanies(companies);
        }

        if (companies.length < 2) {
            UI.showAppNotification('No hay suficientes empresas.', 'info');
            setProgressVisible(false);
            setBusy(false);
            return;
        }

        // 2. Focus only on unbound corporate companies
        const candidateCompanies = companies.filter(c => !c.clientId && c.category !== 'residencial');
        updateProgress(0, 1, `Encontradas ${candidateCompanies.length} empresas corporativas sin unificar`);
        await sleepFrame();

        if (candidateCompanies.length === 0) {
            if (container) container.innerHTML = emptyStateHtml('No hay sedes corporativas pendientes por agrupar. ¡Base de datos limpia!');
            setProgressVisible(false);
            setBusy(false);
            return;
        }

        // 4. Build similarity groups using union-find
        const normalized = candidateCompanies.map(c => ({
            company: c,
            norm: fuzzyNormalize(c.name)
        }));

        const totalPairs = (normalized.length * (normalized.length - 1)) / 2;
        let checked = 0;

        // Union-Find
        const parent = new Map<string, string>();
        normalized.forEach(n => parent.set(n.company.id, n.company.id));

        const find = (id: string): string => {
            const p = parent.get(id) || id;
            if (p === id) return p;
            const root = find(p);
            parent.set(id, root);
            return root;
        };
        const union = (a: string, b: string) => {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent.set(rb, ra);
        };

        updateProgress(0, totalPairs, 'Analizando similitud');

        for (let i = 0; i < normalized.length; i++) {
            for (let j = i + 1; j < normalized.length; j++) {
                const a = normalized[i], b = normalized[j];
                const sim = calcSimilarityAdv(a.norm, b.norm);
                if (sim >= MIN_SIMILARITY) {
                    union(a.company.id, b.company.id);
                }
                checked++;
                if (checked % 200 === 0) {
                    updateProgress(checked, totalPairs, 'Analizando similitud');
                    await sleepFrame();
                }
            }
        }

        updateProgress(totalPairs, totalPairs, 'Agrupando resultados');
        await sleepFrame();

        // 5. Build groups
        const groupsMap = new Map<string, Set<string>>();
        normalized.forEach(n => {
            const root = find(n.company.id);
            if (!groupsMap.has(root)) groupsMap.set(root, new Set());
            groupsMap.get(root)!.add(n.company.id);
        });

        const multiGroups = Array.from(groupsMap.values())
            .filter(set => set.size >= 2)
            .map(set => Array.from(set));

        const soloIds = Array.from(groupsMap.values())
            .filter(set => set.size === 1)
            .flatMap(set => Array.from(set));

        if (multiGroups.length === 0 && soloIds.length === 0) {
            if (container) container.innerHTML = emptyStateHtml('Todas las empresas parecen estar agrupadas o no hay similitudes.');
            setProgressVisible(false);
            setBusy(false);
            return;
        }

        // 6. Build company stats for all grouped IDs
        const allIds = [...multiGroups.flatMap(g => g), ...soloIds];
        updateProgress(0, allIds.length, 'Calculando peso de datos');

        const statsMap = await buildStatsMap(allIds);

        // 7. Build SedeGroup objects
        const companyMap = new Map(companies.map(c => [c.id, c]));

        sedeGroups = multiGroups.map(ids => {
            const names = ids.map(id => companyMap.get(id)?.name || '');
            const centralTokens = findCentralTokens(names);
            const centralName = buildCentralName(centralTokens);

            let bestId = ids[0];
            let bestResidualLen = Infinity;
            let bestDataScore = -1;
            ids.forEach(id => {
                const name = companyMap.get(id)?.name || '';
                const residual = extractSedeName(name, centralTokens).trim();
                const residualLen = residual.length;
                const s = statsMap.get(id);
                const dataScore = s ? (s.reports * 100000 + s.equipment * 100 + s.dependencies) : 0;
                if (residualLen < bestResidualLen || (residualLen === bestResidualLen && dataScore > bestDataScore)) {
                    bestResidualLen = residualLen;
                    bestDataScore = dataScore;
                    bestId = id;
                }
            });

            const entries = ids.map(id => {
                const c = companyMap.get(id);
                const stats = statsMap.get(id) || { reports: 0, equipment: 0, dependencies: 0 };
                return {
                    companyId: id,
                    companyName: c.name,
                    suggestedSedeName: extractSedeName(c.name, centralTokens),
                    stats,
                    isTarget: id === bestId,
                    cityName: State.cities.find(ct => ct.id === c.cityId)?.name || 'Sin ciudad'
                };
            });

            entries.sort((a, b) => {
                if (a.isTarget && !b.isTarget) return -1;
                if (!a.isTarget && b.isTarget) return 1;
                return b.stats.reports - a.stats.reports;
            });

            return { centralName, entries };
        });

        if (soloIds.length > 0) {
            for (const id of soloIds) {
                const c = companyMap.get(id);
                if (!c) continue;
                const stats = statsMap.get(id) || { reports: 0, equipment: 0, dependencies: 0 };
                
                // Tratar cada empresa individual como un grupo por sí sola.
                // Así el usuario puede convertirla en una Sede (añadiendo padre) o sumarle otras buscando
                sedeGroups.push({
                    centralName: c.name,
                    entries: [{
                        companyId: id,
                        companyName: c.name,
                        suggestedSedeName: extractSedeName(c.name, []) || c.name,
                        stats,
                        isTarget: true, // It is the base target initially
                        cityName: State.cities.find(ct => ct.id === c.cityId)?.name || 'Sin ciudad'
                    }]
                });
            }
        }

        // Sort groups by total reports desc
        sedeGroups.sort((a, b) => {
            const sumA = a.entries.reduce((s, e) => s + e.stats.reports, 0);
            const sumB = b.entries.reduce((s, e) => s + e.stats.reports, 0);
            return sumB - sumA;
        });

        currentGroupIndex = 0;
        setProgressVisible(false);
        renderGroupUI(currentGroupIndex);
        UI.showAppNotification(`Escaneo completo. ${sedeGroups.length} grupos detectados.`, 'success');

    } catch (err: any) {
        console.error('Sede scan error:', err);
        UI.showAppNotification(`Error al escanear: ${err.message}`, 'error');
    } finally {
        setProgressVisible(false);
        setBusy(false);
    }
}

// ─── Stats ───────────────────────────────────────────────────────────────────

async function buildStatsMap(companyIds: string[]): Promise<Map<string, CompanyStats>> {
    const map = new Map<string, CompanyStats>();
    companyIds.forEach(id => map.set(id, { reports: 0, equipment: 0, dependencies: 0 }));
    if (companyIds.length === 0) return map;

    const chunkSize = 200;
    const pageSize = 1000;

    const fetchCounts = async (table: string, column: string) => {
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
                const rows = (data || []) as any[];
                rows.forEach(row => {
                    const id = row[column];
                    if (!id) return;
                    const s = map.get(id);
                    if (s) (s as any)[table === 'maintenance_reports' ? 'reports' : table === 'maintenance_equipment' ? 'equipment' : 'dependencies']++;
                });
                if (rows.length < pageSize) break;
                from += pageSize;
            }
        }
    };

    await fetchCounts('maintenance_reports', 'company_id');
    await fetchCounts('maintenance_equipment', 'company_id');
    await fetchCounts('maintenance_dependencies', 'company_id');

    return map;
}

// ─── Render Group UI (Supervised) ────────────────────────────────────────────

function emptyStateHtml(message: string): string {
    return `<div style="text-align: center; color: var(--text-dim); padding: 40px; font-size: 0.95rem;">
        <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5; color: var(--success);"></i><br>
        ${message}
    </div>`;
}

function renderGroupUI(index: number) {
    const container = document.getElementById('sede-cleanup-dashboard');
    if (!container || sedeGroups.length === 0) return;
    container.innerHTML = '';

    currentGroupIndex = Math.max(0, Math.min(index, sedeGroups.length - 1));
    const group = sedeGroups[currentGroupIndex];
    const totalReports = group.entries.reduce((s, e) => s + e.stats.reports, 0);

    // ─ NAVIGATION
    const navHtml = `
        <div style="background: var(--bg-card); padding: 15px; border-radius: 8px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <div>
                <span style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">Grupo ${currentGroupIndex + 1} de ${sedeGroups.length}</span>
                <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px;">
                    ${group.entries.length} sedes · ${totalReports} reportes totales
                </div>
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-secondary sede-nav-prev" ${currentGroupIndex === 0 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i> Anterior</button>
                <button class="btn btn-secondary sede-nav-next" ${currentGroupIndex === sedeGroups.length - 1 ? 'disabled' : ''}>Siguiente <i class="fas fa-chevron-right"></i></button>
            </div>
        </div>
    `;

    // ─ CENTRAL COMPANY NAME
    const centralHtml = `
        <div style="background: rgba(var(--color-primary-rgb, 10,199,212), 0.05); border: 2px solid var(--primary); border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--primary); margin-bottom: 10px; letter-spacing: 0.5px;">
                <i class="fas fa-building"></i> Nombre de la Empresa Principal
            </div>
            <input type="text" class="sede-central-name-input" value="${escapeHtml(group.centralName)}" 
                   style="width: 100%; background: var(--bg-input); border: 1px solid var(--border); padding: 12px; border-radius: 8px; font-weight: bold; color: var(--primary); font-size: 1.1rem; box-sizing: border-box;" />
            <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 8px;">
                <i class="fas fa-info-circle"></i> Este será el nombre oficial de la empresa. Todas las entradas de abajo se convertirán en <strong>sedes</strong> bajo esta empresa.
            </div>
        </div>
    `;

    // ─ ALL ENTRIES ARE SEDES — each gets an editable sede name
    const sedeRows = group.entries.map((entry, i) => {
        const removeBtn = group.entries.length > 2
            ? `<button class="sede-remove-entry" data-company-id="${entry.companyId}" title="Quitar del grupo"
                       style="position: absolute; top: 8px; right: 8px; background: rgba(255,60,60,0.15); border: 1px solid rgba(255,60,60,0.3); color: #ff6b6b; width: 26px; height: 26px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"
                       onmouseover="this.style.background='rgba(255,60,60,0.3)'" onmouseout="this.style.background='rgba(255,60,60,0.15)'">
                   <i class="fas fa-times"></i>
               </button>`
            : '';

        return `
            <div style="background: rgba(255,165,0,0.03); border: 1px solid rgba(255,165,0,0.25); padding: 15px; border-radius: 10px; position: relative;">
                ${removeBtn}
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; padding-right: ${group.entries.length > 2 ? '30px' : '0'};">
                    <div style="flex: 1; min-width: 200px;">
                        <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 8px;">
                            Registro actual: <strong style="color: var(--text);">${escapeHtml(entry.companyName)}</strong> <span style="background: rgba(var(--color-primary-rgb, 10,199,212), 0.15); color: var(--primary); padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 600; margin-left: 6px;"><i class="fas fa-map-pin"></i> ${escapeHtml(entry.cityName)}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 0.7rem; color: #ffad33; white-space: nowrap;"><i class="fas fa-map-marker-alt"></i> Nombre de sede:</span>
                            <input type="text" class="sede-name-input" data-index="${i}" value="${escapeHtml(entry.suggestedSedeName)}"
                                   style="flex: 1; background: var(--bg-input); border: 1px solid var(--border); padding: 8px; border-radius: 6px; color: white; font-size: 0.85rem; font-weight: 600;" />
                            
                            <button class="btn btn-primary btn-sm sede-mark-residential" data-company-id="${entry.companyId}" style="margin-left:auto; padding: 5px 12px; font-size:0.75rem;">
                                👤 Marcar como Residencial
                            </button>
                        </div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-dim); text-align: right; white-space: nowrap;">
                        <i class="fas fa-file-alt"></i> ${entry.stats.reports} Rep<br>
                        <i class="fas fa-tools"></i> ${entry.stats.equipment} Eq<br>
                        <i class="fas fa-sitemap"></i> ${entry.stats.dependencies} Dep
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // ─ SEARCH BAR to add more sedes
    const searchHtml = `
        <div style="margin-bottom: 20px; position: relative;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <i class="fas fa-plus-circle" style="color: var(--primary); font-size: 0.8rem;"></i>
                <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px;">Agregar más sedes al grupo</span>
            </div>
            <input type="text" class="sede-search-input" placeholder="Buscar empresa por nombre para agregar como sede..."
                   style="width: 100%; background: var(--bg-input); border: 1px solid var(--border); padding: 10px 12px; border-radius: 8px; color: var(--text); font-size: 0.85rem; box-sizing: border-box;" 
                   autocomplete="off" />
            <div class="sede-search-results" style="display: none; position: absolute; left: 0; right: 0; top: 100%; z-index: 100; max-height: 200px; overflow-y: auto; background: var(--bg-card); border: 1px solid var(--primary); border-top: none; border-radius: 0 0 8px 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.4);"></div>
        </div>
    `;

    const advancedHtml = '';

    // ─ ACTION BUTTONS
    const actionsHtml = `
        <div style="display: flex; gap: 12px; justify-content: flex-end; padding-top: 15px; border-top: 1px dashed var(--border);">
            <button class="btn btn-secondary sede-skip-btn"><i class="fas fa-forward"></i> Omitir este grupo</button>
            <button class="btn btn-primary sede-apply-btn" style="font-weight: 700; padding: 10px 25px;">
                <i class="fas fa-layer-group"></i> Aplicar Conversión a Sedes
            </button>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = navHtml + centralHtml + `
        <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #ffad33; margin-bottom: 12px; letter-spacing: 0.5px;">
            <i class="fas fa-map-marked-alt"></i> Sedes a unificar
        </div>
        <div style="display: grid; gap: 12px; margin-bottom: 20px;">
            ${sedeRows}
        </div>
    ` + searchHtml + advancedHtml + actionsHtml;

    container.appendChild(wrapper);

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════════════════════

    // Navigation
    wrapper.querySelector('.sede-nav-prev')?.addEventListener('click', () => { if (!isBusy) renderGroupUI(currentGroupIndex - 1); });
    wrapper.querySelector('.sede-nav-next')?.addEventListener('click', () => { if (!isBusy) renderGroupUI(currentGroupIndex + 1); });

    // Central name input
    const centralInput = wrapper.querySelector('.sede-central-name-input') as HTMLInputElement | null;
    centralInput?.addEventListener('input', () => {
        group.centralName = centralInput.value.trim();
    });

    // Sede name inputs (ALL entries have editable sede names now)
    wrapper.querySelectorAll('.sede-name-input').forEach(input => {
        (input as HTMLInputElement).addEventListener('input', () => {
            const idx = parseInt((input as HTMLInputElement).dataset.index || '0');
            group.entries[idx].suggestedSedeName = (input as HTMLInputElement).value.trim();
        });
    });

    // Target radio buttons (in advanced section)
    wrapper.querySelectorAll('input[name="sede-target-radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const selectedId = (radio as HTMLInputElement).value;
            group.entries.forEach(e => e.isTarget = e.companyId === selectedId);
        });
    });

    // Mark as residential
    wrapper.querySelectorAll('.sede-mark-residential').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cid = (btn as HTMLElement).dataset.companyId;
            if (!cid) return;
            const entry = group.entries.find(e => e.companyId === cid);
            if (!entry) return;

            if (!confirm(`¿Estás seguro que "${entry.companyName}" es un cliente Residencial?\nSe migrará a la base de datos de Clientes y desaparecerá de Empresas.`)) return;
            
            try {
                setBusy(true);
                const company = State.companies.find(c => c.id === cid);
                if (company) {
                    await markCompanyAsResidential(company);
                    UI.showAppNotification(`"${company.name}" convertido a Residencial con éxito.`, 'success');
                    
                    // Remove from view
                    group.entries = group.entries.filter(e => e.companyId !== cid);
                    if (group.entries.length === 0) {
                        sedeGroups.splice(currentGroupIndex, 1);
                        renderGroupUI(currentGroupIndex >= sedeGroups.length ? sedeGroups.length - 1 : currentGroupIndex);
                    } else {
                        renderGroupUI(currentGroupIndex);
                    }
                    
                    // Re-fetch companies in background
                    fetchCompanies().then(State.setCompanies).catch(()=>console.warn('Failed to refresh companies'));
                }
            } catch (err: any) {
                console.error(err);
                UI.showAppNotification('Error al marcar cliente: ' + err.message, 'error');
            } finally {
                setBusy(false);
            }
        });
    });

    // Mark as residential
    wrapper.querySelectorAll('.sede-mark-residential').forEach(btn => {
        btn.addEventListener('click', async () => {
            const cid = btn.dataset.companyId;
            if (!cid) return;
            const entry = group.entries.find(e => e.companyId === cid);
            if (!entry) return;

            if (!confirm(`¿Estás seguro que "${entry.companyName}" es un cliente Residencial?\nSe migrará a la base de datos de Clientes y desaparecerá de Empresas.`)) return;
            
            try {
                // setBusy(true); // removed to avoid scope issues in quick edit
                const company = State.companies.find(c => c.id === cid);
                if (company) {
                    await markCompanyAsResidential(company);
                    UI.showAppNotification(`"${company.name}" convertido a Residencial con éxito.`, 'success');
                    
                    group.entries = group.entries.filter(e => e.companyId !== cid);
                    if (group.entries.length === 0) {
                        sedeGroups.splice(currentGroupIndex, 1);
                        renderGroupUI(currentGroupIndex >= sedeGroups.length ? Math.max(0, sedeGroups.length - 1) : currentGroupIndex);
                    } else {
                        renderGroupUI(currentGroupIndex);
                    }
                    fetchCompanies().then((cs) => { State.setCompanies(cs); }).catch(()=>console.warn('Failed to refresh companies'));
                }
            } catch (err) {
                console.error(err);
                UI.showAppNotification('Error al marcar cliente: ' + err.message, 'error');
            } finally {
                // setBusy(false);
            }
        });
    });
    // Remove entry buttons
    wrapper.querySelectorAll('.sede-remove-entry').forEach(btn => {
        btn.addEventListener('click', () => {
            if (isBusy) return;
            const companyId = (btn as HTMLElement).dataset.companyId;
            if (!companyId) return;
            group.entries = group.entries.filter(e => e.companyId !== companyId);
            if (group.entries.length === 0) {
                sedeGroups.splice(currentGroupIndex, 1);
                if (sedeGroups.length === 0) {
                    container.innerHTML = emptyStateHtml('Todos los grupos han sido procesados o descartados.');
                    return;
                }
                currentGroupIndex = Math.min(currentGroupIndex, sedeGroups.length - 1);
            }
            if (!group.entries.find(e => e.isTarget) && group.entries.length > 0) {
                group.entries[0].isTarget = true;
            }
            renderGroupUI(currentGroupIndex);
        });
    });

    // ─ SEARCH: Add more sedes to this group
    const searchInput = wrapper.querySelector('.sede-search-input') as HTMLInputElement | null;
    const searchResultsEl = wrapper.querySelector('.sede-search-results') as HTMLElement | null;

    if (searchInput && searchResultsEl) {
        const existingIds = new Set(group.entries.map(e => e.companyId));
        let debounceTimer: ReturnType<typeof setTimeout>;

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const query = searchInput.value.trim().toLowerCase();

            if (query.length < 2) {
                searchResultsEl.style.display = 'none';
                searchResultsEl.innerHTML = '';
                return;
            }

            debounceTimer = setTimeout(() => {
                const matches = State.companies
                    .filter(c => !existingIds.has(c.id) && c.name.toLowerCase().includes(query))
                    .slice(0, 10);

                if (matches.length === 0) {
                    searchResultsEl.innerHTML = `<div style="padding: 12px; color: var(--text-dim); font-size: 0.8rem; text-align: center;">No se encontraron empresas</div>`;
                    searchResultsEl.style.display = 'block';
                    return;
                }

                searchResultsEl.innerHTML = matches.map(c => `
                    <div class="sede-search-result-item" data-id="${c.id}" data-name="${escapeHtml(c.name)}"
                         style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 0.85rem; color: var(--text); transition: background 0.15s;"
                         onmouseover="this.style.background='rgba(var(--color-primary-rgb, 10,199,212), 0.1)'" onmouseout="this.style.background='transparent'">
                        <i class="fas fa-plus-circle" style="color: var(--primary); margin-right: 8px;"></i>
                        ${escapeHtml(c.name)}
                    </div>
                `).join('');
                searchResultsEl.style.display = 'block';

                // Click to add
                searchResultsEl.querySelectorAll('.sede-search-result-item').forEach(item => {
                    item.addEventListener('click', async () => {
                        const id = (item as HTMLElement).dataset.id!;
                        const name = (item as HTMLElement).dataset.name!;

                        // Show loading
                        (item as HTMLElement).innerHTML = `<i class="fas fa-circle-notch fa-spin" style="color: var(--primary); margin-right: 8px;"></i> Cargando...`;

                        const statsResult = await buildStatsMap([id]);
                        const stats = statsResult.get(id) || { reports: 0, equipment: 0, dependencies: 0 };
                        const centralTokens = group.centralName.toLowerCase().split(/\s+/).filter(t => t.length > 1);
                        const suggestedName = extractSedeName(name, centralTokens);

                        const searchedCompany = State.companies.find(co => co.id === id);
                        const searchCityName = searchedCompany ? (State.cities.find(ct => ct.id === searchedCompany.cityId)?.name || 'Sin ciudad') : 'Sin ciudad';
                        group.entries.push({
                            companyId: id,
                            companyName: name,
                            suggestedSedeName: suggestedName,
                            stats,
                            isTarget: false,
                            cityName: searchCityName
                        });

                        searchInput.value = '';
                        searchResultsEl.style.display = 'none';
                        renderGroupUI(currentGroupIndex);
                    });
                });
            }, 200);
        });

        // Close dropdown on outside click
        const closeHandler = (e: Event) => {
            if (!searchInput.contains(e.target as Node) && !searchResultsEl.contains(e.target as Node)) {
                searchResultsEl.style.display = 'none';
            }
        };
        document.addEventListener('click', closeHandler);
        const observer = new MutationObserver(() => {
            if (!container.contains(wrapper)) {
                document.removeEventListener('click', closeHandler);
                observer.disconnect();
            }
        });
        observer.observe(container, { childList: true });
    }

    // Skip button
    wrapper.querySelector('.sede-skip-btn')?.addEventListener('click', () => {
        if (isBusy) return;
        sedeGroups.splice(currentGroupIndex, 1);
        if (sedeGroups.length === 0) {
            container.innerHTML = emptyStateHtml('Todos los grupos han sido procesados o descartados.');
            return;
        }
        currentGroupIndex = Math.min(currentGroupIndex, sedeGroups.length - 1);
        renderGroupUI(currentGroupIndex);
    });

    // Apply button
    wrapper.querySelector('.sede-apply-btn')?.addEventListener('click', async () => {
        if (isBusy) return;
        await applySedeConversion(group);
    });
}





// ─── Apply Conversion (Supervised) ───────────────────────────────────────────

async function applySedeConversion(group: SedeGroup) {
    const centralName = group.centralName.trim();
    if (!centralName) {
        UI.showAppNotification('El nombre de la empresa central no puede estar vacío.', 'error');
        return;
    }

    const allEntries = group.entries;
    if (allEntries.length === 0) {
        UI.showAppNotification('No hay empresas para convertir.', 'info');
        return;
    }

    const sedeNames = allEntries.map(s => `"${s.suggestedSedeName || s.companyName}"`).join(', ');

    const confirmed = await UI.showConfirmationModal(
        `¿Convertir ${allEntries.length} empresas en sedes de la empresa principal "${centralName}"?\n\n` +
        `Sedes resultantes: ${sedeNames}\n\n` +
        `Todos los registros se mantendrán intactos conservando su información individual.`,
        'Aplicar Conversión'
    );
    if (!confirmed) return;

    setBusy(true);
    setProgressVisible(true);
    const container = document.getElementById('sede-cleanup-dashboard');

    try {
        const totalSteps = allEntries.length + 2; 
        let step = 0;

        // Step 1: Fetch or create Client
        step++;
        updateProgress(step, totalSteps, `Obteniendo o creando la Empresa Padre "${centralName}"...`);
        
        let clientIdToUse: string;
        
        const { data: existingClient, error: clientErr } = await supabaseClients
            .from('clients')
            .select('id')
            .ilike('name', centralName)
            .maybeSingle();

        if (clientErr && clientErr.code !== 'PGRST116') {
             throw clientErr;
        }

        if (existingClient && existingClient.id) {
             clientIdToUse = existingClient.id;
        } else {
             // Create it (providing manualId to satisfy the NOT NULL constraint)
             const newManualId = Math.floor(100000 + Math.random() * 900000).toString();
             const { data: newClient, error: insertErr } = await supabaseClients
                 .from('clients')
                 .insert({ name: centralName, manualId: newManualId })
                 .select('id')
                 .single();
                 
             if (insertErr) throw insertErr;
             if (!newClient) throw new Error("No se pudo crear la empresa cliente padre.");
             clientIdToUse = newClient.id;
        }

        // Step 2: For each entry, convert to sede
        for (const entry of allEntries) {
            step++;
            const sedeName = entry.suggestedSedeName || entry.companyName;
            updateProgress(step, totalSteps, `Configurando "${entry.companyName}" → Sede "${sedeName}"`);

            // Update the company row to be a Sede pointing to the Client
            await assertSupabase(
                supabaseOrders.from('maintenance_companies').update({
                    name: sedeName,
                    client_id: clientIdToUse,
                    category: 'sede'
                }).eq('id', entry.companyId)
            );

            // Hide the duplicate legacy entry from the clients database so it no longer appears in Cotizaciones/Reportes
            // We ignore errors here in case it doesn't strictly exist, but it usually does.
            if (entry.companyName.toUpperCase() !== centralName.toUpperCase()) {
                await supabaseClients.from('clients').update({
                    category: 'legacy_migrated'
                }).eq('name', entry.companyName).neq('id', clientIdToUse);
            }
            await sleepFrame();
        }

        // Step 3: Refresh local state
        step++;
        updateProgress(step, totalSteps, 'Actualizando datos locales...');
        await refreshLocalState();
        
        // Remove from UI
        sedeGroups.splice(currentGroupIndex, 1);
        
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <i class="fas fa-check-circle" style="font-size: 4rem; color: var(--success); margin-bottom: 20px; animation: popIn 0.5s ease;"></i>
                    <h2 style="color: var(--success); margin-bottom: 10px;">¡Conversión Exitosa!</h2>
                    <p style="color: var(--text-dim); font-size: 0.95rem;">
                        ${allEntries.length} empresas se convirtieron en sedes bajo <strong>"${centralName}"</strong>.
                    </p>
                    <p style="color: var(--text-dim); font-size: 0.8rem; margin-top: 10px; opacity: 0.7;">
                        ${sedeGroups.length > 0 ? 'Pasando al siguiente grupo...' : 'No quedan más grupos.'}
                    </p>
                </div>
            `;
        }

        UI.showAppNotification(`✅ ${allEntries.length} empresas convertidas en sedes de "${centralName}".`, 'success');

        await new Promise(r => setTimeout(r, 2000));

        if (sedeGroups.length > 0) {
            currentGroupIndex = Math.min(currentGroupIndex, sedeGroups.length - 1);
            renderGroupUI(currentGroupIndex);
        } else {
            if (container) container.innerHTML = emptyStateHtml('Todos los grupos han sido procesados. ¡Base de datos depurada bajo la nueva estructura!');
        }

    } catch (err: any) {
        console.error('Sede conversion error:', err);
        UI.showAppNotification(`Error: ${err.message || String(err)}`, 'error');
    } finally {
        setBusy(false);
        setProgressVisible(false);
    }
}
// ─── Helpers ─────────────────────────────────────────────────────────────────

async function refreshLocalState() {
    const [companies, dependencies] = await Promise.all([
        fetchCompanies(),
        fetchDependencies()
    ]);
    State.setCompanies(companies);
    // Note: State.setSedes is not needed anymore
    State.setDependencies(dependencies);
}

async function assertSupabase(promise: PromiseLike<{ error: any }>) {
    const { error } = await promise;
    if (error) throw error;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}



