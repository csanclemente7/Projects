import * as State from './state';
import * as UI from './ui';
import { fetchItems, fetchMovements, fetchTechnicians } from './api';
import { setupEventListeners } from './events';

async function main() {
  UI.showLoader('Conectando con Supabase...');

  try {
    setupEventListeners();

    UI.showLoader('Cargando inventario...');
    const [items, movements, technicians] = await Promise.all([
      fetchItems(true),   // incluir inactivos para gestión
      fetchMovements({ limit: 200 }),
      fetchTechnicians(),
    ]);

    State.setItems(items);
    State.setMovements(movements);
    State.setTechnicians(technicians);

    UI.hideLoader();
    UI.navigateTo('dashboard');
    UI.renderDashboard(movements);

  } catch (err: any) {
    console.error('Error al inicializar la app:', err);
    UI.hideLoader();
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;padding:24px;text-align:center;">
        <div>
          <p style="font-size:2rem;margin-bottom:12px;">⚠️</p>
          <h2 style="margin-bottom:8px;">No se pudo conectar a la base de datos</h2>
          <p style="color:#64748b;margin-bottom:16px;">Verifica las credenciales en <code>src/supabase.ts</code> y que hayas ejecutado <code>setup.sql</code>.</p>
          <p style="color:#94a3b8;font-size:.85rem;">${err.message || err}</p>
        </div>
      </div>
    `;
  }
}

main();