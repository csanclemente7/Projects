import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quote, Client } from '../types';
import { formatCurrency } from '../utils';
import * as State from '../state';
import { getCompanyInfoBlock } from './common';

export function renderModernPDF(doc: jsPDF, quote: Quote, client: Client | undefined, logoUrl: string) {
    const pageWidth = doc.internal.pageSize.width;
    const margin = 40;
    const accentColor = '#00A8C5'; // Corporate Teal
    const headerBgColor = '#F8F9FA';
    const borderColor = '#DEE2E6';
    const textColor = '#21262D';
    const secondaryTextColor = '#6C757D';

    let y = 0;

    // --- Header ---
    doc.setFillColor(headerBgColor);
    doc.rect(0, 0, pageWidth, 110, 'F');
    y = 35;

    // Logo
    const logoAspectRatio = 1823 / 1440;
    const logoHeight = 70;
    const logoWidth = logoHeight * logoAspectRatio;
    if (logoUrl) {
        doc.addImage(logoUrl, 'PNG', margin, y - 15, logoWidth, logoHeight);
    }
    
    // Company Info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(secondaryTextColor);
    doc.text(
        getCompanyInfoBlock(),
        margin + logoWidth + 20,
        y,
        { lineHeightFactor: 1.3 }
    );

    // Quote Info (Right Aligned)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(textColor);
    doc.text(`COTIZACIÓN #${quote.manualId}`, pageWidth - margin, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(secondaryTextColor);
    doc.text(`FECHA: ${new Date(quote.date).toLocaleDateString('es-CO')}`, pageWidth - margin, y + 23, { align: 'right' });
    if (client) {
        doc.text(`CLIENTE ID: ${client.manualId}`, pageWidth - margin, y + 38, { align: 'right' });
    }


    y = 130;

    // --- Client Info ---
    doc.setDrawColor(borderColor);
    doc.setLineWidth(1);
    doc.line(margin, y - 10, pageWidth - margin, y - 10);

    doc.setFontSize(9);
    doc.setTextColor(secondaryTextColor);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', margin, y + 5);
    y += 20;

    doc.setFontSize(10);
    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'normal');
    if (client) {
        doc.text(client.name, margin, y);
        y += 14;
        if (client.address) { doc.text(client.address, margin, y); y += 14; }
        if (client.phone) { doc.text(`Tel: ${client.phone}`, margin, y); y += 14; }
        if (client.contactPerson) { doc.text(`Attn: ${client.contactPerson}`, margin, y); y += 14; }
    } else {
        doc.text('N/A', margin, y);
        y += 14;
    }
    y += 10;


    // --- Items Table ---
    const tableHeaders = [['CÓDIGO', 'DESCRIPCIÓN', 'CANT.', 'VLR. UNITARIO', 'VLR. TOTAL']];
    const tableData = quote.items.map(item => [item.manualId || 'N/A', item.description, item.quantity.toString(), formatCurrency(item.price), formatCurrency(item.price * item.quantity)]);
    
    autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: y,
        theme: 'striped',
        headStyles: {
            fillColor: textColor,
            textColor: '#FFFFFF',
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center'
        },
        styles: {
            fontSize: 9,
            cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
            lineWidth: 0.5,
            lineColor: borderColor,
        },
        columnStyles: {
            0: { halign: 'center' },
            1: { cellWidth: 220, halign: 'left' },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right' },
        }
    });

    let finalTableY = (doc as any).lastAutoTable.finalY;
    y = finalTableY + 20;

    // --- Totals ---
    const subtotal = quote.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const taxAmount = subtotal * (quote.taxRate / 100);
    const total = subtotal + taxAmount;
    const totalsX = pageWidth - margin - 200;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(secondaryTextColor);
    doc.text('Subtotal', totalsX, y);
    doc.text(formatCurrency(subtotal), pageWidth - margin, y, { align: 'right' });
    y += 18;
    
    doc.text(`IVA (${quote.taxRate}%)`, totalsX, y);
    doc.text(formatCurrency(taxAmount), pageWidth - margin, y, { align: 'right' });
    y += 15;

    doc.setDrawColor(borderColor);
    doc.line(totalsX, y, pageWidth - margin, y);
    y += 8;

    doc.setFillColor(headerBgColor);
    doc.roundedRect(totalsX - 10, y, 200 + 10, 30, 3, 3, 'F');
    y += 20;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textColor);
    doc.setFontSize(12);
    doc.text('TOTAL', totalsX, y);
    doc.setTextColor(accentColor);
    doc.text(formatCurrency(total), pageWidth - margin, y, { align: 'right' });
    
    // --- Footer ---
    const pageHeight = doc.internal.pageSize.height;
    let footerY = y + 40; // Dynamic start position after totals

    // Estimate footer height
    doc.setFontSize(8);
    const termsLines = doc.splitTextToSize(quote.terms || '', pageWidth - margin * 2);
    const termsHeight = (termsLines.length * 8 * 1.2) + 15; // Title + text
    const contactFooterHeight = 40; // space for contact and thank you
    
    if (footerY + termsHeight + contactFooterHeight > pageHeight - margin) {
        doc.addPage();
        footerY = margin;
    }
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(textColor);
    doc.text('Términos y Condiciones', margin, footerY);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(secondaryTextColor);
    doc.text(termsLines, margin, footerY + 12, { lineHeightFactor: 1.2 });
    
    // Absolute bottom text
    const bottomTextY = pageHeight - margin;
    doc.setFontSize(8);
    doc.setTextColor(secondaryTextColor);
    const footerText = State.getPdfFooterText();
    const companyInfoLines = [State.getCompanyAddress1(), State.getCompanyAddress2()].filter(Boolean).join(' | ');

    doc.text(
        `${footerText}\n${companyInfoLines}`,
        pageWidth / 2,
        bottomTextY - 10,
        { align: 'center', lineHeightFactor: 1.2 }
    );
}