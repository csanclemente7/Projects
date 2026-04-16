import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quote, Client } from '../types';
import { formatCurrency } from '../utils';
import { addServiceLocationClientBlock, addStandardFooter, getCompanyInfoBlock } from './common';

function addHeaderQuoteInfo(doc: jsPDF, quote: Quote, client: Client | undefined, x: number, y: number, color: any = 0) {
    doc.setTextColor(color);
    let currentY = y;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`FECHA: ${new Date(quote.date).toLocaleDateString('es-CO')}`, x, currentY, { align: 'right' });
    currentY += 15;
    doc.setFont('helvetica', 'bold');
    doc.text(`COTIZACIÓN #${quote.manualId}`, x, currentY, { align: 'right' });
    currentY += 15;
    doc.setFont('helvetica', 'normal');
    if (client) doc.text(`CLIENTE ID: ${client.manualId}`, x, currentY, { align: 'right' });
}


// --- Template 3: Sleek ---
export function renderSleekPDF(doc: jsPDF, quote: Quote, client: Client | undefined, logoUrl: string) {
    const textColor = 240;
    const headingColor = '#00DFFF';
    const bgColor = '#161B22';
    const margin = 40;
    const pageWidth = doc.internal.pageSize.width;

    // Background
    doc.setFillColor(bgColor);
    doc.rect(0, 0, pageWidth, doc.internal.pageSize.height, 'F');
    
    let y = margin;
    doc.setTextColor(textColor);

    // Header
    const logoAspectRatio = 1823 / 1440;
    const logoHeight = 80;
    const logoWidth = logoHeight * logoAspectRatio;
    if (logoUrl) doc.addImage(logoUrl, 'PNG', margin, y, logoWidth, logoHeight);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(textColor);
    doc.text(getCompanyInfoBlock(), margin + logoWidth + 20, y + 10, { lineHeightFactor: 1.2 });

    addHeaderQuoteInfo(doc, quote, client, pageWidth - margin, y + 15, textColor);

    y += logoHeight + 20;
    doc.setDrawColor(40);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // Client Info
    y = addServiceLocationClientBlock(doc, quote, client, y, headingColor, textColor);
    y += 10;
    
    // Table
    const tableHeaders = [['Código', 'Descripción', 'Cant.', 'Vlr. Unitario', 'Vlr. Total']];
    const tableData = quote.items.map(item => [item.manualId || 'N/A', item.description, item.quantity.toString(), formatCurrency(item.price), formatCurrency(item.price * item.quantity)]);
    autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: y,
        theme: 'grid',
        headStyles: {
            fillColor: '#0D1117',
            textColor: headingColor,
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: {
            cellPadding: 6,
            fontSize: 9,
            textColor: textColor,
            fillColor: bgColor,
            lineColor: 40,
            lineWidth: 0.5
        },
        alternateRowStyles: {
            fillColor: '#21262D'
        },
        columnStyles: {
            0: { cellWidth: 55, halign: 'center' },
            1: { cellWidth: 220 },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right' }
        }
    });

    // Totals & Footer
    const finalTableY = (doc as any).lastAutoTable.finalY;
    const subtotal = quote.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const taxAmount = subtotal * (quote.taxRate / 100);
    const total = subtotal + taxAmount;
    let totalsY = finalTableY + 20;
    const totalsX = 350;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textColor);
    doc.text('Subtotal', totalsX, totalsY);
    doc.text(formatCurrency(subtotal), pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 18;
    doc.text(`IVA (${quote.taxRate}%)`, totalsX, totalsY);
    doc.text(formatCurrency(taxAmount), pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(headingColor);
    doc.text('Total', totalsX, totalsY);
    doc.text(formatCurrency(total), pageWidth - margin, totalsY, { align: 'right' });

    addStandardFooter(doc, quote, totalsY, textColor, 180);
}
