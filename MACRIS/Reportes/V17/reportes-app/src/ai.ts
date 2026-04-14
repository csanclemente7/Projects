import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
// FIX: Added showAiReconciliationResults to imports
import { showAppNotification, populateDropdown, showLoader, hideLoader, showAiReconciliationResults } from './ui';
import * as State from './state';
import * as D from './dom';
import { API_KEY } from './config';

// Get AI Client instance lazily to allow dynamic key loading from DB
function getAiClient() {
    // If settings aren't loaded yet, State.appSettings might be undefined.
    const activeKey = (State.appSettings && State.appSettings.gemini_api_key) || API_KEY;
    if (!activeKey) {
        throw new Error("Clave de API de Gemini no configurada. Añádela en la tabla app_settings de Supabase bajo la clave 'gemini_api_key'.");
    }
    return new GoogleGenAI({ apiKey: activeKey });
}


// Define the expected JSON response schema from the AI for plate scanning.
const plateResponseSchema = {
    type: Type.OBJECT,
    properties: {
        model: { type: Type.STRING, description: 'El modelo exacto del equipo. Ejemplo: AR12TRHQBURN, EWF120E' },
        brand: { type: Type.STRING, description: 'La marca del equipo. Ejemplo: Samsung, Mirage' },
        type: { 
            type: Type.STRING, 
            description: 'El tipo de equipo. DEBE ser uno de: "Mini split", "Cassette", "Central", "Piso techo", "Otro". Infiere el tipo usando la marca (ej. "Samsung", "Mirage" son "Mini split") y el texto (ej. "SPLIT").' 
        },
        refrigerant: { type: Type.STRING, description: 'El tipo de refrigerante. Ejemplo: R410A, R32' },
        capacity: { 
            type: Type.STRING, 
            description: 'La capacidad de enfriamiento SIEMPRE en BTU. Si la placa lo da en Watts (W), conviértelo a BTU (W * 3.412) y formatea como "XXXXX BTU". Ejemplo: 3224W se convierte a "11000 BTU".' 
        },
        pressure: { 
            type: Type.STRING, 
            description: 'La presión de operación del equipo, SIEMPRE en PSI. Si la encuentras en otras unidades como MPa o kg/cm², debes convertirla a PSI. El formato final si encuentras baja y alta debe ser "BAJA/ALTA PSI". Ejemplo: "116/363 PSI".' 
        },
        amperage: { type: Type.STRING, description: 'El amperaje de operación (Amps, A) del equipo si está en la placa. Ejemplo: "5.2 A"' },
    },
};

/**
 * Sends a base64 image to the Gemini API to extract equipment data.
 * @param base64Image The base64 encoded image of the equipment plate.
 */
