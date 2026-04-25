declare const ApexCharts: any;

import type {
    TechnicianLoad, CityVolume, TopClient,
    DemandByDay, ServiceTypeVolume, QuoteConversionKPIs, TopItem, RecurrenceAlert
} from './types';

const CHART_THEME = {
    background: 'transparent',
    fontFamily: 'Inter, sans-serif',
    textColor: '#B0C4DE',
    gridColor: 'rgba(255,255,255,0.05)',
    primaryColor: '#00ff9a',
    secondaryColor: '#00dfff',
    accentColor: '#ffd700',
    dangerColor: 'rgba(255,77,109,0.8)',
};

const activeCharts: any[] = [];

export function destroyAnalyticsCharts() {
    for (const chart of activeCharts) {
        try { chart.destroy(); } catch (_) { /* ignore */ }
    }
    activeCharts.length = 0;
}

function makeCard(title: string, icon: string, colClass = 'analytics-col-50'): { card: HTMLElement; body: HTMLElement } {
    const card = document.createElement('div');
    card.className = `analytics-widget ${colClass}`;
    card.innerHTML = `
        <div class="analytics-widget-header">
            <i class="fas ${icon}" style="color: var(--primary);"></i>
            <span>${title}</span>
        </div>
        <div class="analytics-widget-body"></div>
    `;
    return { card, body: card.querySelector('.analytics-widget-body') as HTMLElement };
}

function renderBarChart(container: HTMLElement, labels: string[], data: number[], color = CHART_THEME.primaryColor) {
    container.style.minHeight = '220px';
    const chart = new ApexCharts(container, {
        chart: {
            type: 'bar', height: 220, toolbar: { show: false },
            fontFamily: CHART_THEME.fontFamily, background: CHART_THEME.background,
            animations: { enabled: true, speed: 600 },
        },
        theme: { mode: 'dark' },
        series: [{ data }],
        xaxis: {
            categories: labels,
            labels: { style: { colors: CHART_THEME.textColor, fontSize: '11px' }, trim: true },
            axisBorder: { show: false }, axisTicks: { show: false },
        },
        yaxis: { labels: { style: { colors: CHART_THEME.textColor, fontSize: '10px' } } },
        colors: [color],
        plotOptions: { bar: { borderRadius: 4, columnWidth: '50%', horizontal: labels.length > 6 } },
        fill: { type: 'gradient', gradient: { shade: 'dark', type: 'vertical', opacityFrom: 1, opacityTo: 0.6 } },
        grid: { borderColor: CHART_THEME.gridColor },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark' },
    });
    chart.render();
    activeCharts.push(chart);
}

function renderDonutChart(container: HTMLElement, labels: string[], data: number[]) {
    container.style.minHeight = '220px';
    const chart = new ApexCharts(container, {
        chart: {
            type: 'donut', height: 220, toolbar: { show: false },
            fontFamily: CHART_THEME.fontFamily, background: CHART_THEME.background,
        },
        theme: { mode: 'dark' },
        series: data,
        labels,
        colors: ['#00ff9a', '#00dfff', '#ffd700', '#ff8c00', '#da70d6', '#ff6b6b'],
        plotOptions: { pie: { donut: { size: '70%' } } },
        legend: { position: 'bottom', labels: { colors: CHART_THEME.textColor }, fontSize: '11px' },
        dataLabels: { enabled: false },
        tooltip: { theme: 'dark' },
    });
    chart.render();
    activeCharts.push(chart);
}

function kpiHtml(value: string | number, label: string, color = 'var(--primary)', icon = '') {
    return `
        <div class="analytics-kpi">
            ${icon ? `<i class="fas ${icon} analytics-kpi-icon" style="color:${color};"></i>` : ''}
            <div class="analytics-kpi-value" style="color:${color};">${value}</div>
            <div class="analytics-kpi-label">${label}</div>
        </div>
    `;
}

// ---- Ops Section Widgets ----

export function renderTechnicianLoadWidget(parent: HTMLElement, data: TechnicianLoad[]) {
    const { card, body } = makeCard('Servicios por Técnico', 'fa-user-hard-hat');
    if (!data.length) {
        body.innerHTML = '<p class="analytics-empty">Sin datos en el periodo</p>';
    } else {
        renderBarChart(body, data.map(d => d.workerName), data.map(d => d.count), CHART_THEME.primaryColor);
    }
    parent.appendChild(card);
}

export function renderCityVolumeWidget(parent: HTMLElement, data: CityVolume[]) {
    const { card, body } = makeCard('Servicios por Ciudad', 'fa-map-marker-alt');
    if (!data.length) {
        body.innerHTML = '<p class="analytics-empty">Sin datos en el periodo</p>';
    } else {
        renderBarChart(body, data.map(d => d.cityName), data.map(d => d.count), CHART_THEME.secondaryColor);
    }
    parent.appendChild(card);
}

