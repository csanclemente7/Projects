
import jsQR from 'jsqr';

// Define una interfaz para las dependencias pasadas desde index.tsx
interface QrScannerDependencies {
    scanQrCameraButton: HTMLButtonElement;
    scanQrFromFileButton: HTMLButtonElement;
    qrFileInput: HTMLInputElement;
    cameraScanModal: HTMLDivElement;
    closeCameraScanModalButton: HTMLSpanElement;
    qrVideoElement: HTMLVideoElement;
    qrHiddenCanvasElement: HTMLCanvasElement;
    cancelCameraScanButton: HTMLButtonElement;
    cameraScanFeedback: HTMLParagraphElement;
    showLoader: (message?: string) => void;
    hideLoader: () => void;
    showAppNotification: (message: string, type?: 'error' | 'success' | 'info' | 'warning', duration?: number) => void;
    handleQrCodeResult: (data: string) => void; // Este es el callback
}

/**
 * Inicializa toda la lógica del escáner QR y adjunta los escuchas de eventos.
 * @param deps Un objeto que contiene todos los elementos del DOM y las funciones de callback necesarias desde index.tsx.
 */
export function initQrScanner(deps: QrScannerDependencies) {
    let currentCameraStream: MediaStream | null = null;
    let qrScanFrameId: number | null = null;

    /**
     * Abre el modal de escaneo con cámara y comienza a buscar un código QR.
     */
    function openCameraScanModal() {
        if (!deps.qrVideoElement || !deps.cameraScanModal || !deps.qrHiddenCanvasElement) return;

        deps.cameraScanModal.style.display = 'flex';
        deps.cameraScanFeedback.textContent = 'Apuntando a la cámara...';
        
        // Inicializar BarcodeDetector si está soportado nativamente
        let barcodeDetector: any = null;
        if ('BarcodeDetector' in window) {
            try {
                barcodeDetector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
            } catch (e) {
                console.warn('BarcodeDetector no se pudo inicializar', e);
            }
        }
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(stream => {
                currentCameraStream = stream;
                deps.qrVideoElement.srcObject = stream;
                deps.qrVideoElement.setAttribute("playsinline", "true"); // Requerido para iOS
                deps.qrVideoElement.play();
                qrScanFrameId = requestAnimationFrame(tick);
            })
            .catch(err => {
                console.error("Error al acceder a la cámara:", err);
                deps.cameraScanFeedback.textContent = 'Error al acceder a la cámara.';
                deps.showAppNotification('No se pudo acceder a la cámara. Verifique los permisos.', 'error');
                closeCameraScanModal();
            });

        let lastScanTime = 0;
        const SCAN_INTERVAL_MS = 250; // Limitar scaneo a 4 veces por segundo

        function tick() {
            // Si el stream ya se detuvo (ej: el usuario cerró el modal), no continuar
            if (!currentCameraStream) return;

            if (deps.qrVideoElement.readyState === deps.qrVideoElement.HAVE_ENOUGH_DATA) {
                const now = Date.now();
                if (now - lastScanTime >= SCAN_INTERVAL_MS) {
                    lastScanTime = now;
                    deps.cameraScanFeedback.textContent = 'Buscando código QR...';
                    
                    const canvas = deps.qrHiddenCanvasElement;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    
                    if (!ctx) {
                        qrScanFrameId = requestAnimationFrame(tick);
                        return;
                    }
                    
                    // Escalar imagen para optimizar jsQR (aprox 400px de ancho es ideal)
                    const MAX_WIDTH = 400;
                    let width = deps.qrVideoElement.videoWidth;
                    let height = deps.qrVideoElement.videoHeight;
                    
                    if (width > MAX_WIDTH) {
                        height = Math.floor((height * MAX_WIDTH) / width);
                        width = MAX_WIDTH;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(deps.qrVideoElement, 0, 0, width, height);

                    const processQrResult = (qrText: string | null) => {
                        if (!currentCameraStream) return; // Abortar si el modal se cerró
                        if (qrText) {
                            deps.cameraScanFeedback.textContent = '¡Código QR encontrado!';
                            closeCameraScanModal();
                            deps.handleQrCodeResult(qrText);
                        } else {
                            qrScanFrameId = requestAnimationFrame(tick);
                        }
                    };

                    if (barcodeDetector) {
                        barcodeDetector.detect(canvas)
                            .then((barcodes: any[]) => {
                                if (barcodes.length > 0) {
                                    processQrResult(barcodes[0].rawValue);
                                } else {
                                    processQrResult(null);
                                }
                            })
                            .catch(() => {
                                // Fallback a jsQR si BarcodeDetector falla
                                fallbackToJsQr(ctx, width, height, processQrResult);
                            });
                        return; // El bucle se reanudará en forma asíncrona
                    } else {
                        // Usar directamente jsQR
                        fallbackToJsQr(ctx, width, height, processQrResult);
                        return;
                    }
                }
            }
            qrScanFrameId = requestAnimationFrame(tick);
        }

        function fallbackToJsQr(ctx: CanvasRenderingContext2D, width: number, height: number, callback: (res: string | null) => void) {
            const imageData = ctx.getImageData(0, 0, width, height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });
            callback(code ? code.data : null);
        }
    }

    /**
     * Cierra el modal de escaneo con cámara y libera los recursos.
     */
    function closeCameraScanModal() {
        if (currentCameraStream) {
            currentCameraStream.getTracks().forEach(track => track.stop());
            currentCameraStream = null;
        }
        if (qrScanFrameId) {
            cancelAnimationFrame(qrScanFrameId);
            qrScanFrameId = null;
        }
        if (deps.cameraScanModal) {
            deps.cameraScanModal.style.display = 'none';
        }
        if (deps.qrVideoElement) deps.qrVideoElement.srcObject = null;
    }

    /**
     * Maneja la selección de un archivo de imagen QR, lo procesa e intenta decodificarlo.
     */
    function handleQrFileSelect() {
        if (!deps.qrFileInput.files || deps.qrFileInput.files.length === 0) return;
        const file = deps.qrFileInput.files[0];
        const reader = new FileReader();

        deps.showLoader('Procesando imagen QR...');

        reader.onload = e => {
            const image = new Image();
            image.onload = () => {
                const canvas = deps.qrHiddenCanvasElement;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    deps.hideLoader();
                    deps.showAppNotification('No se pudo inicializar el canvas para procesar la imagen.', 'error');
                    return;
                }

                // Preprocesamiento de la imagen para mejorar la detección
                const MAX_DIMENSION = 1000;
                let { width, height } = image;
                if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    if (width > height) {
                        height = Math.round((height * MAX_DIMENSION) / width);
                        width = MAX_DIMENSION;
                    } else {
                        width = Math.round((width * MAX_DIMENSION) / height);
                        height = MAX_DIMENSION;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                
                ctx.drawImage(image, 0, 0, width, height);
                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;

                // --- Binarization Step ---
                // Convertir a escala de grises y aplicar un umbral para crear una imagen de alto contraste.
                const threshold = 128; // Un buen punto de partida, puede requerir ajuste.
                for (let i = 0; i < data.length; i += 4) {
                    // Cálculo de luminancia estándar
                    const grayscale = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
                    
                    // Aplicar umbral
                    const value = grayscale < threshold ? 0 : 255;
                    
                    // Asignar blanco o negro al píxel
                    data[i] = value;     // R
                    data[i + 1] = value; // G
                    data[i + 2] = value; // B
                }

                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: "attemptBoth",
                });
                
                deps.hideLoader();

                if (code) {
                    deps.handleQrCodeResult(code.data); // Usa el callback
                } else {
                    deps.showAppNotification('No se encontró un código QR. Pruebe con una imagen más clara o con mejor contraste.', 'warning', 5000);
                }
            };
            image.onerror = () => {
                deps.hideLoader();
                deps.showAppNotification('Error al cargar el archivo de imagen.', 'error');
            };
            image.src = e.target?.result as string;
        };

        reader.onerror = () => {
            deps.hideLoader();
            deps.showAppNotification('Error al leer el archivo seleccionado.', 'error');
        };

        reader.readAsDataURL(file);
        deps.qrFileInput.value = '';
    }

    // Adjuntar escuchas de eventos
    deps.scanQrCameraButton?.addEventListener('click', openCameraScanModal);
    deps.scanQrFromFileButton?.addEventListener('click', () => deps.qrFileInput.click());
    deps.qrFileInput?.addEventListener('change', handleQrFileSelect);
    deps.cancelCameraScanButton?.addEventListener('click', closeCameraScanModal);
    deps.closeCameraScanModalButton?.addEventListener('click', closeCameraScanModal);

    console.log("Módulo de escáner QR inicializado.");
}
