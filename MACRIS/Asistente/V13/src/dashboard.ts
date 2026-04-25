import * as State from './state';
import { fetchAllReportsForExport } from './api';
import { showLoader, hideLoader, openModal, closeModal } from './ui';
import type { Report, WidgetConfig } from './types';
import { fetchReportsForAnalytics, fetchOrdersForAnalytics, fetchQuotesForAnalytics, fetchQuoteItemsForAnalytics } from './analytics/api';
import { calcTechnicianLoad, calcCityVolume, calcTopClients, calcDemandByDay, calcServiceTypeVolume, calcQuoteConversion, calcTopItems, calcRecurrenceAlerts } from './analytics/calculations';
import { destroyAnalyticsCharts, renderTechnicianLoadWidget, renderCityVolumeWidget, renderTopClientsWidget, renderDemandByDayWidget, renderServiceTypeWidget, renderRecurrenceWidget, renderQuoteKPIsWidget, renderTopItemsWidget } from './analytics/widgets';

declare const ApexCharts: any;
declare const Sortable: any;

let isDashboardActive = false;
let lastDashboardData: Report[] = [];
let chartInstances: Record<string, any> = {};

// Default config if none exists
const defaultWidgets: WidgetConfig[] = [
    { id: 'w1', title: 'Total Reportes', type: 'kpi', metric: 'count', dimension: 'none', size: 'col-25' },
    { id: 'w2', title: 'Win Rate', type: 'kpi', metric: 'winrate', dimension: 'none', size: 'col-25' },
    { id: 'w3', title: 'Utilidades Aprox.', type: 'kpi', metric: 'utility', dimension: 'none', size: 'col-25' },
    { id: 'w4', title: 'Rendimiento por Día', type: 'line', metric: 'count', dimension: 'date', size: 'col-100' },
    { id: 'w5', title: 'Estado de Pagos', type: 'donut', metric: 'count', dimension: 'none', size: 'col-50' },
    { id: 'w6', title: 'Top Técnicos', type: 'bar', metric: 'count', dimension: 'workerName', size: 'col-50' }
];

export function getWidgetConfig(): WidgetConfig[] {
    const saved = localStorage.getItem('macris_dashboard_config');
    if (saved) {
        try { return JSON.parse(saved); } catch (e) { console.error('Corrupt dashboard config'); }
    }
    return defaultWidgets;
}

export function setWidgetConfig(config: WidgetConfig[]) {
    localStorage.setItem('macris_dashboard_config', JSON.stringify(config));
}

// ---- Analytics Tab State ----
let analyticsDateStart = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
})();
let analyticsDateEnd = new Date().toISOString().split('T')[0];

// ---- Analytics Tab Setup ----

export function setupAnalyticsTabs() {
    const tabReports = document.getElementById('analytics-tab-reports');
    const tabOps = document.getElementById('analytics-tab-ops');
    const tabQuotes = document.getElementById('analytics-tab-quotes');
    const panelReports = document.getElementById('analytics-panel-reports');
    const panelOps = document.getElementById('analytics-panel-ops');
    const panelQuotes = document.getElementById('analytics-panel-quotes');

    if (!tabReports || !tabOps || !tabQuotes) return;

    function activateTab(tab: 'reports' | 'ops' | 'quotes') {
        [tabReports, tabOps, tabQuotes].forEach(t => t?.classList.remove('active'));
        [panelReports, panelOps, panelQuotes].forEach(p => { if (p) p.style.display = 'none'; });

        if (tab === 'reports') {
            tabReports?.classList.add('active');
            if (panelReports) panelReports.style.display = 'block';
        } else if (tab === 'ops') {
            tabOps?.classList.add('active');
            if (panelOps) { panelOps.style.display = 'block'; loadOpsAnalytics(); }
        } else {
            tabQuotes?.classList.add('active');
            if (panelQuotes) { panelQuotes.style.display = 'block'; loadQuotesAnalytics(); }
        }
    }

    tabReports.addEventListener('click', () => activateTab('reports'));
    tabOps.addEventListener('click', () => activateTab('ops'));
    tabQuotes.addEventListener('click', () => activateTab('quotes'));

    // Analytics date filter listeners
    const startInput = document.getElementById('analytics-date-start') as HTMLInputElement;
    const endInput = document.getElementById('analytics-date-end') as HTMLInputElement;
    const applyBtn = document.getElementById('analytics-apply-filters');

    if (startInput) startInput.value = analyticsDateStart;
    if (endInput) endInput.value = analyticsDateEnd;

    applyBtn?.addEventListener('click', () => {
        analyticsDateStart = startInput?.value || analyticsDateStart;
        analyticsDateEnd = endInput?.value || analyticsDateEnd;
        const activeTab = tabOps?.classList.contains('active') ? 'ops' : tabQuotes?.classList.contains('active') ? 'quotes' : null;
        if (activeTab === 'ops') loadOpsAnalytics();
        else if (activeTab === 'quotes') loadQuotesAnalytics();
    });
}

