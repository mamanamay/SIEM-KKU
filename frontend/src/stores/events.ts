import { writable, get } from 'svelte/store';
import { io, Socket } from 'socket.io-client';
import { isActionableDetection } from '../lib/utils/incidentQueue';
import { getFacultyForIP, networkPolicyState, refreshNetworkPolicy } from './faculties';


export function enrichEventWithCVE(e: any) {
  if (e.incident_id) {
    e.id = e.incident_id;
    e.ip = e.entities?.source_ip || '';
    e.destIp = e.entities?.target || '';
    e.type = e.attack_type || '';
    e.severity = (e.severity || '').toLowerCase();
    e.createdAt = e.detected_at;
    e.timeStr = e.detected_at;
    e.payload = JSON.stringify(e);
  }
  
  const fac = getFacultyForIP(e.destIp || e.dst_ip || '');
  e.organization = fac?.name || null;
  return e;
}

const mockIncidents = [];

const initialEvents = typeof window !== 'undefined'
  ? mockIncidents.map(enrichEventWithCVE)
  : [];

export const eventsStore      = writable<any[]>(initialEvents);
export const socketStore      = writable<Socket | null>(null);
export const roleStore        = writable<string>('guest');
export const usernameStore    = writable<string>('');
export const connectionState  = writable<boolean>(false);
export const latestAttackStore = writable<any>(null);
export const isHistoricalMode = writable<boolean>(false);
export const selectedDateStore = writable<string>(new Date().toISOString().split('T')[0]);
export const systemHealthStore = writable<any>(null);

let socket: Socket | null = null;
let networkPolicyTimer: ReturnType<typeof setInterval> | null = null;
async function refreshEventScope() {
  const previous = get(networkPolicyState).version;
  if (await refreshNetworkPolicy() && previous !== get(networkPolicyState).version && socket?.connected) {
    if (get(isHistoricalMode)) await fetchHistoricalEvents(get(selectedDateStore));
    else socket.emit('refresh_scope');
  }
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
  void refreshEventScope();
  if (!networkPolicyTimer) networkPolicyTimer = setInterval(() => { void refreshEventScope(); }, 30000);

  socket = io({
    path: '/socket.io/',
    auth: { token, scope: window.location.pathname.startsWith('/wallboard') ? 'legacy' : 'lan' },
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
        // Merge mock data for demonstration
        const combined = [...data];
        const enriched = combined.map(enrichEventWithCVE);
        eventsStore.set(enriched.slice(0, 1000));
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('cachedEvents', JSON.stringify(enriched));
        }
      }
    })();
  });

  socket.on('system_health', (data: any) => {
    systemHealthStore.set(data);
  });

  socket.on('new_attack', (data: any) => {
    // Ignore real-time updates if in historical mode
    let isHistorical = false;
    isHistoricalMode.subscribe(val => isHistorical = val)();
    
    if (!isHistorical) {
      const enriched = enrichEventWithCVE(data);
      eventsStore.update(events => {
        const previous = enriched.id == null ? null : events.find(event => event.id === enriched.id);
        const merged = { ...previous, ...enriched, hitCount: Math.max(Number(previous?.hitCount || 1), Number(enriched.hitCount || 1)) };
        const newEvents = [merged, ...events.filter(event => enriched.id == null || event.id !== enriched.id)].slice(0, 1000); // Prevent memory leak and localStorage quota errors
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('cachedEvents', JSON.stringify(newEvents));
          } catch (e) {
            console.warn('localStorage quota exceeded for cachedEvents');
          }
        }
        return newEvents;
      });
      if (get(networkPolicyState).loaded && isInternalIP(enriched.destIp || '')
          && isActionableDetection(enriched)) latestAttackStore.set(enriched);
    }
  });

  socket.on('attack_count_updated', (data: { id: number; hitCount: number }) => {
    eventsStore.update(events => events.map(event => event.id === data.id
      ? { ...event, hitCount: Math.max(Number(event.hitCount || 1), data.hitCount) } : event));
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
  if (networkPolicyTimer) { clearInterval(networkPolicyTimer); networkPolicyTimer = null; }
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
    const res = await fetch(`/api/attacks/history?date=${dateStr}&scope=lan`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    if (res.ok) {
      const data = await res.json();
      eventsStore.set(data.map(enrichEventWithCVE));
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


import { derived } from 'svelte/store';
import { isInternalIP } from './faculties';

export const lanEventsStore = derived([eventsStore, networkPolicyState], ([$events, policy]) =>
  $events.filter((e) => {
    if (!policy.loaded) return false;
    return isInternalIP(e.destIp || e.dst_ip || '');
  }).map(event => enrichEventWithCVE({ ...event })).sort((a, b) => {
    return new Date(b.createdAt || b.timestampMs).getTime() - new Date(a.createdAt || a.timestampMs).getTime();
  })
);

export const lanDetectionsStore = derived(lanEventsStore, events => events.filter(isActionableDetection));
