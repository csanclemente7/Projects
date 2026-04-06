
export function generateId(): string {
    return crypto.randomUUID();
}

/**
 * Normaliza un string para comparaciones básicas (sin acentos, sin especiales).
 */
export function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Elimina acentos
        .replace(/[^a-z0-9]/g, "");     // Elimina todo lo que no sea alfanumérico
}

/**
 * Normalización avanzada para búsqueda intuitiva.
 * Maneja errores comunes de ortografía en español (Fuzzy search fonético).
 */
export function fuzzyNormalize(str: string): string {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Elimina acentos
        .replace(/m/g, "n")              // Confusión m/n (ej: Comfandi/Confandi)
        .replace(/v/g, "b")              // Confusión b/v
        .replace(/z/g, "s")              // Confusión s/z
        .replace(/c(?=[ei])/g, "s")      // Confusión c/s antes de e, i
        .replace(/[^a-z0-9]/g, "");     // Elimina caracteres especiales
}

/**
 * Formatea una fecha al estándar dd/mm/aaaa solicitado.
 */
export function formatDate(dateInput?: Date | string, includeTime: boolean = true): string {
    if (!dateInput) return 'N/A';
    
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return 'Fecha Inválida';

    // Ajuste para evitar desfase de zona horaria en strings YYYY-MM-DD
    const isDateOnlyString = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
    if (isDateOnlyString) {
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    }

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let formatted = `${day}/${month}/${year}`;

    if (includeTime && !isDateOnlyString) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        formatted += ` ${hours}:${minutes}`;
    }

    return formatted;
}

export function formatTime(timeString?: string | null): string {
  if (!timeString) return 'N/A';
  const [hoursStr, minutesStr] = timeString.split(':');
  if (hoursStr === undefined || minutesStr === undefined) return 'Hora Inválida';
  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  if (isNaN(hours) || isNaN(minutes)) return 'Hora Inválida';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesPadded = String(minutes).padStart(2, '0');
  return `${hours}:${minutesPadded} ${ampm}`;
}

export function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

export function resizeCanvas(canvas: HTMLCanvasElement) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.scale(ratio, ratio);
    }
}
