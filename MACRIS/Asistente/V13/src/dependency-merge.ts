/**
 * dependency-merge.ts — Unificador de Dependencias Duplicadas
 *
 * Flujo: Seleccionar empresa → seleccionar sede (si aplica) → ver todas las
 * dependencias de la sede + grupos duplicados detectados automáticamente →
 * agregar manualmente más entradas a cada grupo → confirmar fusión en cascada.
 */

import * as State from './state';
import * as UI from './ui';
import { supabaseOrders, fetchCompanies, fetchSedes } from './api';
import type { Company, Sede } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

type DepInfo = { id: string; name: string; equipment: number; reports: number };

type DependencyGroup = {
    name: string;
    deps: DepInfo[];
    canonicalId: string;
};

// ─── Module State ────────────────────────────────────────────────────────────

let isBusy = false;
let dependencyGroups: DependencyGroup[] = [];
let allScopeDeps: DepInfo[] = []; // all deps in the current scope with counts
let sedes: Sede[] = [];
let companiesCache: Company[] = [];

// ─── Init ────────────────────────────────────────────────────────────────────

export function initDependencyMerge() {
    const openBtn = document.getElementById('dependency-merge-btn');
    const modal = document.getElementById('dependency-merge-modal');
    const closeBtn = document.getElementById('close-dependency-merge-modal');
    const sedeRow = document.getElementById('dep-merge-sede-row');
    const companySearch = document.getElementById('dep-merge-company-search') as HTMLInputElement | null;
    const companyResults = document.getElementById('dep-merge-company-results');
    const companyClear = document.getElementById('dep-merge-company-clear');
    const sedeSearch = document.getElementById('dep-merge-sede-search') as HTMLInputElement | null;
    const sedeResults = document.getElementById('dep-merge-sede-results');
    const sedeClear = document.getElementById('dep-merge-sede-clear');
    const sedeAllBtn = document.getElementById('dep-merge-sede-all-btn');

    openBtn?.addEventListener('click', async () => {
        if (modal) modal.style.display = 'flex';
        resetUI();
        await ensureCompaniesLoaded();
    });

    closeBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
        resetUI();
    });

    companySearch?.addEventListener('input', async () => {
        await ensureCompaniesLoaded();
        renderCompanyResults(companySearch.value);
    });

    companySearch?.addEventListener('focus', async () => {
        await ensureCompaniesLoaded();
        if (companySearch.value.trim()) {
            renderCompanyResults(companySearch.value);
        }
    });

    companyResults?.addEventListener('click', async (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-company-id]');
        const companyId = target?.dataset.companyId;
        if (!companyId) return;
        await setSelectedCompany(companyId);
    });

    companyClear?.addEventListener('click', () => {
        clearSelectedCompany();
    });

    sedeSearch?.addEventListener('input', async () => {
        await loadSedes();
        renderSedeResults(sedeSearch.value);
    });

    sedeSearch?.addEventListener('focus', async () => {
        await loadSedes();
        if (sedeSearch.value.trim()) {
            renderSedeResults(sedeSearch.value);
        }
    });

    sedeResults?.addEventListener('click', (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-sede-id]');
        const sedeId = target?.dataset.sedeId;
        if (!sedeId) return;
        setSelectedSede(sedeId);
    });

    sedeClear?.addEventListener('click', () => {
        clearSelectedSede();
    });

    sedeAllBtn?.addEventListener('click', () => {
        clearSelectedSede();
    });

    document.getElementById('dep-merge-scan')?.addEventListener('click', async () => {
        await scanDependencies();
    });

    document.addEventListener('click', (event) => {
        const target = event.target as Node;
        if (!document.getElementById('dep-merge-company-picker')?.contains(target)) {
            hideResults('dep-merge-company-results');
        }
        if (!document.getElementById('dep-merge-sede-picker')?.contains(target)) {
            hideResults('dep-merge-sede-results');
        }
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureCompaniesLoaded() {
    let companies = State.companies;
    if (!companies || companies.length === 0) {
        companies = await fetchCompanies();
        State.setCompanies(companies);
    }
    companiesCache = companies
        .filter(c => !c.clientId)
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function loadSedes() {
    if (sedes.length === 0) sedes = await fetchSedes();
}

function getSelectedCompanyId(): string | null {
    const input = document.getElementById('dep-merge-company-id') as HTMLInputElement | null;
    return input?.value || null;
}

function getSelectedSedeId(): string | null {
    const input = document.getElementById('dep-merge-sede-id') as HTMLInputElement | null;
    return input?.value || null;
}

function setSelectedBadge(prefix: 'company' | 'sede', label: string | null) {
    const selected = document.getElementById(`dep-merge-${prefix}-selected`);
    const text = document.getElementById(`dep-merge-${prefix}-selected-text`);
    const search = document.getElementById(`dep-merge-${prefix}-search`) as HTMLInputElement | null;
    if (!selected || !text || !search) return;

    if (label) {
        text.textContent = label;
        selected.style.display = 'flex';
        search.style.display = 'none';
        search.value = '';
    } else {
        text.textContent = '';
        selected.style.display = 'none';
        search.style.display = 'block';
        search.value = '';
    }
}

function hideResults(resultsId: string) {
    const results = document.getElementById(resultsId);
    if (results) {
        results.innerHTML = '';
        results.style.display = 'none';
    }
}

function renderCompanyResults(query: string) {
    const results = document.getElementById('dep-merge-company-results');
    if (!results) return;

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        hideResults('dep-merge-company-results');
        return;
    }

    const matches = companiesCache
        .filter(company => company.name.toLowerCase().includes(normalizedQuery))
        .slice(0, 12);

    if (matches.length === 0) {
        results.innerHTML = '<div style="padding: 10px 12px; color: var(--text-dim); font-size: 0.8rem; text-align: center;">Sin resultados</div>';
    } else {
        results.innerHTML = matches.map(company => `
            <div data-company-id="${company.id}" style="padding: 9px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 0.83rem; color: var(--text);"
                 onmouseover="this.style.background='rgba(181,122,255,0.1)'" onmouseout="this.style.background='transparent'">
                ${escapeHtml(company.name)}
            </div>
        `).join('');
    }

    results.style.display = 'block';
}

async function setSelectedCompany(companyId: string) {
    await ensureCompaniesLoaded();
    await loadSedes();

    const company = companiesCache.find(c => c.id === companyId) || State.companies.find(c => c.id === companyId);
    const input = document.getElementById('dep-merge-company-id') as HTMLInputElement | null;
    const sedeRow = document.getElementById('dep-merge-sede-row');
    if (!company || !input) return;

    input.value = company.id;
    setSelectedBadge('company', company.name);
    hideResults('dep-merge-company-results');
    resetDashboard();

    const companySedes = sedes.filter(s => s.companyId === company.id);
    clearSelectedSede();
    if (sedeRow) {
        sedeRow.style.display = companySedes.length > 0 ? 'flex' : 'none';
    }
}

function clearSelectedCompany() {
    const input = document.getElementById('dep-merge-company-id') as HTMLInputElement | null;
    const sedeRow = document.getElementById('dep-merge-sede-row');
    if (input) input.value = '';
    setSelectedBadge('company', null);
    clearSelectedSede();
    if (sedeRow) sedeRow.style.display = 'none';
    hideResults('dep-merge-company-results');
    resetDashboard();
}

function renderSedeResults(query: string) {
    const results = document.getElementById('dep-merge-sede-results');
    const selectedCompanyId = getSelectedCompanyId();
    if (!results || !selectedCompanyId) return;

    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        hideResults('dep-merge-sede-results');
        return;
    }

    const matches = sedes
        .filter(sede => sede.companyId === selectedCompanyId && sede.name.toLowerCase().includes(normalizedQuery))
        .slice(0, 12);

    if (matches.length === 0) {
        results.innerHTML = '<div style="padding: 10px 12px; color: var(--text-dim); font-size: 0.8rem; text-align: center;">Sin resultados</div>';
    } else {
        results.innerHTML = matches.map(sede => `
            <div data-sede-id="${sede.id}" style="padding: 9px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 0.83rem; color: var(--text);"
                 onmouseover="this.style.background='rgba(181,122,255,0.1)'" onmouseout="this.style.background='transparent'">
                ${escapeHtml(sede.name)}
            </div>
        `).join('');
    }

    results.style.display = 'block';
}

function setSelectedSede(sedeId: string) {
    const input = document.getElementById('dep-merge-sede-id') as HTMLInputElement | null;
    const sede = sedes.find(s => s.id === sedeId);
    if (!input || !sede) return;

    input.value = sede.id;
    setSelectedBadge('sede', sede.name);
    hideResults('dep-merge-sede-results');
    resetDashboard();
}

function clearSelectedSede() {
    const input = document.getElementById('dep-merge-sede-id') as HTMLInputElement | null;
    if (input) input.value = '';
    setSelectedBadge('sede', null);
    hideResults('dep-merge-sede-results');
}

function resetDashboard() {
    dependencyGroups = [];
    allScopeDeps = [];
    const dashboard = document.getElementById('dep-merge-dashboard');
    if (dashboard) dashboard.innerHTML = emptyStateHtml('Configura los filtros y haz clic en "Escanear" para detectar duplicados.');
}

function resetUI() {
    const sedeRow = document.getElementById('dep-merge-sede-row');
    const companyInput = document.getElementById('dep-merge-company-id') as HTMLInputElement | null;
    const sedeInput = document.getElementById('dep-merge-sede-id') as HTMLInputElement | null;
    if (companyInput) companyInput.value = '';
    if (sedeInput) sedeInput.value = '';
    setSelectedBadge('company', null);
    setSelectedBadge('sede', null);
    hideResults('dep-merge-company-results');
    hideResults('dep-merge-sede-results');
    if (sedeRow) sedeRow.style.display = 'none';
    resetDashboard();
}

function getDepsNotInGroups(): DepInfo[] {
    const inGroupIds = new Set(dependencyGroups.flatMap(g => g.deps.map(d => d.id)));
    return allScopeDeps.filter(d => !inGroupIds.has(d.id));
}

// ─── Scan ────────────────────────────────────────────────────────────────────

async function scanDependencies() {
    const selectedCompanyId = getSelectedCompanyId();
    const selectedSedeId = getSelectedSedeId();

    if (!selectedCompanyId) {
        UI.showAppNotification('Selecciona una empresa primero.', 'info');
        return;
    }

    setBusy(true);
    setProgressVisible(true);
    updateProgress(0, 3, 'Cargando dependencias...');

    try {
        // 1. Resolve target company IDs
        await loadSedes();
        const companySedes = sedes.filter(s => s.companyId === selectedCompanyId);
        let targetCompanyIds: string[];

        if (selectedSedeId) {
            targetCompanyIds = [selectedSedeId];
        } else if (companySedes.length > 0) {
            targetCompanyIds = companySedes.map(s => s.id);
        } else {
            targetCompanyIds = [selectedCompanyId];
        }

        // 2. Fetch all deps for scope
        updateProgress(1, 3, 'Buscando dependencias...');
        const { data: depRows, error: depErr } = await supabaseOrders
            .from('maintenance_dependencies')
            .select('id, name, company_id')
            .in('company_id', targetCompanyIds)
            .order('name');
        if (depErr) throw depErr;

        const rawDeps = (depRows || []) as Array<{ id: string; name: string; company_id: string }>;

        if (rawDeps.length === 0) {
            const dashboard = document.getElementById('dep-merge-dashboard');
            if (dashboard) dashboard.innerHTML = emptyStateHtml('No se encontraron dependencias para la selección actual.');
            setProgressVisible(false);
            setBusy(false);
            return;
        }

        // 3. Fetch counts for ALL deps
        updateProgress(2, 3, 'Calculando conteos...');
        const allIds = rawDeps.map(d => d.id);
        const [eqCounts, repCounts] = await Promise.all([
            fetchCountsByDependency(allIds, 'maintenance_equipment', 'dependency_id'),
            fetchCountsByDependency(allIds, 'maintenance_reports', 'dependency_id'),
        ]);

        allScopeDeps = rawDeps.map(d => ({
            id: d.id,
            name: d.name,
            equipment: eqCounts.get(d.id) || 0,
            reports: repCounts.get(d.id) || 0,
        }));

        // 4. Detect duplicates by normalized name
        updateProgress(3, 3, 'Detectando duplicados...');
        const nameGroups = new Map<string, DepInfo[]>();
        allScopeDeps.forEach(dep => {
            const key = dep.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const group = nameGroups.get(key) || [];
            group.push(dep);
            nameGroups.set(key, group);
        });

        dependencyGroups = Array.from(nameGroups.values())
            .filter(deps => deps.length > 1)
            .map(deps => {
                const sorted = [...deps].sort((a, b) => {
                    if (b.equipment !== a.equipment) return b.equipment - a.equipment;
                    return b.reports - a.reports;
                });
                return { name: sorted[0].name, deps: sorted, canonicalId: sorted[0].id };
            });

        setProgressVisible(false);
        renderDashboard();

        const dupMsg = dependencyGroups.length > 0
            ? `${dependencyGroups.length} grupos duplicados detectados.`
            : 'No hay duplicados automáticos. Puedes crear grupos manualmente.';
        UI.showAppNotification(dupMsg, dependencyGroups.length > 0 ? 'success' : 'info');

    } catch (err: any) {
        console.error('Dependency merge scan error:', err);
        UI.showAppNotification('Error al escanear: ' + err.message, 'error');
        setProgressVisible(false);
    } finally {
        setBusy(false);
    }
}

async function fetchCountsByDependency(depIds: string[], table: string, column: string): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (depIds.length === 0) return counts;
    const chunkSize = 100;
    for (let i = 0; i < depIds.length; i += chunkSize) {
        const chunk = depIds.slice(i, i + chunkSize);
        let from = 0;
        while (true) {
            const { data, error } = await (supabaseOrders as any)
                .from(table)
                .select(`${column}, id`)
                .in(column, chunk)
                .order('id', { ascending: true })
                .range(from, from + 999);
            if (error) throw error;
            const rows = (data || []) as any[];
            rows.forEach((r: any) => { if (r[column]) counts.set(r[column], (counts.get(r[column]) || 0) + 1); });
            if (rows.length < 1000) break;
            from += 1000;
        }
    }
    return counts;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderDashboard() {
    const dashboard = document.getElementById('dep-merge-dashboard');
    if (!dashboard) return;
    dashboard.innerHTML = '';

    const totalDeps = allScopeDeps.length;
    const soloCount = getDepsNotInGroups().length;

    // ── Summary bar
    const summary = document.createElement('div');
    summary.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 15px; font-size: 0.78rem;';
    summary.innerHTML = `
        <span style="background: rgba(10,199,212,0.12); border: 1px solid rgba(10,199,212,0.3); color: var(--primary); padding: 4px 10px; border-radius: 6px;">
            <i class="fas fa-sitemap"></i> ${totalDeps} dependencias totales
        </span>
        <span style="background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.25); color: #ff6b6b; padding: 4px 10px; border-radius: 6px;">
            <i class="fas fa-copy"></i> ${dependencyGroups.length} grupos duplicados
        </span>
        <span style="background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--text-dim); padding: 4px 10px; border-radius: 6px;">
            <i class="fas fa-minus-circle"></i> ${soloCount} sin agrupar
        </span>`;
    dashboard.appendChild(summary);

    // ── Duplicate groups
    if (dependencyGroups.length > 0) {
        const groupsHeader = document.createElement('div');
        groupsHeader.style.cssText = 'font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #ff6b6b; letter-spacing: 0.5px; margin-bottom: 10px;';
        groupsHeader.innerHTML = `<i class="fas fa-copy"></i> Grupos Duplicados`;
        dashboard.appendChild(groupsHeader);

        dependencyGroups.forEach((group, groupIdx) => {
            dashboard.appendChild(buildGroupCard(group, groupIdx));
        });

        if (dependencyGroups.length > 1) {
            const mergeAllEl = document.createElement('div');
            mergeAllEl.style.cssText = 'display: flex; justify-content: flex-end; padding: 10px 0; border-top: 1px dashed var(--border); margin-bottom: 20px;';
            mergeAllEl.innerHTML = `
                <button class="btn btn-primary dep-merge-all-btn" style="font-weight: 700;">
                    <i class="fas fa-layer-group"></i> Unificar todos los grupos (${dependencyGroups.length})
                </button>`;
            mergeAllEl.querySelector('.dep-merge-all-btn')?.addEventListener('click', () => mergeAllGroups());
            dashboard.appendChild(mergeAllEl);
        }
    }

    // ── All dependencies panel
    renderAllDepsPanel(dashboard);
}

function buildGroupCard(group: DependencyGroup, groupIdx: number): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 15px; margin-bottom: 14px;';

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px; margin-bottom: 10px;';
    header.innerHTML = `
        <i class="fas fa-copy" style="color: #b57aff;"></i> Grupo:
        <strong style="color: var(--text);">${escapeHtml(group.name)}</strong>
        <span style="background: rgba(255,80,80,0.15); color: #ff6b6b; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; margin-left: 8px;">${group.deps.length} entradas</span>`;
    card.appendChild(header);

    // Dep rows
    const rowsEl = document.createElement('div');
    rowsEl.className = 'dep-group-rows';
    group.deps.forEach(dep => rowsEl.appendChild(buildDepRow(dep, group, groupIdx)));
    card.appendChild(rowsEl);

    // Search bar to add deps manually
    card.appendChild(buildGroupSearchBar(group, groupIdx));

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 12px;';
    actions.innerHTML = `
        <button class="btn btn-primary btn-sm dep-merge-apply-btn" style="font-size: 0.8rem;">
            <i class="fas fa-compress-arrows-alt"></i> Unificar este grupo
        </button>`;
    actions.querySelector('.dep-merge-apply-btn')?.addEventListener('click', () => mergeGroup(groupIdx));
    card.appendChild(actions);

    return card;
}

