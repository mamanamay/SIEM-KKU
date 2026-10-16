import { httpContext } from './http-context';
import { Cron } from '@nestjs/schedule';
import { Injectable, OnApplicationBootstrap, OnModuleDestroy, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { createHash } from 'crypto';
import * as path from 'path';
import * as geoip from 'geoip-lite';
import axios from 'axios';
import { EventsGateway } from './events.gateway';
import { AiService } from './ai.service';
import { NetworkMapService } from './network-map.service';
import { Attack } from './entities/attack.entity';
import { RawEvent } from './entities/raw-event.entity';
import { SystemConfig } from './entities/system-config.entity';
import { ReceiptService } from './receipt.service';
import { SlackAlertService } from './developer-api/slack-alert.service';
import { FileTailer } from './file-tailer';
import { MAX_LOG_BYTES, MAX_BATCH_SIZE, DETECTION_IDLE_MS } from './runtime-limits';
import { eventContext } from './event-context';
import { qualifiesDetection, isEngineDetection, ALERT_POLICY_VERSION } from './alert-policy';
import { detectApiSource, classifyLog } from './log-api-format';

export function autoDetectSource(payload: any): string {
  if (classifyLog(payload).issue || classifyLog(payload?.raw_log).issue) return 'generic';
  const detected = detectApiSource(payload);
  if (detected !== 'generic') return detected;
  const nested = detectApiSource(payload?.raw_log);
  if (nested !== 'generic') return nested;
  return 'generic';
}

export function aggregationKey(payload: any): string {
  return createHash('sha256').update(JSON.stringify([
    payload.source, payload.ip, payload.destIp ?? null, payload.type,
    payload.ruleId ?? null, payload.srcPort ?? null, payload.destPort ?? null,
    payload.protocol ?? null, payload.outcome ?? null,
    Math.floor(payload.timestamp / 60000),
  ])).digest('hex');
}

const severityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const dataDir = process.env.SIEM_DATA_DIR || (process.env.NODE_ENV === 'production'
  ? '/app/siem-logs' : path.resolve(__dirname, '../../siem-logs'));

@Injectable()
export class LogService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LogService.name);
  private readonly tailers: FileTailer[] = [];
  private working = false;
  private workerTask: Promise<void> | null = null;
  private workerIdleTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeIdle: (() => void) | null = null;
  private batchesProcessed = 0;
  private lastBatchMs = 0;
  private workerStartedAt = Date.now();
  private shuttingDown = false;
  private activeEnrichments = 0;
  private skippedEnrichments = 0;
  private recentConnections: { ip: string; time: number }[] = [];
  private readonly ingestHealth = new Map<string, { lastSeen: number; totalCount: number }>();

  constructor(private readonly eventsGateway: EventsGateway,
              private readonly networkMapService: NetworkMapService,
              private readonly aiService: AiService,
              @InjectRepository(Attack) private readonly attackRepository: Repository<Attack>,
              private readonly receipts: ReceiptService, private readonly slackAlerts: SlackAlertService,
              @InjectRepository(SystemConfig) private readonly sourceSettings?: Repository<SystemConfig>) {}

  onApplicationBootstrap() {
    const mode = process.env.LOG_COLLECTION_MODE || 'api';
    if (!['api', 'file', 'hybrid'].includes(mode)) throw new Error('LOG_COLLECTION_MODE must be api, file, or hybrid');
    if (mode !== 'api') {
      this.startFileTail(process.env.FIREWALL_LOG_PATH || '/var/log/firewall/firewall.log', 'firewall');
      this.startFileTail(process.env.NGINX_LOG_PATH || '/var/log/revproxy/revproxy-c.log', 'nginx');
    }
    this.logger.log('Log collection mode: ' + mode);
    this.logger.log('Durable ingestion ready; ACK means receipt committed to DB');
    this.workerTask = this.runWorker();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    this.wakeIdle?.();
    await Promise.all(this.tailers.map(t => t.stop()));
    await this.workerTask;
  }

  private detectionStatusCache: { expires: number; value: any } | null = null;
  async detectionStatus() {
    if (this.detectionStatusCache && this.detectionStatusCache.expires > Date.now()) return this.detectionStatusCache.value;
    let value: any;
    try {
      const response = await axios.get('http://detection-engine:8100/health', { timeout: 2000 });
      value = { available: true, detectionMode: response.data.detection_mode, models: response.data.model_status,
        state: { features: response.data.feature_state, sessions: response.data.session_state, firewall: response.data.firewall_state },
        memory: response.data.memory };
    } catch { value = { available: false, reason: 'DETECTION_UNAVAILABLE', models: null }; }
    this.detectionStatusCache = { expires: Date.now() + 15000, value }; return value;
  }

  registerIpMap(ip: string, _faculty?: any, _service?: string) {
    this.recentConnections.push({ ip, time: Date.now() });
    if (this.recentConnections.length > 100) this.recentConnections.shift();
  }

  getIngestHealth() {
    const result: Record<string, any> = {};
    for (const [source, health] of this.ingestHealth) {
      const age = Date.now() - health.lastSeen;
      result[source] = { ...health, status: age < 300000 ? 'online' : age < 3600000 ? 'warning' : 'offline' };
    }
    return result;
  }

  getQueueHealth() {
    return this.receipts.health();
  }

  runtimeDiagnostics() {
    return {workerActive:this.working,collectors:this.tailers.length,trackedSources:this.ingestHealth.size,
      maxBatchEvents:MAX_BATCH_SIZE,recentConnections:this.recentConnections.length,...this.receipts.runtimeDiagnostics(),
      activeEnrichments:this.activeEnrichments,maxEnrichments:2,skippedEnrichments:this.skippedEnrichments,
      batchesProcessed:this.batchesProcessed,lastBatchMs:this.lastBatchMs,workerUptimeSeconds:(Date.now()-this.workerStartedAt)/1000};
  }

  async ingestLog(payload: any, forceSource?: string, context?: { transport: string; feedHost: string }) {
    const items = Array.isArray(payload) ? payload : [payload];
    if (!items.length || items.length > MAX_BATCH_SIZE) throw new BadRequestException('Invalid batch size');
    const inputs = items.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadRequestException('Each event must be an object');
      const classification = classifyLog(item.raw_log ?? item);
      const outer = classifyLog(item);
      const conflicting = classification.issue || outer.issue ||
        (classification.source !== 'generic' && outer.source !== 'generic' && classification.source !== outer.source);
      const source = item.routing_error || conflicting ? 'generic' : forceSource || autoDetectSource(item);
      const { ingest_origin: _providedOrigin, routing_diagnostics: _providedRouting, ...original } = item;
      const inferredOrigin = { ...outer.origin, ...Object.fromEntries(Object.entries(classification.origin).filter(([,value]) => value != null)) };
      const origin = { ...(context && item.ingest_origin ? item.ingest_origin : inferredOrigin),
        transport: context?.transport || 'api_post', ...(context ? { feedHost: context.feedHost } : {}) };
      const routingError = item.routing_error || (conflicting ? 'Conflicting source metadata' :
        source === 'generic' && item.source !== 'generic' ? 'Unsupported or unidentified log source' : undefined);
      return { source, rawLog: typeof item.raw_log === 'string' ? item.raw_log : JSON.stringify(item.raw_log ?? original),
               payload: { ...item, ingest_origin: origin, ...(routingError ? { routing_error: routingError } : {}) },
               identity: item.event_id || item.event?.id ? String(item.event_id || item.event.id) : undefined };
    });
    const result = await this.receipts.accept(inputs);
    this.wakeIdle?.();
    inputs.forEach(input => this.trackReceived(input.source));
    return result;
  }

  private trackReceived(source: string) {
    if (!this.ingestHealth.has(source) && this.ingestHealth.size >= 64) this.ingestHealth.delete(this.ingestHealth.keys().next().value!);
    const value = this.ingestHealth.get(source) || { lastSeen: 0, totalCount: 0 };
    value.lastSeen = Date.now();
    value.totalCount++;
    this.ingestHealth.set(source, value);
  }

  private startFileTail(filePath: string, source: string) {
    const tailer = new FileTailer(filePath, dataDir, MAX_LOG_BYTES, async record => {
      if (!record.line.trim() && !record.quarantinePath) return;
      await this.receipts.accept([{ source, identity: record.identity,
        rawLog: record.quarantinePath ? JSON.stringify({ original_path: record.quarantinePath, reason: 'max_line_bytes' }) : record.line,
        payload: record.quarantinePath ? { quarantined: true, original_path: record.quarantinePath } : undefined }]);
      this.trackReceived(source);
    }, err => this.logger.warn('[' + source + '] Collector paused/retrying: ' + err.message));
    this.tailers.push(tailer);
    tailer.start();
  }

  private async runWorker() {
    while (!this.shuttingDown) {
      const count = await this.processPending();
      if (!count || this.shuttingDown) {
        if (this.shuttingDown) break;
        await new Promise<void>(resolve => {
          this.wakeIdle = () => { if (this.workerIdleTimer) clearTimeout(this.workerIdleTimer); this.workerIdleTimer = null; this.wakeIdle = null; resolve(); };
          this.workerIdleTimer = setTimeout(() => this.wakeIdle?.(), DETECTION_IDLE_MS);
        });
      } else await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  async processPending() {
    if (this.working || this.shuttingDown) return 0;
    this.working = true;
    const started = Date.now();
    try {
      const rows = await this.receipts.pending();
      const groups = new Map<string, RawEvent[]>();
      for (const row of rows) {
        const data = row.payloadJson ? JSON.parse(row.payloadJson) : null;
        if (data?.routing_error) {
          await this.receipts.fail(row, String(data.routing_diagnostics || data.routing_error), true);
        } else if (data?.quarantined) {
          await this.receipts.fail(row, 'Oversized original preserved in quarantine archive', true);
        } else if (['firewall', 'nginx', 'server', 'wazuh', 'suricata', 'cowrie', 'webtrap', 'generic'].includes(row.source)) {
          if (!groups.has(row.source)) groups.set(row.source, []);
          groups.get(row.source)!.push(row);
        } else {
          try {
            await this.receipts.fail(row, 'Unsupported source type; select a supported parser', true);
          } catch (err) {
            await this.receipts.fail(row, 'Source processing failed: ' + (err as Error).message);
          }
        }
      }
      for (const [source, batch] of groups) await this.processDetectionBatch(source, batch);
      if (rows.length) { this.batchesProcessed++; this.lastBatchMs = Date.now() - started; }
      return rows.length;
    } catch (err) {
      this.logger.error('Pending ingestion failed: ' + (err as Error).message);
      return 0;
    } finally { this.working = false; }
  }

  private sourceContextCache: { expires: number; sources: Record<string, any> } | null = null;
  invalidateSourceContext() { this.sourceContextCache = null; }
  private async sourceContext(source: string) {
    if (!this.sourceSettings) return {};
    if (!this.sourceContextCache || this.sourceContextCache.expires < Date.now()) {
      const row = await this.sourceSettings.findOneBy({ id: 1 });
      const values = JSON.parse(row?.apiConfigJson || '{}').logApiSources || {};
      const sources: Record<string, any> = {};
      for (const key of ['firewall', 'nginx']) {
        const config = values[key] || {};
        sources[key] = { source_id: config.sourceId || key, sensor_ip: config.sensorIp || null, target_ip: config.targetIp || null };
      }
      this.sourceContextCache = { expires: Date.now() + 10000, sources };
    }
    return this.sourceContextCache.sources[source] || {};
  }

  private async processDetectionBatch(source: string, rows: RawEvent[]) {
    let data: any;
    const fresh = rows.filter(row => !row.normalizedJson);
    try {
      const configuredContext = fresh.length ? await this.sourceContext(source) : {};
      const response = fresh.length ? await axios.post(
        process.env.DETECTION_ENGINE_URL || 'http://detection-engine:8100/api/v1/ingest',
        { source_type: source, logs: fresh.map(row => {
          const payload = row.payloadJson ? JSON.parse(row.payloadJson) : null;
          return { event_id: row.id, raw_log: payload?.raw_log ?? (payload && row.rawLog.startsWith('{') ? payload : row.rawLog),
            context: { source_id: payload?.sensor_metadata?.source_id || payload?.source_id || configuredContext.source_id,
              sensor_ip: payload?.sensor_metadata?.sensor_ip || payload?.sensor_ip || configuredContext.sensor_ip,
              target_ip: payload?.sensor_metadata?.target_ip || payload?.target_ip || configuredContext.target_ip, processing_mode: row.processingMode } };
        }) },
        { timeout: 15000, maxContentLength: 8 * 1024 * 1024,
          headers: { 'X-Detection-Key': process.env.DETECTION_API_KEY || '' } }) : { data: { contract_version: 2, results: [] } };
      data = response.data;
      if (data?.contract_version !== 2 || !Array.isArray(data.results)) throw new Error('Invalid detection response contract');
      const evaluated = fresh.map((row,index) => {
        const found = data.results.filter((result:any) => result.log_index === index && result.event_id === row.id);
        return found.length === 1 ? found[0] : null;
      });
      await this.receipts.storeEvaluations(fresh,evaluated);
      const byId = new Map(fresh.map((row,index) => [row.id,evaluated[index]]));
      data = { results: rows.map((row,index) => {
        const result = byId.get(row.id);
        if (result) return { ...result, log_index:index };
        if (row.normalizedJson) return {log_index:index,event_id:row.id,status:row.detectionJson?'detected':'benign',
          normalized_event:JSON.parse(row.normalizedJson),detection:row.detectionJson?JSON.parse(row.detectionJson):null};
        return {log_index:index,event_id:row.id,status:'error',error:'Missing or invalid result for receipt'};
      }) };
    } catch (err) {
      for (const row of fresh.length ? fresh : rows) await this.receipts.fail(row, 'Detection unavailable/invalid response: ' + (err as Error).message);
      const cached = fresh.length ? rows.filter(row => !fresh.includes(row)) : [];
      if (cached.length) await this.processDetectionBatch(source,cached);
      return;
    }
    try { await this.receipts.processBatch(rows, async () => {
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const matches = data.results.filter((r: any) => r.log_index === index && r.event_id === row.id);
      const result = matches.length === 1 ? matches[0] : null;
      if (!result || !['benign', 'detected', 'error'].includes(result.status)) {
        await this.receipts.fail(row, 'Missing or invalid result for receipt');
        continue;
      }
      if (result.status === 'error') {
        await this.receipts.fail(row, result.error || 'Detection failed', result.error_kind === 'invalid_log');
        continue;
      }
      if (!result.normalized_event || (result.status === 'detected' && !result.detection)) {
        await this.receipts.fail(row, 'Missing normalized event or evidence');
        continue;
      }
      try {
        await this.finishReceipt(row, result.normalized_event, result.status === 'detected' ? result.detection : null);
      } catch (err) {
        throw err; // Roll back the whole persistence batch; leases make it retryable.
      }
    }
    }); } catch (err) {
      for (const row of rows) await this.receipts.fail(row,'Incident persistence failed; evaluation retained: ' + (err as Error).message);
      throw err;
    }
  }

  private eventTimestamp(value: any, fallback: Date): number {
    const time = value == null ? fallback.getTime() : typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(time)) throw new Error('Invalid event timestamp');
    return time;
  }

  private normalizeObject(source: string, data: any) {
    if (source === 'wazuh') {
      const level = Number(data.rule?.level || 0);
      return { source, src_ip: data.data?.srcip || data.data?.src_ip || '0.0.0.0',
        dst_ip: data.data?.dstip || data.agent?.ip || null, sensor_ip: data.agent?.ip || null,
        timestamp: data.timestamp, type: 'Wazuh: ' + (data.rule?.description || 'Alert'),
        detail: data.rule?.description || 'Wazuh alert', severity: level >= 12 ? 'critical' : level >= 8 ? 'high' : level >= 5 ? 'medium' : 'low',
        score: Math.min(level * 8, 100), mitre: data.rule?.mitre?.id?.[0] || 'Unknown', ruleId: String(data.rule?.id || ''),
        aiAnalysis: data.aiAnalysis, sessionId: data.id || null };
    }
    if (source === 'suricata') {
      return { source, is_detected: !!data.alert, src_ip: data.src_ip || '0.0.0.0', dst_ip: data.dest_ip || null,
        src_port: data.src_port, dst_port: data.dest_port, protocol: data.proto,
        timestamp: data.timestamp, type: data.alert?.signature || ('Suricata ' + (data.event_type || 'Event')),
        detail: data.alert?.signature || 'Suricata network event', severity: data.alert?.severity === 1 ? 'high' : data.alert?.severity === 2 ? 'medium' : 'low',
        score: data.alert?.severity === 1 ? 80 : 40, ruleId: String(data.alert?.signature_id || ''),
        outcome: data.alert?.action, mitre: 'Unknown' };
    }
    if (source === 'cowrie') {
      const failed = data.eventid === 'cowrie.login.failed';
      const success = data.eventid === 'cowrie.login.success';
      const command = data.eventid === 'cowrie.command.input';
      return { source, is_detected: failed || success || command, src_ip: data.src_ip || '0.0.0.0', dst_ip: data.dst_ip || null,
        timestamp: data.timestamp, type: success ? 'Honeypot Login Success' : command ? 'Honeypot Command Input' : failed ? 'SSH Login Attempt' : 'Honeypot Event',
        detail: command ? String(data.input || '') : String(data.eventid || 'Cowrie event'),
        severity: command || success ? 'high' : failed ? 'medium' : 'low',
        score: command || success ? 80 : failed ? 40 : 10, sessionId: data.session,
        mitre: command ? 'T1059' : failed ? 'T1110' : success ? 'T1078' : 'Unknown',
        outcome: success ? 'honeypot_login_success' : failed ? 'failure' : null };
    }
    return { ...data, source, src_ip: data.src_ip || data.srcip || data.source_ip || '0.0.0.0',
      dst_ip: data.dst_ip || data.dest_ip || data.dstip || null,
      type: data.type || 'Security Event', detail: data.detail || data.message || ('Event from ' + source),
      severity: data.severity || 'low', score: data.score ?? 0, mitre: data.mitre || 'Unknown' };
  }

  private async finishReceipt(row: RawEvent, normalized: any, detection: any) {
    const envelope = row.payloadJson ? JSON.parse(row.payloadJson) : null;
    normalized = { ...normalized, origin: envelope?.ingest_origin || classifyLog(envelope?.raw_log ?? envelope ?? row.rawLog).origin, network_context: eventContext(normalized, this.networkMapService),
      assessment: { detection_status: detection ? 'rule_match' : 'no_rule_match',
        traffic_outcome: String(normalized.action || '').toUpperCase() === 'DENY' ? 'denied' : 'unknown',
        category: !detection && String(normalized.action || '').toUpperCase() === 'DENY' ? 'blocked_traffic' : detection ? 'security_detection' : 'observed_event',
        compromise_confirmed: false } };
    if (!detection) {
      if (row.processingMode === 'backfill' && row.attackId) {
        await this.receipts.complete(row.id, normalized, null,
          manager => manager.getRepository(Attack).findOneBy({ id: row.attackId! }), 'backfill_static_no_match');
        return; // Single-record replay cannot invalidate a previous multi-event incident.
      }
      await this.receipts.complete(row.id, normalized, null, undefined,
        normalized.assessment.category === 'blocked_traffic' ? 'blocked_traffic' : 'benign');
      return;
    }
    if (!isEngineDetection(detection)) {
      await this.receipts.complete(row.id, normalized, detection, undefined, 'filtered_detection');
      return;
    }
    const timestamp = this.eventTimestamp(normalized.timestamp || detection.event_time, row.receivedAt);
    const severity = String(detection.severity || 'low').toLowerCase();
    const sourceIp = normalized.src_ip || detection.source_ips?.[0] || '0.0.0.0';
    const destIp = normalized.dst_ip || null;
    const sensorIp = normalized.sensor_ip || process.env[row.source.toUpperCase() + '_SENSOR_IP'] || null;
    const relevant = (process.env.LOG_SCOPE || process.env.LAN_SCOPE_MODE) === 'all' ||
      this.networkMapService.isInLan(sourceIp) || this.networkMapService.isInLan(destIp) ||
      this.networkMapService.isInLan(sensorIp);
    // Scope is descriptive. A valid detection remains reviewable even when the
    // target is missing or the attack is outbound. Notification has its own policy.
    const geo = geoip.lookup(sourceIp);
    const payload = {
      alertEligible:qualifiesDetection(detection), detectionMode:'engine', alertPolicyVersion:ALERT_POLICY_VERSION,
      lastProcessedMs:Date.now(),
      networkContext:normalized.network_context,targetScope:normalized.network_context.target.scope,
      source: row.source, eventId: row.id, timestamp, ip: sourceIp, destIp,
      httpContext: httpContext(normalized, row.rawLog),
      srcPort: normalized.src_port, destPort: normalized.dst_port, protocol: normalized.protocol,
      ruleId: detection.ruleId || normalized.ruleId || null,
      outcome: normalized.outcome || normalized.action || null,
      type: detection.attack_type || detection.type || 'Security Event',
      severity: severity in severityRank ? severity : 'low',
      threatScore: Math.max(0, Math.min(100, Number(detection.risk_score ?? detection.score ?? 0))),
      detail: String(detection.detail || detection.attack_type || normalized.detail || '').slice(0, 4096),
      mitigation: String(detection.mitigation || 'Review source evidence'),
      mitreCode: detection.mitre || 'Unknown',
      country: geo?.country || (this.networkMapService.isInLan(sourceIp) ? 'Local Network' : 'Unknown'),
      latitude: geo?.ll[0], longitude: geo?.ll[1],
      sessionId: detection.incident?.attack_session?.session_id || detection.sessionId || null,
      aiAnalysis: detection.aiAnalysis || null,
      correlationChain: detection.incident?.attack_session?.attack_path || [],
      detectionEvidence: detection.incident?.detection_evidence || null,
      killChainPhase: 'Unknown',
    };
    const committed = await this.receipts.complete<Attack>(row.id, normalized, detection,
      async manager => {
        if (row.processingMode === 'backfill' && row.attackId) {
          const repo = manager.getRepository(Attack);
          const original = await repo.findOneByOrFail({ id: row.attackId });
          const { timestamp, ...fields } = payload;
          const keepOriginal = original.threatScore > payload.threatScore;
          await repo.update(row.attackId, { ...fields, timestampMs: timestamp,
            threatScore: Math.max(original.threatScore, payload.threatScore),
            severity: severityRank[original.severity] > severityRank[payload.severity] ? original.severity : payload.severity,
            alertEligible: original.alertEligible || payload.alertEligible,
            ...(keepOriginal ? { type:original.type,detectionEvidence:original.detectionEvidence,detail:original.detail } : {}) } as any);
          return repo.findOneByOrFail({ id: row.attackId });
        }
        return this.persistAttack(manager, payload);
      }, payload.alertEligible ? 'detected' : 'suspicious');
    if (!committed) return;
    const enriched: any = { ...committed, organization: this.networkMapService.getOrganization(normalized.network_context.target.scope === 'organization' ? destIp : sourceIp) };
    this.receipts.afterCommit(() => this.eventsGateway.broadcastAttack(enriched), 'ws:' + committed.id);
    if (row.processingMode !== 'backfill') this.receipts.afterCommit(async count => {
      await this.slackAlerts.enqueue({ ...payload, notificationHitCount: count }, committed.id)
        .catch(() => this.logger.warn('Slack queue unavailable; ingestion continues'));
    }, 'slack:' + JSON.stringify([payload.source, payload.ruleId || payload.type, payload.ip, payload.destIp]));
    if (row.processingMode !== 'backfill' && !payload.aiAnalysis && ['high', 'critical'].includes(payload.severity)) this.receipts.afterCommit(() => {
      if (this.activeEnrichments >= 2) { this.skippedEnrichments++; return; }
      this.activeEnrichments++;
      void this.aiService.analyzeAlert(payload).then(async analysis => {
        if (!analysis) return;
        await this.attackRepository.update(committed!.id, { aiAnalysis: analysis });
        const current = await this.attackRepository.findOne({ where: { id: committed!.id } });
        if (current) this.eventsGateway.broadcastAttack({ ...current, organization: enriched.organization });
      }).catch(err => this.logger.warn('AI enrichment failed: ' + err.message))
        .finally(() => { this.activeEnrichments--; });
    }, 'ai:' + committed.id);

  }

  private async persistAttack(manager: EntityManager, payload: any): Promise<Attack> {
    const repo = manager.getRepository(Attack);
    const key = aggregationKey(payload);
    if (manager.connection.options.type === 'postgres') {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [parseInt(key.slice(0, 7), 16)]);
    }
    const current = await repo.findOne({ where: { aggregationKey: key } });
    const timeStr = new Date(payload.timestamp).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false });
    if (current) {
      current.hitCount++;
      current.firstSeenMs = Math.min(Number(current.firstSeenMs), payload.timestamp);
      current.lastSeenMs = Math.max(Number(current.lastSeenMs), payload.timestamp);
      if (severityRank[payload.severity] > severityRank[current.severity]) current.severity = payload.severity;
      current.threatScore = Math.max(current.threatScore, payload.threatScore);
      current.detail = payload.detail;
      current.httpContext = payload.httpContext || current.httpContext;
      current.detectionEvidence = payload.detectionEvidence || current.detectionEvidence;
      current.correlationChain = payload.correlationChain;
      current.aiAnalysis = payload.aiAnalysis || current.aiAnalysis;
      current.networkContext = payload.networkContext;
      current.targetScope = payload.targetScope;
      current.lastProcessedMs = payload.lastProcessedMs;
      current.alertEligible = current.alertEligible || payload.alertEligible;
      current.detectionMode = payload.detectionMode;
      current.alertPolicyVersion = payload.alertPolicyVersion;
      return repo.save(current);
    }
    return repo.save({ ...payload, aggregationKey: key, timeStr, timestampMs: payload.timestamp,
      firstSeenMs: payload.timestamp, lastSeenMs: payload.timestamp, hitCount: 1,
      honeypotPort: payload.destPort ?? null });
  }

  @Cron('*/5 * * * *')
  cleanupStaleCaches() {
    this.recentConnections = this.recentConnections.filter(c => Date.now() - c.time < 300000);
  }
}
