import * as XLSX from 'xlsx';
import * as State from './state';
import { AdminScheduleRow, Equipment } from './types';

export type ParsedEquipment = Omit<Equipment, 'id' | 'timestamp' | 'created_at' | 'equipment_type_id' | 'refrigerant_type_id'> & {
    equipment_type_id: string | null;
    refrigerant_type_id: string | null;
    dependencyName?: string;
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

export function exportScheduleToExcel(
    rows: AdminScheduleRow[],
    options: { companyTitle: string; sedeTitle: string }
) {
    const generatedAt = new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
    }).format(new Date());

    const worksheetData: (string | number)[][] = [
        ['📅 CRONOGRAMA DE MANTENIMIENTO'],
        [],
        ['🏢 Empresa', options.companyTitle],
        ['📍 Sede', options.sedeTitle],
        ['🕒 Generado', generatedAt],
        ['📊 Registros', rows.length],
        [],
        ['🆔 ID Manual', '🏷 Marca', '🧊 Tipo de equipo', '📍 Dependencia', 'Estado'],
        ...rows.map(row => [
            row.equipment.manualId || 'N/A',
            row.equipment.brand || 'N/A',
            row.equipment.typeName || row.equipment.type || 'N/A',
            row.dependencyName || 'N/A',
            row.isPending ? '⚠️ Pendiente' : '🟢 OK',
        ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    ];
    worksheet['!cols'] = [
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
        { wch: 36 },
        { wch: 16 },
    ];
    worksheet['!rows'] = [
        { hpt: 28 },
        {},
        { hpt: 20 },
        { hpt: 20 },
        { hpt: 20 },
        { hpt: 20 },
        {},
        { hpt: 24 },
    ];
    worksheet['!autofilter'] = { ref: 'A8:E8' };

    const applyCellStyle = (address: string, style: Record<string, any>) => {
        const cell = worksheet[address];
        if (cell) {
            (cell as any).s = style;
        }
    };

    const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '00A8C5' } },
        alignment: { horizontal: 'center', vertical: 'center' },
    };
    const labelStyle = {
        font: { bold: true, color: { rgb: '00A8C5' } },
        fill: { fgColor: { rgb: 'EAFBFF' } },
    };
    const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '1F4E78' } },
        alignment: { horizontal: 'center', vertical: 'center' },
    };
    const pendingStyle = {
        font: { bold: true, color: { rgb: '9C6500' } },
        fill: { fgColor: { rgb: 'FFF2CC' } },
    };
    const okStyle = {
        font: { bold: true, color: { rgb: '006100' } },
        fill: { fgColor: { rgb: 'E2F0D9' } },
    };

    applyCellStyle('A1', titleStyle);
    ['A3', 'A4', 'A5', 'A6', 'B3', 'B4', 'B5', 'B6'].forEach(address => applyCellStyle(address, labelStyle));
    ['A8', 'B8', 'C8', 'D8', 'E8'].forEach(address => applyCellStyle(address, headerStyle));

    rows.forEach((row, index) => {
        const excelRow = index + 9;
        applyCellStyle(`E${excelRow}`, row.isPending ? pendingStyle : okStyle);
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cronograma');

    const safeCompany = options.companyTitle.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    const safeSede = options.sedeTitle.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
    XLSX.writeFile(workbook, `cronograma_${safeCompany}_${safeSede}.xlsx`);
}

// Limpia strings de Excel
const cleanString = (val: any) => val ? String(val).trim() : '';
const cleanEntityLabel = (val: any) => cleanString(val).replace(/\s+/g, ' ');
const normalizeEntityName = (val: string) => cleanEntityLabel(val)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const dependencyMatchesLocation = (
    dependency: { companyId: string; sedeId?: string | null },
    companyId: string,
    sedeId?: string | null
) => {
    if (!companyId) return false;
    if (sedeId) {
        return dependency.sedeId === sedeId || dependency.companyId === sedeId;
    }
    return dependency.companyId === companyId && !dependency.sedeId;
};

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
    const normalizeHeader = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');
    const getCol = (possibleNames: string[]) => {
        const normalizedNames = possibleNames.map(normalizeHeader);
        const exactKey = keys.find(k => normalizedNames.includes(normalizeHeader(k)));
        const fallbackKey = keys.find(k => normalizedNames.some(p => normalizeHeader(k).includes(p)));
        const key = exactKey || fallbackKey;
        return key ? cleanString(row[key]) : '';
    };

    const manualId = getCol(['id manual', 'placa', 'id']);
    const brand = getCol(['marca']);
    const model = getCol(['modelo', 'model']);
    const capacity = getCol(['capacidad', 'btu', 'tr ']);
    const cityStr = cleanEntityLabel(getCol(['ciudad', 'city']));
    const companyManualId = getCol(['empresa id', 'id empresa', 'id de empresa', 'id cliente', 'id de cliente', 'cliente id', 'empresaid', 'empresa_id', 'client id']);
    const companyStr = cleanEntityLabel(getCol(['empresa', 'cliente comercial', 'company']));
    const sedeInputId = getCol(['sede id', 'id sede', 'id de sede', 'idsede', 'sede_id', 'branch id']);
    const sedeStr = cleanEntityLabel(getCol(['sede']));
    const depStr = cleanEntityLabel(getCol(['dependencia', 'dependecia', 'dep', 'area', 'área', 'ubicacion', 'ubicación']));
    const typeStr = cleanEntityLabel(getCol(['tipo de equipo', 'tipo equipo', 'tipo']));
    const refrigStr = cleanEntityLabel(getCol(['refrigerante', 'gas']));
    const periodicityRaw = getCol(['periodicidad', 'periodicity', 'periocidad']);

    if (!brand) errors.push('Falta Marca');
    if (!model) errors.push('Falta Modelo');
    if (!companyManualId && !companyStr) errors.push('Falta Empresa ID o Empresa');
    if (!depStr) errors.push('Falta Dependencia');

    if (manualId) {
        if (seenManualIds.has(manualId.toLowerCase())) {
            errors.push(`ID Manual duplicado en el mismo Excel: ${manualId}`);
        } else {
            const dbExists = State.equipmentList.find(e => e.manualId?.toLowerCase() === manualId.toLowerCase());
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
    if (companyManualId) {
        const foundByManualId = State.companies.find(c => c.manualId?.toLowerCase() === companyManualId.toLowerCase());
        if (foundByManualId) {
            companyId = foundByManualId.id;
        } else {
            errors.push(`La Empresa ID '${companyManualId}' no existe en Cotizaciones`);
        }
    } else if (companyStr) {
        const exactNameMatches = State.companies.filter(c => c.name.toLowerCase() === companyStr.toLowerCase());
        let candidates = exactNameMatches;

        if (cityId) {
            const cityMatches = exactNameMatches.filter(c => c.cityId === cityId);
            if (cityMatches.length > 0) {
                candidates = cityMatches;
            }
        }

        if (candidates.length === 1) {
            companyId = candidates[0].id;
        } else if (candidates.length > 1) {
            errors.push(`La empresa '${companyStr}' es ambigua. Use Empresa ID.`);
        } else if (exactNameMatches.length > 0) {
            errors.push(`La empresa '${companyStr}' existe, pero no coincide claramente con la ciudad. Use Empresa ID.`);
        } else {
            isNewCompany = true;
        }
    }

    const existingCompanySedes = companyId
        ? State.sedes.filter(s => s.companyId === companyId && s.id !== companyId)
        : [];
    const companyHasExistingSedes = existingCompanySedes.length > 0;
    const fallbackSedeIdFromSedeColumn = (!sedeInputId && sedeStr && companyHasExistingSedes)
        ? (existingCompanySedes.find(s => s.id.toLowerCase() === sedeStr.toLowerCase())?.id || '')
        : '';
    const resolvedSedeInputId = sedeInputId || fallbackSedeIdFromSedeColumn;

    // Resuelve Sede
    if (!isNewCompany && companyId) {
        if (companyHasExistingSedes) {
            if (!resolvedSedeInputId) {
                errors.push('La empresa tiene sedes registradas. Debe usar Sede ID en el Excel.');
            } else {
                const foundById = existingCompanySedes.find(s => s.id.toLowerCase() === resolvedSedeInputId.toLowerCase());
                if (!foundById) {
                    const belongsToAnotherCompany = State.sedes.find(s => s.id.toLowerCase() === resolvedSedeInputId.toLowerCase());
                    if (belongsToAnotherCompany) {
                        errors.push(`La Sede ID '${resolvedSedeInputId}' no pertenece a la empresa seleccionada.`);
                    } else {
                        errors.push(`La Sede ID '${resolvedSedeInputId}' no existe para la empresa seleccionada.`);
                    }
                } else {
                    sedeId = foundById.id;
                    if (foundById.cityId) {
                        if (cityId && cityId !== foundById.cityId) {
                            const expectedCity = State.cities.find(c => c.id === foundById.cityId)?.name || 'la ciudad asociada a la sede';
                            errors.push(`La ciudad '${cityStr}' no coincide con la Sede ID '${resolvedSedeInputId}'. Debe ser '${expectedCity}'.`);
                        } else {
                            cityId = foundById.cityId;
                            isNewCity = false;
                        }
                    }
                }
            }
        } else if (sedeInputId) {
            errors.push('Esta empresa no tiene sedes registradas. Use solo Empresa ID.');
        } else if (sedeStr) {
            const found = State.sedes.find(s => s.name.toLowerCase() === sedeStr.toLowerCase() && s.companyId === companyId && s.id !== companyId);
            if (found) {
                sedeId = found.id;
                if (found.cityId) {
                    cityId = found.cityId;
                    isNewCity = false;
                }
            }
        }
    } else if (isNewCompany && sedeStr) {
        isNewSede = true; // Si la empresa es nueva, la sede puede crearse por nombre
    }

    if (!cityId) {
        if (cityStr) {
            isNewCity = true;
        } else {
            errors.push('Falta Ciudad o una Sede ID valida que permita determinarla.');
        }
    }

    // Resuelve Dependencia
    if (depStr) {
        if (!isNewCompany && companyId) {
            if (companyHasExistingSedes) {
                if (!sedeId) {
                    errors.push('No se puede resolver la dependencia sin una Sede ID valida para esta empresa.');
                } else {
                    const normalizedDepName = normalizeEntityName(depStr);
                    const filtered = State.dependencies.filter(
                        d => normalizeEntityName(d.name) === normalizedDepName &&
                             dependencyMatchesLocation(d, companyId, sedeId)
                    );
                    if (filtered.length > 0) dependencyId = filtered[0].id;
                    else isNewDependency = true;
                }
            } else {
                const normalizedDepName = normalizeEntityName(depStr);
                const filtered = State.dependencies.filter(
                    d => normalizeEntityName(d.name) === normalizedDepName &&
                         dependencyMatchesLocation(d, companyId, null)
                );
                if (filtered.length > 0) dependencyId = filtered[0].id;
                else isNewDependency = true;
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

    if (!depStr) {
        isNewDependency = false;
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
        dependencyName: depStr || undefined,
        equipment_type_id: equipmentTypeId,
        typeName: typeStr,
        refrigerant_type_id: refrigerantTypeId,
        category: 'empresa',
        periodicityMonths: periodicityRaw ? Math.max(1, parseInt(periodicityRaw, 10) || 6) : 6,
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
