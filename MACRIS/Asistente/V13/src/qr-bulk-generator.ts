import JSZip from 'jszip';
import QRCode from 'qrcode';
import * as UI from './ui';
import * as D from './dom';

let userLogoImage: HTMLImageElement | null = null;
let customFontLoaded = false;

export function initQrGenerator() {
    if (!D.btnQrGenerator) return;

    D.btnQrGenerator.addEventListener('click', openQrModal);
    
    if (D.closeQrGeneratorModal) {
        D.closeQrGeneratorModal.addEventListener('click', closeQrModal);
    }

    if (D.qrLogoInput) {
        D.qrLogoInput.addEventListener('change', handleLogoUpload);
    }

    if (D.btnStartQrGeneration) {
        D.btnStartQrGeneration.addEventListener('click', handleStartGeneration);
    }
    
    // Auto preview on inputs change
    const inputs = [
        D.qrLegendInput, D.qrPrefixInput, D.qrPaddingInput, D.qrStartInput, 
        D.qrFormatSelect, D.qrFontLegendInput, D.qrFontCodeInput,
        D.qrPosYLegend, D.qrPosYCode
    ];
    inputs.forEach(input => {
        if (input) {
            input.addEventListener('input', drawPreview);
            input.addEventListener('change', drawPreview);
        }
    });

    if (D.qrMarginInput) {
        D.qrMarginInput.addEventListener('input', (e) => {
            if (D.qrMarginVal) D.qrMarginVal.textContent = `${(e.target as HTMLInputElement).value}px`;
            drawPreview();
        });
    }
}

function openQrModal() {
    if (D.qrGeneratorModal) {
        D.qrGeneratorModal.style.display = 'block';
        userLogoImage = null; // reset
        if (D.qrLogoInput) D.qrLogoInput.value = '';
        if (D.qrGeneratorProgressContainer) D.qrGeneratorProgressContainer.style.display = 'none';
        if (D.btnStartQrGeneration) {
            D.btnStartQrGeneration.disabled = false;
            D.btnStartQrGeneration.innerHTML = '<i class="fas fa-cogs"></i> Iniciar Generación en Lote';
        }
        drawPreview();
    }
}

function closeQrModal() {
    if (D.qrGeneratorModal) D.qrGeneratorModal.style.display = 'none';
}

function handleLogoUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
        userLogoImage = null;
        drawPreview();
        return;
    }

    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            userLogoImage = img;
            drawPreview();
        };
        if (event.target && event.target.result) {
            img.src = event.target.result as string;
        }
    };
    reader.readAsDataURL(file);
}

function buildLabelText(config: any, index: number) {
    const paddedNum = String(index).padStart(config.padding, '0');
    return `${config.prefix}-${paddedNum}`;
}

async function renderCanvas(canvas: HTMLCanvasElement, config: any, qrDataUrl: string, sampleCode: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Load custom font locally if possible just setting context font.
    // Assuming 1200x1200
    const w = canvas.width;
    const h = canvas.height;

    // 1. Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    // Bounding Box (border optional but good for cutting)
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#FFFFFF'; // White border as bleed
    ctx.strokeRect(0,0,w,h);

    // 2. Text Top (Legend)
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${config.fontLegend}px "Segoe UI", Inter, Roboto, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(config.legend, w / 2, config.posYLegend);

    // 3. Draw QR in the middle
    // Margin of the QR drawing space
    const qrMargin = config.margin; 
    const qrSize = w - (qrMargin * 2);
    
    // We must load the QR image onto the canvas
    const qrImg = new Image();
    await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => {
            // Draw QR
            ctx.drawImage(qrImg, qrMargin, qrMargin - 20, qrSize, qrSize);
            resolve();
        };
        qrImg.onerror = reject;
        qrImg.src = qrDataUrl;
    });

    // 4. Draw User Logo in Center if exists
    if (userLogoImage) {
        const logoSize = qrSize * 0.25; // 25% of the QR code center
        const logoX = w / 2 - (logoSize / 2);
        const logoY = (qrMargin - 20) + (qrSize / 2) - (logoSize / 2);

        // White background for the logo to separate it from QR matrix
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        // A slightly rounded background
        ctx.roundRect(logoX - 10, logoY - 10, logoSize + 20, logoSize + 20, 20);
        ctx.fill();

        // Draw image
        ctx.drawImage(userLogoImage, logoX, logoY, logoSize, logoSize);
    }

    // 5. Draw Text Bottom (Code)
    ctx.fillStyle = '#000000';
    ctx.font = `bold ${config.fontCode}px "Segoe UI", Inter, Roboto, Arial, sans-serif`;
    ctx.fillText(sampleCode, w / 2, config.posYCode);
}

