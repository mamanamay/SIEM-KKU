function ipv4(ip: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(part => Number(part) <= 255 && (part.length === 1 || part[0] !== '0'));
}

export function ipToLong(ip: string): number {
  return ipv4(ip || '') ? ip.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0 : 0;
}

function ipv6Words(ip: string): number[] | null {
  try {
    if (!/^[0-9a-f:.]+$/i.test(ip)) return null;
    const canonical = new URL('http://[' + ip + ']').hostname.slice(1, -1);
    const [first, second] = canonical.split('::');
    const left = first ? first.split(':') : [];
    const right = second ? second.split(':') : [];
    const words = second !== undefined ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
    return words.length === 8 ? words.map(word => parseInt(word, 16)) : null;
  } catch { return null; }
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  if (typeof ip !== 'string' || typeof cidr !== 'string') return false;
  if (/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.test(ip)) ip = ip.slice(7);
  const parts = cidr.split('/');
  if (parts.length === 1) return ip === cidr && (ipv4(ip) || ipv6Words(ip) !== null);
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) return false;
  const [network, prefix] = parts;
  const bits = Number(prefix);
  if (network.includes(':')) {
    const address = ipv6Words(ip), subnet = ipv6Words(network);
    if (!address || !subnet || bits < 0 || bits > 128) return false;
    for (let index = 0, remaining = bits; remaining > 0; index++, remaining -= 16) {
      const mask = (0xffff << (16 - Math.min(16, remaining))) & 0xffff;
      if ((address[index] & mask) !== (subnet[index] & mask)) return false;
    }
    return true;
  }
  if (!ipv4(ip) || !ipv4(network) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(network) & mask);
}
