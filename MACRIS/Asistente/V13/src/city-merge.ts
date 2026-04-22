/**
 * city-merge.ts — Unificador de Ciudades Duplicadas
 *
 * Detecta ciudades con nombres repetidos o equivalentes por normalizacion,
 * muestra cuantas sedes estan asociadas a cada una y permite unificar tanto
 * grupos detectados automaticamente como grupos armados de forma manual.
 */

import * as State from './state';
import * as UI from './ui';
import { supabaseOrders, fetchCities } from './api';
import { normalizeString } from './utils';
import type { City, Equipment, Report, Company } from './types';

type CityInfo = {
    id: string;
    name: string;
    sedes: number;
};

type CityGroup = {
    name: string;
    cities: CityInfo[];
    canonicalId: string;
};

let isBusy = false;
let cityGroups: CityGroup[] = [];
let allCities: CityInfo[] = [];

export function initCityMerge() {
    const openBtn = document.getElementById('city-merge-btn');
    const modal = document.getElementById('city-merge-modal');
    const closeBtn = document.getElementById('close-city-merge-modal');
    const scanBtn = document.getElementById('city-merge-scan') as HTMLButtonElement | null;
    const manualBtn = document.getElementById('city-merge-manual') as HTMLButtonElement | null;

    openBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'flex';
        resetDashboard();
    });

    closeBtn?.addEventListener('click', () => {
        if (modal) modal.style.display = 'none';
        resetDashboard();
    });

    scanBtn?.addEventListener('click', async () => {
        await scanForDuplicateCities();
    });

    manualBtn?.addEventListener('click', async () => {
        await initManualMode();
    });
}

async function initManualMode() {
    setBusy(true);
    setProgressVisible(true);
    updateProgress(0, 2, 'Cargando ciudades...');

    try {
        allCities = await fetchCityInfos();
        cityGroups = [];
        updateProgress(2, 2, 'Modo manual listo');
        renderDashboard();
        UI.showAppNotification('Modo manual listo. Usa "Añadir a grupo" para armar grupos manualmente.', 'info');
    } catch (err: any) {
        console.error('City merge manual mode error:', err);
        UI.showAppNotification('Error al cargar ciudades: ' + err.message, 'error');
    } finally {
        setProgressVisible(false);
        setBusy(false);
    }
}

async function scanForDuplicateCities() {
    setBusy(true);
    setProgressVisible(true);
    updateProgress(0, 3, 'Cargando ciudades...');

    try {
        allCities = await fetchCityInfos();

        updateProgress(1, 3, 'Detectando duplicados...');
        const groupsByName = new Map<string, CityInfo[]>();
        allCities.forEach(city => {
            const key = normalizeString(city.name);
            const list = groupsByName.get(key) || [];
            list.push(city);
            groupsByName.set(key, list);
        });

        cityGroups = Array.from(groupsByName.values())
            .filter(group => group.length > 1)
            .map(group => {
                const sorted = [...group].sort((a, b) => {
                    if (b.sedes !== a.sedes) return b.sedes - a.sedes;
                    return a.name.localeCompare(b.name);
                });
                return {
                    name: sorted[0].name,
                    cities: sorted,
                    canonicalId: sorted[0].id,
                };
            });

        updateProgress(2, 3, 'Preparando panel...');
        renderDashboard();

        updateProgress(3, 3, 'Escaneo completado');
        if (cityGroups.length > 0) {
            UI.showAppNotification(`${cityGroups.length} grupos de ciudades duplicadas detectados.`, 'success');
        } else {
            UI.showAppNotification('No se detectaron duplicados automaticos. Puedes unificar de forma manual.', 'info');
        }
    } catch (err: any) {
        console.error('City merge scan error:', err);
        UI.showAppNotification('Error al escanear ciudades: ' + err.message, 'error');
    } finally {
        setProgressVisible(false);
        setBusy(false);
    }
}

