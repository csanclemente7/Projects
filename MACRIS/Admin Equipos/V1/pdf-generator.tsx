
import { jsPDF } from 'jspdf';
import type { Report, City, Company, Dependency } from './types';

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


export async function generateReportPDF(
    report: Report,
    cities: City[],
    companies: Company[],
    dependencies: Dependency[],
    formatDate: (dateInput?: Date | string, includeTime?: boolean) => string
) {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;

    // --- PDF Generation Constants ---
    const margin = 15;
    const contentWidth = pageWidth - (2 * margin);
    
    // Corporate Colors for PDF (adapted for white background)
    const headerColor = '#0D1117';
    const primaryTextColor = '#21262D';
    const secondaryTextColor = '#6c757d';
    const borderColor = '#DEE2E6';

    // Font Sizes
    const mainTitleSize = 16;
    const subTitleSize = 10;
    const sectionTitleSize = 11;
    const fieldLabelSize = 8;
    const fieldValueSize = 10;
    
    // --- Pagination and Layout Constants ---
    let currentY = margin;
    const FOOTER_HEIGHT = 20;
    const SIGNATURE_AREA_HEIGHT = 45;
    // The Y coordinate where the flowing content must stop to leave space for signature and footer
    const PAGE_BREAK_Y_THRESHOLD = pageHeight - FOOTER_HEIGHT - SIGNATURE_AREA_HEIGHT;


    // --- Helper Functions ---
    const addSectionHeader = (title: string, y: number) => {
        doc.setFillColor(headerColor);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(sectionTitleSize);
        doc.setTextColor('#FFFFFF');
        doc.text(title.toUpperCase(), margin + 3, y + 5.5);
        return y + 8 + 6;
    };
    
    const addField = (label: string, value: string | undefined | null, x: number, y: number, maxWidth: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fieldLabelSize);
        doc.setTextColor(secondaryTextColor);
        doc.text(label.toUpperCase(), x, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fieldValueSize);
        doc.setTextColor(primaryTextColor);
        const textLines = doc.splitTextToSize(value || 'N/A', maxWidth);
        doc.text(textLines, x, y + 4);
        
        return (textLines.length * 5) + 9;
    };
    
    const addNewPage = (continuationTitle?: string) => {
        doc.addPage();
        currentY = margin;
        if (continuationTitle) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(subTitleSize);
            doc.setTextColor(secondaryTextColor);
            doc.text(`${continuationTitle} (Continuación)`, margin, currentY);
            currentY += 10;
        }
    };
    
    // --- 1. Header ---
    try {
        const logoDataUrl = await getLocalImageAsDataUrl('MacrisLogo.png');
        if (logoDataUrl) {
            const aspectRatio = 1823 / 1440;
            const logoHeight = 25;
            const logoWidth = logoHeight * aspectRatio;
            doc.addImage(logoDataUrl, 'PNG', margin, currentY, logoWidth, logoHeight);
        }
    } catch (e) {
        console.error("Could not load logo for PDF", e);
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(mainTitleSize);
    doc.setTextColor(headerColor);
    doc.text('REPORTE DE SERVICIO TÉCNICO', pageWidth - margin, currentY + 8, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(subTitleSize);
    doc.setTextColor(secondaryTextColor);
    doc.text(`ID Reporte: ${report.id}`, pageWidth - margin, currentY + 14, { align: 'right' });
    
    currentY += 28;

    // --- 2. Client & Service Information ---
    currentY = addSectionHeader('Información General', currentY);
    
    const infoBoxY = currentY;
    const col1X = margin + 3;
    const col2X = pageWidth / 2 + 5;
    const colWidth = pageWidth / 2 - margin - 8;
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
    
    // --- 3. Equipment Details ---
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

    // --- 4. Items (if applicable) with PAGINATION ---
    if (report.serviceType === 'Montaje/Instalación' && report.itemsSnapshot && report.itemsSnapshot.length > 0) {
        if (currentY > PAGE_BREAK_Y_THRESHOLD - 10) addNewPage(); // Ensure header fits
        currentY = addSectionHeader('Items y Materiales Utilizados', currentY);
        
        const drawItemsHeader = () => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(fieldLabelSize);
            doc.setTextColor(primaryTextColor);
            doc.text('CANT.', margin + 5, currentY, {align: 'center'});
            doc.text('DESCRIPCIÓN', margin + 25, currentY);
            currentY += 2;
            doc.setDrawColor(borderColor);
            doc.line(margin, currentY, contentWidth + margin, currentY);
            currentY += 4;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(fieldValueSize);
        };
        
        drawItemsHeader();

        report.itemsSnapshot.forEach(item => {
            const descriptionLines = doc.splitTextToSize(item.description, contentWidth - 25);
            const itemHeight = (descriptionLines.length * 5) + 3; // Calculate needed height

            if (currentY + itemHeight > PAGE_BREAK_Y_THRESHOLD) {
                addNewPage('Items y Materiales');
                drawItemsHeader();
            }

            doc.text(String(item.quantity), margin + 5, currentY, { align: 'center' });
            doc.text(descriptionLines, margin + 25, currentY);
            currentY += itemHeight;
        });
        currentY += 4;
    }

    // --- 5. Observations with PAGINATION ---
    if (currentY > PAGE_BREAK_Y_THRESHOLD - 10) addNewPage(); // Ensure header fits
    currentY = addSectionHeader('Observaciones', currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fieldValueSize);
    doc.setTextColor(primaryTextColor);
    const obsText = report.observations || 'Sin observaciones.';
    const obsLines = doc.splitTextToSize(obsText, contentWidth - 6);

    obsLines.forEach((line: string) => {
        const lineHeight = 5;
        if (currentY + lineHeight > PAGE_BREAK_Y_THRESHOLD) {
            addNewPage('Observaciones');
        }
        doc.text(line, margin + 3, currentY);
        currentY += lineHeight;
    });

    // --- 6. Signature (Positioned on the last page) ---
    if (currentY > PAGE_BREAK_Y_THRESHOLD) {
        addNewPage();
    }
    
    const signatureLineY = pageHeight - FOOTER_HEIGHT - 15;
    if (report.clientSignature) {
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
    }
    
    doc.setDrawColor(primaryTextColor);
    doc.line(margin + 30, signatureLineY, pageWidth - margin - 30, signatureLineY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fieldLabelSize);
    doc.setTextColor(secondaryTextColor);
    doc.text('FIRMA DEL CLIENTE', pageWidth / 2, signatureLineY + 5, { align: 'center' });

    // --- 7. Footer with Page Numbers ---
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        const footerY = pageHeight - FOOTER_HEIGHT;
        doc.setDrawColor(borderColor);
        doc.line(margin, footerY, pageWidth - margin, footerY);
        doc.setFontSize(8);
        doc.setTextColor(secondaryTextColor);
        doc.text("Macris Ingeniería S.A.S - Reporte generado por la aplicación de mantenimiento.", margin, footerY + 8);
        doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, footerY + 8, { align: 'right' });
    }

    // --- 8. Save PDF ---
    const clientName = report.equipmentSnapshot.category === 'residencial' 
        ? report.equipmentSnapshot.client_name
        : report.equipmentSnapshot.companyName;
    const filename = `Reporte_${clientName?.replace(/\s/g, '_') || 'General'}_${report.id.substring(0, 8)}.pdf`;
    
    const pdfBlob = doc.output('blob');
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
