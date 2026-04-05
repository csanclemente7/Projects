const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The tricky part is the AI Scanner inverted DOM
const p11 = '<button\\n            type=\"button\"\\n            id=\"take-picture-button\"\\n            class=\"btn btn-primary\"\\n            style=\"width: 100%; padding: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 223, 255, 0.2);\"\\n          >\\n            <i class=\"fas fa-camera\"></i> Capturar y Analizar\\n          </button>\\n          <button\\n            type=\"button\"\\n            id=\"cancel-plate-scan-button\"\\n            class=\"btn btn-secondary\"\\n            style=\"width: 100%; padding: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; background: transparent; border: 1px solid var(--color-border-medium); color: var(--color-text-secondary); border-radius: 8px;\"\\n          >\\n            Cancelar\\n          </button>';

const r11 = '<button type=\"button\" id=\"cancel-plate-scan-button\" class=\"btn btn-secondary\">Cancelar</button>\\n          <button type=\"button\" id=\"take-picture-button\" class=\"btn btn-primary\"><i class=\"fas fa-camera\"></i> Capturar y Analizar</button>';

html = html.replace(p11, r11);
html = html.replace('<div class=\"modal-actions\" style=\"flex-direction: column; gap: 12px; width: 100%; padding-bottom: 5px;\">', '<div class=\"modal-actions\">');

html = html.split('Cancelar').join('Atrás');
html = html.split('CANCELAR').join('ATRÁS');
html = html.split('Atrás').join('<i class=\"fas fa-arrow-left\"></i> Atrás');
html = html.split('<i class=\"fas fa-arrow-left\"></i> <i class=\"fas fa-arrow-left\"></i> Atrás').join('<i class=\"fas fa-arrow-left\"></i> Atrás');

fs.writeFileSync('index.html', html, 'utf8');

let css = fs.readFileSync('index.css', 'utf8');
if (!css.includes('column-reverse !important')) {
    let append = \"\\n\\n.modal-actions {\\n  display: flex !important;\\n  flex-direction: column-reverse !important;\\n  gap: 12px !important;\\n  width: 100% !important;\\n  padding-bottom: 5px !important;\\n  justify-content: flex-end;\\n}\\n\\n.modal-actions > .btn {\\n  width: 100% !important;\\n  border-radius: 8px !important;\\n  text-transform: uppercase !important;\\n  letter-spacing: 0.5px !important;\\n  margin: 0 !important;\\n}\\n\\n.modal-actions > .btn-primary, .modal-actions > .btn-success {\\n  padding: 14px !important;\\n  font-weight: 600 !important;\\n  box-shadow: 0 4px 15px rgba(0, 223, 255, 0.2) !important;\\n}\\n\\n.modal-actions > .btn-secondary, \\n.modal-actions > .btn-danger, \\n.modal-actions > button[id^=\\\"cancel\\\"], \\n.modal-actions > button[id^=\\\"close\\\"] {\\n  padding: 10px !important;\\n  font-weight: 500 !important;\\n  background: transparent !important;\\n  border: 1px solid var(--color-border-medium) !important;\\n  color: var(--color-text-secondary) !important;\\n  font-size: 0.85em !important;\\n}\\n\";
    fs.writeFileSync('index.css', css + append, 'utf8');
}
console.log('done javascript run');
