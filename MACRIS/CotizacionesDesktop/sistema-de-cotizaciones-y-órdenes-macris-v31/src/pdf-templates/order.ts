import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Order, Client, Technician } from '../types';
import { formatCurrency } from '../utils';
import { getServiceLocationInfo } from './common';

export function renderOrderPDF(doc: jsPDF, order: Order, client: Client | undefined, technicians: Technician[], logoUrl: string) {
    const pageWidth = doc.internal.pageSize.width;
    const margin = 40;
    const accentColor = '#00A8C5';
    const textColor = '#21262D';
    const secondaryTextColor = '#6C757D';
    let y = margin;

    // --- Header ---
    const logoAspectRatio = 1823 / 1440;
    const logoHeight = 60;
    const logoWidth = logoHeight * logoAspectRatio;
    if (logoUrl) {
        doc.addImage(logoUrl, 'PNG', margin, y - 10, logoWidth, logoHeight);
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(textColor);
    doc.text('ORDEN DE SERVICIO', pageWidth - margin, y + 10, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(secondaryTextColor);
    doc.text(`No. ${order.manualId}`, pageWidth - margin, y + 28, { align: 'right' });

    y += logoHeight + 20;

    // --- Details Grid ---
    const statusText = { pending: 'Pendiente', scheduled: 'Programada', in_progress: 'En Progreso', completed: 'Completada', cancelled: 'Cancelada' };
    
    // FIX: Use a timezone-safe method to parse the date string.
    const serviceDate = new Date(order.service_date.replace(/-/g, '/')).toLocaleDateString('es-CO');
    const serviceLocation = getServiceLocationInfo(order, client);
    
    autoTable(doc, {
        startY: y,
        theme: 'plain',
        body: [
            [
                { content: 'CLIENTE', styles: { fontStyle: 'bold' } },
                { content: client?.name || 'N/A', styles: {} },
                { content: 'FECHA SERVICIO', styles: { fontStyle: 'bold' } },
                { content: `${serviceDate} ${order.service_time || ''}`, styles: {} },
            ],
            [
                { content: 'SEDE', styles: { fontStyle: 'bold' } },
                { content: serviceLocation.sedeName || 'N/A', styles: {} },
                { content: 'TIPO DE ORDEN', styles: { fontStyle: 'bold' } },
                { content: order.order_type, styles: {} },
            ],
            [
                { content: 'DIRECCIÓN', styles: { fontStyle: 'bold' } },
                { content: serviceLocation.address, styles: {} },
                { content: 'ESTADO', styles: { fontStyle: 'bold' } },
                { content: statusText[order.status], styles: { textColor: accentColor, fontStyle: 'bold' } },
            ],
             [
                { content: 'CIUDAD', styles: { fontStyle: 'bold' } },
                { content: serviceLocation.city, styles: {} },
                { content: 'CONTACTO', styles: { fontStyle: 'bold' } },
                { content: serviceLocation.contactPerson, styles: {} },
            ],
            [
                { content: 'TELÉFONO', styles: { fontStyle: 'bold' } },
                { content: serviceLocation.phone, styles: {} },
                { content: '', styles: {} },
                { content: '', styles: {} },
            ],
        ],
        styles: {
            fontSize: 9,
            cellPadding: { top: 3, right: 5, bottom: 3, left: 5 },
        },
        columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 80 },
            3: { cellWidth: 'auto' },
        }
    });
    y = (doc as any).lastAutoTable.finalY + 10;
    
    // --- Technicians ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TÉCNICOS ASIGNADOS:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const techNames = technicians.map(t => t.name).join(', ') || 'Sin asignar';
    doc.text(techNames, margin + 125, y);
    y += 25;

    // --- Items Table ---
    const tableHeaders = [['DESCRIPCIÓN', 'CANT.']];
    const tableData = order.items.map(item => [item.description, item.quantity.toString()]);
    
    autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: y,
        theme: 'grid',
        headStyles: {
            fillColor: textColor,
            textColor: '#FFFFFF',
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center'
        },
        styles: {
            fontSize: 9,
            cellPadding: 6,
        },
        columnStyles: {
            0: { halign: 'left' },
            1: { cellWidth: 60, halign: 'center' },
        }
    });
    y = (doc as any).lastAutoTable.finalY;

    // --- Notes ---
    if (order.notes) {
        y += 20;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('NOTAS INTERNAS:', margin, y);
        y += 15;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const notesLines = doc.splitTextToSize(order.notes, pageWidth - margin * 2);
        doc.text(notesLines, margin, y);
        y += notesLines.length * 10 + 10;
    }

    // --- Signature Footer ---
    const pageHeight = doc.internal.pageSize.height;
    const signatureY = pageHeight - 80;
    doc.setDrawColor(secondaryTextColor);
    doc.line(margin, signatureY, (pageWidth / 2) - 10, signatureY);
    doc.text('FIRMA DEL TÉCNICO', margin, signatureY + 12);

    doc.line((pageWidth / 2) + 10, signatureY, pageWidth - margin, signatureY);
    doc.text('FIRMA Y SELLO DEL CLIENTE', (pageWidth / 2) + 10, signatureY + 12);
    doc.setFontSize(8);
    doc.setTextColor(secondaryTextColor);
    doc.text('El cliente declara recibir el servicio a satisfacción.', (pageWidth / 2) + 10, signatureY + 22);

}
