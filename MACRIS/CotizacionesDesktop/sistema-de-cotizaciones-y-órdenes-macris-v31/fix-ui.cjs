const fs = require('fs');

let content = fs.readFileSync('src/ui.ts', 'utf-8');

// 1. Add ImageViewer code to the end
const viewerCode = `

// --- Image Viewer Logic ---
let currentViewerImages: string[] = [];
let currentViewerIndex: number = 0;

export function openImageViewer(imagesUrls: (string | null)[], startIndex: number) {
    const validUrls = imagesUrls.filter(u => u !== null) as string[];
    if (validUrls.length === 0) return;
    
    currentViewerImages = validUrls;
    currentViewerIndex = Math.max(0, Math.min(startIndex, validUrls.length - 1));

    const modal = document.getElementById('image-viewer-modal');
    if (!modal) return;

    updateImageViewer();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function updateImageViewer() {
    const imgEl = document.getElementById('image-viewer-img') as HTMLImageElement;
    const counterEl = document.getElementById('image-viewer-counter');
    if (!imgEl || !counterEl) return;

    imgEl.src = currentViewerImages[currentViewerIndex];
    counterEl.innerText = \`\${currentViewerIndex + 1} / \${currentViewerImages.length}\`;
}

function closeImageViewer() {
    const modal = document.getElementById('image-viewer-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('image-viewer-close')?.addEventListener('click', closeImageViewer);
    document.getElementById('image-viewer-prev')?.addEventListener('click', () => {
        if (currentViewerImages.length === 0) return;
        currentViewerIndex = (currentViewerIndex - 1 + currentViewerImages.length) % currentViewerImages.length;
        updateImageViewer();
    });
    document.getElementById('image-viewer-next')?.addEventListener('click', () => {
        if (currentViewerImages.length === 0) return;
        currentViewerIndex = (currentViewerIndex + 1) % currentViewerImages.length;
        updateImageViewer();
    });
});
`;
content += viewerCode;

// 2. Modify renderQuoteAnnexPreviews
content = content.replace(
    /export function renderQuoteAnnexPreviews.*?(?=urls\.forEach)/s,
    `export function renderQuoteAnnexPreviews(quote: Quote | null) {
    if (!quote) return;
    const container = document.getElementById("quote-annex-preview-container");
    if (!container) return;
    container.innerHTML = "";
    const urls = quote.image_urls || [];
    const previewUrls: (string | null)[] = new Array(urls.length).fill(null);
    `
);

content = content.replace(
    /imgHtml = `<img src="\$\{objectUrl\}" alt="Anexo">`;/,
    `previewUrls[index] = objectUrl;
                imgHtml = \`<img src="\${objectUrl}" alt="Anexo" class="clickable-annex-img" style="cursor: pointer;">\`;`
);

content = content.replace(
    /el\.querySelector\("\.remove-photo-btn"\)\?\.addEventListener\("click", \(e\) => {/,
    `const imgEl = el.querySelector('.clickable-annex-img');
            if (imgEl) {
                imgEl.addEventListener('click', () => {
                    openImageViewer(previewUrls, index);
                });
            }
            el.querySelector(".remove-photo-btn")?.addEventListener("click", (e) => {`
);

// 3. Modify renderOrderAnnexPreviews
content = content.replace(
    /export function renderOrderAnnexPreviews.*?(?=urls\.forEach)/s,
    `export function renderOrderAnnexPreviews(order: Order | null) {
    if (!order) return;
    const container = document.getElementById("order-annex-preview-container");
    if (!container) return;
    container.innerHTML = "";
    const urls = order.image_urls || [];
    const previewUrls: (string | null)[] = new Array(urls.length).fill(null);
    `
);

content = content.replace(
    /imgHtml = `<img src="\$\{objectUrl\}" alt="Anexo Orden">`;/,
    `previewUrls[index] = objectUrl;
                imgHtml = \`<img src="\${objectUrl}" alt="Anexo Orden" class="clickable-annex-img" style="cursor: pointer;">\`;`
);

const lastReplaceRegex = /el\.querySelector\("\.remove-photo-btn"\)\?\.addEventListener\("click", \(e\) => {/g;
let lastMatch;
while ((match = lastReplaceRegex.exec(content)) !== null) {
  lastMatch = match;
}
if (lastMatch) {
    const idx = lastMatch.index;
    content = content.substring(0, idx) + `const imgEl = el.querySelector('.clickable-annex-img');
            if (imgEl) {
                imgEl.addEventListener('click', () => {
                    openImageViewer(previewUrls, index);
                });
            }
            el.querySelector(".remove-photo-btn")?.addEventListener("click", (e) => {` + content.substring(idx + lastMatch[0].length);
}

fs.writeFileSync('src/ui.ts', content, 'utf-8');
console.log('Modified src/ui.ts successfully!');
