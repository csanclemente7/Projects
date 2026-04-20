export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export function isThisMonth(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function stockStatus(item: { current_stock: number; min_stock: number }): 'ok' | 'low' | 'out' {
  if (item.current_stock <= 0) return 'out';
  if (item.current_stock <= item.min_stock) return 'low';
  return 'ok';
}

export function stockStatusLabel(status: 'ok' | 'low' | 'out'): string {
  return { ok: 'Disponible', low: 'Stock bajo', out: 'Agotado' }[status];
}

export function movementProfit(m: { type: string; unit_cost: number; unit_price: number | null; quantity: number }): number | null {
  if (m.type !== 'salida' || m.unit_price == null) return null;
  return (m.unit_price - m.unit_cost) * m.quantity;
}

export function parseCurrencyInput(val: string): number {
  return parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
}