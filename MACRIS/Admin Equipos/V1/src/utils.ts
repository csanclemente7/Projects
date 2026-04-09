export function generateId(): string {
    return crypto.randomUUID();
}

export function formatDate(dateInput?: Date | string, includeTime: boolean = true): string {
    if (!dateInput) return 'N/A';
    
    const isDateOnlyString = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
    
    const date = new Date(dateInput);
    
    if (isNaN(date.getTime())) {
        return 'Fecha Inválida';
    }

    // Adjust for timezone offset if the input is a date-only string like 'YYYY-MM-DD'.
    // new Date() creates the date as UTC midnight, so we add the local offset to prevent the date
    // from rolling back to the previous day in timezones behind UTC (e.g., in the Americas).
    if (isDateOnlyString) {
      date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    }

    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: '2-digit', day: '2-digit',
    };
    
    // For full timestamps (not date-only strings), format with the time in the Colombian timezone.
    if (includeTime && !isDateOnlyString) {
        options.hour = '2-digit';
        options.minute = '2-digit';
        options.timeZone = 'America/Bogota';
    }

    try {
        // Use es-CO for Colombian Spanish formatting.
        return new Intl.DateTimeFormat('es-CO', options).format(date);
    } catch (e) {
        console.error("Error formatting date:", e);
        // A simple fallback if Intl fails for some reason.
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${d}/${m}/${y}`;
    }
}

export function formatTime(timeString?: string | null): string {
  if (!timeString) return 'N/A';
  
  // Assumes time is in 'HH:mm:ss' or 'HH:mm' format
  const [hoursStr, minutesStr] = timeString.split(':');
  if (hoursStr === undefined || minutesStr === undefined) return 'Hora Inválida';

  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);

  if (isNaN(hours) || isNaN(minutes)) return 'Hora Inválida';

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  const minutesPadded = minutes < 10 ? '0' + minutes : String(minutes).padStart(2, '0');

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