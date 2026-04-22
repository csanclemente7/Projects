import { maintenanceReportForm } from './dom';

const DRAFT_KEY = 'report_form_draft_v1';
const AUTOSAVE_DEBOUNCE_MS = 600;

export const FormAutosave = {
    _debounceTimer: null as number | null,

    init() {
        if (!maintenanceReportForm) return;

        // Auto-guardar con debounce para evitar bloquear el hilo principal en cada tecla.
        // localStorage.setItem es síncrono — sin debounce genera lag visible en Android gama baja.
        const scheduleSave = () => {
            if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
            this._debounceTimer = window.setTimeout(() => {
                this._debounceTimer = null;
                this.saveDraft();
            }, AUTOSAVE_DEBOUNCE_MS);
        };

        maintenanceReportForm.addEventListener('input', scheduleSave);
        maintenanceReportForm.addEventListener('change', scheduleSave);
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