async function fetchCityInfos(): Promise<CityInfo[]> {
    let cities = State.cities;
    if (!cities || cities.length === 0) {
        cities = await fetchCities();
        State.setCities(cities);
    }

    const sedeCounts = await fetchSedeCountsByCity();
    return [...cities]
        .map(city => ({
            id: city.id,
            name: city.name,
            sedes: sedeCounts.get(city.id) || 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchSedeCountsByCity(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    let from = 0;

    while (true) {
        const { data, error } = await supabaseOrders
            .from('maintenance_companies')
            .select('id, city_id, client_id')
            .not('city_id', 'is', null)
            .order('id', { ascending: true })
            .range(from, from + 999);
        if (error) throw error;

        const rows = (data || []) as Array<{ id: string; city_id: string | null; client_id: string | null }>;
        rows.forEach(row => {
            if (row.city_id && row.client_id) {
                counts.set(row.city_id, (counts.get(row.city_id) || 0) + 1);
            }
        });

        if (rows.length < 1000) break;
        from += 1000;
    }

    return counts;
}

function resetDashboard() {
    cityGroups = [];
    allCities = [];
    const dashboard = document.getElementById('city-merge-dashboard');
    if (dashboard) dashboard.innerHTML = emptyStateHtml('Haz clic en "Escanear Duplicados" o usa "Modo manual" para empezar.');
}

function renderDashboard() {
    const dashboard = document.getElementById('city-merge-dashboard');
    if (!dashboard) return;

    if (allCities.length === 0) {
        dashboard.innerHTML = emptyStateHtml('No hay ciudades cargadas.');
        return;
    }

    dashboard.innerHTML = '';

    const totalSedes = allCities.reduce((sum, city) => sum + city.sedes, 0);
    const summary = document.createElement('div');
    summary.style.cssText = 'display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 15px; font-size: 0.78rem;';
    summary.innerHTML = `
        <span style="background: rgba(10,199,212,0.12); border: 1px solid rgba(10,199,212,0.3); color: var(--primary); padding: 4px 10px; border-radius: 6px;">
            <i class="fas fa-city"></i> ${allCities.length} ciudades totales
        </span>
        <span style="background: rgba(255,165,0,0.12); border: 1px solid rgba(255,165,0,0.3); color: #ffad33; padding: 4px 10px; border-radius: 6px;">
            <i class="fas fa-sitemap"></i> ${totalSedes} sedes registradas
        </span>
        <span style="background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.25); color: #ff6b6b; padding: 4px 10px; border-radius: 6px;">
            <i class="fas fa-copy"></i> ${cityGroups.length} grupos duplicados
        </span>`;
    dashboard.appendChild(summary);

    if (cityGroups.length > 0) {
        const groupsHeader = document.createElement('div');
        groupsHeader.style.cssText = 'font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: #ff6b6b; letter-spacing: 0.5px; margin-bottom: 10px;';
        groupsHeader.innerHTML = '<i class="fas fa-copy"></i> Grupos Duplicados';
        dashboard.appendChild(groupsHeader);

        cityGroups.forEach((group, groupIdx) => {
            dashboard.appendChild(buildGroupCard(group, groupIdx));
        });

        if (cityGroups.length > 1) {
            const mergeAllEl = document.createElement('div');
            mergeAllEl.style.cssText = 'display: flex; justify-content: flex-end; padding: 10px 0; border-top: 1px dashed var(--border); margin-bottom: 20px;';
            mergeAllEl.innerHTML = `
                <button class="btn btn-primary city-merge-all-btn" style="font-weight: 700;">
                    <i class="fas fa-layer-group"></i> Unificar todos los grupos (${cityGroups.length})
                </button>`;
            mergeAllEl.querySelector('.city-merge-all-btn')?.addEventListener('click', () => mergeAllGroups());
            dashboard.appendChild(mergeAllEl);
        }
    }

    renderAllCitiesPanel(dashboard);
}

function buildGroupCard(group: CityGroup, groupIdx: number): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 15px; margin-bottom: 14px;';

    const header = document.createElement('div');
    header.style.cssText = 'font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px; margin-bottom: 10px;';
    header.innerHTML = `
        <i class="fas fa-copy" style="color: #00dfff;"></i> Grupo:
        <strong style="color: var(--text);">${escapeHtml(group.name)}</strong>
        <span style="background: rgba(255,80,80,0.15); color: #ff6b6b; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; margin-left: 8px;">${group.cities.length} entradas</span>`;
    card.appendChild(header);

    const rowsEl = document.createElement('div');
    group.cities.forEach(city => rowsEl.appendChild(buildGroupCityRow(city, group, groupIdx)));
    card.appendChild(rowsEl);

    card.appendChild(buildGroupSearchBar(group));

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; justify-content: flex-end; margin-top: 12px;';
    actions.innerHTML = `
        <button class="btn btn-primary btn-sm city-merge-apply-btn" style="font-size: 0.8rem;">
            <i class="fas fa-code-branch"></i> Unificar este grupo
        </button>`;
    actions.querySelector('.city-merge-apply-btn')?.addEventListener('click', () => mergeGroup(groupIdx));
    card.appendChild(actions);

    return card;
}

function buildGroupCityRow(city: CityInfo, group: CityGroup, groupIdx: number): HTMLElement {
    const isCanonical = city.id === group.canonicalId;
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px; margin-bottom: 6px;
        background: ${isCanonical ? 'rgba(10,199,212,0.08)' : 'rgba(255,255,255,0.02)'};
        border: 1px solid ${isCanonical ? 'rgba(10,199,212,0.3)' : 'var(--border)'};`;
    row.innerHTML = `
        <input type="radio" name="city-canonical-${groupIdx}" value="${city.id}" ${isCanonical ? 'checked' : ''}
               style="accent-color: var(--primary); width: 16px; height: 16px; flex-shrink: 0; cursor: pointer;">
        <div style="flex: 1; min-width: 0;">
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(city.name)}</div>
            <div style="font-size: 0.7rem; color: var(--text-dim);">ID: ${city.id.slice(0, 8)}…</div>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-dim); text-align: right; white-space: nowrap; flex-shrink: 0;">
            <i class="fas fa-sitemap" style="color: #ffad33;"></i> ${city.sedes} sedes
        </div>
        ${isCanonical ? '<span style="font-size: 0.65rem; background: rgba(10,199,212,0.2); color: var(--primary); padding: 2px 6px; border-radius: 4px; flex-shrink: 0; white-space: nowrap;">CANONICA</span>' : ''}
        <button class="city-row-delete-btn" title="Eliminar ciudad"
                style="background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.25); color: #ff6b6b; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-trash"></i>
        </button>
        <button class="city-row-remove-btn" title="Quitar del grupo"
                style="background: rgba(255,80,80,0.1); border: 1px solid rgba(255,80,80,0.25); color: #ff6b6b; width: 24px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 0.75rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-times"></i>
        </button>`;

    const radio = row.querySelector('input[type=radio]') as HTMLInputElement;
    radio.addEventListener('change', () => {
        group.canonicalId = city.id;
        renderDashboard();
    });

    row.querySelector('.city-row-delete-btn')?.addEventListener('click', async () => {
        await deleteCity(city.id, city.name);
    });

    row.querySelector('.city-row-remove-btn')?.addEventListener('click', () => {
        if (group.cities.length <= 2) {
            UI.showAppNotification('Un grupo debe tener al menos 2 ciudades para poder unificar.', 'info');
            return;
        }
        group.cities = group.cities.filter(entry => entry.id !== city.id);
        if (group.canonicalId === city.id) group.canonicalId = group.cities[0].id;
        renderDashboard();
    });

    return row;
}

function buildGroupSearchBar(group: CityGroup): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: relative; margin-top: 10px;';
    wrapper.innerHTML = `
        <div style="font-size: 0.65rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.4px; margin-bottom: 6px;">
            <i class="fas fa-plus-circle" style="color: #00dfff;"></i> Agregar ciudad manualmente
        </div>
        <input type="text" class="city-group-search-input" placeholder="Buscar ciudad por nombre..."
               style="width: 100%; background: var(--bg-input); border: 1px solid var(--border); padding: 7px 10px; border-radius: 6px; color: var(--text); font-size: 0.82rem; box-sizing: border-box;" autocomplete="off">
        <div class="city-group-search-results"
             style="display: none; position: absolute; left: 0; right: 0; top: 100%; z-index: 200; max-height: 180px; overflow-y: auto; background: var(--bg-card); border: 1px solid #00dfff; border-top: none; border-radius: 0 0 8px 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.45);"></div>`;

    const input = wrapper.querySelector('.city-group-search-input') as HTMLInputElement;
    const results = wrapper.querySelector('.city-group-search-results') as HTMLElement;

    let debounce: ReturnType<typeof setTimeout>;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        const query = input.value.trim().toLowerCase();
        if (query.length < 1) {
            results.style.display = 'none';
            return;
        }

        debounce = setTimeout(() => {
            const groupCityIds = new Set(group.cities.map(city => city.id));
            const matches = allCities
                .filter(city => !groupCityIds.has(city.id) && city.name.toLowerCase().includes(query))
                .slice(0, 8);

            if (matches.length === 0) {
                results.innerHTML = '<div style="padding: 10px; color: var(--text-dim); font-size: 0.8rem; text-align: center;">Sin resultados</div>';
            } else {
                results.innerHTML = matches.map(city => `
                    <div class="city-search-item" data-id="${city.id}"
                         style="padding: 9px 12px; cursor: pointer; border-bottom: 1px solid var(--border); font-size: 0.83rem; color: var(--text); display: flex; justify-content: space-between; align-items: center;"
                         onmouseover="this.style.background='rgba(0,223,255,0.1)'" onmouseout="this.style.background='transparent'">
                        <span><i class="fas fa-plus" style="color: #00dfff; margin-right: 8px; font-size: 0.7rem;"></i>${escapeHtml(city.name)}</span>
                        <span style="font-size: 0.68rem; color: var(--text-dim); white-space: nowrap; margin-left: 8px;">
                            <i class="fas fa-sitemap" style="color: #ffad33;"></i> ${city.sedes}
                        </span>
                    </div>`).join('');
            }

            results.style.display = 'block';
            results.querySelectorAll('.city-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = (item as HTMLElement).dataset.id!;
                    const city = allCities.find(entry => entry.id === id);
                    if (!city) return;

                    cityGroups.forEach(existingGroup => {
                        existingGroup.cities = existingGroup.cities.filter(entry => entry.id !== id);
                    });
                    cityGroups = cityGroups.filter(existingGroup => existingGroup.cities.length > 0);

                    group.cities.push(city);
                    input.value = '';
                    results.style.display = 'none';
                    renderDashboard();
                });
            });
        }, 150);
    });

    document.addEventListener('click', (event) => {
        if (!wrapper.contains(event.target as Node)) results.style.display = 'none';
    });

    return wrapper;
}

function renderAllCitiesPanel(dashboard: HTMLElement) {
    const panel = document.createElement('div');
    panel.style.cssText = 'margin-top: 5px;';

    const isDefaultOpen = cityGroups.length === 0;
    panel.innerHTML = `
        <div class="city-all-toggle" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 8px; user-select: none;">
            <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.5px;">
                <i class="fas fa-list" style="color: var(--primary);"></i>
                Todas las ciudades
                <span style="background: rgba(10,199,212,0.15); color: var(--primary); padding: 2px 8px; border-radius: 4px; margin-left: 6px;">${allCities.length}</span>
            </span>
            <i class="fas fa-chevron-${isDefaultOpen ? 'up' : 'down'} city-all-chevron" style="color: var(--text-dim); font-size: 0.8rem;"></i>
        </div>
        <div class="city-all-body" style="display: ${isDefaultOpen ? 'block' : 'none'}; margin-top: 8px; max-height: 320px; overflow-y: auto; padding: 0 2px;"></div>`;

    const toggle = panel.querySelector('.city-all-toggle') as HTMLElement;
    const body = panel.querySelector('.city-all-body') as HTMLElement;
    const chevron = panel.querySelector('.city-all-chevron') as HTMLElement;

    toggle.addEventListener('click', () => {
        const open = body.style.display === 'none';
        body.style.display = open ? 'block' : 'none';
        chevron.className = `fas fa-chevron-${open ? 'up' : 'down'} city-all-chevron`;
        chevron.style.color = 'var(--text-dim)';
        chevron.style.fontSize = '0.8rem';
    });

    const sortedCities = [...allCities].sort((a, b) => a.name.localeCompare(b.name));
    const inGroupIds = new Set(cityGroups.flatMap(group => group.cities.map(city => city.id)));

    sortedCities.forEach(city => {
        const inGroup = inGroupIds.has(city.id);
        const groupOfCity = inGroup ? cityGroups.find(group => group.cities.some(entry => entry.id === city.id)) : null;

        const row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 7px; margin-bottom: 4px;
            background: ${inGroup ? 'rgba(0,223,255,0.06)' : 'rgba(255,255,255,0.02)'};
            border: 1px solid ${inGroup ? 'rgba(0,223,255,0.2)' : 'var(--border)'};`;

        const groupBadge = inGroup && groupOfCity
            ? `<span style="font-size: 0.62rem; background: rgba(0,223,255,0.2); color: #00dfff; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0;">
                   En grupo: ${escapeHtml(groupOfCity.name.slice(0, 20))}${groupOfCity.name.length > 20 ? '…' : ''}
               </span>`
            : '';

        row.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.82rem; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(city.name)}</div>
                <div style="font-size: 0.68rem; color: var(--text-dim);">ID: ${city.id.slice(0, 8)}…</div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-dim); white-space: nowrap; flex-shrink: 0;">
                <i class="fas fa-sitemap" style="color: #ffad33;"></i> ${city.sedes}
            </div>
            ${groupBadge}
            <button class="btn btn-danger btn-sm city-delete-btn" style="font-size: 0.72rem; padding: 4px 8px; white-space: nowrap; flex-shrink: 0;">
                <i class="fas fa-trash"></i>
            </button>
            ${!inGroup ? buildAddToGroupBtn() : ''}`;

        row.querySelector('.city-delete-btn')?.addEventListener('click', async (event) => {
            event.stopPropagation();
            await deleteCity(city.id, city.name);
        });

        if (!inGroup) {
            row.querySelector('.city-add-to-group-btn')?.addEventListener('click', (event) => {
                event.stopPropagation();
                showAddToGroupPopover(city, row);
            });
        }

        body.appendChild(row);
    });

    dashboard.appendChild(panel);
}

function buildAddToGroupBtn(): string {
    return `<button class="btn btn-secondary btn-sm city-add-to-group-btn" style="font-size: 0.72rem; padding: 4px 8px; white-space: nowrap; flex-shrink: 0; border-color: rgba(0,223,255,0.4); color: #00dfff;">
        <i class="fas fa-plus"></i> Añadir a grupo
    </button>`;
}

function showAddToGroupPopover(city: CityInfo, anchor: HTMLElement) {
    document.querySelectorAll('.city-group-popover').forEach(pop => pop.remove());

    const popover = document.createElement('div');
    popover.className = 'city-group-popover';
    popover.style.cssText = 'position: fixed; z-index: 5000; background: var(--bg-card); border: 1px solid #00dfff; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); min-width: 200px; max-width: 280px; overflow: hidden; visibility: hidden;';

    const options: string[] = [];
    if (cityGroups.length > 0) {
        options.push('<div style="padding: 8px 12px; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.4px; border-bottom: 1px solid var(--border);">Añadir a grupo existente</div>');
        cityGroups.forEach((group, groupIdx) => {
            options.push(`
                <div class="city-popover-item" data-action="add" data-group="${groupIdx}"
                     style="padding: 9px 12px; cursor: pointer; font-size: 0.82rem; color: var(--text); border-bottom: 1px solid var(--border);"
                     onmouseover="this.style.background='rgba(0,223,255,0.1)'" onmouseout="this.style.background='transparent'">
                    <i class="fas fa-folder-plus" style="color: #00dfff; margin-right: 8px; font-size: 0.75rem;"></i>${escapeHtml(group.name.slice(0, 30))}${group.name.length > 30 ? '…' : ''}
                </div>`);
        });
    }

    options.push(`
        <div class="city-popover-item" data-action="new"
             style="padding: 9px 12px; cursor: pointer; font-size: 0.82rem; color: #00dfff;"
             onmouseover="this.style.background='rgba(0,223,255,0.1)'" onmouseout="this.style.background='transparent'">
            <i class="fas fa-plus-circle" style="margin-right: 8px; font-size: 0.75rem;"></i>Crear nuevo grupo
        </div>`);

    popover.innerHTML = options.join('');
    document.body.appendChild(popover);

    const dashboard = document.getElementById('city-merge-dashboard');
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

    popover.querySelectorAll('.city-popover-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = (item as HTMLElement).dataset.action;
            const groupIdx = parseInt((item as HTMLElement).dataset.group || '-1');
            cleanup();

            if (action === 'add' && groupIdx >= 0) {
                const targetGroup = cityGroups[groupIdx];
                if (targetGroup && !targetGroup.cities.find(entry => entry.id === city.id)) {
                    targetGroup.cities.push(city);
                    renderDashboard();
                }
            } else if (action === 'new') {
                cityGroups.push({
                    name: city.name,
                    cities: [city],
                    canonicalId: city.id,
                });
                renderDashboard();
                UI.showAppNotification(`Grupo "${city.name}" creado. Agrega otra ciudad para poder unificar.`, 'info');
            }
        });
    });

    const closeHandler = (event: Event) => {
        if (!popover.contains(event.target as Node) && !anchor.contains(event.target as Node)) {
            cleanup();
        }
    };

    setTimeout(() => document.addEventListener('click', closeHandler), 0);
    window.addEventListener('resize', cleanup);
    dashboard?.addEventListener('scroll', cleanup);
}

async function mergeGroup(groupIdx: number) {
    if (isBusy) return;
    const group = cityGroups[groupIdx];
    if (!group) return;

    const canonical = group.cities.find(city => city.id === group.canonicalId);
    const duplicates = group.cities.filter(city => city.id !== group.canonicalId);
    if (!canonical || duplicates.length === 0) {
        UI.showAppNotification('Este grupo necesita al menos una ciudad duplicada para unificar.', 'info');
        return;
    }

    const dupNames = duplicates.map(city => `"${city.name}" (${city.sedes} sedes)`).join('\n');
    const confirmed = await UI.showConfirmationModal(
        `¿Unificar el grupo "${group.name}"?\n\n` +
        `Se conservara: "${canonical.name}" (ID: ${canonical.id.slice(0, 8)}…)\n\n` +
        `Se moveran las referencias de maintenance_companies, maintenance_equipment y maintenance_reports desde:\n${dupNames}`,
        'Unificar'
    );
    if (!confirmed) return;

    setBusy(true);
    setProgressVisible(true);

    try {
        const dupIds = duplicates.map(city => city.id);
        updateProgress(1, 4, 'Reasignando sedes y empresas...');
        await assertSupabase(
            supabaseOrders.from('maintenance_companies').update({ city_id: canonical.id }).in('city_id', dupIds)
        );

        updateProgress(2, 4, 'Reasignando equipos...');
        await assertSupabase(
            supabaseOrders.from('maintenance_equipment').update({ city_id: canonical.id }).in('city_id', dupIds)
        );

        updateProgress(3, 4, 'Reasignando reportes...');
        await assertSupabase(
            supabaseOrders.from('maintenance_reports').update({ city_id: canonical.id }).in('city_id', dupIds)
        );

        updateProgress(4, 4, 'Eliminando ciudades duplicadas...');
        await assertSupabase(
            supabaseOrders.from('maintenance_cities').delete().in('id', dupIds)
        );

        applyLocalMerge(canonical.id, dupIds);
        canonical.sedes += duplicates.reduce((sum, city) => sum + city.sedes, 0);
        allCities = allCities.filter(city => !dupIds.includes(city.id));
        cityGroups.splice(groupIdx, 1);

        UI.showAppNotification(`Grupo "${group.name}" unificado con exito.`, 'success');
        renderDashboard();
    } catch (err: any) {
        console.error('City merge error:', err);
        UI.showAppNotification('Error al unificar: ' + err.message, 'error');
    } finally {
        setBusy(false);
        setProgressVisible(false);
    }
}

async function mergeAllGroups() {
    if (isBusy) return;
    const validGroups = cityGroups.filter(group => group.cities.filter(city => city.id !== group.canonicalId).length > 0);
    if (validGroups.length === 0) return;

    const confirmed = await UI.showConfirmationModal(
        `¿Unificar los ${validGroups.length} grupos de ciudades duplicadas?\n\nEsta accion movera referencias y eliminara las ciudades repetidas.`,
        'Unificar Todo'
    );
    if (!confirmed) return;

    setBusy(true);
    setProgressVisible(true);

    try {
        const total = validGroups.length;
        for (let index = cityGroups.length - 1; index >= 0; index--) {
            const group = cityGroups[index];
            const canonical = group.cities.find(city => city.id === group.canonicalId);
            const duplicates = group.cities.filter(city => city.id !== group.canonicalId);
            const dupIds = duplicates.map(city => city.id);
            if (!canonical || dupIds.length === 0) continue;

            updateProgress(total - index, total, `Unificando "${group.name}"...`);
            await assertSupabase(
                supabaseOrders.from('maintenance_companies').update({ city_id: canonical.id }).in('city_id', dupIds)
            );
            await assertSupabase(
                supabaseOrders.from('maintenance_equipment').update({ city_id: canonical.id }).in('city_id', dupIds)
            );
            await assertSupabase(
                supabaseOrders.from('maintenance_reports').update({ city_id: canonical.id }).in('city_id', dupIds)
            );
            await assertSupabase(
                supabaseOrders.from('maintenance_cities').delete().in('id', dupIds)
            );

            applyLocalMerge(canonical.id, dupIds);
            canonical.sedes += duplicates.reduce((sum, city) => sum + city.sedes, 0);
            allCities = allCities.filter(city => !dupIds.includes(city.id));
            cityGroups.splice(index, 1);
        }

        UI.showAppNotification('Todas las ciudades duplicadas se unificaron con exito.', 'success');
        renderDashboard();
    } catch (err: any) {
        console.error('City merge all error:', err);
        UI.showAppNotification('Error al unificar ciudades: ' + err.message, 'error');
    } finally {
        setBusy(false);
        setProgressVisible(false);
    }
}

async function deleteCity(cityId: string, cityName: string) {
    if (isBusy) return;

    const confirmed = await UI.showConfirmationModal(
        `¿Eliminar la ciudad "${cityName}"?\n\nSi tiene sedes, equipos o reportes asociados, la base no permitirá borrarla.`,
        'Eliminar'
    );
    if (!confirmed) return;

    setBusy(true);
    try {
        const { error } = await supabaseOrders.from('maintenance_cities').delete().eq('id', cityId);
        if (error) {
            if ((error as any).code === '23503') {
                throw new Error('No se puede eliminar porque la ciudad tiene sedes, equipos o reportes asociados. Unifícala o reasigna esas referencias primero.');
            }
            throw error;
        }

        allCities = allCities.filter(city => city.id !== cityId);
        cityGroups = cityGroups
            .map(group => {
                const nextCities = group.cities.filter(city => city.id !== cityId);
                const nextCanonicalId = group.canonicalId === cityId ? (nextCities[0]?.id || '') : group.canonicalId;
                return { ...group, cities: nextCities, canonicalId: nextCanonicalId };
            })
            .filter(group => group.cities.length > 0);

        State.setCities(State.cities.filter(city => city.id !== cityId));
        UI.showAppNotification(`Ciudad "${cityName}" eliminada con exito.`, 'success');
        renderDashboard();
    } catch (err: any) {
        console.error('Delete city error:', err);
        UI.showAppNotification(err.message || 'No se pudo eliminar la ciudad.', 'error');
    } finally {
        setBusy(false);
    }
}

function applyLocalMerge(canonicalId: string, dupIds: string[]) {
    State.companies.forEach((company: Company) => {
        if (company.cityId && dupIds.includes(company.cityId)) company.cityId = canonicalId;
    });
    State.equipmentList.forEach((equipment: Equipment) => {
        if (equipment.cityId && dupIds.includes(equipment.cityId)) equipment.cityId = canonicalId;
    });
    State.reports.forEach((report: Report) => {
        if (report.cityId && dupIds.includes(report.cityId)) report.cityId = canonicalId;
    });
    State.filteredReports.forEach((report: Report) => {
        if (report.cityId && dupIds.includes(report.cityId)) report.cityId = canonicalId;
    });

    const nextCities: City[] = allCities
        .filter(city => !dupIds.includes(city.id))
        .map(city => ({ id: city.id, name: city.name }));
    State.setCities(nextCities);
}

function setBusy(next: boolean) {
    isBusy = next;
    const scanBtn = document.getElementById('city-merge-scan') as HTMLButtonElement | null;
    const manualBtn = document.getElementById('city-merge-manual') as HTMLButtonElement | null;
    if (scanBtn) scanBtn.disabled = next;
    if (manualBtn) manualBtn.disabled = next;
}

function setProgressVisible(visible: boolean) {
    const el = document.getElementById('city-merge-progress');
    const bar = document.getElementById('city-merge-progress-bar') as HTMLElement | null;
    if (el) el.style.display = visible ? 'block' : 'none';
    if (bar && !visible) bar.style.width = '0%';
}

function updateProgress(current: number, total: number, label: string) {
    const text = document.getElementById('city-merge-progress-text');
    const bar = document.getElementById('city-merge-progress-bar') as HTMLElement | null;
    if (text) text.textContent = `${label} (${current}/${total})`;
    if (bar) bar.style.width = `${Math.min(100, Math.round((current / Math.max(total, 1)) * 100))}%`;
}

function emptyStateHtml(message: string): string {
    return `<div style="text-align: center; color: var(--text-dim); padding: 40px; font-size: 0.95rem;">
        <i class="fas fa-city" style="font-size: 2rem; margin-bottom: 15px; opacity: 0.5; color: var(--primary);"></i><br>${message}
    </div>`;
}

function escapeHtml(str: string): string {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function assertSupabase(promise: PromiseLike<{ error: any }>) {
    const result = await promise;
    if (result.error) throw result.error;
}
