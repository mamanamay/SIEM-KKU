import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import { Attack } from './entities/attack.entity';
import { NetworkMapService } from './network-map.service';
import { eventContext } from './event-context';
import { ALERT_POLICY_VERSION, evidenceQualifies } from './alert-policy';

@Injectable()
export class AlertQueryService implements OnModuleInit {
  constructor(@InjectRepository(Attack) private readonly repo: Repository<Attack>,
              private readonly map: NetworkMapService) {}

  async onModuleInit() {
    // Preserve originals. Reclassify only legacy results that contain actual Engine evidence.
    let cursor = 0;
    for (;;) {
      const rows = await this.repo.find({where:{id:MoreThan(cursor),detectionMode:IsNull()},order:{id:'ASC'},take:250});
      if (!rows.length) break;
      for (const row of rows) {
        const context = eventContext({src_ip:row.ip,dst_ip:row.destIp},this.map);
        const eligible = ['firewall','nginx','server'].includes(row.source) &&
          evidenceQualifies(row.threatScore,row.severity,row.detectionEvidence);
        await this.repo.update(row.id,{alertEligible:eligible,detectionMode:eligible?'engine':'legacy_unverified',
          alertPolicyVersion:ALERT_POLICY_VERSION,networkContext:context,targetScope:context.target.scope});
        cursor = row.id;
      }
    }
  }

  query(scope = 'organization') {
    if (!['organization','all'].includes(scope)) throw new BadRequestException('Invalid alert scope');
    const qb = this.repo.createQueryBuilder('a').where('a.alertEligible = :eligible',{eligible:true})
      .andWhere('a.detectionMode = :mode',{mode:'engine'}).andWhere('a.alertPolicyVersion = :version',{version:ALERT_POLICY_VERSION});
    if (scope === 'organization') {
      const sourceScope = this.repo.manager.connection.options.type === 'postgres'
        ? "CAST(a.networkContext AS jsonb)->'source'->>'scope'" : "json_extract(a.networkContext, '$.source.scope')";
      qb.andWhere('(a.targetScope = :scope OR '+sourceScope+' = :scope)',{scope:'organization'});
    }
    return qb;
  }

  async detections(query: { page?: string; limit?: string; source?: string; scope?: string; severity?: string }) {
    const page = Number(query.page || 1), limit = Number(query.limit || 25);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Invalid pagination');
    const qb = this.repo.createQueryBuilder('a').where('a.detectionMode = :mode AND a.alertPolicyVersion = :version', { mode: 'engine', version: ALERT_POLICY_VERSION });
    if (query.source) qb.andWhere('a.source = :source', { source: query.source });
    if (query.severity) {
      if (!['low','medium','high','critical'].includes(query.severity)) throw new BadRequestException('Invalid severity');
      qb.andWhere('a.severity = :severity', { severity: query.severity });
    }
    if (query.scope === 'unknown') qb.andWhere('(a.targetScope IS NULL OR a.targetScope = :unknown)', { unknown: 'unknown' });
    else if (query.scope && query.scope !== 'all') throw new BadRequestException('Use all or unknown detection scope');
    const [items,total] = await qb.orderBy('a.lastProcessedMs','DESC').addOrderBy('a.id','DESC').skip((page-1)*limit).take(limit).getManyAndCount();
    return { page, limit, total, items: items.map(item => ({ ...item,
      findingCategory: item.alertEligible ? 'evidence_backed' : 'review_required',
      scopeReason: !item.targetScope || item.targetScope === 'unknown' ? 'TARGET_MISSING' : null })) };
  }

  async latest(scope = 'organization', date?: string) {
    const qb = this.query(scope);
    if (date) this.date(qb,date);
    return qb.orderBy('a.lastSeenMs','DESC').addOrderBy('a.id','DESC').take(500).getMany();
  }

  async incident(id:number,scope='organization') {
    if(!Number.isSafeInteger(id)||id<1)throw new BadRequestException('Invalid incident ID');
    return this.query(scope).andWhere('a.id = :id',{id}).getOne();
  }

