import { writable, get } from 'svelte/store';
import { io, Socket } from 'socket.io-client';
import { getFacultyForIP, networkPolicyState, refreshNetworkPolicy } from './faculties';
import { isVisibleAlert, mergeAlerts, endpointOrganization } from '../lib/utils/alertStream';

function isWallboard() { return typeof window !== 'undefined' && window.location.pathname.startsWith('/wallboard'); }


export function enrichEventWithCVE(e: any) {
  if (!isWallboard() && e.networkContext) {
    return { ...e, organization: endpointOrganization(e.networkContext.target?.scope === 'organization' ? e.networkContext.target : e.networkContext.source),
      sourceOrganization: endpointOrganization(e.networkContext.source),
      targetOrganization: endpointOrganization(e.networkContext.target),
      sourceScope: e.networkContext.source?.scope || 'unknown',
      targetScope: e.networkContext.target?.scope || 'unknown',
      direction: e.networkContext.direction || 'unknown', action: e.action || e.outcome };
  }
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
  
  const fac = getFacultyForIP(e.ip);
  if (fac) {
    e.organization = fac.name;
  }
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
export const attackStatsStore = writable<any>(null);
export const dashboardDataStore = writable<any>(null);

let socket: Socket | null = null;
let networkPolicyTimer: ReturnType<typeof setInterval> | null = null;
let historyGeneration = 0;
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
        eventsStore.set(isWallboard() ? enriched.slice(0, 1000) : mergeAlerts(get(eventsStore), enriched));
        if (isWallboard() && typeof localStorage !== 'undefined') {
          localStorage.setItem('cachedEvents', JSON.stringify(enriched));
        }
      }
    })();
  });

  socket.on('system_health', (data: any) => {
    systemHealthStore.set(data);
  });
  socket.on('attack_stats', (data: any) => { if (!get(isHistoricalMode)) attackStatsStore.set(data); });
  socket.on('dashboard_data', (data: any) => { if (!get(isHistoricalMode)) dashboardDataStore.set(data); });

  socket.on('new_attack', (data: any) => {
    // Ignore real-time updates if in historical mode
    let isHistorical = false;
    isHistoricalMode.subscribe(val => isHistorical = val)();
    
    if (!isHistorical) {
      const enriched = enrichEventWithCVE(data);
      eventsStore.update(events => {
        const newEvents = isWallboard() ? [enriched, ...events].slice(0, 1000) : mergeAlerts(events, [enriched]);
        if (isWallboard() && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('cachedEvents', JSON.stringify(newEvents));
          } catch (e) {
            console.warn('localStorage quota exceeded for cachedEvents');
          }
        }
        return newEvents;
      });
      if (isWallboard() || isVisibleAlert(enriched)) latestAttackStore.set(enriched);
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
  historyGeneration++;
  if (!isWallboard()) { eventsStore.set([]); latestAttackStore.set(null); dashboardDataStore.set(null); attackStatsStore.set(null); }
  if (networkPolicyTimer) { clearInterval(networkPolicyTimer); networkPolicyTimer = null; }
  if (socket) {
    socket.disconnect();
    socket = null;
    socketStore.set(null);
    connectionState.set(false);
  }
}

export async function fetchHistoricalEvents(dateStr: string) {
  if (!isWallboard()) {
    const generation = ++historyGeneration;
    isHistoricalMode.set(true); selectedDateStore.set(dateStr);
    eventsStore.set([]); dashboardDataStore.set(null); attackStatsStore.set(null);
    const headers = { Authorization: 'Bearer ' + localStorage.getItem('token') };
    const responses = await Promise.all([
      fetch('/api/attacks/history?date=' + encodeURIComponent(dateStr), { headers }),
      fetch('/api/attacks/stats?date=' + encodeURIComponent(dateStr), { headers }),
      fetch('/api/attacks/dashboard?date=' + encodeURIComponent(dateStr), { headers })
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Historical alerts unavailable');
    const [events, stats, dashboard] = await Promise.all(responses.map(response => response.json()));
    if (generation !== historyGeneration) return;
    eventsStore.set(mergeAlerts([], events).map(enrichEventWithCVE));
    attackStatsStore.set(stats); dashboardDataStore.set(dashboard);
    return;
  }
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


import { derived } from 'svelte/store';
import { isInternalIP } from './faculties';

export const lanEventsStore = derived([eventsStore, networkPolicyState], ([$events, policy]) =>
  $events.filter((e) => {
    if (!policy.loaded) return false;
    if (!isVisibleAlert(e)) return false;
    if (e.networkScope?.ruleVersion === policy.version) return e.networkScope.inScope === true;
    return isInternalIP(e.destIp || '') || isInternalIP(e.ip || '');
  }).sort((a, b) => {
    return Number(b.lastSeenMs || b.timestampMs || Date.parse(b.createdAt)) - Number(a.lastSeenMs || a.timestampMs || Date.parse(a.createdAt));
  })
);