async function loadOpsAnalytics() {
    const container = document.getElementById('ops-charts-grid');
    if (!container) return;

    container.innerHTML = '<div class="analytics-loading"><i class="fas fa-sync fa-spin"></i> Cargando análisis operativo...</div>';
    destroyAnalyticsCharts();

    try {
        const reports = await fetchReportsForAnalytics(analyticsDateStart, analyticsDateEnd);

        container.innerHTML = '';

        const techLoad = calcTechnicianLoad(reports);
        const cityVol = calcCityVolume(reports, State.cities);
        const topClients = calcTopClients(reports, State.companies);
        const demandByDay = calcDemandByDay(reports);
        const serviceTypes = calcServiceTypeVolume(reports);
        const recurrences = calcRecurrenceAlerts(reports, State.companies);

        // KPI row
        const kpiRow = document.createElement('div');
        kpiRow.className = 'analytics-kpis-row analytics-kpis-top';
        kpiRow.innerHTML = `
            <div class="analytics-kpi-mini"><span class="analytics-kpi-mini-val">${reports.length}</span><span class="analytics-kpi-mini-lbl">Servicios</span></div>
            <div class="analytics-kpi-mini"><span class="analytics-kpi-mini-val">${techLoad.length}</span><span class="analytics-kpi-mini-lbl">Técnicos activos</span></div>
            <div class="analytics-kpi-mini"><span class="analytics-kpi-mini-val">${cityVol.length}</span><span class="analytics-kpi-mini-lbl">Ciudades</span></div>
            <div class="analytics-kpi-mini"><span class="analytics-kpi-mini-val" style="color:#ff6b6b;">${recurrences.length}</span><span class="analytics-kpi-mini-lbl">Reincidencias</span></div>
        `;
        container.appendChild(kpiRow);

        // Charts grid
        const grid = document.createElement('div');
        grid.className = 'analytics-charts-grid';
        container.appendChild(grid);

        renderTechnicianLoadWidget(grid, techLoad);
        renderCityVolumeWidget(grid, cityVol);
        renderDemandByDayWidget(grid, demandByDay);
        renderServiceTypeWidget(grid, serviceTypes);
        renderTopClientsWidget(grid, topClients);
        renderRecurrenceWidget(grid, recurrences);

    } catch (e) {
        console.error('Ops analytics error:', e);
        container.innerHTML = '<p class="analytics-empty">Error cargando datos. Intenta de nuevo.</p>';
    }
}

async function loadQuotesAnalytics() {
    const container = document.getElementById('quotes-charts-grid');
    if (!container) return;

    container.innerHTML = '<div class="analytics-loading"><i class="fas fa-sync fa-spin"></i> Cargando análisis de cotizaciones...</div>';
    destroyAnalyticsCharts();

    try {
        const [quotes, orders, quoteItems] = await Promise.all([
            fetchQuotesForAnalytics(),
            fetchOrdersForAnalytics(analyticsDateStart, analyticsDateEnd),
            fetchQuoteItemsForAnalytics(),
        ]);

        container.innerHTML = '';

        const kpis = calcQuoteConversion(quotes, orders);
        const topItems = calcTopItems(quoteItems);

        const grid = document.createElement('div');
        grid.className = 'analytics-charts-grid';
        container.appendChild(grid);

        renderQuoteKPIsWidget(grid, kpis);
        renderTopItemsWidget(grid, topItems);

    } catch (e) {
        console.error('Quotes analytics error:', e);
        container.innerHTML = '<p class="analytics-empty">Error cargando datos. Intenta de nuevo.</p>';
    }
}

