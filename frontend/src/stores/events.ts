import { writable, derived, get } from 'svelte/store';
import { io, type Socket } from 'socket.io-client';
import { networkPolicyState, refreshNetworkPolicy, isInternalIP } from './faculties';
import { isVisibleAlert, mergeAlerts, endpointOrganization } from '../lib/utils/alertStream';

export function enrichEventWithCVE(event: any) {
  const e = { ...event }, context = e.networkContext;
  for (const key of ['timestampMs','firstSeenMs','lastSeenMs','lastProcessedMs']) {
    if (e[key] != null && /^\d+$/.test(String(e[key])) && Number.isSafeInteger(Number(e[key]))) e[key] = Number(e[key]);
  }
  if (context) Object.assign(e, {
    organization: endpointOrganization(context.target?.scope === 'organization' ? context.target : context.source),
    sourceOrganization: endpointOrganization(context.source), targetOrganization: endpointOrganization(context.target),
    sourceScope: context.source?.scope || 'unknown', targetScope: context.target?.scope || 'unknown', direction: context.direction || 'unknown',
  });
  e.action = e.action || e.outcome;
  const cve = e.cveFindings?.[0] || e.aiInvestigation?.cves?.[0];
  if (cve) e.cve = { id: cve.cveId, name: cve.reason, score: cve.cvssScore };
  return e;
}
const bangkokDate = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const eventsStore = writable<any[]>([]);
export const socketStore = writable<Socket | null>(null);
export const roleStore = writable('guest');
export const usernameStore = writable('');
export const connectionState = writable(false);
export const initialDataLoaded = writable(false);
export const latestAttackStore = writable<any>(null);
export const isHistoricalMode = writable(false);
export const selectedDateStore = writable(bangkokDate());
export const systemHealthStore = writable<any>(null);
export const attackStatsStore = writable<any>(null);
export const dashboardDataStore = writable<any>(null);
let socket: Socket | null = null;
let networkPolicyTimer: ReturnType<typeof setInterval> | null = null;
let historyGeneration = 0;
let snapshotPending = true;
let pendingUpdates: any[] = [];
function beginSnapshot() { snapshotPending = true; pendingUpdates = []; initialDataLoaded.set(false); }
async function refreshEventScope() {
  const previous = get(networkPolicyState).version;
  if (await refreshNetworkPolicy() && previous && previous !== get(networkPolicyState).version && socket?.connected) {
    if (get(isHistoricalMode)) await fetchHistoricalEvents(get(selectedDateStore));
    else { beginSnapshot(); socket.emit('refresh_scope'); }
  }
}
export function initSocket() {
  if (socket) return;
  const token = localStorage.getItem('token');
  if (!token || token.startsWith('fake-jwt-token')) { window.location.href = '/?expired=true'; return; }
  roleStore.set(localStorage.getItem('role') || 'guest');
  usernameStore.set(localStorage.getItem('username') || '');
  void refreshEventScope();
  networkPolicyTimer = setInterval(() => { void refreshEventScope(); }, 30000);
  socket = io({ path: '/socket.io/', auth: { token, scope: 'lan' }, reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 2000, timeout: 10000 });
  socket.on('connect', () => { connectionState.set(true); if (!get(isHistoricalMode)) beginSnapshot(); });
  socket.on('disconnect', () => connectionState.set(false));
  // A server snapshot replaces prior scope data, including after reconnect/policy refresh.
  socket.on('initial_data', (data: any[]) => {
    if (get(isHistoricalMode)) return;
    eventsStore.set(mergeAlerts(data.map(enrichEventWithCVE), pendingUpdates));
    pendingUpdates = []; snapshotPending = false; initialDataLoaded.set(true);
  });
  socket.on('system_health', data => systemHealthStore.set(data));
  socket.on('attack_stats', data => { if (!get(isHistoricalMode)) attackStatsStore.set(data); });
  socket.on('dashboard_data', data => { if (!get(isHistoricalMode)) dashboardDataStore.set(data); });
  socket.on('new_attack', (data: any) => {
    if (get(isHistoricalMode)) return;
    const event = enrichEventWithCVE(data);
    if (snapshotPending) pendingUpdates = mergeAlerts(pendingUpdates, [event]);
    eventsStore.update(events => mergeAlerts(events, [event]));
    if (isVisibleAlert(event)) latestAttackStore.set(event);
  });
  socket.on('status_updated', (data: { id: number; status: string }) => eventsStore.update(events => events.map(e => e.id === data.id ? { ...e, status: data.status } : e)));
  socket.on('connect_error', () => connectionState.set(false));
  socketStore.set(socket);
}
export function disconnectSocket() {
  historyGeneration++;
  beginSnapshot();
  eventsStore.set([]); latestAttackStore.set(null); dashboardDataStore.set(null); attackStatsStore.set(null);
  if (networkPolicyTimer) clearInterval(networkPolicyTimer);
  networkPolicyTimer = null;
  socket?.disconnect(); socket = null; socketStore.set(null); connectionState.set(false);
}
export async function fetchHistoricalEvents(dateStr: string) {
  const generation = ++historyGeneration;
  isHistoricalMode.set(true); selectedDateStore.set(dateStr);
  eventsStore.set([]); dashboardDataStore.set(null); attackStatsStore.set(null);
  const headers = { Authorization: 'Bearer ' + localStorage.getItem('token') };
  const responses = await Promise.all(['history', 'stats', 'dashboard'].map(path => fetch('/api/attacks/' + path + '?date=' + encodeURIComponent(dateStr), { headers })));
  if (responses.some(response => !response.ok)) throw new Error('Historical alerts unavailable');
  const [events, stats, dashboard] = await Promise.all(responses.map(response => response.json()));
  if (generation !== historyGeneration) return;
  eventsStore.set(mergeAlerts([], events.map(enrichEventWithCVE))); attackStatsStore.set(stats); dashboardDataStore.set(dashboard);
}
export function resumeLiveEvents() {
  isHistoricalMode.set(false); selectedDateStore.set(bangkokDate()); disconnectSocket(); initSocket();
}
export const lanEventsStore = derived([eventsStore, networkPolicyState], ([$events, policy]) => $events.filter(e => {
  if (!policy.loaded || !isVisibleAlert(e)) return false;
  return e.networkScope?.ruleVersion === policy.version ? e.networkScope.inScope === true : isInternalIP(e.destIp || '') || isInternalIP(e.ip || '');
}).sort((a, b) => Number(b.lastSeenMs || b.timestampMs || Date.parse(b.createdAt)) - Number(a.lastSeenMs || a.timestampMs || Date.parse(a.createdAt))));
