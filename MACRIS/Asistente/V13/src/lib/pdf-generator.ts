


import { jsPDF } from 'jspdf';
import type { Report, City, Company, Dependency, Order } from '../types';

/**
 * Fetches a local image and converts it to a Base64 Data URL.
 * @param url The path to the local image (e.g., 'MacrisLogo.png').
 * @returns A promise that resolves with the data URL.
 */
async function getLocalImageAsDataUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error(`Failed to fetch local image at ${url}:`, error);
        // Return a placeholder or empty string to prevent total failure
        return '';
    }
}

const PDF_THEME = {
    margin: 15,
    headerColor: '#0D1117',
    primaryTextColor: '#21262D',
    secondaryTextColor: '#6c757d',
    borderColor: '#DEE2E6',
    mainTitleSize: 16,
    subTitleSize: 10,
    sectionTitleSize: 11,
    fieldLabelSize: 8,
    fieldValueSize: 10,
    footerHeight: 20,
    signatureAreaHeight: 45
};

let cachedLogoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string> {
    if (cachedLogoDataUrl === null) {
        cachedLogoDataUrl = await getLocalImageAsDataUrl('MacrisLogo.png');
    }
    return cachedLogoDataUrl;
}

function resolveReportDisplayIds(report: Report, allOrders: Order[]): { idValue: string; filenameId: string } {
    let idValue = report.id;
    if (report.orderId) {
        const linkedOrder = allOrders.find(o => o.id === report.orderId);
        if (linkedOrder && linkedOrder.manualId) {
            idValue = linkedOrder.manualId;
        }
    }
    const filenameId = (report.orderId && idValue !== report.id) ? idValue : report.id.substring(0, 8);
    return { idValue, filenameId };
}

function applyPdfFooter(doc: jsPDF) {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - PDF_THEME.footerHeight;
        doc.setDrawColor(PDF_THEME.borderColor);
        doc.line(PDF_THEME.margin, footerY, pageWidth - PDF_THEME.margin, footerY);
        doc.setFontSize(8);
        doc.setTextColor(PDF_THEME.secondaryTextColor);
        doc.text("Macris Ingeniería S.A.S - Reporte generado por la aplicación de mantenimiento.", PDF_THEME.margin, footerY + 8);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - PDF_THEME.margin, footerY + 8, { align: 'right' });
    }
}