export function setupDashboard() {
    const btnTable = document.getElementById('btn-view-table');
    const btnDashboard = document.getElementById('btn-view-dashboard');
    const tableContainer = document.getElementById('table-container');
    const dashboardContainer = document.getElementById('dashboard-container');

    btnTable?.addEventListener('click', () => {
        isDashboardActive = false;
        btnTable.style.borderColor = 'var(--primary)';
        btnTable.style.color = 'var(--primary)';
        if(btnDashboard) {
            btnDashboard.style.borderColor = 'var(--border)';
            btnDashboard.style.color = 'white';
        }
        if(tableContainer) tableContainer.style.display = 'block';
        if(dashboardContainer) dashboardContainer.style.display = 'none';
        
        const loader = document.getElementById('table-loader-mini');
        if (loader) loader.style.display = 'none';
    });

    btnDashboard?.addEventListener('click', async () => {
        isDashboardActive = true;
        btnDashboard.style.borderColor = 'var(--primary)';
        btnDashboard.style.color = 'var(--primary)';
        if(btnTable) {
            btnTable.style.borderColor = 'var(--border)';
            btnTable.style.color = 'white';
        }
        if(tableContainer) tableContainer.style.display = 'none';
        if(dashboardContainer) dashboardContainer.style.display = 'flex';
        
        await updateDashboardData();
    });

    // Builder Buttons
    document.getElementById('btn-reset-dashboard')?.addEventListener('click', async () => {
        if(confirm('¿Seguro que deseas restaurar las gráficas a su estado original?')) {
            setWidgetConfig(defaultWidgets);
            await updateDashboardData();
        }
    });

    const builderForm = document.getElementById('widget-builder-form') as HTMLFormElement;
    if (builderForm) {
        builderForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newWidget: WidgetConfig = {
                id: 'w_' + Date.now().toString(),
                title: (document.getElementById('widget-title') as HTMLInputElement).value || 'Nuevo Widget',
                type: (document.getElementById('widget-type') as HTMLSelectElement).value as any,
                metric: (document.getElementById('widget-metric') as HTMLSelectElement).value as any,
                dimension: (document.getElementById('widget-dimension') as HTMLSelectElement).value as any,
                size: (document.getElementById('widget-size') as HTMLSelectElement).value as any
            };
            const currentConfig = getWidgetConfig();
            currentConfig.push(newWidget);
            setWidgetConfig(currentConfig);
            closeModal('modal-widget-builder');
            builderForm.reset();
            await updateDashboardData();
        });
    }

    document.getElementById('btn-add-widget')?.addEventListener('click', () => {
        openModal('modal-widget-builder');
    });

    // Setup Sortable
    const grid = document.getElementById('dashboard-grid');
    if (grid && typeof Sortable !== 'undefined') {
        new Sortable(grid, {
            animation: 150,
            handle: '.widget-handle',
            ghostClass: 'widget-ghost',
            onEnd: function () {
                // Save new order
                const newOrderIds = Array.from(grid.children).map((el: any) => el.id.replace('widget-', ''));
                const currentConfig = getWidgetConfig();
                const reorderedConfig: WidgetConfig[] = [];
                newOrderIds.forEach(id => {
                    const match = currentConfig.find(c => c.id === id);
                    if (match) reorderedConfig.push(match);
                });
                setWidgetConfig(reorderedConfig);
            }
        });
    }
}

export async function updateDashboardData() {
    if (!isDashboardActive) return;

    showLoader('Calculando rendimiento...');
    try {
        lastDashboardData = await fetchAllReportsForExport(State.filters);
        renderWidgets();
    } catch (e) {
        console.error("Dashboard Error:", e);
    } finally {
        hideLoader();
    }
}

