import { checkAuth } from './src/auth';
import { registerCotizacionesPwa, runPwaSplash } from './src/pwa';

registerCotizacionesPwa();
// Show splash first, then proceed to auth
runPwaSplash().then(() => checkAuth());
