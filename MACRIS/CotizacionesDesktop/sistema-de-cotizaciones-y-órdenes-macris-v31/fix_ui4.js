import fs from 'fs';

let uiContent = fs.readFileSync('src/ui.ts', 'utf-8');

const targetFunction = `export function renderQuoteAnnexPreviews(quote: Quote | null) {
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
      const idx = parseInt((e.currentTarget as HTMLElement).dataset.index || "0");
      if (!activeQuote.image_urls) activeQuote.image_urls = [];
      activeQuote.image_urls.splice(idx, 1);
      State.updateActiveQuote(activeQuote);
      renderQuoteAnnexPreviews(activeQuote);
    });
  });
}`;

const replacement = `export function renderQuoteAnnexPreviews(quote: Quote | null) {
  if (!quote) return;
  const container = document.getElementById("quote-annex-preview-container");
  if (!container) return;
  container.innerHTML = "";
  const urls = quote.image_urls || [];
  urls.forEach((url, index) => {
    const el = document.createElement("div");
    el.className = "quote-annex-preview-item";
    el.innerHTML = \\\`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;"><i class="fas fa-spinner fa-spin"></i></div>\\\`;
    container.appendChild(el);

    supabaseQuotes.storage.from("quote-images").download(url).then(({ data, error }) => {
        if (!error && data) {
            const objectUrl = URL.createObjectURL(data);
            el.innerHTML = \\\`<img src="\\\${objectUrl}" alt="Anexo"><button class="remove-photo-btn" data-index="\\\${index}"><i class="fas fa-times"></i></button>\\\`;
            el.querySelector(".remove-photo-btn")?.addEventListener("click", (e) => {
                e.preventDefault();
                const activeQ = State.getActiveQuote();
                if (!activeQ || !activeQ.image_urls) return;
                activeQ.image_urls.splice(index, 1);
                State.updateActiveQuote(activeQ);
                renderQuoteAnnexPreviews(activeQ);
            });
        }
    });
  });
}`;

if (uiContent.includes(targetFunction)) {
    uiContent = uiContent.replace(targetFunction, replacement);
    fs.writeFileSync('src/ui.ts', uiContent);
    console.log("Successfully replaced renderQuoteAnnexPreviews!");
} else {
    console.log("Target function NOT found in src/ui.ts. Please check syntax manually.");
}
