import 'dotenv/config';
import path from 'path';
import express, { Request, Response } from 'express';
import { getBotAgenda, processMessage } from './agent';
import { supabaseOrdersAdmin } from './supabase';
import { getExcelFile } from './excel';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ----------------------------------------------------------------
// Web UI — sirve los archivos estáticos de /public
// ----------------------------------------------------------------

app.use(express.static(path.join(__dirname, '../public')));

// ----------------------------------------------------------------
// API Web — endpoint principal para la interfaz web
// ----------------------------------------------------------------

app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, sessionId, image } = req.body as {
    message?:  string;
    sessionId?: string;
    image?: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' };
  };

  if (!message?.trim() && !image) {
    res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
    return;
  }

  const sid = sessionId?.trim() || crypto.randomUUID();
  const sessionKey = `web:${sid}`;

  console.log(`[WEB IN] ${sid.slice(0, 8)}: ${(message || '[imagen]').slice(0, 120)}`);

  try {
    const reply = await processMessage(sessionKey, message?.trim() ?? '', image);
    console.log(`[WEB OUT] ${sid.slice(0, 8)}: ${reply.slice(0, 120)}`);
    res.json({ reply, sessionId: sid });
  } catch (err) {
    console.error('[Web API error]', err);
    res.status(500).json({ error: 'Error interno del servidor. Intenta de nuevo.', sessionId: sid });
  }
});

app.get('/api/bot-agenda', async (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId || '').trim();
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId es requerido.' });
    return;
  }

  try {
    const data = await getBotAgenda(`web:${sessionId}`);
    res.json(data);
  } catch (err) {
    console.error('[bot-agenda error]', err);
    res.status(500).json({ error: 'No fue posible consultar la agenda del bot.' });
  }
});

// ----------------------------------------------------------------
// Webhook de Twilio — canal WhatsApp (opcional)
// ----------------------------------------------------------------

app.post('/webhook', async (req: Request, res: Response) => {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    res.status(404).send('Canal WhatsApp no configurado.');
    return;
  }

  const from: string     = req.body.From  || '';
  const body: string     = req.body.Body  || '';
  const numMedia: number = parseInt(req.body.NumMedia || '0', 10);

  console.log(`[WA IN] ${from}: ${body}${numMedia ? ` (+${numMedia} foto(s))` : ''}`);

  let messageText = body.trim();

  if (numMedia > 0) {
    const mediaUrl  = req.body.MediaUrl0 as string;
    const mediaType = (req.body.MediaContentType0 as string) || 'image/jpeg';
    const photoUrl  = await uploadTwilioMedia(mediaUrl, mediaType);
    if (photoUrl) {
      messageText = `[FOTO_ADJUNTA:${photoUrl}]${messageText ? ' ' + messageText : ''}`;
    } else {
      messageText = messageText || 'El usuario envió una foto pero no se pudo procesar.';
    }
  }

  if (!messageText) {
    res.type('text/xml').send('<Response></Response>');
    return;
  }

  try {
    const reply = await processMessage(from, messageText);
    console.log(`[WA OUT] ${from}: ${reply.slice(0, 80)}`);
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
// Descarga de archivos Excel generados por el bot
// ----------------------------------------------------------------

app.get('/api/download/:token', (req: Request, res: Response) => {
  const file = getExcelFile(String(req.params.token));
  if (!file) {
    res.status(404).json({ error: 'Archivo no encontrado o expirado (TTL: 1 hora).' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(file.buffer);
});

// ----------------------------------------------------------------
// Health / diagnóstico
// ----------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'MACRIS IA Core',
    ts: new Date().toISOString(),
    channels: {
      web: true,
      whatsapp: !!process.env.TWILIO_ACCOUNT_SID,
    },
  });
});

app.get('/dbtest', async (_req: Request, res: Response) => {
  const { supabaseOrdersAdmin: oa, supabaseQuotesAdmin: qa } = await import('./supabase');

  const ordersKey = process.env.ORDERS_SUPABASE_SERVICE_KEY ? 'service_role ✅' : 'anon ❌';
  const quotesKey = process.env.QUOTES_SUPABASE_SERVICE_KEY ? 'service_role ✅' : 'anon ❌';

  const testId = crypto.randomUUID();
  const { error: insErr } = await oa.from('orders').insert({
    id: testId, manualId: 'TEST-DELETE', clientId: '00000000-0000-0000-0000-000000000000',
    status: 'cancelled', service_date: '2000-01-01', order_type: 'TEST',
  });
  let ordersInsert = insErr ? `❌ ${insErr.message}` : '✅ insert OK';
  if (!insErr) {
    const { error: delErr } = await oa.from('orders').delete().eq('id', testId);
    ordersInsert += delErr ? ` (limpieza falló: ${delErr.message})` : ' → delete OK';
  }

  const { error: selErr } = await qa.from('clients').select('id').limit(1);
  const quotesSelect = selErr ? `❌ ${selErr.message}` : '✅ select OK';

  res.json({ ordersKey, quotesKey, ordersInsert, quotesSelect });
});

// ----------------------------------------------------------------
// Arranque
// ----------------------------------------------------------------

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`\n✅  MACRIS IA Core en http://localhost:${PORT}`);
  console.log(`    Web UI   → http://localhost:${PORT}/`);
  console.log(`    API      → POST http://localhost:${PORT}/api/chat`);
  if (process.env.TWILIO_ACCOUNT_SID) {
    console.log(`    WhatsApp → POST http://localhost:${PORT}/webhook`);
  }
  console.log('');
});

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function uploadTwilioMedia(mediaUrl: string, contentType: string): Promise<string | null> {
  try {
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const res  = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return null;

    const buffer   = Buffer.from(await res.arrayBuffer());
    const ext      = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const filePath = `whatsapp/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await supabaseOrdersAdmin.storage
      .from('order-images')
      .upload(filePath, buffer, { contentType, upsert: false });

    return error ? null : filePath;
  } catch {
    return null;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
