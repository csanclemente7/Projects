


import { jsPDF } from 'jspdf';
import type { Report, City, Company, Dependency, Order } from '../types';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { MACRIS_LOGO_URL } from '../assets';

/**
 * Fetches a local image and converts it to a Base64 Data URL.
 * @param url The path to the local image (e.g., 'MacrisLogo.png').
 * @returns A promise that resolves with the data URL.
 */
async function getLocalImageAsDataUrl(url: string, format = 'image/jpeg'): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Allow cross-origin if needed
        img.crossOrigin = 'Anonymous';
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                return reject(new Error('No 2d context available'));
            }
            
            // Fill background solid white to avoid transparent PNG rendering issues in jsPDF
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            
            try {
                resolve(canvas.toDataURL(format, 0.9));
            } catch (err) {
                reject(err);
            }
        };
        
        img.onerror = (err) => {
            console.error(`Failed to load image from ${url}:`, err);
            resolve(''); // Return empty fallback on error
        };
        
        // Bust browser cache to ensure load
        img.src = url + '?t=' + new Date().getTime();
    });
}

export async function generateReportPDF(
    report: Report,
    cities: City[],
    companies: Company[],
    dependencies: Dependency[],
    formatDate: (dateInput?: Date | string, includeTime?: boolean) => string,
    allOrders: Order[],
    outputType: 'open' | 'blob' | 'doc' = 'open',
    existingDoc?: any
): Promise<Blob | string | any> { 
    const doc = existingDoc || new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    if (existingDoc) {
        doc.addPage();
    }

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
        const logoDataUrl = await getLocalImageAsDataUrl(MACRIS_LOGO_URL, 'image/png');
        if (logoDataUrl) {
            const aspectRatio = 1823 / 1440;
            const logoHeight = 25;
            const logoWidth = logoHeight * aspectRatio;
            doc.addImage(logoDataUrl, 'PNG', margin, currentY, logoWidth, logoHeight);
        }
    } catch (e) {
        console.error("Could not load logo for PDF", e);
    }
    
    let idValue = report.id;
    if (report.orderId) {
        const linkedOrder = allOrders.find(o => o.id === report.orderId);
        if (linkedOrder && linkedOrder.manualId) {
            idValue = linkedOrder.manualId;
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(mainTitleSize);
    doc.setTextColor(headerColor);
    doc.text('REPORTE DE SERVICIO TÉCNICO', pageWidth - margin, currentY + 8, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(subTitleSize);
    doc.setTextColor(secondaryTextColor);
    doc.text(`ID Reporte: ${idValue}`, pageWidth - margin, currentY + 14, { align: 'right' });
    
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
        col1Y += addField('Sede:', report.equipmentSnapshot.sedeName, col1X, col1Y, colWidth);
        col1Y += addField('Dependencia:', report.equipmentSnapshot.dependencyName, col1X, col1Y, colWidth);
        if (report.equipmentSnapshot.address) {
            col1Y += addField('Dirección Sede:', report.equipmentSnapshot.address, col1X, col1Y, colWidth);
        }
        const contactInfo = `${report.equipmentSnapshot.contact_person || ''} ${report.equipmentSnapshot.phone ? '(' + report.equipmentSnapshot.phone + ')' : ''}`.trim();
        if (contactInfo) {
            col1Y += addField('Contacto Sede:', contactInfo, col1X, col1Y, colWidth);
        }
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

    // --- NEW: Installation Photos ---
    if (report.serviceType === 'Montaje/Instalación' && (report.photo_internal_unit_url || report.photo_external_unit_url)) {
        const estimatedPhotoHeight = 80;
        if (currentY + estimatedPhotoHeight > PAGE_BREAK_Y_THRESHOLD) {
            addNewPage();
        }
        
        currentY = addSectionHeader('Fotografías de la Instalación', currentY);
        
        const photoBlockY = currentY;
        const photoMaxWidth = (contentWidth / 2) - 5;
        const col1X = margin + 3;
        const col2X = pageWidth / 2 + 5;
        let maxRowHeight = 0;

        const addPhotoToDoc = (label: string, dataUrl: string, x: number, y: number): number => {
            let height = 0;
            try {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(fieldLabelSize);
                doc.setTextColor(secondaryTextColor);
                doc.text(label.toUpperCase(), x, y);

                const imgProps = doc.getImageProperties(dataUrl);
                const aspectRatio = imgProps.width / imgProps.height;
                height = photoMaxWidth / aspectRatio;

                if (height > 70) { // Limit max height to prevent oversized images
                    height = 70;
                }
                
                doc.addImage(dataUrl, 'JPEG', x, y + 4, photoMaxWidth, height);
                return height + 4; // Total height occupied by label + image
            } catch (e: any) {
                console.error(`Error adding photo "${label}" to PDF:`, e);
                doc.text('[Error al cargar imagen]', x, y + 10);
                return 15;
            }
        };

        if (report.photo_internal_unit_url) {
            const h = addPhotoToDoc('Unidad Interna', report.photo_internal_unit_url, col1X, photoBlockY);
            maxRowHeight = Math.max(maxRowHeight, h);
        }

        if (report.photo_external_unit_url) {
            const h = addPhotoToDoc('Unidad Externa', report.photo_external_unit_url, col2X, photoBlockY);
            maxRowHeight = Math.max(maxRowHeight, h);
        }
        
        if (maxRowHeight > 0) {
            currentY += maxRowHeight + 6;
        }
    }


    // --- 6. Signature (Positioned on the last page) ---
    if (currentY > PAGE_BREAK_Y_THRESHOLD) {
        addNewPage();
    }
    
    const signatureLineY = pageHeight - FOOTER_HEIGHT - 15;
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
        doc.setTextColor('#d9534f'); // A reddish color for attention
        doc.text('FIRMA PENDIENTE', pageWidth / 2, signatureLineY - 10, { align: 'center' });
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

// --- 8. Save/Return PDF ---

const clientName =
  report.equipmentSnapshot.category === 'residencial'
    ? report.equipmentSnapshot.client_name
    : report.equipmentSnapshot.companyName;

const filenameId =
  report.orderId && idValue !== report.id
    ? idValue
    : report.id.substring(0, 8);
const filename = `Reporte_${clientName?.replace(/\s/g, '_') || 'General'}_${filenameId}.pdf`;

// Si se solicita un 'blob' (para descargas ZIP), se devuelve eso.
if (outputType === 'blob') {
  const pdfBlob = doc.output('blob');
  return pdfBlob;
}

// Si se solicita el documento vivo (para PDFs compuestos/merge), retornamos la instancia.
if (outputType === 'doc') {
  return doc;
}

// Para el comportamiento 'open'
if (!Capacitor.isNativePlatform()) {
    const pdfBlob = doc.output('blob');
    return URL.createObjectURL(pdfBlob);
}

try {
  // Obtenemos el contenido en Base64 (sin encabezado "data:")
  const pdfBase64 = doc.output('datauristring').split(',')[1];

  // Escribimos el archivo en el directorio temporal (Cache)
  await Filesystem.writeFile({
    path: filename,
    data: pdfBase64,
    directory: Directory.Cache,
  });

  // Obtenemos la URI local del archivo recién guardado
  const fileUri = await Filesystem.getUri({
    directory: Directory.Cache,
    path: filename,
  });

  return fileUri.uri; // Devuelto para que ui.ts lo abra con FileOpener
} catch (error) {
  console.error('Error al guardar el PDF:', error);
  throw error;
}
}