function renderWidgets() {
    const grid = document.getElementById('dashboard-grid');
    if (!grid) return;

    // Destroy old charts to prevent memory leaks
    Object.values(chartInstances).forEach((chart: any) => {
        if(chart && typeof chart.destroy === 'function') chart.destroy();
    });
    chartInstances = {};
    grid.innerHTML = '';

    const config = getWidgetConfig();
    
    config.forEach(widget => {
        const card = document.createElement('div');
        card.id = `widget-${widget.id}`;
        card.className = `widget-card ${widget.size}`;
        card.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.widget-actions') || (e.target as HTMLElement).closest('.widget-handle')) return;
            // Optionally close others
            document.querySelectorAll('.widget-card.is-editing').forEach(el => {
                if(el !== card) el.classList.remove('is-editing');
            });
            card.classList.toggle('is-editing');
        });
        
        const handle = document.createElement('div');
        handle.className = 'widget-handle';
        handle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        
        const actions = document.createElement('div');
        actions.className = 'widget-actions';

        const sizes: {s: WidgetConfig['size'], i: string}[] = [
            {s: 'col-100', i: 'fa-square'}, 
            {s: 'col-50', i: 'fa-columns'}, 
            {s: 'col-33', i: 'fa-th-list'}, 
            {s: 'col-25', i: 'fa-th-large'}
        ];
        sizes.forEach(({s, i}) => {
            const sizeBtn = document.createElement('button');
            sizeBtn.className = `widget-action-btn ${widget.size === s ? 'active' : ''}`;
            sizeBtn.innerHTML = `<i class="fas ${i}"></i>`;
            sizeBtn.onclick = (e) => {
                e.stopPropagation();
                let conf = getWidgetConfig();
                let match = conf.find(c => c.id === widget.id);
                if(match) { match.size = s; setWidgetConfig(conf); updateDashboardData(); }
            };
            actions.appendChild(sizeBtn);
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'widget-action-btn delete-btn';
        delBtn.innerHTML = '<i class="fas fa-trash"></i>';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            if(confirm('¿Eliminar gráfica?')) {
                setWidgetConfig(getWidgetConfig().filter(c => c.id !== widget.id));
                updateDashboardData();
            }
        };
        actions.appendChild(delBtn);

        const title = document.createElement('h3');
        title.className = 'widget-title';
        title.textContent = widget.title;

        // Content Pane needs flex-grow to stretch vertically properly
        const contentPane = document.createElement('div');
        contentPane.id = `chart-mount-${widget.id}`;
        contentPane.className = 'chart-mount';
        contentPane.style.width = '100%';
        contentPane.style.flex = '1 1 auto';
        contentPane.style.display = 'flex';
        contentPane.style.flexDirection = 'column';
        if (widget.type !== 'kpi') {
            contentPane.style.minHeight = '200px';
        }

        card.appendChild(handle);
        card.appendChild(actions);
        card.appendChild(title);
        card.appendChild(contentPane);
        
        // Apply custom dimensions if present
        if (widget.widthPx) {
            card.style.width = widget.widthPx + 'px';
            card.style.flex = '0 0 auto';
        }
        if (widget.heightPx) {
            card.style.height = widget.heightPx + 'px';
            contentPane.style.height = (widget.heightPx - 40) + 'px';
        }

        grid.appendChild(card);

        // Render Data
        if (widget.type === 'kpi') {
            renderKPIWidget(widget, contentPane);
        } else {
            renderChartWidget(widget, contentPane.id);
        }

        // Apply interactive resizing
        setupResizer(card, widget);
    });
}

// ----------------------
// DATA AGGREGATION
// ----------------------

function calculateUtilityValue(report: Report): number {
    const st = report.serviceType.toLowerCase();
    if (st.includes('preventivo')) return 50;
    if (st.includes('correctivo')) return 80;
    if (st.includes('instalaci') || st.includes('montaje')) return 150;
    return 30; // Otros
}

