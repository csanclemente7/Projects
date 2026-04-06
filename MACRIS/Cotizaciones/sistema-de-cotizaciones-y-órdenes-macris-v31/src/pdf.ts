

import { jsPDF } from 'jspdf';
import type { Quote, Client, PdfTemplate, Order, Technician } from './types';
import * as State from './state';
// Importa los logos como módulos (Vite los resolverá correctamente)
import MacrisLogo from '../MacrisLogo.png';
import MacrisLogoBlanco from '../MacrisLogoBlanco.png';
import { renderClassicPDF } from './pdf-templates/classic';
import { renderModernPDF } from './pdf-templates/modern';
import { renderSleekPDF } from './pdf-templates/sleek';
import { renderVividPDF } from './pdf-templates/vivid';
import { renderOrderPDF } from './pdf-templates/order';
import { isMobileDevice, formatCurrency } from './utils';
import autoTable from 'jspdf-autotable';

// Dummy Data for Previews
const dummyClient: Client = {
    id: 'dummy-client-id',
    created_at: new Date().toISOString(),
    manualId: 'C-000',
    name: 'Cliente de Muestra S.A.S.',
    address: 'Avenida Siempre Viva 123',
    city: 'Springfield',
    phone: '300-123-4567',
    email: 'contacto@cliente.com',
    contactPerson: 'Juan Muestra'
};
const dummyQuote: Quote = {
    id: 'dummy-quote-id',
    created_at: new Date().toISOString(),
    manualId: 'P-999',
    date: new Date().toISOString(),
    clientId: 'dummy-client-id',
    taxRate: 19,
    terms: 'Estos son términos y condiciones de ejemplo para la vista previa del PDF. Validez de la oferta: 5 días.',
    items: [
        {
            id: 'd-item-1',
            created_at: new Date().toISOString(),
            quoteId: 'dummy-quote-id',
            itemId: 'item-1',
            manualId: 'IT-01',
            description: 'Producto de Muestra A (Descripción detallada)',
            quantity: 2,
            price: 150000,
        },
        {
            id: 'd-item-2',
            created_at: new Date().toISOString(),
            quoteId: 'dummy-quote-id',
            itemId: 'item-2',
            manualId: 'IT-02',
            description: 'Servicio de Muestra B',
            quantity: 1,
            price: 350000,
        },
        {
            id: 'd-item-3',
            created_at: new Date().toISOString(),
            quoteId: 'dummy-quote-id',
            itemId: 'item-3',
            manualId: 'IT-03',
            description: 'Otro Ítem de Ejemplo con un nombre más largo para probar el ajuste de texto en las celdas del PDF',
            quantity: 5,
            price: 25000,
        }
    ]
};

async function getLogoAsDataUrl(importedLogoUrl: string): Promise<string> {
    const response = await fetch(importedLogoUrl);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export function previewPdfInModal(doc: jsPDF) {
    const pdfOutput = isMobileDevice() ? doc.output('datauristring') : doc.output('bloburl');
    const iframe = document.getElementById('pdf-iframe') as HTMLIFrameElement;
    iframe.src = pdfOutput.toString();
    const modal = document.getElementById('pdf-preview-modal');
    if (modal) modal.classList.add('active');
}

// PDF Generation Dispatcher
export async function generateQuotePDFDoc(quote: Quote): Promise<jsPDF> {
    const template = State.getActivePdfTemplate();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const clients = State.getClients();
    const client = clients.find(c => c.id === quote.clientId);

    await dispatchPdfGeneration(doc, quote, client, template);
    await appendImagesToPdf(doc, quote);

    return doc;
}

export async function generateBillPDFDoc(quote: Quote): Promise<jsPDF> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const client = State.getClients().find(c => c.id === quote.clientId);
    const clientName = client ? client.name.toUpperCase() : 'CLIENTE';

    doc.setProperties({
        title: `Cuenta de Cobro No. ${quote.manualId} ${clientName}.pdf`
    });
    State.setCurrentPdfFileName(`Cuenta de Cobro No. ${quote.manualId} ${clientName}.pdf`);

    const margin = 40;
    const pageWidth = doc.internal.pageSize.width;
    let y = 80;

    // FECHA
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const options = { year: 'numeric', month: 'long', day: 'numeric' } as const;
    const dateStr = new Date(quote.date).toLocaleDateString('es-CO', options);
    doc.text(`Guadalajara de Buga, ${dateStr}`, pageWidth / 2, y, { align: 'center' });
    
    y += 40;
    
    // CUENTA DE COBRO
    doc.setFontSize(11);
    doc.text(`CUENTA DE COBRO No.          ${quote.manualId}`, pageWidth / 2, y, { align: 'center' });

    y += 30;
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', pageWidth / 2, y, { align: 'center' });

    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.text(clientName, pageWidth / 2, y, { align: 'center' });

    y += 30;
    doc.setFont('helvetica', 'bold');
    doc.text('DEBE A', pageWidth / 2, y, { align: 'center' });

    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.text('JAIR SANCLEMENTE AGUDELO', pageWidth / 2, y, { align: 'center' });
    y += 15;
    doc.text('C.C. 14.889.299', pageWidth / 2, y, { align: 'center' });

    y += 40;

    // TABLE
    const tableHeaders = [['DESCRIPCION', 'CANT', 'V/R UNITARIO', 'V/R TOTAL']];
    let total = 0;
    const tableData = quote.items.map(item => {
        const lineTotal = item.price * item.quantity;
        total += lineTotal;
        return [
            item.description.toUpperCase(),
            item.quantity.toString(),
            formatCurrency(item.price),
            formatCurrency(lineTotal)
        ];
    });

    // Add empty rows to push the table down a bit if it's too short (like in screenshot)
    for (let i = 0; i < 5; i++) {
        tableData.push(['', '', '$ -', '$ -']);
    }

    // Add total row at the end
    tableData.push(['', '', '', formatCurrency(total)]);

    autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: y,
        theme: 'grid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: 0,
            fontStyle: 'bold',
            halign: 'center',
            lineWidth: 1,
            lineColor: 0
        },
        bodyStyles: {
            textColor: 0,
            lineWidth: 1,
            lineColor: 0
        },
        styles: {
            cellPadding: 8,
            fontSize: 10
        },
        columnStyles: {
            0: { cellWidth: 200 },
            1: { halign: 'center', cellWidth: 50 },
            2: { halign: 'center' },
            3: { halign: 'center' }
        },
        didParseCell: function (data) {
            // Make the last row bold for totals
            if (data.section === 'body' && data.row.index === tableData.length - 1) {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    let finalTableY = (doc as any).lastAutoTable.finalY + 80;

    // Signature
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    finalTableY += 15;
    doc.text('JAIR SANCLEMENTE', margin + 150, finalTableY, { align: 'center' });
    finalTableY += 15;
    doc.text('C.C. 14.889.299', margin + 150, finalTableY, { align: 'center' });

    return doc;
}

export async function generateOrderPDFDoc(order: Order): Promise<jsPDF> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const client = State.getClients().find(c => c.id === order.clientId);
    const technicians = State.getTechnicians().filter(t => order.technicianIds.includes(t.id));

    const clientName = client ? client.name.toUpperCase() : 'CLIENTE';
    const fileName = `Orden de Servicio No. ${order.manualId} ${clientName}.pdf`;
    doc.setProperties({
        title: fileName
    });
    State.setCurrentPdfFileName(fileName);

    const logoUrl = await getLogoAsDataUrl(MacrisLogo); // Use standard logo for orders

    renderOrderPDF(doc, order, client, technicians, logoUrl);

    return doc;
}


