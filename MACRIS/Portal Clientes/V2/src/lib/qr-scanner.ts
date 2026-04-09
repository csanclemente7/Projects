import jsQR from 'jsqr';

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
  handleQrCodeResult: (data: string) => void;
}

export function initQrScanner(deps: QrScannerDependencies) {
  let currentCameraStream: MediaStream | null = null;
  let qrScanFrameId: number | null = null;

  function openCameraScanModal() {
    if (!deps.qrVideoElement || !deps.cameraScanModal || !deps.qrHiddenCanvasElement) return;

    deps.cameraScanModal.style.display = 'flex';
    deps.cameraScanFeedback.textContent = 'Apuntando a la camara...';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        currentCameraStream = stream;
        deps.qrVideoElement.srcObject = stream;
        deps.qrVideoElement.setAttribute('playsinline', 'true');
        deps.qrVideoElement.play();
        qrScanFrameId = requestAnimationFrame(tick);
      })
      .catch(err => {
        console.error('Error al acceder a la camara:', err);
        deps.cameraScanFeedback.textContent = 'Error al acceder a la camara.';
        deps.showAppNotification('No se pudo acceder a la camara. Verifique permisos.', 'error');
        closeCameraScanModal();
      });

    function tick() {
      if (deps.qrVideoElement.readyState === deps.qrVideoElement.HAVE_ENOUGH_DATA) {
        deps.cameraScanFeedback.textContent = 'Buscando código QR...';
        const canvas = deps.qrHiddenCanvasElement;
        const ctx = canvas.getContext('2d');
        canvas.height = deps.qrVideoElement.videoHeight;
        canvas.width = deps.qrVideoElement.videoWidth;
        if (!ctx) return;
        ctx.drawImage(deps.qrVideoElement, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code) {
          deps.cameraScanFeedback.textContent = 'Código QR encontrado.';
          closeCameraScanModal();
          deps.handleQrCodeResult(code.data);
          return;
        }
      }
      qrScanFrameId = requestAnimationFrame(tick);
    }
  }

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
          deps.showAppNotification('No se pudo inicializar el canvas.', 'error');
          return;
        }

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
        const threshold = 128;

        for (let i = 0; i < data.length; i += 4) {
          const grayscale = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          const value = grayscale < threshold ? 0 : 255;
          data[i] = value;
          data[i + 1] = value;
          data[i + 2] = value;
        }

        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        deps.hideLoader();

        if (code) {
          deps.handleQrCodeResult(code.data);
        } else {
          deps.showAppNotification('No se encontro un código QR.', 'warning', 5000);
        }
      };
      image.onerror = () => {
        deps.hideLoader();
        deps.showAppNotification('Error al cargar la imagen.', 'error');
      };
      image.src = e.target?.result as string;
    };

    reader.onerror = () => {
      deps.hideLoader();
      deps.showAppNotification('Error al leer el archivo.', 'error');
    };

    reader.readAsDataURL(file);
    deps.qrFileInput.value = '';
  }

  deps.scanQrCameraButton?.addEventListener('click', openCameraScanModal);
  deps.scanQrFromFileButton?.addEventListener('click', () => deps.qrFileInput.click());
  deps.qrFileInput?.addEventListener('change', handleQrFileSelect);
  deps.cancelCameraScanButton?.addEventListener('click', closeCameraScanModal);
  deps.closeCameraScanModalButton?.addEventListener('click', closeCameraScanModal);
}
