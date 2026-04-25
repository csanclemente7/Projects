import 'dotenv/config';
import express, { Request, Response } from 'express';
import { processMessage } from './agent';
import { supabaseOrdersAdmin } from './supabase';

const app  = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ----------------------------------------------------------------
// Webhook de Twilio — recibe mensajes entrantes de WhatsApp
// ----------------------------------------------------------------

app.post('/webhook', async (req: Request, res: Response) => {
  const from: string     = req.body.From  || '';
  const body: string     = req.body.Body  || '';
  const numMedia: number = parseInt(req.body.NumMedia || '0', 10);

  console.log(`[IN] ${from}: ${body}${numMedia ? ` (+${numMedia} foto(s))` : ''}`);

  let messageText = body.trim();

  // Procesar imagen si viene adjunta
  if (numMedia > 0) {
    const mediaUrl  = req.body.MediaUrl0 as string;
    const mediaType = (req.body.MediaContentType0 as string) || 'image/jpeg';

    const photoUrl = await uploadTwilioMedia(mediaUrl, mediaType);
    if (photoUrl) {
      console.log(`[Media] subida → ${photoUrl}`);
      // Inyectar la URL en el mensaje para que el agente la use
      messageText = `[FOTO_ADJUNTA:${photoUrl}]${messageText ? ' ' + messageText : ''}`;
    } else {
      messageText = messageText || 'El usuario envió una foto pero no se pudo procesar.';
    }
  }

  // Ignorar mensajes completamente vacíos (sin texto ni media procesable)
  if (!messageText) {
    res.type('text/xml').send('<Response></Response>');
    return;
  }

  try {
    const reply = await processMessage(from, messageText);
    console.log(`[OUT] ${from}: ${reply.slice(0, 80)}...`);

    res.type('text/xml').send(
      `<Response><Message>${escapeXml(reply)}</Message></Response>`
    );
  } catch (err) {
    console.error('[Webhook error]', err);
    res.type('text/xml').send(
      `<Response><Message>⚠️ Error interno, intenta de nuevo.</Message></Response>`
    );
  }
});

// ----------------------------------------------------------------
// Health check + diagnóstico de BD
// ----------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'MACRIS Chatbot', ts: new Date().toISOString() });
});

app.get('/dbtest', async (_req: Request, res: Response) => {
  const { supabaseOrdersAdmin, supabaseQuotesAdmin } = await import('./supabase');

  const ordersKey  = process.env.ORDERS_SUPABASE_SERVICE_KEY ? 'service_role ✅' : 'anon (falta SERVICE_KEY) ❌';
  const quotesKey  = process.env.QUOTES_SUPABASE_SERVICE_KEY ? 'service_role ✅' : 'anon (falta SERVICE_KEY) ❌';

  // Probar INSERT + DELETE en orders
  const testId = crypto.randomUUID();
  const { error: insErr } = await supabaseOrdersAdmin.from('orders').insert({
    id: testId, manualId: 'TEST-DELETE', clientId: '00000000-0000-0000-0000-000000000000',
    status: 'cancelled', service_date: '2000-01-01', order_type: 'TEST',
  });
  let ordersInsert = insErr ? `❌ ${insErr.message}` : '✅ insert OK';

  if (!insErr) {
    const { error: delErr } = await supabaseOrdersAdmin.from('orders').delete().eq('id', testId);
    if (delErr) ordersInsert += ` (limpieza falló: ${delErr.message})`;
    else ordersInsert += ' → delete OK';
  }

  // Probar SELECT en clients
  const { error: selErr } = await supabaseQuotesAdmin.from('clients').select('id').limit(1);
  const quotesSelect = selErr ? `❌ ${selErr.message}` : '✅ select OK';

  res.json({ ordersKey, quotesKey, ordersInsert, quotesSelect });
});

// ----------------------------------------------------------------
// Arranque
// ----------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`✅ MACRIS Chatbot corriendo en http://localhost:${PORT}`);
  console.log(`   Webhook URL para Twilio: http://TU_DOMINIO/webhook`);
});

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

// Descarga una imagen de Twilio y la sube al bucket order-images (mismo que usa la app Agenda)
// Devuelve el path dentro del bucket, no una URL pública
async function uploadTwilioMedia(mediaUrl: string, contentType: string): Promise<string | null> {
  try {
    const sid   = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const auth  = Buffer.from(`${sid}:${token}`).toString('base64');

    const res = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) { console.error('[Media] descarga fallida:', res.status); return null; }

    const buffer   = Buffer.from(await res.arrayBuffer());
    const ext      = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filePath = `whatsapp/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await supabaseOrdersAdmin.storage
      .from('order-images')
      .upload(filePath, buffer, { contentType, upsert: false });

    if (error) { console.error('[Media] upload error:', error.message); return null; }

    return filePath; // path en el bucket, igual que usan las demás fotos
  } catch (err) {
    console.error('[Media] error inesperado:', err);
    return null;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}