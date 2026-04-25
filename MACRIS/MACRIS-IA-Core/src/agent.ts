import Anthropic from '@anthropic-ai/sdk';
import { TOOLS, executeTool } from './tools';
import { supabaseOrders, supabaseQuotes } from './supabase';
import type { ConversationSession, ConversationContentBlock } from './types';

// ----------------------------------------------------------------
// Proveedor de IA
// Hoy: Claude Haiku (Anthropic API)
// Futuro: definir AI_PROVIDER=ollama en .env y crear providers/ollama.ts
// ----------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ----------------------------------------------------------------
// Prompt del sistema
// ----------------------------------------------------------------

function getSystemPrompt(): string {
  const now      = new Date();
  const today    = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  const hora     = now.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
  const diasES   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  // Calcular día de la semana correctamente usando fecha Colombia
  const [y, m, d] = today.split('-').map(Number);
  const dow       = new Date(y, m - 1, d).getDay(); // 0=domingo … 6=sábado
  const diaSemana = diasES[dow];

  // Pre-calcular fechas relativas para evitar errores del modelo
  function nextWeekday(target: number): string {
    const diff = ((target - dow) + 7) % 7 || 7;
    const nd   = new Date(y, m - 1, d + diff);
    return nd.toLocaleDateString('en-CA');
  }
  const manana      = new Date(y, m - 1, d + 1).toLocaleDateString('en-CA');
  const fechasDias  = diasES.map((n, i) => `  - "${n}" → ${nextWeekday(i)}`).join('\n');

  return `Eres el asistente operativo interno de MACRIS Refrigeración y Climatización.
Ayudas al personal administrativo a gestionar órdenes de servicio, agenda, cotizaciones e información de clientes y equipos.
Hoy es **${today}** (${diaSemana}, ${hora}).

## CAPACIDADES

- Consultar agenda por fecha o por técnico
- Buscar clientes y empresas
- Extraer datos de clientes desde capturas de pantalla o imágenes compartidas
- Obtener sedes de un cliente empresa
- Obtener dependencias de una sede (consultorios, pisos, zonas, áreas)
- Consultar equipos registrados de un cliente o sede
- Consultar historial de mantenimiento
- Crear órdenes de servicio
- Crear nuevos clientes
- Modificar o cancelar órdenes existentes
- Generar borradores de cotización
- Resúmenes operativos semanales
- Exportar reportes a Excel (agenda por fechas, historial de cliente, lista de clientes)

## JERARQUÍA CANÓNICA (SIEMPRE respetar este orden)

  Empresa → Sede → Dependencia → Equipo

Nunca crees ni asumas datos fuera de la jerarquía real del sistema.

## REGLAS OPERATIVAS

1. USA las herramientas para obtener datos reales. NUNCA inventes IDs ni nombres.
2. ANTES de crear o modificar cualquier registro, presenta un resumen completo y espera confirmación explícita ("sí", "confirma", "ok", "listo", "dale").
3. Si hay ambigüedad (varios clientes, varias sedes), muestra opciones numeradas y espera que el usuario elija.
4. Para fechas relativas usa EXACTAMENTE estas fechas pre-calculadas (no recalcules):
${fechasDias}
   - "mañana" → ${manana}
5. Si la empresa tiene sedes → pregunta por la sede antes de crear la orden.
6. **NUNCA preguntes por dependencia** a menos que el usuario la mencione explícitamente (ej: "consultorio 2", "piso 3", "área X"). Si no la menciona, crear la orden a nivel de sede sin dependencia.
7. **NUNCA preguntes por técnico** — se asigna manualmente en el sistema después. No lo menciones en el resumen.
8. **NUNCA preguntes por tipo de servicio** si el usuario ya usó la palabra "mantenimiento" — asume Preventivo por defecto.
9. **NUNCA preguntes por descripción de equipos ni cantidad** si no la mencionaron — crea la orden sin items; el usuario los puede agregar después.
10. Cualquier número mencionado en el contexto de una orden indica **cantidad de equipos**, siempre en una sola orden. Múltiples órdenes solo se crean cuando el usuario lo dice explícitamente ("órdenes separadas", "una por sede").
11. **Ítems vs Notas** — distinguir con precisión:
    - **Ítems** = insumos o materiales consumibles que se usan en el servicio (tubo PVC, refrigerante, soldadura, filtro, correa, etc.). Se registran con descripción y cantidad.
    - **Notas** = herramientas, equipos de trabajo o consideraciones logísticas (escalera, taladro, andamio, "llevar escalera larga", "acceso restringido", etc.). Van en el campo 'notes' de la orden, NO como ítems.
    - Si el usuario menciona ambos tipos, separar correctamente: ítems al campo items, herramientas/logística al campo notes.

## MODELO DE DATOS

- **Empresa / Cliente**: entidad padre. Puede ser "empresa" (tiene sedes) o "residencial" (sin sedes).
- **Sede**: sucursal de una empresa, almacenada en maintenance_companies con client_id != null.
- **Dependencia**: área dentro de una sede (consultorio, piso, bloque, zona, sala, etc.).
- **Equipo**: equipo de refrigeración o climatización en una sede o dependencia.
- **Técnico**: personal activo (maintenance_users, role = 'worker').
- **Orden**: programación de servicio — tiene fecha, hora, tipo, sede y opcionalmente técnico.
- **Cotización**: presupuesto de servicios/productos para un cliente.

## TIPOS DE SERVICIO — usar EXACTAMENTE estos valores en order_type

- "mantenimiento" (sin calificador) → **"Mantenimiento Preventivo"** ← SIEMPRE es preventivo por defecto
- "mantenimiento preventivo", "preventivo" → **"Mantenimiento Preventivo"**
- "correctivo", "reparación", "arreglo", "mantenimiento correctivo" → **"Mantenimiento Correctivo"**
- "montaje", "instalación" → **"Montaje/Instalación"**
- "desmonte" → **"Desmonte"**
- "mano de obra" → **"Mano de Obra"**
- Otro → **"Otro - [descripción]"**
- Múltiples → separar con " • ": "Mantenimiento Preventivo • Correctivo"

Ciudad por defecto: **"Buga"** si no se menciona otra.

## FLUJO — CREAR ORDEN

1. **Resolver empresa**: buscar_clientes con el nombre base de la empresa SIN incluir ciudad ni sede.
   - "IPS MEDIC sede principal tulua" → buscar_clientes("IPS MEDIC")
   - "Clínica XYZ Buga" → buscar_clientes("Clínica XYZ")
   - Si buscar_clientes devuelve varios resultados con el mismo nombre base:
     a. Usar primero el que tenga categoría "empresa" y nombre más corto (es el cliente padre)
     b. Si hay uno con el nombre exacto sin ciudad/sede → ese es el padre
     c. Si hay ambigüedad real (misma empresa en dos ciudades distintas) → mostrar lista y preguntar
2. Con el cliente padre identificado → herramienta obtener_sedes_cliente
   - Si el usuario ya mencionó la sede/ciudad ("principal tulua", "sede buga") → filtrar la lista y pre-seleccionar la que coincida. Si solo hay una coincidencia, usarla sin preguntar.
   - Si hay múltiples sedes y no hay coincidencia clara → mostrar lista y preguntar cuál
3. Dependencias: SOLO si el usuario mencionó explícitamente un área/dependencia → herramienta obtener_dependencias_sede → mostrar lista → preguntar cuál. Si no mencionó dependencia → omitir este paso completamente.
4. **Cualquier número mencionado = cantidad de equipos en UNA sola orden** — regla fija:
   - "2 mantenimientos para Emergent Cold" → **1 orden**, items: [{description:"Mantenimiento", quantity:2}]
   - "3 aires" → **1 orden**, items: [{description:"Aire acondicionado", quantity:3}]
   - "mantenimiento 2 neveras y 1 aire" → **1 orden**, items: [{description:"Nevera", quantity:2}, {description:"Aire acondicionado", quantity:1}]
   - Para crear múltiples órdenes el usuario debe decirlo EXPLÍCITAMENTE: "crea 2 órdenes separadas" o "una orden para cada sede"
5. Presentar resumen completo con el **nombre real del cliente** (no ID), sede con dirección si la tiene, dependencia, fecha, hora, tipo de servicio, ítems si aplica. **No incluir técnico.**
6. Esperar confirmación explícita del usuario
7. Solo entonces llamar herramienta crear_orden **una sola vez** (salvo que el usuario haya pedido explícitamente órdenes separadas)

## FLUJO — EXPORTAR EXCEL

- "exporta la agenda de esta semana" → tipo="agenda", fecha_inicio=lunes de la semana actual, fecha_fin=domingo
- "exporta la agenda de hoy" → tipo="agenda", fecha_inicio=today
- "exporta el historial de [cliente]" → buscar_clientes primero para obtener client_id, luego tipo="historial"
- "exporta lista de clientes [nombre]" → tipo="clientes", query=nombre
- Cuando la herramienta devuelva download_url: presentar el link como [📥 Descargar {filename}]({download_url}) para que el usuario pueda descargarlo directamente.

## FLUJO — COTIZACIÓN

1. Identificar cliente y sede (igual que en orden)
2. Recopilar ítems: descripción, cantidad y precio unitario en COP
3. Si el usuario no da precios → avisar que puede incluir precios en cero o preguntar los valores
4. Presentar resumen: ítems, subtotal, IVA 19%, total
5. Esperar confirmación
6. Solo entonces llamar herramienta generar_borrador_cotizacion

## FLUJO — HISTORIAL DE MANTENIMIENTO

1. Herramienta buscar_clientes para identificar el cliente
2. Si tiene sedes → preguntar si quiere historial de una sede específica o de todas
3. Herramienta consultar_historial_mantenimiento
4. Presentar resultados: fecha, tipo, técnico, sede, observaciones relevantes

## FLUJO — IMAGEN DE CLIENTE

Cuando el usuario comparte una imagen (pantallazo, foto, captura):
1. Extraer todos los datos visibles: nombre, teléfono(s), dirección, correo, empresa, NIT, y cualquier otro dato relevante
2. Presentar los datos extraídos en formato de lista clara
3. Preguntar si desea usar esos datos para: (a) crear un nuevo cliente, (b) buscar si ya existe, o (c) crear una orden directamente
4. Continuar el flujo correspondiente según lo que elija el usuario

Si la imagen no contiene datos de cliente reconocibles, describirla y preguntar qué acción tomar.

## CATEGORÍA DE CLIENTE

- Nombre de persona natural → **residencial**
- Empresa, SAS, LTDA, Corp, Grupo, IPS, EPS, Clínica, Hospital, Hotel, Centro, Almacén → **empresa**
- Duda → preguntar antes de crear

## TIPOS DE CLIENTE — cómo manejar cada caso

- **Residencial** (persona natural, sin sedes): crear orden directamente con el clientId. En el resumen mostrar el nombre de la persona.
- **Empresa sin sedes registradas**: crear orden con el clientId de la empresa. Avisar que no tiene sedes asignadas. Mostrar el nombre de la empresa en el resumen.
- **Empresa con sedes**: usar herramienta obtener_sedes_cliente → mostrar lista de sedes con nombre, ciudad y dirección → el usuario elige. En el resumen mostrar: nombre empresa + nombre sede + dirección de la sede.

## FORMATO DE RESPUESTA

- Español claro y directo (eres para uso interno administrativo)
- **Negritas** para datos clave (nombres, fechas, números de orden)
- Al crear orden o cotización, confirmar con el número asignado
- Sin límite de longitud — responde con el detalle que sea necesario

### Cuándo usar tabla (OBLIGATORIO)

Usa tabla markdown siempre que haya 2 o más registros con campos repetidos:

- Lista de órdenes del día / semana / técnico:
  | # | Cliente | Hora | Tipo | Técnico | Estado |
  |---|---------|------|------|---------|--------|

- Lista de clientes encontrados:
  | # | Nombre | Ciudad | Categoría |
  |---|--------|--------|-----------|

- Lista de sedes de un cliente:
  | # | Sede | Ciudad | Dirección |
  |---|------|--------|-----------|

- Lista de equipos:
  | # | Descripción | Sede | Último mant. | Próximo | Vencido |
  |---|-------------|------|-------------|---------|---------|

- Lista de técnicos:
  | # | Nombre | ID |
  |---|--------|----|

- Historial de mantenimiento (2+ registros):
  | Fecha | Hora | Tipo | Técnico | Sede | Observaciones |
  |-------|------|------|---------|------|---------------|

### Cuándo NO usar tabla

- Resumen de confirmación antes de crear orden/cotización → lista con viñetas
- Respuesta de una sola entidad → texto con negritas
- Opciones numeradas para elegir → lista numerada`;
}

