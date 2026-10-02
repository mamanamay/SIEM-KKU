import ipRecordsRaw from '../lib/data/ip_records.json';
import { ipToLong, isIpInCidr } from '../lib/utils/ip';

// Pre-compile subnets on load for fast O(N) mapping
interface SubnetDef {
  subnetLong: number;
  maskLong: number;
  maskBits: number;
  faculty: { code: string; name: string } | null;
  rawCidr: string;
}

const compiledSubnets: SubnetDef[] = [];

for (const r of ipRecordsRaw) {
  if (!r.Route || r.Route === '0.0.0.0/0') continue;
  const parts = r.Route.split('/');
  const subnet = parts[0];
  const maskBits = parseInt(parts[1], 10);
  
  if (isNaN(maskBits)) continue;
  
  let facultyObj = null;
  if (r['Faculty/Dept'] && r['Faculty/Dept'].trim() !== '—' && r['Faculty/Dept'].trim() !== '-' && r['Faculty/Dept'].trim() !== '') {
    let code = String(r['Faculty/Dept']).split('—')[0].split('-')[0].trim().toUpperCase();
    if (code === 'MS/KKBS') code = 'MS/KKBS';
    facultyObj = { code, name: String(r['Faculty/Dept']) };
  } else if (r.Route.startsWith('10.52.') || r.Route.startsWith('10.101.')) {
    facultyObj = { code: 'ODT', name: 'ODT-สำนักเทคโนโลยีดิจิทัล' };
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

/**
 * Read custom LAN CIDRs from localStorage (cfg_lan_cidr).
 */
export function getCustomLanCidrs(): string[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('cfg_lan_cidr') || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * STRICT CHECK: Returns true ONLY if the IP is precisely within
 * ip_records.json or custom configured CIDRs.
 * NO generic 10.x.x.x fallbacks are allowed.
 */
export function isInternalIP(ip: string): boolean {
  if (!ip) return false;

  if (ip === '127.0.0.1' || ip === '::1') return true;

  // STRICT KKU compiled subnets from ip_records.json
  const ipLong = ipToLong(ip);
  for (const sub of compiledSubnets) {
    if ((ipLong & sub.maskLong) === (sub.subnetLong & sub.maskLong)) {
      return true;
    }
  }

  // Custom CIDRs from Settings
  const customCidrs = getCustomLanCidrs();
  for (const cidr of customCidrs) {
    if (isIpInCidr(ip, cidr)) return true;
  }

  return false;
}

/**
 * Longest-prefix-match: maps an IP to its faculty/dept from ip_records.json.
 */
export function getFacultyForIP(ip: string) {
  if (!isInternalIP(ip)) return null;

  const ipLong = ipToLong(ip);
  let bestMatch = null;
  let maxMask = -1;

  for (const sub of compiledSubnets) {
    if ((ipLong & sub.maskLong) === (sub.subnetLong & sub.maskLong)) {
      if (sub.faculty && sub.maskBits > maxMask) {
        bestMatch = sub.faculty;
        maxMask = sub.maskBits;
      }
    }
  }

  return bestMatch;
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
