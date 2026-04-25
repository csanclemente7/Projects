import Anthropic from '@anthropic-ai/sdk';
import { TOOLS, executeTool } from './tools';
import type { ConversationSession } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ----------------------------------------------------------------
// Prompt del sistema
// ----------------------------------------------------------------

function getSystemPrompt(): string {
  const today = new Date().toISOString().split('T')[0];
  return `Eres el asistente de agendamiento de MACRIS Refrigeración y Climatización.
Ayudas al personal administrativo vía WhatsApp a gestionar órdenes de servicio.

CAPACIDADES:
- Consultar la agenda por fecha o por técnico
- Buscar clientes y sus sedes
- Crear nuevas órdenes de servicio
- Crear nuevos clientes
- Modificar o cancelar órdenes existentes
- Generar resúmenes semanales (tipos de servicio, técnicos activos, estadísticas)

REGLAS OBLIGATORIAS:
1. Siempre responde en español, de forma breve y con emojis para facilitar la lectura
2. USA las herramientas para obtener datos reales — nunca inventes IDs ni nombres
3. ANTES de crear o modificar una orden o cliente, presenta un resumen completo y espera confirmación explícita ("sí", "confirma", "ok")
4. Si hay ambigüedad (varios clientes con nombre similar, varias sedes), presenta opciones numeradas y pregunta cuál
5. Para fechas relativas ("mañana", "el lunes", "la próxima semana"), calcula la fecha real a partir de hoy: ${today}
6. Mantén respuestas bajo 1500 caracteres para WhatsApp
7. NO preguntes por técnico a menos que el usuario lo mencione explícitamente — los técnicos se asignan de forma manual después

MODELO DE DATOS (resumen):
- Clientes: "empresa" (puede tener sedes) o "residencial" (sin sedes)
- Sedes: sucursales de una empresa, se muestran como "Empresa - Sede Nombre"
- Si una empresa tiene sede_id, la ubicación es "NombreEmpresa - NombreSede"
- Técnicos: personal activo en maintenance_users
- Estados de orden: pending (Pendiente), scheduled (Agendada), in_progress (En progreso), completed (Completada), cancelled (Cancelada)
- Tipos de servicio — usa EXACTAMENTE estos valores en order_type:
  • "mantenimiento", "preventivo", "mto preventivo" → "Mantenimiento Preventivo"
  • "correctivo", "mto correctivo", "reparación", "reparacion", "arreglo" → "Mantenimiento Correctivo"
  • "montaje", "instalación", "instalar" → "Montaje/Instalación"
  • "desmonte", "desinstalar" → "Desmonte"
  • "mano de obra" → "Mano de Obra"
  • Cualquier otra cosa (cotizar, revisar, revisión, diagnóstico…) → "Otro - [palabra literal]", ej: "Otro - Cotizar", "Otro - Revisión"
  • Múltiples tipos se separan con " • ": "Mantenimiento Preventivo • Correctivo"
- Ciudad por defecto: si el usuario no menciona ciudad, usa "Buga"

CATEGORÍA DE CLIENTE (empresa vs residencial):
- Si el nombre parece una persona (ej: "Carlos Pérez", "María González López") → residencial
- Si contiene palabras como S.A., SAS, LTDA, Corp, Grupo, Industrias, Comercializadora, Hotel, Clínica, Centro, Almacén → empresa
- Si hay duda, pregunta. Si el usuario ya lo indicó ("es una persona", "es una empresa"), respeta eso sin preguntar

FLUJO DE CREACIÓN DE ORDEN:
1. Busca el cliente (buscar_clientes)
   - Si no existe, ofrece crearlo con crear_cliente
2. Si es empresa, busca sus sedes (obtener_sedes_cliente)
3. Muestra resumen y pide confirmación (NO preguntar técnico)
4. Solo entonces llama crear_orden

FOTOS:
- Si el mensaje contiene [FOTO_ADJUNTA:url], el usuario envió una imagen
- Si mencionó un número de orden o cliente en el mismo mensaje → llama adjuntar_foto directamente
- Si no está claro a qué orden va → pregunta "¿A qué orden adjunto la foto? (número de orden)"
- NO muestres la URL al usuario, solo confirma con "📷 Foto adjuntada a la orden #XXXX"

FLUJO DE CREACIÓN DE CLIENTE:
1. Pide nombre y, si tiene, dirección/ciudad/teléfono
2. Infiere categoría (empresa/residencial) según el nombre — confirma solo si hay duda real
3. Muestra resumen y pide confirmación
4. Llama crear_cliente`;
}

// ----------------------------------------------------------------
// Gestión de conversaciones (en memoria, expira en 2 horas)
// ----------------------------------------------------------------

const conversations = new Map<string, ConversationSession>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

function getSession(phone: string): ConversationSession {
  const now = Date.now();
  let session = conversations.get(phone);

  // Crear nueva sesión si no existe o expiró
  if (!session || now - session.lastActivity > SESSION_TTL_MS) {
    session = { phone, messages: [], lastActivity: now };
    conversations.set(phone, session);
  }

  session.lastActivity = now;
  return session;
}

// Limpiar sesiones expiradas cada 30 minutos
setInterval(() => {
  const now = Date.now();
  for (const [phone, session] of conversations.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      conversations.delete(phone);
    }
  }
}, 30 * 60 * 1000);

// ----------------------------------------------------------------
// Loop principal del agente
// ----------------------------------------------------------------

export async function processMessage(phone: string, userText: string): Promise<string> {
  const session = getSession(phone);

  // Añadir mensaje del usuario al historial
  session.messages.push({ role: 'user', content: userText });

  // Construir messages para la API de Anthropic
  // Limitamos el historial a los últimos 20 mensajes para no agotar tokens
  const apiMessages = session.messages.slice(-20) as Anthropic.MessageParam[];

  try {
    const reply = await runAgentLoop(apiMessages);

    // Guardar respuesta del asistente en el historial
    session.messages.push({ role: 'assistant', content: reply });

    return reply;

  } catch (err: unknown) {
    console.error('[Agent error FULL]', JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
    const msg = err instanceof Error ? err.message : String(err);
    return `⚠️ Ocurrió un error interno: ${msg}\nIntenta de nuevo.`;
  }
}

// ----------------------------------------------------------------
// Loop de herramientas de Claude
// ----------------------------------------------------------------

async function runAgentLoop(messages: Anthropic.MessageParam[]): Promise<string> {
  const MAX_ITERATIONS = 8; // Evitar bucles infinitos
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     getSystemPrompt(),
      tools:      TOOLS,
      messages,
    });

    // Agregar respuesta del asistente al historial local del loop
    messages.push({ role: 'assistant', content: response.content });

    // Si terminó de hablar → devolver texto
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
      return textBlock?.text || '✅';
    }

    // Si quiere usar herramientas → ejecutar y continuar
    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`[Tool →] ${block.name}`, JSON.stringify(block.input).slice(0, 200));

        const result = await executeTool(
          block.name,
          block.input as Record<string, unknown>
        );

        console.log(`[Tool ←] ${block.name}`, JSON.stringify(result).slice(0, 300));

        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify(result),
        });
      }

      // Devolver resultados al agente
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Cualquier otro stop_reason (max_tokens, etc.)
    const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
    return textBlock?.text || '⚠️ Respuesta incompleta, intenta reformular tu consulta.';
  }

  return '⚠️ La consulta fue muy compleja. Intenta dividirla en pasos más simples.';
}