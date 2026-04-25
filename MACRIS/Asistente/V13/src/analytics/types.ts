export interface AnalyticsFilters {
    startDate: string;
    endDate: string;
}

export interface TechnicianLoad {
    workerName: string;
    count: number;
}

export interface CityVolume {
    cityId: string;
    cityName: string;
    count: number;
}

export interface TopClient {
    companyId: string;
    name: string;
    count: number;
}

export interface DemandByDay {
    label: string;
    count: number;
}

export interface ServiceTypeVolume {
    name: string;
    count: number;
}

export interface QuoteConversionKPIs {
    totalQuotes: number;
    convertedQuotes: number;
    conversionRate: number;
    pendingQuotes: number;
}

export interface TopItem {
    description: string;
    totalQuantity: number;
    appearanceCount: number;
}

export interface RecurrenceAlert {
    companyName: string;
    count: number;
    lastDate: string;
}