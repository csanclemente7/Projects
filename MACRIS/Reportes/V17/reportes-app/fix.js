const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
  '<button\n            type=\"button\"\n            id=\"take-picture-button\"\n            class=\"btn btn-primary\"\n            style=\"width: 100%; padding: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 223, 255, 0.2);\"\n          >\n            <i class=\"fas fa-camera\"></i> Capturar y Analizar\n          </button>\n          <button\n            type=\"button\"\n            id=\"cancel-plate-scan-button\"\n            class=\"btn btn-secondary\"\n            style=\"width: 100%; padding: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; background: transparent; border: 1px solid var(--color-border-medium); color: var(--color-text-secondary); border-radius: 8px;\"\n          >\n            Cancelar\n          </button>',
  '<button type=\"button\" id=\"cancel-plate-scan-button\" class=\"btn btn-secondary\">Cancelar</button>\n          <button type=\"button\" id=\"take-picture-button\" class=\"btn btn-primary\"><i class=\"fas fa-camera\"></i> Capturar y Analizar</button>'
);

html = html.replace(
  '<div class=\"modal-actions\" style=\"flex-direction: column; gap: 12px; width: 100%; padding-bottom: 5px;\">',
  '<div class=\"modal-actions\">'
);

html = html.replace(/<button([^>]+id=\"cancel[^>]+)>([^<]*)Cancelar([^<]*)<\\/button>/g, '<button$1>$2<i class=\"fas fa-arrow-left\"></i> Atrás$3</button>');
html = html.replace(/>\\s*Cancelar\\s*</g, '><i class=\"fas fa-arrow-left\"></i> Atrás<');
html = html.replace(/<i class=\"fas fa-arrow-left\"><\\/i>\\s*<i class=\"fas fa-arrow-left\"><\\/i> Atrás/g, '<i class=\"fas fa-arrow-left\"></i> Atrás');
html = html.replace(/<i class=\"fas fa-arrow-left\"><\\/i> Cancelar/g, '<i class=\"fas fa-arrow-left\"></i> Atrás');

fs.writeFileSync('index.html', html, 'utf8');

let css = fs.readFileSync('index.css', 'utf8');
let newCSSRules = \`
.modal-actions {
  display: flex !important;
  flex-direction: column-reverse !important;
  gap: 12px !important;
  width: 100% !important;
  padding-bottom: 5px !important;
  justify-content: flex-end;
}

.modal-actions > .btn {
  width: 100% !important;
  border-radius: 8px !important;
  text-transform: uppercase !important;
  letter-spacing: 0.5px !important;
  margin: 0 !important;
}

.modal-actions > .btn-primary, .modal-actions > .btn-success {
  padding: 14px !important;
  font-weight: 600 !important;
  box-shadow: 0 4px 15px rgba(0, 223, 255, 0.2) !important;
}

.modal-actions > .btn-secondary, 
.modal-actions > .btn-danger, 
.modal-actions > button[id^=\"cancel\"], 
.modal-actions > button[id^=\"close\"] {
  padding: 10px !important;
  font-weight: 500 !important;
  background: transparent !important;
  border: 1px solid var(--color-border-medium) !important;
  color: var(--color-text-secondary) !important;
  font-size: 0.85em !important;
}
\`;

if (!css.includes('flex-direction: column-reverse !important')) {
  if (css.includes('.modal-actions {')) {
     css = css.replace(/\\.modal-actions \\{[^}]+\\}/, newCSSRules);
  } else {
     css += newCSSRules;
  }
  fs.writeFileSync('index.css', css, 'utf8');
}
console.log('done');