async function renderReportToDoc(
    doc: jsPDF,
    report: Report,
    cities: City[],
    companies: Company[],
    dependencies: Dependency[],
    formatDate: (dateInput?: Date | string, includeTime?: boolean) => string,
    allOrders: Order[],
    startOnNewPage: boolean
): Promise<void> {
    if (startOnNewPage) {
        doc.addPage();
    }

    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const contentWidth = pageWidth - (2 * PDF_THEME.margin);

    let currentY = PDF_THEME.margin;
    const PAGE_BREAK_Y_THRESHOLD = pageHeight - PDF_THEME.footerHeight - PDF_THEME.signatureAreaHeight;

    const addSectionHeader = (title: string, y: number) => {
        doc.setFillColor(PDF_THEME.headerColor);
        doc.rect(PDF_THEME.margin, y, contentWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(PDF_THEME.sectionTitleSize);
        doc.setTextColor('#FFFFFF');
        doc.text(title.toUpperCase(), PDF_THEME.margin + 3, y + 5.5);
        return y + 8 + 6;
    };

    const addField = (label: string, value: string | undefined | null, x: number, y: number, maxWidth: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(PDF_THEME.fieldLabelSize);
        doc.setTextColor(PDF_THEME.secondaryTextColor);
        doc.text(label.toUpperCase(), x, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(PDF_THEME.fieldValueSize);
        doc.setTextColor(PDF_THEME.primaryTextColor);
        const textLines = doc.splitTextToSize(value || 'N/A', maxWidth);
        doc.text(textLines, x, y + 4);

        return (textLines.length * 5) + 9;
    };

    const addNewPage = (continuationTitle?: string) => {
        doc.addPage();
        currentY = PDF_THEME.margin;
        if (continuationTitle) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(PDF_THEME.subTitleSize);
            doc.setTextColor(PDF_THEME.secondaryTextColor);
            doc.text(`${continuationTitle} (Continuación)`, PDF_THEME.margin, currentY);
            currentY += 10;
        }
    };

    try {
        const logoDataUrl = await getLogoDataUrl();
        if (logoDataUrl) {
            const aspectRatio = 1823 / 1440;
            const logoHeight = 25;
            const logoWidth = logoHeight * aspectRatio;
            doc.addImage(logoDataUrl, 'PNG', PDF_THEME.margin, currentY, logoWidth, logoHeight);
        }
    } catch (e) {
        console.error("Could not load logo for PDF", e);
    }

    const { idValue } = resolveReportDisplayIds(report, allOrders);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(PDF_THEME.mainTitleSize);
    doc.setTextColor(PDF_THEME.headerColor);
    doc.text('REPORTE DE SERVICIO TÉCNICO', pageWidth - PDF_THEME.margin, currentY + 8, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_THEME.subTitleSize);
    doc.setTextColor(PDF_THEME.secondaryTextColor);
    doc.text(`ID Reporte: ${idValue}`, pageWidth - PDF_THEME.margin, currentY + 14, { align: 'right' });

    currentY += 28;

    currentY = addSectionHeader('Información General', currentY);

    const infoBoxY = currentY;
    const col1X = PDF_THEME.margin + 3;
    const col2X = pageWidth / 2 + 5;
    const colWidth = pageWidth / 2 - PDF_THEME.margin - 8;
    let col1Y = infoBoxY;
    let col2Y = infoBoxY;

    const city = cities.find(c => c.id === report.cityId)?.name;

    if (report.equipmentSnapshot.category === 'residencial') {
        col1Y += addField('Cliente:', report.equipmentSnapshot.client_name, col1X, col1Y, colWidth);
        col1Y += addField('Dirección:', report.equipmentSnapshot.address, col1X, col1Y, colWidth);
    } else {
        col1Y += addField('Empresa:', report.equipmentSnapshot.companyName, col1X, col1Y, colWidth);
        col1Y += addField('Dependencia:', report.equipmentSnapshot.dependencyName, col1X, col1Y, colWidth);
    }
    col1Y += addField('Ciudad:', city, col1X, col1Y, colWidth);

    col2Y += addField('Fecha y Hora:', formatDate(report.timestamp), col2X, col2Y, colWidth);
    col2Y += addField('Tipo de Servicio:', report.serviceType.charAt(0).toUpperCase() + report.serviceType.slice(1), col2X, col2Y, colWidth);
    col2Y += addField('Técnico Responsable:', report.workerName, col2X, col2Y, colWidth);
    col2Y += addField('Presión (PSI):', report.pressure, col2X, col2Y, colWidth);
    col2Y += addField('Amperaje (A):', report.amperage, col2X, col2Y, colWidth);

    currentY = Math.max(col1Y, col2Y);

    if (report.serviceType !== 'Montaje/Instalación') {
        currentY = addSectionHeader('Detalles del Equipo', currentY);

        const eqBoxY = currentY;
        let eqCol1Y = eqBoxY;
        let eqCol2Y = eqBoxY;

        eqCol1Y += addField('ID de equipo:', report.equipmentSnapshot.manualId, col1X, eqCol1Y, colWidth);
        eqCol1Y += addField('Modelo:', report.equipmentSnapshot.model, col1X, eqCol1Y, colWidth);
        eqCol1Y += addField('Marca:', report.equipmentSnapshot.brand, col1X, eqCol1Y, colWidth);

        eqCol2Y += addField('Tipo:', report.equipmentSnapshot.type, col2X, eqCol2Y, colWidth);
        eqCol2Y += addField('Capacidad:', report.equipmentSnapshot.capacity, col2X, eqCol2Y, colWidth);
        eqCol2Y += addField('Refrigerante:', report.equipmentSnapshot.refrigerant, col2X, eqCol2Y, colWidth);

        currentY = Math.max(eqCol1Y, eqCol2Y);
    }

    if (report.serviceType === 'Montaje/Instalación' && report.itemsSnapshot && report.itemsSnapshot.length > 0) {
        if (currentY > PAGE_BREAK_Y_THRESHOLD - 10) addNewPage();
        currentY = addSectionHeader('Items y Materiales Utilizados', currentY);

        const drawItemsHeader = () => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(PDF_THEME.fieldLabelSize);
            doc.setTextColor(PDF_THEME.primaryTextColor);
            doc.text('CANT.', PDF_THEME.margin + 5, currentY, { align: 'center' });
            doc.text('DESCRIPCIÓN', PDF_THEME.margin + 25, currentY);
            currentY += 2;
            doc.setDrawColor(PDF_THEME.borderColor);
            doc.line(PDF_THEME.margin, currentY, contentWidth + PDF_THEME.margin, currentY);
            currentY += 4;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(PDF_THEME.fieldValueSize);
        };

        drawItemsHeader();

        report.itemsSnapshot.forEach(item => {
            const descriptionLines = doc.splitTextToSize(item.description, contentWidth - 25);
            const itemHeight = (descriptionLines.length * 5) + 3;

            if (currentY + itemHeight > PAGE_BREAK_Y_THRESHOLD) {
                addNewPage('Items y Materiales');
                drawItemsHeader();
            }

            doc.text(String(item.quantity), PDF_THEME.margin + 5, currentY, { align: 'center' });
            doc.text(descriptionLines, PDF_THEME.margin + 25, currentY);
            currentY += itemHeight;
        });
        currentY += 4;
    }

    if (currentY > PAGE_BREAK_Y_THRESHOLD - 10) addNewPage();
    currentY = addSectionHeader('Observaciones', currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_THEME.fieldValueSize);
    doc.setTextColor(PDF_THEME.primaryTextColor);
    const obsText = report.observations || 'Sin observaciones.';
    const obsLines = doc.splitTextToSize(obsText, contentWidth - 6);

    obsLines.forEach((line: string) => {
        const lineHeight = 5;
        if (currentY + lineHeight > PAGE_BREAK_Y_THRESHOLD) {
            addNewPage('Observaciones');
        }
        doc.text(line, PDF_THEME.margin + 3, currentY);
        currentY += lineHeight;
    });

    if (report.serviceType === 'Montaje/Instalación' && (report.photo_internal_unit_url || report.photo_external_unit_url)) {
        const estimatedPhotoHeight = 80;
        if (currentY + estimatedPhotoHeight > PAGE_BREAK_Y_THRESHOLD) {
            addNewPage();
        }

        currentY = addSectionHeader('Fotografías de la Instalación', currentY);

        const photoBlockY = currentY;
        const photoMaxWidth = (contentWidth / 2) - 5;
        const photoCol1X = PDF_THEME.margin + 3;
        const photoCol2X = pageWidth / 2 + 5;
        let maxRowHeight = 0;

        const addPhotoToDoc = (label: string, dataUrl: string, x: number, y: number): number => {
            let height = 0;
            try {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(PDF_THEME.fieldLabelSize);
                doc.setTextColor(PDF_THEME.secondaryTextColor);
                doc.text(label.toUpperCase(), x, y);

                const imgProps = doc.getImageProperties(dataUrl);
                const aspectRatio = imgProps.width / imgProps.height;
                height = photoMaxWidth / aspectRatio;

                if (height > 70) {
                    height = 70;
                }

                doc.addImage(dataUrl, 'JPEG', x, y + 4, photoMaxWidth, height);
                return height + 4;
            } catch (e: any) {
                console.error(`Error adding photo "${label}" to PDF:`, e);
                doc.text('[Error al cargar imagen]', x, y + 10);
                return 15;
            }
        };

        if (report.photo_internal_unit_url) {
            const h = addPhotoToDoc('Unidad Interna', report.photo_internal_unit_url, photoCol1X, photoBlockY);
            maxRowHeight = Math.max(maxRowHeight, h);
        }

        if (report.photo_external_unit_url) {
            const h = addPhotoToDoc('Unidad Externa', report.photo_external_unit_url, photoCol2X, photoBlockY);
            maxRowHeight = Math.max(maxRowHeight, h);
        }

        if (maxRowHeight > 0) {
            currentY += maxRowHeight + 6;
        }
    }

    if (currentY > PAGE_BREAK_Y_THRESHOLD) {
        addNewPage();
    }

    const signatureLineY = pageHeight - PDF_THEME.footerHeight - 15;
    if (report.clientSignature && report.clientSignature !== "PENDING_SIGNATURE") {
        try {
            const sigImgProps = doc.getImageProperties(report.clientSignature);
            const sigWidth = 60;
            const sigHeight = (sigImgProps.height * sigWidth) / sigImgProps.width;
            const sigX = pageWidth / 2 - (sigWidth / 2);
            const sigY = signatureLineY - sigHeight - 2;

            doc.addImage(report.clientSignature, 'PNG', sigX, sigY, sigWidth, sigHeight);
        } catch (e: any) {
            console.error("Error adding signature to PDF:", e.message || e);
            doc.text("Error al cargar firma.", pageWidth / 2, signatureLineY - 10, { align: 'center' });
        }
    } else if (report.clientSignature === "PENDING_SIGNATURE") {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor('#d9534f');
        doc.text('FIRMA PENDIENTE', pageWidth / 2, signatureLineY - 10, { align: 'center' });
    }

    doc.setDrawColor(PDF_THEME.primaryTextColor);
    doc.line(PDF_THEME.margin + 30, signatureLineY, pageWidth - PDF_THEME.margin - 30, signatureLineY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(PDF_THEME.fieldLabelSize);
    doc.setTextColor(PDF_THEME.secondaryTextColor);
    doc.text('FIRMA DEL CLIENTE', pageWidth / 2, signatureLineY + 5, { align: 'center' });
}


export async function generateReportPDF(
    report: Report,
    cities: City[],
    companies: Company[],
    dependencies: Dependency[],
    formatDate: (dateInput?: Date | string, includeTime?: boolean) => string,
    allOrders: Order[],
    outputType: 'open' | 'blob' = 'open'
): Promise<Blob | void> {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    await renderReportToDoc(doc, report, cities, companies, dependencies, formatDate, allOrders, false);
    applyPdfFooter(doc);

    const { filenameId } = resolveReportDisplayIds(report, allOrders);
    const clientName = report.equipmentSnapshot.category === 'residencial' 
        ? report.equipmentSnapshot.client_name
        : report.equipmentSnapshot.companyName;
    
    const filename = `Reporte_${clientName?.replace(/\s/g, '_') || 'General'}_${filenameId}.pdf`;
    
    const pdfBlob = doc.output('blob');

    if (outputType === 'blob') {
        return pdfBlob;
    }
    
    // Default 'open' behavior
    const url = URL.createObjectURL(pdfBlob);
    const newWindow = window.open(url, '_blank');

    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        console.log('Popup blocked, falling back to download link method.');
        const link = document.createElement('a');
        link.href = url;
        link.download = filename; 
        link.style.display = 'none'; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    setTimeout(() => {
        window.URL.revokeObjectURL(url);
    }, 5000);
}

export async function generateReportsPDF(
    reports: Report[],
    cities: City[],
    companies: Company[],
    dependencies: Dependency[],
    formatDate: (dateInput?: Date | string, includeTime?: boolean) => string,
    allOrders: Order[]
): Promise<Blob> {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    for (let i = 0; i < reports.length; i++) {
        await renderReportToDoc(doc, reports[i], cities, companies, dependencies, formatDate, allOrders, i > 0);
    }

    applyPdfFooter(doc);
    return doc.output('blob');
}
