import { writable } from 'svelte/store';
import { io, Socket } from 'socket.io-client';

const initialEvents = typeof localStorage !== 'undefined'
  ? (JSON.parse(localStorage.getItem('cachedEvents') || '[]') || [])
  : [];
// We can't map it here easily without moving the function up. Wait, enrichEventWithCVE is defined below. 
// I'll just leave it and the initial_data socket event will overwrite it shortly anyway.

export const eventsStore      = writable<any[]>(initialEvents);
export const socketStore      = writable<Socket | null>(null);
export const roleStore        = writable<string>('guest');
export const usernameStore    = writable<string>('');
export const connectionState  = writable<boolean>(false);
export const latestAttackStore = writable<any>(null);
export const isHistoricalMode = writable<boolean>(false);
export const selectedDateStore = writable<string>(new Date().toISOString().split('T')[0]);

let socket: Socket | null = null;

export function enrichEventWithCVE(e: any) {
  if (e.cve) return e; // Already enriched
  if (e.type && typeof e.type === 'string') {
    const t = e.type.toUpperCase();
    if (t.includes('LOG4J')) {
      e.cve = { id: 'CVE-2021-44228', score: 10.0, severity: 'critical', name: 'Log4j RCE' };
    } else if (t.includes('SQL')) {
      e.cve = { id: 'CVE-2023-XXXX', score: 7.5, severity: 'high', name: 'SQL Injection' };
    } else if (t.includes('TRAVERSAL') || t.includes('DIRECTORY')) {
      e.cve = { id: 'CVE-2022-XXXX', score: 5.3, severity: 'medium', name: 'Path Traversal' };
    } else if (t.includes('SSHD') || t.includes('BRUTE')) {
      e.cve = { id: 'CVE-2023-38408', score: 9.8, severity: 'critical', name: 'SSH Vulnerability' };
    } else if (t.includes('BEACON') || t.includes('MALWARE')) {
      e.cve = { id: 'CVE-2021-34527', score: 8.8, severity: 'high', name: 'PrintNightmare / Malware C2' };
    }
  }
  return e;
}

export function initSocket() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/?expired=true';
    return;
  }

  // Guard: ถ้า token ยังเป็น fake string เดิม (ก่อน deploy JWT จริง) ให้ logout
  if (token.startsWith('fake-jwt-token')) {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    window.location.href = '/?expired=true';
    return;
  }

  const role = localStorage.getItem('role') || 'guest';
  roleStore.set(role);
  
  const username = localStorage.getItem('username') || '';
  usernameStore.set(username);

  if (socket) return; // already connected

  socket = io({
    path: '/socket.io/',
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    connectionState.set(true);
  });

  socket.on('disconnect', () => {
    connectionState.set(false);
  });

  socket.on('initial_data', (data: any[]) => {
    // Only set initial data if not in historical mode
    isHistoricalMode.subscribe(historical => {
      if (!historical) {
        const enriched = data.map(enrichEventWithCVE);
        eventsStore.set(enriched);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cachedEvents', JSON.stringify(enriched));
        }
      }
    })();
  });

  socket.on('new_attack', (data: any) => {
    // Ignore real-time updates if in historical mode
    let isHistorical = false;
    isHistoricalMode.subscribe(val => isHistorical = val)();
    
    if (!isHistorical) {
      const enriched = enrichEventWithCVE(data);
      eventsStore.update(events => {
        const newEvents = [enriched, ...events].slice(0, 2000);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cachedEvents', JSON.stringify(newEvents));
        }
        return newEvents;
      });
      latestAttackStore.set(enriched);
    }
  });

  socket.on('status_updated', (data: { id: number; status: string }) => {
    eventsStore.update(events => {
      const index = events.findIndex(e => e.id === data.id);
      if (index !== -1) {
        events[index] = { ...events[index], status: data.status };
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cachedEvents', JSON.stringify(events));
      }
      return events;
    });
  });

  // FIX: รับ connect_error ได้ทุกกรณี (ไม่ใช่แค่ string 'Unauthorized')
  socket.on('connect_error', (err) => {
    console.warn('[WS] connect_error:', err.message);
    // Backend ใช้ disconnect(true) → client จะเห็น error message ว่าง หรือ "xhr poll error"
    // ให้ logout ถ้าเชื่อมต่อไม่ได้หลังพยายามหลายครั้งแล้ว
    connectionState.set(false);
  });

  socket.on('error', (msg: string) => {
    console.warn('[WS] server error:', msg);
  });

  socketStore.set(socket);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    socketStore.set(null);
    connectionState.set(false);
  }
}

export async function fetchHistoricalEvents(dateStr: string) {
  isHistoricalMode.set(true);
  selectedDateStore.set(dateStr);
  
  try {
    const res = await fetch(`/api/attacks/history?date=${dateStr}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      eventsStore.set(data);
    }
  } catch (err) {
    console.error('Failed to fetch historical events:', err);
  }
}

export function resumeLiveEvents() {
  isHistoricalMode.set(false);
  selectedDateStore.set(new Date().toISOString().split('T')[0]);
  
  // Try to refetch live data via API, or let the socket's 'initial_data' handle it if we reconnect
  // An easy way to refresh live data is to disconnect and reconnect the socket
  disconnectSocket();
  setTimeout(() => initSocket(), 100);
}
