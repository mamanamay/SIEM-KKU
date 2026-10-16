import { BadRequestException } from '@nestjs/common';
import { isIP } from 'net';

/** Same literal filters as Hunting; kept in the persisted report scope. */
export function applyReportFilters(qb: any, input: any = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid report filters');
  const filters: Record<string, string> = {};
  for (const key of ['ip', 'type', 'country', 'severity']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new BadRequestException('Invalid report filter');
    const value = String(input[key] || '').trim();
    if (value.length > 128) throw new BadRequestException('Report filter is too long');
    if (value) filters[key] = value;
  }
  const like = (v: string) => '%' + v.toLowerCase().replace(/[!%_]/g, '!$&') + '%';
  if (filters.ip?.includes('/')) {
    const [address, prefix, extra] = filters.ip.split('/'), bits = Number(prefix);
    if (extra !== undefined || isIP(address) !== 4 || !/^\d{1,2}$/.test(prefix) || bits < 0 || bits > 32) throw new BadRequestException('Invalid IPv4 CIDR filter');
    const octets = address.split('.').map(Number), whole = Math.floor(bits / 8), partial = bits % 8;
    const patterns: string[] = [];
    if (bits === 32) patterns.push(address);
    else if (!partial) patterns.push(octets.slice(0, whole).join('.') + (whole ? '.' : '') + '%');
    else {
      const block = 2 ** (8 - partial), start = Math.floor(octets[whole] / block) * block;
      for (let i = start; i < start + block; i++) patterns.push([...octets.slice(0, whole), i].join('.') + '.%');
    }
    qb.andWhere('(' + patterns.map((pattern, i) => { qb.setParameter('cidr' + i, pattern); return `(a.ip LIKE :cidr${i} OR a.destIp LIKE :cidr${i})`; }).join(' OR ') + ')');
  } else if (filters.ip) qb.andWhere("(LOWER(a.ip) LIKE :filterIp ESCAPE '!' OR LOWER(a.destIp) LIKE :filterIp ESCAPE '!')", { filterIp: like(filters.ip) });
  if (filters.type) qb.andWhere("LOWER(a.type) LIKE :filterType ESCAPE '!'", { filterType: like(filters.type) });
  if (filters.country) qb.andWhere("LOWER(a.country) LIKE :filterCountry ESCAPE '!'", { filterCountry: like(filters.country) });
  if (filters.severity && filters.severity !== 'all') {
    if (!['low', 'medium', 'high', 'critical'].includes(filters.severity)) throw new BadRequestException('Invalid severity filter');
    qb.andWhere('a.severity = :filterSeverity', { filterSeverity: filters.severity });
  }
  return filters;
}