export async function generatePreviewPDF(template: PdfTemplate) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    await dispatchPdfGeneration(doc, dummyQuote, dummyClient, template);
    await appendImagesToPdf(doc, dummyQuote);

    State.setCurrentPdfDocForDownload(doc);
    previewPdfInModal(doc);
}

async function appendImagesToPdf(doc: jsPDF, quote: Quote) {
    if (!quote.image_urls || quote.image_urls.length === 0) return;
    doc.addPage();
    doc.setFontSize(16);
    doc.setTextColor(33, 37, 41);
    doc.text('Anexos Técnicos / Fotográficos', 40, 50);
    let startY = 80;
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const availableWidth = pageWidth - margin * 2;
    
    // Lazy load the getQuoteImageUrl to avoid circular dep, or just reconstruct the URL
    // since we use a predictable url pattern in Supabase.
    // Better yet, just use supabaseQuotes from api:
    const { supabaseQuotes } = await import('./supabase');
    
    for (const path of quote.image_urls) {
        try {
            const publicUrl = supabaseQuotes.storage.from("quote-images").getPublicUrl(path).data.publicUrl;
            const dataUrl = await getLogoAsDataUrl(publicUrl);
            const imgProps = doc.getImageProperties(dataUrl);
            const imgRatio = imgProps.height / imgProps.width;
            const renderWidth = Math.min(availableWidth, 400);
            const renderHeight = renderWidth * imgRatio;
            
            if (startY + renderHeight > doc.internal.pageSize.getHeight() - margin) {
                doc.addPage();
                startY = 40;
            }
            
            const xPos = margin + (availableWidth - renderWidth) / 2;
            doc.addImage(dataUrl, 'JPEG', xPos, startY, renderWidth, renderHeight);
            startY += renderHeight + 20;
        } catch (err) {
            console.error("Failed to load image for PDF:", err);
        }
    }
}

async function dispatchPdfGeneration(
    doc: jsPDF,
    quote: Quote,
    client: Client | undefined,
    template: PdfTemplate
) {
    const clientName = client ? client.name.toUpperCase() : 'CLIENTE';
    const fileName = `Cotizacion No. ${quote.manualId} ${clientName}.pdf`;
    doc.setProperties({
        title: fileName
    });
    State.setCurrentPdfFileName(fileName);

    const logoToUse = (template === 'sleek') ? MacrisLogoBlanco : MacrisLogo;
    const logoUrl = await getLogoAsDataUrl(logoToUse);

    switch (template) {
        case 'classic':
            renderModernPDF(doc, quote, client, logoUrl);
            break;
        case 'modern':
            renderModernPDF(doc, quote, client, logoUrl);
            break;
        case 'sleek':
            renderSleekPDF(doc, quote, client, logoUrl);
            break;
        case 'vivid':
            renderVividPDF(doc, quote, client, logoUrl);
            break;
        default:
            renderModernPDF(doc, quote, client, logoUrl);
            break;
    }
}
