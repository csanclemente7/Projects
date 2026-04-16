import { jsPDF } from 'jspdf';
import type { Client, Quote, Sede } from '../types';
import * as State from '../state';

const LOGO_CACHE_PREFIX = 'macris_logo_cache_';

export function getCompanyInfoBlock(): string {
    const lines = [
        State.getCompanyAddress1(),
        State.getCompanyAddress2(),
        State.getCompanyWebsite(),
        State.getCompanyPhone(),
        State.getCompanyEmail()
    ];
    return lines.filter(line => line).join('\n');
}

export type ServiceLocationInfo = {
    clientName: string;
    sedeName: string | null;
    address: string;
    city: string;
    phone: string;
    email: string;
    contactPerson: string;
    sede: Sede | undefined;
};

export function getServiceLocationInfo(record: { sede_id?: string | null }, client: Client | undefined): ServiceLocationInfo {
    const sede = record.sede_id ? State.getSedes().find(s => s.id === record.sede_id) : undefined;

    return {
        clientName: client?.name || 'N/A',
        sedeName: sede?.name || null,
        address: sede?.address || client?.address || 'N/A',
        city: sede?.cityName || client?.city || 'N/A',
        phone: sede?.phone || client?.phone || 'N/A',
        email: client?.email || 'N/A',
        contactPerson: sede?.contact_person || client?.contactPerson || 'N/A',
        sede,
    };
}

export function addServiceLocationClientBlock(doc: jsPDF, record: { sede_id?: string | null }, client: Client | undefined, startY: number, titleColor: any = 0, textColor: any = 0): number {
    let y = startY;
    const info = getServiceLocationInfo(record, client);

    if (client) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(titleColor);
        doc.text('CLIENTE:', 40, y);
        y += 15;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textColor);
        doc.text(info.clientName, 40, y);
        y += 15;
        if (info.sedeName) { doc.text(`Sede: ${info.sedeName}`, 40, y); y += 15; }
        if (info.address !== 'N/A') { doc.text(`Direccion: ${info.address}`, 40, y); y += 15; }
        if (info.city !== 'N/A') { doc.text(`Ciudad: ${info.city}`, 40, y); y += 15; }
        if (info.phone !== 'N/A') { doc.text(`Telefono: ${info.phone}`, 40, y); y += 15; }
        if (info.email !== 'N/A') { doc.text(`Email: ${info.email}`, 40, y); y += 15; }
        if (info.contactPerson !== 'N/A') { doc.text(`Contacto: ${info.contactPerson}`, 40, y); y += 15; }
        y += 5;
    }

    return y;
}


export async function getLogoAsDataUrl(url: string): Promise<string> {
    const cacheKey = LOGO_CACHE_PREFIX + url;
    
    try {
        const cachedLogo = localStorage.getItem(cacheKey);
        if (cachedLogo) {
            return cachedLogo;
        }
    } catch (e) {
        console.warn('Could not access localStorage to get cached logo.', e);
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch logo: ${response.status} ${response.statusText}`);
        }
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    resolve(reader.result as string);
                } else {
                    reject(new Error('FileReader returned an empty result.'));
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(blob);
        });
        
        try {
            localStorage.setItem(cacheKey, dataUrl);
        } catch (e) {
            console.warn('Could not cache logo in localStorage. It might be full.', e);
        }
        
        return dataUrl;

    } catch (error) {
        console.error(`Error fetching logo for PDF from url "${url}":`, error);
        return '';
    }
}

export function addStandardFooter(doc: jsPDF, quote: Quote, startY: number, textColor: any = 0, secondaryTextColor: any = 100) {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 40;
    let y = startY + 40; // Add space after totals

    const termsColumnWidth = (pageWidth / 2) - margin - 10;
    const footerText = State.getPdfFooterText();
    
    // --- Calculate required height for footer content ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    const termsLines = doc.splitTextToSize(quote.terms || '', termsColumnWidth);
    const termsHeight = (termsLines.length * 8 * 1.2) + 15; // Title + text

    const footerLinesForHeightCalc = doc.splitTextToSize(footerText, pageWidth - (margin * 2));
    const footerHeight = (footerLinesForHeightCalc.length * 8 * 1.2) + 20; // Some padding

    const requiredHeight = termsHeight + footerHeight;

    // --- Check if a new page is needed for the footer ---
    if (y + requiredHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
    }

    // --- Draw Left-aligned Block: Terms & Conditions ---
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textColor);
    doc.text('TÉRMINOS Y CONDICIONES', margin, y);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(secondaryTextColor);
    doc.text(termsLines, margin, y + 14, { lineHeightFactor: 1.2 });

    const yAfterTerms = y + termsHeight;

    // --- Draw Centered Footer Block ---
    const footerY = yAfterTerms + 20 > pageHeight - margin - footerHeight ? pageHeight - margin - footerHeight : yAfterTerms + 20;
    
    doc.setFontSize(8);
    doc.setTextColor(secondaryTextColor);
    
    let currentY = footerY;
    const thankYouText = "Gracias por hacer negocios con nosotros!";
    const footerParts = footerText.split('\n');
    const lineHeight = 8 * 1.2;

    footerParts.forEach(part => {
        // A blank line in the text area is an empty string in the array.
        // We use it to add vertical space.
        if (part.trim() === '') {
            currentY += lineHeight / 2; // Add a bit of space for blank lines
            return;
        }

        const lines = doc.splitTextToSize(part, pageWidth - (margin * 2));
        
        // Check for the specific phrase to make bold
        if (part.includes(thankYouText)) {
            doc.setFont('helvetica', 'bold');
        } else {
            doc.setFont('helvetica', 'normal');
        }

        doc.text(lines, pageWidth / 2, currentY, { align: 'center' });
        currentY += lines.length * lineHeight;
    });
}
