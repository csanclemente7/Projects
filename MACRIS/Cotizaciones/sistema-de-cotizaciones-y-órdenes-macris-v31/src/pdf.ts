

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
import { isMobileDevice } from './utils';

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

    State.setCurrentPdfDocForDownload(doc);
    previewPdfInModal(doc);
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
            renderClassicPDF(doc, quote, client, logoUrl);
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
            renderClassicPDF(doc, quote, client, logoUrl);
            break;
    }
}