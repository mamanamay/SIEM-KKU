import { Injectable, Logger, BadRequestException, ConflictException, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { isIP } from 'net';
import { createHash } from 'crypto';
import { ipInCidr } from './developer-api/ip-policy';

export interface SubnetRecord {
  'Net-Address': string; Mask: number; Route: string;
  'Faculty/Dept': string; Type: string; [key: string]: any;
}

export function normalizeRecords(records: any): SubnetRecord[] {
  if (!Array.isArray(records) || records.length > 10000) throw new BadRequestException('Network map must be an array with at most 10000 records');
  return records.map(record => {
    const route = String(record.Route || '');
    const family = isIP(route.split('/')[0]);
    if (family === 6) {
      const [address, prefix = '128', extra] = route.split('/');
      const bits = Number(prefix);
      if (extra !== undefined || !/^\d{1,3}$/.test(prefix) || !Number.isInteger(bits) || bits > 128) throw new BadRequestException('Invalid IPv6 Route/CIDR');
      return { ...record, 'Net-Address': address, Mask: bits, Route: address + '/' + bits,
        'Faculty/Dept': String(record['Faculty/Dept'] || ''), Type: String(record.Type || 'LAN') };
    }
    // The existing registry also stores individual hosts as bare addresses.
    const parts = (isIP(route) === 4 ? route + '/32' : route).split('/');
    const mask = Number(parts[1]);
    if (parts.length !== 2 || isIP(parts[0]) !== 4 || !/^\d{1,2}$/.test(parts[1]) ||
        !Number.isInteger(mask) || mask < 0 || mask > 32) throw new BadRequestException('Invalid Route/CIDR');
    const subnet = parts[0].split('.').reduce((n, octet) => (n * 256 + Number(octet)) >>> 0, 0);
    const bitmask = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
    const network = (subnet & bitmask) >>> 0;
    const address = [24, 16, 8, 0].map(shift => (network >>> shift) & 255).join('.');
    return { ...record, 'Net-Address': address, Mask: mask, Route: address + '/' + mask,
             'Faculty/Dept': String(record['Faculty/Dept'] || ''), Type: String(record.Type || 'LAN') };
  });
}

@Injectable()
export class NetworkMapService implements OnModuleInit {
  private readonly logger = new Logger(NetworkMapService.name);
  private records: SubnetRecord[] = [];
  private subnets: SubnetRecord[] = [];
  private updating = false;
  private revision = '';
  private readonly runtimePath = process.env.NETWORK_MAP_PATH || path.join(
    process.env.SIEM_DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/siem-logs' : path.resolve(__dirname, '../../siem-logs')), 'network-map.json');

  constructor(@Optional() private readonly database?: DataSource) {
    const seed = path.resolve(__dirname, '../config/network-map.json');
    const legacy = path.join(process.cwd(), 'src/ip_records.json');
    const input = fs.existsSync(this.runtimePath) ? this.runtimePath : fs.existsSync(legacy) ? legacy : seed;
    try {
      this.install(normalizeRecords(JSON.parse(fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, ''))));
      this.logger.log('Loaded network map records: ' + this.records.length);
    } catch (err) {
      throw new Error('Network map unavailable/invalid; refusing silent LAN drops: ' + (err as Error).message);
    }
  }

  async onModuleInit() {
    // Keep an existing durable registry authoritative. Import the earlier API
    // build's database policy only once when no runtime registry exists.
    if (fs.existsSync(this.runtimePath) || !this.database?.isInitialized) return;
    const runner = this.database.createQueryRunner();
    try {
      if (!await runner.hasTable('network_policy')) return;
      const rows = await runner.query('SELECT records FROM network_policy WHERE id = 1');
      if (!rows.length) return;
      const records = typeof rows[0].records === 'string' ? JSON.parse(rows[0].records) : rows[0].records;
      await this.update(records, this.getRevision());
      this.logger.log('Imported existing database LAN policy into the durable registry');
    } finally { await runner.release(); }
  }

  private install(records: SubnetRecord[]) {
    this.records = records;
    this.revision = createHash('sha256').update(JSON.stringify(records)).digest('hex');
    // A default route describes routing, not the entire Internet being our LAN.
    this.subnets = records.filter(record => record.Mask > 0).slice().sort((a, b) => b.Mask - a.Mask);
  }

  getRecords() { return this.records.map(record => ({ ...record })); }
  getRevision() { return this.revision; }
  getVersion() { return this.getRevision(); }
  evaluate(event: any) {
    const destination = event.destIp || event.dst_ip || '';
    const source = event.ip || event.src_ip || '';
    const subnet = this.findSubnet(destination);
    const targetInScope = this.isInLan(destination), sourceInScope = this.isInLan(source);
    const inScope = targetInScope || sourceInScope;
    const direction = targetInScope ? sourceInScope ? 'internal' : 'inbound' : sourceInScope ? 'outbound' : destination ? 'external' : 'unknown';
    return { inScope, scope: inScope ? 'lan' : destination ? 'outside' : 'unknown', direction,
      reason: targetInScope ? 'TARGET_IN_CONFIGURED_LAN' : sourceInScope ? 'SOURCE_IN_CONFIGURED_LAN' : destination ? 'OUTSIDE_CONFIGURED_LAN' : 'TARGET_MISSING',
      matchedCidr: subnet?.Route || this.findSubnet(source)?.Route || null, ruleVersion: this.getVersion() };
  }

  async update(records: any, revision?: string) {
    if (!revision || revision.replace(/"/g, '') !== this.getRevision()) throw new ConflictException('Network map changed; reload before saving');
    if (this.updating) throw new ConflictException('Network map update already in progress');
    const validated = normalizeRecords(records);
    this.updating = true;
    try {
      await fs.promises.mkdir(path.dirname(this.runtimePath), { recursive: true });
      const temp = this.runtimePath + '.tmp';
      const handle = await fs.promises.open(temp, 'w');
      try { await handle.writeFile(JSON.stringify(validated, null, 2), 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      await fs.promises.rename(temp, this.runtimePath);
      this.install(validated);
      return this.getRecords();
    } finally { this.updating = false; }
  }

  isIpInRecords(ip: string | null) { return this.isInLan(ip); }
  findSubnet(ip: string | null): SubnetRecord | null {
    if (!ip || !isIP(ip)) return null;
    const record = this.subnets.find(subnet => this.matches(ip, subnet));
    return record ? { ...record } : null;
  }
  isInLan(ip: string | null): boolean {
    if (!ip || !isIP(ip) || ip === '0.0.0.0' || ip === '::') return false;
    if (ip === '::1') return true;
    if (ip === '127.0.0.1') return true;
    return this.subnets.some(record => this.matches(ip, record));
  }
  getOrganization(ip: string | null, fallbackCountry?: string): string {
    if (!ip || !isIP(ip)) return fallbackCountry || 'Unknown';
    const record = this.subnets.find(subnet => this.matches(ip, subnet));
    if (!record) return fallbackCountry || 'Unknown';
    return record['Faculty/Dept'] && !['—', '-'].includes(record['Faculty/Dept'])
      ? record['Faculty/Dept'] : 'Local Network (' + record['Net-Address'] + ')';
  }
  private matches(ip: string, subnet: SubnetRecord) {
    if (isIP(ip) !== 4 || isIP(subnet['Net-Address']) !== 4) return ipInCidr(ip, subnet.Route);
    const number = ip.split('.').reduce((n, octet) => (n * 256 + Number(octet)) >>> 0, 0);
    const network = subnet['Net-Address'].split('.').reduce((n, octet) => (n * 256 + Number(octet)) >>> 0, 0);
    const mask = subnet.Mask === 0 ? 0 : (0xffffffff << (32 - subnet.Mask)) >>> 0;
    return (number & mask) === (network & mask);
  }
}
