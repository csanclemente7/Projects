import type { Order, Client, Sede, Technician, AgendaView } from './types';

let orders:      Order[]      = [];
let clients:     Client[]     = [];
let sedes:       Sede[]       = [];
let technicians: Technician[] = [];
let agendaDate:  Date         = new Date();
let agendaView:  AgendaView   = 'week';
let selectedDay: string       = '';   // YYYY-MM-DD, usado por panel móvil

export const getOrders      = () => orders;
export const getClients     = () => clients;
export const getSedes       = () => sedes;
export const getTechnicians = () => technicians;
export const getAgendaDate  = () => agendaDate;
export const getAgendaView  = () => agendaView;
export const getSelectedDay = () => selectedDay;

export function setOrders(v: Order[])           { orders      = v; }
export function setClients(v: Client[])         { clients     = v; }
export function setSedes(v: Sede[])             { sedes       = v; }
export function setTechnicians(v: Technician[]) { technicians = v; }
export function setAgendaDate(v: Date)          { agendaDate  = v; }
export function setAgendaView(v: AgendaView)    { agendaView  = v; }
export function setSelectedDay(v: string)       { selectedDay = v; }

export function getOrdersForDate(dateStr: string): Order[] {
  return orders.filter(o => o.service_date === dateStr);
}

export function getClientById(id: string): Client | undefined {
  return clients.find(c => c.id === id);
}

export function getSedeById(id: string): Sede | undefined {
  return sedes.find(s => s.id === id);
}

export function getTechnicianById(id: string): Technician | undefined {
  return technicians.find(t => t.id === id);
}

export function getOrderById(id: string): Order | undefined {
  return orders.find(o => o.id === id);
}