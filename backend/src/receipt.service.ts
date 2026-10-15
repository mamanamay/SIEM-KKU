import { Injectable, BadRequestException, ConflictException, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThanOrEqual, Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { isIP } from 'net';
import { Cron } from '@nestjs/schedule';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RawEvent } from './entities/raw-event.entity';
import { classifyLog } from './log-api-format';
import { MAX_LOG_BYTES, MAX_BATCH_SIZE, MAX_BATCH_BYTES, MAX_PENDING_EVENTS, MAX_DETECTION_ATTEMPTS, MAX_RECEIPT_WRITES, RECEIPT_LEASE_MS, DETECTION_MAX_INFLIGHT_BYTES } from './runtime-limits';

type BatchContext = { manager: EntityManager; rows: Map<string, RawEvent>; updates: any[]; effects: Array<() => Promise<unknown> | void>;
  keyedEffects: Map<string, { count: number; effect: (count: number) => Promise<unknown> | void }> };

export interface ReceiptInput {
  source: string;
  rawLog: string;
  payload?: any;
  identity?: string;
}

@Injectable()
export class ReceiptService {
  private activeWrites = 0;
  private rejectedWrites = 0;
  private acceptedUnique = 0;
  private duplicateDeliveries = 0;
  private completedCount = 0;
  private processingCount = 0;
  private startedAt = Date.now();
  private readonly batch = new AsyncLocalStorage<BatchContext>();
  runtimeDiagnostics() { return { activeReceiptWrites: this.activeWrites, maxReceiptWrites: MAX_RECEIPT_WRITES, rejectedReceiptWrites: this.rejectedWrites,
    acceptedUniqueSinceStart: this.acceptedUnique, duplicatesSinceStart: this.duplicateDeliveries, processedSinceStart: this.completedCount,
    batchInProgress: this.processingCount, uptimeSeconds: (Date.now() - this.startedAt) / 1000,
    batchMaxRecords: MAX_BATCH_SIZE, batchMaxBytes: Math.min(MAX_BATCH_BYTES, DETECTION_MAX_INFLIGHT_BYTES) }; }
  constructor(@InjectRepository(RawEvent) private readonly repo: Repository<RawEvent>,
              private readonly dataSource: DataSource) {}

  async accept(inputs: ReceiptInput[]) {
    if (this.activeWrites >= MAX_RECEIPT_WRITES) {
      this.rejectedWrites++;
      throw new ServiceUnavailableException('Receipt write capacity full; retry later');
    }
    this.activeWrites++;
    try { return await this.commitInputs(inputs); }
    finally { this.activeWrites--; }
  }

