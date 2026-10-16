import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, MoreThan, LessThan, In } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { isIP } from 'net';
import { Attack } from './entities/attack.entity';
import { RawEvent } from './entities/raw-event.entity';
import { ReportDraft } from './entities/report-draft.entity';
import { ALERT_POLICY_VERSION } from './alert-policy';
import { applyReportFilters } from './report-filters';
import { httpContext, httpJsonProjection } from './http-context';

export function reportRange(body:any) {
  const parse=(v:any)=>{
    // datetime-local means Bangkok, independent of the browser/server time zone.
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(v)) throw new BadRequestException('Invalid reporting date');
    const day=Date.parse(v.slice(0,10)+'T00:00:00Z');
    if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==v.slice(0,10)||Number(v.slice(11,13))>23||Number(v.slice(14,16))>59)throw new BadRequestException('Invalid reporting date');
    const ms=Date.parse(v+(/(Z|[+-]\d{2}:\d{2})$/.test(v)?'':'+07:00'));
    if(!Number.isFinite(ms))throw new BadRequestException('Invalid reporting date');
    return ms;
  };
  const start=parse(body.from),end=parse(body.to);
  if(end<start)throw new BadRequestException('Reporting period ends before it starts');
  return {start,end,from:new Date(start).toISOString(),to:new Date(end).toISOString()};
}

@Injectable()
export class ReportQueryService {
  constructor(private readonly db:DataSource) {}

  private organizationScope(m: EntityManager) {
    const source = m.connection.options.type === 'postgres'
      ? "CAST(a.networkContext AS jsonb)->'source'->>'scope'" : "json_extract(a.networkContext, '$.source.scope')";
    return '(a.targetScope = :scope OR ' + source + ' = :scope)';
  }

  private attacks(m:EntityManager, range:ReturnType<typeof reportRange>) {
    return m.getRepository(Attack).createQueryBuilder('a')
      .where('a.alertEligible = :eligible AND a.detectionMode = :mode AND a.alertPolicyVersion = :policy AND ' + this.organizationScope(m),
        {eligible:true,mode:'engine',policy:ALERT_POLICY_VERSION,scope:'organization'})
      .andWhere('COALESCE("a"."firstSeenMs", "a"."timestampMs") <= :end AND COALESCE("a"."lastSeenMs", "a"."timestampMs") >= :start',range)
      .andWhere(`(EXISTS (SELECT 1 FROM raw_event r WHERE "r"."attackId" = "a"."id" AND r.status = :processed AND "r"."eventTimestampMs" BETWEEN :start AND :end)
        OR NOT EXISTS (SELECT 1 FROM raw_event r WHERE "r"."attackId" = "a"."id"))`,{processed:'processed'});
  }

  private receipts(m:EntityManager, range:ReturnType<typeof reportRange>) {
    return m.getRepository(RawEvent).createQueryBuilder('r').innerJoin(Attack,'a','a.id = r.attackId')
      .where('r.status = :status AND r.eventTimestampMs >= :start AND r.eventTimestampMs <= :end',{status:'processed',...range})
      .andWhere('a.alertEligible = :eligible AND a.detectionMode = :mode AND a.alertPolicyVersion = :policy AND ' + this.organizationScope(m),
        {eligible:true,mode:'engine',policy:ALERT_POLICY_VERSION,scope:'organization'});
  }

