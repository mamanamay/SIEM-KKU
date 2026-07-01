import ipRecordsRaw from '../lib/data/ip_records.json';
import { ipToLong } from '../lib/utils/ip';

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
  if (r['Faculty/Dept'] && r['Faculty/Dept'] !== '—') {
    let code = String(r['Faculty/Dept']).split('—')[0].trim().toUpperCase();
    if (code === 'MS/KKBS') code = 'MS/KKBS';
    facultyObj = { code, name: String(r['Faculty/Dept']) };
  } else if (r.Route.startsWith('10.52.') || r.Route.startsWith('10.101.')) {
    // Legacy fallback from original code for demo purposes
    facultyObj = { code: 'ODT', name: 'ODT-สำนักงานเทคโนโลยีดิจิทัล' };
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

// Helper to determine if an IP is "internal" (mock logic for demo)
// In a real system, this would check if IP matches KKU's subnet e.g. 10.x.x.x or 192.168.x.x
export function isInternalIP(ip: string): boolean {
  if (!ip) return false;
  return ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip === '127.0.0.1' || ip === '::1';
}

// Advanced CIDR hash to map an IP to a faculty based on Longest Prefix Match
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
