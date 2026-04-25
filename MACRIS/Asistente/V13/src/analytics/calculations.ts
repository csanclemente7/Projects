import type { Report, City, Company } from '../types';
import type { RawQuote, RawQuoteItem, RawOrder } from './api';
import type {
    TechnicianLoad, CityVolume, TopClient,
    DemandByDay, ServiceTypeVolume, QuoteConversionKPIs, TopItem, RecurrenceAlert
} from './types';

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function calcTechnicianLoad(reports: Report[]): TechnicianLoad[] {
    const counts: Record<string, number> = {};
    for (const r of reports) {
        const name = r.workerName || 'Sin Técnico';
        counts[name] = (counts[name] || 0) + 1;
    }
    return Object.entries(counts)
        .map(([workerName, count]) => ({ workerName, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

export function calcCityVolume(reports: Report[], cities: City[]): CityVolume[] {
    const cityMap = new Map(cities.map(c => [c.id, c.name]));
    const counts: Record<string, { name: string; count: number }> = {};
    for (const r of reports) {
        if (!r.cityId) continue;
        if (!counts[r.cityId]) counts[r.cityId] = { name: cityMap.get(r.cityId) || r.cityId, count: 0 };
        counts[r.cityId].count++;
    }
    return Object.entries(counts)
        .map(([cityId, { name, count }]) => ({ cityId, cityName: name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

export function calcTopClients(reports: Report[], companies: Company[]): TopClient[] {
    const companyMap = new Map(companies.map(c => [c.id, c.name]));
    const counts: Record<string, { name: string; count: number }> = {};
    for (const r of reports) {
        if (!r.companyId) continue;
        if (!counts[r.companyId]) counts[r.companyId] = { name: companyMap.get(r.companyId) || r.companyId, count: 0 };
        counts[r.companyId].count++;
    }
    return Object.entries(counts)
        .map(([companyId, { name, count }]) => ({ companyId, name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}

export function calcDemandByDay(reports: Report[]): DemandByDay[] {
    const counts = new Array(7).fill(0);
    for (const r of reports) {
        const d = new Date(r.timestamp).getDay();
        counts[d]++;
    }
    return DAYS_ES.map((label, i) => ({ label, count: counts[i] }));
}

export function calcServiceTypeVolume(reports: Report[]): ServiceTypeVolume[] {
    const counts: Record<string, number> = {};
    for (const r of reports) {
        const t = r.serviceType || 'Desconocido';
        counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

export function calcQuoteConversion(quotes: RawQuote[], orders: RawOrder[]): QuoteConversionKPIs {
    const totalQuotes = quotes.length;
    const convertedQuoteIds = new Set(orders.filter(o => o.quoteId).map(o => o.quoteId!));
    const convertedQuotes = quotes.filter(q => convertedQuoteIds.has(q.id)).length;
    const conversionRate = totalQuotes > 0 ? Math.round((convertedQuotes / totalQuotes) * 100) : 0;
    return {
        totalQuotes,
        convertedQuotes,
        conversionRate,
        pendingQuotes: totalQuotes - convertedQuotes,
    };
}

export function calcTopItems(quoteItems: RawQuoteItem[]): TopItem[] {
    const map: Record<string, { totalQuantity: number; appearanceCount: number }> = {};
    for (const item of quoteItems) {
        const key = item.description.trim();
        if (!map[key]) map[key] = { totalQuantity: 0, appearanceCount: 0 };
        map[key].totalQuantity += item.quantity;
        map[key].appearanceCount++;
    }
    return Object.entries(map)
        .map(([description, { totalQuantity, appearanceCount }]) => ({ description, totalQuantity, appearanceCount }))
        .sort((a, b) => b.appearanceCount - a.appearanceCount)
        .slice(0, 10);
}

export function calcRecurrenceAlerts(reports: Report[], companies: Company[], windowDays = 30): RecurrenceAlert[] {
    const companyMap = new Map(companies.map(c => [c.id, c.name]));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - windowDays);

    const recent = reports.filter(r => r.companyId && new Date(r.timestamp) >= cutoff);
    const counts: Record<string, { count: number; lastDate: string }> = {};
    for (const r of recent) {
        if (!r.companyId) continue;
        if (!counts[r.companyId]) counts[r.companyId] = { count: 0, lastDate: r.timestamp };
        counts[r.companyId].count++;
        if (r.timestamp > counts[r.companyId].lastDate) counts[r.companyId].lastDate = r.timestamp;
    }
    return Object.entries(counts)
        .filter(([, v]) => v.count >= 3)
        .map(([companyId, { count, lastDate }]) => ({
            companyName: companyMap.get(companyId) || companyId,
            count,
            lastDate: lastDate.split('T')[0],
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
}