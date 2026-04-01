import { maintenanceReportForm } from './dom';

const DRAFT_KEY = 'report_form_draft_v1';

export const FormAutosave = {
    init() {
        if (!maintenanceReportForm) return;

        // Auto-guardar en cada cambio o teclado
        maintenanceReportForm.addEventListener('input', () => this.saveDraft());
        maintenanceReportForm.addEventListener('change', () => this.saveDraft());
    },

    saveDraft() {
        if (!maintenanceReportForm) return;

        // No guardar drafts de reportes que ya existen en BD para no sobreescribir edición
        const reportIdInput = (maintenanceReportForm.elements.namedItem('id') || document.getElementById('report-id-input')) as HTMLInputElement;
        if (reportIdInput && reportIdInput.value) {
            return;
        }

        const formData = new FormData(maintenanceReportForm);
        const state: Record<string, string | boolean> = {};

        // Elementos iterables fijos
        for (let i = 0; i < maintenanceReportForm.elements.length; i++) {
            const el = maintenanceReportForm.elements[i] as any;
            if (el.name && !el.disabled && el.type !== 'file' && el.type !== 'submit' && el.type !== 'button') {
                if (el.type === 'checkbox' || el.type === 'radio') {
                    state[el.name] = el.checked;
                } else {
                    state[el.name] = el.value;
                }
            }
        }

        localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    },

    restoreDraft(): boolean {
        if (!maintenanceReportForm) return false;

        const draftJSON = localStorage.getItem(DRAFT_KEY);
        if (!draftJSON) return false;

        try {
            const state = JSON.parse(draftJSON);
            let restoredSomething = false;

            for (let i = 0; i < maintenanceReportForm.elements.length; i++) {
                const el = maintenanceReportForm.elements[i] as any;
                if (el.name && state[el.name] !== undefined) {
                    if (el.type === 'checkbox' || el.type === 'radio') {
                        if (el.checked !== state[el.name]) {
                            el.checked = state[el.name];
                            restoredSomething = true;
                        }
                    } else {
                        // Evitar sobreescribir campos ocultos técnicos como orderId si ya están
                        if (el.value !== state[el.name]) {
                            el.value = String(state[el.name]);
                            restoredSomething = true;
                        }
                    }
                }
            }

            return restoredSomething;
        } catch (e) {
            console.error("Error restoring form draft", e);
            return false;
        }
    },

    clearDraft() {
        localStorage.removeItem(DRAFT_KEY);
    }
};
