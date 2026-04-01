
export function generateId(): string {
    // crypto.randomUUID() no está disponible en contextos no seguros (http) o en navegadores antiguos.
    // Se proporciona una implementación de respaldo.
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    // Un fallback simple para generar un UUID v4.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
            v = c == 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function formatDate(dateInput?: Date | string, includeTime: boolean = true): string {
    if (!dateInput) return 'N/A';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric', month: '2-digit', day: '2-digit'
    };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    try {
        return date.toLocaleString('es-ES', options);
    } catch (e) {
        const d = new Date(dateInput);
        if (isNaN(d.getTime())) return 'Fecha Inválida';
        return d.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
}

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(value);
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

export function isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function formatTime(timeString: string | null | undefined): string {
    if (!timeString) {
        return '';
    }
    try {
        const [hours, minutes] = timeString.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
            return timeString; // Return original if parsing fails
        }
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12; // Convert 0 to 12 for 12 AM
        const paddedMinutes = String(minutes).padStart(2, '0');
        return `${hours12}:${paddedMinutes} ${ampm}`;
    } catch (e) {
        console.error("Error formatting time:", e);
        return timeString; // Return original on error
    }
}
