/**
 * location-resolution.ts
 *
 * Helpers centralizados para resolver la jerarquía de ubicación:
 *   Empresa madre (clients) → Sede (maintenance_companies) → Dependencia
 *
 * Evita que la lógica de coincidencia quede dispersa y se resuelva
 * con heurísticas distintas según el módulo que la use.
 */

import { Dependency } from './types';

/**
 * Determina si una dependencia pertenece a la selección actual en el formulario.
 *
 * Maneja tres escenarios:
 *  1. Registros nuevos con convención completa (company_id + client_id + sede_id).
 *  2. Registros legacy con sólo company_id apuntando a una sede.
 *  3. Registros legacy con company_id = null y sólo client_id guardado.
 *
 * @param dep              La dependencia a evaluar.
 * @param selectedSedeId   ID de la sede actualmente seleccionada, o null si no aplica.
 * @param selectedCompanyId ID de la empresa madre seleccionada (caso sin sedes), o null.
 */
export function isDependencyCompatibleWithSelection(
    dep: Dependency,
    selectedSedeId: string | null,
    selectedCompanyId: string | null
): boolean {
    if (selectedSedeId) {
        // Primario: company_id apunta a la sede (nueva convención y legacy).
        // Secundario: sedeId explícito (nueva convención, por redundancia semántica).
        return dep.companyId === selectedSedeId || dep.sedeId === selectedSedeId;
    }

    if (selectedCompanyId) {
        // Primario: company_id apunta a la empresa madre (empresa sin sedes, nueva convención).
        // Secundario: clientId explícito coincide con la empresa madre.
        // Esto cubre el caso legacy donde company_id era un sedeId pero clientId es la empresa madre.
        return dep.companyId === selectedCompanyId || dep.clientId === selectedCompanyId;
    }

    return false;
}
