import { isIP } from 'node:net';

function address(value: string): { bits: number; value: bigint } | null {
  if (typeof value !== 'string' || value.includes('%')) return null;
  const family = isIP(value);
  if (family === 4) return { bits: 32, value: value.split('.').reduce((n, part) => (n << 8n) | BigInt(part), 0n) };
  if (family !== 6) return null;
  let input = value.toLowerCase();
  if (input.includes('.')) {
    const tail = input.slice(input.lastIndexOf(':') + 1).split('.').map(Number);
    input = input.slice(0, input.lastIndexOf(':') + 1) + ((tail[0] << 8) | tail[1]).toString(16) + ':' + ((tail[2] << 8) | tail[3]).toString(16);
  }
  const halves = input.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const parts = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return { bits: 128, value: parts.reduce((n, part) => (n << 16n) | BigInt('0x' + part), 0n) };
}

export function normalizeIp(ip: string): string {
  if (typeof ip !== 'string') return '';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : ip;
}

export function validCidr(cidr: string): boolean {
  if (typeof cidr !== 'string') return false;
  const [ip, prefix, extra] = cidr.split('/');
  const parsed = address(ip);
  return !!parsed && extra === undefined && /^\d{1,3}$/.test(prefix || '') && Number(prefix) <= parsed.bits;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  if (!validCidr(cidr)) return false;
  const parsed = address(normalizeIp(ip));
  const [network, prefix] = cidr.split('/');
  const subnet = address(network)!;
  if (!parsed || parsed.bits !== subnet.bits) return false;
  const shift = BigInt(parsed.bits - Number(prefix));
  return (parsed.value >> shift) === (subnet.value >> shift);
}

/** Never trust a forwarded address unless the immediate proxy is explicitly trusted. */
export function clientIp(request: any): string {
  const peer = normalizeIp(request.socket?.remoteAddress || '');
  const trusted = (process.env.SIEM_TRUSTED_PROXY_CIDRS || '127.0.0.0/8,::1/128').split(',').map(s => s.trim()).filter(validCidr);
  if (!trusted.some(cidr => ipInCidr(peer, cidr))) return peer;
  const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',').map(s => normalizeIp(s.trim()));
  let current = peer;
  for (let i = forwarded.length - 1; i >= 0; i--) {
    if (!isIP(forwarded[i]) || !trusted.some(cidr => ipInCidr(current, cidr))) break;
    current = forwarded[i];
  }
  return current;
}