  async options(body:any) {
    const range=reportRange(body), offset=Number(body.offset||0);
    if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new BadRequestException('Invalid page');
    const search=String(body.search||'').trim();
    if(search.length>64)throw new BadRequestException('Search exceeds 64 characters');
    const qb=this.attacks(this.db.manager,range);
    applyReportFilters(qb, body.filters);
    // Exact IP substring match; parameters never become SQL or wildcard syntax.
    if(search)qb.andWhere('a.ip LIKE :search',{search:'%'+search.replace(/[\\%_]/g,'')+'%'});
    const rows=await qb.select('a.ip','ip').addSelect('COUNT(*)','eventCount')
      .groupBy('a.ip').orderBy('a.ip','ASC').offset(offset).limit(101).getRawMany();
    const selected=Array.isArray(body.selectedIPs)?body.selectedIPs:[];
    const targets=selected.length&&selected.length<=100&&selected.every((ip:any)=>typeof ip==='string'&&isIP(ip))
      ?await this.filteredAttacks(range, body.filters).andWhere('a.ip IN (:...ips)',{ips:selected})
        .select('a.destIp','ip').addSelect('COUNT(*)','count').groupBy('a.destIp').orderBy('a.destIp','ASC').limit(100).getRawMany():[];
    const incidents=selected.length&&selected.length<=100&&selected.every((ip:any)=>typeof ip==='string'&&isIP(ip))
      ?await this.filteredAttacks(range, body.filters).andWhere('a.ip IN (:...ips)',{ips:selected})
        .select(['a.id','a.ip','a.destIp','a.type','a.severity']).orderBy('a.lastSeenMs','DESC').take(100).getMany():[];
    return {ips:rows.slice(0,100).map(r=>({...r,eventCount:Number(r.eventCount),primaryType:'Incident',severity:'',country:'',events:[]})),
      hasMore:rows.length>100,offset,range,incidents,targets,scope:'organization',policy:ALERT_POLICY_VERSION};
  }

  private filteredAttacks(range: ReturnType<typeof reportRange>, filters: any) {
    const query = this.attacks(this.db.manager, range); applyReportFilters(query, filters); return query;
  }