  private async commitInputs(inputs: ReceiptInput[]) {
    if (!inputs.length || inputs.length > MAX_BATCH_SIZE) throw new BadRequestException('Invalid batch size');
    let bytes = 0;
    const rows = inputs.map(input => {
      const rawBytes = Buffer.byteLength(input.rawLog, 'utf8');
      if (rawBytes > MAX_LOG_BYTES) throw new BadRequestException('Log exceeds MAX_LOG_BYTES');
      const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
      const payloadBytes = payloadJson ? Buffer.byteLength(payloadJson, 'utf8') : 0;
      if (payloadBytes > 2 * MAX_LOG_BYTES) throw new BadRequestException('Event metadata exceeds byte budget');
      if (input.identity && input.identity.length > 256) throw new BadRequestException('Event ID exceeds 256 characters');
      const storedBytes = rawBytes + payloadBytes;
      bytes += storedBytes;
      if (!/^[a-z0-9_-]{1,32}$/i.test(input.source)) throw new BadRequestException('Invalid source');
      const id = createHash('sha256').update(input.source + '\0' + (input.identity || randomUUID())).digest('hex');
      return { id, source: input.source, rawLog: input.rawLog, rawBytes: storedBytes,
               rawDigest:createHash('sha256').update(input.rawLog).digest('hex'),
               payloadJson,
               status: 'pending', attempts: 0, nextAttemptMs: 0,
               processingMode: input.payload?.processing_mode === 'backfill' ? 'backfill' : 'live' };
    });
    if (bytes > MAX_BATCH_BYTES) throw new BadRequestException('Batch exceeds byte budget');
    // Receipt commit is the ACK boundary. No process-local queue is authoritative.
    let inserted = 0, duplicates = 0;
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(RawEvent);
      if (manager.connection.options.type === 'postgres') await manager.query('SELECT pg_advisory_xact_lock($1)', [734112]);
      const unique = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        const prior = unique.get(row.id);
        if (prior && prior.rawDigest !== row.rawDigest) throw new ConflictException('Receipt ID reused for different data');
        if (prior) duplicates++; else unique.set(row.id, row);
      }
      const existingRows = await repo.find({ where: { id: In([...unique.keys()]) }, select: ['id', 'rawDigest', 'rawLog', 'payloadJson'] });
      const existingById = new Map(existingRows.map(row => [row.id, row]));
      const incoming: typeof rows = [];
      for (const row of unique.values()) {
        const existing = existingById.get(row.id);
        if (existing) {
          let digest = existing.rawDigest || createHash('sha256').update(existing.rawLog).digest('hex');
          if (digest !== row.rawDigest && existing.payloadJson) {
            const legacy = JSON.parse(existing.payloadJson);
            if (legacy.raw_log && typeof legacy.raw_log === 'object') digest = createHash('sha256').update(JSON.stringify(legacy.raw_log)).digest('hex');
          }
          if (digest !== row.rawDigest) throw new ConflictException('Receipt ID reused for different data');
          duplicates++; continue;
        }
        incoming.push(row);
      }
      if (incoming.length) {
        const queued = manager.connection.options.type === 'postgres'
          ? Number((await manager.query("SELECT COALESCE(SUM(records),0) AS n FROM ingest_counts WHERE status IN ('pending','processing') AND records > 0"))[0].n)
          : await repo.count({ where: { status: In(['pending', 'processing']) } });
        if (queued + incoming.length > MAX_PENDING_EVENTS) throw new ServiceUnavailableException('Ingestion backlog is full; retry later');
        await repo.createQueryBuilder().insert().values(incoming).execute();
        inserted = incoming.length;
      }
    });
    this.acceptedUnique += inserted; this.duplicateDeliveries += duplicates;
    return { accepted: inserted, duplicates, inserted, deduplicated: duplicates, received: rows.length, event_ids: rows.map(r => r.id), durable: true };
  }

  async pending(): Promise<RawEvent[]> {
    // Select IDs/lengths first: loading 250 full rows before applying the byte
    // budget could allocate tens of MiB even when only 2 MiB is sent onward.
    return this.dataSource.transaction(async manager => {
    const repo = manager.getRepository(RawEvent), now = Date.now();
    const select = (expired: boolean, limit: number) => {
      const qb = repo.createQueryBuilder('r').select(['r.id','r.rawBytes'])
        .where(expired ? "r.status = 'processing' AND r.leaseUntilMs <= :now" : "r.status = 'pending' AND r.nextAttemptMs <= :now", {now})
        .orderBy('r.receivedAt','ASC').addOrderBy('r.id','ASC').take(limit);
      if (manager.connection.options.type === 'postgres') qb.setLock('pessimistic_write').setOnLocked('skip_locked');
      return qb.getMany();
    };
    // Separate the lease recovery query from pending work so PostgreSQL can
    // use the small partial indexes rather than scan all completed receipts.
    const recovered = await select(true,MAX_BATCH_SIZE);
    const candidates = recovered.length === MAX_BATCH_SIZE ? recovered : [...recovered,...await select(false,MAX_BATCH_SIZE-recovered.length)];
    let bytes=0;const ids:string[]=[];
    for(const row of candidates) {
      if(bytes+Number(row.rawBytes)>Math.min(MAX_BATCH_BYTES, DETECTION_MAX_INFLIGHT_BYTES))break;
      bytes+=Number(row.rawBytes);ids.push(row.id);
    }
    if(!ids.length)return [];
    const leaseToken = randomUUID();
    await repo.update({ id: In(ids) }, { status: 'processing', leaseToken, leaseUntilMs: now + RECEIPT_LEASE_MS });
    const rows=await repo.find({where:{id:In(ids),status:'processing',leaseToken}});
    const byId=new Map(rows.map(row=>[row.id,row]));
    return ids.map(id=>byId.get(id)).filter((row):row is RawEvent=>!!row);
    });
  }

  async processBatch<T>(claimed: RawEvent[], work: () => Promise<T>): Promise<T> {
    let context: BatchContext;
    this.processingCount = claimed.length;
    try {
      const result = await this.dataSource.transaction(async manager => {
        const repo = manager.getRepository(RawEvent);
        const qb = repo.createQueryBuilder('r').where('r.id IN (:...ids) AND r.status = :status AND r.leaseToken = :token',
          { ids: claimed.map(row => row.id), status: 'processing', token: claimed[0].leaseToken });
        if (manager.connection.options.type === 'postgres') qb.setLock('pessimistic_write');
        const current = await qb.getMany();
        context = { manager, rows: new Map(current.map(row => [row.id, row])), updates: [], effects: [], keyedEffects: new Map() };
        return this.batch.run(context, async () => {
          const value = await work();
          await this.flushBatch(context);
          return value;
        });
      });
      this.completedCount += context!.updates.length;
      for (const effect of context!.effects) { try { await effect(); } catch { /* durable detection remains committed */ } }
      for (const effect of context!.keyedEffects.values()) { try { await effect.effect(effect.count); } catch { /* independent notification retry */ } }
      return result;
    } finally { this.processingCount = 0; }
  }

  async storeEvaluations(rows: RawEvent[], results: any[]) {
    // Persist the evaluation before deriving incidents. If incident persistence
    // rolls back, retry uses this result without counting the log in live windows
    // again. The worker's bounded batch is the only hydrated data here.
    const ready = rows.flatMap((row, index) => {
      const result = results[index];
      if (!result?.normalized_event || !['benign','detected'].includes(result.status) || result.status === 'detected' && !result.detection) return [];
      return [{ row, normalizedJson: JSON.stringify(result.normalized_event), detectionJson: result.detection ? JSON.stringify(result.detection) : null }];
    });
    if (!ready.length) return;
    if (this.dataSource.options.type === 'postgres') {
      const parameters: any[] = [];
      const values = ready.map(value => '(' + [value.row.id, value.row.leaseToken, value.normalizedJson, value.detectionJson].map(item => {
        parameters.push(item); return '$' + parameters.length + '::text';
      }).join(',') + ')').join(',');
      await this.dataSource.query(`UPDATE raw_event r SET "normalizedJson"=v.normalized,"detectionJson"=v.detection
        FROM (VALUES ${values}) v(id,token,normalized,detection)
        WHERE r.id=v.id AND r."leaseToken"=v.token AND r.status='processing'`, parameters);
    } else {
      await this.dataSource.transaction(async manager => {
        for (const value of ready) await manager.getRepository(RawEvent).update({ id:value.row.id,leaseToken:value.row.leaseToken!,status:'processing' },
          {normalizedJson:value.normalizedJson,detectionJson:value.detectionJson});
      });
    }
    for (const value of ready) { value.row.normalizedJson=value.normalizedJson;value.row.detectionJson=value.detectionJson; }
  }

  afterCommit(effect: (count: number) => Promise<unknown> | void, key?: string) {
    const context = this.batch.getStore();
    if (context && key) context.keyedEffects.set(key, { count: (context.keyedEffects.get(key)?.count || 0) + 1, effect });
    else if (context) context.effects.push(() => effect(1)); else void effect(1);
  }

  private async flushBatch(context: BatchContext) {
    if (!context.updates.length) return;
    if (context.manager.connection.options.type !== 'postgres') {
      for (const row of context.updates) { const { id, ...fields } = row; await context.manager.getRepository(RawEvent).update(id, fields); }
      return;
    }
    const columns = ['id', 'normalizedJson', 'detectionJson', 'sourceIp', 'targetIp', 'eventTimestampMs', 'processedAtMs', 'disposition', 'attackId'];
    const types = ['varchar','text','text','varchar','varchar','bigint','bigint','varchar','int'];
    const parameters: any[] = [];
    const values = context.updates.map(row => '(' + columns.map((name,index) => {
      parameters.push(row[name] ?? null); return '$' + parameters.length + '::' + types[index];
    }).join(',') + ')').join(',');
    await context.manager.query(`UPDATE "raw_event" r SET "status"='processed', "leaseToken"=NULL, "leaseUntilMs"=0, "error"=NULL,
      ${columns.slice(1).map(name => '"'+name+'"=v."'+name+'"').join(',')}
      FROM (VALUES ${values}) v(${columns.map(name=>'"'+name+'"').join(',')}) WHERE r."id"=v."id"`, parameters);
  }

  async complete<T extends { id: number }>(id: string, normalized: any, detection: any,
                 persist?: (manager: EntityManager) => Promise<T | null>, disposition = 'benign'): Promise<T | null> {
    const result: { saved: T | null } = { saved: null };
    const batch = this.batch.getStore();
    if (batch) {
      const receipt = batch.rows.get(id);
      if (!receipt) return null;
      batch.rows.delete(id);
      result.saved = persist ? await persist(batch.manager) : null;
      batch.updates.push({ id, status: 'processed', leaseToken: null, leaseUntilMs: 0,
        normalizedJson: JSON.stringify(normalized), detectionJson: detection ? JSON.stringify(detection) : null,
        sourceIp: isIP(normalized?.src_ip || '') ? normalized.src_ip : null,
        targetIp: isIP(normalized?.dst_ip || '') ? normalized.dst_ip : null,
        eventTimestampMs: Number.isFinite(Date.parse(normalized?.timestamp || '')) ? Date.parse(normalized.timestamp) : receipt.receivedAt.getTime(),
        processedAtMs: Date.now(), disposition, attackId: result.saved?.id ?? null, error: null });
      return result.saved;
    }
    await this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(RawEvent);
      const receipt = await repo.findOne({ where: { id },
        ...(manager.connection.options.type === 'postgres' ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
      if (!receipt || receipt.status === 'processed' || receipt.status === 'quarantined') return;
      result.saved = persist ? await persist(manager) : null;
      const sourceIp=isIP(normalized?.src_ip||'')?normalized.src_ip:null;
      const targetIp=isIP(normalized?.dst_ip||'')?normalized.dst_ip:null;
      const eventTimestampMs=Date.parse(normalized?.timestamp||'');
      await repo.update(id, { status: 'processed', leaseToken: null, leaseUntilMs: 0, normalizedJson: JSON.stringify(normalized),
                             sourceIp,targetIp,eventTimestampMs:Number.isFinite(eventTimestampMs)?eventTimestampMs:receipt.receivedAt.getTime(),
                             processedAtMs:Date.now(),
                             detectionJson: detection ? JSON.stringify(detection) : null,
                             disposition, attackId: result.saved?.id ?? null, error: null });
    });
    return result.saved;
  }

  async fail(row: RawEvent, reason: string, permanent = false) {
    const attempts = row.attempts + 1;
    const context = this.batch.getStore();
    const repo = context ? context.manager.getRepository(RawEvent) : this.repo;
    if (context && !context.rows.has(row.id)) return;
    if (context) context.rows.delete(row.id);
    await repo.update({ id: row.id, ...(row.leaseToken ? { leaseToken: row.leaseToken, status: 'processing' } : {}) }, { attempts, error: reason.slice(0, 500), leaseToken: null, leaseUntilMs: 0,
      status: permanent ? 'quarantined' : attempts >= MAX_DETECTION_ATTEMPTS ? 'failed' : 'pending',
      disposition: permanent ? 'rejected' : null,
      nextAttemptMs: Date.now() + Math.min(60000, 1000 * 2 ** attempts) });
  }

  async health() {
    if (this.dataSource.options.type === 'postgres') {
      const groups = await this.dataSource.query("SELECT status,SUM(records) AS n FROM ingest_counts WHERE status IN ('pending','processing','failed','quarantined') AND records > 0 GROUP BY status");
      const values = Object.fromEntries(groups.map((row: any) => [row.status, Number(row.n)]));
      return { pending: values.pending || 0, processing: values.processing || 0, failed: values.failed || 0, quarantined: values.quarantined || 0, maxPending: MAX_PENDING_EVENTS };
    }
    const [pending, processing, failed, quarantined] = await Promise.all([
      this.repo.count({ where: { status: 'pending' } }), this.repo.count({ where: { status: 'processing' } }),
      this.repo.count({ where: { status: 'failed' } }), this.repo.count({ where: { status: 'quarantined' } })]);
    return { pending, processing, failed, quarantined, maxPending: MAX_PENDING_EVENTS };
  }

  async ready() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok' };
  }

  private summaryCache: { expires: number; value: any } | null = null;
  private summaryRequest: Promise<any> | null = null;
  async summary() {
    if (this.summaryCache && this.summaryCache.expires > Date.now()) return this.summaryCache.value;
    if (this.summaryRequest) return this.summaryRequest;
    const asOf = Date.now();
    this.summaryRequest = (async () => {
      const cutoff = asOf - 86400000, firstFullMinute = (Math.floor(cutoff / 60000) + 1) * 60000;
      const groups = this.dataSource.options.type === 'postgres' ? await this.dataSource.query(`
        SELECT source,status,NULLIF(disposition,'') AS disposition,SUM(n) AS count,MAX(latest) AS latest FROM (
          SELECT source,status,disposition,records AS n,to_timestamp(bucket*60) AS latest FROM ingest_counts WHERE bucket >= $1 AND bucket <= $2
          UNION ALL SELECT source,status,COALESCE(disposition,''),COUNT(*)::bigint,MAX("receivedAt") FROM raw_event
          WHERE "receivedAt" >= $3 AND "receivedAt" < $4 GROUP BY source,status,disposition
        ) grouped GROUP BY source,status,disposition HAVING SUM(n)>0`, [firstFullMinute/60000, Math.floor(asOf/60000), new Date(cutoff), new Date(firstFullMinute)])
        : await this.repo.createQueryBuilder('r')
        .select('r.source', 'source').addSelect('r.status', 'status').addSelect('r.disposition', 'disposition')
        .addSelect('COUNT(*)', 'count').addSelect('MAX(r.receivedAt)', 'latest')
        .where('r.receivedAt >= :start AND r.receivedAt <= :end', { start: new Date(asOf - 86400000), end: new Date(asOf) })
        .groupBy('r.source').addGroupBy('r.status').addGroupBy('r.disposition').getRawMany();
      const rows: Array<{ count: number; [key: string]: any }> = groups.map((row: any) => ({ ...row, count: Number(row.count) }));
      const queue = await this.health();
      const oldest = await this.repo.findOne({ where: { status: In(['pending', 'processing']) }, select: ['id','receivedAt'], order: { receivedAt: 'ASC' } });
      const value = { received24h: rows.reduce((sum, row) => sum + row.count, 0), groups: rows, queue,
        runtime: this.runtimeDiagnostics(), oldestPendingSeconds: oldest ? Math.max(0, (asOf - oldest.receivedAt.getTime()) / 1000) : 0,
        collectionMode: process.env.LOG_COLLECTION_MODE || 'api', asOf };
      this.summaryCache = { value, expires: Date.now() + 15000 };
      return value;
    })();
    try { return await this.summaryRequest; } finally { this.summaryRequest = null; }
  }

  async replayFailed(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new BadRequestException('Invalid receipt ID');
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new NotFoundException('Receipt not found');
    if (!['processed','failed'].includes(row.status)) throw new ConflictException('Only processed or failed receipts can be retried');
    if (row?.status === 'processed') {
      if (row.contentExpiredAtMs || !row.rawLog) throw new BadRequestException('Original content has expired; cannot reevaluate this receipt');
      const result = await this.repo.update({ id, status: 'processed' }, { status: 'pending', processingMode: 'backfill', leaseToken: null, leaseUntilMs: 0, attempts: 0, nextAttemptMs: 0, error: null, normalizedJson:null,detectionJson:null });
      return { replayed: result.affected === 1, mode: 'backfill', notification: 'suppressed', correlation: 'static-evidence-only' };
    }
    const historical = row.processingMode === 'backfill' || Date.now() - row.receivedAt.getTime() > 300000;
    const result = await this.repo.update({ id, status: 'failed' }, { status: 'pending', processingMode:historical?'backfill':'live', leaseToken: null, leaseUntilMs: 0, attempts: 0, nextAttemptMs: 0, error: null, normalizedJson:null,detectionJson:null });
    return { replayed: result.affected === 1, mode:historical?'backfill':'live', notification:historical?'suppressed':'policy', correlation:historical?'static-evidence-only':'live' };
  }

  async failures() {
    return this.repo.find({ where: { status: In(['failed', 'quarantined']) }, take: 100, order: { receivedAt: 'DESC' }, select: ['id', 'source', 'status', 'attempts', 'error', 'receivedAt'] });
  }

  async eventDetail(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new BadRequestException('Invalid receipt ID');
    const row = await this.repo.findOneBy({ id });
    if (!row) throw new NotFoundException('Receipt not found');
    const envelope = row.payloadJson ? JSON.parse(row.payloadJson) : null;
    return { id: row.id, source: row.source, status: row.status, disposition: row.disposition,
      origin: envelope?.ingest_origin || classifyLog(envelope?.raw_log ?? envelope ?? row.rawLog).origin,
      contentExpiredAtMs: row.contentExpiredAtMs, raw: row.rawLog,
      normalized: row.normalizedJson ? JSON.parse(row.normalizedJson) : null,
      detection: row.detectionJson ? JSON.parse(row.detectionJson) : null, error: row.error };
  }

  async searchEvents(query: { source?: string; srcIp?: string; dstIp?: string; page?: string; limit?: string }) {
    const page = Number(query.page || 1), limit = Number(query.limit || 50);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Invalid pagination');
    if (query.source && !/^[a-z0-9_-]{1,32}$/i.test(query.source)) throw new BadRequestException('Invalid source');
    const qb = this.repo.createQueryBuilder('r').select(['r.id', 'r.source', 'r.status', 'r.disposition', 'r.attackId', 'r.receivedAt', 'r.normalizedJson', 'r.error','r.sourceIp','r.targetIp','r.eventTimestampMs','r.contentExpiredAtMs','r.processingMode']);
    if (query.source) qb.andWhere('r.source = :source', { source: query.source });
    for (const [field, parameter] of [['src_ip', 'srcIp'], ['dst_ip', 'dstIp']] as const) {
      if (!query[parameter]) continue;
      if (!isIP(query[parameter]!)) throw new BadRequestException('Invalid IP filter');
      const expression = field==='src_ip'?'r.sourceIp':'r.targetIp';
      qb.andWhere(expression + ' = :' + parameter, { [parameter]: query[parameter] });
    }
    const [rows, total] = await qb.orderBy('r.receivedAt', 'DESC').addOrderBy('r.id', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return { page, limit, total, items: rows.map(row => ({ id: row.id, source: row.source,
      status: row.status, disposition: row.disposition, attackId: row.attackId, processingMode: row.processingMode,
      sourceIp:row.sourceIp,targetIp:row.targetIp,eventTimestampMs:row.eventTimestampMs,contentExpiredAtMs:row.contentExpiredAtMs,
      receivedAt: row.receivedAt, error: row.error,
      normalized: row.normalizedJson ? JSON.parse(row.normalizedJson) : null })) };
  }

  private expiring=false;
  @Cron('*/2 * * * * *')
  async expireNormalContent(now=Date.now()) {
    if(this.expiring)return {expired:0};
    this.expiring=true;
    try {
      // Explicit user policy: normal content only, 24 hours AFTER successful processing.
      return await this.dataSource.transaction(async manager=>{
        if(manager.connection.options.type==='postgres')await manager.query('SELECT pg_advisory_xact_lock($1)',[734113]);
        const repo=manager.getRepository(RawEvent);
        const rows=await repo.createQueryBuilder('r').select(['r.id','r.rawDigest'])
          .where('r.status = :status',{status:'processed'})
          .andWhere('r.disposition IN (:...normal)',{normal:['benign','blocked_traffic']})
          .andWhere('r.attackId IS NULL AND r.contentExpiredAtMs IS NULL')
          .andWhere('r.processedAtMs < :cutoff',{cutoff:now-24*3600000})
          .andWhere(`NOT EXISTS (SELECT 1 FROM "attack" "a" WHERE "a"."alertEligible" = :eligible
            AND "a"."ip" = "r"."sourceIp"
            AND ("a"."destIp" = "r"."targetIp" OR "a"."ruleId" IN (:...scanRules))
            AND ("a"."lastProcessedMs" BETWEEN "r"."processedAtMs" - :window AND "r"."processedAtMs" + :window
                 OR ("a"."lastProcessedMs" IS NULL AND "a"."timestampMs" BETWEEN "r"."processedAtMs" - :window AND "r"."processedAtMs" + :window)
                 OR "a"."timestampMs" BETWEEN "r"."eventTimestampMs" - :window AND "r"."eventTimestampMs" + :window))`,
            {eligible:true,scanRules:['FG-SCAN-PORTS','FG-SCAN-HOSTS','FG-DENY-BURST'],window:300000})
          .orderBy('r.processedAtMs','ASC').take(500).getMany();
        // Old receipts without a digest need one bounded read each. Current
        // receipts already have digests and clear content in one SQL statement.
        for (const row of rows.filter(row => !row.rawDigest)) {
          const original = await repo.findOneByOrFail({id:row.id});
          await repo.update(row.id,{rawDigest:createHash('sha256').update(original.rawLog).digest('hex')});
        }
        if (rows.length) await repo.update({id:In(rows.map(row=>row.id))},{rawLog:'',payloadJson:null,normalizedJson:null,detectionJson:null,
          rawBytes:0,contentExpiredAtMs:now});
        return {expired:rows.length};
      });
    } finally {this.expiring=false;}
  }
}
