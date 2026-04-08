
import { GoogleGenAI, Type } from "@google/genai";
import * as State from './state';
import type { ChatHistoryEntry } from './state';
import type { WidgetConfig } from './types';

export interface AiResult {
    isRequestApproved?: boolean;
    analysis?: string;
    userMessage?: string;
    appliedFilters?: {
        dateStart?: string;
        dateEnd?: string;
        companyName?: string;
        techName?: string;
        equipmentType?: string;
        paidStatus?: "pagado" | "pendiente" | "todos";
    };
    requiresClarification?: boolean;
    clarificationOptions?: string[];
    action?: "none" | "filter" | "download_pdf" | "download_excel" | "build_dashboard";
    dashboardConfig?: {
        mode: "replace" | "append";
        widgets: WidgetConfig[];
    }
}

const filterSchema = {
    type: Type.OBJECT,
    properties: {
        isRequestApproved: { type: Type.BOOLEAN, description: "True si el usuario confirmó explícitamente una acción después de ver los resultados." },
        analysis: { type: Type.STRING, description: "Razonamiento interno sobre los filtros y posibles duplicados encontrados." },
        userMessage: { type: Type.STRING, description: "Respuesta clara y empática para el administrador." },
        appliedFilters: {
            type: Type.OBJECT,
            properties: {
                dateStart: { type: Type.STRING },
                dateEnd: { type: Type.STRING },
                companyName: { type: Type.STRING },
                techName: { type: Type.STRING },
                equipmentType: { type: Type.STRING },
                paidStatus: { type: Type.STRING, enum: ["pagado", "pendiente", "todos"] }
            }
        },
        requiresClarification: { type: Type.BOOLEAN, description: "True si existen múltiples empresas con nombres similares o si el usuario pide un término genérico como 'Comfandi' que tiene muchas sedes." },
        clarificationOptions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: "Lista de nombres exactos de sedes o empresas que coinciden fonéticamente o por subcadena."
        },
        action: { type: Type.STRING, enum: ["none", "filter", "download_pdf", "download_excel", "build_dashboard"] },
        dashboardConfig: {
            type: Type.OBJECT,
            description: "Obligatorio si action=build_dashboard. Define cómo reconfigurar la vista de Panel de Rendimiento.",
            properties: {
                mode: { type: Type.STRING, enum: ["replace", "append"], description: "replace para recrear un panel entero, append para añadir gráficas extra al panel actual." },
                widgets: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            title: { type: Type.STRING, description: "Título claro y conciso de la métrica." },
                            type: { type: Type.STRING, enum: ["kpi", "donut", "bar", "line"] },
                            metric: { type: Type.STRING, enum: ["count", "winrate", "utility"] },
                            dimension: { type: Type.STRING, enum: ["none", "date", "workerName", "serviceType"] },
                            size: { type: Type.STRING, enum: ["col-100", "col-50", "col-33", "col-25"] }
                        }
                    }
                }
            }
        }
    }
};

/**
 * Procesa una solicitud de lenguaje natural utilizando Gemini para filtrar reportes.
 */
