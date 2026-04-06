
import { GoogleGenAI, Type } from "@google/genai";
import * as State from './state';
import type { ChatHistoryEntry } from './state';

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
    action?: "none" | "filter" | "download_pdf" | "download_excel";
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
        action: { type: Type.STRING, enum: ["none", "filter", "download_pdf", "download_excel"] }
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
