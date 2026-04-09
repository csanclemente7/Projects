const WHITE_THRESHOLD = 245;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load signature image.'));
    img.src = src;
  });
}

export async function normalizeSignatureImage(signature: string): Promise<string> {
  if (!signature || !signature.startsWith('data:image/')) {
    return signature;
  }

  try {
    const img = await loadImage(signature);
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 1;
    canvas.height = img.height || 1;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return signature;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
        data[i + 3] = 0;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to normalize signature image.', error);
    return signature;
  }
}