async function drawPreview() {
    if (!D.qrPreviewCanvas) return;
    
    // Setup config from DOM
    const padding = parseInt(D.qrPaddingInput?.value || '4') || 4;
    const prefix = D.qrPrefixInput?.value || 'mc';
    const legend = D.qrLegendInput?.value || 'By Macris';
    const startNum = parseInt(D.qrStartInput?.value || '1000') || 1000;
    
    const fontLegend = parseInt(D.qrFontLegendInput?.value || '90') || 90;
    const fontCode = parseInt(D.qrFontCodeInput?.value || '110') || 110;
    const margin = parseInt(D.qrMarginInput?.value || '220') || 220;
    const posYLegend = parseInt(D.qrPosYLegend?.value || '120') || 120;
    const posYCode = parseInt(D.qrPosYCode?.value || '1080') || 1080;

    const sampleCode = `${prefix}-${String(startNum).padStart(padding, '0')}`;
    
    // Empty QR or real QR for sample? Let's use real QR to verify layout
    try {
        const tempQrData = await QRCode.toDataURL(sampleCode, {
            errorCorrectionLevel: 'H',
            margin: 0,
            width: 800,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        await renderCanvas(D.qrPreviewCanvas, { padding, prefix, legend, fontLegend, fontCode, margin, posYLegend, posYCode }, tempQrData, sampleCode);
    } catch (e) {
        console.error("Preview draw error:", e);
    }
}

async function handleStartGeneration() {
    const defaultPadding = parseInt(D.qrPaddingInput?.value || '4') || 4;
    const config = {
        legend: D.qrLegendInput?.value || 'By Macris',
        prefix: D.qrPrefixInput?.value || 'mc',
        padding: defaultPadding,
        start: parseInt(D.qrStartInput?.value || '1000') || 1000,
        end: parseInt(D.qrEndInput?.value || '1500') || 1500,
        format: D.qrFormatSelect?.value || 'image/png',
        fontLegend: parseInt(D.qrFontLegendInput?.value || '90') || 90,
        fontCode: parseInt(D.qrFontCodeInput?.value || '110') || 110,
        margin: parseInt(D.qrMarginInput?.value || '220') || 220,
        posYLegend: parseInt(D.qrPosYLegend?.value || '120') || 120,
        posYCode: parseInt(D.qrPosYCode?.value || '1080') || 1080
    };

    if (config.end < config.start) {
        UI.showAppNotification("El número Final debe ser mayor o igual al número Inicial", 'error');
        return;
    }

    const total = config.end - config.start + 1;
    if (total > 5000) {
        if (!confirm(`Cuidado: Va a generar ${total} códigos HD. Esto podría sobrecargar el navegador. ¿Desea continuar?`)) {
            return;
        }
    }

    // Prepare UI
    if (D.btnStartQrGeneration) {
        D.btnStartQrGeneration.disabled = true;
        D.btnStartQrGeneration.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando ZIP...';
    }
    if (D.qrGeneratorProgressContainer) {
        D.qrGeneratorProgressContainer.style.display = 'block';
    }
    updateProgress(0, total);

    // Create an invisible canvas for rendering
    const workCanvas = document.createElement('canvas');
    workCanvas.width = 1200;
    workCanvas.height = 1200;

    const zip = new JSZip();
    const folder = zip.folder(`QRs_${config.prefix}_${config.start}_${config.end}`);
    if (!folder) {
        UI.showAppNotification("Could not create ZIP folder structure.", "error");
        return;
    }

    try {
        // Asynchronous loop mapping to avoid locking UI
        for (let i = 0; i < total; i++) {
            const num = config.start + i;
            const itemCode = buildLabelText(config, num);
            
            // 1. Generate QR code Matrix
            const qrDataUrl = await QRCode.toDataURL(itemCode, {
                errorCorrectionLevel: 'H',
                margin: 0,
                width: 800,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            });

            // 2. Render to working canvas
            await renderCanvas(workCanvas, config, qrDataUrl, itemCode);

            // 3. Export to Blob
            const type = config.format;
            const ext = type === 'image/jpeg' ? 'jpg' : 'png';
            const blob = await new Promise<Blob | null>(resolve => {
                workCanvas.toBlob(resolve, type, 1.0); // Highest quality
            });

            if (blob) {
                folder.file(`${itemCode}.${ext}`, blob);
            }

            // Await a tick every 10 iterations to free the main thread and update UI
            if (i % 10 === 0) {
                updateProgress(i + 1, total);
                await new Promise(r => setTimeout(r, 0));
            }
        }

        updateProgress(total, total);
        if (D.qrProgressText) D.qrProgressText.textContent = "Comprimiendo ZIP... Esto puede tardar unos segundos.";

        // Generate final Zip
        const zipBlob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
            // Update compression percentage if we want
            if (D.qrProgressPercent) {
                D.qrProgressPercent.textContent = `Compromiendo: ${Math.floor(metadata.percent)}%`;
            }
        });

        // Trigger Download
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `QRs_${config.prefix}_${config.start}_to_${config.end}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        UI.showAppNotification(`Archivo con ${total} QRs creado exitosamente.`, 'success');

        // Optional: close modal
        setTimeout(() => closeQrModal(), 1500);

    } catch (e: any) {
        console.error("Error generating QRs:", e);
        UI.showAppNotification(`Error al generar lote: ${e.message}`, 'error');
    } finally {
        if (D.btnStartQrGeneration) {
            D.btnStartQrGeneration.disabled = false;
            D.btnStartQrGeneration.innerHTML = '<i class="fas fa-cogs"></i> Iniciar Generación en Lote';
        }
    }
}

function updateProgress(current: number, total: number) {
    const pct = Math.floor((current / total) * 100);
    if (D.qrProgressBar) D.qrProgressBar.style.width = `${pct}%`;
    if (D.qrProgressPercent) D.qrProgressPercent.textContent = `${pct}%`;
    if (D.qrProgressText) {
        D.qrProgressText.textContent = `Pintando código ${current} de ${total}...`;
    }
}
