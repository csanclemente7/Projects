# MACRIS Chatbot — WhatsApp + IA

Agente conversacional para gestionar órdenes de servicio vía WhatsApp.  
Usa **Claude Haiku** como motor de IA y **Twilio** como canal de WhatsApp.

---

## Configuración inicial (una sola vez)

### 1. Instalar dependencias

```bash
cd Chatbot
npm install
```

### 2. Crear el archivo .env

```bash
cp .env.example .env
```

Rellena los valores:

| Variable | Dónde obtenerla |
|---|---|
| `ORDERS_SUPABASE_KEY` | Supabase → proyecto fzcalgofrhbqvowazdpk → Settings → API |
| `QUOTES_SUPABASE_KEY` | Supabase → proyecto ctitnuadeqdwsgulhpjg → Settings → API |
| `ANTHROPIC_API_KEY`   | console.anthropic.com → API Keys |
| `TWILIO_ACCOUNT_SID`  | console.twilio.com → Dashboard |
| `TWILIO_AUTH_TOKEN`   | console.twilio.com → Dashboard |

### 3. Activar el Sandbox de Twilio WhatsApp

1. En [console.twilio.com](https://console.twilio.com) → **Messaging → Try it out → Send a WhatsApp message**
2. El sandbox tiene un número tipo `+1 415 523 8886`
3. Desde el número de WhatsApp del administrador, envía el código de activación que te da Twilio (ej: `join apple-mango`)
4. Desde ese momento ese número puede recibir/enviar mensajes por el sandbox

---

## Correr en desarrollo (con ngrok)

Twilio necesita una URL pública para enviar el webhook. En desarrollo se usa **ngrok**:

```bash
# Terminal 1 — Correr el servidor
npm run dev

# Terminal 2 — Exponer al internet
npx ngrok http 3000
```

ngrok te dará una URL como `https://abc123.ngrok.io`.

En Twilio → Sandbox → **"When a message comes in"**:
```
https://abc123.ngrok.io/webhook
```
Método: **HTTP POST**

---

## Despliegue en producción (Railway)

1. Crear cuenta en [railway.app](https://railway.app) (gratis)
2. Nuevo proyecto → **Deploy from GitHub repo**
3. Seleccionar la carpeta `Chatbot/`
4. Agregar las variables de entorno en Railway → Variables
5. Railway da una URL fija tipo `https://macris-chatbot.up.railway.app`
6. Actualizar el webhook en Twilio con esa URL

---

## Ejemplos de uso

```
👤 "¿Qué hay agendado para mañana?"
👤 "¿Cuántas órdenes tiene William esta semana?"
👤 "Agenda un preventivo para IPS Medic sede Buga el viernes a las 9am con William"
👤 "Cancela la orden 1854"
👤 "¿Cuántos montajes se hicieron esta semana?"
👤 "Mueve la orden de Comfandi del lunes para el miércoles a las 10am"
```

---

## Arquitectura

```
WhatsApp (usuario)
      ↕
  Twilio Sandbox
      ↕  (POST /webhook)
  Express Server (este proyecto)
      ↕
  Claude Haiku (Anthropic)
      ↕  (herramientas)
  Supabase (orders DB + quotes DB)
```

---

## Migración a Meta API directa (Fase 2)

Cuando tengas aprobado el número de WhatsApp Business en Meta:

1. Reemplaza `TWILIO_*` en `.env` por las credenciales de Meta
2. Actualiza `src/index.ts` para validar el webhook de Meta (verificación con `hub.challenge`)
3. Para enviar mensajes, usa la Graph API en vez de TwiML

El resto del código (agente, herramientas, lógica) no cambia.