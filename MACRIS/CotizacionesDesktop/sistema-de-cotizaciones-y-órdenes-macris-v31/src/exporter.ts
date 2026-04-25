// @ts-ignore
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { generateReportPDF } from './pdf-reports';
import type { Report, City, Company, Dependency } from './reports-types';

function saveFileLocal(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 100);
}

export async function generateZipExport(
    reports: Report[],
    cities: City[],
    companies: Company[],
    dependencies: Dependency[]
) {
    if (!reports || reports.length === 0) return;

    const zip = new JSZip();

    for (const report of reports) {
        const pdfBlob = await generateReportPDF(report, cities, companies, dependencies, 'blob');
        const clientName = report.equipmentSnapshot.category === 'residencial' 
            ? report.equipmentSnapshot.client_name 
            : report.equipmentSnapshot.companyName;
        const normalizedClient = clientName ? clientName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'General';
        const filename = `Reporte_${normalizedClient}_${report.id.substring(0,8)}.pdf`;
        
        zip.file(filename, pdfBlob);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveFileLocal(zipBlob, `Reportes_Macris_${new Date().toISOString().split('T')[0]}.zip`);
}

export async function generateExcelExport(reports: Report[], cities: City[]) {
    if (!reports || reports.length === 0) return;

    const data = reports.map(r => {
        const city = cities.find(c => c.id === r.cityId)?.name || 'N/A';
        const clientOrCompany = r.equipmentSnapshot.category === 'residencial' 
            ? r.equipmentSnapshot.client_name 
            : r.equipmentSnapshot.companyName;

        return {
            'ID Reporte': r.id.substring(0,8),
            'Fecha': new Date(r.timestamp).toLocaleString(),
            'Técnico': r.workerName,
            'Tipo de Servicio': r.serviceType,
            'Cliente / Empresa': clientOrCompany,
            'Ciudad': city,
            'Categoría': r.equipmentSnapshot.category,
            'Observaciones': r.observations || '',
            'Presión (PSI)': r.pressure || '',
            'Amperaje (A)': r.amperage || '',
            'Pago Confirmado': r.is_paid ? 'Sí' : 'No'
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reportes");
    
    // Generar ArrayBuffer
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveFileLocal(blob, `Listado_Reportes_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export async function generateMergedPdfExport(
    reports: Report[],
    cities: City[],
    companies: Company[],
    dependencies: Dependency[]
) {
    if (!reports || reports.length === 0) return;

    let mergedDoc: any = null;

    for (const report of reports) {
        mergedDoc = await generateReportPDF(report, cities, companies, dependencies, 'doc', mergedDoc);
    }

    if (mergedDoc) {
        const pdfBlob = mergedDoc.output('blob');
        saveFileLocal(pdfBlob, `Reportes_Unificados_${new Date().toISOString().split('T')[0]}.pdf`);
    }
}

export async function getMergedPdfBlob(
    reports: Report[],
    cities: City[],
    companies: Company[],
    dependencies: Dependency[]
): Promise<Blob | null> {
    if (!reports || reports.length === 0) return null;

    let mergedDoc: any = null;

    for (const report of reports) {
        mergedDoc = await generateReportPDF(report, cities, companies, dependencies, 'doc', mergedDoc);
    }

    if (mergedDoc) {
        return mergedDoc.output('blob');
    }
    return null;
}

