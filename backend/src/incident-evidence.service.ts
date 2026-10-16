import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RawEvent } from './entities/raw-event.entity';
import { httpContext, httpJsonProjection } from './http-context';

@Injectable()
export class IncidentEvidenceService {
  constructor(@InjectRepository(RawEvent) private readonly receipts: Repository<RawEvent>) {}

  async forIncident(incidentId: number, includeRaw = false) {
    const query = this.receipts.createQueryBuilder('r').where('r.attackId = :id AND r.status = :status', { id: incidentId, status: 'processed' });
    const total = await query.getCount();
    const rows = await query.select(['r.id', 'r.eventTimestampMs', 'r.rawDigest', 'r.contentExpiredAtMs'])
      .addSelect('SUBSTR("r"."normalizedJson",1,16000)', 'normalized')
      .addSelect(httpJsonProjection('"r"."normalizedJson"', this.receipts.manager.connection.options.type), 'httpFields')
      .addSelect('SUBSTR("r"."rawLog",1,16000)', 'raw')
      .orderBy('r.eventTimestampMs', 'DESC').addOrderBy('r.id', 'DESC').limit(25).getRawMany();
    return { total, sampled: rows.length, truncated: total > rows.length, items: rows.map(row => {
      let normalized: any = {}; try { normalized = JSON.parse(row.normalized || '{}'); } catch {}
      let observed = row.httpFields; if (typeof observed === 'string') observed = JSON.parse(observed);
      return { receiptId: row.r_id, timestampMs: Number(row.r_eventTimestampMs), rawDigest: row.r_rawDigest,
        contentExpired: !!row.r_contentExpiredAtMs, http: httpContext(observed || normalized, row.raw),
        ...(includeRaw ? { excerpt: String(row.raw || '').slice(0, 1200), sensorFields: normalized.sensor_fields,
          firewallFields: normalized.firewall_fields } : {}) };
    }) };
  }
}
