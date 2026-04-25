import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quote, Client } from '../types';
import { formatCurrency } from '../utils';
import * as State from '../state';
import { getServiceLocationInfo } from './common';

export function renderModernPDF(doc: jsPDF, quote: Quote, client: Client | undefined, logoUrl: string) {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 40;
    
    // Theme Colors based on MACRIS
    const primaryDark = '#0f172a'; // Deep slate blue
    const accentCyan = '#00A8C5'; // Macris logo cyan/teal
    const textColor = '#334155';
    const lightText = '#64748b';
    const borderDark = '#cbd5e1';
    const tableBg = '#f8fafc';

    let y = 0;

    // --- Background Shapes ---
    // Smooth Top Right Cyan Curve (Matches exact Soto y Ochoa geometry, smaller proportion)
    doc.setFillColor(accentCyan);
    doc.rect(pageWidth - 140, 0, 140, 60, 'F'); // Right side flat section (reduced Y)
    doc.ellipse(pageWidth - 140, 0, 130, 60, 'F'); // Swooping left curve (reduced Y)

    // Bottom Left Dark Curve (Anchored to the exact page corner for a sweeping arc)
    doc.setFillColor(primaryDark);
    doc.ellipse(0, pageHeight, 80, 300, 'F');

    // --- Logo ---
    const logoAspectRatio = 1823 / 1440;
    const logoHeight = 65;
    const logoWidth = logoHeight * logoAspectRatio;
    if (logoUrl) {
        doc.addImage(logoUrl, 'PNG', margin, margin, logoWidth, logoHeight);
    }
    
    // --- Header Dates (Right Side, under curve) ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(primaryDark);
    // Moved up since the cyan shape is now much shorter
    doc.text(`FECHA: ${new Date(quote.date).toLocaleDateString('es-CO')}`, pageWidth - margin, 90, { align: 'right' });
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`COTIZACIÓN #${quote.manualId}`, pageWidth - margin, 105, { align: 'right' });
    if (client) {
        doc.setFont('helvetica', 'normal');
        doc.text(`CLIENTE ID: ${client.manualId}`, pageWidth - margin, 120, { align: 'right' });
    }

    // --- Client Block (Directly below logo as requested) ---
    y = margin + logoHeight + 25;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accentCyan); 
    doc.text('DATOS DEL CLIENTE:', margin, y);

    y += 16;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(textColor);
    
    if (client) {
        const location = getServiceLocationInfo(quote, client);
        doc.text(client.name, margin, y);
        doc.setFontSize(9);
        y += 14;

        if (location.sedeName) { doc.text(`Sede: ${location.sedeName}`, margin, y); y += 14; }
        const fullAddr = [location.address !== 'N/A' ? location.address : null, location.city !== 'N/A' ? location.city : null].filter(Boolean).join(', ');
        if (fullAddr) { doc.text(fullAddr, margin, y); y += 14; }
        if (location.email !== 'N/A') { doc.text(location.email, margin, y); y += 14; }
        if (location.phone !== 'N/A') { doc.text(location.phone, margin, y); y += 14; }
        if (location.contactPerson !== 'N/A') { doc.text(`Contacto: ${location.contactPerson}`, margin, y); y += 14; }
    } else {
        doc.text('N/A', margin, y);
        y += 14;
    }

    y += 35; // Space before table

    // --- Items Table ---
    const tableHeaders = [['Código', 'Descripción', 'Cant.', 'Precio', 'Total']];
    const tableData = quote.items.map(item => [
        item.manualId || 'N/A', 
        item.description, 
        item.quantity.toString(), 
        formatCurrency(item.price), 
        formatCurrency(item.price * item.quantity)
    ]);
    
    autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'grid', 
        headStyles: {
            fillColor: primaryDark,
            textColor: '#ffffff',
            fontStyle: 'bold',
            fontSize: 10,
            halign: 'center',
            lineColor: primaryDark,
            lineWidth: 1
        },
        styles: {
            fontSize: 9,
            cellPadding: { top: 9, right: 8, bottom: 9, left: 8 },
            textColor: textColor,
            fillColor: tableBg,
            lineColor: borderDark,
            lineWidth: 0.1 
        },
        alternateRowStyles: {
            fillColor: '#ffffff'
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 50 },
            1: { halign: 'left' }, 
            2: { halign: 'center', cellWidth: 55 },
            3: { halign: 'center', cellWidth: 80 },
            4: { halign: 'center', cellWidth: 90 },
        }
    });

    let finalTableY = (doc as any).lastAutoTable.finalY + 20;

    // --- Two Column Layout below Table ---
    if (finalTableY > pageHeight - 160) {
        doc.addPage();
        finalTableY = 40;
    }

    // Left Column: Note / Terms
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accentCyan);
    doc.text('NOTA:', margin, finalTableY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(lightText);
    const notesWidth = (pageWidth / 2) - margin;
    let termsSplit = doc.splitTextToSize(quote.terms || '', notesWidth);
    doc.text(termsSplit, margin, finalTableY + 12, { lineHeightFactor: 1.2 });

    // Right Column: Totals
    const subtotal = quote.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const taxAmount = subtotal * (quote.taxRate / 100);
    const total = subtotal + taxAmount;
    
    let totalsLeftPos = pageWidth - margin - 150;
    let currentTotalY = finalTableY - 10;

    doc.setDrawColor(borderDark);
    doc.setLineWidth(0.5);

    if (taxAmount > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(lightText);
        doc.rect(totalsLeftPos, currentTotalY, 60, 20);
        doc.rect(totalsLeftPos + 60, currentTotalY, 90, 20);
        doc.text('Subtotal', totalsLeftPos + 30, currentTotalY + 13, { align: 'center' });
        doc.setTextColor(textColor);
        doc.text(formatCurrency(subtotal), totalsLeftPos + 105, currentTotalY + 13, { align: 'center' });
        currentTotalY += 20;

        doc.setTextColor(lightText);
        doc.rect(totalsLeftPos, currentTotalY, 60, 20);
        doc.rect(totalsLeftPos + 60, currentTotalY, 90, 20);
        doc.text('IVA', totalsLeftPos + 30, currentTotalY + 13, { align: 'center' });
        doc.setTextColor(textColor);
        doc.text(formatCurrency(taxAmount), totalsLeftPos + 105, currentTotalY + 13, { align: 'center' });
        currentTotalY += 20;
    }

    // Total Row
    doc.rect(totalsLeftPos, currentTotalY, 60, 25);
    doc.rect(totalsLeftPos + 60, currentTotalY, 90, 25);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText);
    doc.text('Total', totalsLeftPos + 30, currentTotalY + 16, { align: 'center' });
    
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryDark);
    doc.text(formatCurrency(total), totalsLeftPos + 105, currentTotalY + 16, { align: 'center' });

    // --- Footer & Labels (Bottom Left area) ---
    let footerY = pageHeight - 110;
    doc.setFontSize(8);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accentCyan);
    doc.text('DIRECCIÓN', margin + 45, footerY); // Pushed right completely out of the dark oval
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText);
    const addressLines = doc.splitTextToSize(State.getCompanyAddress1() + ' ' + State.getCompanyAddress2(), 150);
    doc.text(addressLines, margin + 45, footerY + 12);
    footerY += 30;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accentCyan);
    doc.text('TELÉFONO', margin + 45, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText);
    doc.text(State.getCompanyPhone() || 'N/A', margin + 45, footerY + 12);
    footerY += 25;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(accentCyan);
    doc.text('PÁGINA WEB', margin + 45, footerY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(lightText);
    doc.text(State.getCompanyWebsite() || 'N/A', margin + 45, footerY + 12);

    // Bottom centering message
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryDark);
    doc.text('¡Gracias por hacer negocios con nosotros!', pageWidth / 2, pageHeight - 20, { align: 'center' });
}
