import * as XLSX from 'xlsx';
import * as State from './state';
import { Equipment } from './types';

export type ParsedEquipment = Omit<Equipment, 'id' | 'timestamp' | 'created_at' | 'equipment_type_id' | 'refrigerant_type_id'> & {
    equipment_type_id: string | null;
    refrigerant_type_id: string | null;
    isNewCity?: boolean;
    newCityName?: string;
    isNewCompany?: boolean;
    newCompanyName?: string;
    isNewSede?: boolean;
    newSedeName?: string;
    isNewDependency?: boolean;
    newDependencyName?: string;
};

export interface ExcelValidationResult {
    isValid: boolean;
    isPendingCreation?: boolean;
    rowIndex: number;
    data: Partial<ParsedEquipment> | null;
    errors: string[];
    rawRow: any; // Fila cruda original
}

// Limpia strings de Excel
const cleanString = (val: any) => val ? String(val).trim() : '';

/**
 * Recibe un File y devuelve un array de filas validadas.
 */
export async function parseExcelEquipments(file: File): Promise<ExcelValidationResult[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });

                // Asumimos que la información está en la primera hoja
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Extraemos en JSON, asumiendo que la fila 1 contiene los encabezados
                const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                const seenManualIds = new Set<string>();
                const results: ExcelValidationResult[] = rawData.map((row: any, i) => {
                    const rowIndex = i + 2; // Offset por índice 0 y fila de header
                    return validateRow(row, rowIndex, seenManualIds);
                });

                resolve(results);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = (error) => reject(error);
        reader.readAsBinaryString(file);
    });
}

function validateRow(row: any, rowIndex: number, seenManualIds: Set<string>): ExcelValidationResult {
    const errors: string[] = [];
    
    // Normalizamos claves para evitar problemas por mayúsculas/minúsculas en el Excel
    const keys = Object.keys(row);
    const getCol = (possibleNames: string[]) => {
        const key = keys.find(k => possibleNames.some(p => k.toLowerCase().includes(p.toLowerCase())));
        return key ? cleanString(row[key]) : '';
    };

    const manualId = getCol(['id manual', 'placa', 'id']);
    const brand = getCol(['marca']);
    const model = getCol(['modelo', 'model']);
    const capacity = getCol(['capacidad', 'btu', 'tr ']);
    const cityStr = getCol(['ciudad', 'city']);
    const companyStr = getCol(['empresa', 'cliente comercial', 'company']);
    const sedeStr = getCol(['sede']);
    const depStr = getCol(['dependencia']);
    const typeStr = getCol(['tipo de equipo', 'tipo equipo', 'tipo']);
    const refrigStr = getCol(['refrigerante', 'gas']);

    if (!brand) errors.push('Falta Marca');
    if (!model) errors.push('Falta Modelo');
    if (!cityStr) errors.push('Falta Ciudad');
    if (!companyStr) errors.push('Falta Empresa');

    if (manualId) {
        if (seenManualIds.has(manualId.toLowerCase())) {
            errors.push(`ID Manual duplicado en el mismo Excel: ${manualId}`);
        } else {
            const dbExists = State.equipmentList.find(e => e.manual_id?.toLowerCase() === manualId.toLowerCase());
            if (dbExists) {
                errors.push(`El ID Manual '${manualId}' ya existe en la Base de Datos`);
            } else {
                seenManualIds.add(manualId.toLowerCase());
            }
        }
    }

    // Mapeo contra memoria
    let cityId = '';
    let companyId = '';
    let sedeId = '';
    let dependencyId = '';
    let equipmentTypeId = null;
    let refrigerantTypeId = null;
    
    // Flags de auto-creación
    let isNewCity = false;
    let isNewCompany = false;
    let isNewSede = false;
    let isNewDependency = false;

    // Resuelve Ciudad
    if (cityStr) {
        const found = State.cities.find(c => c.name.toLowerCase() === cityStr.toLowerCase());
        if (found) cityId = found.id;
        else {
            isNewCity = true; // Pendiente de crear
        }
    }

    // Resuelve Empresa
    if (companyStr) {
        let candidates = State.companies.filter(c => c.name.toLowerCase() === companyStr.toLowerCase());
        // Si la ciudad ya existía, filtramos por ciudad ID
        if (cityId) candidates = candidates.filter(c => c.cityId === cityId);

        if (candidates.length > 0) companyId = candidates[0].id;
        else {
            isNewCompany = true;
        }
    }

    // Resuelve Sede
    if (sedeStr) {
        if (!isNewCompany && companyId) {
            const found = State.sedes.find(s => s.name.toLowerCase() === sedeStr.toLowerCase() && s.companyId === companyId);
            if (found) sedeId = found.id;
            else {
                isNewSede = true; // Nueva Sede
            }
        } else if (isNewCompany) {
            isNewSede = true; // Si la empresa es nueva, la sede obligatoriamente también
        }
    }

    // Resuelve Dependencia
    if (depStr) {
        if (!isNewCompany && companyId) {
            let filtered = State.dependencies.filter(d => d.name.toLowerCase() === depStr.toLowerCase() && d.companyId === companyId);
            if (sedeId) {
                filtered = filtered.filter(d => d.sedeId === sedeId || !d.sedeId);
            }
            if (filtered.length > 0) dependencyId = filtered[0].id;
            else {
                isNewDependency = true;
            }
        } else if (isNewCompany) {
            isNewDependency = true;
        }
    }

    // Resuelve Tipo de Equipo
    if (typeStr) {
        const found = State.equipmentTypes.find(t => t.name.toLowerCase() === typeStr.toLowerCase());
        if (found) equipmentTypeId = found.id;
        else errors.push(`El tipo de equipo '${typeStr}' no existe en el sistema`);
    } else {
        errors.push(`Falta Tipo de Equipo`);
    }

    // Resuelve Refrigerante
    if (refrigStr) {
        const found = State.refrigerantTypes.find(t => t.name.toLowerCase() === refrigStr.toLowerCase());
        if (found) refrigerantTypeId = found.id;
    }

    const hasErrors = errors.length > 0;
    const isPendingCreation = isNewCity || isNewCompany || isNewSede || isNewDependency;

    const data: Partial<ParsedEquipment> = !hasErrors ? {
        manualId: manualId || null,
        brand,
        model,
        capacity: capacity || undefined,
        cityId,
        companyId,
        sedeId: sedeId || undefined,
        dependencyId: dependencyId || undefined,
        equipment_type_id: equipmentTypeId,
        typeName: typeStr,
        refrigerant_type_id: refrigerantTypeId,
        category: 'empresa',
        periodicityMonths: 6,
        isNewCity,
        newCityName: isNewCity ? cityStr : undefined,
        isNewCompany,
        newCompanyName: isNewCompany ? companyStr : undefined,
        isNewSede,
        newSedeName: isNewSede ? sedeStr : undefined,
        isNewDependency,
        newDependencyName: isNewDependency ? depStr : undefined,
    } : null;

    return {
        isValid: !hasErrors,
        isPendingCreation: !hasErrors && isPendingCreation,
        rowIndex,
        data,
        errors,
        rawRow: row
    };
}