function getAggregatedData(widget: WidgetConfig) {
    const data = lastDashboardData;
    let result: Record<string, number> = {};

    // For WinLoss or Paid/Pending logic specifically on Donuts when dimension is 'none'
    if (widget.dimension === 'none' && widget.metric !== 'utility') {
        const paid = data.filter(r => r.is_paid).length;
        const pending = data.length - paid;
        return { 'Pagados': paid, 'Pendientes': pending };
    }

    data.forEach(r => {
        // Dimension grouping
        let key = 'Default';
        if (widget.dimension === 'date') {
            key = new Date(r.timestamp).toISOString().split('T')[0];
        } else if (widget.dimension === 'workerName') {
            key = r.workerName || 'Sin Técnico';
        } else if (widget.dimension === 'serviceType') {
            key = r.serviceType || 'Desconocido';
        } else if (widget.dimension === 'cityId') { // Simplified since we don't have cityName populated here
            key = r.cityId || 'Desconocido';
        }

        // Metric counting
        let value = 0;
        if (widget.metric === 'count') {
            value = 1;
        } else if (widget.metric === 'utility') {
            value = calculateUtilityValue(r);
        } else if (widget.metric === 'winrate') {
            value = r.is_paid ? 1 : 0; // Temporally store count of wins
        }

        result[key] = (result[key] || 0) + value;
    });

    if (widget.metric === 'winrate') {
        // We have to divide by total items in that dimension. This requires a double pass.
        // For simplicity in this demo, let's keep winrate as "Count of Wins" per dimension
        // or just calculate actual rate.
        const totalCounts: Record<string, number> = {};
        data.forEach(r => {
            let key = 'Default';
            if (widget.dimension === 'workerName') key = r.workerName || 'Sin Técnico';
            // ... (keep logic simple for winrate)
            totalCounts[key] = (totalCounts[key] || 0) + 1;
        });
        for (const k in result) {
            result[k] = Math.round((result[k] / (totalCounts[k] || 1)) * 100);
        }
    }

    // Sort by Date if dimension is Date
    if (widget.dimension === 'date') {
        const sortedDates = Object.keys(result).sort();
        const recentDates = sortedDates.slice(-14); // Keep last 14 for cleanliness
        const sortedResult: Record<string, number> = {};
        recentDates.forEach(d => sortedResult[d] = result[d]);
        return sortedResult;
    }

    // Sort others by Value descending
    const sortedResult: Record<string, number> = {};
    const keys = Object.keys(result).sort((a, b) => result[b] - result[a]);
    keys.slice(0, 10).forEach(k => sortedResult[k] = result[k]); // Top 10 limit

    return sortedResult;
}

// ----------------------
// RENDERERS
// ----------------------

function renderKPIWidget(widget: WidgetConfig, container: HTMLElement) {
    let valueStr = "0";
    if (widget.metric === 'count') {
        valueStr = lastDashboardData.length.toString();
    } else if (widget.metric === 'winrate') {
        const paid = lastDashboardData.filter(r => r.is_paid).length;
        const val = lastDashboardData.length ? Math.round((paid / lastDashboardData.length) * 100) : 0;
        valueStr = `${val}%`;
    } else if (widget.metric === 'utility') {
        let totalVal = 0;
        lastDashboardData.forEach(r => totalVal += calculateUtilityValue(r));
        valueStr = `$${totalVal.toLocaleString()}`;
    }

    const valDiv = document.createElement('div');
    valDiv.className = 'widget-kpi-value';
    valDiv.textContent = valueStr;
    container.appendChild(valDiv);
}