  async dashboard(date?:string) {
    const as_of=Date.now();
    const period=(qb:any)=>date?this.date(qb,date):qb.andWhere('a.timestampMs >= :start AND a.timestampMs <= :end',{start:as_of-86400000,end:as_of});
    // Attribute inbound/internal to the registered target, and outbound to the
    // registered source. Preserve the event's network snapshot in both cases.
    const recordedOrganization=this.repo.manager.connection.options.type==='postgres'
      ? "CASE WHEN CAST(a.networkContext AS jsonb)->'target'->>'scope' = 'organization' THEN CAST(a.networkContext AS jsonb)->'target'->>'organization' ELSE CAST(a.networkContext AS jsonb)->'source'->>'organization' END"
      : "CASE WHEN json_extract(a.networkContext, '$.target.scope') = 'organization' THEN json_extract(a.networkContext, '$.target.organization') ELSE json_extract(a.networkContext, '$.source.organization') END";
    const organization=`CASE WHEN ${recordedOrganization} IS NULL OR TRIM(${recordedOrganization}) IN ('','Unknown','—','-')
      OR ${recordedOrganization} LIKE 'Local Network (%' THEN 'ในเครือข่าย (ไม่ระบุหน่วยงาน)' ELSE ${recordedOrganization} END`;
    const ranking=this.query('organization');period(ranking);
    const critical=()=>{
      const qb=this.query().andWhere('a.severity = :severity',{severity:'critical'});period(qb);
      return qb.orderBy('COALESCE("a"."lastSeenMs", "a"."timestampMs")','DESC').addOrderBy('a.id','DESC').take(6).getMany();
    };
    const [rows,organizationCritical]=await Promise.all([
      ranking.select(organization,'name').addSelect('COALESCE(SUM(a.hitCount),0)','count')
        .groupBy(organization).orderBy('count','DESC').addOrderBy('name','ASC').limit(7).getRawMany(),
      critical()]);
    const facultyRanking=rows.map(row=>({code:row.name,name:row.name,count:Number(row.count)}));
    const organizationData={facultyRanking,criticalEvents:organizationCritical};
    return {all:organizationData,organization:organizationData,
      policy_version:ALERT_POLICY_VERSION,date:date||null,as_of};
  }

  date(qb: any, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Invalid date');
    const start = Date.parse(date+'T00:00:00+07:00');
    if (!Number.isFinite(start)) throw new BadRequestException('Invalid date');
    qb.andWhere('a.timestampMs >= :start AND a.timestampMs < :end',{start,end:start+86400000});
  }

  async counts(scope: string, date?: string, window?: {start:number;end:number}) {
    const qb = this.query(scope);
    if (date) this.date(qb,date);
    else if(window)qb.andWhere('a.timestampMs >= :start AND a.timestampMs <= :end',window);
    const row = await qb.select('COALESCE(SUM(a.hitCount),0)','total')
      .addSelect("COALESCE(SUM(CASE WHEN a.severity = 'critical' THEN a.hitCount ELSE 0 END),0)",'critical')
      .addSelect("COALESCE(SUM(CASE WHEN UPPER(a.outcome) IN ('DENY','BLOCKED','DROPPED','RESET','RESET_CLIENT','RESET_SERVER','DROP_SESSION') THEN a.hitCount ELSE 0 END),0)",'blocked')
      .addSelect('COALESCE(SUM(CASE WHEN a.destPort = 22 OR a.honeypotPort = 22 THEN a.hitCount ELSE 0 END),0)','ssh')
      .addSelect('COUNT(a.id)','incidents').getRawOne();
    return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Number(value)]));
  }

  async stats(date?: string) {
    const as_of=Date.now(),window={start:as_of-86400000,end:as_of};
    const [organization,rollingOrg] = await Promise.all([
      this.counts('organization',date),
      date?Promise.resolve(null):this.counts('organization',undefined,window)]);
    return {all:organization,organization,rolling24h:date?null:{all:rollingOrg,organization:rollingOrg},
      policy_version:ALERT_POLICY_VERSION,date:date||null,as_of};
  }
}
