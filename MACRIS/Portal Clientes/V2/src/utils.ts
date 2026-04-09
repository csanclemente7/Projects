export function formatDate(dateInput?: Date | string, includeTime: boolean = true): string {
  if (!dateInput) return 'N/A';

  const isDateOnlyString = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Fecha invalida';

  if (isDateOnlyString) {
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  }

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  if (includeTime && !isDateOnlyString) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.timeZone = 'America/Bogota';
  }

  return new Intl.DateTimeFormat('es-CO', options).format(date);
}

const BOGOTA_TIME_ZONE = 'America/Bogota';

export function toBogotaDateKey(dateInput?: Date | string): string | null {
  if (!dateInput) return null;
  const isDateOnlyString = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  if (isDateOnlyString) {
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getBogotaTodayKey(): string {
  return toBogotaDateKey(new Date()) || new Date().toISOString().slice(0, 10);
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function normalizeAccessCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeManualId(value: string): string {
  return normalizeSearchTerm(value).replace(/[^a-z0-9]/g, '');
}

export function buildCompanyAccessCode(companyName: string, companyId: string): string {
  const slug = slugify(companyName) || 'empresa';
  const shortId = companyId.replace(/-/g, '').slice(0, 6);
  return `${slug}-${shortId}`;
}

export function buildCompanyAccessLink(companyName: string, companyId: string): string {
  const code = buildCompanyAccessCode(companyName, companyId);
  return `${window.location.origin}${window.location.pathname}?empresa=${code}`;
}

export function buildAccessMessage(companyName: string, accessLink: string, accessCode: string) {
  const subject = `Acceso a reportes de mantenimiento - ${companyName}`;
  const body = [
    `Hola ${companyName},`,
    '',
    'Adjuntamos el acceso a los reportes de mantenimiento realizados por Macris.',
    '',
    `Link directo: ${accessLink}`,
    `Código de acceso: ${accessCode}`,
    '',
    'Si necesita soporte o desea agregar mas contactos, responda este mensaje.',
    '',
    'Cordialmente,',
    'Macris Ingenieria',
  ].join('\n');

  return { subject, body };
}