function renderChartWidget(widget: WidgetConfig, containerId: string) {
    const el = document.getElementById(containerId);
    if (!el || typeof ApexCharts === 'undefined') return;

    const dataDict = getAggregatedData(widget);
    const labels = Object.keys(dataDict);
    const seriesData = Object.values(dataDict);

    let options: any = {
        chart: {
            type: widget.type,
            height: '100%',
            toolbar: { show: false },
            fontFamily: 'Inter, sans-serif',
            background: 'transparent',
            animations: { enabled: true, easing: 'easeinout', speed: 800 }
        },
        theme: { mode: 'dark' },
        dataLabels: { enabled: false },
        stroke: { show: true, colors: ['transparent'], width: 2 }
    };

    if (widget.type === 'donut') {
        options.series = seriesData;
        options.labels = labels;
        options.colors = ['#00ff9a', 'rgba(255, 77, 109, 0.8)', '#00dfff', '#ffd700', '#ff8c00', '#da70d6'];
        options.plotOptions = {
            pie: { donut: { size: '75%', labels: { show: true, name: { show: true, color: '#B0C4DE', fontSize: '12px' }, value: { show: true, color: '#fff', fontSize: '20px', fontWeight: 'bold' } } } }
        };
        options.legend = { position: 'bottom', labels: { colors: '#B0C4DE' }, fontSize: '11px', markers: { width: 8, height: 8 } };
        options.stroke.show = false;
    } 
    else if (widget.type === 'bar' || widget.type === 'line') {
        options.series = [{ name: widget.title, data: seriesData }];
        options.xaxis = {
            categories: labels,
            labels: { style: { colors: '#B0C4DE', fontSize: '10px' }, trim: true, hideOverlappingLabels: true },
            axisBorder: { show: false }, axisTicks: { show: false }
        };
        options.yaxis = { labels: { style: { colors: '#B0C4DE', fontSize: '10px' } } };
        options.colors = ['#00ff9a'];
        if (widget.type === 'bar') {
            options.plotOptions = { bar: { borderRadius: 4, columnWidth: '45%' } };
            options.fill = {
                type: 'gradient',
                gradient: { shade: 'dark', type: 'vertical', shadeIntensity: 0.5, gradientToColors: ['rgba(0, 223, 255, 0.8)'], inverseColors: true, opacityFrom: 1, opacityTo: 0.6, stops: [0, 100] }
            };
        } else {
             // Line specifics
             options.stroke.width = 3;
             options.stroke.colors = ['#00dfff'];
             options.colors = ['#00dfff'];
             options.markers = { size: 4, colors: ['#00ff9a'], strokeColors: '#00dfff', strokeWidth: 2 };
        }
        options.grid = { show: false };
    }

    const chart = new ApexCharts(el, options);
    chart.render();
    chartInstances[widget.id] = chart;
}

function setupResizer(card: HTMLElement, widget: WidgetConfig) {
    const rRight = document.createElement('div');
    rRight.className = 'resizer resizer-r';
    const rBottom = document.createElement('div');
    rBottom.className = 'resizer resizer-b';
    const rCorner = document.createElement('div');
    rCorner.className = 'resizer resizer-br';

    card.appendChild(rRight);
    card.appendChild(rBottom);
    card.appendChild(rCorner);

    let startX = 0, startY = 0, startWidth = 0, startHeight = 0, mode = '';

    const onMouseMove = (e: MouseEvent) => {
        if (!mode) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        if (mode.includes('r')) {
            const w = Math.max(250, startWidth + dx);
            card.style.width = w + 'px';
            card.style.flex = '0 0 auto';
        }
        if (mode.includes('b')) {
            const h = Math.max(200, startHeight + dy);
            card.style.height = h + 'px';
            const pane = card.querySelector('.chart-mount') as HTMLElement;
            if(pane) pane.style.height = (h - 40) + 'px';
        }
        
        // Let ApexCharts auto-resize internally or trigger resize event
        window.dispatchEvent(new Event('resize'));
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        card.classList.remove('is-resizing');
        
        // Save dimension state
        const rect = card.getBoundingClientRect();
        let conf = getWidgetConfig();
        const match = conf.find(c => c.id === widget.id);
        if(match) {
            match.widthPx = rect.width;
            match.heightPx = Math.max(200, rect.height);
            setWidgetConfig(conf);
        }
    };

    const attachDrag = (element: HTMLElement, dragMode: string) => {
        element.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            mode = dragMode;
            startX = e.clientX;
            startY = e.clientY;
            const rect = card.getBoundingClientRect();
            startWidth = rect.width;
            startHeight = rect.height;
            card.classList.add('is-resizing');
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    };

    attachDrag(rRight, 'r');
    attachDrag(rBottom, 'b');
    attachDrag(rCorner, 'rb');
}