export async function processAiRequest(userPrompt: string, history: ChatHistoryEntry[]): Promise<AiResult> {
    const apiKey = (globalThis as any).process?.env?.API_KEY;
    
    if (!apiKey) {
        throw new Error("API_KEY no configurada. Revisa src/config.ts");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // Enriquecemos el contexto con nombres históricos precargados para máxima precisión
    const dbContext = {
        empresasDisponibles: Array.from(new Set([
            ...State.companies.map(c => c.name),
            ...State.historicalCompanyNames
        ])),
        tecnicosDisponibles: State.users.filter(u => u.role === 'worker').map(u => u.name),
        tiposEquipo: State.equipmentTypes.map(t => t.name),
        fechaActual: new Date().toISOString().split('T')[0]
    };

    const systemInstruction = `
    Eres Macris AI, el analista de Macris Ingeniería.
    Tu objetivo es encontrar reportes con precisión de cirujano, ignorando errores ortográficos comunes.
    
    REGLAS DE INTELIGENCIA SUPERIOR:
    1. FONÉTICA RADICAL: Entiende que "CONFANDI", "COMFANDI" y "CON FANDI" son siempre lo mismo (COMFANDI).
    2. DEPURACIÓN ACTIVA: Si el usuario pide "todas las de confandi", DEBES activar 'requiresClarification: true' y mostrar la lista de TODAS las sedes reales (Limonar, Tulua, Palmira, etc.) para que el usuario las vea y confirme. No filtres a ciegas.
    3. DETECCIÓN DE HISTORIAL: Usa 'empresasDisponibles' para mapear términos. Por ejemplo, "tulua" debería coincidir con "CONFANDI TULUA".
    4. EMPATÍA: Responde de forma amable indicando cuántas sedes o coincidencias has encontrado.
    5. CONTROL DE DASHBOARD: Si el usuario te pide armar, generar o añadir gráficas a su panel, debes usar action='build_dashboard'. 
       - Si dice "áramame un dashboard" -> mode="replace". Si dice "añade a mi dashboard" -> mode="append".
       - Mapea correctamente las métricas: 'count' (cantidad), 'winrate' (efectividad/pagos), 'utility' (dinero).
       - Mapea las dimensiones: 'date' (por fecha), 'workerName' (por técnico), 'serviceType' (por tipo), o 'none' (para KPIs globales).
       - Usa sizes: 'col-25' para KPIs, 'col-50' para donas/barras pequeñas, 'col-100' para líneas de tiempo.
    Contexto de Base de Datos Real (Histórico Incluido):
    - Empresas/Sedes: ${dbContext.empresasDisponibles.join(', ')}
    - Técnicos: ${dbContext.tecnicosDisponibles.join(', ')}
    - Tipos de Equipo: ${dbContext.tiposEquipo.join(', ')}
    - Fecha hoy: ${dbContext.fechaActual} (YYYY-MM-DD)
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [...history, { role: 'user', parts: [{ text: userPrompt }] }],
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: filterSchema
        }
    });

    return JSON.parse(response.text || '{}') as AiResult;
}

export async function runAiReconciliation() {
    const modal = document.getElementById('ai-reconciliation-modal');
    if (modal) modal.style.display = 'flex';
}

export interface DigitizedReportData {
    workerName: string;
    companyName: string;
    dependency: string;
    city: string;
    serviceType: string;
    observations: string;
    equipmentModel: string;
    equipmentBrand: string;
    equipmentType: string;
    capacity: string;
    hasSignature: boolean;
    signatureBox?: number[];
    croppedSignatureBase64?: string;
    pressure: string;
    amperage: string;
}

const digitizedReportSchema = {
    type: Type.ARRAY,
    description: "Extrae TODOS los reportes individuales contenidos en el documento. Si es un PDF con varias páginas o si hay múltiples facturas/reportes, extrae cada uno y devuélvelos como elementos independientes de este arreglo.",
    items: {
        type: Type.OBJECT,
        properties: {
            workerName: { type: Type.STRING, description: "Nombre del técnico que realiza el reporte." },
            companyName: { type: Type.STRING, description: "Empresa o Cliente que recibe el servicio." },
            city: { type: Type.STRING, description: "Ciudad donde se realiza el servicio." },
            serviceType: { type: Type.STRING, description: "Tipo de servicio prestado (ej. Mantenimiento Preventivo, Correctivo)." },
            observations: { type: Type.STRING, description: "Observaciones del reporte." },
            equipmentModel: { type: Type.STRING, description: "Modelo del equipo." },
            equipmentBrand: { type: Type.STRING, description: "Marca del equipo." },
            equipmentType: { type: Type.STRING, description: "Tipo de equipo (ej. Aire Acondicionado, Nevera)." },
            capacity: { type: Type.STRING, description: "Capacidad del equipo (ej. 12000, 24000). Extrae solo el número que indica la capacidad BTU o similar que tenga el reporte." },
            dependency: { type: Type.STRING, description: "Sede o Dependencia donde se encuentra el equipo." },
            hasSignature: { type: Type.BOOLEAN, description: "Verdadero si hay firma manuscrita dentro del recuadro 'CLIENTE Y/O ENCARGADO'. Falso si ese recuadro está vacío." },
            signatureBox: { 
                type: Type.ARRAY, 
                items: { type: Type.INTEGER }, 
                description: "Coordenadas delimitadoras de la firma si existe, en formato [ymin, xmin, ymax, xmax] normalizadas de 0 a 1000." 
            },
            pressure: { type: Type.STRING, description: "Valor de presión registrada." },
            amperage: { type: Type.STRING, description: "Valor de amperaje registrado." }
        },
        required: ["workerName", "companyName", "dependency", "city", "serviceType", "observations", "equipmentModel", "equipmentBrand", "equipmentType", "capacity", "hasSignature", "pressure", "amperage"]
    }
};

/**
 * Procesa una imagen de un reporte usando Gemini para extraer los datos estructurados.
 */
export async function processImageForReport(base64Image: string, mimeType: string): Promise<DigitizedReportData[]> {
    const apiKey = (globalThis as any).process?.env?.API_KEY;
    
    if (!apiKey) {
        throw new Error("API_KEY no configurada. Revisa src/config.ts");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const tecnicosDisponibles = State.users.map(u => u.name);

    const systemInstruction = `
    Eres un asistente de IA avanzado diseñado para extraer datos de reportes físicos impresos o escritos a mano de servicios técnicos.
    El usuario puede proporcionarte una imagen o un archivo PDF de múltiples páginas.
    Debes inspeccionar cuidadosamente todo el documento y extraer TODOS los reportes individuales que encuentres.
    Para cada reporte, extrae los valores para los campos definidos.
    Si un campo no se puede encontrar o está vacío, devuelve estrictamente el valor "N/A" (excepto para booleanos).

    REGLA CRÍTICA PARA 'workerName':
    Compara el nombre del técnico extraído con la siguiente base de datos de empleados registrados:
    ${JSON.stringify(tecnicosDisponibles)}
    - Si encuentras similitud fonética o visual, devuelve EXACTAMENTE el string que se encuentra en la base de datos (con su Nombre y Apellido correspondiente).
    - Si no existe parecido alguno, devuelve el texto puro que leíste o "N/A".
    REGLA PARA FIRMA (CLIENTE Y/O ENCARGADO):
    La firma del cliente se encuentra EXCLUSIVAMENTE en el recuadro inferior que dice "CLIENTE Y/O ENCARGADO".
    NO incluyas texto, nombres ni firmas que se encuentren en el recuadro de "TECNICO".
    - Si el recuadro de "CLIENTE Y/O ENCARGADO" contiene tinta manuscrita o garabatos, devuelve las coordenadas delimitadoras exactas de esa firma usando 'signatureBox' con formato [ymin, xmin, ymax, xmax] normalizadas de 0 a 1000.
    - Si el recuadro "CLIENTE Y/O ENCARGADO" está completamente vacío (sin contar el texto impreso original), omite este campo y "hasSignature" debe ser false.
    `;

    // Remove the data URI prefix if it exists to get raw base64
    const base64Data = base64Image.split(',')[1] || base64Image;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
            role: 'user',
            parts: [
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: mimeType
                    }
                },
                { text: "Extraer la información de este reporte y devolverla formateada." }
            ]
        }],
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: digitizedReportSchema
        }
    });

    let parsed;
    try {
        parsed = JSON.parse(response.text || '[]');
    } catch {
        parsed = [];
    }
    
    // Fallback: Si Gemini nos devolvió un solo objeto en vez de un array (a veces ignora el esquema raíz)
    if (!Array.isArray(parsed)) {
        parsed = [parsed];
    }
    
    return parsed as DigitizedReportData[];
}
