import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Quote, Client } from '../types';
import { formatCurrency } from '../utils';
import { addServiceLocationClientBlock, addStandardFooter, getCompanyInfoBlock } from './common';

// --- Reusable Component Functions (Local to this template) ---

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


// --- Template 1: Classic ---
export function renderClassicPDF(doc: jsPDF, quote: Quote, client: Client | undefined, logoUrl: string) {
    const pageWidth = doc.internal.pageSize.width;
    const margin = 40;
    let y = margin;

    // Header
    const logoAspectRatio = 1823 / 1440;
    const logoHeight = 80;
    const logoWidth = logoHeight * logoAspectRatio;
    if (logoUrl) doc.addImage(logoUrl, 'PNG', margin, y, logoWidth, logoHeight);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(getCompanyInfoBlock(), margin + logoWidth + 20, y + 5, { lineHeightFactor: 1.2 });

    addHeaderQuoteInfo(doc, quote, client, pageWidth - margin, y + 15, 0);
    
    y += logoHeight + 20;
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 20;

    // Client Info
    y = addServiceLocationClientBlock(doc, quote, client, y, 0, 0);
    
    // Items Table
    const tableHeaders = [['Código', 'Descripción', 'Cant.', 'Vlr. Unitario', 'Vlr. Total']];
    const tableData = quote.items.map(item => [item.manualId || 'N/A', item.description, item.quantity.toString(), formatCurrency(item.price), formatCurrency(item.price * item.quantity)]);
    autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: y,
        theme: 'grid',
        headStyles: {
            fillColor: [22, 27, 34],
            textColor: 255,
            fontStyle: 'bold',
            halign: 'center'
        },
        styles: {
            cellPadding: 6,
            fontSize: 9
        },
        columnStyles: {
            0: { cellWidth: 55, halign: 'center' },
            1: { cellWidth: 220 },
            2: { halign: 'center' },
            3: { halign: 'right' },
            4: { halign: 'right' }
        }
    });

    let finalTableY = (doc as any).lastAutoTable.finalY;

    // Totals
    let totalsY = finalTableY + 20;
    const totalsX = 350;
    const subtotal = quote.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const taxAmount = subtotal * (quote.taxRate / 100);
    const total = subtotal + taxAmount;
    doc.setFontSize(10);
    doc.text('Subtotal:', totalsX, totalsY);
    doc.text(formatCurrency(subtotal), pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 18;
    doc.text(`IVA (${quote.taxRate}%):`, totalsX, totalsY);
    doc.text(formatCurrency(taxAmount), pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 18;
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', totalsX, totalsY);
    doc.text(formatCurrency(total), pageWidth - margin, totalsY, { align: 'right' });

    // Footer
    addStandardFooter(doc, quote, totalsY);
}