export function renderTopClientsWidget(parent: HTMLElement, data: TopClient[]) {
    const { card, body } = makeCard('Top Clientes por Volumen', 'fa-building', 'analytics-col-100');
    if (!data.length) {
        body.innerHTML = '<p class="analytics-empty">Sin datos en el periodo</p>';
    } else {
        const table = document.createElement('div');
        table.className = 'analytics-table-wrap';
        table.innerHTML = `
            <table class="analytics-table">
                <thead><tr><th>#</th><th>Cliente / Sede</th><th>Servicios</th></tr></thead>
                <tbody>${data.map((d, i) => `
                    <tr>
                        <td style="color:var(--text-muted);">${i + 1}</td>
                        <td>${d.name}</td>
                        <td><span class="analytics-badge">${d.count}</span></td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        body.appendChild(table);
    }
    parent.appendChild(card);
}

export function renderDemandByDayWidget(parent: HTMLElement, data: DemandByDay[]) {
    const { card, body } = makeCard('Demanda por Día de Semana', 'fa-calendar-week');
    if (!data.length || data.every(d => d.count === 0)) {
        body.innerHTML = '<p class="analytics-empty">Sin datos en el periodo</p>';
    } else {
        renderBarChart(body, data.map(d => d.label), data.map(d => d.count), CHART_THEME.accentColor);
    }
    parent.appendChild(card);
}

export function renderServiceTypeWidget(parent: HTMLElement, data: ServiceTypeVolume[]) {
    const { card, body } = makeCard('Tipos de Servicio', 'fa-tools');
    if (!data.length) {
        body.innerHTML = '<p class="analytics-empty">Sin datos en el periodo</p>';
    } else {
        renderDonutChart(body, data.map(d => d.name), data.map(d => d.count));
    }
    parent.appendChild(card);
}

export function renderRecurrenceWidget(parent: HTMLElement, data: RecurrenceAlert[]) {
    const { card, body } = makeCard('Reincidencias (últimos 30 días)', 'fa-exclamation-triangle', 'analytics-col-100');
    if (!data.length) {
        body.innerHTML = '<p class="analytics-empty" style="color:#00ff9a;">Sin reincidencias detectadas</p>';
    } else {
        const table = document.createElement('div');
        table.className = 'analytics-table-wrap';
        table.innerHTML = `
            <table class="analytics-table">
                <thead><tr><th>Cliente / Sede</th><th>Servicios</th><th>Último</th></tr></thead>
                <tbody>${data.map(d => `
                    <tr>
                        <td>${d.companyName}</td>
                        <td><span class="analytics-badge" style="background:rgba(255,77,109,0.15);color:#ff6b6b;">${d.count}</span></td>
                        <td style="color:var(--text-muted);">${d.lastDate}</td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        body.appendChild(table);
    }
    parent.appendChild(card);
}

// ---- Quotes Section Widgets ----

export function renderQuoteKPIsWidget(parent: HTMLElement, kpis: QuoteConversionKPIs) {
    const { card, body } = makeCard('Conversión de Cotizaciones', 'fa-file-invoice-dollar', 'analytics-col-100');
    const rateColor = kpis.conversionRate >= 50 ? '#00ff9a' : kpis.conversionRate >= 25 ? CHART_THEME.accentColor : CHART_THEME.dangerColor;
    body.innerHTML = `
        <div class="analytics-kpis-row">
            ${kpiHtml(kpis.totalQuotes, 'Total Cotizaciones', CHART_THEME.secondaryColor, 'fa-file-alt')}
            ${kpiHtml(kpis.convertedQuotes, 'Convertidas en Orden', '#00ff9a', 'fa-check-circle')}
            ${kpiHtml(kpis.pendingQuotes, 'Sin Convertir', CHART_THEME.dangerColor, 'fa-clock')}
            ${kpiHtml(`${kpis.conversionRate}%`, 'Tasa de Conversión', rateColor, 'fa-percentage')}
        </div>
        <div class="analytics-conversion-bar" title="${kpis.conversionRate}% convertidas">
            <div class="analytics-conversion-fill" style="width:${kpis.conversionRate}%;background:${rateColor};"></div>
        </div>`;
    parent.appendChild(card);
}

export function renderTopItemsWidget(parent: HTMLElement, data: TopItem[]) {
    const { card, body } = makeCard('Items Más Cotizados', 'fa-box-open', 'analytics-col-100');
    if (!data.length) {
        body.innerHTML = '<p class="analytics-empty">Sin datos disponibles</p>';
    } else {
        const max = data[0]?.appearanceCount || 1;
        const table = document.createElement('div');
        table.className = 'analytics-table-wrap';
        table.innerHTML = `
            <table class="analytics-table">
                <thead><tr><th>#</th><th>Descripción</th><th>Cotizaciones</th><th>Cantidad Total</th></tr></thead>
                <tbody>${data.map((d, i) => `
                    <tr>
                        <td style="color:var(--text-muted);">${i + 1}</td>
                        <td>${d.description}</td>
                        <td>
                            <div class="analytics-bar-inline">
                                <div style="width:${Math.round((d.appearanceCount/max)*100)}%;background:var(--primary);height:6px;border-radius:3px;"></div>
                                <span>${d.appearanceCount}</span>
                            </div>
                        </td>
                        <td><span class="analytics-badge" style="background:rgba(0,223,255,0.1);color:#00dfff;">${d.totalQuantity}</span></td>
                    </tr>`).join('')}
                </tbody>
            </table>`;
        body.appendChild(table);
    }
    parent.appendChild(card);
}