export async function extractDataFromImage(base64Image: string) {
    
    const imagePart = {
        inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image.split(',')[1], // Remove the "data:image/jpeg;base64," prefix
        },
    };

    const equipmentTypesList = State.equipmentTypes.map(t => `"${t.name}"`).join(', ');
    const refrigerantTypesList = State.refrigerantTypes.map(r => `"${r.name}"`).join(', ');

    const textPart = {
        text: `Analiza la imagen de la placa de datos de un aire acondicionado. Tu objetivo es ser extremadamente preciso. Extrae el modelo, la marca, el tipo de equipo, el refrigerante, la capacidad, el amperaje y la presión de operación (si están disponibles).
Sigue estas REGLAS ESTRICTAMENTE:

1.  **Capacidad (capacity)**:
    *   La capacidad DEBE devolverse en BTU.
    *   Si la placa muestra la capacidad en Watts (W), DEBES convertirla a BTU usando la fórmula: \`BTU = Watts * 3.412\`.
    *   Redondea el resultado al número entero más cercano.
    *   Formatea la respuesta como un string que incluya el número y "BTU". Ejemplo: "3224W" se convierte en "11000 BTU".

2.  **Tipo de Equipo (type)**:
    *   Elige UN VALOR EXACTO Y TEXTUAL de esta lista permitida: [${equipmentTypesList}].
    *   No inventes ningún tipo de equipo ni cambies una sola letra. Debe ser uno de la lista.
    *   Infiere el tipo usando pistas: Equipos "Samsung", "Mirage" suelen ser "Mini split". Modelos que empiezan con "AR" son "Mini split". Si ves la palabra "SPLIT", usa "Mini split".
    *   Si no estás seguro, usa "Otro".

3.  **Refrigerante (refrigerant)**:
    *   Extrae el tipo de refrigerante (ej. R410A, R22).
    *   DEBES elegir UN VALOR EXACTO de esta lista permitida: [${refrigerantTypesList}].
    *   Si en la placa dice, por ejemplo, "R-410A" pero en tu lista estricta dice "R410a", usa la versión de la lista estricta. Nunca inventes valores fuera de esta lista.

4.  **Presión (pressure)**:
    *   Busca valores de presión de baja (low/succión) y alta (high/descarga). Busca etiquetas como "Pressure (H/L)", "PRESSURE L/H", "HIGH/LOW", "DIS./SUC.".
    *   **LA RESPUESTA FINAL DEBE ESTAR EN PSI.**
    *   Si la presión está en otra unidad, **DEBES CONVERTIRLA A PSI** usando estas conversiones (redondea el resultado a entero):
        *   \`1 MPa = 145 PSI\`
        *   \`1 kg/cm² = 14.2 PSI\`
        *   \`1 bar = 14.5 PSI\`
    *   **Ejemplo de conversión**: Si encuentras "Low: 0.8 MPa" y "High: 2.5 MPa", calcula \`0.8 * 145 = 116\` y \`2.5 * 145 = 362.5\` (redondea a 363). La respuesta final debe ser "116/363 PSI".

5.  **Formato de Respuesta**: Responde ÚNICAMENTE con un objeto JSON que siga el esquema proporcionado, sin texto adicional, explicaciones o markdown.`,
    };

    try {
        const ai = getAiClient();
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: plateResponseSchema,
            }
        });

        const jsonStr = response.text.trim();
        const data = JSON.parse(jsonStr);
        
        console.log("Datos extraídos por la IA:", data);

        // Determine which form is active and get its elements
        const isEquipmentForm = State.aiScanTargetForm === 'equipment';
        const formRoot = isEquipmentForm ? D.entityFormFieldsContainer : document;

        const modelInput = formRoot.querySelector(isEquipmentForm ? '#model' : '#report-equipment-model') as HTMLInputElement | null;
        const brandInput = formRoot.querySelector(isEquipmentForm ? '#brand' : '#report-equipment-brand') as HTMLInputElement | null;
        const capacityInput = formRoot.querySelector(isEquipmentForm ? '#capacity' : '#report-equipment-capacity') as HTMLInputElement | null;
        const pressureInput = isEquipmentForm ? null : D.reportPressureInput;
        const amperageInput = isEquipmentForm ? null : D.reportAmperageInput;
        const refrigerantSelect = formRoot.querySelector(isEquipmentForm ? '#refrigerant_type_id' : '#report-equipment-refrigerant') as HTMLSelectElement | null;
        const typeSelect = formRoot.querySelector(isEquipmentForm ? '#equipment_type_id' : '#report-equipment-type') as HTMLSelectElement | null;

        // Populate the form fields with the extracted data
        if (modelInput && data.model) modelInput.value = data.model;
        if (brandInput && data.brand) brandInput.value = data.brand;
        if (capacityInput && data.capacity) capacityInput.value = data.capacity;
        if (pressureInput && data.pressure) pressureInput.value = data.pressure;
        if (amperageInput && data.amperage) amperageInput.value = data.amperage;

        if (refrigerantSelect && data.refrigerant) {
            const foundRefrigerant = State.refrigerantTypes.find(rt => rt.name.toLowerCase() === data.refrigerant.toLowerCase());
            if (foundRefrigerant) {
                populateDropdown(refrigerantSelect, State.refrigerantTypes, foundRefrigerant.id);
            } else {
                 console.warn(`Refrigerant '${data.refrigerant}' from AI not in DB.`);
                 showAppNotification(`Refrigerante '${data.refrigerant}' no encontrado. Por favor, selecciónelo o agréguelo.`, 'warning', 5000);
                 populateDropdown(refrigerantSelect, State.refrigerantTypes, undefined);
            }
        }

        if (typeSelect && data.type) {
            const foundType = State.equipmentTypes.find(et => et.name.toLowerCase() === data.type.toLowerCase());
            if (foundType) {
                populateDropdown(typeSelect, State.equipmentTypes, foundType.id);
            } else {
                console.warn(`Equipment type '${data.type}' from AI not in DB.`);
                showAppNotification(`Tipo de equipo '${data.type}' no encontrado. Por favor, selecciónelo o agréguelo.`, 'warning', 5000);
                 populateDropdown(typeSelect, State.equipmentTypes);
            }
        }
        
        showAppNotification('Formulario autocompletado con datos de la IA.', 'success');

    } catch (error: any) {
        console.error("Error processing image with AI:", error);
        showAppNotification(`Error de IA: ${error.message || 'No se pudo procesar la imagen.'}`, 'error');
    } finally {
        State.setAiScanTargetForm(null); // Reset target after use
    }
}

const reconciliationResponseSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            orderId: { type: Type.STRING, description: "El ID de la orden de servicio que coincide." },
            reportId: { type: Type.STRING, description: "El ID del reporte manual que coincide." },
            confidence: { type: Type.STRING, description: "Nivel de confianza de la coincidencia. Debe ser 'alta', 'media', o 'baja'." },
            reason: { type: Type.STRING, description: "Una breve explicación de por qué se considera una coincidencia." }
        },
        required: ["orderId", "reportId", "confidence", "reason"]
    }
};

export async function runAiReconciliation() {
    showLoader("Analizando órdenes y reportes...");

    try {
        const pendingOrders = State.allServiceOrders
            .filter(o => o.status === 'pending' || o.status === 'en_progreso')
            .map(o => ({
                id: o.id,
                manualId: o.manualId,
                clientName: o.clientDetails?.name,
                clientAddress: o.clientDetails?.address,
                serviceDate: o.service_date,
                assignedTechnicianNames: o.assignedTechnicians?.map(t => t.name).join(', ')
            }));
        
        const manualReports = State.reports
            .filter(r => !r.orderId)
            .map(r => ({
                id: r.id,
                clientName: r.equipmentSnapshot.category === 'residencial' ? r.equipmentSnapshot.client_name : r.equipmentSnapshot.companyName,
                address: r.equipmentSnapshot.address,
                timestamp: r.timestamp,
                workerName: r.workerName
            }));
            
        if (pendingOrders.length === 0 || manualReports.length === 0) {
            showAppNotification("No hay órdenes pendientes o reportes manuales para conciliar.", 'info');
            return;
        }

        const prompt = `
            Eres un asistente administrativo para una empresa de mantenimiento. Tu tarea es encontrar coincidencias entre órdenes de servicio pendientes y reportes de mantenimiento manuales que no han sido vinculados.

            Aquí tienes dos listas de datos en formato JSON:
            
            ÓRDENES PENDIENTES:
            ${JSON.stringify(pendingOrders, null, 2)}
            
            REPORTES MANUALES SIN VINCULAR:
            ${JSON.stringify(manualReports, null, 2)}

            REGLAS DE ANÁLISIS:
            1. Compara cada reporte con cada orden.
            2. Una coincidencia es probable si el nombre del cliente ('clientName') es muy similar. Tolera pequeñas diferencias y abreviaturas (ej. 'Constructora S.A.S' vs 'Constructora').
            3. La fecha del reporte ('timestamp') debe ser igual o unos pocos días después de la fecha de la orden ('serviceDate').
            4. Si el nombre del técnico del reporte ('workerName') aparece en la lista de técnicos asignados de la orden ('assignedTechnicianNames'), la confianza es MUY ALTA.
            5. La dirección ('clientAddress' y 'address') también es un buen indicador si está presente y es similar.
            6. Asigna un nivel de confianza ('alta', 'media', 'baja') a cada posible coincidencia.
            7. Proporciona una razón breve y clara para cada coincidencia.

            Devuelve tu respuesta como un array de objetos JSON, siguiendo el esquema proporcionado. No incluyas texto adicional, solo el JSON.
        `;

        const ai = getAiClient();
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: reconciliationResponseSchema,
            }
        });

        const jsonStr = response.text.trim();
        const matches = JSON.parse(jsonStr);
        
        console.log("Coincidencias encontradas por IA:", matches);
        
        if (matches.length === 0) {
            showAppNotification("La IA no encontró coincidencias claras.", 'info');
        } else {
            showAiReconciliationResults(matches);
        }

    } catch (error: any) {
        console.error("Error en la conciliación con IA:", error);
        showAppNotification(`Error de IA: ${error.message || 'No se pudo completar el análisis.'}`, 'error');
    } finally {
        hideLoader();
    }
}
