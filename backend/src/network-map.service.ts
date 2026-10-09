import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { NetworkPolicy } from './entities/network-policy.entity';
import { targetIpFromEvent } from './target-ip';
import { ipInCidr, validCidr } from './developer-api/ip-policy';

@Injectable()
export class NetworkMapService implements OnModuleInit {
  private readonly logger = new Logger(NetworkMapService.name);
  private subnets: any[] = [];
  private version = '';
  private matchCache = new Map<string, any[]>();
  constructor(@InjectRepository(NetworkPolicy) private readonly policies: Repository<NetworkPolicy>) {
    try { this.setRecords(JSON.parse(readFileSync(join(process.cwd(), 'src/ip_records.json'), 'utf8'))); }
    catch {
      try { this.setRecords(JSON.parse(readFileSync(join(process.cwd(), 'src/network-map.seed.json'), 'utf8'))); }
      catch { this.logger.warn('Network seed unavailable; LAN scope remains closed until configured'); }
    }
  }
  private setRecords(records: any[], version?: string) {
    this.subnets = records.map(record => ({ ...record, Route: record.Route || record['Net-Address'] + '/' + record.Mask }));
    this.matchCache.clear();
    this.version = version || createHash('sha256').update(JSON.stringify(this.subnets)).digest('hex');
  }
  async onModuleInit() {
    const existing = await this.policies.findOneBy({ id: 1 });
    if (existing) this.setRecords(existing.records, existing.version);
    else {
      await this.policies.upsert({ id: 1, records: this.subnets, version: this.version, updatedAt: new Date() }, ['id']);
      await this.refresh();
    }
  }
  @Interval(5000) async refresh() {
    const policy = await this.policies.findOneBy({ id: 1 });
    if (policy && policy.version !== this.version) this.setRecords(policy.records, policy.version);
  }
  getRecords() { return this.subnets.map(record => ({ ...record })); }
  getVersion() { return this.version; }
  private matches(ip: string) {
    if (this.matchCache.has(ip)) return this.matchCache.get(ip)!;
    const matches = this.subnets.filter(record => validCidr(record.Route) && Number(record.Route.split('/')[1]) > 0 && ipInCidr(ip, record.Route)).sort((a, b) => Number(b.Route.split('/')[1]) - Number(a.Route.split('/')[1]));
    if (this.matchCache.size >= 10000) this.matchCache.clear();
    this.matchCache.set(ip, matches);
    return matches;
  }
  isInLan(ip: string): boolean { return !!ip && ip !== '0.0.0.0' && this.matches(ip).length > 0; }
  isIpInRecords(ip: string) { return this.isInLan(ip); }
  getOrganization(ip: string, fallbackCountry?: string): string {
    const subnet = this.matches(ip)[0];
    if (!subnet) return 'Unknown';
    const organization = typeof subnet['Faculty/Dept'] === 'string' ? subnet['Faculty/Dept'].trim() : '';
    return organization && organization !== '—' && organization !== '-' && organization !== 'Unknown' ? organization : 'Local Network (' + subnet.Route + ')';
  }
  evaluate(event: any) {
    const destination = targetIpFromEvent(event);
    const match = destination ? this.matches(destination)[0] : null;
    const inScope = this.isInLan(destination);
    return { inScope, scope: inScope ? 'lan' : destination ? 'outside' : 'unknown', reason: inScope ? 'TARGET_IN_CONFIGURED_LAN' : destination ? 'TARGET_OUTSIDE_CONFIGURED_LAN' : 'TARGET_MISSING', matchedCidr: match?.Route || null, organization: match ? this.getOrganization(destination) : null, targetIp: destination || null, ruleVersion: this.version };
  }
  async update(records: unknown) {
    if (!Array.isArray(records) || records.length > 5000) throw new BadRequestException('Network map must contain at most 5000 records');
    const sanitized = records.map(record => {
      if (!record || typeof record.Route !== 'string' || !validCidr(record.Route)) throw new BadRequestException('Each route must be a valid IPv4/IPv6 CIDR');
      const [network, prefix] = record.Route.split('/');
      const entry: Record<string, any> = { Route: record.Route, 'Net-Address': network, Mask: Number(prefix) };
      for (const key of ['Faculty/Dept', 'Type', 'Description']) {
        if (record[key] !== undefined && (typeof record[key] !== 'string' || record[key].length > 500)) throw new BadRequestException('Invalid network map text field');
        if (record[key] !== undefined) entry[key] = record[key];
      }
      for (const key of ['Export Row', 'Source Row #', 'Source Page']) {
        if (record[key] !== undefined && (!Number.isSafeInteger(record[key]) || record[key] < 0)) throw new BadRequestException('Invalid network map source metadata');
        if (record[key] !== undefined) entry[key] = record[key];
      }
      return entry;
    });
    const version = createHash('sha256').update(JSON.stringify(sanitized)).digest('hex');
    await this.policies.upsert({ id: 1, records: sanitized, version, updatedAt: new Date() }, ['id']);
    this.setRecords(sanitized, version);
    return { success: true, version };
  }
}
