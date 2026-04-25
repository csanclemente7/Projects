import 'flatpickr/dist/flatpickr.min.css';
import './src/icons.css';
import { checkAuth } from './src/auth';
import { observeLocalIcons } from './src/icons';
import { registerCotizacionesPwa, runPwaSplash } from './src/pwa';

if (import.meta.env.MODE === 'desktop') {
    document.documentElement.dataset.runtime = 'desktop';
}

observeLocalIcons();
registerCotizacionesPwa();
// Show splash first, then proceed to auth
runPwaSplash()
    .then(() => checkAuth())
    .catch(error => {
        console.error('Desktop auth bootstrap failed', error);
    });
