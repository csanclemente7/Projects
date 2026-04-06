
import type { Equipment, Report, ScheduledMaintenanceItem } from './types';

/**
 * Adds a specified number of months to a given ISO date string.
 * @param isoDateString The starting date in ISO format (e.g., "2023-01-15T10:00:00Z").
 * @param months The number of months to add.
 * @returns A new Date object with the added months.
 */
function addMonthsToDate(isoDateString: string, months: number): Date {
    const date = new Date(isoDateString);
    // Handles cases like adding 1 month to Jan 31st, resulting in Feb 28th/29th correctly.
    const originalDay = date.getDate();
    date.setMonth(date.getMonth() + months);
    // If the new month doesn't have the original day (e.g., adding 1 month to Jan 31),
    // it will roll over to the next month. This line corrects it by setting the date to the last day of the previous month.
    if (date.getDate() !== originalDay) {
        date.setDate(0); 
    }
    return date;
}

/**
 * Calculates the schedule of upcoming or overdue maintenances based on equipment and their reports.
 * @param equipmentList - An array of all equipment.
 * @param reports - An array of all maintenance reports.
 * @returns An array of scheduled maintenance items.
 */
export function calculateSchedule(equipmentList: Equipment[], reports: Report[]): ScheduledMaintenanceItem[] {
    console.log(`[ScheduleCalc] Iniciando cálculo para ${equipmentList.length} equipos y ${reports.length} reportes.`);
    
    const scheduledItems: ScheduledMaintenanceItem[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Normalize to the start of the day for consistent comparison.

    // 1. Create a map for the latest report date for each equipment for efficient lookup.
    const latestReportDates = new Map<string, string>();
    reports.forEach(report => {
        const equipmentId = report.equipmentSnapshot?.id;
        if (equipmentId && equipmentId !== 'MANUAL_NO_ID') {
            const existingDate = latestReportDates.get(equipmentId);
            if (!existingDate || new Date(report.timestamp) > new Date(existingDate)) {
                latestReportDates.set(equipmentId, report.timestamp);
            }
        }
    });
    console.log(`[ScheduleCalc] Se encontraron reportes para ${latestReportDates.size} equipos únicos.`);

    // 2. Iterate over each piece of equipment to determine its next maintenance date.
    equipmentList.forEach(equipment => {
        let baseDate: string | undefined | null = undefined;
        let dateSource: 'report' | 'manual' | 'creation' | 'none' = 'none';

        // Determine the base date with priority: Latest Report > Manual Date > Creation Date
        const latestReportDate = latestReportDates.get(equipment.id);
        
        if (latestReportDate) {
            baseDate = latestReportDate;
            dateSource = 'report';
        } else if (equipment.lastMaintenanceDate) {
            baseDate = equipment.lastMaintenanceDate;
            dateSource = 'manual';
        } else if (equipment.created_at) {
            baseDate = equipment.created_at;
            dateSource = 'creation';
        }

        if (dateSource !== 'none') {
             console.log(`[ScheduleCalc] Equipo ${equipment.id.substring(0,8)} (${equipment.model}): Usando fecha base de tipo '${dateSource}' -> ${baseDate}`);
        }

        // 3. If a base date is found, calculate the next due date.
        if (baseDate && equipment.periodicityMonths > 0) {
            const nextDueDate = addMonthsToDate(baseDate, equipment.periodicityMonths);
            nextDueDate.setHours(0, 0, 0, 0); // Normalize for comparison.

            const timeDiff = nextDueDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
            
            let statusText: string;
            let statusColorClass: string;
            
            if (daysRemaining < 0) {
                statusText = `Vencido hace ${Math.abs(daysRemaining)} días`;
                statusColorClass = 'status-overdue';
            } else if (daysRemaining === 0) {
                statusText = 'Vence Hoy';
                statusColorClass = 'status-due-today';
            } else if (daysRemaining <= 15) {
                statusText = `Vence en ${daysRemaining} días`;
                statusColorClass = 'status-due-soon';
            } else {
                 statusText = `Faltan ${daysRemaining} días`;
                 statusColorClass = 'status-due-later';
            }

            // We can show all upcoming maintenances, or filter them (e.g., only in the next year)
            // For now, let's include all calculated maintenances.
            scheduledItems.push({ 
                equipment, 
                nextDueDate, 
                daysRemaining, 
                statusText, 
                statusColorClass,
                lastMaintenanceDate: baseDate, // The actual date used for the calculation.
            });
        } else {
            console.warn(`[ScheduleCalc] Equipo ${equipment.id.substring(0,8)} (${equipment.model}) saltado. No tiene fecha base (reporte/manual/creación) o su periodicidad es 0.`);
        }
    });

    // 4. Sort the items by the most urgent first.
    scheduledItems.sort((a, b) => a.daysRemaining - b.daysRemaining);
    console.log(`[ScheduleCalc] Cálculo finalizado. Se generaron ${scheduledItems.length} items para el cronograma.`);

    return scheduledItems;
}
