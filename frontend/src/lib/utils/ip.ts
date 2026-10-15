/** Strict IPv4 utilities. Invalid input must never match a subnet. */
function validIp(ip: string): boolean {
  return typeof ip === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(octet => Number(octet) <= 255 && String(Number(octet)) === octet);
}
export function ipToLong(ip: string): number {
  if (!validIp(ip)) return 0;
  return ip.split('.').reduce((acc, octet) => (acc * 256 + Number(octet)) >>> 0, 0);
}
export function isIpInCidr(ip: string, cidr: string): boolean {
  if (!validIp(ip) || typeof cidr !== 'string') return false;
  const parts = cidr.split('/');
  if (!validIp(parts[0]) || parts.length > 2) return false;
  if (parts.length === 1) return ip === parts[0];
  if (!/^\d{1,2}$/.test(parts[1])) return false;
  const mask = Number(parts[1]);
  if (mask > 32) return false;
  const bits = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return (ipToLong(ip) & bits) === (ipToLong(parts[0]) & bits);
}