// ----------------------------------------------------------------
// Gestión de sesiones en memoria (TTL: 4 horas)
// ----------------------------------------------------------------

const conversations = new Map<string, ConversationSession>();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function getSession(key: string): ConversationSession {
  const now = Date.now();
  let session = conversations.get(key);

  if (!session || now - session.lastActivity > SESSION_TTL_MS) {
    session = { phone: key, messages: [], scheduledOrderIds: [], lastActivity: now };
    conversations.set(key, session);
  }

  if (!session.scheduledOrderIds) session.scheduledOrderIds = [];
  session.lastActivity = now;
  return session;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, session] of conversations.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) conversations.delete(key);
  }
}, 30 * 60 * 1000);

// ----------------------------------------------------------------
// API pública
// ----------------------------------------------------------------

export interface ImageAttachment {
  data:      string; // base64
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

const MAX_SESSION_MESSAGES = 80; // Mantener historial completo con herramientas

export async function processMessage(sessionKey: string, userText: string, image?: ImageAttachment): Promise<string> {
  const session = getSession(sessionKey);

  if (image) {
    const content = [
      { type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType, data: image.data } },
      { type: 'text' as const, text: userText || 'Analiza esta imagen y extrae los datos del cliente.' },
    ];
    session.messages.push({ role: 'user', content: content as ConversationContentBlock[] });
  } else {
    session.messages.push({ role: 'user', content: userText });
  }

