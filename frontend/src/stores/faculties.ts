import ipRecordsRaw from '../lib/data/ip_records.json';
import { ipToLong, isIpInCidr } from '../lib/utils/ip';
import { writable } from 'svelte/store';

export const networkPolicyState = writable({ loaded: false, version: '', error: '' });
export const networkRecordsStore = writable<any[]>([]);

// Pre-compile subnets on load for fast O(N) mapping
interface SubnetDef {
  subnetLong: number;
  maskLong: number;
  maskBits: number;
  faculty: { code: string; name: string } | null;
  rawCidr: string;
}

let compiledSubnets: SubnetDef[] = [];
let ipv6Records: any[] = [];
const networkMatchCache = new Map<string, { route: string; faculty: { code: string; name: string } | null } | null>();

function ipv6Words(ip: string): number[] | null {
  if (!ip || !/^[0-9a-f:.]+$/i.test(ip)) return null;
  try {
    const canonical = new URL('http://[' + ip + ']').hostname.slice(1, -1);
    const halves = canonical.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return words.length === 8 ? words.map(word => parseInt(word, 16)) : null;
  } catch { return null; }
}
function matchesIpv6(ip: string, route: string) {
  const [network, prefix] = route.split('/');
  const address = ipv6Words(ip), subnet = ipv6Words(network), bits = Number(prefix);
  if (!address || !subnet || !Number.isInteger(bits) || bits <= 0 || bits > 128) return false;
  for (let index = 0, remaining = bits; remaining > 0; index++, remaining -= 16) {
    const mask = (0xffff << (16 - Math.min(16, remaining))) & 0xffff;
    if ((address[index] & mask) !== (subnet[index] & mask)) return false;
  }
  return true;
}

export function setNetworkRecords(records: any[], version = '') {
compiledSubnets = [];
networkMatchCache.clear();
ipv6Records = records.filter(record => record.Route?.includes(':'));

for (const r of records) {
  if (!r.Route || r.Route === '0.0.0.0/0') continue;
  const parts = r.Route.split('/');
  const subnet = parts[0];
  const maskBits = parseInt(parts[1], 10);

  if (subnet.includes(':') || !Number.isInteger(maskBits) || maskBits <= 0 || maskBits > 32) continue;
  
  let facultyObj = null;
  if (typeof r['Faculty/Dept'] === 'string' && !['—', '-', '', 'Unknown'].includes(r['Faculty/Dept'].trim())) {
    let code = String(r['Faculty/Dept']).split('—')[0].split('-')[0].trim().toUpperCase();
    if (code === 'MS/KKBS') code = 'MS/KKBS';
    facultyObj = { code, name: String(r['Faculty/Dept']).trim() };

  }
  
  const maskLong = (0xffffffff << (32 - maskBits)) >>> 0;
  
  compiledSubnets.push({
    subnetLong: ipToLong(subnet),
    maskLong,
    maskBits,
    faculty: facultyObj,
    rawCidr: r.Route
  });
}
compiledSubnets.sort((a, b) => b.maskBits - a.maskBits);
ipv6Records.sort((a, b) => Number(b.Route.split('/')[1]) - Number(a.Route.split('/')[1]));
networkRecordsStore.set(records);
networkPolicyState.set({ loaded: true, version, error: '' });
}

// Static data is available for legacy faculty labels; normal event pages wait for the server policy.
setNetworkRecords(ipRecordsRaw);
networkPolicyState.set({ loaded: false, version: '', error: '' });

export async function refreshNetworkPolicy() {
  try {
    const response = await fetch('/api/network-map', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, cache: 'no-store' });
    if (!response.ok) throw new Error('โหลดกฎ LAN ไม่สำเร็จ (HTTP ' + response.status + ')');
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Network policy response is invalid');
    setNetworkRecords(records, response.headers.get('X-SIEM-Network-Rule-Version') || '');
    return true;
  } catch (error) {
    networkPolicyState.update(policy => ({ ...policy, error: error instanceof Error ? error.message : 'โหลดกฎ LAN ไม่สำเร็จ' }));
    return false;
  }
}

/**
 * Read custom LAN CIDRs from localStorage (cfg_lan_cidr).
 */
export function getCustomLanCidrs(): string[] {
  return []; // CIDRs are persisted in the backend Network Map; browser overrides are no longer a policy.
}

/**
 * STRICT CHECK: Returns true ONLY if the IP is precisely within
 * ip_records.json or custom configured CIDRs.
 * NO generic 10.x.x.x fallbacks are allowed.
 */
export function getFacultyCode(name: string): string {
  return name.split('—')[0].split('-')[0].trim().toUpperCase();
}

function findNetworkMatch(ip: string) {
  if (typeof ip !== 'string' || !ip) return null;
  if (/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.test(ip)) ip = ip.slice(7);
  if (ip === '0.0.0.0') return null;
  if (networkMatchCache.has(ip)) return networkMatchCache.get(ip)!;
  let match: { route: string; faculty: { code: string; name: string } | null } | null = null;
  if (ip.includes(':')) {
    const record = ipv6Records.find(record => matchesIpv6(ip, record.Route));
    if (record) {
      const name = typeof record['Faculty/Dept'] === 'string' ? record['Faculty/Dept'].trim() : '';
      match = { route: record.Route, faculty: name && !['—', '-', 'Unknown'].includes(name) ? { code: getFacultyCode(name), name } : null };
    }
  } else if (isIpInCidr(ip, ip + '/32')) {
    const value = ipToLong(ip);
    const subnet = compiledSubnets.find(sub => (value & sub.maskLong) === (sub.subnetLong & sub.maskLong));
    if (subnet) match = { route: subnet.rawCidr, faculty: subnet.faculty };
  }
  if (networkMatchCache.size >= 10000) networkMatchCache.clear();
  networkMatchCache.set(ip, match);
  return match;
}

export function isInternalIP(ip: string): boolean {
  return findNetworkMatch(ip) !== null;
}

export function getFacultyForIP(ip: string) {
  return findNetworkMatch(ip)?.faculty || null;
}

export function getNetworkRouteForIP(ip: string): string | null {
  return findNetworkMatch(ip)?.route || null;
}

export function getServerName(ip: string): string | null {
  const map: Record<string, string> = {
    '10.101.104.234': 'SIEM Honeypot Server',
    '127.0.0.1': 'Localhost',
  };
  return map[ip] || null;
}

export function getLanDisplayName(ip: string): string | null {
  if (!ip) return null;
  const srv = getServerName(ip);
  if (srv) return srv;
  const fac = getFacultyForIP(ip);
  if (fac) return fac.name;
  if (isInternalIP(ip)) return ip;
  return null;
}
