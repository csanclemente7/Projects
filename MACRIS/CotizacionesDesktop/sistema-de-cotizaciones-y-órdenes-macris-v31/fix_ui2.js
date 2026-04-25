const fs = require('fs');

const codeToAppend = `
// --- Anexos Fotográficos ---
export function setupQuoteAnnexUpload() {
  const uploadInput = document.getElementById("quote-annex-upload");
  if (!uploadInput) return;
  uploadInput.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const activeQuote = State.getActiveQuote();
    if (!activeQuote) return;
    if (!activeQuote.image_urls) activeQuote.image_urls = [];

    for (let i = 0; i < files.length; i++) {
        try {
            const compressedBlob = await compressImage(files[i]);
            const fileName = "IMG_" + Date.now() + "_" + Math.random().toString(36).substring(7) + ".jpg";
            const { data, error } = await supabaseQuotes.storage.from("quote-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
            if (error) {
                console.error("Error uploading image:", error);
                continue;
            }
            if (data && data.path) {
                activeQuote.image_urls.push(data.path);
            }
        } catch (err) {
            console.error("Error compressing image:", err);
        }
    }
    State.updateActiveQuote(activeQuote);
    renderQuoteAnnexPreviews(activeQuote);
    uploadInput.value = "";
  });
}

export function getQuoteImageUrl(urlPath) {
  return supabaseQuotes.storage.from("quote-images").getPublicUrl(urlPath).data.publicUrl;
}

export function renderQuoteAnnexPreviews(quote) {
  if (!quote) return;
  const container = document.getElementById("quote-annex-preview-container");
  if (!container) return;
  container.innerHTML = "";
  const urls = quote.image_urls || [];
  urls.forEach((url, index) => {
    const el = document.createElement("div");
    el.className = "quote-annex-preview-item";
    el.innerHTML = \\\`<img src="\\\${getQuoteImageUrl(url)}" alt="Anexo"><button class="remove-photo-btn" data-index="\\\${index}"><i class="fas fa-times"></i></button>\\\`;
    container.appendChild(el);
  });
  container.querySelectorAll(".remove-photo-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const activeQuote = State.getActiveQuote();
      if (!activeQuote) return;
      const idx = parseInt(e.currentTarget.dataset.index || "0");
      if (!activeQuote.image_urls) activeQuote.image_urls = [];
      activeQuote.image_urls.splice(idx, 1);
      State.updateActiveQuote(activeQuote);
      renderQuoteAnnexPreviews(activeQuote);
    });
  });
}

export function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_WIDTH = 800;
            if (width > MAX_WIDTH) {
                height = Math.round(height * (MAX_WIDTH / width));
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas to Blob failed'));
            }, 'image/jpeg', 0.7);
        };
        img.onerror = (e) => reject(e);
    });
}
`;

fs.appendFileSync('src/ui.ts', codeToAppend);