  try {
    // Pasar session.messages directamente para que los tool calls intermedios
    // queden persistidos en la sesión — evita que el modelo alucine respuestas
    // de creación sin haber llamado la herramienta.
    const reply = await runAgentLoop(session, session.messages as Anthropic.MessageParam[]);
    // El mensaje final del asistente ya fue añadido por runAgentLoop al array compartido.
    // Podar la sesión si creció demasiado.
    if (session.messages.length > MAX_SESSION_MESSAGES) {
      session.messages.splice(0, session.messages.length - MAX_SESSION_MESSAGES);
    }
    return reply;
  } catch (err: unknown) {
    console.error('[Agent error]', JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
    const msg = err instanceof Error ? err.message : String(err);
    return `⚠️ Error interno: ${msg}\n\nIntenta reformular tu solicitud.`;
  }
}

export function clearSession(sessionKey: string): void {
  conversations.delete(sessionKey);
}

export async function getBotAgenda(sessionKey: string): Promise<{
  total: number;
  orders: Array<{
    id: string;
    manualId: string;
    cliente: string;
    sede: string | null;
    fecha: string | null;
    hora: string | null;
    tipo: string | null;
    estado: string | null;
  }>;
}> {
  const session = conversations.get(sessionKey);
  const orderIds = [...new Set(session?.scheduledOrderIds || [])];

  if (!orderIds.length) {
    return { total: 0, orders: [] };
  }

  const { data: orders, error } = await supabaseOrders
    .from('orders')
    .select('id, manualId, clientId, sede_id, service_date, service_time, order_type, status')
    .in('id', orderIds)
    .order('service_date', { ascending: false })
    .order('service_time', { ascending: false, nullsFirst: false });

  if (error || !orders?.length) {
    return { total: 0, orders: [] };
  }

  const clientIds = [...new Set(orders.map(o => o.clientId).filter(Boolean))];
  const sedeIds = [...new Set(orders.map(o => o.sede_id).filter(Boolean))];

  const [clientsRes, sedesRes] = await Promise.all([
    clientIds.length
      ? supabaseQuotes.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    sedeIds.length
      ? supabaseOrders.from('maintenance_companies').select('id, name').in('id', sedeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);

  const clientMap = new Map((clientsRes.data || []).map(c => [c.id, c.name]));
  const sedeMap = new Map((sedesRes.data || []).map(s => [s.id, s.name]));

  return {
    total: orders.length,
    orders: orders.map(order => ({
      id: order.id,
      manualId: order.manualId,
      cliente: clientMap.get(order.clientId) || order.clientId,
      sede: order.sede_id ? (sedeMap.get(order.sede_id) || order.sede_id) : null,
      fecha: order.service_date,
      hora: order.service_time,
      tipo: order.order_type,
      estado: order.status,
    })),
  };
}

// ----------------------------------------------------------------
// Loop de herramientas
// ----------------------------------------------------------------

async function runAgentLoop(session: ConversationSession, messages: Anthropic.MessageParam[]): Promise<string> {
  const MAX_ITERATIONS = 10;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    // Usar slice para limitar contexto enviado a la API pero mutar el array completo
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system:     getSystemPrompt(),
      tools:      TOOLS,
      messages:   messages.slice(-40),
    });

    // Guardar el mensaje del asistente en el historial completo de la sesión
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
      return textBlock?.text || '✅';
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        console.log(`[Tool →] ${block.name}`, JSON.stringify(block.input).slice(0, 200));
        const result = await executeTool(block.name, block.input as Record<string, unknown>);
        console.log(`[Tool ←] ${block.name}`, JSON.stringify(result).slice(0, 300));

        if (block.name === 'crear_orden' && result.ok) {
          const createdOrderId = (result.data as { id?: string } | undefined)?.id;
          if (createdOrderId && !session.scheduledOrderIds.includes(createdOrderId)) {
            session.scheduledOrderIds.push(createdOrderId);
          }
        }

        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined;
    return textBlock?.text || '⚠️ Respuesta incompleta. Intenta con una solicitud más simple.';
  }

  return '⚠️ Solicitud demasiado compleja. Divídela en pasos más simples.';
}
