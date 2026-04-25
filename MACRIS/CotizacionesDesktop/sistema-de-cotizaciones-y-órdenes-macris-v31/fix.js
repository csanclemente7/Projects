const fs = require('fs');

let c = fs.readFileSync('src/pdf.ts', 'utf8');

c = c.replace(
    'await dispatchPdfGeneration(doc, quote, client, template);',
    'await dispatchPdfGeneration(doc, quote, client, template);\n    await appendImagesToPdf(doc, quote);'
);

c = c.replace(
    'await dispatchPdfGeneration(doc, dummyQuote, dummyClient, template);',
    'await dispatchPdfGeneration(doc, dummyQuote, dummyClient, template);\n    await appendImagesToPdf(doc, dummyQuote);'
);

c += `
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
    
    for (const url of quote.image_urls) {
        const imgProps = doc.getImageProperties(url);
        const imgRatio = imgProps.height / imgProps.width;
        const renderWidth = Math.min(availableWidth, 400);
        const renderHeight = renderWidth * imgRatio;
        
        if (startY + renderHeight > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            startY = 40;
        }
        
        const xPos = margin + (availableWidth - renderWidth) / 2;
        doc.addImage(url, 'JPEG', xPos, startY, renderWidth, renderHeight);
        startY += renderHeight + 20;
    }
}
`;

c = c.replace(
    "const logoToUse = (template === 'sleek') ? MacrisLogoBlanco : MacrisLogo;",
    "const logoToUse = (template === 'sleek' || template === 'modern' || template === 'classic') ? MacrisLogoBlanco : MacrisLogo;"
);

// We want to force classic to use modern!
// Look for "case 'classic':" block
c = c.replace(
    "renderClassicPDF(doc, quote, client, logoUrl);",
    "renderModernPDF(doc, quote, client, logoUrl);"
);
// replace default block as well
c = c.replace(
    "renderClassicPDF(doc, quote, client, logoUrl);",
    "renderModernPDF(doc, quote, client, logoUrl);"
);


fs.writeFileSync('src/pdf.ts', c);