  async snapshot(body:any, user:any) {
    const range=reportRange(body);
    if(!['executive','incident','technical'].includes(body.reportType))throw new BadRequestException('Invalid report type');
    if(['ai-briefing','general','ai-copilot'].includes(body.sourcePage)&&body.reportType!=='executive')throw new BadRequestException('This page supports Executive Summary only');
    if(!['hunting','soar','explorer','analytics','ai-briefing','general','ai-copilot'].includes(body.sourcePage))throw new BadRequestException('Unsupported incident report source');
    if(!Array.isArray(body.selectedIPs)||body.selectedIPs.length>100)throw new BadRequestException('Select 1–100 source IPs');
    const ips=[...new Set<string>(body.selectedIPs)];
    if(!ips.length||ips.length>100||ips.some(ip=>typeof ip!=='string'||!isIP(ip)))throw new BadRequestException('Select 1–100 valid source IPs');
    if(body.selectedTargetIPs!==undefined&&(!Array.isArray(body.selectedTargetIPs)||body.selectedTargetIPs.length>100))throw new BadRequestException('Select at most 100 target IPs');
    const targetIPs=body.reportType==='incident'?[]:[...new Set<string>(body.selectedTargetIPs||[])];
    if(targetIPs.some(ip=>typeof ip!=='string'||!isIP(ip)))throw new BadRequestException('Invalid target IP');
    const incidentId=Number(body.incidentId);
    if(body.reportType==='incident'&&ips.length!==1)throw new BadRequestException('Select one source IP for Incident Deep Dive');
    if(body.reportType==='incident'&&(!Number.isSafeInteger(incidentId)||incidentId<1))throw new BadRequestException('Incident Deep Dive requires one Incident ID / target');
    const snapshot=await this.db.transaction(this.db.options.type==='postgres'?'REPEATABLE READ':'SERIALIZABLE',async m=>{
      const a=this.attacks(m,range).andWhere('a.ip IN (:...ips)',{ips});
      const r=this.receipts(m,range).andWhere('a.ip IN (:...ips)',{ips});
      const filters = applyReportFilters(a, body.filters); applyReportFilters(r, body.filters);
      const validSources=await a.clone().select('COUNT(DISTINCT a.ip)','count').getRawOne();
      if(Number(validSources.count)!==ips.length)throw new BadRequestException('A selected source IP has no matching incident in this period');
      if(targetIPs.length){a.andWhere('a.destIp IN (:...targetIPs)',{targetIPs});r.andWhere('a.destIp IN (:...targetIPs)',{targetIPs});}
      if(body.reportType==='incident'){a.andWhere('a.id = :id',{id:incidentId});r.andWhere('a.id = :id',{id:incidentId});}
      const incidentCount=await a.getCount();
      if(!incidentCount)throw new BadRequestException('No eligible organization-related incidents match this period and selection');
      if(body.reportType==='incident'&&incidentCount!==1)throw new BadRequestException('Select exactly one incident');
      const receiptCount=await r.getCount();
      // Never sum lifetime hitCount into a reporting period. Receipts count event-time logs exactly.
      const counts=await r.clone().select('a.severity','severity').addSelect('COUNT(*)','count').groupBy('a.severity').getRawMany();
      const actors=await a.clone().select('a.ip','ip').addSelect('COUNT(*)','count').groupBy('a.ip').orderBy('a.ip','ASC').getRawMany();
      const targetRows=await a.clone().select('a.destIp','ip').addSelect('COUNT(*)','count').groupBy('a.destIp').orderBy('count','DESC').limit(11).getRawMany();
      const targetCount=await a.clone().select('COUNT(DISTINCT a.destIp)','count').getRawOne();
      if(targetIPs.length&&Number(targetCount.count)!==targetIPs.length)throw new BadRequestException('A selected target IP has no matching incident in this period');
      const receiptIncidents=await r.clone().select('COUNT(DISTINCT a.id)','count').getRawOne();
      const columns=['id','ip','destIp','type','severity','threatScore','srcPort','destPort','protocol','source','status','ruleId','outcome','mitreCode','firstSeenMs','lastSeenMs','timestampMs','createdAt'];
      const events=await a.clone().select(columns.map(c=>'a.'+c))
        .addSelect('SUBSTR("a"."networkContext",1,4000)','contextExcerpt')
        .addSelect('SUBSTR("a"."detail",1,1500)','detailExcerpt').addSelect('SUBSTR("a"."notes",1,1500)','notesExcerpt')
        .addSelect('SUBSTR("a"."detectionEvidence",1,2000)','detectionExcerpt')
        .addSelect('SUBSTR("a"."httpContext",1,8000)','httpExcerpt')
        .addSelect(this.db.options.type==='postgres'?`SUBSTR(CAST("a"."aiInvestigation" AS jsonb)->>'analysis',1,3000)`:`SUBSTR(json_extract("a"."aiInvestigation",'$.analysis'),1,3000)`,'analysisExcerpt')
        .orderBy('a.severity','ASC').addOrderBy('a.lastSeenMs','DESC').addOrderBy('a.id','ASC').limit(30).getRawMany();
      const parsed=events.map(row=>{
        const result:any={};for(const c of columns)result[c]=row['a_'+c];
        result.networkContext=row.contextExcerpt;
        if(typeof result.networkContext==='string'){try{result.networkContext=JSON.parse(result.networkContext);}catch{result.networkContext=null;}}
        let http = null; try { http = JSON.parse(row.httpExcerpt || 'null'); } catch {}
        const savedAnalysis=row.analysisExcerpt?{analysis:String(row.analysisExcerpt).slice(0,3000),source:'saved-incident-analysis',verified:false}:null;
        return {...result,savedAnalysis,httpContext:http,detail:row.detailExcerpt,notes:row.notesExcerpt,detectionEvidenceExcerpt:row.detectionExcerpt};
      });
      const windowCounts=await r.clone().andWhere('a.id IN (:...sampleIds)',{sampleIds:parsed.map(e=>e.id)})
        .select('a.id','id').addSelect('MIN("r"."eventTimestampMs")','first').addSelect('MAX("r"."eventTimestampMs")','last')
        .addSelect('COUNT(*)','count').groupBy('a.id').getRawMany();
      for(const event of parsed){const c=windowCounts.find(c=>Number(c.id)===Number(event.id));
        Object.assign(event,{windowFirstSeenMs:c?Number(c.first):null,windowLastSeenMs:c?Number(c.last):null,verifiedReceiptCount:Number(c?.count||0)});}
      // SQL truncation bounds hydration even when original raw logs are very large.
      const sample=()=>r.clone().select(['r.id','r.attackId','r.sourceIp','r.targetIp','r.eventTimestampMs','r.rawDigest'])
        .addSelect('SUBSTR("r"."rawLog",1,1200)','excerpt')
        .addSelect(httpJsonProjection('"r"."normalizedJson"',this.db.options.type),'httpFields');
      const first=await sample().orderBy('r.eventTimestampMs','ASC').addOrderBy('r.id','ASC').limit(4).getRawMany();
      const last=await sample().orderBy('r.eventTimestampMs','DESC').addOrderBy('r.id','DESC').limit(4).getRawMany();
      const evidence=[...new Map([...first,...last].map(e=>[e.r_id,e])).values()].sort((a,b)=>Number(a.r_eventTimestampMs)-Number(b.r_eventTimestampMs)||a.r_id.localeCompare(b.r_id));
      for (const event of parsed) if (!event.httpContext?.timestampMs || event.httpContext.timestampMs < range.start || event.httpContext.timestampMs > range.end) {
        event.httpContext = null;
        const row = evidence.find(e => Number(e.r_attackId) === Number(event.id));
        if (row) { const n = typeof row.httpFields==='string'?JSON.parse(row.httpFields):row.httpFields; event.httpContext = httpContext(n, row.excerpt); }
      }
      return {schemaVersion:2,issuedAt:new Date().toISOString(),range,filters,scope:'organization',policy:ALERT_POLICY_VERSION,
        reportType:body.reportType,sourcePage:String(body.sourcePage||'').slice(0,40),selectedIPs:ips,incidentId:body.reportType==='incident'?incidentId:null,
        selectedTargetIPs:targetIPs,matchedSourceIPs:actors.map(a=>a.ip),targetCount:Number(targetCount.count),
        incidentCount,receiptCount,incidentsWithoutReceipts:incidentCount-Number(receiptIncidents?.count||0),
        counts:counts.map(c=>({...c,count:Number(c.count)})),targets:targetRows.slice(0,10),targetsTruncated:targetRows.length>10,
        events:parsed,evidence:evidence.map(e=>({id:e.r_id,attackId:e.r_attackId,sourceIp:e.r_sourceIp,targetIp:e.r_targetIp,
          timestampMs:Number(e.r_eventTimestampMs),rawDigest:e.r_rawDigest,excerpt:e.excerpt,
          httpContext: httpContext(typeof e.httpFields==='string'?JSON.parse(e.httpFields):e.httpFields,e.excerpt)})),
        samplePolicy:'30 incident summaries; earliest 4 and latest 4 matching receipts, deduplicated; bounded excerpts, not all raw logs'};
    });
    const ownerId=String(user.sub),repo=this.db.getRepository(ReportDraft);
    if(await repo.count({where:{ownerId,expiresAtMs:MoreThan(Date.now())}})>=20)throw new ConflictException('Too many active report drafts; retry after draft expiry');
    const snapshotJson=JSON.stringify(snapshot);
    if(Buffer.byteLength(snapshotJson)>256*1024)throw new BadRequestException('Report snapshot exceeds budget; narrow the selection');
    const draft=await repo.save(repo.create({id:randomUUID(),ownerId,actor:user.username,expiresAtMs:Date.now()+86400000,revision:0,snapshotJson}));
    return {snapshotId:draft.id,revision:0,snapshot};
  }

  async owned(id:any,user:any) {
    if(typeof id!=='string'||id.length>64)throw new BadRequestException('Invalid snapshot ID');
    const row=await this.db.getRepository(ReportDraft).findOne({where:{id,ownerId:String(user.sub),expiresAtMs:MoreThan(Date.now())}});
    if(!row)throw new NotFoundException('Report draft expired or unavailable');
    return row;
  }

  @Cron('0 * * * * *')
  async expireDrafts() {
    const repo=this.db.getRepository(ReportDraft);
    const rows=await repo.find({where:{expiresAtMs:LessThan(Date.now())},select:['id'],take:500});
    if(rows.length)await repo.delete({id:In(rows.map(r=>r.id))});
  }
}