function buildDepRow(dep: DepInfo, group: DependencyGroup, groupIdx: number): HTMLElement {
    const isCanonical = dep.id === group.canonicalId;
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; margin-bottom: 6px;
        background: ${isCanonical ? 'rgba(10,199,212,0.08)' : 'rgba(255,255,255,0.02)'};
        border: 1px solid ${isCanonical ? 'rgba(10,199,212,0.3)' : 'var(--border)'};`;
    row.innerHTML = `
        <input type="radio" name="canonical-${groupIdx}" value="${dep.id}" ${isCanonical ? 'checked' : ''}
               style="accent-color: var(--primary); width: 16px; height: 16px; flex-shrink: 0; cursor: pointer;">
        <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(dep.name)}</div>
            <div style="font-size: 0.7rem; color: var(--text-dim);">ID: ${dep.id.slice(0, 8)}…</div>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-dim); text-align: right; white-space: nowrap; flex-shrink: 0;">
            <i class="fas fa-tools" style="color: var(--primary);"></i> ${dep.equipment}
            &nbsp;<i class="fas fa-file-alt" style="color: var(--primary);"></i> ${dep.reports}
        </div>
        ${isCanonical ? '<span style="font-size: 0.65rem; background: rgba(10,199,212,0.2); color: var(--primary); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; white-space: nowrap;">CANÓNICA</span>' : ''}
        <button class="dep-row-remove-btn" title="Quitar del grupo"
                style="background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.25); color: #ff6b6b; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-times"></i>
        </button>`;

    // Radio → canonical
    const radio = row.querySelector('input[type=radio]') as HTMLInputElement;
    radio.addEventListener('change', () => {
        group.canonicalId = dep.id;
        renderDashboard();
    });

    // Remove from group
    row.querySelector('.dep-row-remove-btn')?.addEventListener('click', () => {
        if (group.deps.length <= 2) {
            UI.showAppNotification('Un grupo debe tener al menos 2 entradas para poder unificar.', 'info');
            return;
        }
        group.deps = group.deps.filter(d => d.id !== dep.id);
        if (group.canonicalId === dep.id) group.canonicalId = group.deps[0].id;
        renderDashboard();
    });

    return row;
}

function buildGroupSearchBar(group: DependencyGroup, _groupIdx: number): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; margin-top: 10px;';
    wrapper.innerHTML = `
        <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.4px; margin-bottom: 6px;">
            <i class="fas fa-plus-circle" style="color: #b57aff;"></i> Agregar dependencia manualmente
        </div>
        <input type="text" class="dep-group-search-input" placeholder="Buscar por nombre..."
               style="width: 100%; background: var(--bg-input); border: 1px solid var(--border); padding: 7px 10px; border-radius: 6px; color: var(--text); font-size: 0.82rem; box-sizing: border-box;" autocomplete="off">
        <div class="dep-group-search-results"
             style="display: none; position: absolute; left: 0; right: 0; top: 100%; z-index: 200; max-height: 180px; overflow-y: auto; background: var(--bg-card); border: 1px solid #b57aff; border-top: none; border-radius: 0 0 8px 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.45);"></div>`;

    const input = wrapper.querySelector('.dep-group-search-input') as HTMLInputElement;
    const results = wrapper.querySelector('.dep-group-search-results') as HTMLElement;

    let debounce: ReturnType<typeof setTimeout>;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        const q = input.value.trim().toLowerCase();
        if (q.length < 1) { results.style.display = 'none'; return; }

        debounce = setTimeout(() => {
            const groupDepIds = new Set(group.deps.map(d => d.id));
            const matches = allScopeDeps
                .filter(d => !groupDepIds.has(d.id) && d.name.toLowerCase().includes(q))
                .slice(0, 8);

            if (matches.length === 0) {
                results.innerHTML = `<div style="padding: 10px; color: var(--text-dim); font-size: 0.8rem; text-align: center;">Sin resultados</div>`;
            } else {
                results.innerHTML = matches.map(d => `
                    <div class="dep-search-item" data-id="${d.id}"
                         style="padding: 9px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 0.83rem; color: var(--text); display: flex; justify-content: space-between; align-items: center;"
                         onmouseover="this.style.background='rgba(181,122,255,0.1)'" onmouseout="this.style.background='transparent'">
                        <span><i class="fas fa-plus" style="color: #b57aff; margin-right: 8px; font-size: 0.7rem;"></i>${escapeHtml(d.name)}</span>
                        <span style="font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; margin-left: 8px;">
                            <i class="fas fa-tools" style="color: var(--primary);"></i> ${d.equipment}
                            &nbsp;<i class="fas fa-file-alt" style="color: var(--primary);"></i> ${d.reports}
                        </span>
                    </div>`).join('');
            }
            results.style.display = 'block';

            results.querySelectorAll('.dep-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = (item as HTMLElement).dataset.id!;
                    const dep = allScopeDeps.find(d => d.id === id);
                    if (!dep) return;

                    // Remove from any other group first
                    dependencyGroups.forEach(g => { g.deps = g.deps.filter(d => d.id !== id); });

                    group.deps.push(dep);
                    input.value = '';
                    results.style.display = 'none';
                    renderDashboard();
                });
            });
        }, 150);
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target as Node)) results.style.display = 'none';
    }, { capture: false });

    return wrapper;
}

function renderAllDepsPanel(dashboard: HTMLElement) {
    const all = allScopeDeps;
    if (all.length === 0) return;

    const inGroupIds = new Set(dependencyGroups.flatMap(g => g.deps.map(d => d.id)));

    const panel = document.createElement('div');
    panel.style.cssText = 'margin-top: 5px;';

    // Toggle header
    const isDefaultOpen = dependencyGroups.length === 0;
    panel.innerHTML = `
        <div class="dep-all-toggle" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; user-select: none;">
            <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px;">
                <i class="fas fa-list" style="color: var(--primary);"></i>
                Todas las dependencias de la sede
                <span style="background: rgba(10,199,212,0.15); color: var(--primary); padding: 2px 8px; border-radius: 4px; margin-left: 6px;">${all.length}</span>
            </span>
            <i class="fas fa-chevron-${isDefaultOpen ? 'up' : 'down'} dep-all-chevron" style="color: var(--text-dim); font-size: 0.8rem;"></i>
        </div>
        <div class="dep-all-body" style="display: ${isDefaultOpen ? 'block' : 'none'}; margin-top: 8px; max-height: 320px; overflow-y: auto; padding: 0 2px;">
        </div>`;

    const toggle = panel.querySelector('.dep-all-toggle') as HTMLElement;
    const body = panel.querySelector('.dep-all-body') as HTMLElement;
    const chevron = panel.querySelector('.dep-all-chevron') as HTMLElement;
    toggle.addEventListener('click', () => {
        const open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        chevron.className = `fas fa-chevron-${open ? 'up' : 'down'} dep-all-chevron`;
        chevron.style.color = 'var(--text-dim)';
        chevron.style.fontSize = '0.8rem';
    });

    // Build rows
    const sortedAll = [...all].sort((a, b) => a.name.localeCompare(b.name));
    sortedAll.forEach(dep => {
        const inGroup = inGroupIds.has(dep.id);
        const groupOfDep = inGroup ? dependencyGroups.find(g => g.deps.some(d => d.id === dep.id)) : null;

        const row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; margin-bottom: 4px;
            background: ${inGroup ? 'rgba(181,122,255,0.06)' : 'rgba(255,255,255,0.02)'};
            border: 1px solid ${inGroup ? 'rgba(181,122,255,0.2)' : 'var(--border)'};`;

        const groupBadge = inGroup && groupOfDep
            ? `<span style="font-size: 0.62rem; background: rgba(181,122,255,0.2); color: #b57aff; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">
                   En grupo: ${escapeHtml(groupOfDep.name.slice(0, 20))}${groupOfDep.name.length > 20 ? '…' : ''}
               </span>`
            : '';

        row.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.82rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(dep.name)}</div>
                <div style="font-size: 0.68rem; color: var(--text-dim);">ID: ${dep.id.slice(0, 8)}…</div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-dim); white-space: nowrap; flex-shrink: 0;">
                <i class="fas fa-tools" style="color: var(--primary);"></i> ${dep.equipment}
                &nbsp;<i class="fas fa-file-alt" style="color: var(--primary);"></i> ${dep.reports}
            </div>
            ${groupBadge}
            ${!inGroup ? buildAddToGroupBtn(dep) : ''}`;

        if (!inGroup) {
            row.querySelector('.dep-add-to-group-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToGroupPopover(dep, row);
            });
        }

        body.appendChild(row);
    });

    dashboard.appendChild(panel);
}

function buildAddToGroupBtn(_dep: DepInfo): string {
    return `<button class="btn btn-secondary btn-sm dep-add-to-group-btn" style="font-size: 0.72rem; padding: 4px 8px; white-space: nowrap; flex-shrink: 0; border-color: rgba(181,122,255,0.4); color: #b57aff;">
        <i class="fas fa-plus"></i> Añadir a grupo
    </button>`;
}

function showAddToGroupPopover(dep: DepInfo, anchor: HTMLElement) {
    // Remove any existing popover
    document.querySelectorAll('.dep-group-popover').forEach(p => p.remove());

    const popover = document.createElement('div');
    popover.className = 'dep-group-popover';
    popover.style.cssText = 'position: fixed; z-index: 5000; background: var(--bg-card); border: 1px solid #b57aff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); min-width: 200px; max-width: 280px; overflow: hidden; visibility: hidden;';

    const options: string[] = [];

    if (dependencyGroups.length > 0) {
        options.push(`<div style="padding: 8px 12px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.4px; border-bottom: 1px solid var(--border);">Añadir a grupo existente</div>`);
        dependencyGroups.forEach((g, gIdx) => {
            options.push(`<div class="dep-popover-item" data-action="add" data-group="${gIdx}"
                               style="padding: 9px 12px; cursor: pointer; font-size: 0.82rem; color: var(--text); border-bottom: 1px solid var(--border);"
                               onmouseover="this.style.background='rgba(181,122,255,0.1)'" onmouseout="this.style.background='transparent'">
                               <i class="fas fa-folder-plus" style="color: #b57aff; margin-right: 8px; font-size: 0.75rem;"></i>${escapeHtml(g.name.slice(0, 30))}${g.name.length > 30 ? '…' : ''}
                           </div>`);
        });
    }

    options.push(`<div class="dep-popover-item" data-action="new"
                       style="padding: 9px 12px; cursor: pointer; font-size: 0.82rem; color: #b57aff;"
                       onmouseover="this.style.background='rgba(181,122,255,0.1)'" onmouseout="this.style.background='transparent'">
                       <i class="fas fa-plus-circle" style="margin-right: 8px; font-size: 0.75rem;"></i>Crear nuevo grupo
                   </div>`);

    popover.innerHTML = options.join('');

    document.body.appendChild(popover);

    const dashboard = document.getElementById('dep-merge-dashboard');
    const rect = anchor.getBoundingClientRect();
    const popRect = popover.getBoundingClientRect();
    const viewportMargin = 8;
    const spacing = 6;

    let top = rect.bottom + spacing;
    if (top + popRect.height > window.innerHeight - viewportMargin) {
        top = Math.max(viewportMargin, rect.top - popRect.height - spacing);
    }

    let left = rect.right - popRect.width;
    if (left < viewportMargin) left = viewportMargin;
    if (left + popRect.width > window.innerWidth - viewportMargin) {
        left = Math.max(viewportMargin, window.innerWidth - popRect.width - viewportMargin);
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.visibility = 'visible';

    const cleanup = () => {
        popover.remove();
        document.removeEventListener('click', closeHandler);
        window.removeEventListener('resize', cleanup);
        dashboard?.removeEventListener('scroll', cleanup);
    };

    popover.querySelectorAll('.dep-popover-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = (item as HTMLElement).dataset.action;
            const gIdx = parseInt((item as HTMLElement).dataset.group || '-1');
            cleanup();

            if (action === 'add' && gIdx >= 0) {
                const targetGroup = dependencyGroups[gIdx];
                if (targetGroup && !targetGroup.deps.find(d => d.id === dep.id)) {
                    targetGroup.deps.push(dep);
                    renderDashboard();
                }
            } else if (action === 'new') {
                const newGroup: DependencyGroup = {
                    name: dep.name,
                    deps: [dep],
                    canonicalId: dep.id,
                };
                dependencyGroups.push(newGroup);
                renderDashboard();
                UI.showAppNotification(`Grupo "${dep.name}" creado. Agrégale más dependencias para poder unificar.`, 'info');
            }
        });
    });

    // Close on outside click
    const closeHandler = (e: Event) => {
        if (!popover.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
            cleanup();
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    window.addEventListener('resize', cleanup);
    dashboard?.addEventListener('scroll', cleanup);
}

// ─── Merge Logic ─────────────────────────────────────────────────────────────

async function mergeGroup(groupIdx: number) {
    if (isBusy) return;
    const group = dependencyGroups[groupIdx];
    if (!group) return;

    const canonical = group.deps.find(d => d.id === group.canonicalId);
    const duplicates = group.deps.filter(d => d.id !== group.canonicalId);

    if (duplicates.length === 0) {
        UI.showAppNotification('Este grupo solo tiene una entrada. Añade más dependencias para unificar.', 'info');
        return;
    }

    const dupNames = duplicates.map(d => `"${d.name}" (${d.equipment} eq, ${d.reports} rep)`).join('\n');
    const confirmed = await UI.showConfirmationModal(
        `¿Unificar el grupo "${group.name}"?\n\n` +
        `Se conservará: "${canonical?.name}" (ID: ${group.canonicalId.slice(0, 8)}…)\n\n` +
        `Se eliminarán y redirigirán:\n${dupNames}`,
        'Unificar'
    );
    if (!confirmed) return;

    setBusy(true);
    setProgressVisible(true);

    try {
        const dupIds = duplicates.map(d => d.id);
        const totalSteps = duplicates.length * 2 + 1;
        let step = 0;

        for (const dup of duplicates) {
            step++;
            updateProgress(step, totalSteps, `Reasignando equipos de "${dup.name}"...`);
            const { error: eqErr } = await supabaseOrders.from('maintenance_equipment').update({ dependency_id: group.canonicalId }).eq('dependency_id', dup.id);
            if (eqErr) throw eqErr;

            step++;
            updateProgress(step, totalSteps, `Reasignando reportes de "${dup.name}"...`);
            const { error: repErr } = await supabaseOrders.from('maintenance_reports').update({ dependency_id: group.canonicalId }).eq('dependency_id', dup.id);
            if (repErr) throw repErr;
        }

        step++;
        updateProgress(step, totalSteps, 'Eliminando registros duplicados...');
        const { error: delErr } = await supabaseOrders.from('maintenance_dependencies').delete().in('id', dupIds);
        if (delErr) throw delErr;

        // Update allScopeDeps — remove merged deps, update canonical counts
        const canonicalDep = allScopeDeps.find(d => d.id === group.canonicalId);
        if (canonicalDep) {
            duplicates.forEach(dup => {
                canonicalDep.equipment += dup.equipment;
                canonicalDep.reports += dup.reports;
            });
        }
        allScopeDeps = allScopeDeps.filter(d => !dupIds.includes(d.id));
        dependencyGroups.splice(groupIdx, 1);

        UI.showAppNotification(`Grupo "${group.name}" unificado con éxito.`, 'success');
        renderDashboard();

    } catch (err: any) {
        console.error('Dependency merge error:', err);
        UI.showAppNotification('Error al unificar: ' + err.message, 'error');
    } finally {
        setBusy(false);
        setProgressVisible(false);
    }
}

async function mergeAllGroups() {
    if (isBusy) return;
    const validGroups = dependencyGroups.filter(g => g.deps.filter(d => d.id !== g.canonicalId).length > 0);
    if (validGroups.length === 0) return;

    const confirmed = await UI.showConfirmationModal(
        `¿Unificar TODOS los ${validGroups.length} grupos de dependencias duplicadas?\n\nEsta acción no se puede deshacer fácilmente.`,
        'Unificar Todo'
    );
    if (!confirmed) return;

    setBusy(true);
    setProgressVisible(true);

    try {
        const total = validGroups.length;
        for (let i = dependencyGroups.length - 1; i >= 0; i--) {
            const group = dependencyGroups[i];
            const dupIds = group.deps.filter(d => d.id !== group.canonicalId).map(d => d.id);
            if (dupIds.length === 0) continue;

            updateProgress(total - i, total, `Unificando "${group.name}"...`);

            const { error: eqErr } = await supabaseOrders.from('maintenance_equipment').update({ dependency_id: group.canonicalId }).in('dependency_id', dupIds);
            if (eqErr) throw eqErr;
            const { error: repErr } = await supabaseOrders.from('maintenance_reports').update({ dependency_id: group.canonicalId }).in('dependency_id', dupIds);
            if (repErr) throw repErr;
            const { error: delErr } = await supabaseOrders.from('maintenance_dependencies').delete().in('id', dupIds);
            if (delErr) throw delErr;

            const canonicalDep = allScopeDeps.find(d => d.id === group.canonicalId);
            if (canonicalDep) {
                group.deps.filter(d => d.id !== group.canonicalId).forEach(dup => {
                    canonicalDep.equipment += dup.equipment;
                    canonicalDep.reports += dup.reports;
                });
            }
            allScopeDeps = allScopeDeps.filter(d => !dupIds.includes(d.id));
            dependencyGroups.splice(i, 1);
        }

        UI.showAppNotification('Todos los grupos unificados con éxito.', 'success');
        renderDashboard();

    } catch (err: any) {
        console.error('Merge all error:', err);
        UI.showAppNotification('Error al unificar: ' + err.message, 'error');
    } finally {
        setBusy(false);
        setProgressVisible(false);
    }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function setBusy(next: boolean) {
    isBusy = next;
    const scanBtn = document.getElementById('dep-merge-scan') as HTMLButtonElement | null;
    if (scanBtn) scanBtn.disabled = next;
}

function setProgressVisible(visible: boolean) {
    const el = document.getElementById('dep-merge-progress');
    const bar = document.getElementById('dep-merge-progress-bar') as HTMLElement | null;
    if (el) el.style.display = visible ? 'block' : 'none';
    if (bar && !visible) bar.style.width = '0%';
}

function updateProgress(current: number, total: number, label: string) {
    const text = document.getElementById('dep-merge-progress-text');
    const bar = document.getElementById('dep-merge-progress-bar') as HTMLElement | null;
    if (text) text.textContent = `${label} (${current}/${total})`;
    if (bar) bar.style.width = `${Math.min(100, Math.round((current / Math.max(total, 1)) * 100))}%`;
}

function emptyStateHtml(message: string): string {
    return `<div style="text-align: center; color: var(--text-dim); padding: 40px; font-size: 0.95rem;">
        <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5; color: var(--primary);"></i><br>${message}
    </div>`;
}

function escapeHtml(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
