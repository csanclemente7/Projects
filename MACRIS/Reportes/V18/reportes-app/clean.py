import os

html = open('index.html', 'r', encoding='utf-8').read()

# Fix plate scan DOM
p11 = '''<button
            type="button"
            id="take-picture-button"
            class="btn btn-primary"
            style="width: 100%; padding: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0, 223, 255, 0.2);"
          >
            <i class="fas fa-camera"></i> Capturar y Analizar
          </button>
          <button
            type="button"
            id="cancel-plate-scan-button"
            class="btn btn-secondary"
            style="width: 100%; padding: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; background: transparent; border: 1px solid var(--color-border-medium); color: var(--color-text-secondary); border-radius: 8px;"
          >
            Cancelar
          </button>'''
r11 = '''<button type="button" id="cancel-plate-scan-button" class="btn btn-secondary">Cancelar</button>
          <button type="button" id="take-picture-button" class="btn btn-primary"><i class="fas fa-camera"></i> Capturar y Analizar</button>'''

html = html.replace(p11, r11)

html = html.replace('<div class="modal-actions" style="flex-direction: column; gap: 12px; width: 100%; padding-bottom: 5px;">', '<div class="modal-actions">')

# Reemplazos sencillos
html = html.replace('>Cancelar<', '><i class="fas fa-arrow-left"></i> Atrás<')
html = html.replace('> Cancelar<', '><i class="fas fa-arrow-left"></i> Atrás<')
html = html.replace(' Cancelar', ' <i class="fas fa-arrow-left"></i> Atrás')
html = html.replace('\n            Cancelar\n', '\n            <i class="fas fa-arrow-left"></i> Atrás\n')
html = html.replace('<i class="fas fa-arrow-left"></i> <i class="fas fa-arrow-left"></i>', '<i class="fas fa-arrow-left"></i>')

html = html.replace('>CANCELAR<', '><i class="fas fa-arrow-left"></i> ATRÁS<')
html = html.replace('\n            CANCELAR\n', '\n            <i class="fas fa-arrow-left"></i> ATRÁS\n')

open('index.html', 'w', encoding='utf-8').write(html)

css = open('index.css', 'r', encoding='utf-8').read()

if 'column-reverse' not in css:
    append = '''
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
.modal-actions > button[id^="cancel"], 
.modal-actions > button[id^="close"] {
  padding: 10px !important;
  font-weight: 500 !important;
  background: transparent !important;
  border: 1px solid var(--color-border-medium) !important;
  color: var(--color-text-secondary) !important;
  font-size: 0.85em !important;
}
'''
    open('index.css', 'w', encoding='utf-8').write(css + append)

print("done")
